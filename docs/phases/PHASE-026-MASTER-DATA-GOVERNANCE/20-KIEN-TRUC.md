# PHASE-026 · 20 — Kiến trúc: định danh ba tầng, mã có phiên bản cho mọi thực thể, nhóm đơn vị, lịch sử & tác động
<!-- [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — kiến trúc MDG trên nền 0065 / 0066; chỉ nêu cái thêm, cái đã có trỏ về PHASE-024 / 025 -->

## 1. Định danh ba tầng cho hàng hoá (D026-2)

```
product (sản phẩm cha)      items { item_id = P, kind = 'parent' }         "Sữa bột X"
   └─ item (đơn vị tồn kho)  items { item_id = V1, parent_item_id = P }     "Sữa bột X 400g"   ← giá vốn, tồn, sổ gắn ở đây
   │     └─ codes            item_codes { V1: sku SUA-400 (→ 09/2026), sku SUA400N (10/2026 →), barcode 893… }
   └─ item                   items { item_id = V2, parent_item_id = P }     "Sữa bột X 900g"
```

- **Đổi mã của cùng biến thể** (SUA-400 → SUA400N): đóng mã cũ, thêm mã mới, `V1` giữ nguyên — đã có (0065, trigger `bizcity_items_sync`).
- **Biến thể kinh tế khác** (quy cách khác, giá vốn tách riêng): `item_id` mới, cùng `parent_item_id` (R-ITEM-3). Thi hành (S026-3, 0067 <!-- [2026-11-04 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-3 -->): đổi đơn vị tính gốc của mặt hàng **đã có nhập xuất** → Gate A `ITEM-HINT-003` (cảnh báo, bắt lý do — R-GATE-9: không chặn, vì có khi chỉ là sửa chính tả tên ĐVT).
- `parent_item_id` điền từ `products.parent_sku` và **giữ khớp theo định danh** (trigger `products_items_sync_parent`): đổi mã cha / con không đứt họ; mặt hàng cha thêm sau con thì nhận các con đang chờ; chặn tự trỏ, vòng, khác đơn vị (`items_parent_guard`). `parent_sku` còn là ảnh chụp cho MH26 tới S024-11.
- Bảng thuật ngữ: *item_id (cha)* của chủ dự án = `parent_item_id`; *sku_id / variant_id* = `item_id`; *mã code* = `item_codes.code`. Không đổi tên cột.

## 1b. Định khoản theo phân loại TẠI NGÀY chứng từ (S024-8, R-ITEM-7) <!-- [2026-11-04 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 -->

**Hiện trạng (đối chiếu code 2026-11-04):** `postingConfigRepository.loadPostingConfig(db, tenant, skus, { asOf })` chọn phiên bản **chính sách** theo `asOf` nhưng đọc nhóm hạch toán và thuế của mặt hàng từ `products` (giá trị HIỆN TẠI). `item_classification` (0065) có lịch sử theo ngày nhưng không nơi nào trong đường định khoản đọc nó.

**Hệ quả hôm nay:** đổi nhóm hạch toán của mặt hàng rồi **định khoản lại** (repost) chứng từ cũ → ra theo nhóm MỚI; sổ đã ghi không đổi (chỉ thêm) nhưng bản định khoản lại không còn đúng với nhóm đang hiệu lực ngày chứng từ.

**Thiết kế:**
- `loadPostingConfig` có `asOf`: với mỗi mã hàng, tra định danh tại `asOf` (`bizcity_item_at(tenant, sku, asOf)`), lấy bản `item_classification` có `valid_from ≤ asOf < valid_to` → `postingGroupCode`, `taxOutCode`. Không có định danh / không có bản phân loại → rơi về `products` như cũ (mặt hàng nháp, mã mồ côi).
- Không có `asOf` (đường xem trước / trạm kiểm) → như cũ.
- Bản đầu của phân loại có `valid_from = 1970-01-01` = "từ đầu tới lần đổi đầu tiên"; chứng từ lùi ngày trước ngày tạo mặt hàng vẫn khớp bản đó.
- Chỉ ĐỌC khác đi; không đổi lược đồ, không sửa dòng sổ. Ca chứng minh: [T026-G2](40-MASTER-CHECKLIST.md) và `apps/api/test/dinh-khoan-phan-loai-theo-ngay.test.ts` (đổi nhóm từ ngày D: chứng từ trước D định khoản theo nhóm cũ, sau D theo nhóm mới, định khoản lại chứng từ trước D vẫn nhóm cũ).
- Rủi ro: K3 (đổi cách định khoản). Giảm bằng: hành vi chỉ khác khi mặt hàng ĐÃ có từ hai bản phân loại; mặt hàng chưa từng đổi nhóm có một bản từ 1970 = đúng như `products` hiện tại.

## 2. Mã có phiên bản cho mọi thực thể hạng A/B (D026-3)

```sql
entity_codes (id, tenant_id, entity_type, entity_id, kind, code, valid_from, valid_to, created_by, note)
  entity_type ∈ partner | branch | warehouse | unit | reason | dimension:<kind>
  guard như item_codes: chỉ thêm; UPDATE duy nhất = đóng valid_to; chặn chồng hiệu lực (EXCLUDE USING gist khi có btree_gist)
```

- Thực thể giữ bảng riêng (bất biến riêng), `id` hiện có làm định danh (bigint bất biến đã có; thêm guard không đổi / không xoá). Cột `code` hiện có trở thành **ảnh chụp mã hiện hành** (giữ cho tương thích), đổi mã = thêm dòng `entity_codes` + cập nhật ảnh chụp (trigger).
- Dòng sổ / chứng từ: `partner_id` đã là định danh; thêm `partner_code` ảnh chụp ở nơi chưa có. Tài khoản: theo ADR-0018 — `chart_versions`, `account_mappings(from_version, from_code, to_version, to_code, kind)`, phiếu chuyển số dư; `ledger_lines.account_code` + `policy_version` đủ xác định phiên bản.
- Resolver chung `resolveEntity(type, ref, asOf)` theo khuôn `resolveItem`.
- **Đã làm (đợt 1, 2026-11-08):** migration `0085_ma_thuc_the.sql` <!-- [2026-11-08 05:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-4: đổi số migration 0083 → 0085 khi gộp main (0083 thuộc S030-48, 0084 thuộc PHASE-031 W2c — so-tiep-theo kiem) --> cho **partner / branch / warehouse**; `resolveEntity` / `resolveEntities` ở `packages/kernel/src/modules/masterdata/entity-resolver.ts`; kiểu ở `packages/contracts/src/entity-codes.ts`. Trigger đồng bộ cột `code` ở mọi đường ghi; xoá thực thể chỉ đóng mã (các form xoá hiện có vẫn chạy); cấm đổi `id` / `tenant_id`. **Chưa làm:** đơn vị tính, lý do, `dimension:<kind>`, `partner_code` ảnh chụp trên dòng sổ <!-- [2026-11-08 04:07 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — đợt 1 entity_codes -->.

## 3. Cây phân cấp nhiều cấp (MD-003)

- Tổ chức: `org_units` đã là cây tuỳ ý (path, level 0–9) — giữ làm **cây duy nhất** cho chi nhánh / cửa hàng / kho / bộ phận; `branches.parent_id` là dẫn xuất.
- Phân loại hàng: thêm `item_classes.path` (text, dấu `\`), kiểm vòng ở trigger, `level` tính; báo cáo kho gom theo **cấp bất kỳ** (tham số `level`) thay cho `itemGroup1/2/3` cố định.
- Cây có hiệu lực: đổi cha là **bản mới** (`item_class_versions` hoặc `valid_from` trên quan hệ cha–con) để báo cáo kỳ cũ không đổi (T026-G3). Đề xuất đơn giản: `item_class_parents(tenant_id, code, parent_code, valid_from, valid_to)` chỉ thêm.

## 4. Nhóm đơn vị và giao dịch liên đơn vị (D026-4)

```sql
tenant_groups (id, code, name, ho_tenant_id)
tenant_group_members (group_id, tenant_id, role ∈ ho | warehouse | store | legal_entity, province_tax_code, valid_from, valid_to)
group_items (group_id, item_id, …)            -- danh mục nhóm: item_id chung; từng tenant "nhận về" = bản chiếu items cùng item_id
intercompany_refs (group_id, ref, from_tenant_id, from_doc_key, to_tenant_id, to_doc_key, kind, status)
```

- RLS theo tenant **không đổi**. Đường ghi sổ không bao giờ truy vấn xuyên tenant.
- Chuyển kho HO → cửa hàng: HO ghi `transfer_out` (hoặc bán nội bộ) trong tenant HO; cửa hàng ghi `transfer_in` / mua nội bộ trong tenant của mình; hai chứng từ nối bằng `intercompany_ref`; giá vốn chuyển theo **giá của bên gửi** (cùng luật nhóm gửi hôm nay).
- Báo cáo nhóm (chỉ đọc, quyền `group:read`): hợp nhất + loại trừ nội bộ theo `intercompany_refs`; chênh lệch = mã `CT-IC-*` (Gate C).
- MST theo tỉnh: `province_tax_code` ở thành viên nhóm, chứng từ lấy theo chi nhánh / tenant phát hành (ORG-002).

## 5. Lịch sử và tác động (D026-5)

| Khả năng | Nguồn | API | Màn |
|---|---|---|---|
| Lịch sử | `item_codes` / `entity_codes` / `item_classification` (+ `audit_logs` cho tên, thuộc tính) | `GET /api/v1/master-data/:type/:id/history` → `[{at, by, field, from, to, validFrom}]` | thẻ **Lịch sử** |
| Tác động | chỉ mục tham chiếu `md_references(tenant_id, entity_type, entity_id, ref_table, count, first_at, last_at)` cập nhật theo lô (đêm + sau ghi sổ) | `GET /api/v1/master-data/:type/:id/impact` → chứng từ (đếm theo loại, kỳ), kho / chi nhánh, tài khoản, báo cáo, chính sách dùng mã | thẻ **Tác động**; **xem trước** khi đổi mã / đổi nhóm / ngừng dùng |
| Kiểm chuẩn | Gate A (`/validate`, lớp thay đổi 0–3), Gate C (`CT-*`) | hiện có + `changeClass` trong phản hồi | thẻ **Kiểm chuẩn** (khung Vì sao) |
| Truy vết | `bizcity_lineage@1` (mặt hàng); mở rộng đối tượng (`/lineage/partners/:id`), tài khoản (`/lineage/accounts/:code`) | | thẻ **Truy vết** |

`MasterDataFrame` (web): một khung bốn thẻ dùng cho mặt hàng, đối tượng, tài khoản, chi nhánh, kho — nhận `{ type, id }`.

## 6. Bốn lớp thay đổi ở Gate A (CF-001, ADR-0018)

| Lớp | Ví dụ | Core làm gì |
|---|---|---|
| 0 thuộc tính | tên, mô tả, mã vạch | lưu; Lịch sử |
| 1 mã | đổi sku / mã đối tượng | thêm mã phiên bản; xem trước Tác động; nhắc |
| 2 gộp / tách | gộp hai mặt hàng | `core.item.merge-preview` → `merge` (ánh xạ định danh, lớp giá vốn hợp nhất); chứng từ điều chỉnh |
| 3 bản chất / tài khoản | đổi nhóm hạch toán, đổi loại TK | bản phân loại mới từ ngày; Tác động bắt buộc xem; cảnh báo có lý do (R-GATE-9); không sửa sổ cũ |

## 7. Bảng trụ cột × mức đạt (D026-6)

```
docs/standard/tru-cot.json  ──▶  GET /api/v1/system/pillars  ──▶  HT10 (PillarMatrix) + thẻ "Trụ cột" trang chủ phân hệ (lọc modules[])
        ▲
        └── đợt sau: selfcheck ghi status theo bằng chứng (evidenceIds → test / check / migration tồn tại); SC-PILLAR-1 kiểm "đạt" phải có bằng chứng

- **Đã làm (2026-11-08):** SC-PILLAR-1 (`tests/conformance/checks/pillar/pillar.check.mjs`) kiểm "đạt" phải dẫn tới thứ có thật và không dẫn tới thứ đã mất; đếm `source = check` / `manual` ở ghi chú của bộ kiểm. **Chưa làm:** đưa `source` lên `GET /api/v1/system/pillars` và HT10 (cần PR riêng vì `system.routes.ts` không thuộc đợt này); tự chuyển `status` theo kết quả check (D026-6 đợt sau) <!-- [2026-11-08 04:43 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-15 -->.
```

## 8. Quy mô (SCALE-1)

- Benchmark `scripts/benchmark-danh-muc.mjs`: 1.000.000 mặt hàng × 300 chi nhánh — thời gian nạp lô, đổi mã, resolve 2.000 dòng / chứng từ, NXT theo cấp nhóm.
- Đồng bộ Item Master theo **câu lệnh** (`FOR EACH STATEMENT` + transition table) cho đường nạp Excel / POS; theo dòng cho form.
- `EXCLUDE USING gist` (btree_gist) thay khoá advisory theo đơn vị.
- Chỉ mục đã có: `(tenant_id, item_id, posting_date)` sổ; `(tenant_id, item_id, doc_date)` kho; cân nhắc partition theo tenant khi > 100 triệu dòng sổ.
