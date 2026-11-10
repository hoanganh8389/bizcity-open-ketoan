# `bizcity_intake_findings@1` — Danh mục phát hiện tiền kiểm
<!-- [2026-11-09 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2b: §3 thêm IN-POL-004 (số phiên bản đầu tệp + bizcity-standard.json nâng sau khi dòng S030-51a nhả) (tính lại quà theo bản nguồn nêu, so với dòng quà nguồn gửi) -->
<!-- [2026-11-09 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-51b: 0.10.0-draft — §9 libraryFindings[] (kiểm trường theo thư viện dùng chung, chỉ cảnh báo, kênh riêng; K1) -->
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: hợp đồng 0.1.0-draft — danh mục mã IN-*, khuôn phát hiện, điểm (ADR-0014 D3, D11) -->
<!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W2: 0.2.0-draft — §5 bể chờ: error.intake, API /api/v1/intake, hạn giữ -->
<!-- [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28: thêm IN-ITEM-009 (mặt hàng còn nháp, ADR-0019) -->
<!-- [2026-11-03 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-25: 0.8.0-draft — §3 thêm IN-VAT-001, IN-INV-001, IN-INV-002, IN-CFG-001 (L4, warn, cùng luật với tự chẩn đoán thuế); §9 -->
<!-- [2026-11-03 01:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W5: 0.7.0-draft — §3 thêm IN-BIZ-001, IN-POST-001..005 (stage posting); §8 L5 định khoản thử, gợi ý cấu hình, action đọc -->
<!-- [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W4: 0.6.0-draft — §7 bảng điểm, INTAKE_OPEN_AGE, sự kiện bizcity.intake.* -->
<!-- [2026-11-03 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W3: 0.5.0-draft — §6 sửa tại bể, nộp lại, chấp nhận cảnh báo, bỏ mục; lọc closed / mine; chi tiết kèm current -->

> **Phiên bản:** 0.10.0-draft · 2026-11-09 · **Trạng thái:** Đề xuất · **Thuộc:** Kernel (cửa nạp) · **Quyết định:** [ADR-0014](../adr/ADR-0014-tram-tien-kiem-be-cho-dau-vao.md) · **Luật:** [RULE-INTAKE](../rules/RULE-INTAKE.md)
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
<!-- [2026-11-02 11:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-26: phát hiện mang remedy (bizcity_remedy@1) -->
| `remedy` | phương án khắc phục có cấu trúc ([bizcity_remedy@1](BIZCITY-REMEDY-v1.md)): bước, màn, vai, kiểm lại, việc cấm. Có ở mọi mã `block` / `warn` (khai ở `INTAKE_REMEDIES`, SC-FIX-1); mã `hint` tuỳ |

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
| `IN-ITEM-001` | L3 | block | door | 0 | Mã hàng chưa có trong danh mục khi đơn vị đã tắt tự thêm mặt hàng (D024-3) — bể tạo mặt hàng nháp từ dòng | [bài học](../huong-dan/loi-dau-vao/IN-ITEM-001.md) |
| `IN-ITEM-009` | L3 | block | door | 0 | Mặt hàng còn nháp, chưa kích hoạt (Gate A, R-GATE-6) | [bài học](../huong-dan/loi-dau-vao/IN-ITEM-009.md) |
| `IN-BIZ-001` | L4 | block | posting | 0 | Kỳ kế toán của ngày chứng từ đã khoá | [bài học](../huong-dan/loi-dau-vao/IN-BIZ-001.md) |
| `IN-POST-001` | L5 | block | posting | 0 | Không chọn được lý do định khoản | [bài học](../huong-dan/loi-dau-vao/IN-POST-001.md) |
| `IN-POST-002` | L5 | block | posting | 0 | Không tra được tài khoản để định khoản | [bài học](../huong-dan/loi-dau-vao/IN-POST-002.md) |
| `IN-POST-003` | L5 | block | posting | 0 | Thiếu nhóm hạch toán mặt hàng | [bài học](../huong-dan/loi-dau-vao/IN-POST-003.md) |
| `IN-POST-004` | L5 | block | posting | 0 | Bút toán dựng ra không cân hoặc không hợp lệ | [bài học](../huong-dan/loi-dau-vao/IN-POST-004.md) |
| `IN-POST-005` | L5 | block | posting | 0 | Định khoản thử không thành công vì lý do khác | [bài học](../huong-dan/loi-dau-vao/IN-POST-005.md) |
| `IN-VAT-001` | L4 | warn | advice | 15 | Thuế suất giảm dùng ngoài khoảng ngày được giảm | [bài học](../huong-dan/loi-dau-vao/IN-VAT-001.md) |
| `IN-INV-001` | L4 | warn | advice | 10 | Hoá đơn mua vào thiếu ký hiệu, tên hoặc mã số thuế người bán | [bài học](../huong-dan/loi-dau-vao/IN-INV-001.md) |
| `IN-INV-002` | L4 | warn | advice | 10 | Hoá đơn bán hàng lập sau ngày chứng từ bán | [bài học](../huong-dan/loi-dau-vao/IN-INV-002.md) |
| `IN-CFG-001` | L4 | warn | advice | 0 | Đơn vị chưa khai hồ sơ kế toán áp cho ngày chứng từ | [bài học](../huong-dan/loi-dau-vao/IN-CFG-001.md) |
| `IN-BIZ-003` | L4 | block | door | 0 | Mã chứng từ không thuộc nguồn gửi | [bài học](../huong-dan/loi-dau-vao/IN-BIZ-003.md) |
| `IN-BIZ-004` | L4 | block | door | 0 | Phiên bản cũ hơn bản đã nhận | [bài học](../huong-dan/loi-dau-vao/IN-BIZ-004.md) |
| `IN-BIZ-005` | L4 | warn | advice | 20 | Cùng phiên bản nhưng nội dung khác bản đã nhận | [bài học](../huong-dan/loi-dau-vao/IN-BIZ-005.md) |
| `IN-BIZ-006` | L4 | warn | advice | 20 | Số hoá đơn đã có ở chứng từ khác | [bài học](../huong-dan/loi-dau-vao/IN-BIZ-006.md) |
| `IN-BIZ-007` | L4 | hint | advice | 0 | Ngày hoá đơn cách ngày chứng từ hơn 5 ngày | [bài học](../huong-dan/loi-dau-vao/IN-BIZ-007.md) |
| `IN-POL-001` | L4 | warn | advice | 10 | Tham chiếu chính sách không có trong sổ đăng ký hoặc băm khác bản đã phát hành | [bài học](../huong-dan/loi-dau-vao/IN-POL-001.md) |
| `IN-POL-002` | L4 | warn | advice | 10 | Bản chính sách không hiệu lực tại ngày chứng từ | [bài học](../huong-dan/loi-dau-vao/IN-POL-002.md) |
| `IN-POL-003` | L4 | warn | advice | 5 | Đã có bản chính sách mới hơn hiệu lực tại ngày chứng từ | [bài học](../huong-dan/loi-dau-vao/IN-POL-003.md) |
| `IN-POL-004` | L4 | warn | advice | 10 | Quà tính lại theo chính sách khác quà nguồn gửi | [bài học](../huong-dan/loi-dau-vao/IN-POL-004.md) |
| `IN-GUARD-001` | L5 | block | door | 0 | Cấu hình vừa đổi sau lần Kiểm thử, chạy lại còn lỗi chặn (Commit Guard, R-GATE-8) | [bài học](../huong-dan/loi-dau-vao/IN-GUARD-001.md) |

L5 (`IN-POST-*`, định khoản thử) và các mã danh mục cần xác minh Kernel (ĐVT, kho thuộc chi nhánh, bán nợ thiếu đối tượng, kỳ khoá) thêm ở W5 / S021-4.

### 3.1 Tham chiếu chính sách (0.9.0-draft, PHASE-031 W2a)

Ba mã `IN-POL-001..003` đã vào bảng §3. `IN-POL-004` (W2b): tính lại quà theo **đúng bản nguồn nêu** trên các dòng không phải quà, so với dòng quà nguồn gửi mang `policyRef.key` của chính sách đó; thiếu / thừa / lệch số lượng → `IN-POL-004` kèm `got` (nguồn) ↔ `expected` (tính lại); chỉ khi bản có thật và băm khớp; im lặng khi không tính được (nội dung ở module chủ, khuôn không có quà, ngoài phạm vi). Để sau: `IN-POL-000` nghiệp vụ có chính sách hiệu lực mà nguồn không gửi tham chiếu (`hint`), `IN-POL-005` kết quả thiếu dữ liệu gốc (quà thiếu kho / lô). Thiếu lý do định khoản cho kết quả chính sách dùng `IN-POST-001` sẵn có.

## 4. Nhật ký

- **0.10.0-draft (2026-11-09):** §9 `libraryFindings[]` trong phản hồi tiền kiểm — kiểm trường chứng từ theo thư viện dùng chung (bảng gắn `LIBRARY_BINDINGS`), chỉ cảnh báo / nhắc, kênh riêng: không vào `findings[]`, `score`, mã `IN-*` hay bút toán (PHASE-030 S030-51b, K1). Thêm trường, tương thích.
- **0.9.0-draft (2026-11-08):** `IN-POL-001..004` (PHASE-031 W2a / W2b, §3.1).

<!-- [2026-11-03 09:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-29: IN-GUARD-001, guard trong Kiểm thử / cửa nạp -->
<!-- [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09 / D024-3: IN-ITEM-001 -->
- **0.4.0-draft (2026-11-03):** `IN-ITEM-001` (đơn vị tắt tự thêm mặt hàng, `bizcity.item.auto_create = off`): mã lạ → chặn ở cửa nạp + tiền kiểm (khi bật vẫn là `IN-MD-004` gợi ý); bể chờ tạo mặt hàng nháp từ dòng. Commit Guard (PHASE-024 S024-29): Kiểm thử trả `guard` (dấu cấu hình chứng từ dựa vào) và nhận `guard` cũ → `guardChanged`; nộp kèm dấu (header `X-Preflight-Guard` ở `POST /api/v1/documents`, trường `guard` ở `core.document.submit`) — cấu hình đã đổi thì chạy lại tiền kiểm một lần, còn lỗi chặn → `IN-GUARD-001` + các lỗi đó, bể chờ giữ. Không gửi dấu: như cũ.
<!-- [2026-11-02 11:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-26 -->
- **0.3.0-draft (2026-11-02):** trường `remedy` trên phát hiện — mọi mã `block` / `warn` có phương án (bước sửa ở nguồn, màn danh mục khi thiếu mã, việc cấm); SC-FIX-1 kiểm. Thêm trường, không đổi mã / mức / điểm.
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
| `GET /api/v1/intake?status=&docKey=&channel=&closed=&closedDays=&mine=&limit=&offset=` | `documents:read` | danh sách mục (không nguyên văn) + `codes` (mã phát hiện), `patch_count`, `accepted_codes`, `meta.total`; `closed=1` mục đã đóng, `closedDays` đóng trong N ngày, `mine=1` mục của người gọi |
| `GET /api/v1/intake/:id` | `documents:read` | một mục: `payload_raw`, `patches`, `current` (nguyên văn + mọi bản vá), `findings`, `door_error`, `attempt_no`, `accepted_codes`, trạng thái |
| `POST /api/v1/intake/preflight` `{ document, save?, guard? }` | `documents:write` | `{ findings, score, guard, guardChanged?, trialId?, attempt? }` — Kiểm thử, không sự việc; `save` lưu mục `trial`; `guard` = dấu cấu hình gửi kèm lúc nộp (Commit Guard) |

Trạng thái mục: `open` · `trial` · `resubmitted` · `fixed_at_source` · `accepted` · `dismissed` (vòng đời §6). Hạn giữ: mục đã đóng `bizcity.intake.retention_days` (90), mục thử `bizcity.intake.trial_retention_days` (7) — subscriber `intake.retention` theo `bizcity.clock.daily`. Nguyên văn chỉ ở bảng này (RLS theo đơn vị), không vào log, span, `event_outbox` (RULE-INTAKE-12).

## 6. Sửa tại bể (W3, `intake.station`)

<!-- [2026-11-03 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W3 (S021-15, S021-16) -->
Ưu tiên **sửa ở nguồn** rồi gửi lại (mục tự đóng `fixed_at_source`). Sửa tại bể khi nguồn không sửa được; chứng từ vào sổ mang dấu lệch nguồn.

| Lời gọi (action) | Quyền | Kết quả |
|---|---|---|
| `POST /api/v1/intake/:id/patch` `{ ops, reason }` (`core.intake.patch`, cần `Idempotency-Key`) | `documents:write`; mục người khác cần `documents:edit-all` | thêm bản vá RFC 6902 (`add` / `replace` / `remove`; đường `""` = thay cả chứng từ) vào `patches` (chỉ thêm); chạy lại tiền kiểm trên nguyên văn + mọi bản vá → `{ findings, score, fixed, added, patchNo }`. Đường không có → 400, không ghi. Nguyên văn quá 256 KB (đã cắt) → 400 |
| `POST /api/v1/intake/:id/resubmit` `{ reason? }` (`core.intake.resubmit`) | như trên; mục của khoá app → 403 (sửa ở app, R-INTAKE-8) | còn lỗi chặn → `status: "blocked"`, **không nộp**, cập nhật phát hiện; đạt → nộp qua `submitDocumentIn` (đúng luật cửa nạp) → `resubmitted` (hoặc `accepted` khi có mã đã chấp nhận), `eventId`; mục mở khác cùng `docKey` → `fixed_at_source`. Sổ đã có cùng `docKey` + phiên bản → 409 |
| `POST /api/v1/intake/:id/accept` `{ codes, reason }` (`core.intake.accept`) | `documents:write` + vai trò trong `bizcity.intake.accept_roles` (mặc định `owner`, `chief_accountant`), khác → 403 | chỉ mã `warn` có `acceptable` đang có ở mục; mã `block` không bao giờ (400, kể cả chủ đơn vị); điểm tính lại bỏ mã đã chấp nhận; lý do vào bằng chứng |
| `POST /api/v1/intake/:id/dismiss` `{ reason }` (`core.intake.dismiss`) | `documents:edit-all` | `dismissed`, không nộp |

- Mọi thao tác chỉ trên mục `open`; mục đã đóng → 409.
- Mỗi bản vá giữ `{ at, by, reason, ops, score, codes, fixed, added }` — lịch sử lần thử và so hai lần đọc từ đây.
- Sự việc sinh từ nộp lại mang `extra.intake = { inboxId, patched, acceptedCodes }` (dấu lệch nguồn, khuôn `extra` có sẵn của `bizcity_ledger_intake@1`).
- Không action ghi nào phơi cho AI / MCP (`ai: 'deny'`, `mcp: false`).

## 7. Bảng điểm, chẩn đoán, sự kiện (W4, `intake.score`)

<!-- [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W4 (S021-18..20) -->
| Lời gọi | Quyền | Kết quả |
|---|---|---|
| `GET /api/v1/intake/score?days=30` (hoặc `from`, `to` YYYY-MM-DD) | `documents:write` (mọi kế toán, ADR-0014 Q3; người xem → 403) | `totals` { `sent`, `firstPass`, `firstPassRate`, `avgScore`, `open`, `oldestOpenAt`, `oldestOpenKey`, `closed`, `patchedAtInbox`, `patchedRate`, `medianResolveHours` }; `bySource`, `byActor` (kèm `label`), `byDocType`, `byWeek` — mỗi dòng { `key`, `sent`, `firstPass`, `firstPassRate`, `avgScore`, `topCode` }; `topCodes` (10 mã) |

- **Chứng từ gửi** = một `docKey` khác nhau nhận trong khung (sự việc hoặc mục bể, không tính mục thử; mục không đọc được `docKey` tính riêng). **Đạt lần đầu** = chứng từ gửi chưa từng có mục bể. Không có nội dung chứng từ trong phản hồi.
- **INTAKE_OPEN_AGE** (app) / **DG-INTAKE-1** (lane): mục `open` quá `bizcity.intake.open_alert_days` ngày (mặc định 3) → `warn`, mẫu = `docKey`.
- **Sự kiện** (`bizcity_event@1` §7): `bizcity.intake.rejected` khi tạo mục mới, `bizcity.intake.resolved` khi mục đóng; `data` chỉ mã và số. App kết nối đăng ký được qua webhook như mọi sự kiện lõi (giao theo đơn vị, như `bizcity.ledger.entry.posted`).

## 8. Định khoản thử, gợi ý cấu hình, action đọc cho AI (W5, `intake.preflight.posting`)

<!-- [2026-11-03 01:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W5 (S021-22..24) -->
**L5 định khoản thử.** `POST /api/v1/intake/preflight` nhận thêm `post` (mặc định `true`) và trả `l5`:

| `l5` | Nghĩa |
|---|---|
| `ran` | L1–L4 hết lỗi chặn nên đã định khoản thử: chạy đường ghi sổ thật (`postDocumentIn` với `post`, `force`) trong một savepoint rồi **hoàn tác** — không còn sự việc, bút toán, nhật ký định khoản hay sự kiện outbox (RULE-INTAKE-3, R-EVENT-11) |
| `blocked` | còn lỗi chặn ở L1–L4 nên không thử |
| `rate` | quá **20 lần mỗi người mỗi phút** nên bỏ qua L5 (L1–L4 vẫn chạy); giới hạn theo bộ nhớ tiến trình |
| `off` | gọi với `post: false` |

- Giới hạn thời gian 3 giây (`SET LOCAL statement_timeout` đặt sau savepoint nên hoàn tác cùng savepoint). Hết giờ → `IN-POST-005`; lỗi kỹ thuật khác ném lên, không nuốt.
- **Phân loại lỗi** (`postingFindings`, một chỗ): `PERIOD_LOCKED` → `IN-BIZ-001`; `UNBALANCED_ENTRY` hoặc "Bút toán không hợp lệ" → `IN-POST-004` (**lỗi luật, dừng ghi sổ báo nhóm Lõi**); lý do chưa khai / không có mặc định → `IN-POST-001`; "Thiếu cấu hình hạch toán" → `IN-POST-002`; thiếu nhóm hạch toán → `IN-POST-003`; còn lại → `IN-POST-005`. Các mã này `stage: posting`, mức `block`, không chấp nhận được.
- `core.intake.patch` (sửa tại bể) cũng chạy L5 và trả `l5`; `recordRejection` và `recheckInboxForSkus` không chạy L5.

**Gợi ý cấu hình.** `GET /api/v1/intake/suggestions?days=30&min=3` (`documents:edit-all`): gom phát hiện của mục bể theo (mã, giá trị đã gửi) với các mã mà gốc sửa là cấu hình — `IN-MD-001`, `IN-ITEM-009`, `IN-POST-001`, `IN-POST-002`, `IN-POST-003` — từ `min` chứng từ trở lên. Trả `{ code, title, value, items, lastSeenAt, suggestion, screen, role }`; câu gợi ý lấy từ phương án khắc phục của mã. **Chỉ gợi ý**: không đổi dữ liệu nào (R-INTAKE-8).

**Action đọc cho AI** (`expose.ai: 'read'`, chỉ MCP, `documents:read`): `core.intake.list`, `core.intake.get`, `core.intake.explain`. Không trả nguyên văn, nội dung và lý do bản vá, **giá trị đã gửi (`got`) và giá trị mong đợi (`expected`)** — nhiều mã dựng `expected` từ số liệu / ngày của chính chứng từ. Không có action ghi nào của bể chờ mở cho AI (`ai: 'deny'`, `mcp: false`).

## 9. Thư viện dùng chung — `libraryFindings[]` (0.10.0-draft, PHASE-030 S030-51b) <!-- [2026-11-09 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-51b: chữ chốt PHASE-030 · 26 §4.2, K1 -->

Phản hồi tiền kiểm (`POST /api/v1/intake/preflight`) có thêm `libraryFindings[]`, **kênh riêng** cạnh `findings[]`: kiểm các trường chứng từ theo thư viện dùng chung (`bizcity_library@1`) theo bảng gắn `LIBRARY_BINDINGS` (`packages/contracts/src/library-bindings.ts`; hôm nay: `lines[].taxCode` ↔ `vn.loai-thue`, `reasonCode` / `toReasonCode` ↔ `core.ly-do-dinh-khoan`).

| Trường | Nghĩa |
|---|---|
| `binding`, `library` | gắn nào, thư viện nào |
| `path`, `occurrences`, `value` | đường của lần xuất hiện đầu tiên (`lines[1].taxCode`), số lần, mã đã gửi |
| `code`, `message`, `suggestions[]` | mã `LIB-*` (`LIB-UNKNOWN-001`, `LIB-DEPRECATED-001`, `LIB-VALUE-001`…) và gợi ý sửa từ thư viện |
| `level` | `warn` hoặc `info` — **không bao giờ `block`**; thư viện đặt mức chặn thì hạ xuống `warn` kèm `blockedBy: true` |

- **Không** vào `findings[]`, `score`, mã `IN-*`, hold, bút toán; **không** thêm `IntakeCode` / trọng số. `LIB-UNVERIFIED-001` (thư viện chưa duyệt mục) không đưa vào kênh này — đó là trạng thái của thư viện, hiện ở bảng đánh giá HT14.
- **Một hàm, hai đường (R-INTAKE-4):** `libraryFindings()` (`kernel/intake/library-check.ts`) dùng cho tiền kiểm; cửa nạp gọi cùng hàm để **đếm lượt dùng** (`library_usage_daily`, nguồn `intake/<sourceSystem>`) — không từ chối, không hold; xem trước / định khoản thử (post + force) không đếm.
- **Đơn vị** hạ (`info`) hoặc tắt (`off`) từng gắn bằng khoá `bindings` trong cấu hình thư viện có phiên bản (`POST /api/v1/libraries/:id/config`); thư viện tuỳ chọn đã tắt thì bỏ qua.
- Chặn `LIB-UNKNOWN-001` ở trường bắt buộc (Q030-L4) **chưa có**: chưa gắn nào bắt buộc; làm khi có (chạm `IntakeCode` — chữ chốt riêng).
