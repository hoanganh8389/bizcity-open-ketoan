<!-- [2026-11-09 10:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — 1.5.0-draft: reason VERSION_CONTENT_MISMATCH (RV-R1-08) -->
# `bizcity_errors@1` — Mã lỗi, thông báo, gợi ý
<!-- [2026-11-03 08:05 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — sửa tham chiếu đường dẫn lỗi thời sau khi tách Kernel / Platform (mã đã dời; gói đích chưa tách ghi rõ "chưa tách") -->
<!-- [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp. -->
<!-- [2026-11-01 04:13 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi (PHASE-018 W5): span ở khớp nối Platform + cổng Kernel, lọc thuộc tính, traceparent qua outbox -->
<!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — 1.2.0-draft: trường tuỳ chọn error.intake (bể chờ) -->

> **Phiên bản:** 1.0.0 · 2026-10-30 · **Trạng thái:** Chấp nhận · **Thuộc:** Platform (`packages/platform/src/core/errors.ts`; gói đích `packages/actions`, lộ trình 2.5)
> **Nguồn máy đọc (duy nhất):** [`packages/contracts/src/errors.ts`](../../packages/contracts/src/errors.ts) (`ERROR_CATALOG`).
> - Bảng §3 phải khớp nguồn này; check **SC-ERR-1** chặn khi lệch.
> - API dùng nó cho thông báo mặc định, MCP dùng cho `hint`, giao diện dùng cho cách xử lý.
>
> **Liên quan:** [BIZCITY-API-v1 §3](BIZCITY-API-v1.md) (khuôn phản hồi), [BIZCITY-ACTION-v1 §7](BIZCITY-ACTION-v1.md), [BIZCITY-MCP-v1 §2](BIZCITY-MCP-v1.md) (phong bì lỗi công cụ), [OBSERVABILITY](../ops/OBSERVABILITY.md) (log, `requestId`)

## 1. Khuôn lỗi

```json
{ "ok": false,
  "error": { "code": "PERIOD_LOCKED", "message": "Kỳ 10/2026 đã khoá …", "requestId": "req-1a2b",
             "details": { "reason": "LEDGER_DIAGNOSTICS_FAILED", "…": "…" } } }
```

| Trường | Ý nghĩa | Ai dựa vào |
|---|---|---|
| `code` | Mã **đóng**, ổn định, thuộc bảng §3. HTTP status đi theo mã | Code bên gọi (rẽ nhánh), MCP, bảng điểm, cảnh báo |
| `message` | Câu tiếng Việt cho **người dùng cuối**: sai gì, làm gì tiếp | Màn hình, Cell đọc cho người dùng |
| `requestId` | Mã yêu cầu, trùng `reqId` trong log và `request_id` trong bằng chứng | Báo lỗi, tra log (OBSERVABILITY §3) |
| `traceId` *(tuỳ chọn, 1.1.0-draft)* | Mã trace OpenTelemetry (32 hex), trùng `traceId` trong log và `trace_id` trong bằng chứng. Chỉ có khi truy vết bật ([ADR-0010](../adr/ADR-0010-opentelemetry-tu-loi.md)). Bên gọi **không** được bắt buộc có trường này | Ops mở trace trong Tempo (OBSERVABILITY §1.1) |
| `intake` *(tuỳ chọn, 1.2.0-draft)* | Cửa nạp chứng từ từ chối và đã giữ ở bể chờ: `{ id, attempt, score, findings, url }` ([BIZCITY-INTAKE-FINDINGS-v1 §5](BIZCITY-INTAKE-FINDINGS-v1.md)). Chỉ có ở `VALIDATION_ERROR` / `CONFLICT` của cửa nạp | Màn Trạm kiểm tra, bên tích hợp mở mục bể |
| `details` | Máy đọc: `reason` (mã chi tiết §4), danh sách trường sai, `checks`, `diagnostics`… | Code bên gọi, giao diện hiện chi tiết |

MCP bọc lỗi thành `{ success: false, code, message, hint, help_code, error: { code, retryable, details } }`. `hint` và `retryable` lấy từ bảng §3.

## 2. Luật

| Mã | Cấp | Luật | Kiểm bằng |
|---|---|---|---|
| **R-ERR-1** *(T0)* | 0 | `code` chỉ lấy từ `ERROR_CATALOG`. Thêm mã là thay đổi **minor**: thêm vào catalog, bảng §3, `bizcity-standard.json#errorCodes`, `ERROR_CODES` trong cùng PR. Đổi nghĩa hoặc đổi HTTP của mã đã phát hành là **major** | SC-ERR-1, SC-CON-6 |
| **R-ERR-2** | 0 | Code server tạo lỗi bằng `Errors.*` (`apps/api/src/core/errors.ts`), không `reply.status(...).send({ ok: false … })` tay. Module dùng `Errors` của SDK | R-API, SC-API-* |
| **R-ERR-3** | 1 | `message`:<br>- tiếng Việt có dấu, ≤ 200 ký tự, nói **cái gì sai và làm gì tiếp**;<br>- **không** chứa SQL, tên bảng, stack, đường dẫn tệp, bí mật, số tài khoản ngân hàng, dữ liệu cá nhân (R-SEC-10). | review; SC-ERR-1 kiểm catalog |
| **R-ERR-4** | 1 | Lỗi 5xx: `message` chung ("Lỗi hệ thống"), chi tiết chỉ vào log mức `error` kèm `reqId`, `err.stack`. Không bao giờ trả lỗi gốc của thư viện / CSDL ra ngoài | `core/http.ts` |
| **R-ERR-5** | 1 | Mọi phản hồi lỗi có `error.requestId` | `core/http.ts`; test |
| **R-ERR-6** | 1 | `details.reason`: mã chi tiết `UPPER_SNAKE`, **tiền tố = chủ** (`LEDGER_`, `PERIOD_`, `MCP_`, `<MODULE>_`), khai ở §4, không đổi nghĩa sau khi phát hành. Bên gọi rẽ nhánh theo `code` trước, `reason` sau | SC-ERR-1 (tiền tố) |
| **R-ERR-7** | 1 | Thử lại:<br>- **chỉ** mã có `retryable = true`, có giãn nhịp (1 s, 2 s, 4 s…, tối đa 5 lần);<br>- lệnh ghi thử lại phải giữ nguyên `Idempotency-Key`;<br>- `RATE_LIMITED` theo `Retry-After`. | tài liệu tích hợp |
| **R-ERR-8** | 1 | Lỗi CSDL ánh xạ cố định (§5). Trigger bảo vệ sổ ném lỗi bằng câu tiếng Việt: câu đó là `message`, không thành 500 | `core/http.ts`; test |
| **R-ERR-9** | 2 | Mỗi mã có số đo `bizcity_http_errors_total{code}` và log `errCode` (OBSERVABILITY). Cảnh báo dựa trên mã, không dựa trên câu chữ | `/metrics` |
| **R-ERR-10** | 2 | Tiếng Anh (`message_en`) là tuỳ chọn, cho tích hợp ngoài; tiếng Việt luôn có | catalog |
| **R-ERR-11** | 1 | Mọi `reason` viết bằng chữ trong mã (`reason: '…'`) có trong `ERROR_REASONS` và bảng §4 / §4c <!-- [2026-11-09 10:42 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-21 --> | SC-ERR-2 |

## 3. Bảng mã lỗi

| `code` | HTTP | Nhóm | Thử lại | Chủ | Thông báo mặc định | Gợi ý (hint) |
|---|---|---|---|---|---|---|
| `VALIDATION_ERROR` | 400 | input | không | core | Dữ liệu gửi lên không hợp lệ | Sửa các trường nêu trong error.details rồi gửi lại; gửi y nguyên sẽ bị từ chối tiếp. |
| `UNAUTHORIZED` | 401 | auth | không | core | Chưa đăng nhập hoặc phiên đã hết hạn | Đăng nhập lại, hoặc kiểm khoá API còn hiệu lực. |
| `FORBIDDEN` | 403 | auth | không | core | Bạn không có quyền truy cập chức năng này | Nhờ chủ đơn vị cấp quyền, hoặc dùng khoá API có phạm vi phù hợp. |
| `NOT_FOUND` | 404 | input | không | core | Không tìm thấy dữ liệu | Kiểm lại mã hoặc đường dẫn; dữ liệu có thể đã bị huỷ. |
| `CONFLICT` | 409 | state | không | core | Thao tác xung đột với trạng thái hiện tại của dữ liệu | Đọc lại dữ liệu mới nhất rồi làm lại; gửi chứng từ thì tăng version. |
| `PERIOD_LOCKED` | 409 | ledger | không | kernel | Kỳ kế toán đã khoá | Nhờ kế toán trưởng mở kỳ, hoặc chọn ngày thuộc kỳ còn mở. |
| `POSTING_FAILED` | 422 | ledger | không | kernel | Chưa định khoản được chứng từ | Kế toán bổ sung cấu hình định khoản ở ACC14 rồi định khoản lại; bên gửi không cần gửi lại. |
| `UNBALANCED_ENTRY` | 422 | ledger | không | kernel | Bút toán không cân Nợ = Có | Lỗi luật định khoản: báo nhóm Lõi kèm requestId; không tự sửa sổ. |
| `IDEMPOTENCY_CONFLICT` | 409 | input | không | platform | Idempotency-Key đã dùng cho yêu cầu có nội dung khác | Sinh khoá mới cho thao tác mới; gửi lại thì giữ nguyên cả khoá lẫn nội dung. |
| `CAPABILITY_MISSING` | 501 | platform | không | platform | Core chưa có năng lực mà module cần | Nâng cấp Core lên bản có năng lực này, hoặc tắt module (xem /system/capabilities). |
| `MODULE_DISABLED` | 403 | platform | không | platform | Phân hệ chưa bật cho đơn vị | Chủ đơn vị bật phân hệ trong cấu hình. |
| `RATE_LIMITED` | 429 | platform | có | platform | Gọi quá nhiều lần | Chờ theo header Retry-After rồi gửi lại, giãn nhịp gọi. |
| `NOT_READY` | 503 | platform | có | platform | Hệ thống chưa sẵn sàng | Chờ vận hành áp migration hoặc khôi phục CSDL rồi thử lại. |
| `INTERNAL_ERROR` | 500 | server | có | core | Lỗi hệ thống | Thử lại sau ít phút; lặp lại thì gửi requestId cho bộ phận hỗ trợ. |

**Mã của giao thức MCP** (chỉ trong kết quả công cụ, không phải HTTP — [BIZCITY-MCP-v1](BIZCITY-MCP-v1.md) STD-MCP-4):

| `code` | Thử lại | Thông báo | Gợi ý |
|---|---|---|---|
| `MCP_CONFIRM_INVALID` | không | Token xác nhận sai, hết hạn, đã dùng, hoặc không thuộc công cụ / người gọi này | Gọi lại không kèm confirm_token để xem trước và xin xác nhận lại. |
| `MCP_CONFIRM_ARGS_CHANGED` | không | Tham số khác bản đã xem trước | Gọi lại không kèm confirm_token để xem trước bản mới. |

## 4. Mã chi tiết (`details.reason`)

| `reason` | Đi với `code` | Khi nào |
|---|---|---|
| `LEDGER_DIAGNOSTICS_FAILED` | `CONFLICT` | Khoá kỳ bị chặn vì tự chẩn đoán L3 có lỗi trong kỳ (R-DIAG-4); `details.diagnostics` có `runId`, danh sách lỗi |
| `LEDGER_APPEND_ONLY` | `CONFLICT` | Trigger chặn sửa / xoá sổ cái hoặc bằng chứng (R-LEDGER-1, STD-EVD-2) |
| `DB_UNIQUE_VIOLATION` | `CONFLICT` | Trùng mã / khoá duy nhất |
| `DB_IN_USE` | `CONFLICT` | Xoá một mã còn dữ liệu khác trỏ tới |
| `VERSION_CONTENT_MISMATCH` | `CONFLICT` | Cùng `docKey` và `version` nhưng băm nội dung khác bản đã ghi sổ / chờ ghi; `details` có `docKey`, `version`, `existingHash`, `incomingHash` ([DOCUMENT §7.3](BIZCITY-DOCUMENT-v1.md)) |
| `DB_REFERENCE_MISSING` | `VALIDATION_ERROR` | Tham chiếu tới mã chưa khai báo |

## 4b. Ngữ cảnh chuẩn `details.context` và `details.remedy` (RV-R1-06, 1.4.0-draft) <!-- [2026-11-10 09:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-022 — chữ chốt R-FLOW-2 theo chủ dự án (2026-11-10) -->

**Vấn đề (review R1, RV-R1-06).** Lỗi của Kernel trả `UNBALANCED_ENTRY.details = { debit, credit }` còn `PERIOD_LOCKED` không có `details`: không mã nào nói **chứng từ nào, kỳ nào, bước nào**, cũng không chỉ **làm gì tiếp** — người và Cell phải đoán từ câu chữ.

**Quy ước (thêm, không đổi mã, HTTP hay `reason` đã phát hành — minor):**

1. `details.context` — object, mọi khoá **tuỳ chọn**, chỉ đặt khi biết, **không** chứa SQL, tên bảng, đường dẫn, dữ liệu cá nhân hay số tài khoản ngân hàng (R-ERR-3):

| Khoá | Kiểu | Ý nghĩa |
|---|---|---|
| `docKey` | chuỗi | khoá chứng từ nguồn |
| `docType` | chuỗi | loại chứng từ |
| `docNo` | chuỗi | số chứng từ |
| `eventId` | chuỗi số | sự việc kế toán (`accounting_events.id`) |
| `version` | số | phiên bản chứng từ đang xử lý |
| `entryNo` | chuỗi | số bút toán (khi lỗi nói về một bút toán đã có) |
| `period` | `YYYY-MM` | kỳ kế toán |
| `branchCode` | chuỗi | chi nhánh |
| `postingDate` | `YYYY-MM-DD` | ngày hạch toán |
| `step` | enum đóng | bước của đường ghi sổ: `intake` · `posting-rules` · `ledger-validate` · `ledger-insert` · `period-check` · `db-trigger` |

2. `details.remedy` — phương án khắc phục dạng `bizcity_remedy@1` ([`packages/contracts/src/remedy.ts`](../../packages/contracts/src/remedy.ts): `steps`, `owner`, `verify`, `stopTheLine`, `forbid`). Lấy từ bảng **`ERROR_REMEDY`** ở `packages/contracts/src/errors.ts`, khoá theo `code` hoặc `reason` (reason thắng): do mã quyết định, không do chỗ ném, để mọi nơi trả cùng một lời khuyên. Bước dẫn tới màn dùng `SCREENS` (SC-FIX-1 đối chiếu menu).

3. Mã Kernel mang `context` khi biết (kiểm bằng test):

| `code` / `reason` | `context` tối thiểu | Thêm vào `details` |
|---|---|---|
| `UNBALANCED_ENTRY` | `docKey`, `docType`, `step` | `debit`, `credit`, `difference` (giữ `debit` / `credit` cũ — tương thích) |
| `PERIOD_LOCKED` | `period`, `branchCode`, `docType`, `postingDate` | `scope`: `period` · `branch` · `doc-type` |
| `POSTING_FAILED` | `docKey`, `docType`, `step` | — |
| `LEDGER_APPEND_ONLY` | `step = db-trigger` | — |
| `LEDGER_DIAGNOSTICS_FAILED` | `period` | `diagnostics` (đã có) |

4. **Một chỗ gắn ngữ cảnh.** Nơi biết chứng từ (cửa `postDocumentIn`, `eventStore`, `unpostIn`) bọc lỗi bằng `withErrorContext(err, context)` của Platform: chỉ **bổ sung** khoá còn thiếu vào `details.context`, không đổi `code`, `message` hay `details` khác; lỗi không phải `AppError` đi qua nguyên vẹn. Hàm ánh xạ lỗi CSDL (§5) đặt `step = db-trigger` và `remedy`; `http.ts` không tự sinh ngữ cảnh.

5. **Lộ ra ngoài.** `details.context` và `details.remedy` đi nguyên ra REST (`error.details`) và MCP (`error.details`); trace giữ `errCode` như hiện nay; ghi thêm các khoá `context` vào trace là bước sau (S022-18, không thuộc đợt này). Giao diện hiện `remedy.steps` dưới `message` là bước sau (PHASE-019).

6. **Giới hạn đợt này** <!-- [2026-11-10 11:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-17: ghi rõ phần chưa làm -->: `details` dạng **mảng câu** (lỗi kiểm dữ liệu, vd "Bút toán không hợp lệ" kèm danh sách) giữ nguyên — không có `context` / `remedy`; kết quả nạp theo lô (`IngestResult.error { code, message }`, HTTP 200) chưa mang `details` — người gọi đã biết `docKey` của mình; mở rộng khuôn đó là việc riêng (cần sửa `bizcity_ledger_intake@1`).

**Kiểm bằng:** `apps/api/test/error-context.test.ts` (từng mã ở bảng trên có đủ khoá — `PERIOD_LOCKED` qua REST thật (phiếu kế toán), `UNBALANCED_ENTRY` và lỗi trigger qua bộ xử lý lỗi thật; `remedy` khớp `ERROR_REMEDY`; `withErrorContext` không ghi đè khoá có sẵn; lỗi lạ không đổi) và SC-FIX-1 (màn trong `remedy` có ở menu).

Module thêm mã chi tiết của mình ở mục này (tiền tố = key module viết hoa, `-` → `_`, vd `HOP_DONG_INSTALLMENT_ALREADY_PAID`).

## 4c. Mã chi tiết theo vùng mới (1.6.0-draft — chủ dự án duyệt 2026-11-09) <!-- [2026-11-09 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — rà soát mã lỗi sau thư viện, phân quyền, chính sách, chứng từ nhiều phiên bản -->

**Vì sao (rà soát ngày 2026-11-09).** Mã `code` vẫn đủ (14 mã, không thêm). Thiếu là ở `details.reason`: trong ≈ 780 chỗ `Errors.*` của `packages/` và `apps/api/src`, chỉ 2 chỗ mang `reason` (`LEDGER_APPEND_ONLY` và `POLICY_REVIEW_NOT_OPEN`; mã sau chưa khai ở §4). Bên gọi và khay Mã tra cứu chỉ có câu chữ để rẽ nhánh. Cụ thể:

- **Phân hệ quyền** (`packages/platform/src/core/authz/`): máy quyết định quyền đã có 12 mã quyết định `AUTHZ-*`, nhưng `scope.ts` nhét mã vào **câu thông báo** (`Errors.forbidden(\`… (${d.reasonCode})\`)`), không vào `details`. Khay Mã tra cứu không đọc được (nó chỉ nhận `reason` dạng `UPPER_SNAKE`).
- **Kho thư viện** (`core/libraries/context.ts`): mục thư viện chặn trả `VALIDATION_ERROR` với `details.code = LIB-…`, không có `reason`.
- **Chính sách** (`core/policies.ts`): bốn trường hợp `CONFLICT` / `VALIDATION_ERROR` khác nhau (bản không nối tiếp, bản đã đóng, chính sách đã ngừng, ngày áp lùi) cùng không `reason`.
- **Chứng từ / phiên bản** (`kernel/.../document.service.ts`, `voucher.service.ts`, `intake/repair.ts`): "đã có phiên bản mới hơn", "phiếu đã huỷ", "không phải phiếu nháp", "chứng từ nhận từ hệ thống khác", "mục bể chờ đã đóng" đều là `CONFLICT` trống.
- **Định khoản** (`kernel/.../posting/`): 22 chỗ `POSTING_FAILED` — thiếu luật, thiếu cấu hình lý do / tài khoản, lý do sai loại — không phân biệt được.
- **Kho / giá vốn** (`kernel/.../inventory/costing.service.ts`): chỉ có lỗi khuôn đầu vào (`VALIDATION_ERROR`). Khi có lớp giá vốn và cổng Gate C (RV-R1-17) mới cần họ `COSTING_` — chưa khai ở bản này.

**Quy ước thêm (minor, không đổi mã / HTTP / reason đã phát hành):**

1. Mã quyết định quyền `AUTHZ-X-Y` đi ra `details.reason = AUTHZ_X_Y` (đổi `-` thành `_`, 1 : 1), kèm `details.permission` và, khi có, `details.condition` (điều kiện trượt, không giá trị dữ liệu). Câu thông báo không chứa mã nữa.
2. Thư viện chặn: `details.reason = LIBRARY_BLOCKED`, giữ `details.library`, `details.code` (`LIB-…`), `details.path`.
3. **R-ERR-11:** mọi `reason` viết bằng chữ trong mã phải có trong `ERROR_REASONS` (check **SC-ERR-2**, quét `reason: '…'`). Họ mã của module dùng tiền tố key module như R-ERR-6.

| `reason` | Đi với `code` | Khi nào | Chỗ ném hiện nay |
|---|---|---|---|
| **Chứng từ, phiên bản** | | | |
| `VERSION_STALE` | `CONFLICT` | Đã có phiên bản mới hơn bản gửi lên | `document.service.ts` (kiểm `existing.version > doc.version`) |
| `VERSION_CONTENT_MISMATCH` | `CONFLICT` | (đã chốt ở §4, [DOCUMENT §7.3](BIZCITY-DOCUMENT-v1.md)) | chưa nối — S029-34 |
| `DOC_NOT_DRAFT` | `CONFLICT` | Thao tác chỉ cho phiếu nháp; phiếu đã ghi sổ / chờ huỷ | `voucher.service.ts` |
| `DOC_CANCELLED` | `CONFLICT` | Phiếu đã huỷ | `voucher.service.ts` |
| `DOC_SOURCE_READONLY` | `CONFLICT` | Chứng từ nhận từ hệ thống khác: sửa ở nguồn rồi gửi lại | `voucher.service.ts`, `intake/repair.ts` (khoá app) |
| `DOC_ALREADY_CONFIRMED` | `CONFLICT` | Đã xác nhận nhận tiền trước đó | `document.service.ts` |
| `INTAKE_ITEM_CLOSED` | `CONFLICT` | Mục bể chờ đã đóng, không sửa được | `intake/repair.ts` |
| **Sổ cái** | | | |
| `LEDGER_ALREADY_REVERSED` | `CONFLICT` | Bút toán đã đảo trước đó | `ledger.service.ts` |
| `LEDGER_NO_SOURCE_EVENT` | `POSTING_FAILED` | Bút toán không gắn sự việc gốc (không ghi / không đảo được) | `ledger.service.ts` |
| `LEDGER_HEADER_EDIT_FROM_APP` | `VALIDATION_ERROR` | Xác nhận một lần sửa đầu bút toán đã đi qua ứng dụng (không cần xác nhận) | `ledger-entry-edits.ts` |
| **Định khoản** | | | |
| `POSTING_RULE_MISSING` | `POSTING_FAILED` | Chưa có luật định khoản cho loại chứng từ | `posting.service.ts` |
| `POSTING_CONFIG_MISSING` | `POSTING_FAILED` | Thiếu lý do / tài khoản / nhóm hạch toán mặc định; `details` là danh sách thiếu | `account-resolver.ts` |
| `POSTING_REASON_KIND` | `POSTING_FAILED` | Lý do sai loại cho chứng từ (vd lý do ghi nợ dùng cho phiếu tiền) | `cash.rule.ts`, `journal.rule.ts` |
| **Phân quyền** (1 : 1 với mã quyết định `AUTHZ-*`) | | | |
| `AUTHZ_PERM_UNKNOWN` · `AUTHZ_PERM_REMOVED` · `AUTHZ_PERM_NOT_GRANTED_YET` | `FORBIDDEN` | Quyền không có trong sổ / đã bỏ / chưa duyệt cấp | `authz/engine.ts` |
| `AUTHZ_HIGH_RISK_DELEGATION` | `FORBIDDEN` | Quyền rủi ro cao, người gọi là khoá API / trợ lý | `authz/engine.ts`, `actions.ts` |
| `AUTHZ_DENIED_BY_RULE` · `AUTHZ_CONDITION` · `AUTHZ_NO_ALLOW` · `AUTHZ_NO_ASSIGNMENT` | `FORBIDDEN` | Luật cấm; điều kiện trượt; không luật cho; chưa gán vai | `authz/engine.ts` |
| `AUTHZ_SCOPE_NO_LOCATION` · `AUTHZ_SCOPE_NOT_USER` · `AUTHZ_SCOPE_TENANT` | `FORBIDDEN` | Tài nguyên không có vị trí; phạm vi chỉ cho người dùng; khác đơn vị | `authz/scope.ts` |
| `AUTHZ_USER_ONLY` | `FORBIDDEN` | Thao tác chỉ cho người đăng nhập, không qua khoá API | `auth.ts`, `ledger.routes.ts`, `ledger-entry-edits.ts`, `access.service.ts` |
| `AUTHZ_OWN_DOCUMENT_ONLY` | `FORBIDDEN` | Chỉ thao tác trên phiếu do mình lập | `auth.ts` |
| `AUTHZ_SELF_ASSIGN` · `AUTHZ_ROLE_EXCEEDS_GRANTOR` | `FORBIDDEN` | Tự gán vai cho mình; vai có quyền người gán không có | `role-assignment.service.ts` |
| `AUTHZ_LAST_OWNER` | `CONFLICT` | Phải còn ít nhất một chủ sở hữu | `access.service.ts` |
| **Thư viện** | | | |
| `LIBRARY_BLOCKED` | `VALIDATION_ERROR` | Mục thư viện chặn giá trị; `details.code = LIB-…` | `libraries/context.ts` |
| `LIBRARY_DISABLED` | `NOT_FOUND` | Đơn vị đã tắt thư viện | `libraries.routes.ts` |
| `LIBRARY_PROPOSAL_STATE` | `CONFLICT` | Phiếu đề xuất không chuyển được từ trạng thái hiện tại | `libraries/proposals.ts` |
| **Chính sách** | | | |
| `POLICY_VERSION_GAP` | `CONFLICT` | Bản không nối tiếp bản trước (có người vừa lưu) | `policies.ts` |
| `POLICY_VERSION_CLOSED` | `CONFLICT` | Bản trước đã đóng `effective_to` | `policies.ts` |
| `POLICY_RETIRED` | `CONFLICT` | Chính sách đã ngừng, dùng mã mới | `policies.ts` |
| `POLICY_BACKDATED` | `VALIDATION_ERROR` | Ngày áp sớm hơn bản trước (không viết lại quá khứ) | `policies.ts` |
| `POLICY_REVIEW_NOT_OPEN` | `CONFLICT` | Sự việc không có phát hiện chính sách cần xem (**đã dùng trong mã, chưa khai**) | `queue.routes.ts` |

**Thứ tự làm:** (1) duyệt (2026-11-09); (2) S022-21: thêm các mã vào `ERROR_REASONS` + SC-ERR-2 (một PR, chỉ hằng số và check); (3) nối từng vùng ở PR của chủ tệp — phân quyền (PHASE-028), thư viện (PHASE-030), chính sách (PHASE-031), chứng từ / sổ cái / định khoản (PHASE-029 / 004) — mỗi chỗ ném thêm `{ reason }`, không đổi `code` / HTTP / câu chữ.

## 5. Ánh xạ lỗi CSDL (R-ERR-8)

| SQLSTATE | Nguồn | `code` (HTTP) | `reason` | `message` |
|---|---|---|---|---|
| `23505` | khoá duy nhất | `CONFLICT` (409) | `DB_UNIQUE_VIOLATION` | Dữ liệu bị trùng (mã đã tồn tại) |
| `23503` + `update or delete` | khoá ngoại khi xoá | `CONFLICT` (409) | `DB_IN_USE` | Mã đang được dùng ở dữ liệu khác nên không xoá được |
| `23503` | khoá ngoại khi thêm | `VALIDATION_ERROR` (422) | `DB_REFERENCE_MISSING` | Tham chiếu tới mã chưa khai báo trong danh mục |
| `23514` + "không cân" | trigger `assert_entry_balanced` (ném `check_violation`) | `UNBALANCED_ENTRY` (422) | — | câu của trigger |
| `23514` + tiền tố `PERIOD_LOCKED:` | trigger `ledger_entries_period_lock` (ném `check_violation`) | `PERIOD_LOCKED` (409) | — | câu của trigger |
| `42501` + "chỉ được thêm" hoặc "chỉ thêm" | trigger bảo vệ sổ / bằng chứng / chứng từ chỉ thêm (ném `insufficient_privilege`) | `CONFLICT` (409) | `LEDGER_APPEND_ONLY` | câu của trigger (tiếng Việt) |
| `23514`, `42501` còn lại | CHECK, quyền | `POSTING_FAILED` (422) | — | câu của ràng buộc |
| `P0001` + "không cân" | trigger ném `P0001` mà câu có "không cân" | `UNBALANCED_ENTRY` (422) | — | câu của trigger |
| `P0001` khác | trigger bảo vệ (`forbid_*`: sổ chỉ thêm, bằng chứng chỉ thêm…) | `CONFLICT` (409) | `LEDGER_APPEND_ONLY` | câu của trigger (tiếng Việt) |
| khác | — | `INTERNAL_ERROR` (500) | — | Lỗi hệ thống (chi tiết chỉ ở log) |

Quy tắc đọc bảng §5 (chữ chốt S029-33, 1.3.0-draft):

- Xét theo thứ tự từ trên xuống; dòng cụ thể thắng dòng chung. **Trigger của sổ cái ném `check_violation` (`23514`) và `insufficient_privilege` (`42501`)**, không ném `P0001`; vì vậy điều kiện nhận ra trigger nằm ở **câu chữ** của nó. Câu chữ đó là một phần của hợp đồng: đổi câu của `assert_entry_balanced`, `ledger_entries_period_lock` hay các trigger chỉ thêm thì phải đổi bảng này cùng PR (R-REL-3).
- Một nơi duy nhất quyết định (hàm dùng chung của Platform), cả `core/http.ts` lẫn `errorCodeOf` (trace) gọi nó, để lỗi trả cho người gọi và lỗi ghi vào trace luôn cùng mã.
- Test dùng **SQLSTATE thật** của trigger (`23514` / `42501`), không dùng `P0001` giả.

## 6. Giao diện và bên tích hợp xử lý theo mã

| `code` | Giao diện | Hệ thống tích hợp (POS, WooCommerce…) | Cell / AI |
|---|---|---|---|
| `UNAUTHORIZED` | về màn đăng nhập | dừng, báo quản trị khoá | báo người dùng kết nối lại |
| `VALIDATION_ERROR` | đánh dấu trường theo `details` | ghi lỗi, **không** gửi lại y nguyên | đọc `hint`, hỏi lại người dùng |
| `PERIOD_LOCKED`, `POSTING_FAILED` | hiện `message` + nút tới ACC14 / kỳ | chứng từ đã lưu, chờ kế toán; không gửi lại | báo người dùng, không tự thử lại |
| `CONFLICT` | tải lại dữ liệu | đọc lại phiên bản, tăng `version` | đọc lại rồi đề xuất lại |
| `RATE_LIMITED`, `NOT_READY`, `INTERNAL_ERROR` | thông báo, nút "thử lại" | thử lại có giãn nhịp, giữ `Idempotency-Key` | thử lại một lần, rồi báo |

## 7. Changelog

- **1.6.0-draft (2026-11-09):** §4c — mã chi tiết theo vùng (chứng từ / phiên bản, sổ cái, định khoản, phân quyền, thư viện, chính sách), R-ERR-11 / SC-ERR-2; chủ dự án duyệt 2026-11-09. Hằng số + SC-ERR-2 ở S022-21; nối từng chỗ ném ở PR của chủ tệp. Không thêm `code`.
- **1.5.0-draft (2026-11-09, PHASE-029 S029-34):** thêm `details.reason` `VERSION_CONTENT_MISMATCH` (`CONFLICT` 409) cho cùng phiên bản khác nội dung ([DOCUMENT §7.3](BIZCITY-DOCUMENT-v1.md)). Không thêm mã `code`. **Ảnh hưởng:** bên gửi nào gửi lại cùng `version` với nội dung đổi sẽ nhận 409 thay vì bị ghi đè im lặng; xử lý theo cột "CONFLICT" ở §6 (tăng `version`).
<!-- [2026-11-10 09:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-022 — RV-R1-06 -->
- **1.4.0-draft (2026-11-10, RV-R1-06):** thêm `details.context` (khoá tuỳ chọn: `docKey`, `docType`, `docNo`, `eventId`, `version`, `entryNo`, `period`, `branchCode`, `postingDate`, `step`) và `details.remedy` (`bizcity_remedy@1`, bảng `ERROR_REMEDY`); `UNBALANCED_ENTRY` thêm `difference`, `PERIOD_LOCKED` thêm `scope`. Không đổi mã, HTTP, `reason` đã phát hành.

- 1.0.0 (2026-10-30): khởi tạo. Có 14 mã HTTP và 2 mã MCP. Thêm `error.requestId`, `details.reason`, ánh xạ `P0001`.
<!-- [2026-11-02 11:50 PM Johnny Chu - Chu Hoàng Anh] R-ERR — details lỗi sai khuôn thống nhất mảng câu -->
- **1.2.1-draft (2026-11-02):** `details` của `VALIDATION_ERROR` do sai khuôn luôn là **mảng câu** (`<trường>: <vì sao>`), như lỗi kiểm của route. Năm chỗ trước trả object `flatten()` của zod (nộp chứng từ trong giao dịch, gói định khoản, phiếu nháp, phân hệ mua hàng) — giao diện không hiện được trường sai. Không đổi mã, HTTP.
- **1.2.0-draft (2026-11-02, ADR-0014):** thêm trường tuỳ chọn `error.intake` cho lỗi cửa nạp chứng từ (bể chờ). Không đổi mã, HTTP, `details`.
- **1.1.0-draft (2026-11-01, ADR-0010):** thêm trường tuỳ chọn `error.traceId` (tương thích: bên gọi cũ bỏ qua được). Không đổi mã, HTTP, nghĩa.
<!-- [2026-11-08 01:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-33: chữ chốt ánh xạ SQLSTATE của trigger sổ cái (review R1, RV-R1-02) -->
- **1.3.0-draft (2026-11-08, PHASE-029 S029-33):** §5 tách ba dòng cụ thể khỏi dòng chung `23514` / `42501`: `23514` + "không cân" → `UNBALANCED_ENTRY` (422); `23514` + `PERIOD_LOCKED:` → `PERIOD_LOCKED` (409); `42501` + "chỉ được thêm" / "chỉ thêm" → `CONFLICT` (409) + `LEDGER_APPEND_ONLY`. Dòng cũ `P0001` + "không cân" giữ. **Thực tế trước đây:** các trigger sổ cái ném `23514` / `42501` nên mọi lỗi cân, khoá kỳ, sửa sổ ở tầng CSDL đều ra `POSTING_FAILED` (422), trái ý các dòng trigger đã ghi ở bản 1.0.0 (chúng viết điều kiện `P0001` trong khi trigger không dùng `P0001`). **Ảnh hưởng:** bên gọi rẽ nhánh theo `code` sẽ thấy `PERIOD_LOCKED` / `CONFLICT` / `UNBALANCED_ENTRY` thay cho `POSTING_FAILED` ở ba trường hợp này (HTTP 422 → 409 với hai trường hợp đầu); `POSTING_FAILED` vẫn cho CHECK / quyền khác. Không thêm mã, không thêm `reason` mới. Mã: S029-33.
