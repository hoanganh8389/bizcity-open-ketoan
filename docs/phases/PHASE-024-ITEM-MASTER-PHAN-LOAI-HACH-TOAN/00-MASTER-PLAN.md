# PHASE-024 · 00 — Master plan: Item Master & Accounting Classification
<!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — master plan: sáu nguyên tắc, vai trò trụ cột, chuỗi chuẩn, thành phần Core, D024-*, Q024-*, W0–W4 -->

> **Ký hiệu:** ☐ chưa làm · 🟡 có mã + test · ✅ có bằng chứng · ⛔ chờ chủ · ❌ huỷ.
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

## 1. Vì sao

Phần yếu nhất của phần mềm kế toán nối với POS / ERP không phải định khoản mà là **danh mục hàng hoá đi vào sổ như thế nào**: mã đổi, mã gộp, mã rác tự sinh, nhóm hạch toán gán tay rồi quên, tài khoản suy từ đuôi mã, biến thể lúc tách lúc gộp. Mỗi lỗi ở đây lan sang sổ kho, giá vốn, báo cáo và chỉ lộ ra khi thanh tra. Open Kế Toán xử lý bằng **một trụ cột riêng — Item Master** — đứng trước luật định khoản, có hợp đồng, có validator, có bất biến.

## 2. Sáu nguyên tắc và vai trò từng trụ cột

Sáu nguyên tắc (chỉ đạo chủ dự án, nay là R-ITEM-1…6):

1. Mỗi đối tượng hàng hoá có định danh duy nhất, không phụ thuộc tên hay vị trí nhóm hàng.
2. Danh mục có cấu trúc phân cấp nhưng không dùng mã phân cấp làm khoá liên kết kế toán.
3. Biến thể cần tồn kho riêng khi là những đơn vị hàng hoá phân biệt được.
4. Tài khoản kế toán xác định qua chính sách hạch toán, không suy đoán chỉ từ tiền tố mã hàng.
5. Thay đổi danh mục không làm sai hoặc viết lại lịch sử đã ghi sổ.
6. Dữ liệu từ POS, ERP, kho và plugin phải vượt qua validation trước khi ảnh hưởng Ledger.

| Trụ cột | Xác định | Nguyên tắc giữ | Mã hiện có / sẽ có |
|---|---|---|---|
| **Item Master** | *đối tượng hàng hoá là gì*: định danh, mã (phiên bản), biến thể, ĐVT, thuộc tính theo dõi | 1, 2, 3, 5 | `items`, `item_codes`, `item_variants`, `product_units` → `kernel/masterdata/items/*` |
| **Item Resolution + Validation** (trạm tiền kiểm L3) | mã → định danh + phân loại tại ngày; chứng từ hợp lệ hay vào bể chờ | 6 | `kernel/masterdata/item-resolver.ts`, `IN-ITEM-*` |
| **Accounting Rules** (Accounting Mapping Resolver) | *hạch toán thế nào*: phân loại → nhóm hạch toán → tài khoản, theo lý do, ngữ cảnh, chế độ có phiên bản | 4, 5 | `kernel/posting/account-resolver.ts` mở rộng |
| **Costing Engine** | *giá trị bao nhiêu*: giá vốn theo item × nhóm tính giá × tháng | 5 | `kernel/inventory/costing.service.ts` khoá theo `item_id` |
| **Ledger** | *ghi nhận kết quả*: sổ cái, sổ phụ kho — chỉ thêm | R-LEDGER, R-ITEM-0 | `ledger.service.ts`, trigger |
| **Conformance** | *bảo vệ tính đúng*: DG-ITEM-*, SC-ITEM-*, ca giả định F24-* | mọi | `tests/conformance`, diagnostics L3 |
| **Prometheus · Tempo** | *giám sát toàn bộ*: số đo, trace mỗi bước | — | `bizcity_item_*`, span `intake.item.resolve`… |

## 3. Chuỗi chuẩn (trả lời "có nhất thiết là … ?")

Chuỗi chủ dự án nêu: *POS / ERP Plugin → Accounting Event → Item Resolution → Validation → Accounting Rules → Costing → Ledger Commit → Domain Event.* Kernel hiện có đã chạy một chuỗi gần như vậy nhưng khác hai chỗ, và nên giữ cách của Kernel:

```text
 POS / ERP / kho / plugin / module (ctx.ledger.submit)
   │  chứng từ bizcity_ledger_intake@1 (mã hàng: sku | barcode | itemId)
   ▼
 ① TRẠM TIỀN KIỂM (ADR-0014)                      ← Validation, gồm Item Resolution
   L1 khuôn → L2 tổng → L3 danh mục: ITEM RESOLUTION (mã → item_id + mã hiệu lực + phân loại tại docDate)
   → L4 nghiệp vụ (kỳ khoá, chủ chứng từ) → L5 định khoản thử
   không đạt → intake_inbox (bể chờ) với IN-* + remedy; KHÔNG vào accounting_events
   ▼
 ② ACCOUNTING EVENT  accounting_events (docKey + version), payload nguyên văn + ảnh chụp resolution
   ▼
 ③ ACCOUNTING RULES  lý do + phân loại + ngữ cảnh → Accounting Mapping Resolver → dòng Nợ / Có (giá vốn: dòng chờ số 0)
   ▼
 ④ LEDGER COMMIT     ledger_entries / ledger_lines (item_id + product_sku ảnh chụp), inventory_movements — một giao dịch với ②③
   ▼
 ⑤ DOMAIN EVENT      outbox cùng giao dịch: bizcity.ledger.entry.posted, bizcity.item.* → subscriber sau commit
   ▼
 ⑥ COSTING           cuối tháng / theo yêu cầu: giá vốn bình quân theo item × nhóm tính giá → GHI ĐÈ dòng chờ (costFill), không đảo
   ▼
 ⑦ CONFORMANCE       mỗi đêm + trước khoá kỳ: DG-ITEM-*, INVENTORY_NEGATIVE, STOCK_LEDGER_MATCH, COGS_STALE → Bàn đánh giá
 ═══ Prometheus (số đo mỗi bước) · Tempo (một trace xuyên ① → ⑤; ⑥ ⑦ trace riêng, nối bằng item_id / docKey) ═══
```

Hai khác biệt và lý do:

| Chuỗi nêu | Chuỗi Kernel | Vì sao |
|---|---|---|
| Accounting Event **trước** Item Resolution / Validation | Validation (gồm Item Resolution) **trước**; chỉ chứng từ đạt mới thành sự việc | Sự việc là sự thật kế toán (R-EVENT). Thứ chưa qua kiểm không được là sự việc; để lại ở bể chờ để sửa (ADR-0014 D1) |
| Costing **trước** Ledger Commit | Costing **sau**, định kỳ, ghi đè dòng giá vốn chờ | Giá vốn bình quân tháng chỉ có khi đủ phát sinh của tháng; ghi sổ không chờ giá vốn (R-LEDGER, migration 0060 dòng chờ). Đơn vị dùng giá đích danh / nhập giá từ tệp vẫn cùng chỗ này |

Những gì giữ nguyên: Item Resolution là **bước riêng, có tên, có span, có số đo**; Rules chỉ nhận đầu ra của Resolution; Domain Event cùng giao dịch với Ledger Commit (R-OUTBOX).

## 4. Thành phần Core cần thêm

| # | Thành phần | Lớp | Đợt |
|---|---|---|---|
| C-1 | Hợp đồng **`bizcity_item_master@1`** (`docs/contracts/BIZCITY-ITEM-MASTER-v1.md` + schema): item, mã (kind, hiệu lực), biến thể, ĐVT, phân loại hạch toán; khuôn gửi từ plugin (`sku` \| `barcode` \| `itemId`) | contracts | W1 |
| C-2 | Bảng `items` (`item_id` ULID, `kind`, `name`, `parent_item_id`, `retired_at`), `item_codes` (chỉ thêm, hiệu lực), `item_classification` (phiên bản theo ngày) — RLS; `products` giữ làm khung nhìn tương thích | Data (K1) | W1 |
| C-3 | **Item Resolver** `packages/kernel/src/modules/masterdata/item-resolver.ts`: `resolve(tenant, {sku|barcode|itemId}, asOf) → { itemId, code, classification, units }`, đệm theo phiên bản danh mục (R-CACHE) | Kernel | W1 |
| C-4 | Trạm tiền kiểm L3 gọi Resolver; mã `IN-ITEM-001…008` + remedy; bỏ `ensureProducts` (D024-3) | Document | W1 |
| C-5 | **Accounting Mapping Resolver**: `AccountResolver` nhận `classification` thay `products.posting_group_code`; phát hiện xung đột (nhóm ↔ lý do ↔ loại chứng từ, vd dịch vụ có dòng kho) → `IN-POST-005`; `SC-ITEM-3` | Kernel posting | W2 |
| C-6 | Migration **K3**: `item_id` trên `ledger_lines`, `inventory_movements`, `inventory_costs`, `product_units`, `product_prices`; điền ngược từ mã; trigger `items_identity_immutable`, `item_codes` chỉ thêm, chặn đổi `item_id` dòng đã ghi; `kiem-nang-cap.sh` so tồn theo mã trước / sau | Data (K3) | W2 |
| C-7 | Action `core.item.upsert` / `add-code` / `retire-code` / `classify` / `merge-preview` / `merge`; `core.product.upsert` (3.17) chuyển tiếp; khung nhìn `bizcity_read.items`, `bizcity_read.item_codes` | Action / Data | W2 |
| C-8 | Diagnostics `DG-ITEM-1…5`, `STOCK_LEDGER_MATCH` theo item; ca giả định `F24-ITEM-*` (lane scenario, PHASE-022) | Conformance | W3 |
| C-9 | Số đo `bizcity_item_*`, `bizcity_posting_mapping_*`, `bizcity_costing_*`; span `intake.item.resolve`, `posting.mapping.resolve`, `costing.run`; dashboard Grafana **09 Danh mục & định khoản**; luật cảnh báo | Observability | W3 |
| C-10 | Giao diện: trang **Quy định dữ liệu hàng hoá** (HT09), **thẻ mặt hàng**, validator trong form mặt hàng, **trace** từ dòng sổ về nguồn (nối Bàn điều tra PHASE-019) | Web | W4 |

## 5. Quyết định đề xuất D024-* (chờ chủ duyệt)

| # | Quyết định | Vì sao |
|---|---|---|
| D024-1 | `item_id` = **ULID** (26 ký tự, có thứ tự thời gian, in ra được); cấp bởi Core khi tạo; plugin có thể gửi `itemId` nếu biết | ổn định giữa bản cài, nhập xuất được; không lộ số đếm |
| D024-2 | `products` không xoá: trở thành **khung nhìn** `products` = `items ⋈ item_codes (kind sku, hiệu lực hôm nay) ⋈ item_classification (hiện hành)`; API `/api/v1/products` giữ khuôn trả về, thêm `itemId` | 44 tệp api / web / test và plugin ngoài không vỡ; chuyển dần |
| D024-3 | **Bỏ tự thêm mặt hàng** từ chứng từ (`ensureProducts`). Mã lạ → `IN-ITEM-001` block vào bể chờ, remedy "Tạo mặt hàng từ dòng này" (điền sẵn tên, ĐVT, gợi ý phân loại từ quy tắc mã). Đơn vị đang chạy bật `bizcity.item.auto_create = true` để giữ hành vi cũ trong giai đoạn chuyển, kèm `IN-ITEM-004` warn | nguyên tắc 6; danh mục không nở mã rác |
| D024-4 | Phân loại hạch toán **tách khỏi `products`** và có ngày hiệu lực; được chụp vào chính sách kế toán (ADR-0009) khi phát hành chế độ; định khoản lại dùng phân loại tại ngày hạch toán | nguyên tắc 4, 5 |
| D024-5 | Nhóm hạch toán mặc định chỉ áp khi `bizcity.item.default_group_fallback = true` — **mặc định bật cho mọi đơn vị** (R-GATE-9: mặc định cho phép, nhắc khi sai); mỗi lần dùng nhóm mặc định là cảnh báo mềm `ITEM-HINT-001` / `IN-ITEM-004` + số đo; kế toán trưởng tắt ở HT09 khi `DG-ITEM-2 = 0` <!-- [2026-11-03 01:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — R-GATE-9 mặc định cho phép, nhắc khi sai (chủ dự án: "rule chung"): trước đây "đơn vị mới tắt" --> | R-ITEM-8: thiếu cấu hình phải nhìn thấy (nhắc, không chặn) |
| D024-6 | `skuInfo` (quy tắc mã của đơn vị) chỉ dùng để **gợi ý** phân loại và kiểm `IN-ITEM-007`; luật định khoản không import gói mua hàng (`SC-ITEM-3`) | nguyên tắc 4 |
| D024-7 | Biến thể = item con (`parent_item_id`) khi người dùng chọn "theo dõi tồn riêng"; thuộc tính trưng bày ở `items.attributes` (jsonb) không tạo item | nguyên tắc 3 |
| D024-8 | Gộp mã = `item_codes.kind = alias` trỏ item đích + ngày hiệu lực; sổ cũ giữ `item_id` cũ; báo cáo tồn gộp theo bí danh khi người xem chọn "gộp bí danh" | nguyên tắc 5 |

## 6. Câu hỏi cần chủ chốt (Q024-*)

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q024-1 | Điền ngược `item_id` cho sổ cũ: làm **một lần khi nâng cấp** (K3, cần sao lưu + kiểm) hay cho phép hai chế độ song song (mã / item) một thời gian? | Một lần khi nâng cấp, trong giao dịch, có `kiem-nang-cap.sh` so tồn; không chạy hai chế độ |
| Q024-2 | Loại đối tượng (`kind`) khởi đầu: `goods`, `material`, `finished`, `service`, `tool`, `asset`, `gift`, `packaging`, `other` — đủ chưa? Có cần `combo` (bộ hàng) là item hay là công thức? | Đủ cho W1; `combo` là **công thức** (bảng riêng) trỏ item thành phần, không phải item tồn kho — để W4 |
| Q024-3 | Mã ngoài (`external:<nguồn>`): một item nhiều mã ngoài từ nhiều nguồn — có cho một nguồn có hai mã cùng lúc không? | Không: mỗi `(nguồn, code)` một item tại một thời điểm; một item nhiều nguồn được |
| Q024-4 | Quy tắc mã (`SKU_RULE`) là của đơn vị hay của gói định khoản / preset? | Của đơn vị (cấu hình `bizcity.item.sku_rule`), preset điền sẵn; validator chỉ `hint` |
| Q024-5 | Đưa phase vào `PHASES.md` / `roadmap.json` ngay (2.22, 2.23 — đã thêm ở W0) hay chờ duyệt D024-*? | Đã thêm, tín hiệu `capability` còn planned nên không đổi bảng điểm |

## 7. Năm đợt

| Đợt | Nội dung | Mức | Bằng chứng |
|---|---|---|---|
| **W0** | README, master plan, kiến trúc, UI / UX, bản mẫu; ADR-0017, RULE-ITEM, CANON; roadmap 2.22 / 2.23 | K0 | selfcheck ĐẠT; chủ duyệt bản mẫu |
| **W1** | C-1…C-4: hợp đồng, bảng mới (song song `products`), Item Resolver, IN-ITEM-* ở trạm, bỏ tự thêm (có khoá chuyển tiếp) | K1 | T024-1…3 |
| **W2** | C-5…C-7: Mapping Resolver, migration K3 điền ngược, action `core.item.*`, khung nhìn | **K3** | T024-4…6; `kiem-nang-cap.sh` |
| **W3** | C-8, C-9: DG-ITEM-*, F24-*, số đo, span, dashboard 09, cảnh báo | K1 | T024-7, 8 |
| **W4** | C-10: HT09, thẻ mặt hàng, validator form, trace; hướng dẫn | K0 | T024-9; chủ duyệt màn |

## 8. Cổng nghiệm thu

- Bất biến R-ITEM-0 có **trigger** và ca test cố ý vi phạm (đổi `item_id`, sửa `item_codes`, UPDATE `product_sku` dòng đã ghi) đều bị chặn.
- Đổi mã một mặt hàng có 1.000 dòng sổ: 0 dòng sổ thay đổi, sổ kho theo mã cũ / mã mới đều tra ra đúng, giá vốn tháng không đổi.
- Chứng từ POS gửi mã lạ: không vào `accounting_events`; ở trạm có `IN-ITEM-001` + nút tạo mặt hàng; tạo xong gửi lại → posted.
- Mặt hàng chưa phân loại có phát sinh: `DG-ITEM-2` ≠ 0, HT09 hiện đỏ ở nguyên tắc 4 với nút mở thẻ mặt hàng; phân loại xong → 0.
- Dashboard 09 có số liệu thật từ đơn vị test; cảnh báo `ItemsUnclassifiedGrowing`, `CostingStale`, `ItemResolutionAmbiguous`, `StockLedgerMismatch` bắn / hết bắn đúng trong `alerts.test.yml`.
