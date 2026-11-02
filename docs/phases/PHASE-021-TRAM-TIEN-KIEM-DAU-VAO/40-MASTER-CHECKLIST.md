# PHASE-021 · 40 — Master checklist
<!-- [2026-11-02 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — master checklist: S021-1..24, ca bằng chứng T021-1..18, log -->

> Nguồn trạng thái **việc con** duy nhất của phase. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

## Việc con

| ID | Việc | Đợt | Ưu tiên | Code | Trạng thái |
|---|---|---|---|---|---|
| S021-1 | ADR-0014 chủ duyệt (Q1 sửa tại bể, Q2 hạn giữ 90 / 7 ngày, Q3 bảng điểm cho mọi kế toán, Q4 phase riêng); RULE-INTAKE chấp nhận | W0 | P0 | — | ✅ 2026-11-02 |
| S021-2 | Kế hoạch + hiện trạng + kiến trúc phase ([00](00-MASTER-PLAN.md), [10](10-HIEN-TRANG.md), [20](20-KIEN-TRUC.md)); lộ trình 2.17–2.21, năng lực `intake.*` planned | W0 | P0 | — | ✅ 2026-11-02 |
| S021-3 | Bản mẫu tĩnh `mockups/tram-kiem-tra.html`: thẻ Cần sửa, khung chi tiết (lỗi theo lớp, sửa, Kiểm thử, so lần), bảng điểm — chủ duyệt bố cục trước W3 | W0 | P0 | — | ☐ |
| S021-4 | Trả lời hai câu hỏi mở ở [10-HIEN-TRANG §3](10-HIEN-TRANG.md) (Kernel chặn ĐVT / mã hàng / kho? khoá theo ngày ở cửa nạp?) → chốt mức ⚑ trong danh mục | W1 | P0 | — | 🟡 2026-11-02: chi nhánh lạ (`findBranch`) = cửa nạp từ chối → IN-MD-001 door (test cặp); kỳ khoá chặn ở ghi sổ (`ledger.service`) → stage posting, làm ở W5 cùng định khoản thử; ĐVT / kho thuộc chi nhánh / bán nợ thiếu đối tượng: chưa xác minh, chưa vào danh mục <!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-4 --> |
| S021-5 | Hợp đồng `bizcity_intake_findings@1` (`docs/contracts/BIZCITY-INTAKE-FINDINGS-v1.md`) + `packages/contracts/src/intake-findings.ts` (danh mục L1–L4) + `bizcity-standard.json` | W1 | P0 | có | ✅ 2026-11-02: `packages/contracts/src/intake-findings.ts` (20 mã, trường `stage` door / posting / advice), `docs/contracts/BIZCITY-INTAKE-FINDINGS-v1.md` 0.1.0-draft, `bizcity-standard.json` <!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-5 --> |
| S021-6 | `preflight()` L1–L4 trong `packages/kernel/src/modules/intake/`; tách `assertTotals` → `totalsProblems` (cửa nạp dùng lại, một chỗ luật) — ca T021-3, T021-4 | W1 | P0 | có | ✅ 2026-11-02: `packages/kernel/src/modules/intake/preflight.ts` (L1–L4, chỉ đọc); `totalsProblems` tách từ `assertTotals` (cửa nạp ném như cũ) — T021-3, T021-4 <!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-6 --> |
| S021-7 | Check `SC-INTAKE-1` (mã ⇔ hợp đồng ⇔ trang bài học) + ca tự kiểm trong `fixtures/expect.json`; trang bài học khung cho mọi mã L1–L4 | W1 | P1 | có | ✅ 2026-11-02: SC-INTAKE-1 (danh mục ⇔ bảng hợp đồng ⇔ trang bài học) + ca tự kiểm `repo-bad`; 20 trang `docs/huong-dan/loi-dau-vao/` — T021-15 <!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-7 --> |
| S021-8 | Migration `intake_inbox` (số lấy từ `main` khi bắt đầu), RLS, `COMMENT ON`, quyền `ketoan_app`; `db/types.ts`; `schema-catalog.ts` | W2 | P0 | có | ✅ 2026-11-02: `db/migrations/0058_be_cho_dau_vao.sql` (RLS, `COMMENT ON`, quyền `ketoan_app`), `IntakeInboxTable`, `schema-catalog.ts` <!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-8 --> |
| S021-9 | Cửa nạp lưu khi từ chối (`/documents`, `/batch`, `/submit`, khoá app) + `meta.intake` + `error.details.findings`; gộp gửi trùng — ca T021-1, T021-2 | W2 | P0 | có | ✅ 2026-11-02: `documentService.ingest` / `ingestBatch` / `core.document.submit` gọi `recordRejection` (giao dịch riêng, gộp theo băm). **Đổi so với kế hoạch:** `error.intake` thay `meta.intake` + `details.findings` — phản hồi lỗi không có `meta`, `details` giữ khuôn cũ. `POST /documents` nhận thân thô, khuôn kiểm trong cửa nạp (`zodIssueTexts` giữ `details` mảng câu) — T021-1, T021-2 <!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-9 --> |
| S021-10 | Tự đóng khi nguồn gửi lại đạt (hook đăng ký, Platform không import Kernel) — ca T021-5 | W2 | P0 | có | ✅ 2026-11-02: `closeBySource()` gọi trong `ingest` (đường Kernel, không cần hook Platform) và trong giao dịch action `submit` — T021-5 <!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-10 --> |
| S021-11 | `GET /intake`, `GET /intake/:id`, `POST /intake/preflight`; khoá cấu hình `bizcity.intake.*` trong registry; dọn theo hạn giữ bằng `bizcity.clock.daily` — ca T021-10, T021-11, T021-12 | W2 | P0 | có | ✅ 2026-11-02: `intake.routes.ts`; khoá `bizcity.intake.retention_days` / `trial_retention_days`; subscriber `intake.retention` — T021-10, T021-11, T021-12 <!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-11 --> |
| S021-12 | `bizcity_ledger_intake@1` minor (`meta.intake`); `BIZCITY-ERRORS` ghi `details.findings`; `docs/api/01-quy-uoc.md` | W2 | P1 | có | ✅ 2026-11-02: `bizcity_ledger_intake@1` 1.3.0, `bizcity_errors@1` 1.2.0-draft (`error.intake`), `bizcity_intake_findings@1` 0.2.0-draft §5, `docs/api/01-quy-uoc.md` <!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-12 --> |
| S021-13 | Màn Trạm kiểm tra: thẻ Cần sửa / Đã xử lý / Thử của tôi cạnh Chờ / Lỗi định khoản tại `/chung-tu` (ACC14) | W3 | P0 | ☐ | ☐ |
| S021-14 | Khung chi tiết: câu kết luận, lỗi theo lớp, bấm trường nhảy tới ô, Vì sao / Sửa ở nguồn / Bài học | W3 | P0 | ☐ | ☐ |
| S021-15 | Sửa tại bể (bản vá + lý do), Kiểm thử, Nộp lại, lịch sử lần thử + so hai lần — ca T021-6, T021-9 | W3 | P0 | ☐ | ☐ |
| S021-16 | Chấp nhận cảnh báo (vai trò cấu hình, có lý do, bằng chứng), Bỏ mục (kế toán trưởng) — ca T021-7, T021-8 | W3 | P1 | ☐ | ☐ |
| S021-17 | Thực tập sinh thử thật trên dữ liệu demo (ba chứng từ hỏng mẫu), biên bản `evidence/W3-<ngày>.md` | W3 | P1 | — | ☐ |
| S021-18 | `GET /intake/score` + màn Bảng điểm đầu vào (mọi kế toán, Q3) — ca T021-13 | W4 | P0 | ☐ | ☐ |
| S021-19 | `DG-INTAKE-1` mục mở quá hạn (`ops/DIAGNOSTICS.md` §2 trước) — ca T021-14 | W4 | P1 | ☐ | ☐ |
| S021-20 | Sự kiện `bizcity.intake.rejected` / `.resolved` (`bizcity_event` §7), webhook app nhận được — ca T021-17 | W4 | P1 | ☐ | ☐ |
| S021-21 | Trang bài học đủ ví dụ sai / đúng / vì sao cho mọi mã; kế toán trưởng đọc lại câu chữ | W4 | P1 | — | ☐ |
| S021-22 | L5 định khoản thử (`IN-POST-*`), giao dịch huỷ, giới hạn thời gian + lượt — ca T021-16 | W5 | P0 | ☐ | ☐ |
| S021-23 | Gợi ý cấu hình từ lỗi lặp (ĐVT, ánh xạ mã hàng, lý do) để kế toán trưởng duyệt, không tự sửa | W5 | P1 | ☐ | ☐ |
| S021-24 | Action đọc `core.intake.list / get / explain` (`expose.ai: read`, không trả nguyên văn) — ca T021-18 | W5 | P2 | ☐ | ☐ |
| S021-25 | Tiền kiểm L4 dùng hàm kiểm theo một chứng từ của ca kiểm chuẩn (PHASE-022 S022-8): `IN-VAT-001` thuế suất giảm ngoài thời gian (tham số rulepack), `IN-INV-001` hoá đơn thiếu trường (`taxIssues`), `IN-INV-002` lập hoá đơn sau ngày giao, `IN-CFG-001` chưa khai hồ sơ kế toán cho ngày chứng từ — mức `warn`, có `remedy` <!-- [2026-11-02 07:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — chủ đồng ý duy trì hai phương án: cảnh báo lúc nhập + lượt định kỳ, một nguồn luật. --> | W1 | P1 | ☐ | ☐ |

## Ca bằng chứng

| ID | Ca | Đợt | Trạng thái |
|---|---|---|---|
| T021-1 | Gửi chứng từ sai khuôn → mã lỗi cũ + `error.intake.id` (kế hoạch ghi `meta.intake`); mục bể có nguyên văn; **không** có dòng `accounting_events` | W2 | ✅ 2026-11-02 `intake-inbox.test.ts` |
| T021-2 | Gửi lại cùng nguyên văn khi mục còn mở → `attempt_no` tăng, không thêm dòng, không phát sự kiện lần hai | W2 | ✅ 2026-11-02 `intake-inbox.test.ts` (W2 chưa phát sự kiện bể nào) |
| T021-3 | Một chứng từ có lỗi ở L1, L2, L3 → ba phát hiện trong một lần, sắp block → warn → hint | W1 | ✅ 2026-11-02 `intake-preflight.test.ts` |
| T021-4 | Mỗi mã `block`: `preflight` báo mã **và** cửa nạp từ chối cùng dữ liệu (test cặp sinh từ danh mục) | W1 | ✅ 2026-11-02 `intake-preflight.test.ts`: 11 mã door + IN-BIZ-004; danh sách ca phải phủ đủ mã door của danh mục |
| T021-5 | Nguồn gửi lại cùng `docKey` đã sửa → mục `fixed_at_source`, có `event_id`, cùng giao dịch | W2 | ✅ 2026-11-02 `intake-inbox.test.ts` |
| T021-6 | Sửa tại bể → `resubmitted`; `payload_raw` không đổi; sự việc có `extra.intake.patched = true` | W3 | ☐ |
| T021-7 | Chấp nhận cảnh báo: vai trò không được phép → 403; được phép → `accepted`, bằng chứng có lý do | W3 | ☐ |
| T021-8 | Mức `block` không chấp nhận được, kể cả chủ đơn vị | W3 | ☐ |
| T021-9 | Kiểm thử: không sự việc, không bút toán, không sự kiện; mục `trial` của đúng người | W3 | ☐ |
| T021-10 | RLS: đơn vị A không đọc được bể của đơn vị B (dưới `ketoan_app`) | W2 | ✅ 2026-11-02 `intake-inbox.test.ts` (API: đơn vị khác 404 / rỗng) |
| T021-11 | Dọn theo hạn giữ: xoá mục đóng > 90 ngày, `trial` > 7 ngày; không đụng `accounting_events` | W2 | ✅ 2026-11-02 `intake-inbox.test.ts` |
| T021-12 | Nguyên văn không xuất hiện trong log, span, `event_outbox.data` | W2 | ✅ 2026-11-02 `intake-inbox.test.ts`: `event_outbox`; log / span: nguyên văn không truyền vào logger, trace chỉ có tên bước |
| T021-13 | Bảng điểm: số khớp truy vấn đối chiếu; kế toán xem được, người xem không | W4 | ☐ |
| T021-14 | `DG-INTAKE-1` đỏ khi có mục mở quá ngưỡng, xanh khi không | W4 | ☐ |
| T021-15 | `SC-INTAKE-1`: thiếu trang bài học cho một mã → không đạt (ca tự kiểm) | W1 | ✅ 2026-11-02 SC-INTAKE-1 + ca tự kiểm `repo-bad` |
| T021-16 | L5: `accounting_events`, `ledger_entries`, `event_outbox` trước / sau như nhau | W5 | ☐ |
| T021-17 | Khoá app gửi hỏng → mục bể có `app_key`; webhook `bizcity.intake.rejected` chỉ có mã, không nguyên văn | W4 | ☐ |
| T021-18 | Action AI `core.intake.get` không trả nguyên văn; không có action ghi nào cho AI | W5 | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-11-02 15:34 | Claude Code | Chủ duyệt ADR-0014 (Q1 có, Q2 90 / 7 ngày, Q3 bảng điểm cho mọi kế toán — khác đề xuất, Q4 phase riêng). Mở PHASE-021: kế hoạch, hiện trạng, kiến trúc, checklist; lộ trình 2.17–2.21; năng lực `intake.*` planned. |
| 2026-11-02 19:00 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | đồng ý duy trì hai phương án (cảnh báo lúc nhập + lượt định kỳ, một nguồn luật) → thêm S021-25 (tiền kiểm L4 dùng hàm kiểm của ca kiểm chuẩn, mức warn); chi tiết ở PHASE-022 |
| 2026-11-02 19:05 | Claude Code | W1 (2.17): danh mục 20 mã L1–L4 có `stage` (door / posting / advice — sửa thiết kế: kỳ khoá chặn ở ghi sổ, không ở cửa nạp); `preflight()` Kernel chỉ đọc; `totalsProblems` dùng chung cửa nạp; hợp đồng `bizcity_intake_findings@1` 0.1.0-draft; 20 trang bài học; SC-INTAKE-1; test cặp. Bỏ khỏi W1 (chưa xác minh / thuộc W5): IN-MD-002/003/006/007, IN-BIZ-001/002, IN-POST-*. |
| 2026-11-02 20:45 | Claude Code | W2 (2.18): bể chờ `intake_inbox` (0057); cửa nạp đơn / lô / submit / khoá app giữ chứng từ bị từ chối, trả `error.intake` (đổi so với `meta.intake` của ADR-0014 D2 — lỗi không có `meta`; `details` giữ khuôn); `POST /documents` kiểm khuôn trong cửa nạp; tự đóng khi nguồn gửi lại; API `/api/v1/intake*`; hạn giữ 90 / 7 ngày; 10 ca test. |
| 2026-11-02 23:30 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | Gộp main (PHASE-022, PR #33) vào nhánh: migration bể chờ đổi số 0057 → `0058_be_cho_dau_vao.sql` (0057 đã là vai trò kiểm soát); gỡ xung đột CHANGELOG, app.ts, loi.ts (giữ cả hai) |
