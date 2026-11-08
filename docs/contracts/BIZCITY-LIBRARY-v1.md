# `bizcity_library@1` — Thư viện dùng chung
<!-- [2026-11-07 09:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-44 (ADR-0032): hợp đồng khuôn chung cho thư viện tham chiếu — phong bì, mục, phiên bản ba tầng, luật khai báo, gợi ý, mã LIB-*, ô chọn, API -->

> **Phiên bản:** 1.2.0-draft · 2026-11-07 · **Trạng thái:** Thi hành đợt A ([ADR-0032](../adr/ADR-0032-thu-vien-dung-chung-bizcity-library.md), S030-45); ô chọn trong ui-kit (A2), đọc tham số qua `getSetting` và `ctx` của SDK (đợt B) là đề xuất
> **Lược đồ máy đọc:** [BIZCITY-LIBRARY-v1.schema.json](BIZCITY-LIBRARY-v1.schema.json) · **Kiểu TypeScript + bộ kiểm:** `packages/platform/src/core/libraries/` (`types.ts`, `engine.ts`, `index.ts`) · **Dùng chung với bộ kiểm chuẩn:** `scripts/thu-vien/thu-vien.mjs` · **API:** [docs/api/16-thu-vien.md](../api/16-thu-vien.md); mã `LIB-*` ở `packages/contracts/src/library-findings.ts` (gom vào `findings.ts`) · **Kiểm:** SC-LIB-1
> **Liên quan:** [`bizcity_findings@1`](BIZCITY-FINDINGS-v1.md) (mã `LIB-*`), [`bizcity_settings@1`](BIZCITY-SETTINGS-MATRIX-v1.md) (giá trị của đơn vị), [ADR-0031](../adr/ADR-0031-policy-registry-rule-contracts.md) (chính sách của đơn vị)

## 1. Thư viện là gì

Dữ liệu tham chiếu **chung cho mọi đơn vị**, phát hành theo repo, đơn vị chỉ đọc: tham số pháp lý, ngày nghỉ lễ, mã chức năng và vai trò mẫu, sườn nghiệp vụ, luật kiểm nhập liệu, danh sách báo cáo… Thư viện **không** tự sinh bút toán, không tạo danh mục của đơn vị, không cấp quyền.

Một thư viện = một thư mục:

```text
libraries/<id>/
  library.json        phong bì + items[] (bắt buộc)
  README.md           dùng làm gì, ai duyệt, cách cập nhật (bắt buộc)
  sources/            tệp nguồn gốc khi sinh máy (tuỳ chọn, không sửa tay)
  build.mjs           script sinh library.json từ sources/ (tuỳ chọn; có thì SC-LIB-1 chạy lại và so)
```

`id` = `<miền>.<tên>`, chữ thường, số, gạch ngang: `vn.tham-so-phap-ly`, `vn.ngay-nghi-le`, `authz.tgs-chuc-nang`. Miền đầu: `core`, `vn`, `authz`, `nghiep-vu`, `bao-cao`, `nhap`, `mau` (thêm miền = sửa bảng này).

## 2. Sáu nguyên tắc, hợp đồng trả lời ở đâu

| # | Nguyên tắc | Trả lời | Mục |
|---|---|---|---|
| 1 | JSON, linh hoạt | phong bì cố định; `payload` của mục tự do theo `itemSchema` thư viện tự khai | §3, §4 |
| 2 | Có phiên bản | thư viện (semver + băm + changelog) · mục (mã không dùng lại, `deprecated` / `removed`) · giá trị (`effective[]` theo ngày) | §5 |
| 3 | Phép kiểm có căn cứ để gợi ý | năm kiểm chuẩn + `rules[]` khai báo; mỗi phát hiện kèm `suggestions[]` lấy từ chính thư viện | §6 |
| 4 | Mã lỗi chuẩn chung | `LIB-*` (bảy mã) + mã riêng của thư viện, cùng nằm trong `bizcity_findings@1` | §7 |
| 5 | Hướng dẫn, gợi ý | `README.md`, `hints[]` ở mục, `why` / `fix` / `basis` ở luật | §8 |
| 6 | Bắt được ô nhập, ô chọn | `selector` trong phong bì; API trả mục theo khuôn ô chọn, kiểm ô nhập | §9, §10 |

## 3. Phong bì

| Trường | Kiểu | Bắt buộc | Nghĩa |
|---|---|---|---|
| `contract` | `"bizcity_library@1"` | có | |
| `id` | chuỗi | có | `<miền>.<tên>`, trùng tên thư mục |
| `kind` | `param` · `calendar` · `code-list` · `permission-template` · `business-map` · `rule-set` · `report-list` · `import-template` · `master-sample` | có | loại, để giao diện và công cụ biết cách hiện |
| `title`, `description` | chuỗi | có | tiếng Việt có dấu |
| `version` | semver | có | §5.1 |
| `released` | `YYYY-MM-DD` | có | ngày phát hành bản này |
| `contentHash` | `sha256:<hex>` | có | băm của `items` chuẩn hoá (§5.1) |
| `owner` | chuỗi | có | ai duyệt nội dung (vd "kế toán trưởng", "Nhóm Lõi") |
| `sources[]` | `{ title, kind: law · internal · reference · generated, date?, license?, note? }` | có, ≥ 1 | nguồn (ADR-0032 D-LIB-9) |
| `generatedBy` | đường dẫn script | không | có thì không sửa tay `library.json` |
| `itemSchema` | JSON Schema (2020-12, tập con §4.2) | có | khuôn `payload` |
| `selector` | §9 | có | ô chọn |
| `rules[]` | §6.2 | không | luật riêng |
| `codePrefix` | chuỗi `A-Z` 2–8 ký tự | khi có `rules[]` | tiền tố mã luật riêng, duy nhất giữa các thư viện |
| `changelog[]` | `{ version, date, hash, notes }` | có, ≥ 1 | mục đầu = bản hiện hành |
| `items[]` | §4 | có | |

## 4. Mục

### 4.1 Khuôn

| Trường | Kiểu | Bắt buộc | Nghĩa |
|---|---|---|---|
| `code` | chuỗi | có | duy nhất trong thư viện; **không bao giờ dùng lại** cho nghĩa khác |
| `name` | chuỗi | có | tên hiện cho người dùng |
| `aliases[]` | chuỗi | không | mã / tên cũ, mã ở hệ nguồn (vd mã Erp-vn `LUONG_TOI_THIEU_VUNG_1`) — tìm được, gợi ý được |
| `group` | chuỗi | không | nhóm (vd `bao-hiem`, `thue-tncn`) |
| `status` | `active` · `deprecated` · `removed` | có | §5.2 |
| `since` | phiên bản thư viện | có | bản đầu có mục |
| `replacedBy` | mã | khi `deprecated` / `removed` và có mục thay | |
| `verified` | `true` · `false` | có | đã được `owner` đối chiếu chưa |
| `confidence` | `cao` · `vua` · `thap` | không | độ tin cậy của mục máy suy ra |
| `effective[]` | `{ from, to, value, basis?, note? }` | khi mục có giá trị theo ngày | §5.3 |
| `payload` | đối tượng | không | dữ liệu riêng, khớp `itemSchema` |
| `hints[]` | `{ kind: how · why · example · warning, text, link? }` | không | §8 |
| `basis[]` | §8.2 | không | căn cứ của cả mục |

### 4.2 `itemSchema`

JSON Schema của `payload`. Bộ kiểm đợt A hỗ trợ tập con đủ cho dữ liệu tham chiếu: `type`, `properties`, `required`, `additionalProperties`, `enum`, `const`, `items`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `format: date`. Từ khoá ngoài tập con → SC-LIB-1 báo (không âm thầm bỏ qua).

`effective[].value` cũng theo khuôn: `itemSchema.properties.value` nếu có, không thì `payload.valueType` (`number` · `percent` · `money` · `integer` · `boolean` · `string` · `date`).

## 5. Phiên bản

### 5.1 Thư viện

- **major**: đổi nghĩa một mã, chuyển `active → removed` không có `replacedBy`, đổi `itemSchema` không tương thích, đổi `selector.value`.
- **minor**: thêm mục, thêm trường tuỳ chọn ở `itemSchema`, thêm khoảng `effective[]` mới, `active → deprecated`.
- **patch**: câu chữ, `hints`, `basis`, `verified`.
- `contentHash` = `sha256` của `JSON.stringify(items)` sau khi chuẩn hoá (khoá đối tượng sắp xếp, mảng giữ thứ tự). SC-LIB-1 tính lại: khác `contentHash` → chặn; `changelog[0]` phải có `version` = `version` và `hash` = `contentHash`. Đổi nội dung mà quên lên bản → băm lệch → chặn.
- Phiên bản đã có trong `changelog` không được dùng lại cho băm khác (SC-LIB-1 so với bản trên `origin/main` khi có).

### 5.2 Mục (ECP-13)

`active` → `deprecated` (vẫn đọc được, chọn mới bị cảnh báo, gợi ý `replacedBy`) → `removed` (giữ bia mộ: `code`, `name`, `replacedBy`; không hiện ở ô chọn; nhập vào bị chặn). Mục **không bị xoá** khỏi `items[]`; chứng từ cũ tham chiếu mã vẫn tra được nghĩa.

### 5.3 Giá trị theo ngày

`effective[]` sắp theo `from`, khoảng **không chồng nhau**, `to` là ngày cuối còn hiệu lực (gồm cả ngày đó) hoặc `null`. Đọc **tại ngày** `at`: khoảng có `from ≤ at ≤ to`. Hở giữa hai khoảng là hợp lệ (tham số tạm không có giá trị) và đọc ra "không có giá trị tại ngày". Bằng chứng ghi `{ kind: 'library', key: '<id>:<code>', version, hash, at, value }` vào `basis_used` (S030-29).

Thứ tự đọc một tham số (ADR-0032 D-LIB-8): giá trị đơn vị ghi đè (`setting_values`) → thư viện tại ngày → mặc định registry. Đợt A chỉ dựng tầng thư viện; nối vào `getSetting` là đợt B.

## 6. Phép kiểm và gợi ý

### 6.1 Kiểm chuẩn (mọi thư viện)

`validateAgainstLibrary(id, input, { at })`. `input` là một giá trị (`"BHXH_NLD"`) hoặc một đối tượng `{ code?, value?, fields? }`.

| Kiểm | Mã | Mức | Gợi ý lấy từ |
|---|---|---|---|
| mã không có (cả `code` lẫn `aliases`) | `LIB-UNKNOWN-001` | block | ≤ 5 mục `active` gần nhất theo `selector.search` (trùng tiền tố, chứa, khoảng cách sửa ≤ 2, bỏ dấu) |
| mã đã `deprecated` | `LIB-DEPRECATED-001` | warn | `replacedBy` |
| mã đã `removed` | `LIB-REMOVED-001` | block | `replacedBy` (nếu có) |
| không có giá trị tại ngày `at` | `LIB-EFFECTIVE-001` | block | khoảng gần `at` nhất, kèm ngày |
| `fields` / `payload` sai `itemSchema` | `LIB-SCHEMA-001` | block | trường sai, khuôn đúng |
| `value` khác giá trị thư viện tại ngày | `LIB-VALUE-001` | warn | giá trị thư viện tại ngày + căn cứ |
| mục `verified: false` | `LIB-UNVERIFIED-001` | info | `owner` của thư viện |

Nhập bằng `aliases` không lỗi: kết quả trả `resolved: <code>` để bên gửi đổi sang mã chuẩn.

### 6.2 Luật khai báo `rules[]`

```json
{
  "code": "PIT-EXEMPT-001",
  "level": "warn",
  "title": "Khoản lương miễn thuế cần mã tham số miễn thuế",
  "why": "Khoản miễn thuế TNCN có trần theo luật; thiếu tham số thì không tính được phần vượt trần.",
  "fix": "Chọn mã tham số ở ô \"Mã tham số miễn thuế TNCN\".",
  "when": { "all": [ { "field": "input.taxExempt", "op": "eq", "value": true }, { "field": "input.exemptParam", "op": "missing" } ] },
  "suggest": { "fromLibrary": "vn.tham-so-phap-ly", "filter": { "group": "thue-tncn" } },
  "basis": [ { "ref": "Luật Thuế TNCN", "verified": false } ]
}
```

- `when`: `all` / `any` / `not` lồng nhau trên điều kiện `{ field, op, value? }`. `field` là đường `input.*` (ô nhập) hoặc `item.*` (mục thư viện đã khớp). `op`: `eq`, `ne`, `in`, `nin`, `gt`, `gte`, `lt`, `lte`, `exists`, `missing`, `matches` (biểu thức chính quy, ≤ 200 ký tự). **Không** có hàm, phép tính, gọi ra ngoài.
- `suggest`: `{ value }` cố định · `{ field: 'item.<đường>' }` lấy từ mục · `{ fromLibrary, filter }` gợi ý mục của thư viện khác (phải tồn tại).
- Mã luật = `<codePrefix>-<NHÓM>-<NNN>` (vd `TSPL-LAW-001`, ba khúc như mọi mã của `bizcity_findings@1`), không trùng mã nào trong thư viện phát hiện; `codePrefix` không lấy `LIB`, `IN`, `ACC`, `PART`, `ITEM`, `ENTRY`.
- Luật cần tính toán (cộng dồn, so sánh giữa nhiều chứng từ, tra CSDL) **không** đặt ở đây: Rule Contract của Policy Registry (ADR-0031) hoặc phép kiểm của module.

### 6.3 Kết quả

```json
{
  "ok": false,
  "library": { "id": "vn.tham-so-phap-ly", "version": "1.0.0", "hash": "sha256:…" },
  "resolved": "LUONG_CO_SO",
  "at": "2026-03-01",
  "value": 2340000,
  "findings": [
    {
      "code": "LIB-VALUE-001", "level": "warn", "path": "value", "got": 1800000, "expected": 2340000,
      "message": "Giá trị khác thư viện tại ngày 2026-03-01",
      "suggestions": [ { "value": 2340000, "label": "2.340.000 (2024-07-01 → 2026-06-30)", "why": "Lương cơ sở từ 01/7/2024 (chưa duyệt)", "confidence": "cao" } ]
    }
  ]
}
```

`findings[]` cùng khuôn phát hiện cụ thể của `bizcity_findings@1` (`code`, `level`, `path`, `got`, `expected`) thêm `suggestions[]`. `ok` = không có `block`. Core **gợi ý**, không tự sửa ô nhập (ADR-0020).

## 7. Mã lỗi

- Bảy mã `LIB-*` ở §6.1 vào `bizcity_findings@1` 1.2.0 với cổng mới `L` (thư viện), `source: 'bizcity_library'`, `step` = tên kiểm. Mỗi mã có `title`, `why`, `fix`, `basis: ['NOI-BO']` như mọi mã khác.
- Mã luật riêng (`<codePrefix>-<NHÓM>-<NNN>`) gom vào cùng thư viện phát hiện với `source: 'bizcity_library:<id>'`, cổng `L`.
- SC-FIND-1 (đã có) chặn trùng mã giữa mọi nguồn; trang [Tra mã phát hiện](../huong-dan/ma-loi/README.md) có cả mã `LIB-*` và mã luật; `npx bizcity explain <mã>` và MCP `core.findings.explain` trả nghĩa.

## 8. Hướng dẫn và căn cứ

### 8.1 Ba chỗ

| Chỗ | Viết gì | Ai đọc |
|---|---|---|
| `README.md` của thư viện | dùng làm gì, nguồn, ai duyệt, cách cập nhật, chạy lại script sinh | dev, người duyệt |
| `hints[]` ở mục | `how` cách dùng · `why` vì sao có · `example` ví dụ · `warning` lưu ý | người nhập liệu (hiện cạnh ô chọn) |
| luật `why` / `fix` | vì sao kế toán cần, cách sửa | người nhập liệu, AI |

### 8.2 Căn cứ

`basis[]` = `{ ref, key?, article?: { dieu, khoan?, diem? }, verified }`. `ref` là chuỗi tự do theo nguồn (vd "Nghị định 73/2024/NĐ-CP, Điều 3"); `key` khi văn bản có trong `LEGAL_BASES` (`packages/contracts/src/legal-basis.ts`). Giao diện chỉ hiện điều khoản khi `verified: true` ([21 §3.1](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/21-SO-CONG-VA-BANG-DIEU-HANH.md)).

## 9. Ô chọn

```json
"selector": {
  "value": "code",
  "label": "{code} · {name}",
  "search": ["code", "name", "aliases"],
  "group": "group",
  "filters": [ { "field": "group", "label": "Nhóm" }, { "field": "payload.kind", "label": "Loại" } ],
  "sort": ["group", "code"],
  "showValueAt": true
}
```

- `value`: trường làm giá trị lưu (thường `code`); `label`: mẫu hiện với `{đường}`; `search`: trường tìm (không phân biệt dấu); `group`: trường gom nhóm; `filters`: lọc có sẵn; `showValueAt`: hiện giá trị tại ngày cạnh nhãn (thư viện tham số).
- Ô chọn mặc định chỉ hiện `active`; `deprecated` hiện khi đang giữ giá trị cũ (gạch ngang, gợi ý `replacedBy`); `removed` không hiện.

## 10. Giao diện máy

| Đường | Action | Nghĩa |
|---|---|---|
| `GET /api/v1/libraries` | `core.library.list` | id, kind, title, version, released, số mục, `verified` (tỉ lệ) |
| `GET /api/v1/libraries/:id` | `core.library.get` | phong bì (không `items`) + README |
| `GET /api/v1/libraries/:id/items?q=&at=&group=&status=&limit=` | `core.library.items` | mục theo khuôn ô chọn `{ value, label, group, hint, deprecated, valueAt? }` + mục đầy đủ |
| `POST /api/v1/libraries/:id/validate` | `core.library.validate` | `{ input \| inputs[], at?, source? }` → kết quả §6.3 (không ghi gì vào sổ; đếm một lượt / giá trị — §10.1) |
| `GET /api/v1/libraries/usage` | `core.library.usage` | `?from=&to=&library=&source=` → lượt qua / cảnh báo / chặn theo thư viện, nguồn; mã phát hiện nhiều nhất; mã lạ |

Quyền: `catalog:read`. MCP: `ai: 'read'` cả bốn action (đọc đúng nguồn, không đoán nghĩa mã). Máy chủ đọc thư viện từ tệp lúc khởi động, giữ trong bộ nhớ theo `version` + `contentHash` (không CSDL). Module gọi bộ kiểm ở máy chủ qua `@bizcity/platform/core/libraries` (đợt A); qua `ctx` của SDK là đề xuất đợt B.

### 10.1 Lượt dùng <!-- [2026-11-08 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-48 -->

Bảng `library_usage_daily` (migration 0083): khoá (đơn vị, ngày, thư viện, bản, nguồn, mã mục, kết quả, mã phát hiện) → số lần. **Không lưu giá trị nhập** (R-SEC-10): mã mục là mã chuẩn đã khớp, mã lạ ghi `?`; nguồn ngoài khuôn `[a-z0-9._/:-]` thành `api`. Kết quả lượt: `block` nếu có chặn, `warn` nếu có cảnh báo, còn lại `pass` (mức nhắc không tính); mã phát hiện là mã nặng nhất. Ghi gom theo lượt, không hẹn giờ (SC-EVT-1): ≥ 30 giây hoặc ≥ 200 dòng; ghi nốt trước khi đọc và khi máy chủ tắt; lỗi ghi bỏ lô — số đếm là quan sát (eventual), không đọc để ghi sổ.

## 11. Bảo đảm (SC-LIB-1, block)

Với mỗi `libraries/*/library.json`:

1. khớp lược đồ phong bì; `id` trùng tên thư mục; có `README.md`;
2. `code` duy nhất; `replacedBy` trỏ mã có thật, không vòng; `removed` / `deprecated` không mất khỏi `items[]` so với `origin/main`;
3. mọi `payload` khớp `itemSchema` (tập con §4.2); `effective[]` sắp đúng, không chồng, `from ≤ to`;
4. `contentHash` đúng; `changelog[0]` khớp `version` + `hash`; có `generatedBy` thì chạy lại script ra đúng tệp;
5. `rules[]`: mã đúng tiền tố, không trùng `bizcity_findings@1`, `block` / `warn` có `fix`, `when` chỉ dùng `op` cho phép, `suggest.fromLibrary` tồn tại;
6. `sources[]` không rỗng; nguồn `kind: reference` không kèm tệp mã nguồn của phần mềm khác trong `sources/`.

## 12. Nhật ký thay đổi

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.0.0-draft | 2026-11-07 | Bản đầu: phong bì, mục, phiên bản ba tầng, kiểm chuẩn + luật khai báo + gợi ý, mã `LIB-*`, ô chọn, API, SC-LIB-1 (ADR-0032) |
| 1.0.1-draft | 2026-11-07 | Sửa khi viết mã (S030-45): `LIB-NOT-EFFECTIVE-001` → `LIB-EFFECTIVE-001`; mã luật ba khúc `<codePrefix>-<NHÓM>-<NNN>`; ví dụ §6.3 đúng khoảng hiệu lực <!-- [2026-11-07 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-44 --> |
| 1.1.0-draft | 2026-11-07 | Thi hành đợt A (S030-45): bộ nạp + bộ kiểm có gợi ý ở Platform, `core.library.list / get / items / validate`, cổng L trong `bizcity_findings@1`, SC-LIB-1, thư viện `vn.tham-so-phap-ly` và `vn.ngay-nghi-le`; `percent` không giới hạn trên (làm thêm 150 / 200 / 300 %) <!-- [2026-11-07 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 --> |
| 1.2.0-draft | 2026-11-08 | Lượt dùng (S030-48): `source` ở `core.library.validate`, `core.library.usage`, bảng `library_usage_daily` §10.1 — chỉ mã, không giá trị nhập <!-- [2026-11-08 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-48 --> |
