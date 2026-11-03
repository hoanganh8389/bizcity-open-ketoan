# PHASE-024 · 70 — Lộ trình ổn định Core: thứ tự, cổng chốt, bất biến ở CSDL
<!-- [2026-11-03 11:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — lộ trình B1–B6: chốt PR #38 → items + mã có phiên bản → bất biến ở CSDL → đóng tự thêm mặt hàng → giá vốn sau ghi sổ → quan sát được -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Bám: [ADR-0017](../../adr/ADR-0017-dinh-danh-hang-hoa-bat-bien.md) (định danh bất biến) · [ADR-0018](../../adr/ADR-0018-danh-muc-co-phien-ban-toan-framework.md) (danh mục có phiên bản) · [ADR-0019](../../adr/ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md) (hai cổng) · [R-ITEM](../../rules/RULE-ITEM.md) · [00-MASTER-PLAN](00-MASTER-PLAN.md) (D024-1..8) · [20-KIEN-TRUC](20-KIEN-TRUC.md) · [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md).
> Tài liệu này **không** thêm việc mới. Nó xếp thứ tự các việc S024-* đã có, đặt **cổng chốt** giữa các bước và chỉ rõ bất biến nào phải nằm ở CSDL.

## 0. Vì sao cần lộ trình này

Core hiện vững ở **cửa vào**: hai cổng (danh mục nháp, bể chờ), thư viện mã `bizcity_findings@1`, Commit Guard, ghi qua `defineAction`, các check SC-LAYER-2 / SC-MOD-2 / SC-FIX-1 / SC-FIND-1. Mỗi thứ có test hoặc check chặn.

Core còn yếu ở **nền dữ liệu**. Bất biến ADR-0017 — *Item Identity is Immutable. Item Code is Versioned. Posted Ledger is Immutable.* — chưa có chỗ nào ép được trong dữ liệu, vì chưa có bảng `items`. Mặt hàng vẫn xác định bằng `sku` trên `products`; cờ nháp (`products.is_draft`, migration 0061) là bước tạm. Các luật đang nằm ở tầng ứng dụng; bất biến thật phải nằm ở CSDL như sổ cái đã làm (trigger Nợ = Có, `forbid_audit_log_mutation`, `forbid_document_version_mutation`).

**Luật của lộ trình:** không bắt đầu bước sau khi bước trước chưa qua cổng chốt. Không chồng việc mới lên nhánh chưa có kết quả test đầy đủ.

## 1. Toàn cảnh

| Bước | Việc (mã checklist) | Vào khi | Cổng chốt (bằng chứng phải có) | Đường lui |
|---|---|---|---|---|
| **B1** | Chốt PR #38 (S023-14/15, S024-27/28/29) | — | test đầy đủ trên CSDL sạch đạt; selfcheck, `kiem-chuan.sh`, typecheck ĐẠT; merge vào `main` | revert merge |
| **B2a** | Hợp đồng + bảng song song + Item Resolver (S024-4, 5, 6) | B1 merge | `items`, `item_codes`, `item_classification` có dữ liệu điền từ `products`; ca T024-1; `products` **chưa đổi** | bỏ bảng mới (chưa ai đọc) |
| **B2b** | `item_id` vào bảng sổ, `products` → khung nhìn (S024-9, 10) | B2a + chạy thử trên bản sao dữ liệu thật | `kiem-nang-cap.sh`: tồn cuối theo mã trước / sau trùng từng kho; `DG-ITEM-3 = 0`; ca T024-5, T024-6 | khôi phục bản sao lưu trước nâng cấp (R-BAK-3) |
| **B2c** | Nháp thành trạng thái của `items`; action `core.item.*` (S024-11, S024-28 phần còn lại) | B2b | `products.is_draft` chỉ còn là cột của khung nhìn; test `item-draft` chạy trên `items` | — |
| **B3** | Bất biến ở CSDL + check bảo vệ (S024-9 trigger, S024-16 + SC-ITEM-4/5 mới) | đi cùng B2b, xong trước B4 | §4: mỗi ràng buộc có trigger / EXCLUDE, ca test vi phạm, check tĩnh, ca tự kiểm `repo-bad` | — (chỉ chặn thêm) |
| **B4** | Đóng tự thêm mặt hàng từ chứng từ (D024-3, S024-7) | B3 + báo trước POS ≥ 14 ngày | §5: `ensureProducts` không còn đường tạo mặt hàng đang dùng; ca T024-2, T024-3 | bật lại `bizcity.item.auto_create` theo đơn vị |
| **B5** | Giá vốn theo `item_id`, sau ghi sổ (S024-12) | B2b | §6: không đường ghi sổ nào chờ giá vốn; `costing_items_unpriced` đo được | — |
| **B6** | Quan sát được (S024-30, S024-15) | B2c (nháp ở `items`) | §7: số đo + cảnh báo có `alerts.test.yml`; Bàn đánh giá hiện tuổi nháp / bể | tắt cảnh báo |

B5 và B6 có thể chạy song song với B4 khi đã qua cổng của bước chúng phụ thuộc.

## 2. B1 — Chốt PR #38

| Hạng mục | Trạng thái 2026-11-03 |
|---|---|
| Gộp `main` mới (chứa PR #40: route ghi qua `defineAction`) | ✅ commit `68931df` |
| Test đầy đủ, CSDL sạch | ✅ 1090 ca đạt, 0 lỗi, 13 bỏ qua (bỏ qua có chủ đích: ca chuẩn Hợp đồng khi máy không có module mẫu) |
| selfcheck / `kiem-chuan.sh` / typecheck | ✅ ĐẠT; SC-LAYER-2 = 0, SC-MOD-2 = 0 |
| Merge vào `main` | ☐ chờ chủ duyệt |

Hành vi đã đổi khi gộp, cần biết: thêm / sửa **tài khoản** ghi qua action `core.account.*`, phản hồi **không** còn `meta.findings` (runtime action chưa có meta tuỳ biến). Xem trước bằng `POST /api/v1/accounts/validate`; nhật ký cảnh báo mềm vẫn ghi. Đối tượng, mặt hàng vẫn trả `meta.findings`. Quyết định có mở rộng runtime hay không: Q-70-1 (§8).

## 3. B2 — Bảng `items` và mã có phiên bản

Mô hình dữ liệu đã chốt ở [20-KIEN-TRUC §1](20-KIEN-TRUC.md); phần này chỉ định thứ tự triển khai và điều kiện an toàn.

### 3.1 B2a — chạy song song, chưa ai đọc (migration 0064 trở đi) <!-- [2026-11-03 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2a: ✅ xong 2026-11-03 — migration 0065, trigger đồng bộ, bất biến ở CSDL, Item Resolver; chi tiết [BIZCITY-ITEM-MASTER-v1](../../contracts/BIZCITY-ITEM-MASTER-v1.md) -->

1. Hợp đồng `bizcity_item_master@1` + `packages/contracts/src/item-master.ts`; `bizcity_ledger_intake@1` thêm `itemId`, `barcode` trên dòng hàng (tuỳ chọn, tương thích ngược).
2. Bảng:
   - `items` — `item_id` ULID (D024-1), **không có cột mã**; `status` (`draft` / `active` / `retired`), `draft_codes`, thuộc tính, `parent_item_id` (D024-7).
   - `item_codes` — **chỉ thêm**; `(tenant_id, kind, code, valid_from, valid_to, item_id)`; `kind` ∈ `sku` / `barcode` / `alias` / mã ngoài theo nguồn.
   - `item_classification` — theo ngày hiệu lực (R-ITEM-7).
   - RLS như mọi bảng đơn vị.
3. Điền từ `products`: mỗi dòng → một `items` (ULID mới) + một `item_codes(kind = sku, valid_from = '1970-01-01')` + phân loại hiện hành; `is_draft` → `status = 'draft'`.
4. Item Resolver (`kernel/masterdata/item-resolver.ts`): mã + ngày → `item_id`; đệm theo phiên bản danh mục (dùng chung phần dấu cấu hình của Commit Guard); span `intake.item.resolve`.

Cổng: ca T024-1 (mã → item tại ngày, mã hết hiệu lực, mã trỏ hai item); `products` và mọi API chưa đổi.

### 3.2 B2b — `item_id` vào bảng sổ (migration K3) <!-- [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b: 🟡 phần 1 xong 2026-11-04 (migration 0066: mục 1, 2); mục 3 (khung nhìn) CHẶN — xem 3.2.1 -->

1. Thêm `item_id` vào `ledger_lines`, `inventory_movements`, `inventory_costs`, `product_units`, `product_prices` (danh sách đầy đủ ở S024-9). Hiện có 13 migration chứa cột `sku`; các bảng ngoài sổ (đơn đặt, đề xuất nhập, hoá đơn NCC…) giữ `sku` làm thông tin hiển thị, chỉ bảng **kế toán / kho** buộc `item_id`.
2. Điền ngược theo `item_codes(kind = sku)`. Dòng không tra được → **dừng migration**, in danh sách; không tự tạo item trong migration.
3. `products` thành **khung nhìn** (D024-2): `items ⋈ item_codes[sku, hiệu lực hôm nay] ⋈ item_classification[hiện hành]`. API `/api/v1/products` giữ khuôn trả về, thêm `itemId`.
4. **Chạy thử bắt buộc** trên bản sao dữ liệu thật của ít nhất một đơn vị đang dùng, so tồn cuối theo mã từng kho trước / sau (`kiem-nang-cap.sh`), trước khi chạy ở bản cài thật.

#### 3.2.1 Phản tư sau B2b phần 1 — làm được gì, khoảng cách còn lại
<!-- [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b: phản tư theo yêu cầu chủ "làm và reflect lại để xem GAP" -->

**Đã làm (0066 + sửa 0065 trước phát hành):** `item_id` trên `ledger_lines`, `inventory_movements`, `inventory_costs`, `product_units`, `product_prices`; điền ngược theo **mã có hiệu lực tại ngày của dòng**; dòng mới tự gắn (trigger); mặt hàng tạo SAU chứng từ thì điền ngược các dòng của mã đó (`bizcity_item_fill_refs`); khoá ngoại ghép `(tenant_id, item_id)`; sổ cái vẫn chỉ thêm (ngoại lệ duy nhất: điền `item_id` từ rỗng, một lần). **Hành trình mặt hàng khoá theo `item_id`**: mã cũ + mã mới sau đổi mã là MỘT hành trình, kèm lịch sử mã, mã tại ngày trên từng sự kiện, tìm bằng mã cũ ra mặt hàng hiện hành. Đã thử: CSDL trống, CSDL có sẵn dữ liệu (276 dòng sổ / 22 dòng kho / 5 dòng giá vốn → 0 dòng thiếu `item_id`), nạp 20.000 mặt hàng.

**Khoảng cách (GAP), xếp theo mức ảnh hưởng:**

| # | Khoảng cách | Bằng chứng / hệ quả | Hướng xử lý |
|---|---|---|---|
| G1 | **`products` chưa thành khung nhìn** (mục 3) | Khung nhìn ghép + `INSTEAD OF` **không nhận `INSERT … ON CONFLICT`** (thử trực tiếp trên PostgreSQL); `products` có 7 chỗ thêm, 6 dùng `onConflict`, thêm 4 tệp ghi khác | Tách B2b-2: chuyển mọi đường ghi sang `items` (S024-11 `core.item.upsert`), **đảo chiều** đồng bộ (items là nguồn, `products` là bảng chiếu), sau đó mới thay bằng khung nhìn |
| G2 | ~~Giá vốn vẫn tính theo mã~~ **✅ xong 2026-11-04** <!-- [2026-11-04 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — G2 --> | `costing.service`, `inventory-report.service` gom theo `item_id` (khoá = `COALESCE(item_id, sku)`); `inventory_costs.sku` = mã hiện hành, `item_id` = định danh; giá Excel theo mã → định danh; NXT một dòng, sổ chi tiết tra bằng mã cũ; ca "đổi mã giữa tháng" (T026-G1) | Còn: lớp giá vốn / phân bổ (PHASE-025 W2) |
| G3 | **Mặt hàng mồ côi thay cho "dừng migration"** (khác mục 2) | Mã có trong sổ / kho mà không có trong danh mục là dữ liệu hợp lệ hôm nay (xoá mặt hàng chưa nhập xuất, đơn vị quy đổi khai trước); dừng thì bản cài không nâng cấp được. 0066 tạo mặt hàng `retired` + `attributes.orphan`, khai lại mã thì **nhận lại** đúng định danh; vẫn dừng nếu sau đó còn dòng thiếu `item_id` | Chủ duyệt lệch kế hoạch (Q-70-6); thêm cảnh báo danh mục "mặt hàng mồ côi" ở Gate C (`CT-*`) |
| G4 | **Bảng kho / giá vốn là bảng dẫn xuất** | `inventory_movements`, `inventory_costs` bị xoá – ghi lại theo chứng từ / lần tính giá → không áp "chỉ thêm" được; `item_id` gắn lại mỗi lần ghi | Chỉ `ledger_lines` là bất biến; ghi rõ ở R-ITEM; check SC-ITEM-4 bảo vệ trigger gắn `item_id` |
| G5 | **Khoá chống chồng hiệu lực theo đơn vị** | Khoá theo từng mã làm **cạn bảng khoá** khi nạp 20.000 mặt hàng (`out of shared memory`) → đổi sang khoá theo (đơn vị, loại mã): ghi mã cùng đơn vị nối đuôi tới hết giao dịch; một lần nạp lớn chặn sửa mặt hàng khác của đơn vị đó trong lúc nạp | Dùng `EXCLUDE USING gist` (cần `btree_gist`) — không khoá, không tranh chấp |
| G6 | **Cổng của B2b chưa đạt** | Chưa có `kiem-nang-cap.sh` (S024-10), chưa chạy trên bản sao dữ liệu thật. Đã đo ở CSDL trên 20.985 mặt hàng: thêm mới cả lô 17,5 s có trigger đồng bộ / 2,1 s không (≈ 0,7 ms một mặt hàng); đổi tên cả lô 3,1 s / 0,2 s; đổi mã cả lô 10,5 s. Điền ngược 0066 là UPDATE theo tập (không theo dòng) — chưa đo trên sổ lớn | Làm S024-10; chạy trên bản sao trước khi phát hành; nếu cần, gom đồng bộ theo câu lệnh (FOR EACH STATEMENT) cho đường nạp Excel. <!-- [2026-11-04 05:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — G6 (chủ chọn B: không viết lại 0065) --> **Chốt: không viết lại 0065 và không có script nạp trước** — 0065 tạo bảng và điền trong cùng một migration nên script chạy trước không có bảng để điền; viết lại migration đã phát hành chỉ có lợi cho bản chưa chạy. Chi phí đã đo ≈ 0,8 ms / mặt hàng (20.985 ≈ 17 s · 1.000.000 ≈ 13 phút), ghi ở CHANGELOG "Nâng cấp cần làm". Cơ sở dữ liệu thử có 1,66 triệu mặt hàng ở 5.461 đơn vị là rác của các lượt chạy thử, không phải bản cài thật |
| G7 | **Bất biến chưa có check tĩnh** | SC-ITEM-4 / 5 chưa viết; ai gỡ trigger / khoá ngoại thì test bắt, check tĩnh chưa bắt | B3 |
| G8 | **Bề mặt API chưa có `itemId`** | `/api/v1/products`, sổ chi tiết, NXT chưa trả `itemId`; Resolver chưa đệm / span; `IN-ITEM-002` / `008` chưa vào thư viện mã | S024-11, S024-6, S024-7 |
| G9 | **Kiểm cân Nợ / Có khi sửa dòng sổ** | Điền `item_id` lúc chạy (mặt hàng tạo sau chứng từ) xếp một kiểm cân hoãn cho mỗi dòng của mã đó — nhỏ; migration tắt riêng kiểm này khi điền ngược | Có thể thêm `WHEN` (chỉ khi Nợ / Có đổi) cho trigger kiểm cân — cần duyệt vì là trigger toàn vẹn sổ |

Kết luận: phần **giá trị nhất** của B2b — mọi dòng sổ / kho mang định danh bất biến và truy vết qua đổi mã — đã có và được test. Việc "`products` thành khung nhìn" không làm được như kế hoạch viết; thứ tự đúng là S024-11 trước. Việc đáng làm kế tiếp: **G2** (giá vốn theo `item_id`) vì đó là chỗ số tiền sai khi đổi mã giữa kỳ.

### 3.3 Thời gian song song của API cũ

| Giai đoạn | `PUT /api/v1/products`, `core.product.upsert` | `core.item.*` |
|---|---|---|
| Từ B2b | chạy như cũ, chuyển tiếp sang `core.item.upsert`; phản hồi thêm `itemId` | có |
| B2b + 1 bản phát hành | thêm header `Deprecation` + cảnh báo trong `meta` | khuyến nghị |
| Khi số đo gọi API cũ = 0 trong 30 ngày, hoặc sau 2 bản phát hành | chủ quyết định gỡ (Q-70-3) | duy nhất |

### 3.4 B2c — nháp thành trạng thái của `items`

`applyItemGate` đọc / ghi `items.status`; `IN-ITEM-009` và kiểm lại bể chờ (`recheckInboxForSkus`) chuyển sang khoá `item_id`. Cột `products.is_draft` chỉ còn trong khung nhìn để tương thích.

## 4. B3 — Bất biến ở CSDL, không chỉ ở code

Mỗi bất biến có **bốn** lớp: cơ chế CSDL chặn; ca test cố tình vi phạm phải bị từ chối; check tĩnh bảo vệ để không ai gỡ nhầm; ca tự kiểm `fixtures/repo-bad` chứng minh check bắt được.

| Bất biến | Cơ chế CSDL | Ca test | Check bảo vệ |
|---|---|---|---|
| `items.item_id` không đổi, không xoá | trigger `forbid_item_identity_mutation`: chặn UPDATE `item_id`, chặn DELETE (ngừng dùng = `status = 'retired'`) | UPDATE / DELETE → lỗi CSDL | **SC-ITEM-4** (mới): mọi bảng có cột `item_id` phải gắn trigger chặn sửa `item_id` |
| `item_codes` chỉ thêm | trigger: chỉ INSERT; UPDATE duy nhất được phép là `valid_to` từ NULL thành một ngày; chặn DELETE | đổi `code` / `item_id` / `valid_from` → lỗi | **SC-ITEM-5** (mới): migration không có UPDATE / DELETE `item_codes` ngoài mẫu đóng `valid_to` |
| Tại một ngày, một mã trỏ đúng một item | `EXCLUDE USING gist (tenant_id WITH =, kind WITH =, code WITH =, daterange(valid_from, valid_to) WITH &&)` (cần `btree_gist`; chưa bật được thì trigger kiểm chồng khoảng) | thêm mã chồng hiệu lực → lỗi | DG-ITEM-1 (chạy đêm) bắt dữ liệu cũ |
| Dòng sổ đã ghi không đổi `item_id` | trigger trên `ledger_lines`, `inventory_movements`: chặn UPDATE `item_id`, `sku` khi dòng đã ghi | sửa dòng đã ghi → lỗi | SC-ITEM-4 |
| Không đổi bản chất mặt hàng khi đã có phát sinh | trigger trên `items`: đổi `kind` (hàng hoá ↔ dịch vụ…) hoặc ĐVT gốc khi đã có dòng `inventory_movements` / `ledger_lines` → lỗi, hướng sang "phân loại lại" (hạng 3, S024-20) | đổi bản chất sau phát sinh → lỗi | SC-ITEM-4 (danh sách cột bị khoá) |
| Mã không là khoá liên kết sổ | bảng sổ khoá ngoại về `items(item_id)`, không về mã | — | SC-ITEM-2 (đã có trong kế hoạch) |

Lỗi từ trigger mang mã theo `bizcity_errors@1` có `why` + `rule` (S024-24), để người gặp lỗi hiểu ngay vì sao bị chặn.

## 5. B4 — Đóng tự thêm mặt hàng từ chứng từ (D024-3)

**Hiện tại:** `ensureProducts` (`packages/kernel/src/modules/documents/document.service.ts`, gọi khi định khoản) tự tạo mặt hàng **đang dùng** cho mã lạ trên chứng từ. Đây là đường duy nhất còn đi vòng Gate A.

**Sau B4:** mã lạ → tạo item ở trạng thái **nháp** (điền sẵn tên, ĐVT từ dòng chứng từ, gợi ý phân loại theo quy tắc mã của đơn vị — chỉ gợi ý, D024-6); chứng từ vào **bể chờ** với `IN-ITEM-001` (mã lạ) và `IN-ITEM-009` (mặt hàng nháp). Kế toán kích hoạt nháp → bể tự kiểm lại (đã có từ S024-29).

| Giai đoạn | Hành vi | Ai biết |
|---|---|---|
| T−14 ngày | Thông báo các bên tích hợp POS: đổi hành vi, ngày áp dụng, cách đồng bộ danh mục trước (`PUT /api/v1/products` / `core.item.upsert`), mã lỗi sẽ gặp | bên tích hợp, kế toán đơn vị |
| T−14 → T | Chế độ **cảnh báo**: vẫn tự tạo như cũ, nhưng tiền kiểm trả `IN-ITEM-001` mức `warn` và đếm `bizcity_item_auto_created_total` | bên tích hợp thấy cảnh báo trong phản hồi |
| T | ~~Khoá `bizcity.item.auto_create = false` cho đơn vị mới~~ — thay bởi R-GATE-9: mọi đơn vị mặc định bật, kế toán trưởng của từng đơn vị tự tắt ở HT09 khi sẵn sàng | — |
| Đường lui | Bật lại khoá theo từng đơn vị; không cần triển khai lại | vận hành |

Cổng: ca T024-2 (mã lạ → nháp + bể), T024-3 (khoá bật → hành vi cũ); số đo tự tạo = 0 ở đơn vị đã tắt.

## 6. B5 — Giá vốn sau ghi sổ

Nguyên tắc đã chốt (R-POST-7): giá vốn chưa biết lúc nhận → dòng `cost_fill` số 0, điền bằng chứng từ `cogs` khi tính giá vốn cuối kỳ. Không ước tính, **không chặn** đường ghi sổ.

Việc của B5: tính giá vốn theo `item_id` (không theo mã), để đổi mã / gộp mã giữa kỳ không làm vỡ giá bình quân; số đo `bizcity_costing_*`, `costing_items_unpriced`. Cổng: không có đường ghi sổ nào gọi tính giá vốn đồng bộ; tồn theo `item_id` khớp sổ (`STOCK_LEDGER_MATCH`, S024-13).

## 7. B6 — Quan sát được

| Số đo | Cảnh báo | Hiện ở |
|---|---|---|
| `bizcity_catalog_drafts{entity}` | — | Bàn đánh giá |
| `bizcity_catalog_draft_oldest_seconds{entity}` | > 30 ngày: nhắc người tạo; > 90 ngày: kế toán trưởng xoá / kích hoạt ([60 §2](60-HAI-CONG-KIEM-CHUAN.md)) | Bàn đánh giá, thông báo |
| `bizcity_intake_inbox_open{code}` | — | Trạm kiểm tra |
| `bizcity_intake_inbox_oldest_seconds` | > 7 ngày còn mục `open`: nhắc kế toán | Trạm kiểm tra, thông báo |
| `bizcity_item_auto_created_total` (B4) | > 0 sau ngày T ở đơn vị đã tắt | vận hành |

Mỗi cảnh báo có ca trong `alerts.test.yml`. Cổng: dashboard hiện tuổi nháp / bể; cảnh báo bắn được trong môi trường thử.

## 8. Câu hỏi chờ chủ quyết

<!-- [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09 / D024-3: chủ đồng ý hướng đề xuất theo góc nhìn người dùng (2026-11-03) -->
**Đã quyết 2026-11-03** (chủ đồng ý hướng đề xuất, nhìn từ người dùng):

| # | Quyết định | Đã thi hành |
|---|---|---|
| Q-70-1 | Không trả lại `findings` khi lưu tài khoản; người dùng thấy cảnh báo **trước** khi Ghi (khung Vì sao), sau khi lưu chỉ hiện dòng nhắc ngắn "Đã lưu — còn n cảnh báo mềm (lý do đã ghi vào nhật ký)" | ✅ dòng nhắc sau khi lưu cho tài khoản, đối tượng, mặt hàng (`flashSaved` / `savedNote`) |
| Q-70-2 | Mặt hàng trước; thẻ / thao tác (lịch sử mã, Đổi mã, Gộp mã, nhãn Nháp) thiết kế thành khuôn chung để đối tượng dùng lại | ☐ cùng B2 |
| Q-70-3 | Giữ API `products` cũ tới khi không còn ai gọi: tối thiểu 2 bản phát hành, gỡ khi 30 ngày không còn lượt gọi; phản hồi cũ kèm `itemId` ngay từ đầu; màn hệ thống cho kế toán thấy "POS còn dùng API cũ" | ☐ cùng B2b |
| Q-70-4 | Không có một ngày T chung: **đơn vị tự tắt** khi sẵn sàng; **mặc định bật cho mọi đơn vị, kể cả đơn vị mới**, sai thì nhắc (thông báo + dải nhắc) — luật chung R-GATE-9 <!-- [2026-11-03 01:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — R-GATE-9 mặc định cho phép, nhắc khi sai (chủ dự án: "rule chung") -->. Trước khi tắt: báo cáo "tự thêm N mặt hàng" (giai đoạn cảnh báo) + **Kích hoạt hàng loạt**; kế toán trưởng tự bấm tắt, có lý do, thấy hậu quả | ✅ `bizcity.item.auto_create`, `IN-ITEM-001`, HT09, `GET /products/auto-created`, `core.product.activate-drafts` |
| Q-70-5 | Duyệt luật nhắc là **thao tác trong ứng dụng** (HT09): xem luật đúng như trong form, Đồng ý / Sửa câu chữ / Hạ xuống nhắc; duyệt từng nhóm; luật chưa duyệt vẫn chạy, nhãn "nháp" | ✅ `catalog_rule_reviews` (0063), `core.catalog-rule.review`, HT09 |

Ghi chú Q-70-5 (cập nhật theo [ADR-0020](../../adr/ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md) <!-- [2026-11-03 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020 -->): không còn khái niệm "chưa duyệt / chờ kế toán trưởng" — luật chạy ngay, có căn cứ; HT09 là công cụ chỉnh theo phân quyền. Trước đó: luật chưa duyệt **giữ nguyên mức** (cảnh báo mềm vẫn bắt ghi lý do — D023-6 chủ đã duyệt trước đó); chỉ hạ mức khi kế toán trưởng chọn "Hạ xuống nhắc" (D023-8). Q-70-4 thi hành **trước** B2 / B3 trên bảng `products` vì nháp + bể chờ đã có: đơn vị cũ không đổi hành vi (mặc định bật), mọi đơn vị mặc định bật (R-GATE-9) — khi có `items`, tạo nháp chuyển sang `items.status`.

Bảng câu hỏi gốc:

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q-70-1 | Tài khoản có trả lại `findings` khi lưu không? | **Không** mở rộng `ctx` công khai của SDK chỉ cho việc này; web đã dùng `/validate`. Nếu cần, thêm đường riêng trong Kernel. |
| Q-70-2 | Phạm vi trước khi làm B2: chỉ mặt hàng, hay chung cho đối tượng / tài khoản? | **Mặt hàng trước**; đối tượng theo S024-19 sau B2c; tài khoản theo hướng riêng của ADR-0018 (không có định danh thay thế). |
| Q-70-3 | Thời gian giữ API `products` cũ | Tối thiểu 2 bản phát hành sau B2b, gỡ khi số gọi = 0 trong 30 ngày. |
| Q-70-4 | Ngày T đóng tự thêm mặt hàng (B4) | Chốt sau khi B3 xong; báo trước ≥ 14 ngày. |
| Q-70-5 | Kế toán trưởng duyệt nội dung luật nhắc (đang nhãn "nháp") | Cần trước khi bật cứng bất kỳ luật nào thành chặn. |
| Q-70-6 <!-- [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b --> | Điền ngược B2b gặp mã có trong sổ / kho mà không có trong danh mục: dừng migration (kế hoạch 3.2 mục 2) hay tạo mặt hàng mồ côi? | **Mặt hàng mồ côi** (đã làm ở 0066, 3.2.1 G3): dữ liệu đó hợp lệ hôm nay, dừng thì bản cài không nâng cấp được; vẫn dừng nếu còn dòng thiếu `item_id`. Chờ chủ duyệt. |

## 9. Rủi ro lớn nhất

**Migration `sku` → `item_id` (B2b)** chạm mọi bảng kế toán / kho có mã và mọi tích hợp POS. Giảm rủi ro bằng:
- chạy song song (B2a) trước, không ai đọc bảng mới;
- dừng migration khi có dòng không tra được, không đoán;
- chạy thử trên bản sao dữ liệu thật, so tồn theo kho trước / sau;
- sao lưu ngay trước nâng cấp và đã thử khôi phục (`kiem-khoi-phuc.sh`).
