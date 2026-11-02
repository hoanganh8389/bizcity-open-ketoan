# PHASE-021 · Hiện trạng đọc mã (2026-11-02, `main` e79b75b)
<!-- [2026-11-02 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — hiện trạng: chứng từ bị từ chối đang đi đâu, kèm tệp:dòng -->

Câu hỏi: một chứng từ gửi vào mà không đạt thì hôm nay đi đâu, ai thấy, thấy gì?

## 1. Đường đi của một chứng từ

| Bước | Mã | Đạt | Không đạt |
|---|---|---|---|
| Xác thực, quyền | `packages/platform/src/core/auth.ts` (`authPlugin`, `requirePermission`) | tiếp | 401 / 403 — đúng, không cần lưu |
| Chuẩn hoá kết nối (khoá API) | `document.service.ts:478` (`prepareIncoming`) | tiếp | — |
| Kiểm khuôn (zod) | `document.service.ts:481-482` | tiếp | `400 VALIDATION_ERROR` "Chứng từ không đúng khuôn" + `zod.flatten()`; **không lưu** |
| Kiểm tổng tiền | `document.service.ts:71-80` (`assertTotals`), gọi ở `:419` | tiếp | `400 VALIDATION_ERROR` lỗi **đầu tiên** gặp; **không lưu** |
| Ghi sự việc + định khoản | `document.service.ts:418-426` (`processDocument` → `postDocumentIn`) | `posted` / `pending` | `CONFLICT`, `VALIDATION_ERROR` ném ra, **không lưu**; lỗi khác → `recordFailure` (`:435`) lưu `accounting_events.status = 'error'` |
| Nạp lô | `document.service.ts:487-499` (`ingestBatch`) | — | trả `status: 'error'` từng dòng trong phản hồi; **không lưu** dòng lỗi khuôn |

## 2. Sự thật

| # | Sự thật | Ở đâu | Hệ quả cho phase |
|---|---|---|---|
| F1 | Sai khuôn trả chi tiết là `zod.flatten()` thô (tên trường kiểu máy, câu tiếng Anh của thư viện) | `document.service.ts:482` | L1 phải dịch lỗi zod sang mã `IN-SHAPE-*` có `why` / `fix` |
| F2 | `assertTotals` ném ở lỗi đầu tiên; ba nhánh: thanh toán (phân bổ ≤ tổng), phi thương mại (Σ dòng = tổng), thương mại | `document.service.ts:71-80` | L2 tách thành hàm trả **danh sách** lỗi; cửa nạp dùng lại, ném phần tử đầu (D021-2) |
| F3 | Chỉ lỗi định khoản mới được lưu (tầng B); khuôn và xung đột phiên bản biến mất | `document.service.ts:423, 435` | bể chờ phủ đúng hai loại này + chủ chứng từ (ADR-0011 D5) |
| F4 | `accounting_events.status ∈ {pending, posted, error, cancelled}`; 0049 cấm `DELETE`, cấm đổi `doc_key` | `db/migrations/0005_goc_chung_tu.sql:68`, `0049_khoa_dau_but_toan.sql` | lý do bể là bảng riêng (ADR-0014) |
| F5 | `posting_log.action ∈ {receive, post, repost, error, cancel, cancel_request, unpost}` — không có "từ chối" | `0005_goc_chung_tu.sql:318` | lịch sử từ chối nằm ở bể, không thêm action vào `posting_log` |
| F6 | ACC14 (`/chung-tu`, `DocumentsPage`) có thẻ Chờ / Lỗi định khoản; không có chỗ cho chứng từ bị từ chối | `apps/web/src/features/documents/DocumentsPage.tsx:8, 86` | W3 thêm thẻ "Cần sửa" vào chính màn này (D021-7) |
| F7 | Danh mục lỗi `ERROR_CATALOG` có `message` + `hint` theo mã HTTP (3 mã loại `input`), không theo trường / nghiệp vụ | `packages/contracts/src/errors.ts:22` | `bizcity_intake_findings@1` là danh mục mới, chi tiết hơn; không thay `bizcity_errors@1` |
| F8 | Xem trước định khoản = ghi thật rồi huỷ đã có cho sự việc đã nhận | `document.service.ts:674` (`preview`), R-EVENT-11 | L5 dùng lại đường này cho chứng từ chưa nhận |
| F9 | `core.document.submit` có `?dryRun=1` (dựng bút toán thử) — ở PR-2, **chưa gộp** | nhánh `feat/pr2-module-sdk` | W2 phụ thuộc PR-2 |
| F10 | Bàn điều tra có màn Lỗi theo module (DEV04) — cho **nhà phát triển**, đọc trace, không theo chứng từ | `apps/web/src/phan-he/dev/loi-theo-module/LoiTheoModulePage.tsx` | không trùng: Trạm là của **kế toán**; Trạm hiện mã tra cứu để dev mở sang Bàn điều tra khi lỗi là sự cố hệ thống |
| F11 | Mã hàng có quy tắc `skuInfo`; ĐVT có bảng quy đổi | `modules/mua-hang/domain/src/ma-hang.ts:38`, `packages/contracts/src/dvt.ts` | L3 dùng lại; mã hàng / ĐVT sai là `warn` cho tới khi Kernel chặn |
| F12 | Lỗi xác thực (401) và quá hạn mức (429) xảy ra trước khi biết đơn vị chắc chắn | `core/auth.ts` | không lưu vào bể (ADR-0014 D2) |

## 3. Câu hỏi còn mở cho W1 (đọc mã khi làm, không chặn kế hoạch)

- Kernel có **chặn** ĐVT lạ, mã hàng chưa có, kho không thuộc chi nhánh không, hay tự thêm / bỏ qua? Trả lời quyết định mức `block` / `warn` của `IN-MD-*` (D021-3).
- Khoá dữ liệu theo ngày (`assertDateRules`) chạy ở cửa nạp hay chỉ ở phiếu tay? Quyết định `IN-BIZ-002` có chặn ở cửa nạp không.
