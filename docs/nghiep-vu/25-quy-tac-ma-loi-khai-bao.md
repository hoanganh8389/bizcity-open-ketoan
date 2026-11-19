<!-- [2026-11-19 Nguyễn Văn Thủy] thiết kế: mọi khai báo / chứng từ có bộ quy tắc + mã lỗi + nháp + nhật ký + cài đặt nhanh; làm thử ở Danh mục mặt hàng (đóng góp) -->
# 25. Quy tắc, mã lỗi, nháp và cài đặt nhanh cho mọi khai báo

> Trạng thái: **đã duyệt (19/11/2026)**. Tầng chung (nhật ký HT19 cho mọi lần ghi bị từ chối, mã tra cứu + Chép ở mọi hộp thoại) chạy cho **mọi** danh mục / chứng từ. Mã quy tắc riêng: xem bảng tiến độ §6.3.
>
> Đã làm (19/11): bộ quy tắc mục 4 (mã đơn vị tính dùng `ITEM-BLOCK-014…018` thay `UNIT-*`), kiểm hết một lượt + `error.fields`, `KetQuaKiem` / `TinhTrang` (`apps/web/src/components/KetQuaKiem.tsx`), nhật ký JSONL `kiem-khai-bao` (`packages/platform/src/core/nhat-ky-kiem.ts`, `GET /api/v1/validation-log`, màn **HT19**), nút ⚙ Cài đặt nhanh → HT09, tự lưu nháp form thêm mặt hàng. Chưa làm: `ITEM-BLOCK-010` (chọn nhóm cấp 3 — đang báo ở ô sinh mã), `ITEM-BLOCK-012` (item_id, đưa vào tự chẩn đoán), tự chẩn đoán định kỳ.

## 1. Vấn đề đang gặp khi test

- Bấm Ghi bị lỗi nhưng màn chỉ hiện một câu chung, có khi chỉ "Dữ liệu không hợp lệ". Không có mã lỗi, không chỉ ô nào sai.
- Máy chủ dừng ở **lỗi đầu tiên** gặp phải, nên sửa xong lỗi này lại gặp lỗi khác.
- Thoát form là mất hết dữ liệu đã nhập.
- Tester không có gì để dán vào báo lỗi, dev không lần ra được lỗi.

## 2. Đang có sẵn — làm tiếp, không làm mới

| Thành phần | Ở đâu | Dùng vào việc |
|---|---|---|
| Danh mục mã lỗi API (`ERROR_CATALOG`, `Errors.*`) | `packages/platform/src/core/errors.ts`, `@ketoan/contracts` | Mã lỗi kỹ thuật chung: `VALIDATION`, `CONFLICT`, `NOT_FOUND`… |
| Thư viện phát hiện **Gate A** (danh mục) | `packages/contracts/src/catalog-hint.ts` (`ITEM-*`, `PART-*`, `ACC-*`) | Quy tắc khai báo: mã, mức `block / warn / info`, câu báo, **vì sao**, **cách sửa** |
| Mặt hàng nháp | `products.is_draft`, `products.draft_codes`, `item.hints.ts` | Còn lỗi chặn thì lưu nháp, đủ thì tự kích hoạt |
| Khung "Vì sao" | `apps/web/src/components/WhyPanel.tsx` | Hiện cảnh báo trước khi bấm Ghi |
| Bản duyệt luật nhắc của đơn vị (HT09) | `reviewFindings` | Đơn vị bật / tắt, duyệt từng quy tắc |
| Phương án khắc phục | `packages/contracts/src/remedy.ts` | Các bước sửa có cấu trúc |
| Mã tra cứu | `ApiError.requestId / traceId` (khay "Mã tra cứu") | Nối lỗi trên màn với log máy chủ |
| Theo dõi kỹ thuật | Docker: otel-collector, tempo, loki, prometheus, grafana, alertmanager | Lỗi 500, chậm, sập — **việc của dev**, giữ nguyên |
| Tự chẩn đoán | `diagnostic_runs` (L1 / L3) | Quét định kỳ dữ liệu cũ |

**Chia việc:**
- Lỗi **nghiệp vụ** (thiếu tên, chưa có ĐVT nhỏ nhất, trống item_id…) → bộ quy tắc Gate A / Gate B, hiện ngay trên màn cho người dùng.
- Lỗi **kỹ thuật** → bộ Docker. Người dùng chỉ cần chép **mã tra cứu**; dev dán mã đó vào Grafana / Loki để tìm.

## 3. Khung chung — mọi danh mục và chứng từ dùng như nhau

### 3.1 Quy tắc = một dòng trong thư viện phát hiện

Mỗi quy tắc khai **một lần** ở `catalog-hint.ts` (danh mục) hoặc `intake-findings.ts` (chứng từ):

| Trường | Ví dụ |
|---|---|
| `id` (mã lỗi ổn định, không đổi) | `ITEM-BLOCK-003` |
| `entity` | `item` |
| `field` (ô trên form) | `name` |
| `level` | `block` = không cho dùng, giữ nháp · `warn` = cho lưu, cần lý do · `info` = nhắc |
| `title` (câu thân thiện) | "Chưa nhập tên mặt hàng." |
| `why` (vì sao) | "Tên in trên hoá đơn, quầy và kho tìm theo tên…" |
| `fix` (cách sửa) | "Nhập tên, tối đa 50 ký tự." |

Quy ước tiền tố: `ITEM` mặt hàng · `PART` NCC / khách hàng · `GRP` nhóm hàng · `UNIT` đơn vị tính · `BR` chi nhánh / cơ cấu · `WH` kho · `ACC` tài khoản · `BANK` tài khoản ngân hàng · `TAX` thuế · chứng từ dùng `IN-*` (Gate B).

### 3.2 Máy chủ kiểm **hết một lượt**, không dừng ở lỗi đầu tiên

- Mỗi đối tượng có một hàm `kiem<DoiTuong>(dữ liệu) → findings[]`. Thứ tự: khuôn dữ liệu → ràng buộc → trùng lặp.
- **Còn lỗi `block`:**
  - Lưu được (đã có mã / tên tối thiểu) thì lưu thành **Nháp**, ghi `draft_codes`.
  - Không lưu được (vd trùng mã) thì trả 400 kèm `details.findings: [{ code, field, level, title, fix }]` + `requestId`.
- **Chỉ còn `warn`:** cho lưu, người dùng ghi lý do (đang có `warnAck`).
- Các câu `throw Errors.validation('…')` rời rạc hiện nay chuyển dần sang trả mã quy tắc.

### 3.3 Tự lưu nháp

- Form thêm mới: người dùng nhập ô đầu tiên rồi rời ô (hoặc sau ~3 giây) → tự lưu **Nháp**.
- Thoát form → dữ liệu còn nguyên, mở lại làm tiếp.
- Nháp không dùng được trên chứng từ (đã có `IN-ITEM-009`). Đủ quy tắc thì tự thành **Đang dùng**.
- Chứng từ đã có trạng thái nháp — áp cùng cách tự lưu.

### 3.4 Giao diện dùng chung (một bộ thành phần cho mọi màn)

- **Trong form:**
  - ô sai viền đỏ, chữ đỏ dưới ô (mở rộng `useKiemLoi`);
  - đầu form có dải "**3 chưa đạt · 1 cảnh báo**";
  - bấm vào dải → danh sách quy tắc: ✗ chưa đạt, ✓ đã qua; mỗi dòng có **mã lỗi**, câu báo, cách sửa.
- **Trong danh sách:** cột **Tình trạng**:
  - "Đủ" xanh / "Thiếu 2" đỏ / "1 cảnh báo" cam;
  - rê chuột thấy đủ quy tắc đã qua / chưa qua.
- **Mọi thông báo lỗi** có: mã lỗi · mã tra cứu · nút **Chép** (chép cả 2 + tên màn + giờ) → tester dán thẳng vào báo lỗi.

### 3.5 Nhật ký

- Mỗi lần kiểm, ghi một dòng **JSONL** (theo quy ước ít bảng):
  `{ event: 'validation_run', entity, key, user, findings: [mã…], passed: [mã…], requestId }`
- Màn **Nhật ký lỗi khai báo** (đặt ở Hệ thống), lọc theo mã lỗi / người / đối tượng / ngày. Từ một dòng mở được bản ghi.
- Lỗi kỹ thuật (500) đã nằm ở Loki; dòng nhật ký có `requestId` để nối sang.

### 3.6 Cài đặt nhanh cho từng đối tượng

Nút ⚙ **Cài đặt nhanh** trên mỗi màn danh mục / chứng từ, gồm:
- **Quy tắc:** bật / tắt, đổi mức `block ↔ warn` (dùng bản duyệt luật HT09 đang có). Quy tắc gốc của sổ sách (ĐVT nhỏ nhất, item_id…) **không tắt được**.
- **Mặc định khi thêm mới:** ví dụ mặt hàng — ĐVT mặc định, thuế suất mặc định, nhóm mặc định.
- **Hiển thị:** cột mặc định, có tự lưu nháp hay không.

### 3.7 Tự chẩn đoán định kỳ

Chạy cùng bộ quy tắc trên **dữ liệu đã có** (vd mỗi đêm) để bắt chỗ lọt từ trước, nhập Excel, đồng bộ:
- mặt hàng thiếu ĐVT nhỏ nhất;
- dòng chứng từ trống `item_id`;
- mã con không có mã cha.

Kết quả hiện ở cột Tình trạng và trong việc cần làm.

## 4. Bộ quy tắc Danh mục mặt hàng (làm thử)

Cột "Hiện nay" cho biết code đang báo thế nào: **mã** = đã có mã · **câu** = đang ném câu chữ tự do, chưa có mã · **—** = chưa kiểm.

| Mã | Ô | Mức | Câu báo | Hiện nay |
|---|---|---|---|---|
| `ITEM-BLOCK-001` | ĐVT | block | Chưa có đơn vị tính gốc (nhỏ nhất). | mã |
| `ITEM-BLOCK-003` | Tên | block | Chưa nhập tên mặt hàng. | mã |
| `ITEM-BLOCK-004` | Tên | block | Tên dài quá 50 ký tự (đang N). | mã |
| `ITEM-BLOCK-005` | Tên | block | Tên trùng mặt hàng mã X. | mã |
| `ITEM-BLOCK-006` | Mã hàng | block | Mã hàng đã có. | mã |
| `ITEM-BLOCK-007` | Mã hàng | block | Mã chính không được có chữ ở đầu / cuối. | mã |
| `ITEM-BLOCK-008` | Mã hàng | block | Mã biến thể: chưa có mã cha / thêm quá 2 chữ quanh mã cha. | mã |
| `ITEM-BLOCK-009` | Nhóm / ngành / nhãn | block | Phân loại chưa có trong danh mục. | mã |
| `ITEM-BLOCK-010` | Nhóm hàng | block | Chưa chọn tới nhóm cấp 3 để sinh mã. | câu |
| `ITEM-BLOCK-014` | ĐVT | block | Phải có đúng một đơn vị tỉ lệ 1. | mã |
| `ITEM-BLOCK-015` | ĐVT | block | Tên đơn vị trống / bị trùng. | mã |
| `ITEM-BLOCK-016` | ĐVT | block | Tỉ lệ phải lớn hơn 0. | mã |
| `ITEM-BLOCK-017` | ĐVT | block | Quá 10 đơn vị tính. | mã |
| `ITEM-BLOCK-018` | ĐVT | block | Nhiều hơn một đơn vị bán chính / mua mặc định. | mã |
| `ITEM-BLOCK-011` | Giá | block | Bảng giá chưa có / ĐVT của giá chưa có ở mặt hàng. | mã |
| `ITEM-BLOCK-012` | (dữ liệu) | block | Mặt hàng chưa có định danh item_id. | — (thêm vào tự chẩn đoán) |
| `ITEM-HINT-003` | ĐVT | warn | Đổi ĐVT gốc của mặt hàng đã có nhập xuất. | mã |
| `ITEM-HINT-004` | Thuế | warn | Chưa chọn thuế suất GTGT. | mã |
| `ITEM-HINT-005` | Mã vạch | info | Chưa có mã vạch (quầy không quét được). | mã |
| `ITEM-BLOCK-013` | (xoá / ngừng) | block | Đã có nhập xuất: chỉ bỏ "Theo dõi", không xoá. | mã |

**Cần duyệt:**
- các mức `warn / info`;
- câu báo cho dễ hiểu với người dùng;
- quy tắc nào được phép tắt ở Cài đặt nhanh.

## 5. Thứ tự làm

1. **Khung chung:**
   - kiểm hết một lượt, trả `findings` có `field`;
   - thành phần giao diện (dải chưa đạt, ô đỏ, cột Tình trạng, nút Chép);
   - nhật ký JSONL `validation_run`.
2. **Mặt hàng (làm thử):** đổi các câu ở bảng mục 4 sang mã, tự lưu nháp, cột Tình trạng ở DM10, Cài đặt nhanh mặt hàng.
3. Tester test lại DM10 → sửa khung theo góp ý.
4. Nhân ra: NCC / khách hàng (`PART`), nhóm hàng (`GRP`), ĐVT, chi nhánh / cơ cấu (`BR`), kho, hệ thống tài khoản, tài khoản ngầm định, tài khoản ngân hàng, hình thức thanh toán, biểu thuế.
5. Chứng từ: mua → kho → bán (Gate B, đã có `IN-*`), cùng thành phần giao diện.
6. Tự chẩn đoán định kỳ chạy mọi bộ quy tắc trên dữ liệu cũ.

Trang tra mã lỗi `docs/huong-dan/ma-loi/README.md` sinh lại sau mỗi đợt (`node scripts/sinh-ma-loi.mjs`), để tester và dev tra cùng một chỗ.

## 6. Hướng dẫn làm tiếp (cho dev nhận task)

### 6.1 Đã có sẵn — dùng, không viết lại

| Phần | Tệp | Ghi chú |
|---|---|---|
| Hàm ném lỗi theo quy tắc | `packages/platform/src/core/quy-tac.ts` | `quyTac(mã, biến, 'conflict'?)` cho một lỗi; `ruleFinding` + `ruleError` khi gom nhiều lỗi |
| Thư viện quy tắc | `packages/contracts/src/catalog-hint.ts` + `src/quy-tac/<danh-muc>.ts` | Mỗi danh mục một tệp, gộp vào `CATALOG_HINTS` |
| Căn cứ của mã | `packages/contracts/src/legal-basis.ts` (`FINDING_BASIS`) | Bắt buộc: thiếu thì kiểm chuẩn SC-FIND-1 báo |
| Ví dụ biến | `CATALOG_HINT_EXAMPLES` (catalog-hint.ts) | HT09 hiện câu mẫu theo ví dụ này |
| Tô đỏ ô | tự động | Bộ xử lý lỗi chung (`packages/platform/src/core/http.ts`) đổi `details.findings` thành `error.fields`; form chỉ cần `<Field truong="tên-trường">` |
| Nhật ký HT19 | tự động | Mọi lần GHI bị từ chối (400 / 404 / 409 / 422) tự ghi JSONL luồng `kiem-khai-bao`, kể cả lỗi chưa có mã |
| Mã tra cứu + Chép | tự động | Mọi hộp thoại (useKiemLoi) hiện mã lỗi + mã tra cứu + nút Chép khi máy chủ từ chối |
| Báo lỗi đầy đủ trong form | `apps/web/src/components/KetQuaKiem.tsx` | `<KetQuaKiem error={save.error} entity="item" />`: N chưa đạt, ✗ / ✓, Chép |
| Nút **Mã lỗi** (hộp thoại Mã lỗi · Cài đặt · Lịch sử lỗi) | `apps/web/src/components/QuyTacDanhMuc.tsx` | `<PageHeader actions={<NutQuyTac entity="item" logEntity="catalog/products" ten="mặt hàng" />} …/>`; `logEntity` = đường dẫn API của danh mục (bỏ /api/v1/) |
| Cột Tình trạng | `TinhTrang` + `useQuyTac(entity)` | Cần cột `draft_codes` (hoặc tự tính mã chưa đạt) của bản ghi |

### 6.2 Công thức: đổi một danh mục sang quy tắc có mã (≈ 30–60 phút / danh mục)

1. **Liệt kê câu báo hiện có:**
   `grep -nE "Errors\.(validation|conflict)\(" <tệp routes / service của danh mục>`
2. **Gom các câu cùng ý thành một mã**, ví dụ "TK chưa có / là TK tổng hợp / không phải 112" → `BANK-BLOCK-001` với biến `{detail}`.
   - Đặt tiền tố theo danh mục: `PART`, `UNIT`, `BANK`, `BR`, `GRP` nhóm hàng, `WH` kho / loại kho, `ORG` cơ cấu, `ACC` tài khoản, `TAX` thuế, `PAY` hình thức thanh toán, `PL` bảng giá, `DIM` danh mục khác.
   - Mức: `BLOCK` = chặn, `HINT` = cảnh báo / nhắc.
3. **Khai mã** trong `packages/contracts/src/quy-tac/<danh-muc>.ts` (chép mẫu `doi-tuong.ts`). Mỗi mã cần:
   - `title` có `{biến}`;
   - `why` (vì sao, ≤ 3 câu) và `fix` (cách sửa, bắt buộc với block / warn);
   - `okText` (câu khi đã qua) và `field` (tên trường gửi lên máy chủ).

   Danh mục mới (entity mới) thì thêm vào `CatalogEntity` (catalog-hint.ts) và enum `entity` ở `apps/api/src/modules/system/catalog-rules.routes.ts`.
4. Thêm một dòng `FINDING_BASIS` (legal-basis.ts; không có luật thì `NOI-BO`) và một dòng `CATALOG_HINT_EXAMPLES`.
5. **Đổi câu báo** trong module:
   `throw Errors.conflict(\`Mã ${code} đã có…\`)` → `throw quyTac('XXX-BLOCK-003', { code }, 'conflict')`.
   Trùng / đang dùng → `'conflict'` (409), còn lại để mặc định (400). Có nhiều điều kiện kiểm cùng lúc thì gom bằng `ruleFinding` rồi ném `ruleError` một lần (mẫu: `saveProduct` ở `apps/api/src/modules/catalog/catalog.service.ts`).
6. **Màn danh mục:** gắn nút `<NutQuyTac … />` vào `actions` của PageHeader. **Form:** thêm `truong="…"` cho các `<Field>` tương ứng `field`. Muốn danh sách ✗ / ✓ trong form thì đặt `<KetQuaKiem error={…} entity="…" />`.
7. **Chạy và kiểm:**
   - `npm run -s build -w @ketoan/contracts`
   - `npx tsc --noEmit -p apps/api`
   - test của danh mục (`grep -rl "/api/v1/<đường dẫn>" apps/api/test`)
   - `node scripts/sinh-ma-loi.mjs --write`
   - `node scripts/cong-kiem.mjs --write`
   - `bash scripts/kiem-chuan.sh` (phải ĐẠT)
8. Viết test như `apps/api/test/quy-tac-mat-hang.test.ts`: gửi dữ liệu sai → kiểm `error.details.findings[].code`, `error.fields`, dòng HT19.

### 6.3 Tiến độ theo danh mục

| Danh mục | Tệp chính | Trạng thái |
|---|---|---|
| Mặt hàng (DM10) | `catalog/catalog.service.ts` | ✅ mã + kiểm hết một lượt + nháp + cột Tình trạng |
| Đối tượng KH / NCC / NV, nhóm (DM12/13/04/08) | `partners/partner.routes.ts`, `partner-family.ts` | ✅ mã `PART-BLOCK-001…008` |
| Đơn vị tính (DM15) | `unit-names/unit-name.routes.ts` | ✅ `UNIT-BLOCK-001…002` |
| Tài khoản ngân hàng (DM09) | `bank-accounts/bank-account.routes.ts` | ✅ `BANK-BLOCK-001…003` |
| Chi nhánh | `branches/branch.service.ts` | ✅ `BR-BLOCK-001…004` |
| Nhóm hàng / phân loại (DM11), nhóm hạch toán, loại thuế của mặt hàng | `products/product.routes.ts` | ✅ `GRP-BLOCK-001…008` |
| Cơ cấu tổ chức (DM16) | `org-units/org-unit.service.ts` (15) | ⏳ chưa |
| Loại kho (DM18), kho | `warehouses/warehouse-types.ts` (13), `warehouse.routes.ts` (7) | ⏳ chưa |
| Đổi mã / gộp mã hàng | `catalog/item.actions.ts` (11), `sku-rule.ts` (4) | ⏳ chưa |
| Hệ thống tài khoản (ACC1) | `packages/kernel/src/modules/accounts/account.service.ts` (6) | ⏳ chưa |
| Tài khoản ngầm định, hình thức thanh toán, biểu thuế | `packages/kernel/src/modules/posting-config/*.ts` (11), `tax-codes/tax-code.routes.ts` (1) | ⏳ chưa |
| Bảng giá (DM14) | `catalog/catalog.service.ts` (bảng giá, 3) | ⏳ chưa |
| Thùng rác danh mục, tra MST, danh mục khác | `catalog-trash.ts` (4), `partners/tra-mst.ts` (3), `dimensions/*.ts` (4) | ⏳ chưa |

Danh mục chưa đổi **vẫn được** tầng chung lo: lỗi vào HT19, có mã tra cứu + Chép. Chỉ là chưa có mã quy tắc riêng và chưa tô đỏ đúng ô.
