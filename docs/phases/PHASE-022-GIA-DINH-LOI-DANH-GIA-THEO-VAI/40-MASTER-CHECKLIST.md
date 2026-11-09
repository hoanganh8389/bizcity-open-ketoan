# PHASE-022 · 40 — Master checklist
<!-- [2026-11-02 07:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — master checklist: S022-1..16, ca bằng chứng T022-1..10, log -->
<!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4; sửa phần đầu tệp bị lần vá W1 ghi đè -->

> Nguồn trạng thái **việc con** duy nhất của phase. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

## Việc con

| ID | Việc | Đợt | Ưu tiên | Code | Trạng thái |
|---|---|---|---|---|---|
| S022-1 | Tài liệu W0: [README](README.md), [00](00-MASTER-PLAN.md), [10 danh mục 92 ca](10-DANH-MUC-GIA-DINH.md), [20](20-KIEN-TRUC.md), [30](30-UI-UX.md) | W0 | P0 | — | ✅ 2026-11-02 |
| S022-2 | Bản mẫu tĩnh [mockups/ban-danh-gia.html](mockups/ban-danh-gia.html): ba vai, checklist, bốn khối, kiểm lại | W0 | P0 | — | ✅ 2026-11-02 — chủ duyệt bố cục ("mockup ok rồi, code nhé") |
| S022-3 | Chủ duyệt D022-1..6, trả lời Q022-1..5 | W0 | P0 | — | ✅ 2026-11-02 — chủ duyệt bản mẫu; làm theo đề xuất D022-1..6 và phương án đề xuất của Q022-1..5 (vai trò auditor có) |
| S022-4 | Hợp đồng `bizcity_remedy@1` (`docs/contracts/BIZCITY-REMEDY-v1.md`) + `packages/contracts/src/remedy.ts` + `bizcity-standard.json` | W1 | P0 | có | ✅ 2026-11-02 — [BIZCITY-REMEDY-v1](../../contracts/BIZCITY-REMEDY-v1.md), `packages/contracts/src/remedy.ts` (Remedy, SCREENS, STOP_THE_LINE_STEP) <!-- [2026-11-02 08:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W1 --> |
| S022-5 | Thêm `remedy` (bước, màn, vai, kiểm lại, `stopTheLine`) cho mọi `DiagCheck` hiện có + mục bảng kiểm khoá kỳ | W1 | P0 | có | ✅ 2026-11-02 — 24 kiểm tự chẩn đoán + 10 mục bảng kiểm khoá kỳ (`period-check.remedies.ts`); Tier 0 có stopTheLine |
| S022-6 | Check SC-FIX-1 (block) + tự kiểm `fixtures/repo-bad` (thiếu remedy, đường dẫn không có trong menu) — ca T022-1 | W1 | P0 | có | ✅ 2026-11-02 — `tests/conformance/checks/remedy/remedy.check.mjs`; tự kiểm 3 phát hiện ở repo-bad |
| S022-7 | Giao diện dùng `remedy`: dải cảnh báo (PHASE-020), màn Toàn vẹn (PHASE-019), Trạm tiền kiểm (PHASE-021) hiện bước + nút mở màn | W1 | P1 | có | 🟡 2026-11-02 — cảnh báo kiểm chuẩn (API + dải cảnh báo) dùng `RemedyView`; màn Toàn vẹn, Trạm tiền kiểm theo sau |
| S022-8 | Tách hàm kiểm theo một chứng từ (`reducedRateFinding`, `invoiceDateFinding`, dùng lại `taxIssues`) cho Trạm tiền kiểm gọi chung — hỗ trợ S021-25 | W1 | P1 | có | ✅ 2026-11-03: `packages/kernel/src/modules/tax-info/tax.findings.ts` — `reducedRateWindow`, `outsideReducedWindow`, `invoiceFieldIssues` (dùng lại `taxIssues`), `invoiceIssuedAfterDelivery`; `tax.diagnostics.ts` và Trạm tiền kiểm (PHASE-021 S021-25) cùng gọi <!-- [2026-11-03 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S022-8 (ký thay cho việc PHASE-022, làm cùng S021-25) --> |
| S022-9 | Kiểm mới W2 (lane + app + remedy + test): `CASH_NEGATIVE`, `TRANSIT_NONZERO`, `DEBT_MATCH_LEDGER`, `ACCOUNT_WRONG_SIDE`, `DEPRECIATION_OPEN`, `COGS_STALE`, `STOCK_ADJUST_NO_REASON`, `CONFORMANCE_STALE` — ca T022-2..4 | W2 | P0 | có | ✅ 2026-11-02 — 8 kiểm (app + lane + remedy), `phase022-checks.test.ts` 7 test (gây lỗi → phát hiện → khắc phục → kiểm lại) <!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W2 --> |
| S022-10 | Kiểm mới W2 đợt sau: `TAX_BOOK_MATCH`, `MANUAL_SENSITIVE`, `COST_UNIT_SPIKE`, `YEAR_END_OPEN`, `DEBT_*`, `DEPOSIT_AGED`, `TRANSFER_UNCONFIRMED`, `CASH_LARGE_PAYMENT`, `CASH_VOUCHER_FIELDS`, `FA_*`, `PREPAID_RESIDUAL` | W2 | P1 | ☐ | ☐ |
| S022-11 | Danh mục máy đọc `tests/conformance/scenarios/**/F22-*.json` (`bizcity_fault_case@1`) cho 92 ca; ca ☐ / ○ ghi `status: planned` + lý do | W3 | P0 | có | ✅ 2026-11-02 — `fault-catalog.json` (92 ca, sinh từ danh mục) + `f22-evidence.json`: 53 test · 3 lane · 1 design · 6 recipe · 29 planned (có lý do) <!-- [2026-11-02 10:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W3 --> |
| S022-12 | Bộ chạy `apps/api/test/fault-scenarios.test.ts` (inject → expect → fix → afterFix) + `scenario-board.json` + `selfcheck --scenarios` — ca T022-5..7 | W3 | P0 | có | 🟡 2026-11-02 — `fault-scenarios.test.ts` (9 test: khớp danh mục ↔ bằng chứng, test có thật + nhắc mã, lane có mã, 6 công thức gồm 3 chặn đúng) ghi `scenario-board.json`: 63 đạt · 29 chưa làm · 0 trượt; danh mục là module TS `fault-catalog.ts` (có trong dist khi triển khai); cờ `selfcheck --scenarios` chưa làm |
| S022-13 | API `core.review.board` (`GET /api/v1/system/review-board?persona=`), `recheck` một mã, quyền `review:read` (+ vai trò `auditor` nếu Q022-1 = có) — ca T022-8 | W4 | P0 | có | ✅ 2026-11-02 — `core.review.board` + `core.review.recheck` (module `packages/kernel/src/modules/review`), quyền `review:read`; vai trò `auditor` (migration `0057_vai_tro_kiem_soat`); `review-board.test.ts` 5 test <!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4; sửa phần đầu tệp bị lần vá W1 ghi đè --> |
| S022-14 | Màn Hệ thống → Bàn đánh giá (HT08) theo [30-UI-UX](30-UI-UX.md) | W4 | P0 | có | ✅ 2026-11-02 — `apps/web/src/features/system/ReviewBoardPage.tsx`, menu HT08, `SCREENS.HT08`; ba vai, đếm 6 trạng thái, "Chỉ hiện việc cần làm", bốn khối, kiểm lại một mã <!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4; sửa phần đầu tệp bị lần vá W1 ghi đè --> |
| S022-15 | Biên bản in (PDF) theo vai, kèm các lần xác nhận cảnh báo — ca T022-9 | W4 | P1 | có | 🟡 2026-11-02 — biên bản in qua trình duyệt (`@media print`): vai, đơn vị, danh sách ca + trạng thái + phương án, chỗ ký, dòng miễn trừ; các lần xác nhận cảnh báo hiện trên màn (vai auditor), chưa in vào biên bản; chưa xuất PDF phía máy chủ <!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4; sửa phần đầu tệp bị lần vá W1 ghi đè --> |
| S022-16 | Tài liệu dùng: trang hướng dẫn "Bàn đánh giá" + "Kiểm chuẩn" trong nút "? Hướng dẫn"; DIAGNOSTICS cột remedy | W4 | P1 | ☐ | 🟡 2026-11-02 — DIAGNOSTICS có dòng mã mới W2; trang hướng dẫn "Bàn đánh giá" trong nút "? Hướng dẫn" chưa làm <!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4; sửa phần đầu tệp bị lần vá W1 ghi đè --> |
| S022-17 | RV-R1-06: `details.context` + `details.remedy` cho lỗi Kernel (`UNBALANCED_ENTRY`, `PERIOD_LOCKED`, `POSTING_FAILED`, `LEDGER_APPEND_ONLY`), `withErrorContext`, bảng `ERROR_REMEDY`; chữ chốt BIZCITY-ERRORS §4b; K1 | W5 | P1 | có | ✅ 2026-11-10 — `error-context` 6/6; toàn bộ bộ test API 215 file / 1787 test đạt |
| S022-18 | RV-R1-06: khay Mã tra cứu mang `details.context.step` + hiện `remedy.steps` (nút "Cách khắc phục"); chép / báo lỗi thêm dòng Bước, không chép docKey, số chứng từ, kỳ (T022-MT-1) | W5 | P2 | có | ✅ |
| S022-19 | RV-R1-06 phần ghi bước lỗi vào span OTel (thuộc tính mới `bizcity.error.step` trong TRACE_ATTRIBUTES + bảng OBSERVABILITY §1.1) — chờ PHASE-018 W6 nhả `OBSERVABILITY.md` | W5 | P3 | có | ☐ |

## Ca bằng chứng

| ID | Chứng minh | Đợt |
|---|---|---|
| T022-1 | SC-FIX-1 đỏ khi một kiểm `warn` thiếu `remedy` hoặc màn không có trong menu; xanh trên repo | W1 |
| T022-2 | `CASH_NEGATIVE`: phiếu chi trước phiếu thu cùng ngày → không báo; phiếu chi ngày trước phiếu thu ngày sau → báo ngày âm đầu tiên; bổ sung phiếu thu đúng ngày → hết | W2 |
| T022-3 | `DEBT_MATCH_LEDGER`: phiếu kế toán tay vào tài khoản công nợ thiếu đối tượng → báo; sửa phiếu → hết | W2 |
| T022-4 | `COGS_STALE`: tính giá vốn tháng 3 rồi nhập phiếu mua tháng 3 → báo; tính lại → hết | W2 |
| T022-5 | Bộ chạy: mọi ca ✔ có `expect` khớp **và** `afterFix` khớp | W3 |
| T022-6 | Bộ chạy: mọi ca ⛔ bị từ chối đúng mã (UNBALANCED_ENTRY, FORBIDDEN, PERIOD_LOCKED, IDEMPOTENCY_CONFLICT…) | W3 |
| T022-7 | Bộ chạy: ca ○ / ☐ không làm đỏ bảng điểm, có lý do + ticket | W3 |
| T022-8 | `core.review.board`: ba vai cùng dữ liệu, khác thứ tự nhóm; không số tiền; đơn vị chỉ thấy mình; `recheck` chỉ chạy đúng một mã | W4 |
| T022-9 | Biên bản: có danh sách ca, trạng thái, xác nhận cảnh báo (người, lý do, lúc), dòng "không phải kết luận của cơ quan nhà nước" | W4 |
| T022-10 | Không có route / nút nào trong HT08 ghi sổ, tắt kiểm, bỏ qua (quét action `effect: write` của module review = chỉ `recheck` lưu lượt chẩn đoán) | W4 |

## Log

| Lúc | Ai | Việc |
|---|---|---|
| 2026-11-02 19:00 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | "duy trì 2 phương án, cảnh báo và phương án xử lý… chạy 1 loạt các giả định lỗi… đóng vai kế toán trưởng, audit – ban kiểm soát, thanh tra thuế… scoreboard checklist… warning lỗi phải kèm phương án khắc phục cụ thể" → mở PHASE-022, W0 tài liệu + bản mẫu |
| 2026-11-02 20:20 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | "mockup ok rồi, code nhé" → W1: bizcity_remedy@1, remedy cho mọi kiểm + bảng kiểm khoá kỳ, SC-FIX-1, RemedyView ở dải cảnh báo |
| 2026-11-02 21:20 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | W2: 8 kiểm mới cho khoảng trống (quỹ âm, dư sai bên, trung gian ≠ 0, công nợ ≠ sổ, giá vốn lỗi thời, điều chỉnh kho thiếu lý do, khấu hao chưa trích, lịch kiểm chuẩn) |
| 2026-11-02 22:00 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | W3: danh mục máy đọc + bộ chạy giả định lỗi; bảng điểm 63 đạt / 29 chưa làm / 0 trượt |
| 2026-11-02 22:40 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | W4: Bàn đánh giá HT08 (API theo vai, kiểm lại một mã, biên bản in), vai trò `auditor`; sửa phần đầu checklist bị lần vá W1 ghi đè |
