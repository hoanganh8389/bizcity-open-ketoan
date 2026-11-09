# 16. Thư viện dùng chung (`bizcity_library@1`)
<!-- [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032): trang API thư viện dùng chung — danh sách, phong bì, ô chọn theo ngày, kiểm ô nhập có gợi ý -->

Thư viện là **dữ liệu tham chiếu chung mọi đơn vị** (tham số pháp lý, ngày nghỉ lễ…), phát hành theo repo ở `libraries/<id>/library.json`. Đơn vị chỉ đọc. Hợp đồng: [BIZCITY-LIBRARY-v1](../contracts/BIZCITY-LIBRARY-v1.md). Quyền: `catalog:read`. Cả bốn action mở cho trợ lý AI qua MCP (`ai: 'read'`).

## 1. Danh sách và phong bì

```http
GET /api/v1/libraries
GET /api/v1/libraries/vn.tham-so-phap-ly
```

Danh sách trả `id`, `kind`, `title`, `version`, `released`, `contentHash`, `owner`, `count` (số mục), `verified` (số mục đã duyệt). Phong bì trả nguồn, changelog, khuôn dữ liệu (`itemSchema`), ô chọn (`selector`), luật (`rules`) và `readme` (hướng dẫn), không kèm mục.

## 2. Ô chọn

```http
GET /api/v1/libraries/vn.tham-so-phap-ly/items?q=luong%20co%20so&at=2026-08-01
```

| Tham số | Nghĩa |
|---|---|
| `q` | tìm không dấu theo các trường `selector.search` (mã, tên, bí danh) |
| `at` | ngày (mặc định hôm nay); thư viện tham số chỉ trả mục có hiệu lực tại ngày, kèm `valueAt` |
| `group` | lọc theo nhóm (`selector.group`) |
| `status` | `active` (mặc định) · `deprecated` · `removed` · `all` (mọi mục còn hiện được) |
| `limit` | 1–500, mặc định 50 |

Mỗi dòng: `{ value, label, group?, hint?, deprecated, verified, valueAt?, item }`. `verified: false` → giao diện hiện nhãn "chưa duyệt".

## 3. Kiểm ô nhập

```http
POST /api/v1/libraries/vn.tham-so-phap-ly/validate
{ "input": { "code": "LUONG_CO_SO", "value": 1800000 }, "at": "2026-03-01" }
```

Gửi `input` (một) hoặc `inputs` (tối đa 200), không cả hai. `source` (tuỳ chọn): module / action / kênh gọi (vd `modules/mua-hang`) để bảng đánh giá biết ai dùng; không gửi thì là `api`. `input` là một mã (`"2026-02-16"`) hoặc đối tượng `{ code, value?, fields?, … }`; các trường khác đi vào `input.*` của luật khai báo.

```json
{ "results": [ {
  "ok": true, "at": "2026-03-01", "value": 2340000,
  "library": { "id": "vn.tham-so-phap-ly", "version": "1.0.0", "hash": "sha256:…" },
  "findings": [
    { "code": "LIB-VALUE-001", "level": "warn", "path": "value", "got": 1800000, "expected": 2340000,
      "message": "giá trị khác thư viện tại ngày 2026-03-01",
      "suggestions": [ { "value": 2340000, "label": "2.340.000 (2024-07-01 → 2026-06-30)", "why": "Lương cơ sở từ 01/7/2024 (chưa duyệt)", "confidence": "vua" } ] },
    { "code": "LIB-UNVERIFIED-001", "level": "info", "path": "code", "message": "LUONG_CO_SO chưa được kế toán trưởng (S030-12) duyệt", "suggestions": [] }
  ]
} ] }
```

`ok` = không có phát hiện `block`. Không ghi gì; Core gợi ý, người dùng quyết. Nghĩa từng mã: [Tra mã phát hiện](../huong-dan/ma-loi/README.md) mục Cổng L, hoặc `GET /api/v1/findings/<mã>`.

## 4. Lượt dùng (bảng đánh giá)
<!-- [2026-11-08 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-48: core.library.usage -->

Mỗi giá trị đi qua `validate` được **đếm** vào `library_usage_daily` (đơn vị, ngày, thư viện, bản, nguồn, mã mục, kết quả, mã phát hiện). Không lưu giá trị người nhập — mã lạ ghi là `?`. Số đếm gom trong bộ nhớ và ghi theo lượt (≥ 30 giây hoặc ≥ 200 dòng), ghi nốt trước khi đọc và khi máy chủ tắt: đây là số **quan sát**, không phải sự thật kế toán.

```http
GET /api/v1/libraries/usage?from=2026-10-10&to=2026-11-08&library=vn.tham-so-phap-ly&source=modules/mua-hang
```

Mặc định 30 ngày tới hôm nay. Trả `total` (qua / cảnh báo / chặn), `byLibrary`, `bySource` (kèm số lượt dùng mã ngừng), `topFindings` (10 mã nhiều nhất), `unknown` (lượt mã lạ theo thư viện × nguồn — ứng viên bổ sung thư viện). Quyền `catalog:read`; MCP chỉ đọc (`core.library.usage`).

### 4.1 Module dùng thư viện <!-- [2026-11-09 01:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-51a -->

```http
GET /api/v1/libraries/modules?to=2026-11-09
```

Theo module (từ `libraries[]` trong `bizcity.module.json` của module SDK và nguồn `modules/<key>` trong số đếm 30 ngày): thư viện đã khai (`exists`, `enabled` theo đơn vị, `required`, `at`, `fields`, `calls`), `usage` (`total` / `pass` / `warn` / `block` / `deprecated`) và `verdict.status` = `dat` · `co-dieu-kien` · `khong-dat` kèm `reasons[]` (26 §9). **Chỉ là phần thời gian chạy**: API không đọc mã nguồn, nên mã cứng trùng thư viện và thư viện khai mà không dùng do SC-LIB-2 kiểm (`npx bizcity module check <key>`). Quyền `catalog:read`.

## 5. Căn cứ và xác nhận của đơn vị
<!-- [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49a: core.library.attest / attestations -->

Căn cứ pháp lý là thư viện `vn.can-cu-phap-ly` (văn bản, hiệu lực, sửa đổi / thay thế). `basis[].key` ở mọi thư viện trỏ mã hoặc bí danh trong đó (khoá cũ `LKT`, `TT99`, `NOI-BO`… vẫn dùng được).

```http
POST /api/v1/libraries/vn.can-cu-phap-ly/attest   { "code": "vn.law.88-2015-qh13", "reason": "Đã đối chiếu văn bản hợp nhất" }
GET  /api/v1/libraries/vn.can-cu-phap-ly/attestations
```

`core.library.attest` (quyền `settings:write` — kế toán trưởng, chủ đơn vị; cần `Idempotency-Key`): đơn vị xác nhận đã đối chiếu một mục, hoặc gỡ (`"revoke": true`). Lý do bắt buộc (≥ 5 ký tự); mã phải là **mã chuẩn** (không bí danh). Mỗi lần là một **bằng chứng** (`meta.receipt`), không đổi thư viện gốc, không đổi trạng thái duyệt của Nhóm Lõi. `core.library.attestations` trả lần mới nhất của từng mục: `attested`, `valid` (còn hiệu lực — mục chưa đổi từ lúc xác nhận), bản, người, lúc, lý do. Trợ lý AI chỉ đọc (`ai: 'deny'` cho xác nhận).

## 6. Cấu hình của đơn vị và phiếu đề xuất
<!-- [2026-11-08 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49b -->

```http
GET  /api/v1/libraries/vn.tham-so-phap-ly/config
POST /api/v1/libraries/vn.tham-so-phap-ly/config   { "config": { "overrides": { "GIO_LAM_VIEC_NGAY": [{ "from": "2026-01-01", "value": 7.5, "reason": "Nội quy công ty 2026" }] } }, "reason": "Áp nội quy 2026" }
```

`core.library.configure` (`settings:write`, `Idempotency-Key`, lý do bắt buộc) ghi **phiên bản cấu hình mới** (chỉ thêm) cho đơn vị: `enabled` (chỉ thư viện `optional`), `atPolicy` (`docDate` · `today`, thư viện tham số), `ruleLevels` (hạ mức luật riêng của thư viện; `LIB-*` không hạ được), `overrides` (giá trị ghi đè có ngày hiệu lực; ngày rơi vào kỳ đã khoá → `PERIOD_LOCKED`). Sau đó `validate` trả `valueSource: "tenant"` khi dùng giá trị đơn vị, `items` ghi `overridden: true`; thư viện đã tắt trả `NOT_FOUND` cho đơn vị đó. `GET …/config` trả bản hiện hành và lịch sử; `GET /api/v1/libraries` có thêm `optional`, `enabled`, `configVersion`.

```http
POST /api/v1/libraries/vn.ngay-nghi-le/proposals    { "kind": "them-muc", "content": "Thêm 2026-09-01, 2026-09-02 — nghỉ Quốc khánh", "basisKey": "vn.law.88-2015-qh13" }
GET  /api/v1/libraries/proposals?library=vn.ngay-nghi-le&status=gui
POST /api/v1/libraries/proposals/12/status          { "status": "da-vao", "resolvedVersion": "1.1.0" }
```

Phiếu đề xuất (`core.library.propose`, `catalog:write`): `kind` = `them-muc` · `sua-gia-tri` · `can-cu` · `bao-sai` · `ngung-dung` (trừ `them-muc`, cần `itemCode`); `basisKey` phải có trong `vn.can-cu-phap-ly`. Trạng thái (`core.library.proposal.update`): `gui → nhan → da-vao` (kèm bản) `| tu-choi` — người có `settings:write`; `rut` — chỉ người gửi; sai vòng → `CONFLICT`. Phiếu không xoá, nội dung không sửa (trigger CSDL).

## 7. Gọi trong máy chủ

Module, add-in trong cùng tiến trình gọi thẳng bộ kiểm, không qua HTTP:

```ts
import { validateInLibrary, selectorRows, getLibrary } from '@bizcity/platform/core/libraries/index';
const r = validateInLibrary('vn.ngay-nghi-le', '2026-02-16');
```

Trong `defineAction` của module dùng `ctx.libraries` (đã áp cấu hình đơn vị, ghi bằng chứng, đếm sử dụng) <!-- [2026-11-09 01:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-51a -->, không import thẳng:

```ts
const r = await ctx.libraries.validate('vn.ngay-nghi-le', ngay);                       // không ném lỗi
await ctx.libraries.require('vn.tham-so-phap-ly', { code: 'GIO_LAM_VIEC_NGAY', value: gio }, { at: ngayChungTu, field: 'luong.tinh#gioLam' });
// block → Errors.validation (details.code = LIB-*); warn → meta.libraryWarnings; thư viện tuỳ chọn đơn vị đã tắt → null
```

Khai thư viện module dùng trong `bizcity.module.json`: `"libraries": [{ "id": "vn.tham-so-phap-ly", "fields": ["luong.tinh#gioLam"], "at": "docDate", "required": true }]`. Hợp đồng: [ACTION §4.5](../contracts/BIZCITY-ACTION-v1.md), [MODULE `libraries[]`](../contracts/BIZCITY-MODULE-v1.md).
