# PHASE-024 · 20 — Kiến trúc: Item Master, Item Resolver, Accounting Mapping Resolver, validator, số đo
<!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — kiến trúc: mô hình dữ liệu, resolver, validator ba lớp, Prometheus / Tempo, migration K3 -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Quyết định gốc: [ADR-0017](../../adr/ADR-0017-dinh-danh-hang-hoa-bat-bien.md). Luật: [RULE-ITEM](../../rules/RULE-ITEM.md). Thiết kế W0 — số migration lấy bằng `node scripts/so-tiep-theo.mjs migration` lúc viết mã.

## 1. Mô hình dữ liệu

```text
items ──────────────────────────────┐          item_classification (phiên bản theo ngày)
  item_id        ULID, PK, bất biến │          ├ item_id, valid_from, valid_to
  tenant_id                          │          ├ kind       goods|material|finished|service|tool|asset|gift|packaging|other
  name, unit_base, attributes jsonb  │          ├ posting_group_code  → product_posting_groups
  parent_item_id  (biến thể, D024-7) │          ├ tax_out_code, tax_in_code, excise_rate
  retired_at, created_by             │          ├ track: lot|expiry|identifier|serial
                                     │          └ policy_version (ảnh chụp khi phát hành chế độ, ADR-0009)
item_codes (CHỈ THÊM) ───────────────┤
  item_id, kind  sku|barcode|external:<src>|alias
  code, valid_from, valid_to, created_by, note
  UNIQUE (tenant_id, kind, code, valid_from)
  ràng buộc: tại một ngày, (tenant, kind, code) → ≤ 1 item (DG-ITEM-1; EXCLUDE USING gist khi bật btree_gist)

Khoá sổ (W2, K3): ledger_lines.item_id · inventory_movements.item_id · inventory_costs.item_id · product_units.item_id · product_prices.item_id
  — cột mã (product_sku / sku) giữ lại = ẢNH CHỤP mã tại ngày hạch toán, chỉ đọc (trigger chặn UPDATE)

products = KHUNG NHÌN tương thích (D024-2): items ⋈ item_codes[kind=sku, hiệu lực hôm nay] ⋈ item_classification[hiện hành]
```

Nguyên tắc dữ liệu:
- `items` không có cột `sku`. Mã **chỉ** ở `item_codes`. Tên, nhóm hàng (ngành – nhãn – nhóm – loại) là thuộc tính, sửa thoải mái, không ảnh hưởng khoá (R-ITEM-1, 2).
- `item_codes` chỉ thêm: "đổi mã" = đóng `valid_to` dòng cũ (UPDATE duy nhất được phép, qua action, ghi audit) + thêm dòng mới; "gộp" = thêm dòng `kind = alias`.
- `item_classification` theo ngày: định khoản chứng từ ngày D dùng dòng có `valid_from ≤ D < valid_to`. Phát hành chế độ kế toán (ADR-0009) chụp bảng này vào bản chính sách.

## 2. Item Resolver (Kernel)

```ts
// packages/kernel/src/modules/masterdata/item-resolver.ts  (@bizcity-layer K kernel/masterdata)
resolveItem(trx, tenantId, ref: { itemId?: string; sku?: string; barcode?: string; external?: { source: string; code: string } }, asOf: string)
  → { itemId, code: { kind, code, validFrom, validTo }, classification | null, units: Map<unit, ratio>, retired: boolean, alias?: { from: string } }
  | ResolveFailure { code: 'IN-ITEM-001' | 'IN-ITEM-002' | 'IN-ITEM-008', detail }
```

- Thứ tự tra: `itemId` (phải thuộc đơn vị, `IN-ITEM-008`) → `sku` tại `asOf` → `barcode` → `external`. Bí danh (`alias`) trả item đích + `IN-ITEM-005` warn.
- Đệm theo **phiên bản danh mục** (`items_version` tăng mỗi lần ghi, R-CACHE): một chứng từ 2.000 dòng không tra 2.000 lần.
- Span `intake.item.resolve` (thuộc tính `bizcity.item.ref_kind`, `bizcity.item.result`), số đo `bizcity_item_resolution_total`.
- Kết quả được **chụp vào payload sự việc** (`extra.resolution[lineKey] = { itemId, code, classificationVersion }`) để định khoản lại sau này không phụ thuộc danh mục hiện tại (R-ITEM-5).

## 3. Accounting Mapping Resolver (mở rộng `AccountResolver`)

| Đầu vào | Từ đâu |
|---|---|
| Lý do (`reasonCode`, loại, cờ) | gói định khoản / cấu hình đơn vị (như nay) |
| **Phân loại item** (`kind`, nhóm hạch toán, thuế) tại ngày hạch toán | Item Resolver (thay `products.posting_group_code`) |
| Ngữ cảnh: loại chứng từ, chi nhánh / đơn vị hạch toán, hình thức TT, hoá đơn | chứng từ (như nay) |
| Chế độ kế toán có phiên bản | ADR-0009 (như nay) |

Phát hiện **xung đột** (mới, `IN-POST-005` warn / block tuỳ loại):

| Xung đột | Mức |
|---|---|
| Item `kind = service` xuất hiện trên dòng kho (transfer, stock_adjustment) hoặc có giá vốn chờ | block |
| Item `kind = asset` / `tool` trên hoá đơn bán như hàng hoá | warn |
| Dòng `isGift` mà phân loại không `gift` và lý do không có cờ khuyến mại (`IN-ITEM-006`) | warn |
| Nhóm hạch toán trỏ tài khoản không còn hoạt động / tổng hợp | block (đã có qua `validateLines`, nay báo sớm ở L5) |
| Thuế vào / ra của item lệch loại thuế dòng | warn |

Luật định khoản (`rules/*.rule.ts`) **không** import `@bizcity/mua-hang-domain` (`SC-ITEM-3`); mọi "loại dòng" đi qua phân loại và cờ chứng từ.

## 4. Validator ba lớp

| Lớp | Khi nào | Mã | Hành vi |
|---|---|---|---|
| **IN-ITEM-\*** (trạm tiền kiểm L3) | mỗi chứng từ vào cửa nạp, mỗi lần kiểm thử | 001 mã không tra được · 002 mã trỏ nhiều item · 003 ĐVT không khai · 004 chưa phân loại · 005 mã đã ngừng (bí danh) · 006 cờ dòng lệch phân loại · 007 sai quy tắc mã · 008 `itemId` lạ | block → bể chờ + remedy (tạo mặt hàng / thêm mã / khai ĐVT / phân loại — mỗi remedy một nút mở đúng màn với dữ liệu điền sẵn); warn / hint → nhận, ghi phát hiện, hiện ở trạm và thẻ mặt hàng |
| **DG-ITEM-\*** (tự chẩn đoán L3, mỗi đêm + trước khoá kỳ) | toàn đơn vị | 1 mã trùng hiệu lực · 2 item chưa phân loại có phát sinh · 3 `item_id` dòng sổ lệch mã tại ngày · 4 item ngừng còn tồn / phát sinh · 5 biến thể trùng | error chặn khoá kỳ (1, 3, 4); warn (2, 5) lên Bàn đánh giá với remedy |
| **SC-ITEM-\*** (bộ kiểm tĩnh, CI) | mỗi PR | 1 preset / module / fixture đúng `bizcity_item_master@1` · 2 không bảng sổ nào khoá ngoại tới mã · 3 luật định khoản không import `skuInfo` | block merge; có ca tự kiểm `fixtures/repo-bad` |

Kiểm trong **form mặt hàng** (web) dùng cùng danh mục mã: gọi `core.item.validate` (action đọc) trả danh sách phát hiện cho item đang sửa → người dùng thấy "thiếu gì" trước khi ghi, không chờ chứng từ lỗi.

## 5. Action và hợp đồng

| Action | Quyền | Ghi chú |
|---|---|---|
| `core.item.upsert` | `catalog:write` | tạo / sửa thuộc tính; **không** đổi mã, không đổi `item_id` |
| `core.item.add-code` / `core.item.retire-code` | `catalog:write` | thêm mã (kind, hiệu lực); đóng mã (`valid_to`); audit |
| `core.item.classify` | `settings:write` (kế toán) | thêm phiên bản phân loại từ ngày; cảnh báo nếu ngày ≤ kỳ đã khoá |
| `core.item.merge-preview` / `core.item.merge` | `settings:write` + xác nhận | xem trước (dòng sổ bị ảnh hưởng phải = 0, tồn hai item sẽ gộp khi xem "gộp bí danh"); ghi `alias` |
| `core.item.validate` | `catalog:read` | phát hiện IN-ITEM-* cho một item / một chứng từ nháp |
| `core.item.trace` | `catalog:read` | một dòng sổ / phiếu → item_id → mã tại ngày → phân loại tại ngày → chế độ → tài khoản; kèm `traceId` của lượt nạp |

Hợp đồng `bizcity_item_master@1` (W1): khuôn zod ở `packages/contracts/src/item-master.ts`, JSON Schema ở `docs/contracts/BIZCITY-ITEM-MASTER-v1.schema.json`; `bizcity_ledger_intake@1` 1.4.0 cho dòng hàng nhận thêm `itemId`, `barcode` (tuỳ chọn, `sku` vẫn được).

## 6. Số đo Prometheus và span Tempo

Tên có tiền tố `bizcity_`, **không nhãn `tenant`** (R-OBS-4); khai trong `core/metrics.ts` trước khi dashboard dùng (SC-OBS-1).

| Số đo | Kiểu | Nhãn | Theo dõi gì |
|---|---|---|---|
| `bizcity_item_resolution_total` | counter | `result` = resolved \| alias \| created \| ambiguous \| unknown \| retired · `ref_kind` = sku \| barcode \| external \| itemId · `source` (hệ thống nguồn) | nguồn nào gửi mã lạ / mã cũ nhiều |
| `bizcity_item_validation_findings_total` | counter | `code` (IN-ITEM-\*), `level` | mã lỗi danh mục hay gặp |
| `bizcity_items_unclassified` | gauge | — (tổng bản cài) | nợ phân loại — alert khi tăng 24 giờ |
| `bizcity_items_total` | gauge | `kind` | quy mô danh mục |
| `bizcity_item_code_changes_total` | counter | `op` = add \| retire \| alias | tần suất đổi / gộp mã (bất thường = import sai) |
| `bizcity_posting_mapping_conflicts_total` | counter | `kind` (service_on_stock, gift_mismatch, inactive_account…) | chính sách hạch toán lệch danh mục |
| `bizcity_posting_default_group_fallback_total` | counter | — | còn định khoản bằng nhóm mặc định (phải về 0) |
| `bizcity_costing_run_duration_seconds` | histogram | `trigger` = schedule \| manual | tính giá vốn chậm |
| `bizcity_costing_last_success_timestamp_seconds` | gauge | — | giá vốn lỗi thời (`CostingStale`) |
| `bizcity_costing_items_unpriced` | gauge | — | item có xuất mà chưa có đơn giá |
| `bizcity_inventory_negative_items` | gauge | — | số item × kho tồn âm cuối ngày |
| `bizcity_stock_ledger_mismatch_items` | gauge | — | item có giá trị sổ kho ≠ sổ cái 15x (`STOCK_LEDGER_MATCH`) |

Cảnh báo (`infrastructure/monitoring/prometheus/alerts.yml`, kèm `alerts.test.yml`): `ItemResolutionUnknownHigh` (tỷ lệ unknown > 5% / 1h theo nguồn), `ItemsUnclassifiedGrowing`, `PostingDefaultGroupFallback` (> 0 sau ngày đơn vị tắt fallback), `CostingStale` (> 35 ngày), `StockLedgerMismatch` (> 0 quá 24 giờ), `InventoryNegativeItems`.

Span (ADR-0010): `intake.item.resolve` (`bizcity.item.ref_kind`, `bizcity.item.result`, `bizcity.finding.code`), `posting.mapping.resolve` (`bizcity.posting.group`, `bizcity.posting.conflict`), `costing.run` (`bizcity.costing.month`, `bizcity.costing.items`), `item.merge`. Một trace xuyên ① → ⑤; thẻ mặt hàng và màn trace lấy `traceId` từ `audit_logs` / `posting_log` để mở Bàn điều tra (PHASE-019).

Dashboard Grafana **09 Danh mục & định khoản**: tỷ lệ tra định danh theo nguồn; nợ phân loại; xung đột ánh xạ; giá vốn (lần chạy, thời lượng, item chưa giá); tồn âm; lệch kho – sổ; top mã lỗi IN-ITEM-*.

## 7. Migration K3 (W2) và nâng cấp

1. Tạo `items`, `item_codes`, `item_classification`; **điền từ `products`**: mỗi `products` → một `items` (ULID mới) + một `item_codes(kind=sku, valid_from = '1970-01-01')` + một `item_classification` hiện hành từ `posting_group_code`, `tax_*`, `excise_rate`, cờ theo dõi; `parent_sku` → `parent_item_id`; `barcode` → `item_codes(kind=barcode)`.
2. Thêm `item_id` vào bảng sổ, điền ngược theo mã (JOIN `item_codes` kind sku); dòng có mã không tra được → **dừng migration**, in danh sách (phải tạo item trước; `kiem-nang-cap.sh` bắt lỗi này).
3. Trigger: `items` chặn UPDATE `item_id`; `item_codes` chỉ INSERT + UPDATE `valid_to` (từ NULL thành ngày); bảng sổ chặn UPDATE `item_id`, `product_sku` / `sku` trên dòng đã ghi.
4. `products` → khung nhìn; `COMMENT ON` tiếng Việt; `db/types.ts`, `schema-catalog.ts` cập nhật (SC-DATA-7).
5. `kiem-nang-cap.sh`: trước / sau nâng cấp, tồn cuối theo mã (SL, GT) từng kho phải trùng; `DG-ITEM-3 = 0`.

## 8. Liên kết với phase khác

- **021**: IN-ITEM-* nằm trong danh mục `bizcity_intake_findings@1`; remedy theo `bizcity_remedy@1` (022).
- **012**: gói định khoản có thể khai `itemKinds[]` (loại đối tượng → nhóm hạch toán mặc định theo ngành) — mở rộng `bizcity_posting_template@1` 1.3.
- **019**: màn trace dùng `traceId`, link Bàn điều tra.
- **023**: thẻ mặt hàng và thẻ tài khoản cùng một khuôn "Một câu · Bản chất · Số của đơn vị · Vì sao / Sửa"; mục "Hạch toán" của thẻ mặt hàng mở thẻ tài khoản 156 / 632 / 511.
