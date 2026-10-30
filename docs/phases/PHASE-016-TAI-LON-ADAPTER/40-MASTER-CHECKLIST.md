# PHASE-016 · 40 — Master checklist

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S016-1 | Hàng đợi trước định khoản (`event_inbox`), partition sổ cái theo năm | 5.5 | chưa | ☐ |
| S016-2 | Benchmark tải có báo cáo | G3-05 | chưa | ☐ |
| S016-3 | `adapters/redis` (đệm có huỷ theo phiên bản cấu hình, rate-limit) | 5.9 · G2-06 | chưa | ☐ |
| S016-4 | `adapters/nats` chuyển tiếp outbox | 5.9 · G3-03 | chưa | ☐ |
| S016-5 | `adapters/oidc` (Keycloak), Kong khi cần | 5.9 · G3-08 | chưa | ☐ |
| S016-6 | Helm chart `infrastructure/helm/` | G3-09 | chưa | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
