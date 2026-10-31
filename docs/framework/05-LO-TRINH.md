# 05 · Lộ trình thành framework chuẩn
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

Đánh giá hiện trạng (chi tiết: [../audits/AUDIT-2026-10-28-BASELINE.md](../audits/AUDIT-2026-10-28-BASELINE.md)): **phần nhân đã tốt hơn mức trung bình** — sổ cái chỉ thêm được bảo vệ ở tầng CSDL, một cửa ghi sổ, idempotent theo `docKey`/`version`, 624 phép thử trên PostgreSQL thật, test ranh giới phân hệ. Thứ còn thiếu để gọi là *framework* không nằm ở sổ cái mà ở **bề mặt mở rộng**: hợp đồng chưa có phiên bản, cấu hình chưa có registry, phân hệ chưa có manifest đầy đủ, không có CI, không có SDK cho plugin.

Nguyên tắc lộ trình: **không viết lại**, mỗi bước giữ tương thích ngược, mỗi bước có test canh.

> **Đã thay (2026-10-29):** lộ trình hiện hành là [../standard/PHASES.md](../standard/PHASES.md) (Phase 0–6 của Bizcity Framework Standard v1). Bảng Giai đoạn 0–3 dưới đây giữ để tra mã việc cũ; PHASES.md có cột "Từ lộ trình cũ" ánh xạ từng mã. Phần **Tư vấn chọn ưu tiên** cuối tệp vẫn áp dụng.

## Giai đoạn 0 — Chốt chuẩn (tuần này)

| # | Việc | Kết quả kiểm được |
|---|---|---|
| 0.1 | Bộ tài liệu `docs/` này được nhóm duyệt; CODEOWNERS gán người cho `docs/rules`, `docs/contracts` | PR merge |
| 0.2 | Bật CI: `.github/workflows/ci.yml` (typecheck + test PostgreSQL + kiểm số migration) | Badge xanh |
| 0.3 | Sửa hai migration trùng số `0028_*` (đổi tên tệp chưa chạy ở máy chủ thật, hoặc ghi chú vào `migrate.ts`) | CI bước kiểm số migration xanh |
| 0.4 | Đánh dấu tài liệu cũ lỗi thời (`kien-truc.md`, `co-so-du-lieu.md`) trỏ về chuẩn mới | Không còn hai nguồn nói khác nhau |

## Giai đoạn 1 — Một cửa thật sự (2–4 tuần)

| # | Việc | Vì sao |
|---|---|---|
| 1.1 | **`eventStore.commit(trx, auth, { docKey, docType, version, payload, build })`** trong `modules/documents`: gói chuỗi khoá → lưu phiên bản → so dấu vân tay → đảo → ghi → `posting_log`. Chuyển `vouchers`, `closing`, `assets`, `inventory/costing` sang gọi hàm này | Hiện 4 module tự viết lại chuỗi này; một chỗ sai là sổ sai. Sau bước này chỉ còn **hai** hàm chạm `ledgerService`: `postingService` và `eventStore` |
| 1.2 | Test canh: grep CI cấm `ledgerService.post(`/`reverse(` ngoài `modules/{ledger,posting,documents}` | Giữ 1.1 không trôi |
| 1.3 | Test canh: grep CI cấm `insertInto('ledger_` / `'accounting_events'` / `'posting_log'` ngoài module sở hữu | R-LEDGER-4, R-EVENT-2 |
| 1.4 | `assertLedgerInvariants(tenantId)` trong test-kit: tổng Nợ = Có mỗi bút toán, số dư ngày = tổng dòng, mỗi bút toán đảo đúng một lần, mọi `event_id` tồn tại. Gọi ở `afterAll` của **mọi** file test | Một lớp lưới cho mọi tính năng mới |
| 1.5 | `GET /api/v1/system/diagnostics` trả kết quả các kiểm toàn vẹn trên (xem [../ops/DIAGNOSTICS.md](../ops/DIAGNOSTICS.md)) | Vận hành tự kiểm trên máy chủ thật |
| 1.6 | Tách `packages/contracts/src/mua-hang/*` ra gói của phân hệ; tạo bí danh `@bizcity/ledger-contracts` | Nhân không chứa nghiệp vụ phân hệ |

## Giai đoạn 2 — Hợp đồng và registry (1–2 tháng)

| # | Việc |
|---|---|
| 2.1 | Sinh JSON Schema từ zod (`zod-to-json-schema`) cho `bizcity_ledger_intake@1`; CI so bản sinh với `docs/contracts/*.schema.json` |
| 2.2 | Nhận header tuỳ chọn `X-Bizcity-Contract`; trả `meta.contract` trong phản hồi; từ chối major không hỗ trợ bằng `VALIDATION_ERROR` |
| 2.3 | **Settings registry** chạy thật: `core/settings.ts` với `settings.get(key, scope)` đọc theo [../contracts/BIZCITY-SETTINGS-MATRIX-v1.md](../contracts/BIZCITY-SETTINGS-MATRIX-v1.md); mọi chỗ đọc `tenants.settings.<x>` chuyển sang hàm này; ghi có lịch sử (`config_settings_history`) |
| 2.4 | **Module manifest** `bizcity.module.json` cho mỗi phân hệ (quyền, `docTypes` phát ra, khoá cấu hình, bảng sở hữu, phụ thuộc). Lõi đọc để dựng menu, quyền, kiểm ranh giới; `GET /api/v1/system/modules` trả manifest |
| 2.5 | `bizcity/ledger-php-sdk`: tách logic dựng / băm / gửi khỏi `tgs_accounting_bridge`; plugin WP đổi sang dùng SDK |
| 2.6 | `@bizcity/test-kit` + bộ **test hợp đồng** cho plugin: chạy JSON mẫu của plugin qua `POST /documents` trên CSDL tạm, kiểm `posted` và bất biến |
| 2.7 | Lệnh `bizcity` CLI (xem [../ops/CLI.md](../ops/CLI.md)): `doctor`, `migrate`, `module new`, `contract check`, `ledger verify` |

## Giai đoạn 3 — Quy mô và phát hành cho doanh nghiệp khác (quý sau)

| # | Việc |
|---|---|
| 3.1 | Hàng đợi trước bước định khoản (bảng `event_inbox` + worker, `SKIP LOCKED`) — nhận 30.000 đơn/ngày không chặn nguồn; `POST /documents` trả `accepted` |
| 3.2 | Partition `ledger_lines`, `ledger_entries`, `ledger_balances_daily` theo năm `posting_date` |
| 3.3 | Luật định khoản dạng khai báo (JSON template) cho loại chứng từ đơn giản; luật phức tạp vẫn là code |
| 3.4 | Schema PostgreSQL theo tầng (`bizcity_core`, `bizcity_mod_*`) + role CSDL riêng cho phân hệ: phân hệ **không có quyền** `INSERT` bảng nhân ở tầng CSDL |
| 3.5 | Outbox sự kiện (`bizcity.ledger.posted`…) cho phân hệ / plugin lắng nghe (webhook) thay vì hỏi vòng |
| 3.6 | Gói phát hành: image Docker có nhãn phiên bản, `CHANGELOG.md` theo SemVer, trang tương thích hợp đồng × phiên bản lõi |
| 3.7 | Phân hệ Nhân sự (`nhan-su`) làm phân hệ mẫu chuẩn đầu tiên viết hoàn toàn theo `bizcity_module@1` |

## Tư vấn chọn ưu tiên

1. **Làm 1.1 trước mọi thứ khác.** Đây là chỗ duy nhất mà lời hứa "mọi đầu vào qua events → versions → rules → ledger" đang bị hiểu theo 5 cách khác nhau trong code. Một framework mà chính lõi không đi một cửa thì phân hệ cũng sẽ không đi.
2. **Registry cấu hình (2.3) quan trọng hơn đổi tên `bizcity_`.** Doanh nghiệp khác cài framework sẽ vấp ở cấu hình (tài khoản ngầm định, lý do, chế độ định khoản) nhiều hơn ở tên gói.
3. **Đừng đổi tên bảng CSDL.** Tiền tố `bizcity_` đặt ở hợp đồng, gói, biến môi trường, hook — nơi bên ngoài nhìn thấy (ADR-0002).
4. **Plugin WP là khách hàng đầu tiên của hợp đồng.** Mọi thay đổi `bizcity_ledger_intake@1` thử trên `tgs_accounting_bridge` trước khi phát hành.
5. **Đo bằng test, không đo bằng tài liệu.** Mỗi luật Tier 0/1 trong [../00-CANON.md](../00-CANON.md) phải có cột "Kiểm bằng" trỏ tới test hoặc bước CI; luật không kiểm được thì hạ Tier 2.
