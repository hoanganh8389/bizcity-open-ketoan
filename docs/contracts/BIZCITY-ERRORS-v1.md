# `bizcity_errors@1` — Mã lỗi, thông báo, gợi ý

> **Phiên bản:** 1.0.0 · 2026-10-30 · **Trạng thái:** Chấp nhận · **Thuộc:** Platform (`packages/actions`)
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
| `DB_REFERENCE_MISSING` | `VALIDATION_ERROR` | Tham chiếu tới mã chưa khai báo |

Module thêm mã chi tiết của mình ở mục này (tiền tố = key module viết hoa, `-` → `_`, vd `HOP_DONG_INSTALLMENT_ALREADY_PAID`).

## 5. Ánh xạ lỗi CSDL (R-ERR-8)

| SQLSTATE | Nguồn | `code` (HTTP) | `reason` | `message` |
|---|---|---|---|---|
| `23505` | khoá duy nhất | `CONFLICT` (409) | `DB_UNIQUE_VIOLATION` | Dữ liệu bị trùng (mã đã tồn tại) |
| `23503` + `update or delete` | khoá ngoại khi xoá | `CONFLICT` (409) | `DB_IN_USE` | Mã đang được dùng ở dữ liệu khác nên không xoá được |
| `23503` | khoá ngoại khi thêm | `VALIDATION_ERROR` (422) | `DB_REFERENCE_MISSING` | Tham chiếu tới mã chưa khai báo trong danh mục |
| `23514`, `42501` | CHECK, quyền | `POSTING_FAILED` (422) | — | câu của ràng buộc |
| `P0001` + "không cân" | trigger `assert_entry_balanced` | `UNBALANCED_ENTRY` (422) | — | câu của trigger |
| `P0001` khác | trigger bảo vệ (`forbid_*`: sổ chỉ thêm, bằng chứng chỉ thêm…) | `CONFLICT` (409) | `LEDGER_APPEND_ONLY` | câu của trigger (tiếng Việt) |
| khác | — | `INTERNAL_ERROR` (500) | — | Lỗi hệ thống (chi tiết chỉ ở log) |

## 6. Giao diện và bên tích hợp xử lý theo mã

| `code` | Giao diện | Hệ thống tích hợp (POS, WooCommerce…) | Cell / AI |
|---|---|---|---|
| `UNAUTHORIZED` | về màn đăng nhập | dừng, báo quản trị khoá | báo người dùng kết nối lại |
| `VALIDATION_ERROR` | đánh dấu trường theo `details` | ghi lỗi, **không** gửi lại y nguyên | đọc `hint`, hỏi lại người dùng |
| `PERIOD_LOCKED`, `POSTING_FAILED` | hiện `message` + nút tới ACC14 / kỳ | chứng từ đã lưu, chờ kế toán; không gửi lại | báo người dùng, không tự thử lại |
| `CONFLICT` | tải lại dữ liệu | đọc lại phiên bản, tăng `version` | đọc lại rồi đề xuất lại |
| `RATE_LIMITED`, `NOT_READY`, `INTERNAL_ERROR` | thông báo, nút "thử lại" | thử lại có giãn nhịp, giữ `Idempotency-Key` | thử lại một lần, rồi báo |

## 7. Changelog

- 1.0.0 (2026-10-30): khởi tạo. Có 14 mã HTTP và 2 mã MCP. Thêm `error.requestId`, `details.reason`, ánh xạ `P0001`.
