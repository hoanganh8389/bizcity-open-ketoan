# `bizcity_lineage@1` — Truy vết vòng đời mặt hàng
<!-- [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1: hợp đồng đọc truy vết vòng đời mặt hàng (ADR-0021, R-CONT-0 / R-CONT-8) -->

> **Phiên bản:** 0.1.0-draft · 2026-11-03 · **Trạng thái:** Đề xuất (ADR-0021 chờ chủ duyệt; W1 chạy được trước, chỉ đọc)
> **Nguồn sự thật:** `packages/contracts/src/lineage.ts` (kiểu, nhãn, làn) · `packages/kernel/src/modules/lineage/` (dịch vụ + route)
> **Tôn chỉ:** [ADR-0020](../adr/ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md) · **Luật:** [R-CONT](../rules/RULE-CONTINUITY.md) · **Kế hoạch:** [PHASE-025](../phases/PHASE-025-ACCOUNTING-CONTINUITY/README.md)

## 1. Ý nghĩa

Một mặt hàng → mọi sự kiện kho của nó (mua, nhập, bán, trả, điều chuyển, điều chỉnh), mọi dòng bút toán mang mã hàng, và giá vốn từng tháng, nối bằng **khoá thật** của dữ liệu hiện có. Kế toán đi từ một con số về nghiệp vụ gốc (và ngược lại) mà không phải ráp tay từ ba báo cáo. **Chỉ đọc**: không ghi gì, không đổi cách tính giá vốn.

| Đối tượng | Khoá nối | Bảng |
|---|---|---|
| sự kiện kho | `event_id`, `line_no` → chứng từ (`doc_key`, `version`) | `inventory_movements` → `accounting_events` |
| bút toán | `product_sku`, `source_line_key` → bút toán (`event_id`) | `ledger_lines` → `ledger_entries` |
| giá vốn | nhóm tính giá × tháng × mã hàng | `inventory_costs` |

**Khoá của W1 là mã hàng** (`coverage.keyedBy = 'sku'`). Khi PHASE-024 B2 có bảng `items`, khoá chuyển sang `item_id` và hiện thêm phiên bản mã (`coverage.keyedBy = 'item_id'`); hình dạng hợp đồng không đổi, chỉ thêm trường.

## 2. API (quyền `ledger:read`)

| Đường dẫn | Trả |
|---|---|
| `GET /api/v1/lineage/search?q=&limit=` | mặt hàng khớp mã (đầu mã), mã vạch (đúng), tên (chứa); mã đúng xếp đầu |
| `GET /api/v1/lineage/items/:sku?from=&to=&branch=&limit=` | `LineageItem`: `item`, `coverage`, `events`, `entries`, `costPeriods`, `summary` |
| `GET /api/v1/lineage/items/:sku/cost?period=YYYY-MM&costGroup=` | `CostExplain`: câu giải thích bằng số thật, các phiếu góp vào theo vai, đối chiếu số đã lưu |

Danh sách bị cắt ở `limit` (mặc định 500, tối đa 2000): `summary.truncated = true` — thu hẹp khoảng ngày.

## 3. Khuôn

**Sự kiện** (`LineageEvent`): `at`, `kind` (`purchase` · `purchase_return` · `sale` · `sale_return` · `transfer_out` · `transfer_in` · `adjust_in` · `adjust_out`), `label`, **`effect`** (`accounting` | `operational`), `effectWhy`, chứng từ (`docKey`, `docNo`, `docType`, `version`, `status`), `branch`, `warehouse`, `lineNo`, `qty` (nhập +, xuất −), `amount` (null = chưa có giá vốn), `counterBranch`, `originalDocKey` (hàng trả), `isGift`.

**`effect` (R-CONT-8):** *kế toán* = đổi số lượng / giá trị tồn, có bút toán; *vận hành* = không đổi sổ (hôm nay: chuyển kho trong cùng nhóm tính giá). Làn của màn Hành trình: `LINEAGE_LANE`.

**Dòng bút toán** (`LineageEntryLine`): `entryNo`, `docNo`, `docKey`, `postingDate`, `account`, `accountName`, `debit`, `credit`, `costFill` (≠ null và 0 / 0 = đang chờ tính giá vốn), `part`, `status` (`posted` · `reversed` · `reversal`), `branch`.

**Giá vốn tháng** (`LineageCostPeriod`): `period`, nhóm tính giá, tồn đầu, nhập, `unitCost`, xuất, tồn cuối, `source` (`computed` | `import`).

**Giải thích giá vốn** (`CostExplain`): `sentences[]` (từng dòng một câu: tồn đầu, nhập, công thức đơn giá, xuất, so tháng trước, phiếu kéo đơn giá nhiều nhất), `contributions[]` với **vai** (`in` góp vào đơn giá · `out` hàng xuất · `gift` quà không vào đơn giá · `internal` chuyển cùng nhóm · `return` trả nhà cung cấp), `reconcile` (cộng lại từ các phiếu có khớp số đã lưu không; không khớp thì nói vì sao). Hôm nay giải thích **bình quân gia quyền theo tháng** (luật hiện hành ở `costing.service.ts`); phương pháp khác theo D025-2.

## 4. Nói rõ phần chưa truy được

`coverage.notes` luôn có dòng đầu về khoá theo mã hàng; thêm dòng khi: sự kiện kho thuộc **tháng chưa tính giá vốn**; dòng bút toán giá vốn đang chờ tính giá; phiếu **khách trả hàng chưa nối được chứng từ bán gốc**. Không giả vờ đầy đủ (R-CONT-0).

## 5. Bảo đảm

- Chỉ đọc; quyền `ledger:read`; cô lập đơn vị theo RLS như mọi route Kernel.
- Truy vết một mã không quét cả bảng: `inventory_movements_sku` (0007) và `ledger_lines_sku` (0064).
- Test: `apps/api/test/lineage.test.ts` — tìm, đủ loại sự kiện, vận hành ≠ kế toán, bút toán giá vốn, giá vốn từng tháng, lọc, hàng trả, "Vì sao giá vốn này?" (công thức khớp số đã lưu).

## 6. Changelog

- **0.1.0-draft (2026-11-03):** khuôn đầu (PHASE-025 W1): tìm, hành trình một mặt hàng, giải thích giá vốn bình quân tháng.
