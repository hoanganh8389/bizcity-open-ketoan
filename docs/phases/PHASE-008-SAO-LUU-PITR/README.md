# PHASE-008 — Sao lưu PITR (WAL) và diễn tập khôi phục

> **Trạng thái:** 🟡 PITR có cơ chế + diễn tập máy dev ĐẠT (2026-10-30, RTO 8 giây, RPO ≤ 60 giây); còn bật + diễn tập trên máy chủ thật, xác nhận thời hạn lưu trữ
> **Giai đoạn:** Phase 2 của [PHASES](../../standard/PHASES.md) · **Code:** có · **Tiến độ tín hiệu (2026-10-30):** 0%
> **Mục tiêu:** Khôi phục được tới một thời điểm bất kỳ, đo được RTO / RPO thật, có biên bản diễn tập; thời hạn lưu trữ được kế toán trưởng / luật sư xác nhận.
> **Việc lộ trình:** 2.15
> **Checklist công bố:** G1-08, G3-07
> **Tuân thủ / nguyên tắc:** C-6 (60%)
> **Phụ thuộc phase:** —

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Sao lưu `pg_dump` và kiểm khôi phục vào CSDL tạm đã chạy thật (23 MB, chuỗi bằng chứng 3.220 dòng nguyên vẹn) | `scripts/sao-luu.sh`, `scripts/kiem-khoi-phuc.sh` |
| F2 | Chưa có WAL archiving, chưa có `infrastructure/backup/` | R-BAK-1..6 trong `docs/rules/RULE-INFRASTRUCTURE.md` |
| F3 | Thời hạn lưu trữ trong ma trận pháp lý chưa được kế toán trưởng / luật sư xác nhận | `docs/contracts/BIZCITY-COMPLIANCE-v1.md` §3 |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 2.15 ☐.
