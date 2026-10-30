# PHASE-010 — Tách gói Kernel
<!-- [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng. -->

> **Ký hiệu:** ☐ chưa làm · 🟡 có mã + test · ✅ có bằng chứng · ⛔ chờ chủ · ❌ huỷ.
> Quyết định gốc: [ADR-0008](../../adr/ADR-0008-cay-thu-muc-lean.md) (một gói `packages/kernel`), lộ trình 2.3, 2.7, 2.8.

<!-- [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — Chủ: "tiếp theo" sau PHASE-007 ⇒ làm 010. -->

## 1. Hiện trạng đo được (2026-10-30)

| Chiều | Số đo |
|---|---|
| Ngoài Kernel import thẳng vào bên trong Kernel | 36 chỗ / 21 tệp: lắp ráp route (`phan-he/*`, `app.ts`), phân hệ / báo cáo gọi service (`documentService`, `postDocumentIn`, `voucherService`, `accountRepository`…) |
| Kernel import Platform (`apps/api/src/core/*`) | `auth` 21, `errors` 20, `http` 12, `audit` 11, `actions` 4, `date-rules` 2, `events`, `metrics`, `posting-modes` |

Dời Kernel sang `packages/kernel` ngay thì gói đó phải import ngược `apps/api/src/core`: **vòng phụ thuộc** gói → app. Platform phải thành gói trước.

## 2. Chia đợt (D010-*)

| # | Đợt | Làm gì | Trạng thái |
|---|---|---|---|
| D010-1 | **W1** | Cổng `apps/api/src/kernel/public.ts` (lớp K): xuất đúng những gì ngoài Kernel đang dùng — cửa nạp, `eventStore`, `voucherService`, `allocateDebt`, `accountRepository`, `readPostingModes`, `seed`, chẩn đoán / số đo, route. Chuyển 21 tệp. Check **SC-KERNEL-6** (block): tệp không thuộc K chỉ import K qua `public.ts` | ✅ 2026-10-30 |
| D010-2 | **W2a** | Tách Platform thành gói: `packages/platform` (errors, http, auth, audit, actions, events, request-context, metrics, json-schema) — Kernel và app cùng phụ thuộc | ☐ |
| D010-3 | **W2b** | Dời `modules/{documents,posting,posting-config,ledger,periods,accounts,debts,inventory,tax-*,closing,default-data,vouchers(service)}`, `core/posting-modes.ts`, `db/seed.ts` sang `packages/kernel/src`; `public.ts` thành `packages/kernel/src/index.ts` (`@bizcity/kernel`); nơi gọi đổi một dòng import | ☐ (tín hiệu xong 2.3: `packages/kernel/package.json`) |
| D010-4 | 2.7 | `packages/documents`: số chứng từ, phiên bản, liên kết, đính kèm chung, chữ ký | ☐ |
| D010-5 | 2.8 | Tách `packages/contracts/src/mua-hang` về phân hệ | ☐ |

## 3. Bề mặt công khai là hợp đồng

- Mỗi mục thêm vào `public.ts` là mở rộng bề mặt Kernel: cần nhóm Lõi duyệt (RULE-KERNEL).
- Mục đó phải là thao tác có kiểm bất biến (ghi qua cửa nạp / `eventStore`), không phải lối tắt vào bảng sổ.
- Ba nợ SC-LAYER-2 cũ đổi khoá (đích nay là `kernel/public`):
  - `dimensions` → `usedDimensionCodes`;
  - `products` → `accountRepository`;
  - `system` → `readPostingModes`.
- Số nợ không đổi (204). Gỡ khi danh mục chuẩn có API đọc riêng (ADR-0005).
