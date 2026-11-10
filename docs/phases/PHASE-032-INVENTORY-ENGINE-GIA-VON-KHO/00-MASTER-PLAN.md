# PHASE-032 · 00 — Master plan
<!-- [2026-11-09 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — W0: vì sao, bốn liên tục, D032-1..10 (ánh xạ ADR-0033), Q032-1..5, ba phương án, đợt W0–W5, ai làm gì -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Đã duyệt 2026-11-09** — chủ dự án duyệt D032-1..10 (*"đồng ý theo quan điểm smallwin để dễ dùng, dễ sử dụng"*); ADR-0033 Chấp nhận. Làm theo bước thắng nhỏ ở §6a.

## 1. Vì sao

Để kế toán **tự động, gợi ý, trợ giúp** mà vẫn đúng, Open Kế Toán phải bảo đảm **đồng thời bốn liên tục** (đề bài chủ dự án 2026-11-09):

| # | Liên tục | Nghĩa | Hôm nay (`origin/main` `27407c07`) |
|---|---|---|---|
| 1 | **Identity Continuity** | một hàng, một `item_id` bất biến, dù đổi SKU, tên, nhóm, biến thể | ✅ `items.item_id`, `item_codes`, sổ / kho / giá vốn khoá theo `item_id` (PHASE-024 B2b, G2) |
| 2 | **Inventory Continuity** | hàng ở đâu, lô nào, nhập từ đâu, đã xuất cho giao dịch nào, còn bao nhiêu | 🟡 có số lượng theo kho; **không có lô / hạn** ở Kernel; không `original_line_ref` |
| 3 | **Cost Continuity** | giá gốc bao nhiêu, phân bổ ra sao, điều chỉnh tác động thế nào | 🟡 bình quân tháng; **không lớp, không phân bổ**; hoàn trả hàng lấy giá tháng trả |
| 4 | **Accounting Continuity** | ánh xạ đúng tài khoản, ghi sổ, đối chiếu, kết chuyển, khoá kỳ, không đứt lịch sử | 🟡 sổ cái bất biến, lineage chỉ đọc; **kết chuyển không chờ giá vốn**; sổ chi tiết ↔ sổ cái chưa thành cổng |

Thiếu (2) và (3) thì (4) không thể tự động: Kernel ghi Nợ giá vốn / Có kho một con số mà không ai giải thích được con số đó đến từ phiếu nhập nào, và kết chuyển lãi lỗ chạy trên giá vốn chưa chốt. Phase này dựng **Inventory Engine** để đóng (2), (3) và cài cổng cho (4). **Kết chuyển / khoá kỳ (phase sau) chỉ ổn khi phase này xong.**

## 2. Nguyên tắc (đề bài 09/11)

1. **Inventory Engine** quản lý số lượng, lô, giá trị tồn; **Accounting Kernel** là nơi duy nhất ghi sổ cái. Engine gửi **kết quả tính giá đã kiểm chuẩn** để Kernel hạch toán, **không tự sửa Ledger**.
2. **Không dùng mã tài khoản làm định danh hàng.** Một hàng đi qua nhiều tài khoản trong vòng đời; cái bất biến là `item_id` và **chuỗi tham chiếu chứng từ**.
3. **Mọi nghiệp vụ đảo chiều phải biết nó đảo giao dịch nào, số lượng nào, giá trị nào, thuộc phiên bản chính sách nào.**
4. Giữ các quyết định đã có: bình quân tháng mặc định, FIFO / FEFO là xuất lô (ADR-0021 D025-2); lớp + phân bổ chỉ thêm (R-CONT-2); giá vốn sau ghi sổ (R-POST-7); mặc định cho phép, nhắc khi sai (ADR-0020); phân hệ ở `modules/` (ADR-0024); chính sách có phiên bản ở Policy Registry (ADR-0031).

## 3. Quyết định (D032-*, chủ dự án duyệt 2026-11-09)

Bảng đầy đủ ở [ADR-0033 · Quyết định](../../adr/ADR-0033-inventory-engine-gia-von-kho.md#quyết-định). Tóm tắt và chỗ thi hành:

| Mã | Một câu | Thi hành |
|---|---|---|
| D032-1 | Engine là năng lực Kernel; chỉ Kernel ghi sổ; module Kho làm chứng từ / vận hành / UI | [10 §2](10-KIEN-TRUC.md), R-INV-1, SC-INV-1 |
| D032-2 | Bốn liên tục là khung đo; tiêu chí `CT-INV-*`, `CT-COST-*` vào trụ cột III | `tru-cot.json` (S032-20) |
| D032-3 | Mã hàng ≠ mã tài khoản; bảng Engine không có cột tài khoản | [20](20-MA-HANG-VA-MA-TAI-KHOAN.md), R-ITEM-10, R-INV-2, SC-INV-2 |
| D032-4 | Lô ở Kernel (`inventory_lots`, `lot_id`, `lot_tracking` theo mặt hàng, `lotRef` ở cửa nạp) — trả Q030-2 | W1, `bizcity_inventory@1` §2 / §6 |
| D032-5 | Quy tắc xuất lô FEFO / FIFO là vận hành (hook `inventory.pickLots`, chính sách `suggest` mặc định) — không đổi giá vốn | [30](30-FIFO-FEFO-VAN-HANH-KHO.md), W1 |
| D032-6 | Phương pháp tính giá = `core.costing.method@1` có phiên bản; một mô hình lớp + phân bổ; bình quân chuyển sang lớp trước (parity) rồi mới FIFO | W2, W3 |
| D032-7 | Đảo chiều hoàn đúng phân bổ gốc theo tỷ lệ; hàng trả hỏng → lô `quarantine` | W3, [35 G1–G4](35-GOLDEN-CASES.md) |
| D032-8 | Cost Settlement (`costing_runs.settled`) trước Period Closing; chặn có lý do | W4, R-INV-7 |
| D032-9 | Chuyển kho cùng đơn vị giữ giá trị; khác pháp nhân = cặp chứng từ bán / mua nội bộ | W3, [35 G6–G7](35-GOLDEN-CASES.md) |
| D032-10 | Đổi SKU, đổi phương pháp không viết lại lịch sử; là Golden chặn phát hành | W4, [35 G8–G9](35-GOLDEN-CASES.md) |

## 4. Câu hỏi (Q032-*)

| Mã | Câu hỏi | Đề nghị | Ai trả |
|---|---|---|---|
| Q032-1 | **Phạm vi nhóm tính giá** (`valuation_pool`): đơn vị hạch toán (như hôm nay) hay cho phép theo kho? | Mặc định đơn vị hạch toán; cho phép tách theo kho qua chính sách `core.costing.method@1.scope` khi đơn vị cần (VAS 02 cho phép theo từng kho nếu nhất quán) | kế toán trưởng |
| Q032-2 | **Nhịp tính FIFO**: theo kỳ (batch như bình quân hôm nay) hay tính dần khi ghi sổ? | Theo kỳ, có **xem trước** theo dòng (`costing.run` `draft` chạy được bất cứ lúc nào, không ghi sổ); phiếu nhập ghi lùi ngày → run mới thay run cũ trong kỳ **chưa khoá** (R-CONT-2, ADR-0021 phản biện 2) | nhóm Lõi |
| Q032-3 | **Dòng xuất thiếu lớp** (bán trước khi nhập ghi sổ, tồn âm tạm): chặn, hay cho qua với lớp tạm? | Cho qua ở `draft` với `CT-COST-005` (lớp đơn giá 0 / thiếu lượng); **không `settle`** được khi còn mã chặn — kế toán sửa chứng từ nhập hoặc chấp nhận có lý do | nhóm Lõi |
| Q032-4 | **Ai làm module Kho** (`modules/kho`: phiếu chuyển, kiểm kê, cách ly, huỷ; PHASE-030 · 51)? Phase này chỉ Engine + hook + API | ✅ **Đã duyệt theo đề nghị (2026-11-09).** Phase này không làm chứng từ kho; `stock_count` docType (K-030-4) đặt ở W4 vì Engine cần snapshot; module Kho mở phase / đợt riêng sau W1 | chủ dự án |
| Q032-6 | **Mức HARD không miễn trừ**: bản mẫu PHASE-033 không cho miễn trừ HARD kể cả admin; R-DIAG-4 hôm nay cho khoá với lý do ≥ 10 ký tự; ADR-0020 mặc định cho phép | Nhóm HARD **hẹp** (PC-006, 009 sau settle, 016, 019, 021, 023): không miễn trừ vì cách thoát luôn là sửa chứng từ hoặc chạy lại; còn lại REVIEW một người có lý do + bằng chứng gắn `sourceDigest`; tách nhiệm là tuỳ chọn của đơn vị ([60 §6](60-SCOREBOARD-KE-TOAN.md)). <!-- [2026-11-10 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — Q032-6 chủ dự án chọn C --> **✅ Chủ dự án trả 2026-11-09: phương án C** (D032-11) | chủ dự án |
| Q032-7 | **Chuẩn hoá bảng kiểm**: mở rộng R-DIAG-10..16 + trường `DiagCheck` + minor `bizcity_module@1` / `bizcity_ledger_intake@1` / `bizcity_event@1`, hay thêm hợp đồng riêng? | ✅ **Đã trả (2026-11-09): mở rộng** → D032-12. Không hợp đồng thứ 25 (cùng tinh thần PHASE-030 · 21) — [70](70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md) | chủ dự án |
| Q032-8 | HT08 *Bàn đánh giá* đổi thành *Bàn làm việc kế toán* năm thẻ, hay mở màn mới? | ✅ **Đã trả (2026-11-09): đổi HT08** → D032-13. Giữ ba vai làm bộ lọc ([70 §5](70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md)) | chủ dự án |
| Q032-9 <!-- [2026-11-10 10:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — hai sổ, một cầu nối: tách Inventory Engine (theo item_id, cha, biến thể) khỏi ghi sổ cái; đề xuất T-1..T-6, Q032-9 --> | Sản phẩm cha **đã có biến thể** có được nhập, xuất, tồn kho trên chính mã cha không ([10 §2a](10-KIEN-TRUC.md) T-3)? | ⏳ Chờ chủ. **Đề nghị: không** — cha chỉ là tổng khi xem; giá vốn luôn tính theo biến thể. Chứng từ mang mã cha thì cửa nạp **nhắc** chọn biến thể (mặc định cho phép, R-GATE-9), chẩn đoán báo *"cha có tồn"* để dọn. Mặt hàng không có biến thể vẫn nhập xuất bình thường |
| Q032-5 | **Hoàn giá vốn khi không có gốc** (`CT-COST-010`): bình quân kỳ trả, hay lớp cũ nhất còn lượng, hay đơn giá tồn cuối kỳ trước? | Đơn giá **bình quân tồn đầu kỳ trả** của nhóm tính giá (ổn định, không bị kéo bởi nhập mới), ghi rõ trên phiếu; đơn vị đổi được qua tham số chính sách | kế toán trưởng |

## 5. Ba phương án đã cân nhắc cho Inventory Engine

| | A. Engine trong module Kho, Kernel chỉ nhận số | **B. Engine là năng lực Kernel; Kho là module chứng từ (chọn)** | C. Engine ghi thẳng dòng giá vốn lên bút toán |
|---|---|---|---|
| Ai giữ lô, lớp, phân bổ | module | **Kernel** (`modules/inventory`) | Kernel |
| Ai ghi sổ cái | Kernel, từ số module gửi | **Kernel, từ `CostingResult` của Engine** | Engine `UPDATE` dòng sổ |
| Đối chiếu sổ chi tiết ↔ sổ cái cùng giao dịch (R-LEDGER-11) | ✘ hai cơ sở dữ liệu logic | ✅ | ✅ |
| Một cửa ghi (R-LEDGER-4), vết tính lại | ✅ nhưng số không ai kiểm (skill C1 cảnh báo) | ✅ run có phiên bản, `CT-COST-*` trước khi ghi | ✘ phá một cửa, mất vết (đã bỏ 22/10/2026, 0091 thu quyền E1) |
| Module cộng đồng làm POS / kho | phải tự tính giá → hai sổ giá vốn | **chỉ kể sự việc + `lotRef`; đọc Engine** | như B |
| Chi phí | thấp ban đầu, nợ lớn | K3: ba migration, engine theo lớp, parity | thấp, sai nguyên tắc |
| Kết luận | loại | **chọn** | loại |

## 6. Các đợt

| Đợt | Nội dung | Mức | Giữ chỗ (R-FLOW) | Chữ chốt trước code (R-FLOW-2) |
|---|---|---|---|---|
| **W0** | tài liệu phase, ADR-0033, R-INV, R-ITEM-10, `bizcity_inventory@1` nháp, bản mẫu, hướng dẫn tính giá vốn thêm kiến trúc tổng thể | K0 | không (tài liệu thuần) | — |
| **W1** | **Lô ở Kernel** (K-030-1): migration `inventory_lots` + `lot_id` / `line_key` / `original_line_ref` trên `inventory_movements`; `lot_tracking` ở phân loại; `lotRef` minor cửa nạp; khung nhìn số dư; hook `inventory.pickLots` + `POST /inventory/pick-lots`; `IN-INV-010..013`; bán hàng / mua hàng gửi `lotRef` (mua hàng đã có lô trong `data` → ánh xạ) | K3 | `packages/kernel/src/modules/inventory/**`; `db/migrations/<số>_lo_o_kernel.sql`; `packages/contracts/src/documents.ts` (+ trường tuỳ chọn); `packages/platform/src/core/hooks.ts`; `apps/api/src/phan-he/mua-hang/posting.ts` (lotRef) | ADR-0033 Chấp nhận; `bizcity_inventory@1` §2 / §5 / §6; `bizcity_ledger_intake@1` minor; số migration bằng `so-tiep-theo` |
| **W2** | **Mô hình lớp**: `valuation_layers`, `valuation_layer_sources`, `cost_allocations`, `costing_runs` (chỉ thêm, trigger); engine bình quân tháng viết lại trên lớp; `CostingResult` → `eventStore`; `inventory_costs` thành khung nhìn dẫn xuất; **T032-P1 parity** trên fixture + bản sao dữ liệu thật; `CT-COST-001..005` | K3 | `packages/kernel/src/modules/inventory/**`; migration; `packages/contracts/src/inventory.ts`; `apps/api/test/costing-*.test.ts` | `bizcity_inventory@1` §2 / §4; [10 §4](10-KIEN-TRUC.md) |
| **W3** | **Phương pháp & đảo chiều**: Rule Contract `core.costing.method@1` (bình quân · FIFO · đích danh; hàm thuần, vectors); đăng ký Policy Registry; `original_line_ref` + hoàn đúng phân bổ (G1–G5); chuyển kho giữ giá trị, cặp chứng từ liên đơn vị (G6–G7); `core.intercompany.pricing@1` | K3 | engine; `apps/api/src/modules/system/rule-contracts/**`; `apps/api/src/phan-he/ban-hang/**` (tra hàng gửi `originalLineRef`) | [35](35-GOLDEN-CASES.md) chốt số liệu; `bizcity_policy@1` thêm hai contract |
| **W4** | **Cổng**: `CT-INV-*`, `CT-COST-01x`, `DG-CLOSE-1 / 2`; Sẵn sàng khoá kỳ đọc `costing_runs`; `stock_count` docType (K-030-4) + `count.snapshot`; G8–G9; tiêu chí trụ cột III; đối soát sổ chi tiết là dữ liệu (K-030-12) cho lô / lớp | K2–K3 | `packages/kernel/src/modules/periods/**`, `closing/**`; `tests/conformance/checks/inventory/**`; `docs/standard/tru-cot.json` | RULE-QUALITY-GATE (phép kiểm chặn mới); `bizcity_findings@1` thêm mã |
| **W5** | **Giao diện**: màn Kho (số dư theo lô, hạn, chọn lô FEFO / FIFO), Tính giá vốn theo lần tính (lớp, phân bổ, so sánh, settle), Hành trình giá vốn (lineage qua lớp), Sẵn sàng khoá kỳ phần giá vốn; hướng dẫn; ảnh chụp vào `evidence/` | K1 | `apps/web/src/features/inventory/**`, `apps/web/src/phan-he/ke-toan/gia-von/**`; `docs/huong-dan/*.md` | bản mẫu `mockups/inventory-engine.html` duyệt |

Thứ tự bắt buộc: **W1 → W2 → W3 → W4**; W5 song song từ W2. Mỗi đợt một hoặc vài nhánh ngắn (R-FLOW-4), mỗi nhánh một dòng CLAIMS. Cách cắt thành bước dùng được: §6a.

## 6a. Làm theo bước thắng nhỏ <!-- [2026-11-09 10:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — chủ dự án duyệt D032-1..10 theo bước thắng nhỏ; ADR-0033 Chấp nhận -->

Chủ dự án duyệt 2026-11-09: *"đồng ý theo quan điểm smallwin để dễ dùng, dễ sử dụng"*. Mỗi bước là **một nhánh ngắn, một PR**, và sau khi gộp thì **kế toán thấy và dùng được ngay một thứ**. Bước sau không chờ cả đợt xong. Thứ tự dữ liệu W1 → W2 → W3 → W4 ở §6 vẫn giữ; các bước B1..B4 chỉ đọc hoặc chỉ nhắc nên đi trước, không cần migration lô / lớp.

| Bước | Kế toán dùng được gì sau bước này | Việc (40) | Mức | Cần câu trả lời |
|---|---|---|---|---|
| **B1** | Bấm **Khoá thử hôm nay** trên Bàn làm việc kế toán: biết hôm nay khoá sổ được chưa, còn vướng gì, không ghi gì vào sổ. Ghép phần có sẵn: kiểm khoá kỳ, xem trước kết chuyển, giá vốn bình quân xem trước | S032-36 (phần không cần lớp), S032-39 (đổi tên HT08 + thẻ 2) | K1 | — |
| **B2a** <!-- [2026-11-09 10:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — tách B2 thành B2a / B2b / B2c theo R-FLOW-9 (giao diện trước, đổi Kernel và thứ dùng chung sau) --> | Thẻ **Việc hôm nay**: phần mềm tự chẩn đoán sổ khi mở thẻ, mỗi việc nói bằng lời kế toán, mức *Phải ghi lý do khi khoá / Nên xử lý*, ai làm, cách sửa, nút *Kiểm lại*. Chỉ giao diện, dùng API chẩn đoán có sẵn | S032-27 (phần hiện việc), S032-39 (thẻ 1) | K1 | — |
| **B2b** | Hết báo sai "hàng đi đường phải bằng 0": hàng đi đường qua ngày khoá là hợp lệ; chỉ nhắc khi số dư tài khoản lệch tổng phiếu chưa nhận, hoặc phiếu đi quá N ngày | S032-30 (phần CT-INV-003 / 005) | K2 | N = 30 ngày, giữ quy chế đang có trong mã `TRANSIT_DAYS` (không thêm cảnh báo mới). Chữ chốt: *còn treo* = số dư tài khoản trung gian tại ngày xét − Σ phát sinh Nợ trong N ngày gần nhất; báo khi còn treo ≥ 1 đồng (hàng / tiền đi quá N ngày chưa nhận) hoặc số dư ≤ −1 đồng (nơi nhận ghi nhiều hơn nơi xuất). Giữ mã `TRANSIT_NONZERO` (R-DIAG-1) <!-- [2026-11-09 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — chữ chốt B2b --> |
| **B2c-1** <!-- [2026-11-09 11:35 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — tách B2c: lịch đêm theo khuôn subscriber có sẵn trước, trường DiagCheck sau --> | Phần mềm **tự kiểm sổ lúc 01:00 mỗi đêm**; sáng mở *Việc hôm nay* là thấy ngay kết quả đêm qua, không phải chờ. Theo khuôn subscriber `bizcity.clock.daily` có sẵn (như kiểm chuẩn mỗi đêm) | S032-27 (phần lịch) | K1 | — |
| **B2c-2** <!-- [2026-11-10 09:35 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2c-2: chữ chốt trường DiagCheck (closeRef, kỳ kiểm, bước khoá, mức khi khoá) theo R-FLOW-2 --> | Mỗi việc ở *Việc hôm nay* ghi **thuộc điều kiện khoá sổ nào, kiểm hằng ngày / tuần / cuối tháng, đến lúc khoá kỳ thì cần giải trình hay để biết**; việc vận hành ghi rõ không thuộc khoá sổ. Khoá kỳ thật không đổi | S032-35 | K2 | chữ chốt [RULE-SELF-DIAGNOSTICS §2b](../../rules/RULE-SELF-DIAGNOSTICS.md) + bảng gắn [70 §3a](70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md) (PR này) |
| **B3** | **Khách trả hàng lấy đúng giá vốn lúc bán** (ví dụ 500.000, không phải 600.000). Làm tạm trên bình quân tháng hiện có: phiếu trả mang dòng bán gốc, hoàn theo đơn giá tháng của dòng gốc. Khi có phân bổ ở B8, con số không đổi | S032-9 (phần `originalLineRef`), S032-17 (phần hoàn theo gốc) | K2 | Q032-5 mặc định tạm: bình quân tồn đầu kỳ trả |
| **B4** | Thẻ **Kết quả từng tuần**: bản lưu mỗi tuần, nút *Đã xem tuần*, báo khi số liệu đổi sau khi đã xem | S032-31, S032-32 | K1–K2 | — |
| **B5** | **Lô và hạn dùng**: xem tồn theo lô, hạn; khi bán phần mềm **gợi ý** lô sắp hết hạn (FEFO), không chặn | S032-7..10, S032-23, S032-38 | K3 | — |
| **B6** | **Hành trình giá vốn**: bấm một dòng giá vốn thấy phiếu nhập gốc. Số giá vốn tháng **giữ nguyên như hôm nay** (đối chiếu bắt buộc) | S032-11..14, S032-22 | K3 | Q032-1 mặc định tạm: theo đơn vị hạch toán; Q032-2 mặc định tạm: theo kỳ, có xem trước |
| **B7** | **Chốt giá vốn rồi mới khoá sổ**; chỉ sáu trường hợp sai số học là chặn hẳn, còn lại giải trình một lần | S032-20, S032-28, S032-29, S032-30 | K2–K3 | Q032-3 mặc định tạm: cho tính tạm, không cho chốt khi còn thiếu lớp |
| **B8** | Chọn **FIFO / đích danh** khi đơn vị cần; chuyển kho giữ giá trị; chuyển giữa hai pháp nhân thành cặp chứng từ; kiểm kê lệch thành phiếu điều chỉnh | S032-15..19, S032-21 | K3 | — |
| **B9** | Thẻ **Sổ theo dõi các tháng** và bản lưu tháng cùng hồ sơ khoá kỳ; module tự khai phép kiểm | S032-33, S032-34, S032-37 | K2 | — |

Quy tắc của mỗi bước:

1. Bước chỉ tính là xong khi có **ảnh chụp màn hình kế toán dùng** trong `evidence/` và một câu hướng dẫn ngắn bằng lời kế toán (thuật ngữ [70 §7](70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md)).
2. Mặc định **cho phép, nhắc khi sai** (ADR-0020): bước mới không được chặn thêm nghiệp vụ nào ngoài sáu trường hợp của D032-11.
3. Câu hỏi còn mở không chặn bước: dùng phương án đề nghị ở §4 làm mặc định tạm, ghi trên màn là *mặc định tạm*, người trả đổi được qua chính sách có phiên bản.
4. Mỗi bước có mã vẫn giữ chỗ CLAIMS trên `main` trước khi code (R-FLOW-1); B5, B6, B8 là K3 nên cần chữ chốt và chữ ký đặc tả.

## 7. Ai làm gì

| Vai | Làm | Không làm |
|---|---|---|
| **Inventory Engine** (Kernel) | lô, số dư, lớp, phân bổ, lần tính, hook chọn lô, `CostingResult`, `CT-INV-*` / `CT-COST-*` | ghi sổ cái; biết số tài khoản; chặn bán |
| **Accounting Kernel** (ledger / posting / documents) | nhận `CostingResult` qua `eventStore`, định khoản theo lý do → nhóm hạch toán → tài khoản, lập / đảo chứng từ giá vốn; điền `journal_entry_id` | tính giá; đọc bảng module |
| **Policy Registry** | phiên bản `core.costing.method@1`, `core.inventory.lot_picking@1`, `core.intercompany.pricing@1`; `resolve` tại ngày | giữ số liệu kho |
| **Module Kho** (`modules/kho`, phase riêng) | phiếu chuyển, kiểm kê, cách ly, huỷ, in tem lô; màn chọn lô; kể sự việc + `lotRef` | ghi bảng Engine; tự tính giá; tự định khoản |
| **Module Bán hàng / POS / plugin** | gửi `lotRef` (nếu chọn lô), `originalLineRef` khi trả; dùng `pick-lots` để gợi ý | gửi `cost`; tự FIFO |
| **Intake Gate** | `IN-INV-01x` (L3 / L4), hold theo `strict` / `enforce` | sửa sự việc |
| **Sẵn sàng khoá kỳ / Kết chuyển** | đọc `costing_runs`, `CT-*`; chặn có lý do (R-INV-7) | tự tính giá vốn |
| **Kế toán trưởng** | duyệt phương pháp, chấp nhận mã có lý do, `settle`, trả Q032-1 / Q032-5 | — |
| **Chủ dự án** | duyệt D032-1..10, bản mẫu; thứ tự W1–W5 | — |

## 8. Rủi ro và cách giữ

| Rủi ro | Giữ bằng |
|---|---|
| Viết lại bình quân trên lớp ra số khác hôm nay | T032-P1 parity bắt buộc (fixture + bản sao dữ liệu thật), `inventory_costs` khung nhìn cho tới khi mọi màn đọc lớp |
| Dữ liệu cũ không có lô | lô `null` hợp lệ cho mặt hàng `lot_tracking = none`; mặt hàng chuyển `required` chỉ áp từ ngày hiệu lực; tồn cũ không lô = một lô `(không lô)` ẩn khi bắt buộc |
| Phiếu nhập ghi lùi ngày đổi FIFO | run mới thay run cũ (chỉ thêm), chỉ trong kỳ chưa khoá; kỳ khoá → `CT-COST-012` + điều chỉnh bằng chứng từ kỳ sau |
| Hai dòng giữ chỗ chồng (`documents.ts`, `hooks.ts` là thứ dùng chung) | chữ chốt trước, phạm vi hẹp từng PR, kiểm `nhan-viec.mjs kiem` |
| Người đọc lẫn FIFO (xuất lô) với FIFO (tính giá) | tài liệu, màn hình luôn ghi *quy tắc xuất lô* / *phương pháp tính giá*; hai chính sách tách tên |
