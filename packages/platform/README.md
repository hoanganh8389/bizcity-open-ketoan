# @bizcity/platform — Platform của Bizcity Core
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — README gói: thành phần, ranh giới, lệnh -->

Hạ tầng dùng chung cho Kernel và ứng dụng: lỗi chuẩn, HTTP, quyền, bằng chứng, runtime action, sự kiện, số đo, kết nối CSDL, chứng từ dùng chung. **Platform không biết Kernel** (LAYOUT-1): không import `@bizcity/kernel`.

## Dùng thế nào

Import theo đường con: `import { db } from '@bizcity/platform/db/client'`, `import { Errors } from '@bizcity/platform/core/errors'` (gói xuất `./*`). Module **không** import gói này trực tiếp: dùng [`@bizcity/module-sdk`](../module-sdk/README.md).

## Bên trong `src/`

| Thư mục | Có gì |
|---|---|
| `db/` | `client.ts` (kết nối, `readWithTimeout` cho đọc có giới hạn thời gian), `migrate.ts` (chạy migration `db/migrations/`), `types.ts` (kiểu Kysely của mọi bảng; sửa khi thêm migration, `SC-DATA-7` kiểm khớp) |
| `core/` | `actions.ts` (runtime `defineAction`), `auth.ts`, `audit.ts`, `errors.ts` (mã lỗi API), `events.ts`, `http.ts`, `metrics.ts`, `module-registry.ts`, `notify.ts`… |
| `system/` | `diagnostics.ts`: khung tự chẩn đoán (`DiagCheck`, `sqlCounts`, `runDiagnostics`) |
| `masterdata/` | Danh mục dùng chung ở mức hạ tầng (đối tượng, kho mặc định) |
| `documents/` | `signature.routes.ts`: ký xác nhận trên phiếu |
| `config/` | Cấu hình |

Tệp `apps/api/src/db/{types,client,migrate}.ts` chỉ là tệp chuyển tiếp về đây; mã mới import thẳng `@bizcity/platform/...`.

Gói đích chưa tách: `packages/data`, `packages/actions`, `packages/events`, `packages/audit`, `packages/documents`, `packages/permissions` (lộ trình [PHASES](../../docs/standard/PHASES.md) 2.4–3.4). Hôm nay các phần đó nằm ở đây hoặc ở `apps/api/src/core/`.

## Lệnh

```bash
npm run build -w @bizcity/platform
npm run typecheck -w @bizcity/platform
```
