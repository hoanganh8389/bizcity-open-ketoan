# PHASE-013 — Chữ chốt G4 → G3 → G5 (mở đường trước đợt 2)
<!-- [2026-11-04 01:08 AM Johnny Chu - Chu Hoàng Anh] PHASE-013 — chữ chốt G4 (route dùng chung về lõi), G3 (mẫu in khai qua module web), G5 (không import trang lõi); chủ dự án đồng ý thứ tự 2026-11-04 -->

> **Căn cứ:** [11-RANH-GIOI-LOI-PHAN-HE §8](11-RANH-GIOI-LOI-PHAN-HE.md#8-tổng-hợp) — chủ dự án đồng ý thứ tự G4 → G3 → G5 trước đợt 2 (2026-11-04).
> **Ai làm:** Nhóm Lõi (đây là tệp framework, bậc 5). Mỗi mục một nhánh, một dòng giữ chỗ; mục sau bắt đầu khi mục trước đã vào `main`.
> **Việc:** S013-10 (G4), S013-11 (G3), S013-12 (G5).

## G4 — Route dùng chung đăng ký ở lõi (S013-10)

**Hiện trạng:** `apps/api/src/phan-he/loi.ts` khai `LEDGER = [ledgerRoutes, reportRoutes, debtRoutes]` và `GOODS = [inventoryRoutes, inventoryReportRoutes, grossProfitRoutes, stockTransferRoutes, departmentReportRoutes]`; năm phân hệ gắn lại `...LEDGER`, `kho` / `mua-hang` gắn `...GOODS` vào `routes` của mình. Route chỉ có khi phân hệ gắn nó được bật (`enabledModules`, `apps/api/src/app.ts:180`).

**Chốt:**
1. Route **Kernel / lõi app** chuyển vào nhóm lõi, gắn một lần, không phụ thuộc phân hệ nào: `ledgerRoutes`, `debtRoutes`, `inventoryRoutes`, `inventoryReportRoutes`. Quyền (`requirePermission`) vẫn là chốt chặn như hiện nay.
2. Route **của phân hệ** trả về chủ: `grossProfitRoutes` → `ban-hang`, `stockTransferRoutes` → `kho`, `reportRoutes`, `departmentReportRoutes` → `ke-toan`.
3. Bỏ hằng `LEDGER`, `GOODS`; `index.ts` của các phân hệ chỉ còn route của chính nó.
4. **Đổi hành vi cần nói rõ:** đơn vị tắt cả `kho` lẫn `mua-hang` trước đây không có route nhập xuất tồn; sau G4 route có, nhưng vẫn cần quyền. Báo cáo của `ke-toan` trước đây có khi bất kỳ phân hệ nào bật; sau G4 chỉ có khi `ke-toan` bật — kiểm `ENABLED_MODULES` mặc định có `ke-toan` (nếu không: giữ `reportRoutes` ở lõi tới đợt 4, ghi lý do).
5. **Kiểm:** test liệt kê route trước / sau (cùng tập đường dẫn với cấu hình mặc định), `npm test`, `selfcheck --strict`. Không đổi đường dẫn, không đổi action.

## G3 — Mẫu in khai qua module web (S013-11)

**Hiện trạng:** `apps/web/src/printCatalog.ts` import mẫu in của cả năm phân hệ (và `ke-toan`, `thue`) rồi gọi `setPrintCatalog`. Slot `WEB_SLOTS` (`packages/module-sdk/src/web.ts:17`) là chỗ chèn **thành phần**, không hợp cho danh sách mẫu in.

**Chốt:**
1. Không thêm slot. Thêm trường tuỳ chọn **`printTemplates`** vào `defineWebModule` (`@bizcity/module-sdk/web`): `{ [mãMàn]: CatalogTemplate[] }`, mã màn theo mã menu (vd `BH01`, `MH10`).
2. Lõi web gom `printTemplates` của mọi module web đã nạp (phân hệ cũ qua `WebModule` trong `apps/web/src/phan-he/<key>/manifest.ts`, module mới qua `defineWebModule`) rồi gọi `setPrintCatalog`; `printCatalog.ts` chỉ còn mẫu in của chính Core.
3. Kiểm khi nạp: mã màn trùng giữa hai module → lỗi nạp (không ghi đè lặng lẽ).
4. **Hợp đồng:** `BIZCITY-EXTENSION-v1` thêm `printTemplates` (minor); `packages/module-sdk/API.md`. Đây là thứ dùng chung — chữ chốt này là bản chốt thiết kế (R-FLOW §3).
5. **Kiểm:** danh mục mẫu in sau khi gom bằng đúng danh mục trước (so `getPrintCatalog()` theo mã màn + id mẫu).

## G5 — Web phân hệ không import trang lõi (S013-12)

**Hiện trạng (đo 2026-11-04):**

| Phân hệ | Import từ lõi web | Dùng để |
|---|---|---|
| `quy`, `ban-hang`, `kho` | `features/documents/DocumentDetail` | mở chi tiết chứng từ dạng hộp nổi |
| `mua-hang` | `features/catalog/PartnersPage` (`PartnerEditor`), `ProductsPage` (`ProductEditor`) | sửa nhanh nhà cung cấp, mặt hàng từ phiếu mua |
| `tai-san` | `features/system/TenantPage`, `layout/menu-helpers` | thông tin đơn vị, dựng menu |
| `ban-hang`, `kho` | `components/salesFilters` | bộ lọc báo cáo |

**Chốt:**
1. **Chi tiết chứng từ:** `@bizcity/module-sdk/web` thêm `openCoreScreen('document.detail', { id })` — lõi web đăng ký trình mở; module không import thành phần. Danh sách màn mở được là **danh sách đóng** (như `WEB_SLOTS`): `document.detail`, `partner.edit`, `product.edit`.
2. **Sửa nhanh đối tượng / mặt hàng:** qua `openCoreScreen('partner.edit' | 'product.edit', { id, onSaved })`; danh mục vẫn chỉ ghi qua `core.partner.*` / `core.item.*` (AGENTS, danh mục có phiên bản).
3. **Bộ lọc dùng chung** (`salesFilters`) và tiện ích menu: chuyển vào `@bizcity/ui-kit` nếu ≥ 2 phân hệ dùng (đúng: `ban-hang`, `kho`); `TenantPage` thì `tai-san` dùng action đọc thông tin đơn vị thay vì import trang.
4. **Hợp đồng:** `BIZCITY-EXTENSION-v1` thêm `openCoreScreen` + danh sách đóng (minor).
5. **Kiểm:** `grep` không còn `features/`, `layout/`, `components/` (ngoài ui-kit) trong `apps/web/src/phan-he/{quy,mua-hang,ban-hang,kho,tai-san}`; đề xuất đưa thành phép kiểm SC-MOD (ratchet) ở chữ chốt SC-MOD-4.

## Ngoài phạm vi

- G2 khung nhìn đọc: [ADR-0026](../../adr/ADR-0026-mo-rong-khung-nhin-doc-du-lieu-loi.md).
- Tài sản vào Kernel (quyết định §8 câu 2 = A): đợt riêng S013-14, chữ chốt riêng khi tới lượt.
- `menu.ts`, `pages.tsx` import phân hệ: đã là cơ chế đăng ký phân hệ cũ; hết khi phân hệ chuyển sang `modules/` (web tự gom).
