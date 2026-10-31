# PHASE-012 — Workflow khai báo, `ledger.query`, gói định khoản cài / gỡ, gợi ý lý do
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->

<!-- [2026-10-30 10:11 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — cài / xem trước / gỡ gói định khoản có (S012-3). -->
<!-- [2026-10-30 11:12 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — gói nền db/packs + gợi ý lý do có (S012-3b, S012-4). -->
<!-- [2026-10-31 08:26 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query có (S012-2, PHASES 3.7): đủ 4 việc lộ trình. -->
<!-- [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — Q012-2 ✅: báo cáo về phan-he/ke-toan/reports, callAction / ctx.actions.call -->
> **Trạng thái:** 🟡 gói định khoản cài / xem trước / gỡ, gói nền `db/packs`, gợi ý lý do **có** (2026-10-30, S012-3, -3b, -4); workflow khai báo **có** (2026-10-31, S012-1); `ledger.query` **có** (2026-10-31, S012-2) — đủ 4 việc lộ trình; báo cáo đã về `phan-he/ke-toan/reports` (Q012-2 ✅, 2026-10-31)
> **Giai đoạn:** Phase 3 của [PHASES](../../standard/PHASES.md) · **Code:** một phần · **Tiến độ tín hiệu (2026-10-30):** 13%
> **Mục tiêu:** Kế toán sở hữu cấu hình dưới dạng gói cài / gỡ được; báo cáo đọc sổ qua API; luồng duyệt chứng từ khai báo thay vì viết tay.
> **Việc lộ trình:** 3.5, 3.7, 3.11, 3.12
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** AP-1
> **Phụ thuộc phase:** 005, 011

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->
<!-- [2026-10-31 03:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — workflow khai báo có (S012-1, PHASES 3.5). -->

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | thiết kế D012-1…12; Q012-1 đã chốt `db/packs/` |
| [tools/so-seed-goi-nen.mjs](tools/so-seed-goi-nen.mjs) | bằng chứng T012-1: cấu hình đơn vị lập bằng seed mới = hằng của seed cũ |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Gói mẫu TT99 thương mại đúng khuôn (SC-TPL-1 đạt); năng lực `templates.posting` planned | `docs/standard/examples/vn-tt99-thuong-mai.posting-pack.json` |
| F2 | ~~Báo cáo chạy SQL trực tiếp trên `ledger_*`~~ → đọc khung nhìn chỉ đọc `bizcity_read.*` / `ledgerQuery` (2026-10-31, S012-2); SC-KERNEL-7 chặn tái phạm | `db/migrations/0043_doc_so_cai.sql`, `modules/ledger/ledger-query.ts` |
| F3 | ~~Luồng duyệt yêu cầu thanh toán viết tay bằng hàm chuyển trạng thái~~ → khai bằng YAML (2026-10-31, S012-1) | `phan-he/quy/payment-requests/payment-request.workflow.yaml`, `phan-he/mua-hang/purchase-document.workflow.yaml` |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 3.5 ☑ · 3.7 ☑ · 3.11 ☑ · 3.12 ☑.
