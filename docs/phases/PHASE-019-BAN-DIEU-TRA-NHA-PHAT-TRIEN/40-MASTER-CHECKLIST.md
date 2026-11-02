# PHASE-019 · 40 — Master checklist
<!-- [2026-11-01 07:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — Bàn điều tra cho nhà phát triển: sổ tay điều tra lỗi theo tình huống + thiết kế UI/UX dev trên Prometheus, Loki, Tempo, Grafana, Alertmanager -->

> Nguồn trạng thái **việc con** duy nhất của phase. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

| ID | Việc | Đợt | Ưu tiên | Code | Trạng thái |
|---|---|---|---|---|---|
| S019-1 | [Sổ tay điều tra lỗi](../../ops/SO-TAY-DIEU-TRA-LOI.md): 14 tình huống, khuôn chung, ba ngôn ngữ truy vấn, luật an toàn | W0 | P0 | — | ✅ 2026-11-01 (nhãn, số đo, thuộc tính, cột đối chiếu với mã `main` @ e9bde0e) |
| S019-2 | Khảo sát app cho dev: có / thiếu ([10-HIEN-TRANG](10-HIEN-TRANG.md)) | W0 | P0 | — | ✅ 2026-11-01 |
| S019-3 | Kiến trúc: hai chế độ, API trung gian, mẫu truy vấn đóng, bảo mật, bản đồ màn, luật UX, ma trận test ([20-KIEN-TRUC](20-KIEN-TRUC.md)) | W0 | P0 | — | 🟡 2026-11-01 viết xong; chủ duyệt D019-1..3, Q019-1, Q019-2 cùng ngày; D019-4..7 theo đề xuất |
| S019-4 | Bản mẫu UI tĩnh ([mockups/](mockups/README.md)) | W0 | P0 | — | 🟡 2026-11-01 có, chờ duyệt bố cục |
| S019-5 | `ApiError` giữ `requestId`, `traceId` (+ header `X-Request-Id` khi thân hỏng); thông báo lỗi hiện Mã tra cứu + nút Chép — ca T019-1 | W1 | P0 | có | ✅ 2026-11-01 — khay chung `components/MaTraCuu.tsx` ([20-KIEN-TRUC §4.4](20-KIEN-TRUC.md)); ca T019-1 đạt |
| S019-6 | Nút **Báo lỗi** dựng nội dung theo `bao-loi.yml`, chỉ mã, không dữ liệu (Q019-5) | W1 | P1 | có | ✅ 2026-11-01 chép nội dung; W2: `BUG_REPORT_URL` có thì chép rồi mở trang báo lỗi |
| S019-7 | Quyền `devtools:read` + vai trò mới `developer` (= `viewer` + `devtools:read`; Q019-1 chủ chọn b) ở `core/auth.ts` + `@ketoan/contracts` + màn Người dùng — ca T019-8 | W2 | P1 | có | ✅ 2026-11-01 — migration 0050 (đổi từ 0049: trùng số với main); màn Người dùng lấy vai trò từ `ROLE_LABELS` |
| S019-8 | Biến `DEVTOOLS_*` (`config/env.ts`, `.env.example`, `docker-compose.monitoring.yml` đặt URL nội bộ) | W2 | P1 | có | ✅ 2026-11-01 — thêm `BUG_REPORT_URL` (Q019-5) |
| S019-9 | `core.devtools.status`, `.trace`, `.request`, `.evidence` + bộ gác đơn vị (D019-5) + lọc trường lần hai + giới hạn — ca T019-2, T019-3, T019-6, T019-7 | W2 | P1 | có | ✅ 2026-11-01 — `modules/system/devtools.{routes,sources,trace}.ts`; [`evidence/W2-2026-11-01.md`](evidence/W2-2026-11-01.md) |
| S019-10 | Phân hệ web `dev`: khung, menu, quyền; màn **Tra mã** (tóm tắt, cây span, log cùng trace, bằng chứng) — ca T019-4 | W3 | P1 | có | ✅ 2026-11-01 — `apps/web/src/phan-he/dev/`; khay Mã tra cứu có nút Bàn điều tra; [`evidence/W3-2026-11-01.md`](evidence/W3-2026-11-01.md) |
| S019-11 | `core.devtools.logs`, `.traces`, `.summary`; màn **Nhật ký**, **Tổng quan** | W3 | P1 | có | ✅ 2026-11-01 — [`evidence/W3-2026-11-01.md`](evidence/W3-2026-11-01.md) |
| S019-12 | `core.devtools.module-errors`; màn **Lỗi theo module** | W4 | P2 | có | ✅ 2026-11-02 — TraceQL `>>` / `||` chạy đúng trên Tempo 2.6.1; [`evidence/W4-2026-11-02.md`](evidence/W4-2026-11-02.md) |
| S019-13 | Màn **Ghi sổ**, **Sự kiện**, **Toàn vẹn** (dùng lại API sẵn có; link sang thao tác ghi sẵn có) | W4 | P2 | có | ✅ 2026-11-02 — `posting-log`, `documents`, `system/events`, `system/diagnostics*`; vai trò developer đọc được, phát lại → 403 |
| S019-14 | Màn **Kịch bản** đọc Sổ tay; mỗi TH có nút mở màn với bộ lọc điền sẵn — ca T019-5 | W4 | P2 | có | ✅ 2026-11-02 — `KICH_BAN` ở `@ketoan/contracts`; ca T019-5 đạt |
| S019-15 | Chế độ **Vận hành** (chỉ bản cài một đơn vị + `DEVTOOLS_OPS=true` + `owner` — Q019-2): `ops.health` (PromQL cố định), `ops.alerts`, link sâu 9 dashboard + Explore | W5 | P3 | chưa | ☐ |
| S019-16 | Check **SC-DEV-1** + ca tự kiểm | W5 | P2 | chưa | ☐ |
| S019-17 | Cập nhật OBSERVABILITY.md (mục Bàn điều tra), Sổ tay (cột "Trên Bàn điều tra"), `docs/huong-dan/` (hướng dẫn trong app cho phân hệ `dev`) | W1–W5 | P1 | — | ☐ theo từng đợt |

## Ca bằng chứng

| Ca | Chứng minh | Lưu ở |
|---|---|---|
| T019-1 | thông báo lỗi có đủ hai mã; nội dung Báo lỗi không có dữ liệu | [`evidence/W1-2026-11-01.md`](evidence/W1-2026-11-01.md) — ✅ |
| T019-2 | chéo đơn vị → 404 giống "không có" | [`evidence/W2-2026-11-01.md`](evidence/W2-2026-11-01.md) — ✅ |
| T019-3 | nguồn tắt / không trả lời → "chưa bật", không 500 | [`evidence/W2-2026-11-01.md`](evidence/W2-2026-11-01.md) — ✅ |
| T019-4 | mã của TH-01 → tóm tắt đúng chỗ hỏng, ≤ 3 lần bấm (chạy thật với Tempo) | [`evidence/W3-2026-11-01.md`](evidence/W3-2026-11-01.md) — ✅ chạy thật với Tempo 2.6.1, 1 lần bấm |
| T019-5 | kịch bản mở đúng màn, bộ lọc điền sẵn | [`evidence/W4-2026-11-02.md`](evidence/W4-2026-11-02.md) — ✅ `apps/api/test/kich-ban.test.ts` |
| T019-6 | tham số chèn bị chặn | [`evidence/W2-2026-11-01.md`](evidence/W2-2026-11-01.md) — ✅ |
| T019-7 | không trường ngoài danh sách cho phép | [`evidence/W2-2026-11-01.md`](evidence/W2-2026-11-01.md) — ✅ phần W2 (trace, log, bằng chứng); W4: `module-errors` không lộ đơn vị / trường ngoài danh sách ([`evidence/W4-2026-11-02.md`](evidence/W4-2026-11-02.md)) |
| T019-8 | không quyền → không thấy, API 403 | [`evidence/W2-2026-11-01.md`](evidence/W2-2026-11-01.md) — ✅ |

## Log

| Ngày | Ai | Việc |
|---|---|---|
| 2026-11-01 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | mở phase: sổ tay điều tra lỗi (S019-1), hiện trạng (S019-2), kiến trúc (S019-3), bản mẫu (S019-4). Nhánh `docs/phase-019-ban-dieu-tra` |
| 2026-11-01 | Johnny Chu – Chu Hoàng Anh (chủ duyệt) | D019-1 không nhúng Grafana ✅; Q019-1 = (b) thêm vai trò `developer` ✅; Q019-2 = Vận hành chỉ bản cài một đơn vị qua `DEVTOOLS_OPS=true` ✅. Gỡ ⛔ ở S019-7, S019-15 |
| 2026-11-01 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | W1: khay Mã tra cứu (S019-5), Báo lỗi chép nội dung (S019-6), ca T019-1 đạt. Nhánh `feat/phase-019-w1-ma-tra-cuu` |
| 2026-11-01 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | W2: vai trò `developer` + `devtools:read` (S019-7), biến `DEVTOOLS_*` + `BUG_REPORT_URL` (S019-8), API trung gian status / trace / request / evidence (S019-9); ca T019-2, -3, -6, -7, -8 đạt. Nhánh `feat/phase-019-w2-api-trung-gian` |
| 2026-11-01 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | W3: phân hệ web `dev` (Tổng quan, Tra mã, Nhật ký — S019-10), API `logs` / `traces` / `summary` (S019-11); ca T019-4 chạy thật đạt; sửa `ping` (`/ready` 503 từng lúc) và câu kết luận Tổng quan (lệch log / trace). Nhánh `feat/phase-019-w3-ban-dieu-tra-web` |
| 2026-11-02 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | W4: Lỗi theo module (S019-12), Ghi sổ / Sự kiện / Toàn vẹn (S019-13), Kịch bản (S019-14); ca T019-5 đạt. Sửa lỗi W3 đo trên Tempo thật: khung 7 ngày thành 168 giờ 1 giây → Tempo 400. Nhánh `feat/phase-019-w4-ban-dieu-tra-man-con` |
