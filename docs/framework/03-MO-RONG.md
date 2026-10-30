# 03 · Mở rộng mà không đụng lõi
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

Ba cách mở rộng, chọn theo bảng dưới. Cả ba **chỉ** tác động sổ sách bằng cách nộp sự việc (`bizcity_ledger_intake@1`).

## 1. Chọn cách nào

| Câu hỏi | Phân hệ (T2) | Add-in (T3) | Plugin ngoài (T4) |
|---|---|---|---|
| Có màn hình nghiệp vụ, luồng duyệt riêng? | ✓ | ít | ✓ (ở hệ thống của nó) |
| Cần bảng CSDL riêng? | ✓ `<mod>_*` | ✓ `addin_<ma>_*` | ở CSDL của nó |
| Chạy chung tiến trình với lõi? | ✓ | ✓ | ✗ (HTTP) |
| Bật tắt bằng | `ENABLED_MODULES` | `ADDINS` | khoá API / kết nối ACC14 |
| Phát hành cùng lõi? | ✓ | ✓ | ✗ (vòng đời riêng) |
| Ví dụ | mua-hang, quy, nhan-su | excel-export, tro-ly | WP POS (`tgs_accounting_bridge`), WooCommerce, CRM |

Mặc định chọn **plugin ngoài** cho hệ thống đã có sẵn (POS, CRM); **phân hệ** cho nghiệp vụ doanh nghiệp muốn nằm cùng phần mềm; **add-in** cho tiện ích không có luồng nghiệp vụ.

## 2. Phân hệ (module)

```
apps/api/src/phan-he/<key>/index.ts      export const <key>: ApiModule = { key, label, routes, includes? }
apps/api/src/phan-he/<key>/**            schemas · repository · service · routes riêng
apps/web/src/phan-he/<key>/manifest.ts   key, label, description, icon, color, order, groups
apps/web/src/phan-he/<key>/{menu,routes}.ts(x)
db/migrations/NNNN_<key>_<mo_ta>.sql     bảng riêng, tiền tố <key> (R-DB-6)
docs/huong-dan/<helpKey>.md              hướng dẫn mỗi màn
```

Phân hệ **được**:
- đọc danh mục, cấu hình, sổ qua service lõi (`modules/*`) hoặc view;
- có bảng nghiệp vụ riêng (phiếu nháp, chính sách, lịch…);
- nộp sự việc qua `postDocumentIn(trx, auth, doc)` khi phiếu đạt trạng thái "đã duyệt" (R-WF-3);
- khai quyền, khoá cấu hình mới qua registry (R-MATRIX-2).

Phân hệ **không được**:
- import thư mục phân hệ khác (test `phan-he-ranh-gioi.test.ts` chặn);
- `insertInto` / `updateTable` các bảng nhân: `accounting_events*`, `ledger_*`, `posting_log`, `tax_invoices*`, `inventory_movements`, `debt_*`, `audit_logs` (ngoài `writeAudit`);
- gọi thẳng `ledgerService.post/reverse`;
- tự tính tài khoản Nợ / Có — chỉ gửi `reasonCode`, mã hàng, mã thuế, mã hình thức thanh toán.

Đăng ký: thêm vào `API_MODULES` (`apps/api/src/phan-he/index.ts`), `WEB_MODULES`, `package.json` (`dev:<key>`), `.github/CODEOWNERS`. Chuẩn đích là một tệp khai `bizcity.module.json` theo [../contracts/BIZCITY-MODULE-v1.md](../contracts/BIZCITY-MODULE-v1.md).

## 3. Add-in

Mẫu code đầy đủ ở [../add-in.md](../add-in.md). Bổ sung chuẩn:

- `manifest.id` theo `^[a-z0-9][a-z0-9-]*$`; route tự gắn `/api/v1/addins/<id>`.
- Mọi route khai `preHandler: requirePermission(...)`.
- Bảng riêng tiền tố `addin_<id_gạch_dưới>_`.
- Muốn ghi sổ: nộp sự việc (`postDocumentIn`) — ví dụ add-in `tro-ly` mô phỏng định khoản bằng cách chạy rồi huỷ giao dịch.

## 4. Plugin ngoài (WordPress, POS, CRM, HRM)

Plugin chỉ cần ba hợp đồng:

| Việc | Hợp đồng | Lời gọi |
|---|---|---|
| Lấy mã danh mục để gửi đúng | [bizcity_master_data@1](../contracts/BIZCITY-MASTER-DATA-v1.md) | `GET /api/v1/{branches,partners,products,tax-codes,posting/reasons,posting/payment-methods}` |
| Gửi sự việc (đẩy) | [bizcity_ledger_intake@1](../contracts/BIZCITY-LEDGER-INTAKE-v1.md) | `POST /api/v1/documents/batch`, `POST /api/v1/documents/cancel` |
| Cho lõi kéo | [bizcity_connector@1](../contracts/BIZCITY-CONNECTOR-v1.md) | Plugin dựng `GET <url>?from&to&cursor` + `POST <url>` báo nhận |

Quy ước cho plugin WordPress BizCity:

| Mục | Chuẩn |
|---|---|
| Slug plugin | `bizcity-ledger-bridge` (bản hiện tại: `tgs_accounting_bridge`) |
| Tiền tố lớp PHP | `BizCity_Ledger_` (ví dụ `BizCity_Ledger_Gate`, `BizCity_Ledger_Pusher`) |
| Hằng số `wp-config.php` | `BIZCITY_LEDGER_API_URL`, `BIZCITY_LEDGER_API_KEY` (giữ đọc `TGS_KETOAN_*` làm dự phòng) |
| Hook mở rộng | `bizcity_ledger_build_event` (filter: sửa sự việc trước khi gửi), `bizcity_ledger_event_sent` (action), `bizcity_ledger_event_rejected` (action) |
| REST namespace cổng kéo | `bizcity-ledger/v1/pending` |
| `docKey` | `<nguồn>:<mã shop / blog>:<loại phiếu>:<id>` — ví dụ `btsoft:95:sale:3058` |
| `version` | tăng khi băm nội dung đổi (không dùng thời gian sửa) |

## 5. Danh sách kiểm khi mở phân hệ mới

- [ ] Luồng nghiệp vụ viết theo khuôn [../workflows/README.md](../workflows/README.md): trạng thái, trạng thái nào sinh sự việc, `docType` nào.
- [ ] `docType` mới? → PR **lõi** riêng: khuôn ở `packages/contracts`, luật `posting/rules`, test, cập nhật `bizcity_ledger_intake@1` (thêm loại là thay đổi tương thích).
- [ ] Khoá cấu hình mới đã khai ở `docs/contracts/bizcity-settings.registry.json`.
- [ ] Quyền mới đã khai ở `core/auth.ts` (`PERMISSIONS`) và gán vai trò.
- [ ] Bảng mới có tiền tố, `COMMENT ON`, mục trong `schema-catalog.ts`.
- [ ] Test của phân hệ chạy được một mình: `ENABLED_MODULES=<key> npm test`.
