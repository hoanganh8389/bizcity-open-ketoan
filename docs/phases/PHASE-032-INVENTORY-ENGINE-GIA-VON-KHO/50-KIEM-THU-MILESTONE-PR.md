# PHASE-032 · 50 — Kế hoạch kiểm thử, mốc và kế hoạch PR
<!-- [2026-11-09 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — W0: bốn tầng kiểm (thuần · parity · golden · bất biến), mốc M0–M5, kế hoạch PR theo R-FLOW (giữ chỗ → chữ chốt → code), bảng điểm -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

## 1. Bốn tầng kiểm

| Tầng | Kiểm gì | Ở đâu | Chặn gì |
|---|---|---|---|
| **Hàm thuần** | `average.ts`, `fifo.ts`, `specific.ts`, `reverseAllocation`, `pickLots`: bảng số, `vectors` của Rule Contract (plugin viết lại dùng chung) | `packages/contracts/test/costing/*.test.ts` | merge |
| **Parity** | T032-P1: engine lớp = `costing.service.ts` cũ trên fixture + bản sao dữ liệu thật (ẩn danh, script `scripts/costing-parity.mjs` in bảng lệch) | `apps/api/test/costing-parity.test.ts` | merge W2 |
| **Golden** | T032-G1..G9, C1, L1 — kịch bản end-to-end qua cửa nạp → Engine → Kernel → báo cáo → lineage | `apps/api/test/golden/t032-*.test.ts`, chạy cùng `T026-G*` trong CI | phát hành (D026-7) |
| **Bất biến** | `db-rules`: bảng Engine chỉ thêm, không `account*`, quyền ghi; SC-INV-1 / 2; `assertLedgerInvariants` + `CT-COST-004` sau mỗi test ghi sổ; `doi-chieu` sổ chi tiết lô / lớp (K-030-12) | `apps/api/test/db-rules.test.ts`, `tests/conformance/checks/inventory/**`, `selfcheck --strict` | đẩy nhánh (R-FLOW-5) |

Thêm: **hiệu năng** (W2: 50.000 item × 1 kỳ ≤ 60 s máy dev; FIFO 1.000 lớp / item không quá tuyến tính × 2), **hồi quy báo cáo** (nhập xuất tồn ACC83, lãi gộp BH04, đối chiếu kho `GET /inventory/reconcile` ra cùng số trước / sau W2), **tài liệu khớp mã** (SC-DOC-5 route ↔ `bizcity_inventory@1`).

## 2. Mốc

| Mốc | Nội dung | Điều kiện đạt | Dự kiến |
|---|---|---|---|
| **M0** | W0 duyệt | ADR-0033 Chấp nhận; Q032-1..5 có trả lời; bản mẫu duyệt | khi chủ dự án duyệt |
| **M1** | Lô ở Kernel | S032-8..10 ✅; T032-L1; mua hàng gửi `lotRef`; Q030-2 đóng ở PHASE-030 | M0 + 1 tuần |
| **M2** | Bình quân trên lớp | S032-12..14 ✅; **P1 đạt**; `inventory_costs` khung nhìn; báo cáo hồi quy xanh | M1 + 2 tuần |
| **M3** | FIFO & đảo chiều | S032-15..18 ✅; G1–G4, G6, G7 xanh; skill C1 FIFO ✅ | M2 + 2 tuần |
| **M4** | Cổng & kết chuyển | S032-19..22 ✅; G5, G8, G9, C1; trụ cột III cập nhật | M3 + 1 tuần |
| **M5** | Giao diện | S032-23..25 ✅; ảnh chụp `evidence/`; hướng dẫn viết lại | song song từ M2, đóng sau M4 |

Sau M4 mới mở phase **Kết chuyển & khoá sổ** (đọc `costing_runs`, kết chuyển là dữ liệu, khoá kỳ đa chiều — tiếp PHASE-029 / 030 cuối kỳ).

## 3. Kế hoạch PR (R-FLOW: giữ chỗ → chữ chốt → code; nhánh ngắn)

| # | PR | Loại | Phạm vi (dòng CLAIMS) | Phụ thuộc |
|---|---|---|---|---|
| 1 | **W0 tài liệu** (nhánh này): PHASE-032, ADR-0033, R-INV, R-ITEM-10, `bizcity_inventory@1`, bản mẫu, hướng dẫn | tài liệu thuần — không cần giữ chỗ | — | — |
| 2 | Giữ chỗ W1 + chữ chốt W1 ([00 §6](00-MASTER-PLAN.md), `bizcity_inventory@1` §2 / §5 / §6, `bizcity_ledger_intake@1` minor, số migration) | tài liệu | `docs/phases/PHASE-032-…/**`, `docs/contracts/BIZCITY-INVENTORY-v1.md`, `docs/contracts/BIZCITY-LEDGER-INTAKE-v1.md` | #1 merge, ADR Chấp nhận |
| 3 | W1a migration lô + phân loại `lot_tracking` + khung nhìn số dư + `schema-catalog` | code K3 | `db/migrations/<n>_lo_o_kernel.sql`; `packages/kernel/src/modules/inventory/lots.*`; `apps/api/src/modules/system/schema-catalog.ts` (+ khoá) | #2 |
| 4 | W1b cửa nạp `lotRef` / `originalLineRef`, `IN-INV-010..013`, bài học, mua hàng ánh xạ | code K2 | `packages/contracts/src/documents.ts` (+ trường), `packages/kernel/src/modules/intake/**`, `apps/api/src/phan-he/mua-hang/posting.ts`, `docs/huong-dan/loi-dau-vao/IN-INV-01*.md` | #3 |
| 5 | W1c hook `pickLots`, API đọc, action trạng thái lô, sự kiện | code K1 | `packages/platform/src/core/hooks.ts` (+ id), `packages/kernel/src/modules/inventory/pick-lots.*`, routes | #3 |
| 6 | Giữ chỗ + chữ chốt W2 (khuôn bốn bảng, `CostingResult`, tham số Rule Contract) | tài liệu | như #2 | #3 |
| 7 | W2a migration lớp / phân bổ / run + SC-INV-1 / 2 | code K3 | migration; `tests/conformance/checks/inventory/**`; fixture | #6 |
| 8 | W2b engine bình quân trên lớp + `run` / `settle` + parity (**không merge khi P1 lệch**) + `inventory_costs` khung nhìn | code K3 | `packages/kernel/src/modules/inventory/costing*.ts`, `packages/contracts/src/costing/**`, test | #7 |
| 9 | Giữ chỗ + chữ chốt W3 (Rule Contract ba phương pháp; số liệu [35](35-GOLDEN-CASES.md) chốt) | tài liệu | — | #8 |
| 10 | W3a Rule Contract `core.costing.method@1` + N031-1 (dời rule-contracts xuống Platform) | code K2 | `packages/platform/src/core/rule-contracts/**` (mới), sửa import PHASE-031 | #9 |
| 11 | W3b FIFO / đích danh / opening + G8-ready | code K3 | engine | #10 |
| 12 | W3c đảo chiều (`reverses_allocation_id`), bán hàng gửi `originalLineRef`, G1–G4 | code K3 | engine; `apps/api/src/phan-he/ban-hang/**`; golden | #11 |
| 13 | W3d chuyển kho giữ giá trị, cặp chứng từ liên đơn vị, G6–G7 | code K3 | engine; `core.intercompany.pricing@1` | #11 |
| 14 | Giữ chỗ + chữ chốt W4 (phép kiểm chặn mới → RULE-QUALITY-GATE; mã vào `bizcity_findings@1`) | tài liệu | — | #12 |
| 15 | W4a `stock_count` + snapshot + G5 | code K3 | `packages/contracts/src/documents.ts` (+ docType, R-POST-9 trọn gói) | #14 |
| 16 | W4b cổng `CT-INV-*`, `CT-COST-*`, `DG-CLOSE-*`, Sẵn sàng khoá kỳ, đối soát là dữ liệu, trụ cột III, G8 / G9 / C1 | code K2 | `periods/**`, `closing/**`, `tru-cot.json`, conformance | #15 |
| 17 | W4c lineage 0.4.0 qua lớp | code K1 | `lineage/**`, `BIZCITY-LINEAGE-v1.md` | #8 |
| 18 | W5 giao diện (nhiều PR nhỏ theo màn) | code K1 | `apps/web/**`, hướng dẫn | #5, #8 |

Mỗi PR code: `nhan-viec.mjs kiem` xanh, gộp `origin/main`, `selfcheck --strict` đạt, CHANGELOG + checklist + `bang-viec.mjs --write` (sổ dùng chung). PR cuối mỗi đợt xoá dòng CLAIMS (R-FLOW-6). Số migration lấy lúc bắt đầu bằng `so-tiep-theo.mjs migration`, kiểm lại trước merge.

## 4. Bảng điểm phase (đọc ở HT10 khi W4 xong)

| Tiêu chí (trụ cột III) | Mã | Mức đạt mục tiêu |
|---|---|---|
| Tồn theo (kho, item, lô) dựng lại được từ sự việc, không âm | CT-INV-001, CT-INV-004 | đạt |
| Lô quá hạn được xử lý trong kỳ | CT-INV-002 | đạt |
| Mọi dòng xuất có phân bổ hiện hành; Σ phân bổ = sổ | CT-COST-001, 003 | đạt |
| Tồn theo lớp = số dư TK hàng tồn kho | CT-COST-004 | đạt |
| Đảo chiều hoàn đúng gốc | CT-COST-010, 011 | đạt |
| Phương pháp đúng bản hiệu lực; đổi không viết lại lịch sử | CT-COST-012, T032-G9 | đạt |
| Kết chuyển chỉ sau khi giá vốn chốt | DG-CLOSE-1, 2 | đạt |
| Bảng Engine không có tài khoản; Engine không ghi sổ | SC-INV-1, 2 | đạt |
