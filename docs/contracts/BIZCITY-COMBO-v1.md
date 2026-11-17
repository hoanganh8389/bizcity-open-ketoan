# `bizcity_combo@1` — Combo: thoả thuận thương mại có phiên bản, hai mặt mua / bán, lần thực hiện, nguồn quà
<!-- [2026-11-17 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — W0: hợp đồng nháp của Combo (ADR-0035): định nghĩa combo hai mặt, lần thực hiện, năm nguồn quà, ba công tắc, mở rộng tuỳ chọn khuôn chứng từ, gợi ý combo cho máy bán; chưa có mã -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Phiên bản:** 0.2.0-draft · 2026-11-17 · **Trạng thái:** Đề xuất — [ADR-0035](../adr/ADR-0035-combo-identity-phan-kho-nguon-qua.md) **chấp nhận** 2026-11-17; **CHƯA CÓ MÃ** <!-- [2026-11-17 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — 0.2.0-draft: phân kho chính phankhoId = 0, whenSourceOut theo từng combo, gift_treatment theo CANON §0.11 -->
> **Nguồn sự thật (đề xuất, chưa có mã):** kiểu ở gói contracts, tệp `combo.ts` (đề xuất) · sổ combo ở `packages/kernel/src/modules/masterdata/**` · khuôn luật ở `apps/api/src/modules/system/rule-contracts/`
> **Luật:** [R-COMBO](../rules/RULE-COMBO.md) · **Kế hoạch:** [PHASE-037](../phases/PHASE-037-COMBO-IDENTITY-PHAN-KHO-KHUYEN-MAI/README.md) · **Hợp đồng kề:** [`bizcity_item_master@1`](BIZCITY-ITEM-MASTER-v1.md) (`itemId`), [`bizcity_policy@1`](BIZCITY-POLICY-v1.md) (phiên bản, băm, `policyRefs`), [`bizcity_ledger_intake@1`](BIZCITY-LEDGER-INTAKE-v1.md) (khuôn chứng từ), [`bizcity_inventory@1`](BIZCITY-INVENTORY-v1.md) (lô, nguồn, giá trị)

## 1. Ý nghĩa

Combo trả lời: các dòng hàng này **đi cùng nhau theo thoả thuận nào** (`comboId`), **bản nào** (`version`, `hash`), **lần nào** (`instanceId`), ở **mặt mua hay mặt bán**, và mỗi dòng quà **từ nguồn nào**. Nó là lớp liên kết; không giữ sổ kho, không giữ sổ cái.

Bất biến: **`comboId` không bao giờ đứng chỗ `itemId`** (R-COMBO-1); bản đã phát hành không sửa (R-COMBO-2); **không có trường tài khoản** ở bất kỳ kiểu nào (R-COMBO-5); không trường nào tự quyết định giá vốn hay thuế (R-COMBO-6).

## 2. Kiểu dữ liệu (đề xuất; thi hành bằng zod)

```ts
export type ComboOrigin   = 'ncc' | 'cong_ty';                 // ai đưa ra combo
export type ComboSide     = 'mua' | 'ban';
export type ComboKind     = 'mua_ban' | 'chi_mua' | 'chi_ban'; // SUY RA từ mặt có mặt, không nhập
export type LineRole      = 'mua' | 'tang' | 'tang_tuy_chon' | 'bao_bi';
export type GiftSource    = 'qua_ncc_cho_nguoi_ban' | 'qua_ncc_cho_ntd'
                          | 'qua_ncc_giu_ho' | 'qua_cong_ty' | 'chua_ro';
export type Ownership     = 'so_huu' | 'giu_ho' | 'cho_xac_dinh';
export type Restriction   = 'ban_duoc' | 'chi_de_tang' | 'tam_giu';
export type SellRelation  = 'ap_dung_theo' | 'tu_dieu_chinh' | 'doc_lap';
export type WhenSourceOut = 'dung_tang' | 'lay_hang_thuong';
export type TaxDecision   = 'co' | 'khong' | 'cho';

export interface ComboRef { comboId: string; version: number; hash: string }   // ULID · ≥ 1 · sha256

export interface ComboComponent {
  lineKey: string;               // ổn định trong bản
  itemId: string;                // ULID Item Master — KHÔNG phải comboId
  qty: number;                   // đơn vị nhỏ nhất, > 0 (CSDL numeric(18,4))
  role: LineRole;
  optionGroup?: string;          // vd "A" = 4 × 800 g, "B" = 3 × 1,6 kg
  skuSnapshot?: string;          // ảnh chụp để hiển thị; không là khoá
}

export interface ComboSideDef {
  components: ComboComponent[];                     // ≥ 1
  policyRef: { key: string; version: number; hash: string; policyId?: string };
  giftSourceDefault?: GiftSource;                   // mặt mua: nguồn quà theo hợp đồng NCC
  valueTreatmentRef?: { key: string; version: number; hash: string };
  taxTreatmentRef?:   { key: string; version: number; hash: string };
  // chỉ mặt bán:
  sellRelation?: SellRelation;                      // bắt buộc ở mặt bán
  inheritsFrom?: ComboRef & { side: 'mua' };        // bắt buộc khi ap_dung_theo / tu_dieu_chinh
  adjustNote?: string;                              // bắt buộc khi tu_dieu_chinh: khác ở đâu, vì sao
  quota?: { sets?: number; perBranch?: Record<string, number> };
  whenSourceOut?: WhenSourceOut;                    // mặc định dung_tang; lay_hang_thuong bật theo từng combo
}

export interface ComboDefinitionV1 {
  contract: 'bizcity_combo@1';
  comboId: string;
  code: string;                                     // mã hiển thị, có phiên bản
  name: string;
  origin: ComboOrigin;
  issuerPartnerId?: string;                         // bắt buộc khi origin = ncc
  effectiveFrom: string;                            // YYYY-MM-DD
  effectiveTo?: string;
  scope?: { branchCodes?: string[]; channels?: string[]; partnerIds?: string[] };
  buySide?: ComboSideDef;                           // ít nhất một trong hai mặt
  sellSide?: ComboSideDef;
  legalRef?: string;
  benefitRefs?: Array<{ key: string; note: string }>;  // quà không phải hàng (voucher, dịch vụ)
}

export interface ComboInstanceV1 {
  instanceId: string;                               // ULID; không cấp lại khi gửi lại
  comboRef: ComboRef;
  side: ComboSide;
  times?: number;                                   // số bộ trong lần này, mặc định 1
  lineKeys: string[];                               // các dòng của chứng từ thuộc lần này
  reversesInstanceId?: string;
}
```

Kiểm chéo lúc phát hành: có ít nhất một mặt; `sellRelation = doc_lap` ⇔ không có `inheritsFrom`; `ap_dung_theo` ⇒ thành phần mặt bán khớp mặt mua và thời gian / phạm vi nằm trong mặt mua; `tu_dieu_chinh` ⇒ có `adjustNote`; mọi `itemId` phân giải được tại `effectiveFrom`.

## 3. Mở rộng khuôn chứng từ (`bizcity_ledger_intake@1`, bản phụ — tuỳ chọn, tương thích ngược)

| Chỗ | Trường | Kiểu |
|---|---|---|
| chứng từ | `comboInstances?` | `ComboInstanceV1[]` |
| dòng mua / bán / trả | `comboInstanceId?`, `comboLineRef?` | `string` |
| | `commercialRole?` | `LineRole` |
| | `giftSource?` | `GiftSource` |
| | `receiptSourceRef?`, `originalLineRef?` | tham chiếu dòng bền `docKey#version#lineKey` |
| | `valueTreatmentRef?`, `taxTreatmentRef?` | `{ key, version, hash }` |
| dòng chuyển kho / điều chỉnh | `itemId?` | ULID |

Phân kho: nguồn gửi `warehouseCode` (mã phân kho) như hôm nay; Core phân giải ra `warehouses.uid` (= `phankho_id`) tại ngày chứng từ và lưu định danh. **Không thêm trường phân kho thứ hai.** `warehouseCode` bỏ trống (hoặc `phankhoId: 0` ở API combo) = **phân kho chính** của chi nhánh (`is_default`); Core lưu `uid` thật, không lưu số 0.

Nguồn không gửi các trường mới → chạy như cũ, độ phủ truy vết `legacy`.

## 4. JSON mẫu — phiếu nhận 3 tặng 1 (hình dạng đích, CHƯA gửi được hôm nay)

Định danh là chỗ giữ chỗ; thuế 0 chỉ để cô lập ví dụ tiền hàng, không áp cho hoá đơn thật.

```json
{
  "docType": "purchase", "docKey": "erp:hn01:pn:001", "version": 1,
  "docDate": "2026-11-17", "branchCode": "HN01", "sourceSystem": "erp",
  "comboInstances": [
    { "instanceId": "<ULID-LAN>", "side": "mua",
      "comboRef": { "comboId": "<ULID-COMBO>", "version": 1, "hash": "<SHA256>" },
      "lineKeys": ["L1", "L2"] }
  ],
  "lines": [
    { "lineKey": "L1", "itemId": "<ULID-SUA800>", "sku": "PED-800", "qty": 3,
      "commercialRole": "mua", "amountBeforeTax": 300000, "taxCode": "<MA-THUE>", "taxAmount": 0,
      "warehouseCode": "HN01-KHH", "comboInstanceId": "<ULID-LAN>", "comboLineRef": "c1" },
    { "lineKey": "L2", "itemId": "<ULID-SUA800>", "sku": "PED-800", "qty": 1,
      "commercialRole": "tang", "giftSource": "qua_ncc_cho_nguoi_ban", "isGift": true,
      "amountBeforeTax": 0, "taxCode": "<MA-THUE>", "taxAmount": 0,
      "warehouseCode": "HN01-KKM", "comboInstanceId": "<ULID-LAN>", "comboLineRef": "c2" }
  ],
  "policyRefs": [ { "key": "NCC-3P1", "version": 1, "hash": "<SHA256>" } ]
}
```

## 5. Action và route

Bảy action `core.combo.*` (`resolve`, `suggest`, `plan`, `publish`, `unbundle`, `repurpose`, `trace`), route `GET/POST /api/v1/combos…`, gợi ý combo cho máy bán: [PHASE-037 · 30 §4–§6](../phases/PHASE-037-COMBO-IDENTITY-PHAN-KHO-KHUYEN-MAI/30-FRAMEWORK-CONTRACT.md). Lần thực hiện combo không có action riêng — đi cùng chứng từ qua cửa nạp.

## 6. Rule Contract đi kèm (`bizcity_policy@1`)

`core.combo.definition@1` · `core.combo.gift_treatment@1` · `purchase.promo_gift@1` (khuôn luật mới) · `sale.promo.buy_x_get_y@1`, `sale.promo.combo@1` (đã có, bổ sung `itemId` / `comboRef`).

`core.combo.gift_treatment@1` (luật nền [CANON §0.11](../00-CANON.md); thứ tự ưu tiên, ràng buộc chéo, màn cấu hình: [PHASE-037 · 20 §2a](../phases/PHASE-037-COMBO-IDENTITY-PHAN-KHO-KHUYEN-MAI/20-NGHIEP-VU-KE-TOAN-THUE.md)) — tham số một dòng: `{ giftSource, warehouseTypes?, partnerIds?, comboIds?, dinhGia: boolean, cachDinhGia?: 'chia_deu_theo_luong' | 'theo_gia_tri_hop_ly', ghiTon: boolean, lenThue: boolean, legalRef }`. Kết quả áp cho dòng được **lưu lên dòng thực hiện** kèm bản và băm.

## 7. Mã kiểm

`IN-COMBO-001..011`, `CT-COMBO-001..006`, `SC-COMBO-1..3`: [RULE-COMBO](../rules/RULE-COMBO.md) §Mã kiểm. Khi có mã, đăng ký vào `bizcity_findings@1` / `bizcity_intake_findings@1`.

## 8. Giới hạn đã biết (bản nháp)

- Chưa có mã, chưa có migration, chưa có khuôn zod.
- Giá vốn theo nguồn chờ lớp + phân bổ của PHASE-032.
- Văn bản về khuyến mại chưa có trong danh mục văn bản; mã kiểm về thuế ghi căn cứ `NOI-BO`.
- Bộ hàng đóng gói thật không tách (lắp ráp, định mức) **ngoài phạm vi** — ADR riêng.
- Tên giá trị liệt kê (vai trò dòng, nguồn quà, sở hữu…) là tiếng Việt không dấu theo yêu cầu chủ dự án; có thể đổi trước 1.0.0, sau đó đổi = `@2`.

## 9. Changelog

- **0.2.0-draft (2026-11-17):** ADR-0035 chấp nhận — phân kho chính `phankhoId = 0`; `whenSourceOut` bật theo từng combo; `gift_treatment` theo CANON §0.11.
- **0.1.0-draft (2026-11-17):** PHASE-037 W0 — bản đề xuất đầu tiên.
