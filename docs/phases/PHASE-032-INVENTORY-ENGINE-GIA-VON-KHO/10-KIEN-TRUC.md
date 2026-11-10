# PHASE-032 · 10 — Kiến trúc: giá vốn → kết chuyển → khoá sổ, Inventory Engine ↔ Accounting Kernel
<!-- [2026-11-09 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — W0: sơ đồ kiến trúc tổng thể cho dev / kế toán / CEO, ranh giới Engine ↔ Kernel, mô hình dữ liệu, luồng tính giá, lineage, cổng khoá kỳ -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Bản vẽ tương tác: [mockups/inventory-engine.html](mockups/inventory-engine.html) › *Kiến trúc tổng thể*.

## 1. Sơ đồ kiến trúc tổng thể (một trang, ai cũng đọc được)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  MASTER DATA & POLICY REGISTRY                                  (nền móng)  │
│  item_id bất biến · SKU có phiên bản · ĐVT quy đổi · nhóm hạch toán          │
│  chính sách có phiên bản: phương pháp tính giá · quy tắc xuất lô · giá nội bộ │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  MUA HÀNG        │  │  KHO (module)    │  │  BÁN HÀNG / POS  │   chứng từ nguồn
│  giá mua, VAT,   │  │  lô, hạn dùng,   │  │  đơn bán, trả    │   kể SỰ VIỆC,
│  chi phí mua     │  │  chuyển, kiểm kê │  │  lại, quà tặng   │   không ghi sổ
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         └─────────────────────┼──────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DOCUMENT SDK → CỬA NẠP → CỔNG KIỂM CHUẨN (Gate A / B)                      │
│  định danh (resolveItem) · lô (lotRef) · dòng gốc (originalLineRef)          │
│  chính sách (policyRefs) · kiểm chuẩn L1–L5 · bể chờ                          │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────┐  ┌──────────────────────────────────────┐
│  INVENTORY ENGINE  (Kernel)      │  │  ACCOUNTING KERNEL                   │
│  số lượng · lô · lớp giá vốn ·   │─►│  một cửa ghi sổ cái (eventStore)     │
│  phân bổ · lần tính giá          │  │  lý do → nhóm hạch toán → tài khoản  │
│  gửi CostingResult ĐÃ KIỂM       │  │  bút toán chỉ thêm · đảo · ledger    │
│  (không ghi sổ, không biết TK)   │◄─│  trả journal_entry_id cho phân bổ    │
└──────────────────────────────────┘  └──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  COST SETTLEMENT  →  PERIOD CLOSING                                         │
│  đối chiếu tồn theo lớp = số dư TK hàng tồn kho · hàng đi đường = Σ phiếu mở · giá vốn kỳ "settled"       │
│  → kết chuyển 632 → 911 → khoá sổ (chặn có lý do khi chưa chốt)              │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  BÁO CÁO & TRUY VẾT                                                         │
│  lãi gộp theo item_id / SKU · lãi lỗ cửa hàng · toàn doanh nghiệp ·          │
│  lineage: bút toán → phân bổ → lớp → phiếu nhập → nhà cung cấp · audit       │
└─────────────────────────────────────────────────────────────────────────────┘
```

Đọc cho ba người:

| Người đọc | Nhìn sơ đồ thấy gì |
|---|---|
| **CEO / chủ doanh nghiệp** | Mọi con số lãi gộp đi ngược được về phiếu nhập; đổi mã hàng, đổi thông tư không làm mất lịch sử; kết chuyển không chạy trên giá vốn chưa chốt |
| **Kế toán** | Kho và kế toán là hai sổ nhưng **một** dữ liệu: sổ chi tiết (lô, lớp) phải bằng số dư tài khoản hàng tồn kho trước khi khoá; tài khoản là kết quả của lý do và nhóm hạch toán tại ngày, không gắn chết vào hàng |
| **Dev** | Module chỉ kể sự việc kèm `lotRef` / `originalLineRef`; Engine tính, Kernel ghi; không import `ledgerService`, không viết số tài khoản, không tự FIFO |

## 2. Ranh giới Inventory Engine ↔ Accounting Kernel

| | Inventory Engine | Accounting Kernel |
|---|---|---|
| Thư mục | `packages/kernel/src/modules/inventory/**` | `packages/kernel/src/modules/{ledger,posting,documents,periods,closing}` |
| Giữ | `inventory_movements`, `inventory_lots`, `valuation_layers`, `valuation_layer_sources`, `cost_allocations`, `costing_runs` | `accounting_events`, `ledger_entries`, `ledger_lines`, `ledger_links`, `period_locks` |
| Biết | `item_id`, kho, lô, số lượng, giá trị, phương pháp, `policy_version`, dòng gốc | tài khoản (tra tại ngày), bút toán, kỳ |
| Không biết | **số tài khoản** (R-INV-2) | lô, lớp (chỉ đọc qua `cost_allocations.journal_entry_id` để nối) |
| Ghi | bảng của mình, cùng giao dịch với chứng từ | sổ cái, một cửa |
| Giao tiếp | `CostingResult` → `eventStore` (giống phiếu kết chuyển, khấu hao hôm nay) | điền `journal_entry_id` vào phân bổ (một lần, NULL → giá trị) |
| Kiểm | `CT-INV-*`, `CT-COST-*` trước khi `settle` | `CT-COST-004` (tồn theo lớp = số dư TK), `DG-CLOSE-*` |

Đường ghi hôm nay đã đúng hình (costing.service → `eventStore.post` phiếu "Giá vốn hàng xuất"); phase này **tách** phần tính (lớp, phân bổ, run) khỏi phần đưa sang Kernel, và thêm cổng `settle`.

## 2a. Hai sổ, một cầu nối: cha, biến thể ở sổ kho; tài khoản ở sổ cái
<!-- [2026-11-10 10:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — hai sổ, một cầu nối: tách Inventory Engine (theo item_id, cha, biến thể) khỏi ghi sổ cái; đề xuất T-1..T-6, Q032-9 -->

> <!-- [2026-11-10 11:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — chủ dự án duyệt ba khối màn mặt hàng và trả Q032-9 = cha chỉ là tổng khi xem (D032-14); bản mẫu the-mat-hang-hai-so.html; Thuy2k phụ trách -->**Đã duyệt một phần (2026-11-10):** chủ dự án đồng ý **ba khối màn mặt hàng** (*Thẻ kho · Đã ghi sổ · Khớp sổ cái chưa*) và trả **Q032-9 = cha chỉ là tổng khi xem, giá vốn luôn tính theo biến thể** → D032-14, T-3 có hiệu lực khi có mã. Bản mẫu: [mockups/the-mat-hang-hai-so.html](mockups/the-mat-hang-hai-so.html) (`#lech` mở thẳng tình huống lệch). Phụ trách làm: **Thuy2k** (Nguyễn Văn Thủy — danh mục, mua hàng, kho, giá vốn).
>
> **Trạng thái ban đầu: đề xuất** (chủ dự án hỏi 2026-11-10: *"thể hiện rõ sự tách bạch giữa inventory engine (theo item id, parent id hoặc các biến thể id) so với việc ghi sổ"*). T-1, T-2, T-4 khớp quyết định đã có (D026-2, R-INV-1/2, migration 0091). T-3 cần chủ trả **Q032-9**. T-5, T-6 là việc dọn mã và màn, làm theo bước B6.

Một mặt hàng có **hai sổ**: sổ kho đếm **cái gì, bao nhiêu, giá bao nhiêu**; sổ cái đếm **tiền nằm ở tài khoản nào**. Hai sổ chỉ gặp nhau ở **một cầu nối** và **một phép đối chiếu**.

```text
 Danh mục (MDG)                 SỔ KHO — Inventory Engine                       SỔ CÁI — Accounting Kernel
 ─────────────                  ─────────────────────────                       ──────────────────────────
 sản phẩm cha                   (không có dòng — chỉ cộng các biến thể khi xem)
 parent_item_id ─┐
                 ├─ biến thể ──► inventory_movements · lô · lớp giá · phân bổ   ledger_entries / ledger_lines
 item_id ────────┘   (khoá tính:  (nhóm tính giá × item_id × kỳ)               (khoá tính: tài khoản tại ngày × chi nhánh × kỳ)
 mã (item_codes)      hiển thị)   lượng + giá trị, KHÔNG tài khoản              tiền, KHÔNG lô / lớp
                                          │                                               ▲
                                          │ ① CostingResult (bút toán "Giá vốn hàng xuất") │
                                          └──────────── eventStore ─────────────────────────┘
                                          ◄──── ② cost_allocations.journal_entry_id (điền một lần) ────
                                   ③ Đối chiếu CT-COST-004: Σ giá trị lớp theo (đơn vị kế toán × TK kho tra tại ngày)
                                      = số dư tài khoản kho trên sổ cái — nơi DUY NHẤT hai sổ so số với nhau
```

| | Sổ kho (Inventory Engine) | Sổ cái (Accounting Kernel) |
|---|---|---|
| Đếm cái gì | lượng, lô, hạn, lớp giá, phân bổ, đơn giá | tiền theo tài khoản |
| Khoá tính | (nhóm tính giá × **`item_id` = biến thể** × kỳ) — đã đúng ở `costing.service` (PHASE-024 G2) | (tài khoản tại ngày × chi nhánh × kỳ) |
| Sản phẩm cha | **chỉ cộng khi xem**: tồn cha = Σ tồn các biến thể lúc xem; không dòng, không lớp, không đơn giá riêng | không biết |
| `item_id` | khoá | **chỉ tham chiếu** trên dòng 156 / 632 / 511 để truy ngược; không cộng số dư theo nó; điền một lần (0091: `UPDATE (item_id)` NULL → giá trị) |
| Tài khoản | không có cột (R-INV-2) | tra tại ngày: lý do → nhóm hạch toán → chế độ kế toán |
| Ai ghi | chỉ `modules/inventory/**` | chỉ một cửa ghi sổ (`eventStore`) |

**Sáu luật tách (đề xuất, kiểm được):**

| Mã | Luật | Hôm nay | Kiểm bằng |
|---|---|---|---|
| **T-1** | Engine **không đọc, không ghi** `ledger_*`. Cần biết giá vốn đã ghi sổ chưa thì đọc `cost_allocations.journal_entry_id` | ⚠ `costing.service` còn đọc `ledger_lines` hai chỗ (dọn dòng `cost_fill` cũ, liệt kê chi nhánh có dòng giá vốn) — chuyển sang đọc `inventory_movements` ở B6 | phép kiểm tĩnh mới SC-INV-3: `modules/inventory/**` không nhắc `ledger_lines` / `ledger_entries` |
| **T-2** | Sổ cái **không tính theo mặt hàng**: số dư, báo cáo tài khoản không `GROUP BY item_id`; `item_id` trên dòng sổ chỉ để truy ngược. Chi tiết theo mặt hàng lấy từ sổ kho | ✅ đúng | SC-INV-3 chiều ngược: `modules/{ledger,closing,reports}` không gom theo `item_id` |
| **T-3** | **Cha đã có biến thể thì không có dòng kho**: không nhập, xuất, lô, lớp, phân bổ trên `item_id` của cha. Mặt hàng không có biến thể là cha của chính nó (một tầng) | ☐ chưa có mã — **Q032-9 đã trả: không** (D032-14) | cửa nạp `IN-INV-0xx` (cảnh báo, mặc định cho phép theo R-GATE-9) + chẩn đoán `ITEM_PARENT_HAS_STOCK` (PC-001) |
| **T-4** | **Đổi cha không sửa sổ nào**: chuyển biến thể sang cha khác, gộp, tách cha chỉ đổi `items.parent_item_id`; tồn, lớp, bút toán giữ nguyên | ✅ đúng (D026-2, 0067) | test hiện có của PHASE-026 |
| **T-5** | **Một cầu nối mỗi chiều**: xuôi = `CostingResult` → `eventStore`; ngược = `journal_entry_id` trên phân bổ. Không đường thứ hai (không `UPDATE` số tiền sổ cái từ Engine) | 🟡 đã đúng hình (phiếu "Giá vốn hàng xuất"); phân bổ và `journal_entry_id` đến ở B6 | test B6: mỗi bút toán giá vốn có Σ phân bổ trỏ về = số tiền bút toán |
| **T-6** | **Một phép đối chiếu**: CT-COST-004 so Σ lớp (theo đơn vị kế toán × TK kho tra tại ngày từ nhóm hạch toán của từng `item_id`) với số dư TK kho. Lệch thì sửa chứng từ, không điều chỉnh cho khớp (`forbid`) | 🟡 `INVENTORY_LEDGER_MISMATCH` đang so theo **mã** trên dòng sổ | đổi sang theo `item_id` + lớp ở B6 (PC-009) |

**Kế toán thấy gì** (màn mặt hàng, bước B6 *Hành trình giá vốn*; **chủ dự án duyệt 2026-11-10**): ba khối cạnh nhau, bằng lời kế toán. Bản mẫu: [mockups/the-mat-hang-hai-so.html](mockups/the-mat-hang-hai-so.html).

**Gọn, dễ thấy chỗ lệch** (khuôn của bản mẫu, áp cho màn thật):
1. **Không màu là đạt.** Chỉ tô màu chỗ có việc: đỏ = *lệch, phải sửa chứng từ*; cam = *cần xem trước khi khoá kỳ*. Không thêm mức thứ ba trên màn này.
2. **Một vạch trái + một dòng lý do** ngay dưới dòng gây ra vấn đề (biến thể, lần tính). Không hộp thoại, không bảng cảnh báo riêng.
3. **Mỗi vấn đề hiện một lần**, ở khối gây ra nó. Dải ba ô trên cùng chỉ **đếm** và dẫn tới chỗ đó.
4. **Khớp sổ cái** là một phép so: *thẻ kho = sổ cái* hoặc *≠ … Lệch X*; dưới đó là danh sách lệch, mỗi mục ghi **chỗ · vì sao · sửa ở đâu**, nút *Xem trên thẻ kho* tô sáng dòng.
5. **Cách sửa luôn là sửa chứng từ hoặc tính lại**, không có nút "điều chỉnh cho khớp" (T-6, `forbid`).
6. **Dòng cha** in đậm nền nhạt, ghi *tổng các biến thể*, không có đơn giá; chứng từ ghi nhầm mã cha hiện ở chính dòng cha (T-3).

| Khối | Nội dung | Đọc từ |
|---|---|---|
| **Thẻ kho** | tồn, nhập, xuất, đơn giá theo **từng biến thể**; dòng cha là tổng, ghi *"tổng các biến thể"* | sổ kho |
| **Đã ghi sổ** | mỗi lần tính giá vốn: phiếu nào, Nợ / Có tài khoản nào, bao nhiêu | cầu nối ① ② |
| **Khớp sổ cái chưa** | *Giá trị kho theo thẻ kho = số dư TK 156 của đơn vị* ✔ / lệch bao nhiêu, ở mặt hàng nào | đối chiếu ③ |

Ví dụ: áo `ÁO-THUN` (cha) có hai biến thể `ÁO-THUN-ĐỎ-M`, `ÁO-THUN-XANH-L`. Thẻ kho tính đơn giá riêng từng biến thể. Dòng cha chỉ cộng lượng và giá trị. Sổ cái chỉ có *Nợ 632 / Có 156: 1.250.000* của phiếu giá vốn tháng 10. Muốn biết 1.250.000 gồm những gì thì bấm sang thẻ kho qua phân bổ, không tìm trong sổ cái.

## 3. Mô hình dữ liệu (đích)

Khuôn đầy đủ ở [`bizcity_inventory@1` §2](../../contracts/BIZCITY-INVENTORY-v1.md). Quan hệ:

```text
items (item_id) ──< inventory_lots (lot_id, lot_no, expiry, status)
     │                    │
     │                    └──< inventory_movements (event_id, line_key, lot_id, qty, original_line_ref)
     │                                   │ dòng nhập                      │ dòng xuất
     │                                   ▼                                ▼
     └──< valuation_layers (layer_id, kind, source_line, lot_id?, qty_in, value_in, unit_cost, policy_version, run_id)
                   │
                   └──< cost_allocations (allocation_id, issue_line, layer_id, qty, value, reverses_allocation_id, journal_entry_id, run_id)
                                                                                                   │
costing_runs (run_id, pool, period, method, policy_version, status draft|settled|superseded) ◄─────┘
                                                                                                   ▼
                                                                                 ledger_entries / ledger_lines (account_code tại ngày)
```

Ba câu bất biến của mô hình:
1. **Lô ≠ lớp.** Lô là vật lý; lớp là giá trị. Bình quân: n lô → 1 lớp bể tháng. FIFO: 1 dòng nhập → 1 lớp. Đích danh: lớp buộc theo lô.
2. **Chỉ thêm.** Tính lại = run mới + lớp / phân bổ mới, cái cũ `superseded_by`. Không `UPDATE` số.
3. **Không tài khoản.** Không bảng nào trong khối này có cột `account*`.

### Một phương pháp, một mô hình (PHASE-025 · 10 §3, giữ nguyên)

| Phương pháp | Lớp | Phân bổ dòng xuất | Hoàn khi trả |
|---|---|---|---|
| Bình quân gia quyền kỳ (mặc định) | 1 lớp `period_pool` / nhóm / item / tháng; nguồn = tồn đầu + phiếu nhập trong kỳ | 1 phân bổ về bể | về đúng bể của lần bán gốc (giá X của kỳ bán), không phải bể kỳ trả |
| FIFO | mỗi dòng nhập 1 lớp `receipt` | lớp cũ nhất còn lượng, có thể nhiều lớp | đảo đúng các phân bổ gốc theo tỷ lệ |
| Đích danh | lớp `receipt` theo lô / serial | về đúng lớp của lô dòng xuất chỉ định | về đúng lớp |
| (Bình quân liên hoàn — chưa làm) | lớp bể mới sau mỗi nhập | về bể hiện hành lúc xuất | như trên |

## 4. Luồng tính giá → ghi sổ (W2 trở đi)

```text
1. Chứng từ nguồn ghi sổ (bán, trả, chuyển, điều chỉnh)  → Kernel: bút toán KHÔNG có dòng giá vốn (R-POST-7, như hôm nay)
                                                          → Engine: inventory_movements (+ lot_id, original_line_ref) cùng giao dịch
2. core.inventory.costing.run (nhóm tính giá, kỳ)         → Engine: đọc policy core.costing.method@1 tại kỳ
                                                            dựng lớp (receipt / period_pool / opening), phân bổ từng dòng xuất,
                                                            đảo chiều → reverses_allocation_id; chạy CT-COST-*; costing_runs.draft
3. Kế toán xem Lần tính: lớp, phân bổ, mã kiểm, so với lần trước; sửa chứng từ hoặc chấp nhận mã có lý do
4. core.inventory.costing.settle                           → Engine: draft → settled; lập CostingResult (dòng, qty, value, reasonCode, isGift, hash)
                                                          → eventStore: đảo phiếu giá vốn cũ của (chi nhánh, kỳ) nếu có, lập phiếu mới
                                                          → Kernel: định khoản từng dòng theo lý do → nhóm hạch toán → tài khoản tại ngày
                                                          → điền cost_allocations.journal_entry_id
5. Sẵn sàng khoá kỳ đọc costing_runs.settled + CT-COST-004 (tồn theo lớp = số dư TK) → cho kết chuyển / khoá
6. Có phiếu muộn sau settle → run mới draft; kết chuyển của kỳ đánh dấu DG-CLOSE-2; lặp 3–5
```

Kỳ đã khoá: không `run` lại (R-CONT-9); chênh lệch xử lý bằng chứng từ kỳ sau, `CT-COST-012` ghi nhận.

## 5. Lineage: hai chiều, qua lớp

- **Ngược** (vì sao giá vốn này?): `ledger_lines` (dòng giá vốn) → `journal_entry_id` → `cost_allocations` → `valuation_layers` → `source_line` (phiếu nhập) → `accounting_events` (mua) → nhà cung cấp, hoá đơn, giá mua, chiết khấu.
- **Xuôi** (phiếu nhập này đi đâu?): `source_line` → lớp → mọi phân bổ → dòng bán → doanh thu, giá vốn, lãi gộp từng lần bán; hoặc → lô → kho nào còn, hạn bao nhiêu.
- **Theo mặt hàng** (`item_id`): mọi phiên bản mã + lô + lớp + phân bổ + sự kiện trên một dòng thời gian — màn Hành trình (`bizcity_lineage@1` đọc thêm nút `lot`, `layer`, `allocation`, `run`).

`CostExplain` của lineage đổi câu: *"Đơn giá 100.000 = (tồn đầu 50 × 95.000 + nhập PN-021 100 × 100.000 + PN-033 20 × 110.000) ÷ 170 — lần tính #3 (settled 05/11), chính sách bình quân tháng v1"*; với FIFO: *"30 cái lấy 30 từ lớp PN-021 (100.000) — còn 70"*.

## 6. Cổng và cấp độ chặn (ADR-0020: mặc định cho phép, nhắc khi sai)

| Chỗ | Mã | Mặc định | Đơn vị siết |
|---|---|---|---|
| Cửa nạp: thiếu lô khi bắt buộc | `IN-INV-010` | warn, ghi sổ | `bizcity.intake.lot_check = strict` → hold |
| Cửa nạp: xuất khác gợi ý lô | `IN-INV-011` | warn | `core.inventory.lot_picking@1.mode = enforce` → hold |
| Cửa nạp: lô sai item / đã huỷ | `IN-INV-012` | **block** | — |
| Settle: dòng xuất chưa phân bổ, phân bổ ≠ sổ, lớp âm | `CT-COST-001..003` | **chặn settle**, chấp nhận có lý do | — |
| Khoá kỳ: giá vốn chưa `settled`; tồn lớp ≠ số dư TK | `DG-CLOSE-1`, `CT-COST-004` | **chặn khoá / kết chuyển**, `periods:lock` chấp nhận có lý do (R-CONT-6) | — |
| Sau kết chuyển giá vốn đổi | `DG-CLOSE-2` | warn trên Sẵn sàng khoá kỳ | — |

## 7. Kỹ thuật (để W1 viết chữ chốt)

- **Engine thuần + kho dữ liệu**: hàm tính (`allocateFifo`, `poolAverage`, `reverseAllocation`) là hàm thuần trong `packages/contracts/src/costing/*.ts` (dùng được cho Rule Contract `core.costing.method@1` và cho plugin xem trước); `costing.service.ts` chỉ nạp dữ liệu, gọi hàm, ghi bảng. Tiền số nguyên (xu) theo `money.ts`; chia dư theo `allocate` dùng chung (K-030-10).
- **Khoá dòng**: `line_key` ổn định giữa phiên bản chứng từ (khuôn nạp đã có `lineKey`); dữ liệu cũ điền `line_key = String(line_no)` một lần.
- **Số dư theo lô**: khung nhìn vật chất hoá hoặc bảng `inventory_lot_balances` cập nhật cùng giao dịch (R-LEDGER-11), dựng lại được từ `inventory_movements`.
- **Hook**: `inventory.pickLots` qua `defineHook` hiện có (`core/hooks.ts`); registry hook thêm một id; timeout theo registry.
- **Chính sách**: ba Rule Contract mới ở `apps/api/src/modules/system/rule-contracts/` (như W3a PHASE-031, nợ N031-1 dời xuống Platform khi Kernel cần import — Engine **cần** import `core.costing.method@1` nên W3 trả nợ N031-1 luôn).
- **Quyền**: `inventory:read` (số dư, lô — ánh xạ từ `catalog:read` cho khoá app), `inventory:write` (trạng thái lô, snapshot), `inventory:cost` (run / settle; kế toán trưởng), đăng ký ở registry quyền của PHASE-028 — không authz mới.
- **RLS**: như 0074; bảng mới khai bằng `withTables` và thêm nhóm ở `schema-catalog.ts` (db-rules đòi).
- **Hiệu năng**: run theo (nhóm, kỳ), truy vấn theo `item_id` có chỉ mục; FIFO duyệt lớp theo `source_line` ngày + id; mục tiêu ≤ 60 s cho 50.000 item × 1 kỳ trên máy dev (đo ở W2, ghi `docs/ops`).
