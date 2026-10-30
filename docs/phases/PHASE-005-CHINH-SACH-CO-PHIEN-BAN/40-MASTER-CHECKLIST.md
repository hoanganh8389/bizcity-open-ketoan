# PHASE-005 · 40 — Master checklist

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S005-1 | ADR: mô hình phiên bản (bảng bản chụp chính sách hay cột phiên bản từng bảng), mức K3 | 2.14 | chưa | ☐ |
| S005-2 | Migration mới: phiên bản + `effective_from`; `posting_log.policy_version`; `COMMENT ON` | 2.14 | chưa | ☐ |
| S005-3 | Resolver chọn bản theo ngày chứng từ (AccountResolver, lý do, nhóm hạch toán) | 2.14 | chưa | ☐ |
| S005-4 | Định khoản lại chứng từ cũ dùng bản đúng ngày, không dùng bản mới nhất | 2.14 | chưa | ☐ |
| S005-5 | Màn Cấu hình định khoản: lịch sử bản, ngày hiệu lực, ai đổi | 2.14 | chưa | ☐ |
| S005-6 | Bật năng lực `posting.policy-version`; C-9 đạt | 2.14 · G2-09 | chưa | ☐ |

## Ca bằng chứng

| ID | Ca | Mong đợi | Trạng thái |
|---|---|---|---|
| T005-1 | Đổi tài khoản giá vốn từ ngày 01/01, định khoản lại chứng từ tháng 12 | chứng từ tháng 12 vẫn dùng tài khoản cũ | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
