# PHASE-012 — Workflow khai báo, `ledger.query`, gói định khoản cài / gỡ, gợi ý lý do

> **Trạng thái:** 🟡 khuôn gói định khoản + SC-TPL-1 có; cài / gỡ, workflow, `ledger.query` chưa
> **Giai đoạn:** Phase 3 của [PHASES](../../standard/PHASES.md) · **Code:** một phần · **Tiến độ tín hiệu (2026-10-30):** 13%
> **Mục tiêu:** Kế toán sở hữu cấu hình dưới dạng gói cài / gỡ được; báo cáo đọc sổ qua API; luồng duyệt chứng từ khai báo thay vì viết tay.
> **Việc lộ trình:** 3.5, 3.7, 3.11, 3.12
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** AP-1
> **Phụ thuộc phase:** 005, 011

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Gói mẫu TT99 thương mại đúng khuôn (SC-TPL-1 đạt); năng lực `templates.posting` planned | `docs/standard/examples/vn-tt99-thuong-mai.posting-pack.json` |
| F2 | Báo cáo chạy SQL trực tiếp trên `ledger_*` | `modules/reports/ledger-sql.ts`, `control-reports.ts` |
| F3 | Luồng duyệt yêu cầu thanh toán viết tay bằng hàm chuyển trạng thái | `phan-he/quy/payment-requests/payment-request.routes.ts` |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 3.5 ☐ · 3.7 ☐ · 3.11 🟡 · 3.12 ☐.
