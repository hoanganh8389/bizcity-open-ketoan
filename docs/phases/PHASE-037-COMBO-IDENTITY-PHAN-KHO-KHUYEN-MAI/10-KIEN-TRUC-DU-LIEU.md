# PHASE-037 · 10 — Kiến trúc dữ liệu: combo không phải mặt hàng, phân kho không phải tài khoản
<!-- [2026-11-17 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — W0: nguồn sự thật từng trách nhiệm, phankho_id = warehouses.uid, sổ combo trên Policy Registry, lần thực hiện, phân bổ nguồn, luồng chuẩn, đối soát, dữ liệu cũ -->

> **Bản thiết kế đích, chưa có migration.** Mọi tên bảng mới ở đây là **đề xuất**; tên bảng đang có được ghi kèm số migration. Hình dạng cuối cùng chốt bằng chữ chốt của từng bước (R-FLOW-2).

## 1. Một nguồn sự thật cho từng trách nhiệm

```text
Đơn mua / phiếu nhận / hoá đơn NCC              Máy bán / phiếu bán / tặng / trả
            |                                                |
            v                                                v
   Khuôn chứng từ: dòng hàng thật + comboRef + comboInstanceId + lineKey
            |                                                |
            +------------> Phân giải combo <-----------------+
                           (không tạo mặt hàng)
                                  |
                   item_id / lot_id / phankho_id / nguồn quà
                                  |
            Cửa nạp + trạm tiền kiểm (IN-COMBO-*): nhắc, giữ khi lỗi toàn vẹn
                                  |
                 Inventory Engine (sổ chi tiết) ----> CostingResult
                 item + lô + dòng nguồn + lớp giá          |
                                  |                         v
                                  +-----------------> Accounting Kernel
                                              (một cửa ghi sổ cái; outbox sau commit)
                                                            |
                                              Thuế / hoá đơn / truy vết
```

| Câu hỏi | Chủ dữ liệu | Bảng |
|---|---|---|
| Hàng gì | Item Master | `items`, `item_codes` (có) |
| Thoả thuận nào, bản nào | Policy Registry + sổ combo | `policy_registry` (có) + `combo_*` (mới) |
| Lần nào | sổ combo | `combo_instances`, `combo_instance_lines` (mới) |
| Ở đâu | danh mục kho | `warehouses`, `warehouse_types` (có) |
| Lô nào | Inventory Engine | `item_lots`, `inventory_lot_moves` (có, 0098) |
| Từ dòng nào, của ai | Inventory Engine | phân bổ nguồn (mới; gộp vào lớp giá của PHASE-032 khi có) |
| Đáng giá bao nhiêu | Inventory Engine | `valuation_layers`, `cost_allocations` (PHASE-032, chưa có) |
| Bút toán nào | Accounting Kernel | `ledger_*` (có) |

## 2. `phankho_id` — dùng đúng thứ đang có

Trong mã, **"phân kho" đã là một kho của chi nhánh** (`apps/api/test/phan-kho.test.ts`: *"mọi hàng ra / vào thuộc một phân kho của chi nhánh"*). Không có khái niệm kho con.

| Tên trong đề bài | Trong CSDL | Ghi chú |
|---|---|---|
| `phankho_id` | `warehouses.uid` — `kho_<ULID>` (0121) | định danh bền, không đổi khi đổi mã kho |
| client `phankho_id` / mã phân kho | `warehouses.code` → `warehouseCode` ở khuôn chứng từ | nguồn ngoài gửi **mã**; Core phân giải ra `uid` tại ngày và lưu `uid` (R-MD) |
| loại phân kho | `warehouses.type_code` → `warehouse_types.code` (0128) | `KHH` hàng bán · `KKM` khuyến mại · `KNB` nhận giữ hộ · `KCC` chờ chứng từ · `KCL` cách ly · `KTL` trả lại… |
| được bán / thuộc sở hữu | `warehouse_types.can_sell`, `.owned` | mặc định **vận hành** của loại; không phải kết luận kế toán |

**Phân kho chính, `phankho_id = 0`** <!-- [2026-11-17 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — phân kho chính mặc định (chủ dự án 2026-11-17) --> (chủ dự án 2026-11-17):

| Ở đâu | Quy ước |
|---|---|
| Biên API / khuôn chứng từ / máy bán | `warehouseCode` bỏ trống, hoặc `phankhoId: 0` ⇒ **phân kho chính** của chi nhánh trên chứng từ |
| CSDL | phân kho chính = dòng `warehouses` có `is_default = true` của chi nhánh (cột đã có từ 0001: *"nhận các dòng nhập xuất không ghi mã kho"*). Core lưu `uid` thật của nó; **không lưu số 0** làm khoá |
| Cài mới / chi nhánh mới | luôn có một phân kho chính, loại `KHH`, cấu hình mặc định — đơn vị không cài gì luồng vẫn chạy (smallwin) |
| Kế toán quản trị | tự **tạo thêm** phân kho (khuyến mại, giữ hộ, chờ chứng từ…) và **cấu hình** từng cái: loại, được bán, sở hữu, theo dõi hạn, nghiệp vụ nào được dùng (`warehouse_type_ops`); đổi phân kho chính là việc có quyền và nhật ký |
| Ràng buộc | mỗi chi nhánh **đúng một** phân kho chính đang dùng; không ngừng dùng phân kho chính khi chưa chọn phân kho chính khác |

Luật dùng:

- **Một khoá vị trí tồn** trên mỗi dòng kho. Không thêm cột "phân kho" thứ hai cạnh `warehouse_code`; không thêm bảng tồn theo phân kho.
- **Không thêm kho cha – con ở phase này.** Nhu cầu gom nhóm khi xem (một kho vật lý, nhiều phân kho) giải bằng chi nhánh + loại phân kho ở tầng báo cáo.
- `type_code = KKM` nói **quyền vận hành** của phân kho. Nó không nói ai sở hữu từng lon, lon đó có được bán không, giá vốn / hoá đơn / thuế thế nào. Sở hữu và ràng buộc mục đích nằm trên **phân bổ nguồn** (§4.3) và chính sách có phiên bản.
- Cùng mặt hàng / cùng lô, cùng một phân kho, vừa có hàng thường vừa có hàng nhà cung cấp chỉ định để tặng → vẫn phân biệt được theo **nguồn**. Phân kho là công cụ thêm, không thay nguồn gốc.
- Chuyển `KKM` → `KHH` đi phiếu chuyển kho sẵn có; cùng pháp nhân thì giữ giá trị (R-INV-8), **không sinh doanh thu / chi phí**. Quyền dùng chỉ đổi khi có hành động *đổi mục đích dùng* (D037-12).
- `warehouse_types.account_prefix` (đang có) là dữ liệu cũ của màn kho; mã combo **không đọc** nó để suy tài khoản (R-INV-2, R-COMBO-5).

## 3. Sổ combo — phiên bản đi trên Policy Registry

| Bảng (đề xuất) | Khoá / cột chính | Ghi chú |
|---|---|---|
| `combo_definitions` | `(tenant_id, combo_id)` ULID; `code` (mã hiển thị, có phiên bản như mã hàng), `name`, `nguon` (`ncc` · `cong_ty`), `issuer_partner_id?`, `status` (`draft` · `active` · `retired`), `policy_id` (trỏ `policy_registry`) | không có cột tài khoản |
| `combo_versions` | `(tenant_id, combo_id, version)`; `content_hash`, `effective_from`, `effective_to`, `scope` (chi nhánh, kênh, đối tác), `has_buy_side`, `has_sell_side`, `sell_relation` (`ap_dung_theo` · `tu_dieu_chinh` · `doc_lap`), `published_by`, `published_at`, `reason`, `legal_ref` | **chiếu** của bản trong `policy_registry` (Rule Contract `core.combo.definition@1`); băm và hiệu lực lấy từ sổ đăng ký, không tính lại — **không có hai bộ phiên bản** |
| `combo_components` | `(tenant_id, combo_id, version, side, line_key)`; `side` (`mua` · `ban`), `item_id`, `qty_base numeric(18,4)`, `unit_snapshot`, `role` (`mua` · `tang` · `tang_tuy_chon` · `bao_bi`), `option_group?` (vd "4 × 800 g **hoặc** 3 × 1,6 kg"), `gift_source_default?` | FK `(tenant_id, item_id)` → `items`; **chỉ số ngược theo `item_id`** để máy bán gợi ý combo |
| `combo_codes` | `(tenant_id, source_system, external_code)`; `combo_id`, `valid_from`, `valid_to` | mã vạch / mã combo của nhà cung cấp, mã nhóm 8 cũ được ánh xạ |

Ràng buộc: bản đã phát hành không `UPDATE` (trigger); thành phần của một mặt có ít nhất một dòng; `qty_base > 0`; hai bản cùng phạm vi không chồng hiệu lực (bản sau đóng bản trước ở ngày − 1, như Policy Registry).

**Mặt mua** tham chiếu chính sách mua (`purchase.promo_gift@1` — khuôn luật phải viết, S037-10); **mặt bán** tham chiếu chính sách bán đã có (`sale.promo.buy_x_get_y@1`, `sale.promo.combo@1`…), bổ sung `itemId` nơi còn thiếu. Combo không viết lại luật khuyến mại; nó **gói** thành phần có định danh + hai tham chiếu chính sách.

## 4. Lần thực hiện và truy nguồn

### 4.1 `combo_instances`

`(tenant_id, instance_id)` ULID · `combo_id`, `combo_version`, `content_hash` · `side` (`mua` · `ban`) · `source_doc_key`, `source_doc_version` · `partner_id?` · `occurred_at` · `status` (`pending` · `confirmed` · `reversed`) · `reverses_instance_id?` · `idempotency_key` (`UNIQUE` theo đơn vị).

Một chứng từ có thể có nhiều lần thực hiện (mua 8 lon theo 3+1 = hai lần, hoặc một lần với `times = 2` — chốt ở S037-11). Gửi lại không sinh lần mới.

### 4.2 `combo_instance_lines`

`(tenant_id, instance_id, line_key)` · `item_id` · `role` · `qty_base` · `source_line_ref` (dòng chứng từ, bền theo `docKey` + `version` + `lineKey`) · `lot_id?` · `warehouse_uid?` (= `phankho_id`) · `gift_source?` · `ownership` (`so_huu` · `giu_ho` · `cho_xac_dinh`) · `restriction` (`ban_duoc` · `chi_de_tang` · `tam_giu`) · `value_treatment_ref?` · `tax_treatment_ref?` · `tax_decision` (`co` · `khong` · `cho`) kèm `tax_basis_ref`.

`lineKey` phải ổn định; **không dùng số thứ tự dòng làm khoá lâu dài**. `inventory_movements` hôm nay khoá theo `event_id + line_no`, nên cần ánh xạ dòng nguồn trước khi trả hàng / tách bộ chính xác (S037-16).

### 4.3 Phân bổ nguồn (origin allocation)

Trả lời *"lon vừa xuất là của dòng nhận nào"* khi cùng mặt hàng có nhiều nguồn:

```text
receipt_origin (đề xuất; gộp vào valuation_layer_sources của PHASE-032 khi có)
  tenant_id, origin_id
  receipt_line_ref          — dòng phiếu nhận
  combo_instance_id?        — null nếu mua thường
  item_id, lot_id?, warehouse_uid
  gift_source?, ownership, restriction
  qty_in numeric(18,4)      — lượng nhận
  (lượng đã dùng = Σ dòng xuất trỏ origin_id — tính, KHÔNG lưu số dư riêng)
```

Đây **không phải sổ kho thứ ba**: không có cột số dư, không ai cộng tồn từ đây. Nó là chỉ mục truy nguồn; tồn vẫn là của Engine.

Thứ tự lấy nguồn khi xuất:

1. Dòng xuất chỉ rõ nguồn (bán theo combo *áp dụng theo*; trả hàng theo dòng gốc) → lấy đúng nguồn đó.
2. Không chỉ rõ → theo quy tắc xuất lô đang hiệu lực (FEFO / FIFO, R-INV-5) trong các nguồn **được phép** cho mục đích của dòng (bán chỉ lấy nguồn `ban_duoc`; tặng theo combo lấy nguồn của combo trước).
3. Không xác định được → `IN-COMBO-004` nhắc, độ phủ `unknown`; **không** tự coi là quà giá 0.

### 4.4 Liên kết truy vết

Quan hệ `received_from`, `split_from`, `fulfilled_by`, `returned_to`, `funded_by`: dùng bảng liên kết chứng từ chung nếu đủ vai trò (PHASE-029); chỉ thêm `combo_lineage_links` khi thiếu. Mọi quan hệ chéo đơn vị bị cấm (RLS + khoá ngoại ghép theo `tenant_id`).

## 5. Ràng buộc CSDL bắt buộc khi viết migration

- Khoá ngoại ghép `(tenant_id, item_id)` → `items`; `(tenant_id, warehouse_uid)` → `warehouses`. `qty` `numeric(18,4)`, tiền `numeric(18,2)`.
- RLS `ENABLE` + `FORCE`; `COMMENT ON` tiếng Việt; SQL migration + kiểu Kysely; **không Prisma** (R-DB-14).
- Bảng combo **không có cột `account*`** (SC-COMBO-2).
- Không `DELETE CASCADE` với combo / bản / lần thực hiện đã có chứng từ; chỉ ngừng dùng (ECP-13).
- Module chỉ ghi bảng của mình; **không** `INSERT` thẳng `inventory_movements`, `ledger_lines`, `accounting_events`.
- Số migration lấy bằng `node scripts/so-tiep-theo.mjs migration` lúc viết (hôm nay số kế tiếp là 0149; không giữ số trong tài liệu).

## 6. Luồng chuẩn

**A. Nhận 3+1 cùng mặt hàng.** Phiếu nhận hai dòng cùng `item_id`, vai trò `mua` (3) và `tang` (1), cùng `combo_instance_id`. Kho +4. Không có "mã 4 lon".

**B. Nhận sữa tặng xe.** 4 lon sữa một `item_id`; xe `item_id` **khác**; cùng một lần thực hiện. Quà là voucher / dịch vụ → `benefitRef` ngoài sổ hàng, không giả làm hàng.

**C. Tách bộ.** Chỉ nhả quan hệ giữ bộ. Tổng tồn theo mặt hàng / lô không đổi; không dòng kho. Có đổi phân kho thì phiếu chuyển kho: ra − / vào + đúng lượng, giữ lô, nguồn, giá trị.

**D. Bán rời từ combo đã nhập.** Phiếu bán chọn mặt hàng / lô / phân kho; nguồn theo §4.3; doanh thu và thuế theo giao dịch bán; Engine phân bổ giá vốn, Kernel ghi.

**E. Tặng khách.** Qua mặt bán của combo (hoặc chính sách tặng độc lập), xác định *kèm mua* hay *không điều kiện*; trừ kho; giữ người nhận, chứng từ, phân bổ giá vốn.

**F. Trả / đảo.** Phiếu trả mang `originalLineRef`; về đúng nguồn, lô, phân bổ gốc (R-INV-4); không trả vượt. Khách trả một phần bộ → nghĩa vụ thu hồi quà xử lý theo chính sách của mặt bán, không hoàn bằng "giá combo".

**G. Công ty tự đặt combo, hết thì bán rời.** Mặt bán `doc_lap` có `hanMuc`. Máy bán hỏi `core.combo.suggest`; còn hạn mức → ra dòng hàng thật có `comboInstanceId`; hết → cùng những mặt hàng đó bán theo giá thường, không có tham chiếu combo, không chứng từ phá bộ.

## 7. Liên tục giá vốn và đối soát

Bất biến theo (đơn vị hạch toán, mặt hàng, kỳ):

```text
Q_cuối = Q_đầu + Q_nhập − Q_xuất + Q_trả ± Q_điều_chỉnh
V_cuối = V_đầu + V_nhập − V_phân_bổ_cho_xuất ± V_điều_chỉnh
Σ Q theo phân kho = Q theo item_id                    (CT-COMBO-003)
Σ Q theo nguồn (đã biết) ≤ Q theo item_id; phần còn lại = unknown
Σ V lớp giá hiện hành = số dư tài khoản hàng tồn kho   (CT-COST-004)
```

`combo_id` là **chiều báo cáo** (lãi gộp theo chương trình, quà theo nhà cung cấp), **không** là chiều tính giá thay mặt hàng. Phương pháp tính giá vẫn là chính sách `core.costing.method@1` (bình quân tháng mặc định); phân kho khuyến mại **không** mặc nhiên là một bể giá riêng.

**Đường cũ:** `exclude_cost`, `gift_qty` và "lấy quà giá 0 trước" tiếp tục chạy cho tới khi đơn vị chuyển. Chuyển = chính sách `gift_treatment` có ngày hiệu lực + chạy song song so từng (mặt hàng, tháng); lệch thì chưa chuyển. Dữ liệu quá khứ ghi độ phủ `known · estimated · unknown`; không bịa dòng nguồn.

## 8. Đường đọc truy vết

`hoá đơn / đơn mua / phiếu nhận → combo_instance → dòng → item_id → lot_id → phankho_id → dòng kho → lớp giá / nguồn → phân bổ giá vốn → bút toán → hoá đơn bán / tờ khai`.

- Màn **Hành trình mặt hàng** (theo `item_id`) thêm thẻ *Nguồn combo*: bản chính sách, nguồn quà, lượng đã nhận / bán / tặng / trả, đang ở phân kho nào, giá trị còn lại, hoá đơn gốc, độ phủ truy vết.
- Màn **Combo** tra theo `combo_id@version`: hai thẻ *Mua* · *Bán*, các lần thực hiện, xuống từng mặt hàng; đổi mã hàng không mất vết.
