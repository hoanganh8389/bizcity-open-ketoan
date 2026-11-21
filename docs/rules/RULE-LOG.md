# RULE · Ghi log lỗi — minh bạch, không im lặng, không lộ dữ liệu (R-LOG)
<!-- [2026-11-21 04:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — khởi tạo luật R-LOG: ghi log lỗi hệ thống, lập trình, tác vụ nền, phụ thuộc ngoài, khởi động, cổng vào, giao diện; nhật ký lỗi cố định logs/ ≤ 200 MB (D038-1..6, D038-2b chủ dự án duyệt 2026-11-21) -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework. **Luật do Johnny Chu – Chu Hoàng Anh khởi tạo 2026-11-21.**
> **Cấp:** Tier 0 (R-LOG-1..4) · Tier 1 (R-LOG-5..9) · Tier 2 (R-LOG-10..11) · **Trạng thái:** **Chấp nhận 2026-11-21**. Thi hành từng bước theo [PHASE-038](../phases/PHASE-038-NHAT-KY-LOI-CO-DINH/README.md): luật áp **ngay** cho mã mới; bộ kiểm SC-LOG-1..3 sẽ có ở bước B5, trước đó người rà và agent nhắc.
> **Nghiên cứu, lý do từng luật:** [PHASE-038 · 10](../phases/PHASE-038-NHAT-KY-LOI-CO-DINH/10-NGHIEN-CUU-GHI-LOG.md).
> **Luật liên quan:** [R-ERR](../contracts/BIZCITY-ERRORS-v1.md) (lỗi **trả ra ngoài**: mã, thông báo, `requestId`) · R-OBS trong [OBSERVABILITY](../ops/OBSERVABILITY.md) (log, trace, số đo) · [R-SEC](RULE-SECURITY.md) / [R-TEN](RULE-TENANT-SECURITY.md) (không lộ dữ liệu) · STD-EVD-4 (không ghi nhật ký **nghiệp vụ** ra tệp).

## Nguyên tắc một câu

> **Lỗi nào cũng phải để lại một dòng đọc được: cái gì hỏng, ở đâu, bản nào, trong việc gì, vì sao, làm gì tiếp — và không dòng nào chứa dữ liệu của người dùng.**

R-ERR nói *trả gì cho bên gọi*. R-LOG nói *ghi gì cho người sửa*. Hai luật không thay nhau.

## Tám loại lỗi, chọn mức thế nào

| Loại | Ví dụ | Mức |
|---|---|---|
| Nghiệp vụ / người dùng (4xx, finding) | thiếu định khoản, kỳ đã khoá, trùng mã | `info`. **Không phải lỗi hệ thống** |
| Hạ tầng | mất kết nối CSDL, đĩa đầy, pool cạn | `error` |
| Lập trình (bug) | `TypeError`, `undefined`, bất biến vỡ | `error` |
| Tác vụ nền | subscriber, đồng hồ, outbox, chẩn đoán đêm | `error`; hết lượt thử → `error` + `eventId` |
| Phụ thuộc ngoài | tra MST, AI đọc hoá đơn, WP SSO | `warn` nếu đã lùi được, `error` nếu không |
| Khởi động / dừng | còn migration chưa áp, `.env` sai | `fatal`, ghi đồng bộ |
| Cổng vào | api chết → nginx 502/503/504 | log nginx `logs/web-loi.log` |
| Giao diện | lỗi render, promise không bắt ở trình duyệt | gửi về máy chủ → `logs/web-client.log` |

`fatal` = tiến trình sắp chết · `error` = hỏng, không tự hồi phục, cần người sửa · `warn` = hỏng nhưng đã lùi / thử lại được · `info` = bình thường, kể cả người dùng nhập sai.

## Luật

| Mã | Cấp | Luật | Thể hiện khi làm việc | Kiểm bằng |
|---|---|---|---|---|
| **R-LOG-1** | 0 | **Một đường ghi lỗi.** Lỗi mức `error` / `fatal` ghi qua logger của Platform (`req.log`, `app.log`, logger con của tác vụ) với **đối tượng lỗi** trong trường `err`. Từ B1b, dùng `logError(log, err, ctx)`: chuẩn hoá `err` (loại, stack, chuỗi `cause`, mã PG), thêm `errFp`, `evt` | Viết `log.error({ err }, 'câu tiếng Việt')`. **Cấm** `err: String(err)`, `err: e.message` (mất stack), `console.error` trong mã chạy của API (ngoài `cli/`, điểm vào khởi động) | review; SC-LOG-1 (sẽ có, B5) |
| **R-LOG-2** | 0 | **Không nuốt lỗi im lặng.** `catch {}` / `.catch(() => undefined)` chỉ khi có chú thích `// nuot-loi: <lý do>` (dọn dẹp lúc dừng, việc phụ không ảnh hưởng kết quả). Mọi chỗ khác ít nhất ghi `warn` | Bắt lỗi để chạy tiếp thì ghi `log.warn({ err }, '…, đã lùi về …')`. Tra cứu tiền / số lượng không tìm thấy thì **báo lỗi**, không trả mặc định (R-REV-13) | review; SC-LOG-2 (sẽ có, B5) |
| **R-LOG-3** | 0 | **Tiến trình không chết câm.** API và job có bộ bắt `uncaughtException` / `unhandledRejection`: ghi `fatal` **đồng bộ** rồi thoát mã ≠ 0 để Docker khởi động lại. Không "nuốt rồi chạy tiếp". Lỗi khởi động ghi `evt: bizcity.system.start_failed` + `reason` + `hint` | Điểm vào mới (job, worker, CLI chạy lâu) gọi `installProcessHandlers()` trước mọi import khác; phần còn lại nạp động | logger của Platform `core/logger.ts` (B1, chờ merge); review |
| **R-LOG-4** | 0 | **Không lộ dữ liệu.** Log không chứa: mật khẩu, token, khoá API, cookie, thân yêu cầu / payload chứng từ, tên / SĐT / email / MST cá nhân, số tài khoản ngân hàng, số tiền gắn với người. Chỉ mã nội bộ (`tenant`, `actor`, `docKey`). Từ B1b có lưới an toàn `redact` của pino, một danh sách dùng chung | Ghi **mã** và **định danh**, không ghi **giá trị**. Cần biết dữ liệu gì sai → ghi tên trường (`field`), không ghi nội dung | review; test `redact` (sẽ có, B1b); R-SEC-10 |
| **R-LOG-5** | 1 | Mỗi dòng có `service`, `version`, `commit` (`BIZCITY_GIT_SHA`). Gửi log về là biết lỗi thuộc bản nào | Logger của Platform tự gắn — không tự tạo logger pino riêng | logger của Platform `core/logger.ts` (B1, chờ merge) |
| **R-LOG-6** | 1 | Tác vụ nền ghi qua logger con có `job`, `fn`, `attempt` và `traceId` của sự kiện gốc; hết lượt thử là `error` có `eventId` | Subscriber / đồng hồ / outbox mới: `const log = parent.child({ job, fn })`, không dùng `console` | review; test events (sẽ có, B1b) |
| **R-LOG-7** | 1 | **Chọn mức theo bảng trên.** Lỗi người dùng (4xx) không ở mức `error`; phụ thuộc ngoài đã lùi được là `warn` | Hỏi: "có người phải sửa mã / hạ tầng không?" — có mới là `error` | review |
| **R-LOG-8** | 1 | Stack trỏ về mã nguồn `.ts`: ảnh API chạy Node `--enable-source-maps`, giữ tệp `.map` | Không bỏ `sourceMap` trong tsconfig; không xoá `.map` khỏi ảnh | `docker/api.Dockerfile` (B1); SC-LOG-3 (sẽ có, B5) |
| **R-LOG-9** | 1 | **Nhật ký lỗi cố định của bản cài:** thư mục `logs/` (`LOG_HOST_DIR`, mặc định `./logs`), tổng ≤ 200 MB, xoay vòng; mọi dịch vụ Docker khai `logging:` có trần. Chỉ `core/logger.ts` được ghi tệp này (ngoại lệ hẹp STD-EVD-4: lỗi kỹ thuật, không phải nhật ký nghiệp vụ) | Không tự `appendFile` ra tệp log riêng; cần ghi lỗi → dùng logger | `docker-compose.yml` (B1); SC-EVD-1; SC-OBS-3 (sẽ có, B5) |
| **R-LOG-10** | 2 | Giao diện có ErrorBoundary theo màn, `window.onerror`, `unhandledrejection`; gửi về máy chủ loại lỗi, khung stack, màn, bản dựng, `errFp` — **không** dữ liệu nhập; tối đa 10 lỗi / phút / phiên. Màn lỗi hiện **mã tra cứu**, không màn trắng | Màn mới đặt trong khung có ErrorBoundary; không bắt lỗi rồi im | test web (sẽ có, B4b) |
| **R-LOG-11** | 2 | `msg` là câu tiếng Việt ngắn cho người đọc; `evt` (`bizcity.<miền>.<việc>`) cho máy lọc. Giá trị người dùng gửi **không** ghép vào `msg` — đưa vào trường riêng (chống chèn log) | `log.warn({ evt: 'bizcity.kho.lot_missing', field: 'lotNo' }, 'Thiếu số lô')` | review |

## Cấm trong mã → thay bằng

| Cấm | Thay bằng |
|---|---|
| `catch (e) {}` · `.catch(() => undefined)` không chú thích | `log.warn({ err: e }, '…')` hoặc chú thích `// nuot-loi: <lý do>` |
| `log.error({ err: String(err) }, …)` · `{ error: e.message }` | `log.error({ err }, …)` (giữ stack, `cause`) |
| `console.log` / `console.error` trong route, service, subscriber | `req.log` / `app.log` / logger con |
| `log.info({ body: req.body })` · ghi payload, MST, SĐT, số tài khoản | ghi `docKey`, tên trường lỗi |
| `log.error(…)` cho lỗi nhập liệu của người dùng | `info` (đã có `errCode` trong dòng "xong yêu cầu") |
| `appendFile('./my.log', …)` | logger của Platform (R-LOG-9) |
| `throw new Error('…: ' + err.message)` (mất lỗi gốc) | `throw new Error('…', { cause: err })` |

## Nhắc người đóng góp (cho người rà và agent AI)

Framework đã có luật ghi log lỗi **R-LOG**, do **Johnny Chu – Chu Hoàng Anh khởi tạo ngày 2026-11-21** (PHASE-038). Người đóng góp phân hệ, giao diện, add-in — Nguyễn Văn Thủy, Võ Hoàng, kiennt, khanhtd và mọi người khác — có thể chưa biết luật này. Khi rà PR hoặc khi chính agent viết mã có `catch`, `log.*`, `console.*`, tác vụ nền, gọi dịch vụ ngoài, điểm vào mới:

1. **Nhắc một lần, ngắn, kèm mã luật:** "Framework có luật R-LOG (Johnny Chu init 2026-11-21) — dòng này vi phạm R-LOG-2: …, sửa thành …". Dẫn tới tệp này.
2. **R-LOG-1..4 là chặn** (Tier 0) trong rà soát: nuốt lỗi im lặng, mất stack, lộ dữ liệu, tiến trình chết câm. R-LOG-5..11 là cảnh báo, ghi việc.
3. **Không sửa hộ trong im lặng.** Chỉ chỗ sai, đưa cách sửa và tệp mẫu (`core/logger.ts` của Platform, `packages/platform/src/core/http.ts`).
4. Mã cũ chưa theo luật: **không** bắt sửa trong PR không liên quan; ghi vào danh sách nợ của PHASE-038 (S038-14).

## Lịch sử

- **2026-11-21** — khởi tạo (Johnny Chu – Chu Hoàng Anh), PHASE-038 W0 chốt. Có mã: R-LOG-3, -5, -8, -9 (B1, chờ merge). Còn lại theo bước B1b, B4b, B5.
