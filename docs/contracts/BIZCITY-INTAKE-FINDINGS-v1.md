# `bizcity_intake_findings@1` — Danh mục phát hiện tiền kiểm
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: hợp đồng 0.1.0-draft — danh mục mã IN-*, khuôn phát hiện, điểm (ADR-0014 D3, D11) -->
<!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W2: 0.2.0-draft — §5 bể chờ: error.intake, API /api/v1/intake, hạn giữ -->

> **Phiên bản:** 0.2.0-draft · 2026-11-02 · **Trạng thái:** Đề xuất · **Thuộc:** Kernel (cửa nạp) · **Quyết định:** [ADR-0014](../adr/ADR-0014-tram-tien-kiem-be-cho-dau-vao.md) · **Luật:** [RULE-INTAKE](../rules/RULE-INTAKE.md)
> **Mã nguồn:** `packages/contracts/src/intake-findings.ts` (danh mục), `packages/kernel/src/modules/intake/preflight.ts` (bộ tiền kiểm) · **Năng lực:** `intake.findings`

## 1. Khuôn một phát hiện

| Trường | Nghĩa |
|---|---|
| `code` | mã `IN-<NHÓM>-NNN`, ổn định; đổi nghĩa = mã mới |
| `severity` | `block` (phải sửa) · `warn` (vào sổ được; kế toán trưởng có thể cho chấp nhận có lý do) · `hint` (chỉ để học) |
| `stage` | `door` (cửa nạp từ chối, chưa thành sự việc) · `posting` (thành sự việc, chưa ghi sổ được — tầng B) · `advice` (cửa nạp vẫn nhận) |
| `layer` | L1 khuôn · L2 số học · L3 danh mục · L4 nghiệp vụ · L5 định khoản thử |
| `path` | trường, vd `lines[2].qty`; `null` = cả chứng từ |
| `got`, `expected` | đã gửi / đúng phải là |
| `title`, `why`, `fix`, `ref` | tên, vì sao kế toán cần, sửa ở nguồn thế nào, căn cứ |

**Điểm** 0–100: có `block` → 0; không thì 100 − Σ trọng số `warn` chưa chấp nhận; `hint` không trừ (R-INTAKE-10).

## 2. Luật của danh mục

- `block` + `door` ⇔ cửa nạp từ chối cùng dữ liệu — test cặp `apps/api/test/intake-preflight.test.ts` phủ đủ (R-INTAKE-4).
- Mã chỉ có ở trạm (không có luật Kernel tương ứng) → `warn` / `hint` + `advice`; muốn chặn thì sửa Kernel (R-KER-2), không sửa ở trạm.
- Mỗi mã có một dòng ở bảng dưới và một trang bài học — check SC-INTAKE-1 (R-INTAKE-11).
- Phân hệ góp mã riêng dạng `IN-<KEY>-NNN`, luôn `warn` / `hint` trừ khi Kernel chặn.

## 3. Danh mục (W1: L1–L4)

| Mã | Lớp | Mức | Giai đoạn | Trọng số | Tên | Trang |
|---|---|---|---|---|---|---|
| `IN-SHAPE-001` | L1 | block | door | 0 | Thiếu trường bắt buộc | [bài học](../huong-dan/loi-dau-vao/IN-SHAPE-001.md) |
| `IN-SHAPE-002` | L1 | block | door | 0 | Sai kiểu dữ liệu | [bài học](../huong-dan/loi-dau-vao/IN-SHAPE-002.md) |
| `IN-SHAPE-003` | L1 | block | door | 0 | Ngày không đúng định dạng YYYY-MM-DD | [bài học](../huong-dan/loi-dau-vao/IN-SHAPE-003.md) |
| `IN-SHAPE-004` | L1 | block | door | 0 | Loại chứng từ không có trong khuôn nạp | [bài học](../huong-dan/loi-dau-vao/IN-SHAPE-004.md) |
| `IN-SHAPE-005` | L1 | block | door | 0 | Quá độ dài / quá số lượng cho phép | [bài học](../huong-dan/loi-dau-vao/IN-SHAPE-005.md) |
| `IN-SHAPE-006` | L1 | block | door | 0 | Giá trị ngoài danh sách cho phép | [bài học](../huong-dan/loi-dau-vao/IN-SHAPE-006.md) |
| `IN-SUM-001` | L2 | block | door | 0 | Tổng các dòng khác tổng chứng từ | [bài học](../huong-dan/loi-dau-vao/IN-SUM-001.md) |
| `IN-SUM-002` | L2 | block | door | 0 | Phân bổ thanh toán lớn hơn số tiền phiếu | [bài học](../huong-dan/loi-dau-vao/IN-SUM-002.md) |
| `IN-SUM-005` | L2 | block | door | 0 | Tổng thanh toán khác tiền trước thuế + thuế | [bài học](../huong-dan/loi-dau-vao/IN-SUM-005.md) |
| `IN-SUM-006` | L2 | block | door | 0 | Tổng thuế khác cộng thuế các dòng | [bài học](../huong-dan/loi-dau-vao/IN-SUM-006.md) |
| `IN-SUM-003` | L2 | warn | advice | 15 | Thuế dòng khác tiền trước thuế × thuế suất | [bài học](../huong-dan/loi-dau-vao/IN-SUM-003.md) |
| `IN-SUM-004` | L2 | warn | advice | 10 | Đơn giá × số lượng − chiết khấu khác thành tiền dòng | [bài học](../huong-dan/loi-dau-vao/IN-SUM-004.md) |
| `IN-MD-001` | L3 | block | door | 0 | Chi nhánh (mã cửa hàng) chưa có | [bài học](../huong-dan/loi-dau-vao/IN-MD-001.md) |
| `IN-MD-004` | L3 | hint | advice | 0 | Mã hàng chưa có trong danh mục | [bài học](../huong-dan/loi-dau-vao/IN-MD-004.md) |
| `IN-MD-005` | L3 | warn | advice | 10 | Mã số thuế đối tượng sai định dạng | [bài học](../huong-dan/loi-dau-vao/IN-MD-005.md) |
| `IN-BIZ-003` | L4 | block | door | 0 | Mã chứng từ không thuộc nguồn gửi | [bài học](../huong-dan/loi-dau-vao/IN-BIZ-003.md) |
| `IN-BIZ-004` | L4 | block | door | 0 | Phiên bản cũ hơn bản đã nhận | [bài học](../huong-dan/loi-dau-vao/IN-BIZ-004.md) |
| `IN-BIZ-005` | L4 | warn | advice | 20 | Cùng phiên bản nhưng nội dung khác bản đã nhận | [bài học](../huong-dan/loi-dau-vao/IN-BIZ-005.md) |
| `IN-BIZ-006` | L4 | warn | advice | 20 | Số hoá đơn đã có ở chứng từ khác | [bài học](../huong-dan/loi-dau-vao/IN-BIZ-006.md) |
| `IN-BIZ-007` | L4 | hint | advice | 0 | Ngày hoá đơn cách ngày chứng từ hơn 5 ngày | [bài học](../huong-dan/loi-dau-vao/IN-BIZ-007.md) |

L5 (`IN-POST-*`, định khoản thử) và các mã danh mục cần xác minh Kernel (ĐVT, kho thuộc chi nhánh, bán nợ thiếu đối tượng, kỳ khoá) thêm ở W5 / S021-4.

## 4. Nhật ký

- **0.2.0-draft (2026-11-02):** §5 bể chờ `intake_inbox`: `error.intake` trong phản hồi lỗi cửa nạp, `intakeId` từng dòng lô, API `/api/v1/intake`, hạn giữ (PHASE-021 W2, PHASES 2.18).
- **0.1.0-draft (2026-11-02):** 20 mã L1–L4 (PHASE-021 W1, PHASES 2.17).

## 5. Bể chờ (W2, `intake.inbox`)

Cửa nạp từ chối một chứng từ **đã xác thực** vì nội dung (`VALIDATION_ERROR`, `CONFLICT`) ở `POST /api/v1/documents`, `/documents/batch`, `/documents/submit` (không phải chạy thử), khoá app → giữ nguyên văn + phát hiện + điểm ở `intake_inbox` (giao dịch riêng). **Không** thành sự việc, không bút toán, không sự kiện (RULE-INTAKE-2). Mã HTTP và `error.details` giữ như cũ.

```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "Dữ liệu gửi lên không hợp lệ", "details": ["Ngày chứng từ: …"],
  "intake": { "id": "42", "attempt": 1, "score": 0, "findings": [{ "code": "IN-SHAPE-003", "…": "…" }], "url": "/api/v1/intake/42" } } }
```

- **Vì sao `error.intake` mà không `meta.intake`** (ADR-0014 D2 ghi `meta.intake`): phản hồi lỗi không có `meta` ([BIZCITY-API-v1 §3](BIZCITY-API-v1.md)); `details` của từng mã đã có khuôn riêng, nhét `findings` vào sẽ gãy bên gọi cũ. `error.intake` là trường tuỳ chọn, bên gọi cũ bỏ qua được.
- **Lô:** từng dòng `status: "error"` có `intakeId`.
- **Gửi trùng:** cùng nguyên văn (băm `sha256` của JSON khoá sắp xếp) khi mục còn `open` / `trial` → `attempt_no + 1`, không thêm dòng.
- **Nguồn gửi lại đúng** cùng `docKey` → mục `open` thành `fixed_at_source`, `event_id` = sự việc vừa nhận.
- Nguyên văn > 256 KB: lưu `{ truncated, head }`, băm vẫn trên toàn văn.

| Lời gọi | Quyền | Kết quả |
|---|---|---|
| `GET /api/v1/intake?status=&docKey=&channel=&limit=&offset=` | `documents:read` | danh sách mục (không nguyên văn) + `codes` (mã phát hiện), `meta.total` |
| `GET /api/v1/intake/:id` | `documents:read` | một mục: `payload_raw`, `findings`, `door_error`, `attempt_no`, trạng thái |
| `POST /api/v1/intake/preflight` `{ document, save? }` | `documents:write` | `{ findings, score, trialId?, attempt? }` — Kiểm thử, không sự việc; `save` lưu mục `trial` |

Trạng thái mục: `open` · `trial` · `resubmitted` · `fixed_at_source` · `accepted` · `dismissed` (W3 thêm sửa tại bể, nộp lại, chấp nhận, bỏ). Hạn giữ: mục đã đóng `bizcity.intake.retention_days` (90), mục thử `bizcity.intake.trial_retention_days` (7) — subscriber `intake.retention` theo `bizcity.clock.daily`. Nguyên văn chỉ ở bảng này (RLS theo đơn vị), không vào log, span, `event_outbox` (RULE-INTAKE-12).
