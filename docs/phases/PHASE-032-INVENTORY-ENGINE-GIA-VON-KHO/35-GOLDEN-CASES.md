# PHASE-032 · 35 — Chín tình huống vàng: luồng, số liệu, bút toán theo lý do, mã kiểm
<!-- [2026-11-09 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — W0: golden cases G1–G9 theo đề bài chủ dự án (trả hàng, trả một phần, trả NCC, huỷ hết hạn, kiểm kê, chuyển kho, hai pháp nhân, đổi SKU, đổi phương pháp) + P1 parity + C1 kết chuyển bị chặn -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Luật cốt lõi:** mọi nghiệp vụ đảo chiều phải biết nó đang đảo **giao dịch nào, số lượng nào, giá trị nào và thuộc phiên bản chính sách nào.**
> Số tài khoản là ví dụ gói nền TT99 — luật tra theo lý do → nhóm hạch toán (R-POST-2). Bản vẽ: [mockups/inventory-engine.html](mockups/inventory-engine.html) › *Chín tình huống*.

## 0. Dữ liệu chung

Mặt hàng `item_id = 01JCK…A7` (SKU hiện hành `010-025-001-XD`), nhóm tính giá = đơn vị hạch toán HN, phương pháp **FIFO** cho ví dụ dễ nhìn (bình quân tháng cho cùng kết luận, xem ghi chú từng ca).

| Phiếu nhập | Ngày | Lô | Hạn | SL | Đơn giá | Lớp |
|---|---|---|---|---|---|---|
| PN-021 | 01/11 | A | 31/12 | 100 | 100.000 | L1 `receipt` |
| PN-033 | 05/11 | B | 30/11 | 50 | 120.000 | L2 `receipt` |

Bán **BH-108** ngày 10/11: 30 cái → phân bổ **AL-1: 30 từ L1 = 3.000.000** (đơn giá 100.000). Xuất lô theo FEFO gợi ý lô B (hết hạn trước); người bán chọn A vì khách đòi hạn ≥ 30 ngày — ghi lý do (`IN-INV-011` không bật vì có lý do). **Giá vốn 3.000.000 không phụ thuộc chọn lô** (FIFO tính giá lấy lớp cũ nhất = L1; nếu đích danh thì mới lấy theo lô).

Bảng tóm tắt (đề bài):

| Tình huống | Nguyên tắc bắt buộc | Ca |
|---|---|---|
| Khách trả hàng | tìm đúng đơn bán và lần phân bổ gốc; hoàn đúng giá vốn đó, không lấy giá hiện tại | G1 |
| Trả một phần | hoàn đúng số lượng / giá trị phần trả; quản lý phần còn được trả | G2 |
| Trả hàng cho NCC | liên kết lô nhập gốc; giá trị trả, giảm giá mua, chênh lệch có căn cứ | G3 |
| Huỷ do hết hạn | đúng lô, trừ số lượng, giá trị xuất và tài khoản theo nguyên nhân | G4 |
| Kiểm kê thiếu / thừa | chứng từ kiểm kê, giá trị chênh lệch, trạng thái xử lý | G5 |
| Chuyển kho nội bộ | giữ nguyên giá trị ghi sổ trong cùng đơn vị kế toán | G6 |
| Chuyển giữa hai pháp nhân | bản chất giao dịch, chính sách bán / mua nội bộ, công nợ | G7 |
| Đổi mã SKU | giữ `item_id`, lô, lớp, số lượng, giá trị, chứng từ | G8 |
| Đổi phương pháp tính giá | phiên bản, hiệu lực, phê duyệt, kỳ chuyển đổi; không viết lại lịch sử | G9 |

## G1 · Khách trả hàng (5 / 30, đủ điều kiện nhập lại)

```text
Phiếu NTH-012 (sale_return) 18/11, originalDocKey BH-108, dòng: item A7, qty 5, originalLineRef { BH-108, line 1 }
→ Engine: inventory_movements sale_return +5, lot A (lô của dòng bán gốc), original_line_ref = (BH-108, 1)
→ run 11/2026: phân bổ đảo AL-1R: 5 × 100.000 = 500.000, reverses_allocation_id = AL-1, cùng policy_version
→ settle → CostingResult dòng NTH-012: value 500.000, reasonCode NTH1
→ Kernel: Nợ 156 / Có 632  500.000 (tài khoản tra theo NTH1 → nhóm hạch toán tại 18/11)
   doanh thu: Nợ 5213 / Có 131 (đã ghi lúc nhận phiếu, không chờ giá vốn)
```

**Sai cần tránh:** lấy giá nhập gần nhất 120.000 → hoàn 600.000 → lãi gộp của nghiệp vụ trả sai 100.000. **Hôm nay** Kernel hoàn theo đơn giá bình quân **tháng trả** — cũng sai cùng kiểu (bình quân: phải hoàn theo bể tháng 10 của lần bán, không phải bể tháng 11).

Nhánh **hàng trả hỏng / không bán được:** dòng trả ghi `lotRef` mới hoặc lô cũ với `status = quarantine` (action `lot.status`, lý do "hàng trả kiểm tra"); giá vốn vẫn hoàn 500.000 vào kho (hàng về), sau đó chứng từ **giảm giá trị / huỷ** (G4) xử lý theo lý do — **không nhập thẳng vào tồn bán được**, không hoàn thiếu để "bù".

Kiểm: `CT-COST-011` (hoàn ≤ 30), `CT-COST-010` (nếu không có gốc → hoàn theo Q032-5, hint), lineage đi NTH-012 → AL-1R → AL-1 → L1 → PN-021. **T032-G1**: giá vốn hoàn = 500.000; lãi gộp trả = −(giá bán 5) + 500.000; không đụng L2.

## G2 · Trả một phần, nhiều lần

Lần 1 trả 5 (G1). Lần 2 trả 20 → OK (còn được trả 30 − 5 − 20 = 5). Lần 3 trả 10 → **`CT-COST-011` error**: vượt 5 còn được trả; cửa nạp `IN-INV-01x` tương ứng ở L4 (warn; `strict` → hold); kế toán sửa phiếu hoặc chấp nhận có lý do (trả hàng khác đơn → phải chọn đúng đơn).

Hiển thị trên đơn bán gốc: *Đã trả 25 / 30 — còn được trả 5*; mỗi lần trả liệt kê phân bổ đảo và giá vốn hoàn. **T032-G2**: Σ hoàn = 25 × 100.000; lần 3 bị mã; `original_line_ref` bắt buộc khi `sale_return` có `originalDocKey`.

## G3 · Trả hàng cho nhà cung cấp

Trả 20 cái lô B (PN-033, đơn giá nhập 120.000) ngày 20/11; NCC đồng ý giá 110.000 (giảm giá do chất lượng).

```text
Phiếu XTR-004 (purchase_return), originalLineRef { PN-033, line 1 }, lotRef B, qty 20, amount 2.200.000 (giá NCC trả)
→ Engine: phân bổ từ ĐÚNG lớp L2 (receipt gốc): 20 × 120.000 = 2.400.000 → L2 còn 30
→ chênh lệch 2.400.000 − 2.200.000 = 200.000 → theo lý do XTR1: giảm giá hàng mua / chi phí / tổn thất (resolver quyết, ví dụ Nợ 632 hoặc 811)
→ Kernel: Nợ 331 2.200.000, Nợ <TK chênh lệch theo lý do> 200.000 / Có 156 2.400.000
```

Không có gốc (`originalLineRef` rỗng) → FIFO lấy lớp cũ nhất còn lượng (L1) + `CT-COST-010` hint "trả NCC không trỏ phiếu nhập gốc". Bình quân tháng: quy tắc "định giá theo tồn đầu" hiện có của bản thuế (`returnsAtOpening`) giữ nguyên làm **tham số của Rule Contract** `core.costing.method@1` (`purchaseReturnValuation: layer | opening | document`), không là nhánh `if` trong engine. **T032-G3**: L2 giảm đúng 20; chênh lệch có lý do; `CT-COST-003` khớp.

## G4 · Huỷ do hết hạn

Ngày 01/12, lô B còn 30 (sau G3), hạn 30/11 → đồng hồ ngày đặt `status = expired` (`CT-INV-002` nếu không xử lý). Phiếu huỷ **XHH-002** (`stock_adjustment` giảm, lý do *huỷ hết hạn*, `lotRef B`, qty 30):

```text
→ Engine: adjust_out −30 lô B; phân bổ theo phương pháp hiện hành: FIFO → lớp cũ nhất còn lượng (L1 còn 70 → lấy 30 × 100.000 = 3.000.000)
   (đích danh → đúng L2 30 × 120.000 = 3.600.000; bình quân → đơn giá bể tháng 12)
→ Kernel: Nợ <TK theo nguyên nhân: 1381 chờ xử lý | 811 | 641 | 632 …> / Có 156 — theo lý do, không viết cứng
→ lô B → disposed sau khi phiếu ghi sổ
```

Lưu ý thật thà: FIFO **tính giá** không nhất thiết lấy lớp của lô huỷ — đó là bản chất phương pháp (giá trị kho tính theo dòng chảy giả định). Muốn "huỷ lô nào trừ đúng tiền lô đó" thì chọn **đích danh**. Màn huỷ hiện câu này. **T032-G4**: số lượng lô B về 0, `status disposed`, giá trị xuất đúng phương pháp, tài khoản đúng lý do; `IN-INV-013` **không** bật vì nghiệp vụ là huỷ.

## G5 · Kiểm kê thiếu / thừa

Phiếu **KK-2026-11-HN01** (`stock_count`, K-030-4): `count.snapshot` chụp số dư (kho, item, lô) lúc bắt đầu, kho khoá xuất (`exclude` qua hook). Đếm: A7 lô A thực tế 68 (sổ 70) → **thiếu 2**; item khác thừa 3.

```text
→ chênh lệch thành dòng stock_adjustment: adjust_out −2 lô A (lý do kiểm kê thiếu XKK), adjust_in +3 (NKK)
→ Engine: thiếu → phân bổ theo phương pháp (FIFO: 2 × 100.000); thừa → lớp mới `adjustment` với giá theo chính sách (đơn giá bể / lớp gần nhất / 0 chờ định giá — tham số)
→ Kernel: Nợ 1381 / Có 156 200.000 · Nợ 156 / Có 3381 (giá thừa) — theo lý do
→ trạng thái xử lý trên chứng từ kiểm kê: chờ duyệt → đã duyệt chênh → đã xử lý (bồi thường / vào chi phí / thu nhập) bằng chứng từ tiếp theo trỏ 1381 / 3381
```

**T032-G5**: `CT-INV-004` (Σ lô = sổ kho) xanh sau điều chỉnh; snapshot bất biến; chứng từ kiểm kê liên kết mọi dòng điều chỉnh.

## G6 · Chuyển kho nội bộ (cùng đơn vị kế toán)

Chuyển 40 lô A từ HN01 → HN02 (cùng đơn vị hạch toán HN) ngày 12/11, hàng đi 2 ngày.

```text
→ Engine: transfer_out −40 (HN01, lô A), transfer_in +40 (HN02, lô A giữ nguyên lot_id, hạn); phân bổ: chuyển lớp — 40 của L1 "đổi kho", unit_cost không đổi; không lớp mới
→ Kernel (theo lý do XCKho, hôm nay đã vậy): Nợ 1579 / Có 156 4.000.000 lúc xuất; Nợ 156 / Có 1579 4.000.000 lúc nhận
→ cuối kỳ CT-INV-003: dư 1579 = Σ phiếu chuyển đã xuất chưa nhận (hàng đi qua ngày khoá là hợp lệ); quá 7 ngày → CT-INV-005
```

Giá trị ghi sổ **không đổi**; chuyển kho không làm đổi đơn giá bình quân (như hôm nay) và không tạo lớp FIFO mới. **T032-G6**: tổng giá trị tồn HN trước = sau; L1 vẫn 1 lớp; lineage có sự kiện `operational` (R-CONT-8) kèm hai bút toán hàng đang chuyển.

## G7 · Chuyển giữa hai pháp nhân

HN (pháp nhân A) chuyển 20 lô A cho SG (pháp nhân B, tenant khác trong nhóm đơn vị) giá nội bộ 105.000 theo `core.intercompany.pricing@1` (giá vốn + 5 %).

```text
→ không phải "chuyển kho": lập CẶP chứng từ liên đơn vị (ADR-0028 ECP): A: sale nội bộ (lý do XCN, giá bán nội bộ) · B: purchase từ A (NCC nội bộ)
→ Engine A: sale −20 lô A; phân bổ FIFO 20 × 100.000; CostingResult → Nợ 632x / Có 156; doanh thu nội bộ Nợ 1368 / Có 5111x 2.100.000 (theo lý do)
→ Engine B: purchase +20, lô A' (lot_no giữ "A", lot_id mới của tenant B, hạn giữ), lớp receipt mới 20 × 105.000; Nợ 156 / Có 3368
→ hợp nhất (ngoài phase): loại trừ 1368 / 3368 và lãi nội bộ chưa thực hiện theo cặp chứng từ
```

**T032-G7**: hai tenant, hai bộ lớp; `item_id` ánh xạ qua mã ngoài / cùng danh mục nhóm (S026-*); cặp chứng từ trỏ nhau (`pairRef`); công nợ nội bộ đối ứng bằng nhau.

## G8 · Đổi mã SKU

Ngày 15/11 đổi `010-025-001-XD` → `010-025-001` (bỏ đuôi), hiệu lực 15/11.

```text
→ item_codes thêm phiên bản; item_id không đổi; lô A, B, lớp L1, L2, phân bổ AL-*, số dư, chứng từ giữ nguyên (khoá theo item_id)
→ run 11/2026 ra đúng số như trước khi đổi mã (T026-G* đã có cho bình quân; thêm cho lớp / lô)
→ màn: chứng từ trước 15/11 hiện mã cũ (ảnh chụp), sau hiện mã mới; tìm mã cũ vẫn ra hành trình
```

**T032-G8**: hash `CostingResult` trước / sau đổi mã bằng nhau (trừ trường mã hiển thị); không dòng nào có `item_id` khác; `DG-ITEM-3` xanh.

## G9 · Đổi phương pháp tính giá

Đơn vị HN đang bình quân tháng; từ **01/01/2027** chuyển sang FIFO (kế toán trưởng duyệt, lý do "hàng có date, cần lớp theo phiếu nhập").

```text
→ Policy Registry: core.costing.method@1 bản 2, effectiveFrom 2027-01-01, approver, reason; bản 1 đóng 2026-12-31
→ kỳ 12/2026 settle theo bình quân (bản 1); tồn cuối (qty, value) → lớp `opening` 01/01/2027 theo đơn giá bình quân cuối kỳ (một lớp / item / nhóm) — kỳ chuyển đổi
→ kỳ 01/2027: lớp opening là lớp cũ nhất của FIFO; phiếu nhập 2027 là lớp receipt
→ khách trả hàng 2027 của đơn bán 2026: hoàn theo phân bổ gốc (bể 12/2026, bản 1) — không theo FIFO (R-INV-4 ưu tiên gốc)
→ kỳ ≤ 12/2026 không tính lại (R-CONT-9); đổi giữa năm → cần lý do + cờ "thuyết minh BCTC" (VAS 01 nhất quán)
```

**T032-G9**: `resolvePolicy` tại 31/12 → bản 1, tại 01/01 → bản 2; lớp `opening` Σ = tồn cuối 12/2026; `CT-COST-012` xanh; trả hàng chéo năm hoàn đúng bể cũ.

## P1 · Parity bình quân tháng (W2, bắt buộc trước khi bỏ đường cũ)

Trên fixture `apps/api/test/fixtures/costing/*` và một bản sao dữ liệu thật (ẩn danh): engine lớp (`period_pool`) phải ra **cùng đơn giá (4 số lẻ), cùng giá trị xuất từng dòng (đồng), cùng tồn cuối** với `costing.service.ts` hiện tại cho mọi (nhóm, item, tháng), kể cả: quà KM giá 0 (`gift_qty`), bán nội bộ theo giá bán (`priced_at_sale`), trả NCC theo tồn đầu (bản thuế), nhập Excel (`cost_source = import` → lớp `period_pool` nguồn `import`), mẫu số ≤ 0 → đơn giá tháng trước. Lệch → không merge.

## C1 · Kết chuyển bị chặn khi giá vốn chưa chốt (W4)

Kỳ 11/2026 có 12 dòng xuất chưa phân bổ (run `draft`), kế toán bấm **Kết chuyển** → Sẵn sàng khoá kỳ: `DG-CLOSE-1` **chặn**: *"Giá vốn 11/2026 chưa chốt (lần tính #4 draft, 12 dòng chưa phân bổ, CT-COST-001)"* + nút tới Tính giá vốn. Người có `periods:lock` chấp nhận có lý do → kết chuyển chạy, ghi nhật ký. Sau đó settle run #5 → `DG-CLOSE-2` warn *"giá vốn đổi sau kết chuyển — kết chuyển lại"*. **T032-C1**.

## Bảng ca → mã kiểm → đợt

| Ca | Mã kiểm chính | Đợt | Loại |
|---|---|---|---|
| G1 | CT-COST-010 / 011, lineage | W3 | Golden chặn phát hành |
| G2 | CT-COST-011, IN-INV-01x | W3 | Golden |
| G3 | CT-COST-003, CT-COST-010 | W3 | Golden |
| G4 | IN-INV-013 (không bật), CT-INV-002 | W3 | Golden |
| G5 | CT-INV-004, stock_count | W4 | Golden |
| G6 | CT-INV-003 / 005, R-CONT-8 | W3 | Golden |
| G7 | cặp chứng từ, 1368 = 3368 | W3 | Golden |
| G8 | DG-ITEM-3, hash CostingResult | W4 | Golden (D026-7) |
| G9 | CT-COST-012, resolvePolicy | W4 | Golden (D026-7) |
| P1 | so số | W2 | chặn merge |
| C1 | DG-CLOSE-1 / 2 | W4 | Golden |
