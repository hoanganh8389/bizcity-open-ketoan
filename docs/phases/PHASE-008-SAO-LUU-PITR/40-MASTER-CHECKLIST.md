# PHASE-008 · 40 — Master checklist

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S008-1 | `infrastructure/backup/`: wal-g hoặc pgBackRest, compose override tuỳ chọn, README | 2.15 · G1-08 | chưa | ☐ |
| S008-2 | Diễn tập PITR tới một thời điểm, đo RTO / RPO, biên bản ở `docs/audits/` | 2.15 · G3-07 | chưa | ☐ |
| S008-3 | Lịch kiểm khôi phục định kỳ (R-BAK) | 2.15 | một phần | 🟡 có script, chưa có lịch |
| S008-4 | Xác nhận thời hạn lưu trữ | — | — | ⛔ kế toán trưởng / luật sư |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
