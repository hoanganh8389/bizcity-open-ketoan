# PHASE-037 · 30 — `bizcity_combo@1`: hợp đồng, action, API, sự kiện (đề xuất)
<!-- [2026-11-17 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — W0: vị trí của bizcity_combo@1 giữa các hợp đồng, mở rộng tương thích khuôn chứng từ, action core.combo.*, gợi ý combo cho máy bán, sự kiện, idempotency, đường dẫn mã sẽ sửa -->

> **0.1.0-draft — chỉ là đề xuất, CHƯA có mã.** Hợp đồng chuẩn: [`docs/contracts/BIZCITY-COMBO-v1.md`](../../contracts/BIZCITY-COMBO-v1.md) (kiểu dữ liệu, JSON mẫu). Tệp này nói **cách nó cắm vào framework** và việc phải làm ở từng gói.

## 1. Vị trí

`bizcity_combo@1` là **hợp đồng liên kết** giữa `bizcity_item_master@1` (mặt hàng), `bizcity_policy@1` (phiên bản, băm, phát hành), `bizcity_ledger_intake@1` (khuôn chứng từ), `bizcity_inventory@1` (lô, nguồn, giá trị), `bizcity_event@1` (sự kiện). Combo không giữ sổ cái, không giữ sổ kho.

- **Mở rộng không phá vỡ.** Giữ nguyên `sku`, `itemId`, `warehouseCode`, `isGift`, `excludeFromCost`, `policyRef` của `packages/contracts/src/documents.ts`. Thêm trường **tuỳ chọn** ở bản phụ của `bizcity_ledger_intake@1`; nguồn cũ không gửi vẫn chạy, độ phủ truy vết ghi `legacy`.
- **Định danh chuẩn.** Máy chủ luôn phân giải bằng `itemId` + ngày chứng từ; có cả `sku` thì phải khớp; `sku` không là khoá ngoại.
- **Bằng chứng chứng từ.** Giữ `docKey`, `version`, `lineKey`, `policyRefs`; một chứng từ có thể có nhiều lần thực hiện combo; một lần thực hiện không nhân bản khi gửi lại.

## 2. Mở rộng khuôn chứng từ (chữ chốt riêng khi làm S037-9)

| Chỗ | Trường mới (tuỳ chọn) | Nghĩa |
|---|---|---|
| chứng từ | `comboInstances[]` `{ instanceId, comboRef { comboId, version, hash }, side, times?, lineKeys[] }` | các lần thực hiện combo trong chứng từ |
| dòng mua / bán / trả | `comboInstanceId`, `comboLineRef` | dòng thuộc lần nào, ứng với thành phần nào |
| | `commercialRole` (`mua` · `tang` · `tang_tuy_chon` · `bao_bi`) | vai trò dòng; thay dần `lineType` riêng của module mua hàng |
| | `giftSource` (năm nguồn quà) | bắt buộc ghi khi `commercialRole` ≠ `mua`; thiếu → `chua_ro` + nhắc |
| | `receiptSourceRef`, `originalLineRef` | dòng nhận gốc (khi xuất quà) · dòng gốc (khi trả) |
| | `valueTreatmentRef`, `taxTreatmentRef` | bản chính sách đã áp |
| dòng chuyển kho / điều chỉnh | `itemId` | **đang thiếu** ở `stockLineSchema`; cần để chuyển phân kho giữ định danh |

`isGift` và `excludeFromCost` **giữ nguyên nghĩa cũ** cho nguồn cũ. Khi dòng có `commercialRole` + `giftSource`, Core suy hai cờ cũ từ chính sách `gift_treatment` để đường tính giá hiện tại không đổi kết quả cho tới bước B8.

## 3. Rule Contract thêm vào Policy Registry

| Mã | Miền | Việc | Trạng thái |
|---|---|---|---|
| `core.combo.definition@1` | core | Bọc một bản combo (hai mặt, thành phần có `itemId`) để dùng phiên bản, băm, hiệu lực, sự kiện của sổ đăng ký | mới |
| `core.combo.gift_treatment@1` | core | Ba công tắc định giá · ghi tồn · lên thuế theo nguồn quà (thu hẹp theo loại phân kho, nhà cung cấp, combo) | mới |
| `purchase.promo_gift@1` | purchase | Luật mua X tặng Y phía mua: từ dòng mua ra dòng tặng kỳ vọng, để đối chiếu phiếu nhận (`IN-COMBO-003`) | mã phong bì đã có trong sổ, **khuôn luật chưa có** |
| `sale.promo.buy_x_get_y@1`, `sale.promo.combo@1` | sale | Đã có; bổ sung `itemId` cho `combo@1`, nhận `comboRef` để phát `comboInstanceId` | sửa nhỏ, tương thích |

Mọi khuôn luật thuần và tất định, có `spec` + `vectors` để máy bán viết lại (như `bizcity_policy@1` §4).

## 4. Action

| Action | Quyền tối thiểu | Ghi gì | Ghi sổ cái? |
|---|---|---|---|
| `core.combo.resolve` | `catalog:read` | không — phân giải mã combo / mã vạch / định danh ra bản và thành phần | không |
| `core.combo.suggest` | `catalog:read` | không — combo có mặt bán chứa mặt hàng đang gõ (§5) | không |
| `core.combo.plan` | `catalog:read` + đọc kho | không — xem trước dòng hàng thật, tồn / lô, quyền dùng, cách xử lý, lời nhắc | không |
| `core.combo.publish` | `settings:write` | bản combo vào sổ đăng ký + sổ combo; bằng chứng, sự kiện | không |
| `core.combo.unbundle` | `inventory:write` | nhả quan hệ giữ bộ / giữ chỗ của một lần thực hiện | không |
| `core.combo.repurpose` | `inventory:write` + quyền riêng | đổi quyền dùng của một nguồn (chỉ để tặng → bán được) kèm căn cứ | qua Kernel **nếu** có sự việc kế toán |
| `core.combo.trace` | `catalog:read`; cột giá trị cần `ledger:read` | không — đường truy vết + độ phủ | không |

Không có action "xác nhận lần thực hiện" riêng: lần thực hiện **đi cùng chứng từ** qua `ctx.ledger.submit()` / `POST /api/v1/documents`, ghi trong cùng giao dịch với chứng từ (R-LEDGER-11) — không thể có lần thực hiện đã xác nhận mà chứng từ không vào sổ.

Mọi action ghi theo `bizcity_action@1`: `defineAction`, bằng chứng, `Idempotency-Key`, `dryRun`, kiểm quyền. Quyền gọi tên theo khuôn quyền hiện có; quyền mới (nếu cần) chốt cùng PHASE-028.

## 5. Máy bán: gõ mã hàng, gợi ý combo

Yêu cầu chủ dự án: *gõ mã hàng → gợi ý danh sách combo đi kèm mã hàng đó để chọn combo 3, combo 5, combo 12…*

```text
GET /api/v1/combos/suggest?itemId=<ULID>|sku=<mã>&at=2026-11-17&branch=HN01&channel=pos&qty=3
→ { asOf, etag, items: [
     { comboRef: { comboId, version, hash }, code: "PED800-3P1", name: "Mua 3 tặng 1",
       policyRef: { key, version, hash },
       need: [ { itemId, sku, qty: 3 } ], gifts: [ { itemId, sku, qty: 1 } ],
       quanHeDauVao: "ap_dung_theo", conDung: 12,            // số bộ còn dùng được; null = không giới hạn
       usable: true, reason: null }                          // usable=false kèm lý do (R-BLOCK)
   ] }
```

- Chỉ đọc; sắp theo số lượng mua tăng dần (3, 5, 12); combo hết hạn mức / hết nguồn quà vẫn hiện, mờ, kèm lý do.
- Ngoại tuyến: máy bán dựng chỉ mục `itemId → combo` từ `GET /api/v1/policies` (bản bán) + `GET /api/v1/combos?at=`; `etag` để hỏi lại rẻ.
- Chọn combo → máy bán gọi `core.combo.plan` (hoặc tự tính theo `spec`) → **dòng hàng thật** + `comboInstanceId` + `policyRef`. Màn có thể hiện một dòng "Combo mua 3 tặng 1"; dữ liệu gửi đi là từng dòng `itemId`.
- Hết combo (R-COMBO-10): cùng những mặt hàng đó bán theo giá thường, không `comboInstanceId`. Không có nút "phá combo".
- Gắn vào: `modules/pos/api/actions/catalog-search.ts` (thêm khối `combos` hoặc gọi riêng) và `PhieuHangForm.tsx` của phiếu bán BH10.

## 6. Route (đề xuất, chưa tồn tại)

```text
GET  /api/v1/combos?at=&side=&issuer=&q=
GET  /api/v1/combos/:comboId/versions/:version
GET  /api/v1/combos/suggest?itemId=&at=&branch=&channel=&qty=
POST /api/v1/combos/resolve          { code | barcode | comboId, at }
POST /api/v1/combos/plan             { comboRef, side, docDate, branchCode, lines | times }
POST /api/v1/combos                  (phát hành bản; Idempotency-Key)
POST /api/v1/combos/instances/:instanceId/unbundle
POST /api/v1/combos/stock/repurpose
GET  /api/v1/combos/trace?instanceId=|itemId=|docKey=
```

## 7. Sự kiện (outbox, sau commit)

| `type` | `data` |
|---|---|
| `bizcity.combo.published` | `{ comboId, version, contentHash, effectiveFrom, sides[], closes }` |
| `bizcity.combo.retired` | `{ comboId, retiredVersions[] }` |
| `bizcity.combo.instance.unbundled` | `{ instanceId, comboId, version, sourceDocKey }` |
| `bizcity.combo.stock.repurposed` | `{ itemId, lotId?, warehouseUid, originId, from, to, basisRef }` |

Phong bì theo [`bizcity_event@1`](../../contracts/BIZCITY-EVENT-v1.md). Không mang nội dung combo — nhận xong gọi `GET /combos`. Lần thực hiện combo **không** có sự kiện riêng: nó thuộc chứng từ, đi cùng sự kiện ghi sổ đã có. Combo không được phát sự kiện thay chứng từ hay thay sổ cái.

## 8. Sai và đúng

**Sai** (SC-COMBO-3 sẽ bắt nhánh mới kiểu này):

```ts
if (line.isGift || warehouse.typeCode === 'KKM') {
  cost = 0; vatBase = 0; includeInTax = false;
}
```

**Đúng về kiến trúc** (mã giả minh hoạ cổng, không phải API đã có):

```ts
const item      = await masterdata.resolveItem(line.itemId, docDate);
const origin    = await inventory.resolveOrigin(line.receiptSourceRef, line.lotNo);
const treatment = await policies.evaluate('core.combo.gift_treatment@1',
                    { giftSource: origin.giftSource, warehouseType, docDate });
// treatment = { dinhGia, ghiTon, lenThue, basisRef, version, hash } — lưu lên dòng thực hiện.
// Cổng kiểm lại; Engine phân bổ lượng / giá; chỉ Kernel ghi sổ.
```

## 9. Idempotency, đồng thời, số học

- Khử trùng theo `(tenant_id, source_doc_key, source_doc_version, instance_id)` và `idempotencyKey`. Cùng nội dung → trả kết quả cũ; khác nội dung cùng khoá → `IN-COMBO-011`. Đảo là lần thực hiện mới có `reversesInstanceId`.
- Khoá theo thứ tự `(đơn vị, item_id, warehouse_uid, lot_id, origin_id)` khi ghi dòng xuất quà; **không** khoá theo `combo_id`.
- Lượng `numeric(18,4)`, tiền `numeric(18,2)`; ở biên hợp đồng lượng theo đơn vị nhỏ nhất như `bizcity_ledger_intake@1`; không dùng số thực để kiểm bảo toàn.
- Không cấp lại `instanceId` khi gửi lại. Sửa chứng từ = `version` mới của chứng từ; bản cũ xử lý theo luật chứng từ + sổ.
- Không ghi lùi vào kỳ đã khoá; điều chỉnh ở kỳ mở, nối về gốc.

## 10. Đường dẫn mã sẽ sửa (khi được duyệt)

| Khu vực | Việc | Điều kiện |
|---|---|---|
| `packages/contracts/src/combo.ts`, `documents.ts` | kiểu, zod, JSON Schema; trường tuỳ chọn ở dòng chứng từ; `itemId` ở `stockLineSchema` | chữ chốt S037-4, S037-9 |
| `docs/contracts/BIZCITY-COMBO-v1.md`, `BIZCITY-LEDGER-INTAKE-v1.md`, `BIZCITY-POLICY-v1.md` | cập nhật cùng PR mã (CANON §5) | — |
| `apps/api/src/modules/system/rule-contracts/` | `core.combo.definition@1`, `core.combo.gift_treatment@1`, `purchase.promo_gift@1`; `itemId` cho `sale.promo.combo@1` | — |
| `packages/kernel/src/modules/masterdata/**` | sổ combo, phân giải mã combo → `item_id` | không vòng qua Item Master |
| `packages/kernel/src/modules/inventory/**` | phân bổ nguồn, thứ tự lấy nguồn, giá vốn theo nguồn | phụ thuộc PHASE-032 B6 |
| `modules/mua-hang/domain/**`, `apps/api/src/phan-he/mua-hang/**` | phiếu nhận theo combo; ánh xạ `lineType` → `commercialRole` + `giftSource` | `phan-he/` đóng băng: phần mới viết "sạch SDK" (ADR-0024) |
| `modules/pos/**`, `apps/web/src/components/phieu-hang/**` | gợi ý combo, giải dòng, hết combo bán rời | — |
| `apps/api/src/modules/sale-programs/**` | hạn mức theo nguồn quà cạnh hạn mức theo chi nhánh | — |
| `modules/<key>/` mới cho màn *Combo*, *Nguồn quà & cách xử lý* | giao diện + action; không thêm thư mục dưới `phan-he/` | ADR-0024 |
| `db/migrations/NNNN_*.sql` | sổ combo, lần thực hiện, phân bổ nguồn; RLS | số lấy bằng `so-tiep-theo.mjs` lúc viết |
| `apps/api/test/**`, `tests/conformance/**` | ca vàng G1..G26, K1..K12; SC-COMBO-1..3 | PostgreSQL thật |

**Thứ tự:** rà mã cũ → chốt hợp đồng → migration → đầu vào → kho → đầu ra → kế thừa → giá vốn theo nguồn → đối soát. Không dựng màn "combo" trước rồi nhét logic vào `products` / `inventory_costs`.
