# Kiến trúc

> **Tài liệu tham chiếu cũ.** Chuẩn hiện hành: [framework/00-TONG-QUAN.md](framework/00-TONG-QUAN.md), [framework/01-CORE-MODULES.md](framework/01-CORE-MODULES.md), [00-CANON.md](00-CANON.md). Một số chỗ dưới đây đã lỗi thời: `gl_*` nay là `ledger_*`; "bộ sổ" nay là một sổ nhật ký chung mỗi đơn vị (sổ thuế là bản cài riêng `BOOK_MODE=tax`); ghi sổ lại nay là `POST /api/v1/documents/post { ids, repost }`.

## 1. Nguyên tắc

| # | Nguyên tắc | Hệ quả trong code |
|---|---|---|
| 1 | Sổ cái là nguồn duy nhất của sổ sách, báo cáo | Báo cáo chỉ đọc `gl_*` và `tax_invoices`; không tính lại từ chứng từ |
| 2 | Sổ cái chỉ thêm | Sửa, huỷ = bút toán **ghi số âm** + bút toán mới; database chặn `UPDATE/DELETE` trên `ledger_lines` |
| 3 | Tài khoản không viết cứng | Bộ định khoản tra cấu hình: lý do → nhóm mặt hàng → loại thuế → hình thức thanh toán → ngầm định |
| 4 | Một database, nhiều đơn vị, một sổ nhật ký chung | Mọi bảng có `tenant_id`; chứng từ chờ định khoản ở trạm ACC14 |
| 5 | Chứng từ gốc lưu nguyên bản, có phiên bản | `accounting_events.payload` + `accounting_event_versions` |
| 6 | Số dư luôn khớp sổ cái | `ledger_balances_daily` cập nhật trong cùng giao dịch ghi sổ |
| 7 | Mở rộng không sửa lõi | Add-in đăng ký route và menu riêng |

## 2. Các tầng của API

```
routes      Khai báo đường dẫn, kiểm dữ liệu vào (zod), kiểm quyền. Không chứa luật nghiệp vụ.
   │
service     Luật nghiệp vụ, giao dịch, ghi nhật ký. Ném AppError có mã ổn định.
   │
repository  Đọc/ghi database (Kysely). Không chứa luật.
   │
db          Kết nối, kiểu bảng (db/types.ts), migration.
```

Mỗi module nằm trong `apps/api/src/modules/<ten>/`:

| Tệp | Vai trò |
|---|---|
| `<ten>.schemas.ts` | Khuôn dữ liệu vào/ra (zod) và kiểu DTO |
| `<ten>.repository.ts` | Truy vấn |
| `<ten>.service.ts` | Luật |
| `<ten>.routes.ts` | Đường dẫn HTTP |

Module rất nhỏ (ví dụ loại thuế) gộp service vào routes cho gọn; khi luật nhiều lên thì tách.

## 3. Luồng một chứng từ

```
POST /api/v1/documents
  │  documents/document.routes.ts      kiểm khuôn (packages/contracts), kiểm quyền documents:write
  ▼
documents/document.service.ts          kiểm tổng tiền; tìm chi nhánh; tạo/cập nhật đối tượng, nhân viên
  │  khoá dòng theo docKey:
  │    cùng phiên bản, đã ghi sổ  → "unchanged"
  │    phiên bản cũ hơn           → 409
  │    có bút toán cũ             → ledgerService.reverse()  (ghi số âm + ledger_links "reversal")
  │  tax-info/tax-patch.ts             ghép thông tin thuế kế toán đã bổ sung (applyTaxPatch)
  ▼
posting/posting.service.ts             chọn bộ sổ; nạp cấu hình; chọn luật theo loại chứng từ
  │  posting/rules/<loai>.rule.ts      dựng các cặp Nợ/Có theo từng mặt hàng (EntryBuilder, mang mã hàng)
  │  posting/account-resolver.ts       tra tài khoản theo thứ tự ưu tiên
  ▼
ledger/ledger.service.ts  post()       kiểm cân, kiểm tài khoản, kiểm khoá kỳ, cấp số, ghi dòng,
  │                                    cộng ledger_balances_daily
  ▼
tax-invoices/…repository.ts            ghi sổ hoá đơn (chứng từ có hoá đơn); applyTaxFlags: kỳ kê khai, khấu trừ
sales/…, inventory/…                   dòng hàng, thanh toán, nhập xuất kho (bảng tra cứu, dựng lại được)
documents/document.service.ts          trả hàng có originalDocKey → ledger_links "return" về bút toán gốc
```

Tất cả trong **một giao dịch**: lỗi ở bước nào thì không bước nào được ghi. Từng tình huống (bán, hoàn hàng, sửa, huỷ…) ghi gì vào bảng nào: `docs/nghiep-vu/06-tinh-huong-ghi-so.md`.

Định khoản lỗi (thiếu cấu hình, kỳ khoá): giao dịch huỷ hết, chứng từ lưu trạng thái `error` kèm lý do; sửa cấu hình rồi gọi `POST /documents/:id/repost`.

## 4. Xác thực và quyền

- Người dùng: `Authorization: Bearer <jwt>`; quyền theo vai trò (`core/auth.ts` → `ROLE_PERMISSIONS`).
- Tích hợp: `X-Api-Key`; quyền theo phạm vi của khoá (`SCOPE_PERMISSIONS`).
- Route khai quyền bằng `preHandler: requirePermission('…')`.
- Mọi truy vấn lọc theo `auth.tenantId`.

## 5. Giao diện

```
main.tsx → App.tsx (provider + bảng định tuyến)
  layout/AppLayout    thanh trên cùng + TopNav (menu cha con) + <Outlet/>
  features/<nhom>/    mỗi màn một tệp; gọi API qua lib/api.ts + React Query
  components/         PageHeader (có nút Hướng dẫn), Drawer, Modal, Money, bộ lọc
  help/guides.ts      nạp docs/huong-dan/*.md để hiện trong giao diện
```

## 6. Quy ước code

- TypeScript `strict`; không dùng `any` ở API (trừ kiểm thử).
- Tên bảng, cột, biến: tiếng Anh; chú thích, thông báo cho người dùng: tiếng Việt.
- Tiền: `numeric(18,2)` ở database, `number` (đồng) trên JSON; cộng trừ qua `toCents/fromCents` (`packages/contracts/src/money.ts`).
- Tham số true/false trên URL dùng `queryBool` (không dùng `z.coerce.boolean()`).
- Lỗi nghiệp vụ: ném `Errors.*` (`core/errors.ts`), không tự viết `reply.status(...)`.
- Thay đổi database: thêm tệp migration mới, cập nhật `db/types.ts`, không sửa migration đã phát hành.
- Thêm luật nghiệp vụ thì thêm phép thử vào `apps/api/test/`.

## 7. Giới hạn hiện tại

- Chưa chia bảng sổ cái theo năm (partition); cấu trúc và chỉ mục đã sẵn cho việc này.
- API nhận chứng từ xử lý đồng bộ (nhận xong là định khoản); chưa có hàng đợi (buffer) trước bước định khoản, chưa chạy thử tải 30.000 đơn/ngày.
- Luật định khoản nằm trong code (`posting/rules/*.ts`), tài khoản thì cấu hình được trên giao diện; chưa có dạng template JSON.
- Chưa xuất tệp XML tờ khai thuế (cấu trúc XML của mẫu mới chưa kiểm chứng); nộp bằng Excel.
- Liên kết `adjustment`, `gift`, `replacement` trong `ledger_links` đã có chỗ nhưng chưa có màn ghi.
