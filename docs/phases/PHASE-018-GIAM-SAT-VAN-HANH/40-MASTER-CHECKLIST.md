# PHASE-018 · 40 — Master checklist
<!-- [2026-10-31 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-018 — checklist việc con S018-*, ca bằng chứng T018-*, log. -->
<!-- [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — cập nhật trạng thái sau khi code W1–W4 (nhánh feat/phase-018-giam-sat). -->

> Nguồn trạng thái **việc con** duy nhất của phase (thay `PHASE-STATUS.md` của bản giao việc). Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

| ID | Việc | Đợt | Ưu tiên | Code | Trạng thái |
|---|---|---|---|---|---|
| S018-1 | Khảo sát repo, luồng thật, có / kế hoạch / chưa có, khoảng trống ([10-HIEN-TRANG](10-HIEN-TRANG.md)) | W0 | P0 | — | ✅ 2026-10-31 |
| S018-2 | Kiến trúc, danh mục số đo + ngân sách nhãn, đặc tả dashboard, cảnh báo, ma trận test ([20-KIEN-TRUC](20-KIEN-TRUC.md)) | W0 | P0 | — | ✅ 2026-11-01 (chủ duyệt; D018-3/4 sửa theo mã thật) |
| S018-3 | Bản mẫu dashboard đích ([mockups/](mockups/README.md)) | W0 | P0 | — | ✅ 2026-11-01 |
| S018-4 | Đo mốc trên **máy chủ thật**: p50/p95/p99, pool, bộ nhớ, 5xx, R-KER-9 (a)–(d) — ca T018-1 | W0 | P0 | — | ☐ máy dev đã có số chi phí `/metrics` (evidence W1-W4); máy chủ thật chưa đo |
| S018-5 | Mật khẩu Grafana thành biến bắt buộc | W1 | P0 | có | ✅ 2026-11-01 (`docker compose config` báo lỗi khi thiếu) |
| S018-5b | Exporter dùng `ketoan_monitor` chỉ đọc trên máy chủ thật | W1 | P1 | — | ☐ hướng dẫn có ở README §6, chưa bắt buộc |
| S018-6 | Số đo ghi sổ `bizcity_postings_total`, `bizcity_posting_failures_total` (đọc `posting_log`, D018-3 sửa) | W1 | P1 | có | ✅ 2026-11-01 |
| S018-7 | Đường ghi sổ không có lời gọi giám sát; bộ thu chỉ đọc + `statement_timeout` — ca T018-2 | W1 | P1 | có | ✅ 2026-11-01 |
| S018-8 | `bizcity_db_pool_max` + cảnh báo `DbPoolSaturation` | W1 | P1 | có | ✅ 2026-11-01 |
| S018-9 | Bộ thu outbox (`bizcity_outbox_*`), lượt giao theo subscriber | W2 | P1 | có | ✅ 2026-11-01 |
| S018-10 | `bizcity_idempotency_requests_total` trong `runAction` | W2 | P1 | có | ✅ 2026-11-01 |
| S018-11 | Mốc + kết quả tự chẩn đoán (`bizcity_diagnostics_last_*`, `bizcity_diagnostics_checks`) — ca T018-3 | W2 | P1 | có | ✅ 2026-11-01 |
| S018-12 | Thêm dashboard 07 Đường sự kiện, 08 Đa đơn vị, 09 Toàn vẹn sổ — ca T018-4 | W3 | P1 | có | ✅ 2026-11-01 (27/28 truy vấn có dữ liệu thật; 1 "Chưa thu" đúng chủ đích) |
| S018-12b | Nâng dashboard 01 (dải KPI), 03 (bão hoà pool), 04 (ghi sổ theo hành động) | W3 | P2 | chưa | ☐ số đo đã có, bảng 09 đã hiển thị; gộp vào 01/03/04 sau |
| S018-13 | `bizcity_tenants{band}`, `bizcity_tenants_with_backlog` | W3 | P1 | có | ✅ 2026-11-01 |
| S018-13b | Tắt nhãn `tenant` Loki trên máy chủ thật (> 100 đơn vị), bảng 05 đổi sang `bizcity_tenants` | W3 | P1 | chưa | ☐ |
| S018-14 | 6 cảnh báo mới + định tuyến kế toán, ức chế; `promtool test rules` — ca T018-5 | W4 | P1 | có | ✅ 2026-11-01 |
| S018-14b | Đưa `promtool check / test rules` vào CI | W4 | P2 | chưa | ☐ |
| S018-15 | `docs/ops/RUNBOOK-CANH-BAO.md`: runbook 14 cảnh báo | W4 | P1 | — | ✅ 2026-11-01 |
| S018-16 | Cập nhật bảng §3 / §4 `docs/ops/OBSERVABILITY.md` + `infrastructure/monitoring/README.md` (R-OBS-6) | W1–W4 | P1 | — | ✅ 2026-11-01 |
| S018-17 | ADR-0010 OpenTelemetry + Tempo tuỳ chọn; trace HTTP → action → ghi sổ → CSDL — ca T018-6 | W5 | P2 | chưa | ⛔ Q018-2 |
| S018-18 | SLI / SLO, đo tải theo Q018-5, kịch bản sập, lint cấu hình giám sát trong CI | W6 | P2 | chưa | ⛔ Q018-5 |
| S018-19 | API tóm tắt sức khoẻ có phân quyền + widget CEO 4 chỉ số — ca T018-7 | W7 | P3 | chưa | ⛔ PHASE-015, Q018-6 |
| S018-20 | Luật dò `H-METRIC-LABEL` trong `scripts/ra-soat-dong-gop.mjs` + RULE-REVIEW §4 | W1 | P1 | có | ✅ 2026-11-01 |

## Ca bằng chứng

| Ca | Chứng minh | Lưu ở |
|---|---|---|
| T018-1 | mốc đo có lệnh, cấu hình máy, kết quả (máy chủ thật) | `evidence/W0-<ngày>.md` — chưa |
| T018-2 | ghi sổ không có lời gọi giám sát; bộ thu quá giờ bị CSDL huỷ, chỉ đọc; chi phí `/metrics` | [evidence/W1-W4-2026-11-01.md](evidence/W1-W4-2026-11-01.md) §2, §4 |
| T018-3 | outbox dồn / chết, mốc tự chẩn đoán hiện đúng trên số đo (dữ liệu thật) | [evidence/W1-W4-2026-11-01.md](evidence/W1-W4-2026-11-01.md) §3 |
| T018-4 | 9 dashboard tự nạp, ảnh chụp dữ liệu thật, không panel trống do sai tên | [evidence/W1-W4-2026-11-01.md](evidence/W1-W4-2026-11-01.md) §5 + 3 ảnh `W3-2026-11-01-*.png` |
| T018-5 | cảnh báo bắn / hết bắn, định tuyến, không gửi dữ liệu tài chính | [evidence/W1-W4-2026-11-01.md](evidence/W1-W4-2026-11-01.md) §6 |
| T018-6 | một ca lỗi ghi sổ điều tra đầu-cuối không lộ chứng từ | `evidence/W5-<ngày>.md` — chưa |
| T018-7 | test chéo đơn vị, không dữ liệu / dữ liệu cũ hiển thị đúng | `evidence/W7-<ngày>.md` — chưa |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-31 23:40 | Claude Code (theo chỉ đạo Johnny Chu – Chu Hoàng Anh) | Mở phase từ bản giao việc observability; khảo sát repo (S018-1); kiến trúc + đặc tả (S018-2); bản mẫu dashboard (S018-3). Chưa sửa mã chạy. |
| 2026-11-01 00:04–01:10 | Claude Code (theo chỉ đạo "ok code") | Nhánh `feat/phase-018-giam-sat` (worktree riêng). W1–W4: bộ thu `posting_log` / outbox / đối soát / đơn vị theo dải, bộ đếm gửi lặp / lượt giao, `readWithTimeout`, mật khẩu Grafana bắt buộc, 3 dashboard, 6 cảnh báo + test promtool, runbook, `H-METRIC-LABEL`. D018-3 / D018-4 sửa theo mã thật. Kiểm: typecheck, selfcheck, vitest, promtool, chạy thật API + Prometheus + Grafana tạm. |
