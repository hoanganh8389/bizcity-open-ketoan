# 04 · Đặt tên chuẩn `bizcity_`
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

Mục tiêu: nhìn một tên là biết nó thuộc framework, thuộc tầng nào, phiên bản nào — mà **không** phải đổi tên hàng loạt bảng CSDL đang chạy. Quyết định: [../adr/ADR-0002-tien-to-bizcity.md](../adr/ADR-0002-tien-to-bizcity.md).

## 1. Bảng đặt tên

| Đối tượng | Mẫu | Ví dụ | Áp dụng |
|---|---|---|---|
| Mã hợp đồng | `bizcity_<ten>@<major>` | `bizcity_ledger_intake@1`, `bizcity_connector@1` | Ngay |
| Tệp hợp đồng | `docs/contracts/BIZCITY-<TEN>-v<major>.md` (+ `.schema.json`) | `BIZCITY-LEDGER-INTAKE-v1.md` | Ngay |
| Gói npm | `@bizcity/<ten>` | `@bizcity/ledger-contracts`, `@bizcity/module-sdk` | Giai đoạn 1 (bí danh `@ketoan/*` giữ lại) |
| Gói Composer | `bizcity/<ten>` | `bizcity/ledger-php-sdk` | Giai đoạn 2 |
| Biến môi trường mới | `BIZCITY_<NHOM>_<TEN>` | `BIZCITY_LEDGER_BOOK_MODE`, `BIZCITY_MODULES` | Biến mới từ nay. Biến cũ (`BOOK_MODE`, `ENABLED_MODULES`, `ADDINS`) đọc làm dự phòng |
| Header HTTP | `X-Bizcity-<Ten>` | `X-Bizcity-Contract: bizcity_ledger_intake@1`, `X-Bizcity-Request-Id` | Tuỳ chọn; `X-Api-Key` vẫn nhận |
| Khoá cấu hình (registry) | `bizcity.<miền>.<khoá>` | `bizcity.posting.modes`, `bizcity.lock.data` | Ngay ở registry; nơi lưu vật lý giữ nguyên |
| Tiền tố khoá API | `kt_` (hiện tại) → `bzl_` | `bzl_8f3a…` | Khoá mới; khoá cũ vẫn dùng |
| Mã sự kiện nội bộ (hook, log) | `bizcity.<miền>.<động_từ>` | `bizcity.event.received`, `bizcity.ledger.posted`, `bizcity.ledger.reversed` | Ngay cho log có cấu trúc |
| Plugin WordPress | slug `bizcity-<ten>`, lớp `BizCity_<Ten>_`, hook `bizcity_<ten>_*` | `bizcity-ledger-bridge`, `BizCity_Ledger_Gate` | Giai đoạn 2 |
| Tên dự án Docker Compose | `bizcity-ledger` | `name: bizcity-ledger` | Khi cài mới (đổi trên máy đang chạy làm đổi tên volume — **không** đổi) |

## 2. Cơ sở dữ liệu

| Loại bảng | Mẫu | Ví dụ |
|---|---|---|
| Bảng nhân, dịch vụ lõi **đang có** | giữ nguyên | `accounting_events`, `ledger_lines`, `partners` |
| Bảng lõi **mới** | tiền tố miền lõi: `ledger_`, `event_`, `catalog_`, `config_` | `config_settings_history` |
| Bảng phân hệ mới | `<key gạch dưới>_<thực thể>` | `mua_hang_*` (bản đang có `purchase_*` giữ nguyên), `nhan_su_payslips` |
| Bảng add-in | `addin_<id gạch dưới>_<thực thể>` | `addin_tro_ly_sessions` |
| View công khai cho phân hệ / báo cáo | `v_<ten>` (mới) | `v_posted_lines` |
| Schema PostgreSQL (giai đoạn 3, tuỳ chọn) | `bizcity_core`, `bizcity_mod_<key>`, `bizcity_addin_<id>` | `bizcity_core.ledger_lines` |

Không đặt `bizcity_` trước **từng bảng**: tốn chữ, không thêm thông tin vì cả CSDL đã là của framework. Nhận diện tầng đã do tiền tố miền làm. Nếu cần tách hẳn quyền theo tầng thì dùng **schema** PostgreSQL ở giai đoạn 3.

## 3. Mã trong code

| Đối tượng | Quy ước |
|---|---|
| Tên bảng, cột, biến, hàm | Tiếng Anh, `snake_case` ở CSDL, `camelCase` ở TS |
| Thư mục phân hệ | `kebab-case` tiếng Việt không dấu (giữ như hiện tại: `mua-hang`, `tai-san`) |
| `docType` | `snake_case` tiếng Anh, danh từ số ít: `sale`, `purchase_return`, `payroll` |
| Mã lỗi | `UPPER_SNAKE`: `PERIOD_LOCKED` |
| Quyền | `<tài nguyên>:<hành động>`: `documents:write`, `payroll:approve` |
| Mã chức năng màn | `<NHÓM><số>`: ACC14, MH13, DM15 (giữ quen tay kế toán) |
| Chú thích, thông báo cho người dùng | Tiếng Việt có dấu |
