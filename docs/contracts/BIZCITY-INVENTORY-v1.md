# `bizcity_inventory@1` — Inventory Engine: lô, số dư, lớp giá vốn, phân bổ, lần tính giá
<!-- [2026-11-09 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — W0: hợp đồng nháp của Inventory Engine (ADR-0033): đọc số dư / lô / lớp / phân bổ, hook chọn lô, CostingResult đưa sang Kernel; chưa có mã -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Phiên bản:** 0.1.0-draft · 2026-11-09 · **Trạng thái:** Đề xuất ([ADR-0033](../adr/ADR-0033-inventory-engine-gia-von-kho.md) chờ chủ duyệt; **không có mã**)
> **Nguồn sự thật (đề xuất, chưa có mã):** kiểu ở gói contracts, tệp `inventory.ts` (đề xuất) · engine và route ở `packages/kernel/src/modules/inventory/**` (đã có thư mục) · hook `inventory.pickLots` đăng ký ở `packages/platform/src/core/hooks.ts`
> **Luật:** [R-INV](../rules/RULE-INVENTORY.md), [R-CONT](../rules/RULE-CONTINUITY.md) · **Kế hoạch:** [PHASE-032](../phases/PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/README.md) · **Hợp đồng kề:** [`bizcity_lineage@1`](BIZCITY-LINEAGE-v1.md) (đọc hành trình), [`bizcity_ledger_intake@1`](BIZCITY-LEDGER-INTAKE-v1.md) (nguồn gửi `lotRef`, `originalLineRef`), [`bizcity_policy@1`](BIZCITY-POLICY-v1.md) (`core.costing.method@1`, `core.inventory.lot_picking@1`)

## 1. Ý nghĩa

Engine trả lời bốn câu: hàng **ở đâu** (kho, lô, còn bao nhiêu), **từ đâu** (phiếu nhập, nhà cung cấp), **đáng giá bao nhiêu và vì sao** (lớp, phân bổ, phương pháp, phiên bản chính sách), **đã đi đâu** (dòng xuất, trả, huỷ, chuyển). Nó **không ghi sổ cái**: kết quả tính giá đi qua `eventStore` để Accounting Kernel lập chứng từ giá vốn (R-INV-1). Module đọc qua đây; không ghi bảng Engine.

Bất biến: **`item_id` là khoá** (R-ITEM-0); bảng Engine **không có cột tài khoản** (R-INV-2); lớp và phân bổ **chỉ thêm** (R-INV-6).

## 2. Khuôn dữ liệu (đích; bảng mới ở W1–W2)

```text
inventory_lots                       (W1, K-030-1)
  lot_id          ULID PK
  tenant_id, item_id                 — lô thuộc một định danh
  lot_no          text               — số lô nhà sản xuất / nội bộ; UNIQUE (tenant_id, item_id, lot_no)
  expiry_date     date null
  mfg_date        date null
  receipt_line    (event_id, line_key) null   — dòng nhập tạo lô (mua, điều chỉnh tăng, chuyển đến khác pháp nhân)
  status          available | quarantine | hold | expired | disposed
  status_reason   text null, status_at, status_by
  created_at

inventory_movements                  (+ cột, W1)
  lot_id          ULID null → inventory_lots
  line_key        text               — khoá dòng ổn định giữa phiên bản (thay line_no khi khuôn nạp có lineKey)
  original_line_ref (event_id, line_key) null — dòng gốc của nghiệp vụ đảo chiều (R-INV-4)

bizcity_read.inventory_balances      (khung nhìn, W1)
  tenant_id, branch_id, warehouse_code, item_id, lot_id, qty, as_of

valuation_layers                     (W2, CHỈ THÊM — PHASE-025 · 10 §2)
  layer_id, tenant_id, pool_id, item_id
  kind            receipt | period_pool | opening | adjustment
  source_line     (event_id, line_key) null
  lot_id          ULID null          — đích danh: lớp buộc theo lô
  period          YYYY-MM null
  qty_in, value_in, unit_cost
  policy_version  int                — bản core.costing.method@1 lúc tạo
  run_id          → costing_runs
  superseded_by   ULID null

valuation_layer_sources              (bình quân: phiếu nhập nào góp vào bể)
  layer_id, source_line, qty, value

cost_allocations                     (W2, CHỈ THÊM)
  allocation_id, tenant_id, item_id, pool_id
  issue_line      (event_id, line_key)        — dòng bán / trả NCC / huỷ / chuyển / điều chỉnh giảm
  layer_id        → valuation_layers
  qty, value
  reverses_allocation_id ULID null            — đảo chiều: trỏ phân bổ gốc (R-INV-4)
  journal_entry_id bigint null                — bút toán giá vốn mang giá trị này (Kernel điền sau khi ghi)
  run_id, policy_version
  superseded_by   ULID null

costing_runs                         (W2)
  run_id, tenant_id, pool_id, period
  method          weighted_average_period | fifo | specific_identification
  policy_version
  status          draft | settled | superseded
  findings        jsonb              — CT-COST-* đã chạy
  settled_at, settled_by, reason
```

Ràng buộc (trigger): `valuation_layers`, `cost_allocations` không `UPDATE` ngoài đặt `superseded_by` / `journal_entry_id` một lần (NULL → giá trị), không `DELETE`; `inventory_lots.status` chỉ đổi qua action có lý do; mọi bảng RLS theo đơn vị; **không bảng nào có cột `account*`** (SC-INV-2).

## 3. API đọc (quyền `catalog:read` cho số dư / lô; `ledger:read` cho lớp / phân bổ)

| Đường dẫn | Trả |
|---|---|
| `GET /api/v1/inventory/balances?item=&warehouse=&branch=&at=&lots=1` | số dư theo (kho, item[, lô]) tại ngày; cờ `expired`, `quarantine` |
| `GET /api/v1/inventory/lots?item=&status=&expiringBefore=` | lô, hạn, trạng thái, phiếu nhập tạo lô, số dư từng kho |
| `POST /api/v1/inventory/pick-lots` | `{ branch, warehouse, lines[{ lineKey, itemId | sku, qty, constraints? }], at? }` → `{ lines[{ lineKey, picks[{ lotId, lotNo, expiryDate, qty }], rule: fefo | fifo, shortage, warnings[] }] }` — chạy hook `inventory.pickLots`, **không ghi** |
| `GET /api/v1/inventory/layers?item=&pool=&period=&run=` | lớp giá vốn (kể cả `superseded`) + nguồn |
| `GET /api/v1/inventory/allocations?issueLine=&layer=&run=` | phân bổ của một dòng xuất hoặc một lớp |
| `GET /api/v1/inventory/costing-runs?pool=&period=` | các lần tính: trạng thái, phương pháp, bản chính sách, mã kiểm |
| `GET /api/v1/inventory/closing-readiness?branch=&period=` | sẵn sàng khoá kỳ phần giá vốn: `settled?`, `CT-*` còn mở, số dòng chưa phân bổ, lối đi sửa (R-INV-7) |

`bizcity_lineage@1` đọc cùng bảng để vẽ hành trình; không lặp lại ở đây.

## 4. Action (Kernel, qua `defineAction`, có bằng chứng)

| Action | Quyền | Việc | Ghi sổ? |
|---|---|---|---|
| `core.inventory.costing.run` | `inventory:cost` | tính (nhóm tính giá, kỳ) theo phương pháp hiệu lực → `costing_run` `draft`: lớp, phân bổ, `CT-COST-*` | **không** |
| `core.inventory.costing.settle` | `inventory:cost` | `draft` → `settled` khi không còn mã chặn chưa chấp nhận (chấp nhận có lý do như bể chờ); **đưa `CostingResult` vào `eventStore`** → Kernel lập / đảo + lập lại chứng từ giá vốn của (chi nhánh, kỳ); `cost_allocations.journal_entry_id` điền một lần | **Kernel ghi** |
| `core.inventory.lot.status` | `inventory:write` | đổi trạng thái lô (`quarantine`, `hold`, `expired`, `disposed`) kèm lý do; `disposed` chỉ sau chứng từ huỷ | không |
| `core.inventory.count.snapshot` | `inventory:write` | chụp số dư (kho[, lô]) cho phiếu kiểm kê (`stock_count`, K-030-4) | không |

`CostingResult` (đưa sang Kernel, một cửa):
```ts
interface CostingResult {
  runId: string; poolId: string; period: 'YYYY-MM'; method: CostingMethod; policyVersion: number;
  lines: { issueLine: LineRef; itemId: string; qty: number; value: number; allocations: string[] /* allocation_id */; reasonCode: string | null; isGift: boolean }[];
  findings: Finding[];       // CT-COST-*, đã chấp nhận hay không
  contentHash: string;       // băm lines để Kernel kiểm trùng / lệch
}
```
Kernel định khoản từng dòng theo **lý do → nhóm hạch toán → tài khoản** tại ngày (R-POST-2); `CostingResult` **không mang tài khoản**.

## 5. Hook `inventory.pickLots` (Platform, `defineHook`)

```ts
defineHook({ id: 'inventory.pickLots', input: { itemId, qty, warehouse, at, lots: LotBalance[] }, output: { exclude?: (lot) => boolean; prefer?: (a, b) => number; minShelfDays?: number } })
```
Mặc định Core: bỏ `quarantine · hold · expired · disposed`; **FEFO** khi item có `expiry_date` (hạn gần nhất trước, cùng hạn → nhập trước), **FIFO** theo `receipt_line` ngày nhập khi không có hạn. Module nối thêm: bán hàng `minShelfDays` của khách; kho `exclude` lô đang kiểm kê. Nhiều handler → hợp `exclude` (OR), `prefer` theo thứ tự đăng ký. Kết quả là **gợi ý**; `core.inventory.lot_picking@1.mode = enforce` mới giữ chờ duyệt khi xuất khác gợi ý (`IN-INV-011`).

## 6. Cửa nạp (minor `bizcity_ledger_intake@1`, W1)

- dòng hàng: `lotRef?: { lotNo: string; expiryDate?: string; mfgDate?: string }` (nhập: tra / tạo lô của `item_id`; xuất: phải tồn tại và không `disposed`, `IN-INV-012`);
- dòng hàng: `originalLineRef?: { docKey: string; lineKey: string }` cho `sale_return`, `purchase_return`, điều chỉnh của dòng cũ (R-INV-4); phiếu có `originalDocKey` mà dòng không có `originalLineRef` → Core khớp theo (`item_id`, thứ tự) và ghi `CT-COST-010` mức hint;
- không thêm cột tham chiếu trên `accounting_events`; nguyên văn ở `payload`.

## 7. Sự kiện (outbox, `bizcity_event@1`, W3)

`bizcity.inventory.costing.settled` `{ runId, poolId, period, method, policyVersion, contentHash }` · `bizcity.inventory.lot.status_changed` `{ lotId, itemId, from, to, reason }` · `bizcity.inventory.lot.expiring` (đồng hồ ngày, `daysLeft ≤ ngưỡng của chính sách`).

## 8. Bảo đảm

- Chỉ đọc ở §3; RLS theo đơn vị; truy vấn theo `item_id` có chỉ mục, không quét bảng.
- Parity: W2 phải chứng minh `weighted_average_period` trên mô hình lớp ra **cùng đơn giá, cùng giá trị xuất** với `costing.service.ts` hiện tại trên bộ dữ liệu test và một bản sao dữ liệu thật (T032-P1) trước khi bỏ đường cũ; `inventory_costs` giữ làm khung nhìn dẫn xuất.
- Golden T032-G1…G9 ([PHASE-032 · 35](../phases/PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/35-GOLDEN-CASES.md)) là cổng phát hành.

## 9. Changelog

- **0.1.0-draft (2026-11-09):** khuôn đầu theo ADR-0033: lô, số dư, lớp, phân bổ, lần tính, hook chọn lô, `CostingResult`, minor cửa nạp (`lotRef`, `originalLineRef`).
