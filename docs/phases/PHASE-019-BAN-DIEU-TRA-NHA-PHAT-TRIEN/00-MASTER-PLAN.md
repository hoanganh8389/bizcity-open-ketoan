# PHASE-019 · 00 — Kế hoạch tổng
<!-- [2026-11-01 07:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — Bàn điều tra cho nhà phát triển: sổ tay điều tra lỗi theo tình huống + thiết kế UI/UX dev trên Prometheus, Loki, Tempo, Grafana, Alertmanager -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

## 1. Vì sao

PHASE-018 làm cho hệ thống **quan sát được**: 30+ số đo, 9 dashboard, 14 cảnh báo, log có cấu trúc, trace OpenTelemetry từ lõi. Nhưng tất cả nằm trong Grafana — công cụ của **vận hành**:

- Người đóng góp viết phân hệ (vd Thủy) phải dựng bộ giám sát, biết ba ngôn ngữ truy vấn, biết Grafana mới tìm được lỗi của chính code mình.
- Dev của một đơn vị (tích hợp, viết add-in riêng) **không được** vào Grafana: Grafana thấy mọi đơn vị.
- Người dùng gặp lỗi chỉ thấy "Có lỗi xảy ra" — app bỏ mất `requestId` / `traceId` mà API đã trả.

Khi cộng đồng bắt đầu vibe-code VAT, AR/AP, CRM, kho, agent AI trên cùng Core, **thời gian từ "có lỗi" đến "biết lỗi ở module nào, bước nào"** quyết định Core có giữ được chất lượng không. Phase này đưa câu trả lời đó vào app, cho đúng người, không mở thêm đường lộ dữ liệu.

## 2. Phạm vi

| Có | Không |
|---|---|
| Sổ tay điều tra lỗi theo tình huống (W0 — xong) | thay Grafana: Grafana vẫn là công cụ vận hành đầy đủ |
| Mã tra cứu trong mọi thông báo lỗi + nút báo lỗi | nhúng Grafana bằng iframe, đưa thông tin đăng nhập Grafana xuống trình duyệt |
| API trung gian chỉ đọc: trace, log, tóm tắt theo đơn vị | truy vấn tự do PromQL / LogQL / TraceQL từ người dùng đơn vị |
| Phân hệ web **Nhà phát triển**: Tổng quan, Tra mã, Nhật ký, Lỗi theo module, Ghi sổ, Sự kiện, Toàn vẹn, Kịch bản | bất cứ nút nào sửa sổ, mở khoá kỳ, tắt trigger |
| Chế độ Vận hành: sức khoẻ toàn hệ, cảnh báo, link sâu Grafana | vai trò vận hành liên đơn vị (cần ADR — Q018-6) |

## 3. Ràng buộc bất biến

1. **Chỉ đọc.** Mọi API của phase là `effect: 'read'`, `mcp: false`, `ai: 'deny'`. Thao tác ghi (phát lại sự kiện, định khoản lại) vẫn ở action sẵn có với quyền + bằng chứng sẵn có; Bàn điều tra chỉ **link** tới.
2. **Bộ lọc đơn vị do máy chủ gắn**, không bao giờ lấy từ tham số của trình duyệt (R-TEN-*).
3. **Không nhận truy vấn tự do** ở chế độ Đơn vị: chỉ mẫu truy vấn có tham số đã kiểm (Zod), giống cách `defineAction` kiểm đầu vào.
4. **Lọc trường hai lần:** dữ liệu đã lọc lúc xuất (TRACE_ATTRIBUTES, R-SEC-10 ở log); API trung gian lọc lại theo danh sách cho phép của nó trước khi trả.
5. **Tắt bộ giám sát thì Bàn điều tra vẫn chạy**, phần cần Tempo / Loki báo "chưa bật" (không lỗi 500), phần đọc CSDL (ghi sổ, sự kiện, tự chẩn đoán) vẫn đủ (ADR-0007 G-5: quan sát được là bắt buộc, công cụ quan sát là tuỳ chọn).
6. Không đụng Kernel, không đụng đường ghi sổ (K0). Không thêm phụ thuộc npm cho API trung gian (dùng `fetch` có sẵn — S8 tự có span).

## 4. Quyết định (D019-*, chủ duyệt)

| ID | Quyết định | Trạng thái |
|---|---|---|
| D019-1 | **Không nhúng Grafana.** Bàn điều tra là phân hệ web của Core, đọc qua API trung gian; Grafana chỉ xuất hiện dưới dạng **link sâu** ở chế độ Vận hành | ✅ chủ duyệt 2026-11-01 <!-- [2026-11-01 09:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — chủ duyệt D019-1, Q019-1 (b), Q019-2 (chỉ bản cài một đơn vị). --> |
| D019-2 | **Hai chế độ:** Đơn vị (mặc định, theo `tenant` của phiên) và Vận hành (sức khoẻ toàn hệ, cảnh báo, Grafana). Chế độ Vận hành bật theo Q019-2 | ✅ 2026-11-01 (theo Q019-2) |
| D019-3 | **Quyền mới `devtools:read`** (Platform, `core/auth.ts`): cấp cho `owner` và vai trò mới **`developer`** (Q019-1); không cấp cho khoá API; không cấp cho AI | ✅ 2026-11-01 (theo Q019-1) |
| D019-4 | **Mẫu truy vấn đóng:** mỗi màn một mẫu TraceQL / LogQL / PromQL có tham số; máy chủ gắn `bizcity.tenant` / `tenant`; khung thời gian ≤ 24 giờ (log), ≤ 7 ngày (trace); ≤ 200 dòng / 50 trace; giới hạn tần suất theo người | ☐ |
| D019-5 | **Trace thuộc đơn vị khi:** có ít nhất một span `bizcity.tenant` = đơn vị của phiên **và** không span nào mang đơn vị khác. Không đạt → trả **404 `NOT_FOUND`** (không 403 — không xác nhận trace tồn tại) | ☐ |
| D019-6 | **Mã tra cứu ở mọi thông báo lỗi** (`requestId`, `traceId`), có nút chép; nút "Báo lỗi" dựng nội dung theo mẫu `bao-loi.yml` **chỉ gồm mã**, không dữ liệu | ☐ |
| D019-7 | **Ngăn xếp lỗi (`err.stack`)** chỉ hiện ở chế độ Vận hành; chế độ Đơn vị chỉ thấy `err.type` + mã lỗi (thông điệp lỗi CSDL có thể chứa giá trị dữ liệu) | ☐ — xem Q019-3 |

## 5. Câu hỏi cần chủ quyết (Q019-*)

| ID | Câu hỏi | Đề xuất / Trả lời |
|---|---|---|
| Q019-1 | Ai được `devtools:read`? (a) chỉ `owner`; (b) thêm vai trò **`developer`** = `viewer` + `devtools:read` (đổi `Role` trong `@ketoan/contracts`, màn Người dùng) | ✅ **chủ chọn (b)** 2026-11-01 — vai trò `developer` chỉ xem (như `viewer`) + Bàn điều tra; không quyền ghi chứng từ |
| Q019-2 | Chế độ Vận hành bật thế nào khi chưa có vai trò vận hành liên đơn vị (Q018-6)? | ✅ **chủ chốt** 2026-11-01 — **chỉ bản cài một đơn vị**, qua `DEVTOOLS_OPS=true` (+ người dùng là `owner`). Bỏ nhánh "`envLabel` ≠ production": bản cài nhiều đơn vị **không** bật được, kể cả môi trường thử. Bản nhiều đơn vị: chờ ADR của Q018-6 |
| Q019-3 | Chế độ Đơn vị có được xem `err.stack` không? | Không (D019-7). Dev đơn vị cần thì gửi mã cho vận hành |
| Q019-4 | Đưa phase vào lộ trình (`PHASES.md`, `roadmap.json`) với mã việc mới? | Có, sau khi chủ duyệt D019-*, cùng lượt với Q018-1 |
| Q019-5 | Nút "Báo lỗi" mở thẳng GitHub issue (repo công khai) hay chỉ chép nội dung? | Chỉ **chép** nội dung (mặc định); bản cài cấu hình `BUG_REPORT_URL` thì thêm nút mở |

## 6. Sáu đợt (W0–W5) và cổng nghiệm thu

| Đợt | Việc | Ưu tiên | Cổng |
|---|---|---|---|
| **W0** | Sổ tay điều tra lỗi; kiến trúc; bản mẫu UI | P0 | chủ duyệt D019-*; bản mẫu duyệt bố cục |
| **W1** | Mã tra cứu trong thông báo lỗi (`ApiError` giữ `requestId`, `traceId`); nút chép; nút Báo lỗi | P0 | test web: lỗi 409 hiện đủ hai mã; nội dung báo lỗi không có dữ liệu chứng từ |
| **W2** | API trung gian: `devtools/status`, `traces/:traceId`, `requests/:requestId`, `evidence?traceId=`; kiểm đơn vị (D019-5); quyền `devtools:read`; giới hạn | P1 | **T019-2** chéo đơn vị trả 404; T019-3 Tempo / Loki tắt → "chưa bật", không 500; test không lộ trường |
| **W3** | Màn **Tra mã** (cây span, tóm tắt "chuyện gì đã xảy ra", log cùng trace, bằng chứng) + **Nhật ký** + **Tổng quan** | P1 | T019-4 dán mã của TH-01 ra đúng chỗ hỏng trong ≤ 3 lần bấm |
| **W4** | **Lỗi theo module**, **Ghi sổ**, **Sự kiện**, **Toàn vẹn** (dùng lại API sẵn có) + **Kịch bản** trong app (TH-01…TH-14 thành thẻ có link vào màn) | P2 | T019-5 mỗi kịch bản mở đúng màn với bộ lọc điền sẵn |
| **W5** | Chế độ **Vận hành**: sức khoẻ toàn hệ (mẫu PromQL cố định), cảnh báo đang bắn (Alertmanager), link sâu 9 dashboard + Explore; check **SC-DEV-1** | P3 | bản cài hai đơn vị + `DEVTOOLS_OPS=true` → `ops/*` vẫn 403 (Q019-2); SC-DEV-1 tự kiểm bắt vi phạm mẫu |

Thứ tự: W1 không phụ thuộc gì, làm trước (lợi ngay cho mọi người dùng). W2 trước W3–W5.

## 7. Luật thực thi của phase

- Mỗi API mới là action (`defineAction`) — có `permission`, đầu vào Zod, `mcp: false`, `ai: 'deny'`; mount ở `modules/system/devtools.routes.ts` (Platform, nhãn `@bizcity-layer P`).
- Gọi Tempo / Loki / Prometheus / Alertmanager bằng `fetch` (có span S8 sẵn), thời hạn chờ 5 giây, lỗi / quá giờ → `NOT_READY` có `details.backend`.
- Mọi lượt đọc ghi một dòng log `evt=bizcity.devtools.query` (`tenant`, `actor`, màn, thời gian) — không ghi nội dung trả về.
- Web: phân hệ `apps/web/src/phan-he/dev/` (khuôn của phân hệ `api`), dùng thành phần sẵn có của `apps/web` (chưa có gói `ui-kit` — PHASE-013; có thì chuyển); màn ẩn khi thiếu `devtools:read` (`filterMenu`).
- Màn **Kịch bản** đọc thẳng [Sổ tay](../../ops/SO-TAY-DIEU-TRA-LOI.md) bằng `import.meta.glob` như `help/guides.ts` đọc `docs/huong-dan/` — một nguồn, không chép nội dung vào mã.
- Mỗi đợt có bằng chứng `evidence/W<n>-<ngày>.md`. Đổi tài liệu cùng PR: [OBSERVABILITY.md](../../ops/OBSERVABILITY.md), [Sổ tay](../../ops/SO-TAY-DIEU-TRA-LOI.md) (cột "Trên Bàn điều tra").
