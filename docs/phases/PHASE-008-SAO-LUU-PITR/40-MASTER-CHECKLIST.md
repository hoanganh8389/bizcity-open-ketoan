# PHASE-008 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->
<!-- [2026-10-30 08:42 PM Johnny Chu - Chu Hoàng Anh] PHASE-008 — PITR: lưu WAL, sao lưu gốc, diễn tập khôi phục. -->

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30 08:42 PM Johnny Chu - Chu Hoàng Anh] PHASE-008 — Chủ: "tiếp" (chưa chốt ADR-0009 / Q009-1) ⇒ làm phase không cần quyết định: 008. -->
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S008-1 | `infrastructure/backup/`: compose override lưu WAL (chỉ PostgreSQL; wal-g / pgBackRest tuỳ chọn), runbook, `scripts/sao-luu-goc.sh` (bản gốc + dọn WAL theo `BASE_KEEP`) | 2.15 · G1-08 | có | ✅ thử trên compose project tách riêng: 3 lần, giữ 2 bản, WAL cũ đã dọn |
| S008-2 | Diễn tập PITR tới một thời điểm, đo RTO / RPO, biên bản ở `docs/audits/` | 2.15 · G3-07 | có | 🟡 máy dev ĐẠT ([biên bản](../../audits/PITR-2026-10-30.md): RTO 8 giây, RPO ≤ 60 giây, lane diagnostics ĐẠT trên bản khôi phục); ⛔ diễn tập trên máy chủ thật + chủ xác nhận (tín hiệu tay 2.15) |
| S008-3 | Lịch kiểm khôi phục định kỳ (R-BAK) | 2.15 | có | 🟡 lịch cron đề xuất trong runbook; ⛔ đặt cron trên máy chủ (chủ) |
| S008-4 | Xác nhận thời hạn lưu trữ | — | — | ⛔ kế toán trưởng / luật sư |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
| 2026-10-30 | Claude Code | Chủ "tiếp" ⇒ code S008-1…3. Chọn cơ chế có sẵn của PostgreSQL (không thêm wal-g / pgBackRest bắt buộc — ADR-0007). Diễn tập `dien-tap-pitr.sh` trên `ketoan_test` (445 MB): ĐẠT hai lần (RTO 7 / 8 giây). Sửa trong lúc làm: grep lớp ký tự nhiều byte không khớp trên Git Bash → lane diagnostics không chạy mà không báo; nay báo SAI nếu không có dòng kết quả. |
