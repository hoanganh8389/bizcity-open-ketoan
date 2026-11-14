# `bizcity_preset@1` — Gói cài nhanh theo ngành
<!-- [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp. -->

> <!-- [2026-11-14 05:53 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-4: 1.1.0 — máy chủ chạy gói (core.setup.*), cai-preset.mjs thành vỏ mỏng -->
> **Phiên bản:** 1.1.0 · 2026-11-14 · **Trạng thái:** Chấp nhận · **Schema:** [BIZCITY-PRESET-v1.schema.json](BIZCITY-PRESET-v1.schema.json)
> **Thư mục:** [`presets/<id>/`](../../presets/README.md) · **Cài:** máy chủ chạy gói — `POST /api/v1/setup/presets/<id>/apply` (hộp thoại Thiết lập nhanh, PHASE-036) hoặc `node scripts/cai-preset.mjs <id>` (vỏ mỏng gọi cùng đường)
> **Liên quan:** [BIZCITY-POSTING-TEMPLATE-v1](BIZCITY-POSTING-TEMPLATE-v1.md) (gói định khoản), [BIZCITY-LEDGER-INTAKE-v1](BIZCITY-LEDGER-INTAKE-v1.md) (chứng từ mẫu), [TEMPLATE-MARKETPLACE](../standard/TEMPLATE-MARKETPLACE.md)

## 1. Mục đích

Doanh nghiệp mới cài xong là **dùng được ngay**, không phải tự cấu hình từ đầu:
- phân hệ đúng ngành;
- gói định khoản hợp chế độ kế toán;
- chế độ ghi sổ;
- vài chứng từ mẫu để thấy ngay sổ, kho, công nợ, báo cáo.

Lập trình viên module dùng preset làm dữ liệu thử nhất quán.

Preset là **dữ liệu**, không phải code. Một preset gồm ba lớp, lớp sau dựa lớp trước:

| Lớp | Khai ở | Cài bằng |
|---|---|---|
| Phân hệ | `modules` | `ENABLED_MODULES` trong `.env` (script in ra dòng cần đặt) |
| Định khoản | `postingPack` → gói `bizcity_posting_template@1` | màn Cấu hình định khoản (xem trước); cài tự động khi có năng lực `templates.posting` (Phase 3) |
| Cấu hình + dữ liệu mẫu | `settings`, `sample` | máy chủ chạy gói (`core.setup.plan` → `POST /api/v1/setup/presets/:id/apply` → `core.setup.run`), mỗi bản ghi qua **action Core**; `scripts/cai-preset.mjs` gọi cùng đường |

## 2. Cấu trúc

```text
presets/<id>/
  preset.json            manifest bizcity_preset@1
  mau/chi-nhanh.json     mảng branchCreate          → POST /api/v1/branches
  mau/doi-tuong.json     mảng { code, name, kind…} → PUT  /api/v1/partners/:code
  mau/mat-hang.json      mảng { sku, name, unit…}  → PUT  /api/v1/catalog/products/:sku
  mau/chung-tu.json      mảng bizcity_ledger_intake@1 → POST /api/v1/documents
```

## 3. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **STD-PRE-1** | `preset.json` đúng schema; `id` = tên thư mục | SC-PRESET-1 |
| **STD-PRE-2** *(T0)* | Dữ liệu mẫu **hư cấu** (`sample.fictional: true`): không tên, MST, SĐT, địa chỉ thật. Repo công khai (R-SEC-10). Dữ liệu thật của khách nằm ngoài repo | SC-PRESET-1, review |
| **STD-PRE-3** *(T0)* | Dữ liệu mẫu vào hệ thống **chỉ qua action Core** (máy chủ chạy gói gọi lại action với quyền người bấm — 1.1.0; trước đó: HTTP API), chứng từ qua `core.document.submit` (cửa nạp). Danh mục chỉ tạo khi chưa có; chỉ nạp vào đơn vị trắng hoặc đã từng chạy cùng gói (`SETUP_NOT_EMPTY`). Không SQL, không seed thẳng bảng: chứng từ mẫu được định khoản, kiểm, ghi bằng chứng như thật (câu 3) | `scripts/cai-preset.mjs` |
| **STD-PRE-4** | `docKey` chứng từ mẫu bắt đầu bằng `preset:<id>:` để nhận ra và huỷ được; cài lại không trùng (docKey + version) | SC-PRESET-1; `test/preset.test.ts` |
| **STD-PRE-5** | Ngày chứng từ mẫu viết `@today` / `@today-N`, máy chủ thay bằng ngày cài (giờ Việt Nam) để không rơi vào kỳ đã khoá | `apps/api/src/modules/system/setup-run.ts` |
| **STD-PRE-6** | `requires.capabilities` phải `available` trên Core đích; `core.setup.plan` báo thiếu, nạp bị từ chối | `setup-run.ts` |
| **STD-PRE-7** | Không viết số tài khoản trong preset: định khoản đến từ gói định khoản + `AccountResolver` (câu 4) | review |

## 4. Preset có sẵn

| `id` | Ngành | Phân hệ | Dữ liệu mẫu |
|---|---|---|---|
| [`thuong-mai-ban-le`](../../presets/thuong-mai-ban-le/preset.json) | thương mại, bán lẻ | kế toán, quỹ, mua hàng, bán hàng, kho, thuế | 1 cửa hàng, 2 NCC, 1 khách, 3 mặt hàng, 1 phiếu nhập mua, 2 hoá đơn bán |

Đề xuất tiếp theo (theo gói định khoản trong [TEMPLATE-MARKETPLACE](../standard/TEMPLATE-MARKETPLACE.md)): `dich-vu`, `san-xuat` (cần `ledger.doctype.production`), `xay-dung`, `xuat-nhap-khau` (cần `ledger.fx`).

## 5. Changelog

- 1.0.0 (2026-10-30): khởi tạo; preset `thuong-mai-ban-le`; `scripts/cai-preset.mjs`; check SC-PRESET-1.
- 1.1.0 (2026-11-14, PHASE-036 · 00 §11): máy chủ chạy gói (`core.setup.presets` / `plan` / `run`, `POST /api/v1/setup/presets/:id/apply`, bảng `sample_runs`); `cai-preset.mjs` thành vỏ mỏng; khuôn `preset.json` không đổi.
