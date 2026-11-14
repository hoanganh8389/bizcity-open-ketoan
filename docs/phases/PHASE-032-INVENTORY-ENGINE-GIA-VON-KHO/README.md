# PHASE-032 — Inventory Engine: kho · lô · giá vốn liên tục; Accounting Kernel là nơi duy nhất ghi sổ; giá vốn chốt rồi mới kết chuyển
<!-- [2026-11-09 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — W0: đề bài chủ dự án 2026-11-09 (bốn liên tục Identity · Inventory · Cost · Accounting; Inventory Engine ≠ Accounting Kernel; mã hàng ≠ mã tài khoản; FIFO / FEFO; chín tình huống vàng; kết chuyển sau giá vốn); ADR-0033 đề xuất -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Việc lộ trình:** — (mở rộng PHASE-025 W2–W4 và K-030-1 / K-030-4 của PHASE-030)
> **Phân hệ:** kho <!-- [2026-11-11 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — B1: dòng Phân hệ (R-FLOW-10) cho HT11 -->
> **Checklist công bố:** —
> **Trạng thái:** 🟡 **~20% mã trên `main`** <!-- [2026-11-13 07:26 PM Johnny Chu - Chu Hoàng Anh] TIEN-DO — đối chiếu mã trên main 2026-11-13 (5b3448da): trạng thái khớp mã --> · ADR-0033 chấp nhận 2026-11-09. Bảy bước nhỏ đã vào: B1 Khoá thử (#245), B2a Việc hôm nay (#250), B2b TRANSIT_NONZERO (#252), B2c-1 chẩn đoán đêm (#254), B2c-2 sổ điều kiện khoá sổ PC-001..023 + `closeRef` (#261 — nội dung "Sẵn sàng khoá kỳ" từng gọi là PHASE-033 gộp ở đây, 033 không có thư mục), B3 trả hàng theo giá vốn gốc (#275), B4a kết quả tuần (#281). **Lõi Inventory Engine chưa bắt đầu:** chưa có lớp giá vốn, lần tính giá (`costing_runs`), mã CT-*, FIFO / đích danh — bước kế: S032-11..14; Q032-1 / 5 (kế toán trưởng), Q032-2 / 3 (nhóm Lõi) đang dùng mặc định tạm.
> **Phụ trách** <!-- [2026-11-10 11:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — chủ dự án duyệt ba khối màn mặt hàng và trả Q032-9 = cha chỉ là tổng khi xem (D032-14); bản mẫu the-mat-hang-hai-so.html; Thuy2k phụ trách -->: **Thuy2k** (Nguyễn Văn Thủy) — danh mục (Master Data), mua hàng, kho, giá vốn; chủ dự án giao 2026-11-10.
> **ADR:** [ADR-0033](../../adr/ADR-0033-inventory-engine-gia-von-kho.md) (chấp nhận) · **Luật:** [R-INV](../../rules/RULE-INVENTORY.md) (mới), [R-ITEM-10](../../rules/RULE-ITEM.md) (mới), [R-CONT](../../rules/RULE-CONTINUITY.md) · **Hợp đồng:** [`bizcity_inventory@1`](../../contracts/BIZCITY-INVENTORY-v1.md) 0.1.0-draft.

## Trả lời ngắn

| Câu hỏi của đề bài | Trả lời | Ở đâu |
|---|---|---|
| Inventory Engine khác Accounting Kernel chỗ nào? | Engine giữ **số lượng, lô, giá trị tồn** (ba sổ chi tiết) và tính giá; **chỉ Kernel ghi sổ cái**. Engine đưa `CostingResult` đã qua `CT-COST-*` vào `eventStore`; không `ledgerService`, không `UPDATE` dòng sổ | [10 §2](10-KIEN-TRUC.md), D032-1, R-INV-1 |
| Engine là module Kho hay Kernel? | **Năng lực Kernel** (`packages/kernel/src/modules/inventory`). Module Kho (`modules/kho`) làm chứng từ, vận hành, màn hình; kể sự việc qua cửa nạp, đọc Engine qua API / khung nhìn | D032-1, [PHASE-030 · 51](../PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/51-BP-KHO.md) |
| Mã hàng và mã tài khoản | **Tách hẳn.** `item_id` + chuỗi tham chiếu chứng từ là bất biến; tài khoản là kết quả tra tại ngày theo lý do → nhóm hạch toán → chế độ. Bảng Engine không có cột tài khoản | [20](20-MA-HANG-VA-MA-TAI-KHOAN.md), R-ITEM-10, R-INV-2 |
| FIFO / FEFO đặt ở đâu? | **Quy tắc xuất lô** (vận hành kho, hook `inventory.pickLots`, chính sách `core.inventory.lot_picking@1`, mặc định gợi ý) — **không đổi giá vốn**. **Phương pháp tính giá** là chính sách khác (`core.costing.method@1`, mặc định bình quân tháng; FIFO / đích danh là lựa chọn) | [30](30-FIFO-FEFO-VAN-HANH-KHO.md), D032-5 / D032-6 |
| Khách trả 5 / 30 sản phẩm đã bán giá vốn 3 triệu | Hoàn **500.000** theo phân bổ của lần bán gốc; **không** lấy giá nhập gần nhất 120.000 × 5 = 600.000. Hàng hỏng → lô `quarantine`, không về tồn bán được | [35 · G1](35-GOLDEN-CASES.md), D032-7, R-INV-4 |
| Khi nào được kết chuyển? | Khi lần tính giá của (nhóm tính giá, kỳ) ở trạng thái **`settled`** và không còn `CT-COST-*` chặn chưa chấp nhận — Sẵn sàng khoá kỳ **chặn có lý do**, người có quyền khoá kỳ chấp nhận có ghi lý do | D032-8, R-INV-7 |
| Có đổi phương pháp mặc định sang FIFO không? | **Không.** Giữ D025-2: bình quân gia quyền tháng mặc định; mọi phương pháp chạy trên **một mô hình** lớp + phân bổ; bình quân chuyển sang mô hình lớp trước (parity), FIFO thêm sau | D032-6 |

## Hiện trạng đọc mã (`origin/main` `27407c07`, 2026-11-09)

| Nền | Có | Thiếu |
|---|---|---|
| Định danh | `items.item_id` ULID bất biến (0065), `item_codes` có phiên bản, `inventory_movements.item_id`, `inventory_costs.item_id` (0066); giá vốn gom theo `item_id` (G2) | phân loại `lot_tracking`; `line_key` ổn định (còn `line_no`) |
| Sổ phụ kho | `inventory_movements` (8 `kind`, `warehouse_code`, `event_id` + `line_no`, dựng lại được từ sự việc) | **lô, hạn dùng, trạng thái lô**; `original_line_ref`; số dư theo lô |
| Giá vốn | `costing.service.ts` bình quân tháng theo (đơn vị hạch toán, `item_id`); một phiếu "Giá vốn hàng xuất" / (chi nhánh, tháng) qua `eventStore`; E1 qua hàm SECURITY DEFINER (0091); nhập Excel song song | **lớp giá vốn, phân bổ, lần tính** (ADR-0021 chốt, chưa mã); FIFO / đích danh; khách trả hoàn theo **tháng trả** (sai R-CONT-4); `inventory_costs` `UPDATE` khi tính lại |
| Lô / FEFO | ở **module mua hàng**: `purchase_documents.data.lotNo / expDate`, FEFO ở `mua-hang/reports.ts`, cảnh báo cận hạn | Kernel không biết lô; bán hàng không chọn lô; không hook; Q030-2 ⛔ nhóm Lõi |
| Kết chuyển | `closing.service.ts` đọc phát sinh 632 → 911 theo kỳ; khoá kỳ đa chiều (0082) | không cổng "giá vốn đã chốt"; lời dặn ở `tinh-gia-von.md` |
| Truy vết | `bizcity_lineage@1` 0.3.0: hành trình theo `item_id`, giải thích giá vốn bình quân tháng, `coverage.notes` nói rõ chỗ chưa nối | lineage bút toán → phân bổ → lớp → phiếu nhập (chờ bảng lớp) |
| Chính sách | Policy Registry + Rule Contracts (PHASE-031 W1–W3a đã mã) | `core.costing.method@1`, `core.inventory.lot_picking@1`, `core.intercompany.pricing@1` |

## Tài liệu của phase

| Tệp | Nội dung | Người đọc |
|---|---|---|
| [00-MASTER-PLAN.md](00-MASTER-PLAN.md) | vì sao, nguyên tắc (bốn liên tục), quyết định D032-*, câu hỏi Q032-*, phân tích ba phương án, các đợt W0–W5, ai làm gì | chủ dự án, nhóm Lõi |
| [10-KIEN-TRUC.md](10-KIEN-TRUC.md) | **sơ đồ kiến trúc tổng thể** (dev / kế toán / CEO cùng đọc), ranh giới Engine ↔ Kernel, mô hình dữ liệu, luồng tính giá → ghi sổ, lineage, cổng khoá kỳ, kỹ thuật | dev, kế toán trưởng |
| [20-MA-HANG-VA-MA-TAI-KHOAN.md](20-MA-HANG-VA-MA-TAI-KHOAN.md) | tách mã hàng và mã tài khoản: thành phần định danh, hành trình hạch toán của một mặt hàng theo TT99, luật, việc phải sửa trong tài liệu / dữ liệu | mọi người |
| [30-FIFO-FEFO-VAN-HANH-KHO.md](30-FIFO-FEFO-VAN-HANH-KHO.md) | chiến lược xuất lô FIFO / FEFO: luật, hook, chính sách, giao diện chọn lô, thông báo, phân biệt với phương pháp tính giá | kho, bán hàng, dev module |
| [35-GOLDEN-CASES.md](35-GOLDEN-CASES.md) | chín tình huống vàng: luồng, số liệu, bút toán theo lý do, mã kiểm, ca T032-G1…G9 | kế toán, QA, dev |
| [40-MASTER-CHECKLIST.md](40-MASTER-CHECKLIST.md) | việc con S032-*, ca T032-*, nhật ký | mọi người |
| [50-KIEM-THU-MILESTONE-PR.md](50-KIEM-THU-MILESTONE-PR.md) | kế hoạch kiểm thử (parity, golden, bất biến, hiệu năng), mốc, kế hoạch PR và giữ chỗ theo R-FLOW | nhóm Lõi |
| [60-SCOREBOARD-KE-TOAN.md](60-SCOREBOARD-KE-TOAN.md) | **scoreboard kế toán**: PC-001..023 đối chiếu ngược với mã; điều kiện khoá kỳ cũng là điều kiện ngày / tuần; mức HARD hẹp, REVIEW có lý do; checklist triển khai theo điều kiện khoá kỳ | kế toán trưởng, chủ dự án |
| [70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md](70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md) | rà CANON / luật / hợp đồng; đề xuất R-DIAG-10..16; gắn điều kiện khoá sổ với chứng từ của module và sự việc nạp về Kernel; Bàn làm việc kế toán; Khoá thử hôm nay; thuật ngữ cho kế toán | chủ dự án, nhóm Lõi, kế toán trưởng |
| [mockups/](mockups/README.md) | `inventory-engine.html`: kiến trúc tổng thể, mã hàng ≠ mã TK, chọn lô FIFO / FEFO, lớp giá vốn & phân bổ (ví dụ trả hàng 500.000 vs 600.000), chín tình huống, sẵn sàng khoá kỳ; `bang-diem-ke-toan.html`: bảng A hệ thống · bảng B số liệu hôm nay theo nhịp | chủ dự án duyệt hình |

## Xong khi

- **W0:** chủ dự án duyệt D032-1..10 hoặc sửa; Q032-1..5 có người trả; ADR-0033 → Chấp nhận; R-INV vào CANON §3; tài liệu hướng dẫn tính giá vốn có mục *Kiến trúc tổng thể*.
- **W1 (lô ở Kernel, K-030-1)** <!-- [2026-11-11 02:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — D032-15: lô của Engine = item_lots + inventory_lot_moves (0098, Thuy2k, PHASE-026); bỏ kế hoạch inventory_lots (chủ dự án 2026-11-11) -->: lô **đã có** — `item_lots` + `inventory_lot_moves` (0098, Thuy2k), tự xuất hạn sớm trước, trả về đúng lô, KHO05 (D032-15). Còn: trạng thái lô, bắt buộc ghi lô (`IN-INV-010..013`), `originalLineRef`, chính sách chọn lô.
- **W2 (mô hình lớp):** `valuation_layers`, `cost_allocations`, `costing_runs`; bình quân tháng chạy trên lớp với **parity** T032-P1 đạt; `inventory_costs` thành khung nhìn; `CostingResult` → `eventStore`.
- **W3 (phương pháp & đảo chiều):** `core.costing.method@1` (bình quân · FIFO · đích danh), `original_line_ref`, hoàn đúng phân bổ gốc; T032-G1..G5 xanh.
- **W4 (cổng & kết chuyển):** `CT-INV-*`, `CT-COST-*`, `DG-CLOSE-*`; Sẵn sàng khoá kỳ đọc `costing_runs`; T032-G6..G9; tiêu chí trụ cột III cập nhật theo bằng chứng.
- **W5 (giao diện):** màn Kho (lô, hạn, chọn lô), Tính giá vốn theo lần tính (lớp, phân bổ, so sánh), Hành trình giá vốn; bản mẫu → màn thật, ảnh chụp vào `evidence/`.

## Ca bằng chứng (golden)

T032-G1 khách trả hàng (một phần) hoàn đúng phân bổ gốc · G2 trả một phần nhiều lần, không vượt số còn được trả · G3 trả nhà cung cấp về lớp nhập gốc, chênh lệch theo lý do · G4 huỷ hết hạn đúng lô, tài khoản theo lý do · G5 kiểm kê thiếu / thừa có chứng từ, giá trị chênh theo lớp · G6 chuyển kho cùng đơn vị giữ giá trị · G7 chuyển giữa hai pháp nhân thành cặp chứng từ · G8 đổi mã SKU giữ nguyên tất cả · G9 đổi phương pháp tính giá có phiên bản, kỳ chuyển đổi · **P1** parity bình quân tháng lớp = `inventory_costs` · **C1** kết chuyển bị chặn khi giá vốn chưa `settled`. Chi tiết [35](35-GOLDEN-CASES.md).
