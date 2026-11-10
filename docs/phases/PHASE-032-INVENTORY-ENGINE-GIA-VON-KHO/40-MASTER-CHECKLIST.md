# PHASE-032 · 40 — Checklist
<!-- [2026-11-09 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — W0: việc con S032-*, ca T032-*, nhật ký -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

Ký hiệu: ☐ chưa · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài · ⏸ hoãn.

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S032-1 | ADR-0033 đề xuất; README (hiện trạng đọc mã `27407c07`); [00](00-MASTER-PLAN.md); [10](10-KIEN-TRUC.md); [20](20-MA-HANG-VA-MA-TAI-KHOAN.md); [30](30-FIFO-FEFO-VAN-HANH-KHO.md); [35](35-GOLDEN-CASES.md); [50](50-KIEM-THU-MILESTONE-PR.md); checklist | W0 | P0 | không | ✅ 2026-11-09 |
| S032-2 | Luật R-INV (RULE-INVENTORY.md), R-ITEM-10; hợp đồng `bizcity_inventory@1` 0.1.0-draft; dòng CANON §3, chỉ mục ADR, phases README, CHANGELOG | W0 | P0 | không | ✅ 2026-11-09 |
| S032-3 | Bản mẫu `mockups/inventory-engine.html`: kiến trúc tổng thể, mã hàng ≠ mã TK, chọn lô FIFO / FEFO, lớp & phân bổ (trả hàng 500.000 vs 600.000), chín tình huống, sẵn sàng khoá kỳ | W0 | P0 | không | ✅ 2026-11-09 |
| S032-4 | Hướng dẫn tính giá vốn (`docs/huong-dan/tinh-gia-von.md`), căn cứ ([can-cu/04](../../can-cu/04-hang-ton-kho-gia-von.md)), nghiệp vụ ([11](../../nghiep-vu/11-hang-hoa-gia-von-tu-goc.md)) thêm mục **Kiến trúc tổng thể** và chú thích "số tài khoản là ví dụ TT99, tra theo lý do → nhóm" ([20 §5](20-MA-HANG-VA-MA-TAI-KHOAN.md)) | W0 | P1 | không | 🟡 2026-11-09 tinh-gia-von.md + nghiep-vu/11 đã thêm; can-cu/04, preset tên nhóm, thẻ mặt hàng còn lại |
| S032-5 | Chủ dự án duyệt D032-1..10 (hoặc sửa); ADR-0033 → Chấp nhận | W0 | P0 | không | ✅ 2026-11-09 chủ dự án duyệt, theo bước thắng nhỏ (00 §6a) |
| S032-6 | Kế toán trưởng trả Q032-1 (phạm vi nhóm tính giá), Q032-5 (hoàn không có gốc); nhóm Lõi trả Q032-2 (nhịp FIFO), Q032-3 (thiếu lớp); chủ dự án trả Q032-4 (module Kho) | W0 | P0 | không | 🟡 Q032-4 ✅ theo đề nghị; Q032-1 / 2 / 3 / 5 dùng đề nghị làm mặc định tạm, chờ người trả xác nhận |
| S032-7 | Chữ chốt W1 (R-FLOW-2): migration lô (số bằng `so-tiep-theo`), minor `bizcity_ledger_intake@1` (`lotRef`, `originalLineRef`), hook `inventory.pickLots`, quyền `inventory:*`; giữ chỗ CLAIMS | W1 | P0 | không | ☐ sau S032-5 |
| S032-8 | Migration `inventory_lots` + `inventory_movements.lot_id / line_key / original_line_ref`; `lot_tracking` ở phân loại mặt hàng (có phiên bản); khung nhìn `bizcity_read.inventory_balances`; RLS; `schema-catalog`; trigger trạng thái lô qua action | W1 | P0 | có | ☐ |
| S032-9 | Cửa nạp: `lotRef` (tra / tạo lô), `originalLineRef`; `IN-INV-010..013` + bài học `loi-dau-vao/IN-INV-01x.md`; khoá `bizcity.intake.lot_check`; mua hàng ánh xạ `data.lotNo / expDate` → `lotRef` | W1 | P0 | có | ☐ |
| S032-10 | Hook `inventory.pickLots` (FEFO / FIFO mặc định, exclude / prefer / minShelfDays) + `POST /inventory/pick-lots` + `GET /inventory/balances`, `/lots`; action `core.inventory.lot.status`; sự kiện `lot.status_changed`, `lot.expiring` (đồng hồ ngày) | W1 | P0 | có | ☐ |
| S032-11 | Chữ chốt W2: khuôn `valuation_layers`, `valuation_layer_sources`, `cost_allocations`, `costing_runs`; `CostingResult`; tham số Rule Contract `core.costing.method@1` (`purchaseReturnValuation`, `surplusValuation`, `scope`) | W2 | P0 | không | ☐ |
| S032-12 | Migration bốn bảng (chỉ thêm, trigger `superseded_by` / `journal_entry_id` một lần, **không cột `account*`**); SC-INV-1 / SC-INV-2 (phép kiểm tĩnh) + fixture `repo-bad` | W2 | P0 | có | ☐ |
| S032-13 | Engine bình quân tháng trên lớp (`period_pool`): hàm thuần `packages/contracts/src/costing/average.ts`; `costing.run` → `draft`; `costing.settle` → `CostingResult` → `eventStore`; `inventory_costs` thành khung nhìn dẫn xuất; `CT-COST-001..005` | W2 | P0 | có | ☐ |
| S032-14 | **T032-P1 parity** trên fixture + bản sao dữ liệu thật (ẩn danh): đơn giá 4 lẻ, giá trị xuất từng dòng, tồn cuối, quà 0, bán nội bộ giá bán, trả NCC theo tồn đầu, nhập Excel, mẫu ≤ 0 | W2 | P0 | có | ☐ chặn merge W2 |
| S032-15 | Rule Contract `core.costing.method@1` (`weighted_average_period · fifo · specific_identification`; `spec`, `vectors`), đăng ký Policy Registry, `resolvePolicy` theo kỳ; trả nợ N031-1 (Rule Contract xuống Platform để Kernel import) | W3 | P0 | có | ☐ |
| S032-16 | FIFO + đích danh trên lớp (`receipt`, `lot_id`); hàm thuần `fifo.ts`, `specific.ts`; `opening` cho kỳ chuyển đổi | W3 | P0 | có | ☐ |
| S032-17 | Đảo chiều hoàn đúng phân bổ gốc (`reverses_allocation_id`, tỷ lệ số lượng, còn được trả); bán hàng gửi `originalLineRef`; `CT-COST-010..012`; lô `quarantine` cho hàng trả hỏng — **T032-G1..G4** | W3 | P0 | có | ☐ |
| S032-18 | Chuyển kho giữ giá trị (chuyển lớp), cặp chứng từ liên đơn vị + `core.intercompany.pricing@1` — **T032-G6, G7** | W3 | P1 | có | ☐ |
| S032-19 | `stock_count` docType (K-030-4) + `core.inventory.count.snapshot`; chênh → `stock_adjustment` theo lý do; **T032-G5** | W4 | P1 | có | ☐ |
| S032-20 | Cổng: `CT-INV-001..004`, `DG-CLOSE-1 / 2`; Sẵn sàng khoá kỳ đọc `costing_runs` (R-INV-7), chấp nhận có lý do; đối soát sổ chi tiết là dữ liệu cho lô / lớp (K-030-12); tiêu chí trụ cột III trong `tru-cot.json` (`CT-INV-*`, `CT-COST-*`), sinh lại HT10 — **T032-C1** | W4 | P0 | có | ☐ |
| S032-21 | Golden chặn phát hành **T032-G8** (đổi SKU), **T032-G9** (đổi phương pháp, kỳ chuyển đổi, trả hàng chéo năm) vào CI cùng `T026-G*` | W4 | P0 | có | ☐ |
| S032-22 | Lineage qua lớp: `bizcity_lineage@1` 0.4.0 thêm nút `lot`, `layer`, `allocation`, `run`; `CostExplain` theo phương pháp; màn Hành trình | W4 | P1 | có | ☐ |
| S032-23 | Màn Kho › Lô & hạn dùng; ô chọn lô trong `@bizcity/ui-kit` (gợi ý, lý do khác gợi ý, cảnh báo); POS dùng `pick-lots` | W5 | P1 | có | ☐ |
| S032-24 | Màn Tính giá vốn theo **lần tính** (lớp, phân bổ, mã kiểm, so sánh, settle); Sẵn sàng khoá kỳ phần giá vốn; hướng dẫn `tinh-gia-von.md` viết lại; ảnh chụp `evidence/` | W5 | P1 | có | ☐ |
| S032-25 | Skill `open-ketoan-standard` C1 / C2 cập nhật trạng thái thật (FIFO ✅ khi W3 xong; lô ✅ khi W1); `docs/core/` hướng dẫn app gửi `lotRef` / `originalLineRef` | W5 | P2 | không | ☐ |
| S032-26 | **Sổ đăng ký phép kiểm** một chỗ: mã PC-001..023, nhịp (ngày · tuần · kỳ), mức theo nhịp, `remedy`, chủ việc; ánh xạ mã chẩn đoán hiện có (`INVENTORY_*`, `LEDGER_*`, `DEBT_MATCH_LEDGER`…) vào PC ([60 §3](60-SCOREBOARD-KE-TOAN.md)) | W0+ | P0 | có | ☐ |
| S032-27 | **Hộp việc hằng ngày**: chạy chẩn đoán L3 hiện có lúc 01:00 (`bizcity.clock.daily`, cạnh kiểm chuẩn đêm), lưu lượt, bảng B tối thiểu (HARD đang mở, tuổi việc, lệch kho ↔ sổ cái); nhịp tuần thêm lần tính giá nháp | W0+ | P0 | có | 🟡 B2a 2026-11-09: thẻ *Việc hôm nay* hiện việc từ tự chẩn đoán L3 khi mở thẻ ([evidence/B2a](evidence/B2a-viec-hom-nay.png)); lịch 01:00 xong ở B2c-1 (`core.diagnostics-nightly`); bảng B theo ngày còn lại |
| S032-28 | Khoá kỳ kéo theo **mọi chi nhánh cùng nhóm tính giá** (PC-015); không khoá lẻ một chi nhánh khi giá vốn là của nhóm | W4 | P0 | có | ☐ |
| S032-29 | `sourceDigest` lúc kiểm, kiểm lại trong **cùng giao dịch khoá** (PC-021); đầu kỳ = snapshot cuối kỳ trước, mở lại kỳ trước thì kỳ sau mất `settled` (PC-023) | W4 | P0 | có | ☐ |
| S032-30 | Mức HARD hẹp / REVIEW có lý do gắn `sourceDigest` theo [60 §6](60-SCOREBOARD-KE-TOAN.md); sửa R-DIAG-4 cho nhóm HARD — **sau khi chủ dự án trả Q032-6**; sửa `TRANSIT_NONZERO` sang định nghĩa CT-INV-003 mới | W4 | P0 | có | 🟡 B2b 2026-11-09: `TRANSIT_NONZERO` hết báo sai (còn treo quá 30 ngày / nhận nhiều hơn xuất); mức chặn hẹp D032-11 + `sourceDigest` còn ở B7 |
| S032-31 | **Bảng điểm tuần**: mỗi (tuần, kỳ, phạm vi) một bản chụp chỉ thêm từ `diagnostic_runs` + đối chiếu (chỉ số §9 của [60](60-SCOREBOARD-KE-TOAN.md)), `sourceDigest`; tuần vắt hai tháng tách hai dòng theo kỳ | W0+ | P0 | có | ☐ |
| S032-32 | **Chốt tuần (mềm)**: kế toán đánh dấu *Đã xem tuần* — mọi việc của tuần có người nhận hoặc lý do; không khoá dữ liệu; chứng từ ghi lùi vào tuần đã chốt hiện *đổi sau khi chốt tuần* (nhắc, không chặn) | W0+ | P1 | có | ☐ |
| S032-33 | **Bảng điểm tháng**: tổng các tuần + phép kiểm chỉ chạy ở kỳ + kết quả khoá; lưu cùng nhật ký khoá làm hồ sơ bằng chứng của kỳ; so tháng trước (phát hiện mới ở cổng kỳ, ngày từ cuối tháng tới khoá) | W4 | P1 | có | ☐ |
| S032-34 | **Ma trận thời gian** tiêu chí × tuần / tháng ([60 §10](60-SCOREBOARD-KE-TOAN.md)): đọc bản chụp S032-31 / 33, mốc M0..M4 từ checklist; `GET /api/v1/closing/scoreboard` chỉ đọc; màn kèm bấm ô ra việc và bản chụp | W4 | P1 | có | ☐ |
| S032-35 | Trường mới của `DiagCheck` (`closeRef`, `cadence`, `stage`, `severityAtClose`, `owner`, `scopeBy`); gắn `closeRef` cho mọi chẩn đoán L3 đang có ([70 §3](70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md)) | W0+ | P0 | có | 🟡 B2c-2: `closeRef` trên 46 kiểm, sổ 23 PC (`CLOSE_CONDITIONS`), kỳ kiểm / bước / mức khi khoá trong kết quả, *Việc hôm nay* hiện bằng lời kế toán; test `close-conditions.test.ts`. Còn: mức *chặn* (S032-30), `scopeBy` (S032-28), SC-DIAG-2 tĩnh |
| S032-36 | **Khoá thử hôm nay** đủ năm bước (R-DIAG-14): `periods/check` + giá vốn tính tạm + `closing/preview` + kiểm sau kết chuyển + kiểm lúc khoá; không ghi sổ; chạy mỗi sáng tuần cuối tháng | W0+ | P0 | có | 🟡 B1 2026-11-09: thẻ *Khoá thử hôm nay* chạy bước 1, 3, 4 trên `periods/check`, cảnh báo kiểm chuẩn, `closing/preview`; bước 2 (giá vốn tạm) và 5 (quyền, phạm vi) ghi "chưa tự kiểm được"; chạy mỗi sáng chưa làm ([evidence/B1](evidence/B1-khoa-thu-hom-nay.png)) |
| S032-37 | SDK `defineCheck` + `extensions.checks` của `bizcity_module@1` (R-DIAG-15) | W4 | P1 | có | ☐ Q032-7 đã trả: mở rộng (D032-12) |
| S032-38 | Bảng "trường cần để kiểm" theo loại chứng từ ở `bizcity_ledger_intake@1`; trạng thái "không kiểm được" trên bàn (R-DIAG-16) | W1 | P1 | có | ☐ Q032-7 đã trả: mở rộng (D032-12) |
| S032-39 | **Bàn làm việc kế toán** năm thẻ từ HT08 (Việc hôm nay · Khoá thử hôm nay · Kết quả từng tuần, tháng · Sổ theo dõi các tháng · Phần mềm tự kiểm được gì), thuật ngữ [70 §7](70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md), nguồn `close_check` của hàng việc | W5 | P1 | có | 🟡 B1 2026-11-09: HT08 đổi tên *Bàn làm việc kế toán*, thẻ *Khoá thử hôm nay* (B1), *Việc hôm nay* (B2a), *Rà theo vai*; còn *Kết quả từng tuần, tháng* (B4), *Sổ theo dõi các tháng* (B9), *Phần mềm tự kiểm được gì* |
| N032-1 | Nợ ghi nhận: dữ liệu cũ không lô → lô `(không lô)` ẩn khi mặt hàng chuyển `required`; `line_key` điền từ `line_no` một lần | W1 | P1 | có | ☐ |
| N032-2 | Nợ: E1 (`ledger_fill_cost_lines`, 0091) chỉ còn cho dòng `cost_fill` của dữ liệu trước 22/10/2026; khi mọi phiếu cũ đã định khoản lại → đề xuất ADR gỡ E1 | W4 | P2 | có | ☐ |

## Ca bằng chứng

| Ca | Nội dung | Đợt | Trạng thái |
|---|---|---|---|
| T032-P1 | parity bình quân tháng lớp = `inventory_costs` | W2 | ☐ |
| T032-G1 | khách trả 5 / 30 hoàn 500.000 theo phân bổ gốc, không 600.000; hỏng → quarantine | W3 | ☐ |
| T032-G2 | trả nhiều lần, lần vượt bị `CT-COST-011` | W3 | ☐ |
| T032-G3 | trả NCC về lớp gốc, chênh lệch theo lý do | W3 | ☐ |
| T032-G4 | huỷ hết hạn đúng lô, giá trị theo phương pháp, TK theo lý do | W3 | ☐ |
| T032-G5 | kiểm kê thiếu / thừa có snapshot, `CT-INV-004` | W4 | ☐ |
| T032-G6 | chuyển kho cùng đơn vị giữ giá trị, 1579 về 0 | W3 | ☐ |
| T032-G7 | hai pháp nhân: cặp chứng từ, công nợ nội bộ đối ứng | W3 | ☐ |
| T032-G8 | đổi SKU: hash CostingResult không đổi | W4 | ☐ |
| T032-G9 | đổi phương pháp: bản 2 từ 01/01, lớp opening, trả hàng chéo năm | W4 | ☐ |
| T032-C1 | kết chuyển bị chặn khi run chưa `settled`; `DG-CLOSE-2` sau settle lại | W4 | ☐ |
| T032-L1 | FEFO / FIFO pick-lots: ba lô A / B / C ra đúng thứ tự; loại quarantine / hết hạn; `minShelfDays` | W1 | ☐ |

## Nhật ký

| Thời điểm | Ai | Việc |
|---|---|---|
| 2026-11-10 22:45 | Claude Code (phiên PHASE-032) | Chủ dự án hỏi cách thể hiện tách sổ kho (item_id, cha, biến thể) khỏi ghi sổ cái → [10 §2a](10-KIEN-TRUC.md) *Hai sổ, một cầu nối*: sơ đồ, bảng hai sổ, sáu luật T-1..T-6 (đề xuất), ba khối màn cho kế toán. Đọc mã: giá vốn đã tính theo (nhóm tính giá × item_id); `costing.service` còn đọc `ledger_lines` hai chỗ (T-1, dọn ở B6); `INVENTORY_LEDGER_MISMATCH` còn so theo mã (T-6). Hỏi **Q032-9** (cha có biến thể có được tồn kho không). |
| 2026-11-10 22:10 | Claude Code (phiên PHASE-032) | Bằng chứng B2c-2: bộ Docker dev dựng lại theo main d2ac69b5 (#261, sao lưu trước), L3 trả closeRef / kỳ kiểm / bước cho cả 40 kiểm L3 — [evidence/B2c-2-dieu-kien-khoa-api.txt](evidence/B2c-2-dieu-kien-khoa-api.txt). CSDL demo chưa có chứng từ nên chưa có việc để chụp dòng *Điều kiện khoá sổ* trên màn; chụp khi có số liệu thật. |
| 2026-11-10 22:20 | Claude Code (phiên PHASE-032) | **B2c-2 phép kiểm mang điều kiện khoá sổ** (S032-35): Platform thêm `CloseCondition`, `registerCloseConditions`, `closeRef` / `cadence` / `stage` / `severityAtClose` trên `DiagCheck` và trường gộp trên kết quả; Kernel khai 23 PC; 46 kiểm gắn `closeRef` (41 PC, 5 `none`); *Việc hôm nay* ghi điều kiện, kỳ kiểm, bước, mức khi khoá. Khoá kỳ thật không đổi; không migration. Trả giữ chỗ (R-FLOW-6). |
| 2026-11-10 21:35 | Claude Code (phiên PHASE-032) | **Chữ chốt B2c-2** (S032-35, R-FLOW-2): [RULE-SELF-DIAGNOSTICS §2b](../../rules/RULE-SELF-DIAGNOSTICS.md) — `closeRef` trên phép kiểm, kỳ kiểm / bước khoá trên PC (Kernel khai, Platform giữ sổ `registerCloseConditions`), người làm dùng `remedy.owner`, `severityAtClose` mặc định giữ khoá thật hôm nay, `scopeBy` hoãn S032-28; không migration. Bảng gắn 46 mã ở [70 §3a](70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md). Giữ chỗ phần mã. |
| 2026-11-09 23:55 | Claude Code (phiên PHASE-032) | **B2c-1 tự chẩn đoán mỗi đêm** (S032-27 phần lịch): subscriber `core.diagnostics-nightly` trên `bizcity.clock.daily` 01:00, lượt L3 `trigger = schedule`; *Việc hôm nay* đọc lượt đêm nay, không có thì chạy ngay. Test `diagnostics-nightly.test.ts` (một lượt, chạy lại cùng ngày không thêm). K1 theo khuôn subscriber có sẵn. Trả giữ chỗ (R-FLOW-6). |
| 2026-11-09 23:25 | Claude Code (phiên PHASE-032) | **B2b hết báo sai hàng đi đường** (S032-30 phần CT-INV-003 / 005): `TRANSIT_NONZERO` tính *còn treo* = số dư − Σ Nợ 30 ngày gần nhất; báo khi còn treo hoặc số dư âm; hàng đi đường trong 30 ngày hợp lệ. Lane DG-PLAN-4 cùng chữ; test phase022 thêm ca 15 ngày không báo; DIAGNOSTICS.md, hướng dẫn, bỏ ghi chú ở Việc hôm nay. K2 chỉ phép kiểm. Trả giữ chỗ (R-FLOW-6). |
| 2026-11-09 23:00 | Claude Code (phiên PHASE-032) | **B2a Việc hôm nay** (S032-27 phần hiện việc, S032-39 thẻ 1): `ViecHomNay.tsx` — tự chẩn đoán L3 khi mở thẻ (API có sẵn, lưu lượt làm bằng chứng), việc theo người làm, nhãn lời kế toán, Kiểm lại từng mã; ghi chú báo sai của `TRANSIT_NONZERO` (sửa ở B2b). Chỉ giao diện (K1). Ảnh trên bộ Docker theo `main` ([evidence/B2a](evidence/B2a-viec-hom-nay.png)). Trả giữ chỗ (R-FLOW-6). |
| 2026-11-09 23:10 | Claude Code (phiên PHASE-032) | **B1 Khoá thử hôm nay** (S032-36, S032-39 một phần): `KhoaThuHomNay.tsx`, HT08 đổi tên Bàn làm việc kế toán, hướng dẫn `ban-danh-gia.md`; chỉ giao diện, không API mới (K1). Kết luận khớp khoá thật hôm nay: chỉ lỗi toàn vẹn sổ và cảnh báo kiểm chuẩn đòi lý do. Bản cài chưa có kiểm chuẩn (404) ghi "chưa tự kiểm được". Ảnh trên bộ Docker máy dev ([evidence/B1](evidence/B1-khoa-thu-hom-nay.png)). Trả giữ chỗ (R-FLOW-6). |
| 2026-11-09 22:05 | Claude Code (phiên PHASE-032) | Chủ dự án duyệt D032-1..10 (*"đồng ý theo quan điểm smallwin để dễ dùng, dễ sử dụng"*): ADR-0033 Chấp nhận; Q032-4 theo đề nghị; thêm [00 §6a](00-MASTER-PLAN.md) chín bước thắng nhỏ B1..B9, mỗi bước kế toán dùng được ngay; Q032-1 / 2 / 3 / 5 dùng đề nghị làm mặc định tạm. |
| 2026-11-09 21:45 | Claude Code (phiên PHASE-032) | Chủ dự án trả **Q032-7 = mở rộng** (D032-12: R-DIAG-10..16 vào RULE-SELF-DIAGNOSTICS, hiệu lực theo từng việc có mã) và **Q032-8 = đổi HT08 thành Bàn làm việc kế toán** (D032-13). S032-35..39 hết chặn. |
| 2026-11-10 01:20 | Claude Code (phiên PHASE-032) | Rà CANON / luật / hợp đồng ([70](70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md)): đề xuất R-DIAG-10..16 mở rộng (không hợp đồng mới), module tự khai phép kiểm, "kiểm được" ở khuôn nạp, Bàn làm việc kế toán từ HT08, Khoá thử đủ năm bước (dựa `periods/check` + `closing/preview` có sẵn), thuật ngữ cho kế toán; Q032-7 / 8; S032-35..39; bản mẫu đổi sang lời kế toán, sửa PC-008 (cần giải trình, không chặn). |
| 2026-11-10 00:45 | Claude Code (phiên PHASE-032) | Ma trận thời gian tiêu chí × tuần / tháng kèm mốc ([60 §10](60-SCOREBOARD-KE-TOAN.md)), góc nhìn D trong bản mẫu (kiểm bằng Chrome headless: hạt tuần, hạt tháng, không tràn ngang ở 512 px); S032-34. |
| 2026-11-10 00:20 | Claude Code (phiên PHASE-032) | Chủ dự án chọn **C** cho Q032-6 → D032-11 (ADR-0033), ngoại lệ ở R-DIAG-4, S032-30 hết chặn. Thêm bảng điểm tuần / tháng và chốt tuần mềm ([60 §9](60-SCOREBOARD-KE-TOAN.md)): S032-31..33. |
| 2026-11-09 23:55 | Claude Code (phiên PHASE-032) | Scoreboard kế toán [60](60-SCOREBOARD-KE-TOAN.md): đối chiếu PC-001..023 với mã `origin/main` `90697182` (5 có · 15 một phần · 3 chưa); ba nhịp ngày · tuần · kỳ; sửa CT-INV-003 (hàng đi đường qua ngày khoá là hợp lệ), FEFO không chặn khoá; thêm S032-26..30, Q032-6; bản mẫu `bang-diem-ke-toan.html`. |
| 2026-11-09 23:30 | Claude Code (phiên PHASE-032) | W0: đọc `origin/main` `27407c07`; lập phase, ADR-0033 đề xuất, R-INV, R-ITEM-10, `bizcity_inventory@1` nháp, bản mẫu, hướng dẫn tính giá vốn thêm kiến trúc tổng thể. Chưa giữ chỗ code; chờ chủ dự án duyệt D032-1..10. |
