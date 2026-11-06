# PHASE-030 · 60 — Golden tests: ca kiểm chuẩn độc lập module
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — khuôn ca kiểm T030-*, nguyên tắc "kiểm bất biến sổ, không kiểm bảng module", cách gắn với bộ kiểm cài module -->

## 1. Vì sao golden test, và vì sao độc lập module

Blueprint nói *luật là gì*; golden test nói *luật đó được giữ như thế nào, đo bằng gì*. Để module do bất kỳ ai (người, AI, cộng đồng) viết đều phải qua, ca kiểm **không** đọc bảng riêng của module (`mod_<key>.*`) — nó chỉ:

1. gọi **action công khai** của module (qua HTTP / `ctx.actions.call` / MCP), như một người dùng;
2. kiểm **sự việc và sổ** (`accounting_events`, `ledger_entries`, `ledger_lines`, `debt_items`, `inventory_movements`, `audit_logs`) và **bất biến** (`assertLedgerInvariants`, `scripts/doi-chieu-ke-toan.sql`);
3. kiểm **kết quả action** (mã lỗi `bizcity_errors@1`, `blocking[] / warnings[]`, trạng thái chứng từ qua `GET /documents/:id`).

Vì vậy hai module khác tên bảng, khác cách lưu vẫn chạy cùng một ca. Ca nào buộc phải đọc bảng module → ghi nợ, xem lại blueprint (thường là thiếu một action đọc).

## 2. Mã và vị trí

- Mã: `T030-<NHÓM>-<n>`; nhóm = `CORE | MH | KHO | BH | TS | KT | NS | THUE | NSU | LUONG`. Mã ghi ở mục 9 của blueprint và ở `describe()` của tệp test.
- Tệp: `apps/api/test/golden/T030-<NHÓM>.test.ts` (một tệp / nhóm), khuôn helper từ `apps/api/test/helpers.ts` (đơn vị sạch trên CSDL test, `DATABASE_URL`).
- Dữ liệu: `apps/api/test/golden/fixtures/<NHÓM>/*.json` — chứng từ mẫu theo `bizcity_ledger_intake@1` và payload action; **không** số tài khoản, chỉ `reasonCode`, `methodCode`, `item_id` / `partner_id` tạo trong `beforeAll` qua `core.item.*` / `core.partner.*`.
- Tham số: mỗi ca đặt `setting_values` cần thiết với ngày hiệu lực (không dựa mặc định bản cài).
- Khi module chưa tồn tại: ca ở trạng thái `it.todo('<mã>: <một câu>')` để bảng việc đếm được; không `skip` không lý do.

## 3. Khuôn một ca

```ts
// apps/api/test/golden/T030-KHO.test.ts
// [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — golden kho
describe('T030-KHO-6 kiểm kê: sổ 100, đếm 97 → một XDC 3, tồn 97, khoá kho trong lúc đếm', () => {
  beforeAll(async () => { /* đơn vị sạch; item A lotTracked; nhập 100 qua purchase NMH1; setting kho.kiem_ke.* */ });
  it('cho: phiếu kiểm kê ở counting · khi: nộp phiếu xuất cùng kho · thì: WAREHOUSE_COUNTING', async () => { … });
  it('khi: duyệt chênh −3 có lý do · thì: đúng một stock_adjustment XDC, lượng 3, docKey kho.stock_count:<id>:<line>', async () => { … });
  it('thì: tồn A = 97; assertLedgerInvariants; doi-chieu kho ↔ 15x = 0', async () => { … });
  it('khi: huỷ phiếu kiểm kê khác sau submitted · thì: không bút toán, kho mở khoá', async () => { … });
});
```

Mỗi `it` là một dòng *cho – khi – thì* của blueprint. Ca thất bại in **mã lỗi và docKey**, không in bảng module.

## 4. Bất biến dùng chung (mọi nhóm)

| Mã | Bất biến | Kiểm bằng |
|---|---|---|
| INV-1 | Σ Nợ = Σ Có mỗi bút toán; số dư ngày = Σ dòng | `assertLedgerInvariants` |
| INV-2 | Không `UPDATE / DELETE` `ledger_*`; sửa = đảo (`reverses_entry_id`) | đếm `ledger_entries` trước / sau; `event_version` |
| INV-3 | Mọi bút toán có `event_id`, `event_version`; mọi `docKey` module truy ngược được (`GET /documents/history`) | DG-DOC-1..3 |
| INV-4 | Công nợ ↔ 131 / 331; kho ↔ 15x; sổ hoá đơn ↔ 133 / 33311 | `scripts/doi-chieu-ke-toan.sql` |
| INV-5 | Action có bằng chứng (`audit_logs`) với actor, lý do khi blueprint bắt lý do | `notes.audit[]` |
| INV-6 | SoD: người lập ≠ người duyệt khi blueprint ghi | gọi action với cùng user → `FORBIDDEN` |
| INV-7 | Tham số theo ngày: chứng từ ngày D−1 / D dùng giá trị khác nhau | `T030-CORE-3` |
| INV-8 | Không số tài khoản trong payload module (`SC-KERNEL-5`, `SC-ITEM-2`) | grep fixture |

## 5. Danh sách ca (W0 — tất cả `it.todo` trừ nhóm MH chạy được ở W2)

| Nhóm | Mã | Một câu | Blueprint |
|---|---|---|---|
| CORE | T030-CORE-1..7 | duyệt theo ngưỡng; SoD; tham số theo ngày; `legalRef`; phiên bản chứng từ đảo + ghi; `allocate`; hook | [20](20-MAU-THIET-KE.md) |
| MH | T030-MH-1..8 | báo giá tối thiểu; SoD; chọn báo giá không rẻ nhất; giá ≠ hợp đồng; 3 bên dung sai; nông sản KCT; nhập khẩu giá vốn; NCC hạng C | [50](50-BP-MUA-HANG.md) |
| KHO | T030-KHO-1..11 | lô; FEFO; cách ly; chuyển kho chênh; liên pháp nhân; kiểm kê; huỷ kiểm kê; tiêu huỷ hồ sơ; nhả cách ly quyền; quét mã; giá vốn tháng | [51](51-BP-KHO.md) |
| BH | T030-BH-1..13 | lead; đơn → 2 HĐ; sửa đơn confirmed; hạn mức; bảng giá bậc; KM 50 %; NPP bậc; thay thế HĐ; điều chỉnh giảm; replace sai lý do; trade MKT; sàn phí; xuất khẩu | [52](52-BP-BAN-HANG.md) |
| TS | T030-TS-1..11 | khấu hao theo ngày 1 tỷ / 60; ngưỡng 30 tr; tách 5 máy; 120 / 12; thanh lý giữa tháng; điều chỉnh; thẻ in; CCDC 36; XDCB; chi phí xe; thuê | [53](53-BP-TAI-SAN.md) |
| KT | T030-KT-1..7 | đối soát NH; tạm ứng; trích trước; tỷ giá; dự phòng; lãi vay ngày; hợp nhất 136 = 336 | [54](54-BP-KE-TOAN-NGAN-SACH-THUE.md) |
| NS | T030-NS-1..2 | vượt ngân sách bắt duyệt; rải 120 tr | [54](54-BP-KE-TOAN-NGAN-SACH-THUE.md) |
| THUE | T030-THUE-1..5 | vãng lai 10 %; lãi vay liên kết 30 %; chậm nộp 0,03 %; nhà thầu gross-up; quyết toán TNCN | [54](54-BP-KE-TOAN-NGAN-SACH-THUE.md), [55](55-BP-NHAN-SU-LUONG.md) |
| NSU | T030-NSU-1..7 | phụ thuộc theo tháng; HĐ gia hạn lần 2; ăn ca 730 k; làm thêm 40 h; phép; kỷ luật phạt tiền; trợ cấp thôi việc | [55](55-BP-NHAN-SU-LUONG.md) |
| LUONG | T030-LUONG-1..7 | 40 tr; 80 tr trần; 4 tr dưới min; sự việc payroll cân; D02-LT; tạm ứng lương; mô phỏng | [55](55-BP-NHAN-SU-LUONG.md) |
| DOC <!-- [2026-11-06 03:51 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — ADR-0029 --> | T030-DOC-1..9 | duyệt ≠ ghi sổ; Approval Freeze; sửa trước ghi nhận 0 đảo; điều chỉnh sau ghi nhận 1 lần nộp; cổng cùng phiên bản khác băm; đổi chính sách theo ngày; POS tự xác nhận; chạy lại; đồng thời | [19 §5](19-RA-SOAT-DUYET-VA-GHI-SO.md) |
| AUTH | T030-AUTH-1..5 | phạm vi kho K1 / K2; thu hồi quyền; SoD hai cấp; chữ ký theo phiên bản; `decisionId` + `explain` | [19 §5](19-RA-SOAT-DUYET-VA-GHI-SO.md) |

Tổng: 87 ca (73 ca W0 + 14 ca ADR-0029).

## 6. Gắn với bộ kiểm cài module

- `bizcity module check <key>` (PHASE-014) đọc `bizcity.module.json#golden: ["T030-KHO-*"]` và chạy đúng các tệp đó trên CSDL tạm; kết quả gắn băm mã nguồn module (P3 của Standard). Đề xuất thêm trường `golden` vào `bizcity_module@1` — PR tài liệu chốt thiết kế (R-FLOW §3) trước khi code.
- `bizcity_compliance@1`: nguyên tắc AP-7 "Compliance is enforced" — mỗi blueprint P0 có ít nhất một ca chạy được là tín hiệu `signal` cho trụ cột tương ứng ở `nen-mong.json`.
- Ca đỏ ở module cộng đồng → PR không được merge; ca đỏ ở Kernel → nhóm Lõi (K-030-*).
