# 02 · Gói dùng chung (Shared Packages)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

## 1. Hiện có

| Gói | Thư mục | Ai dùng | Nội dung |
|---|---|---|---|
| `@ketoan/contracts` | `packages/contracts` | API, Web, test | Khuôn chứng từ (zod), phản hồi API, hằng số nghiệp vụ, tiền, ĐVT, khuôn kết nối, **và** mã riêng Mua hàng (`src/mua-hang/*`) |

Công nghệ nền (giữ nguyên): TypeScript 5.6, Node 22, Fastify 5, zod 3.25, Kysely 0.27, PostgreSQL 16, React 18 + Vite 5, TanStack Query 5, vitest 2. Chi tiết: [../cong-nghe.md](../cong-nghe.md).

## 2. Đích (chuẩn bizcity)

| Gói đích | Tách từ | Nội dung | Luật |
|---|---|---|---|
| `@bizcity/ledger-contracts` | `@ketoan/contracts` (phần nhân) | `bizcity_ledger_intake@1`, `bizcity_api@1`, enums, money, invoices, connections, JSON Schema sinh tự động | Chỉ kiểu + zod + hàm thuần. Không import Node, React, CSDL. SemVer nghiêm |
| `@bizcity/module-sdk` | `phan-he/types.ts`, `core/addins.ts`, `contracts/module.ts` | `defineModule()`, `defineAddIn()`, kiểu `bizcity_module@1`, `ModuleContext` (db chỉ đọc lõi, `events.submit()`, `log`, `settings.get()`) | Phân hệ / add-in chỉ import gói này + `ledger-contracts` |
| `@bizcity/mua-hang-domain` | `packages/contracts/src/mua-hang/*` | Engine giá mua, khuyến mại, tồn max, đặt hàng | Gói của phân hệ, **không** thuộc nhân |
| `@bizcity/test-kit` | `apps/api/test/helpers.ts` | `setupTenant()`, `call()`, mẫu chứng từ, kiểm bất biến sổ (`assertLedgerInvariants`) | Phân hệ và plugin dùng để viết test hợp đồng |
| `@bizcity/cli` | `scripts/*.mjs`, `*.sh` | Lệnh `bizcity` (xem [../ops/CLI.md](../ops/CLI.md)) | Không chứa luật nghiệp vụ; gọi API hoặc script DB |
| `bizcity/ledger-php-sdk` (Composer) | logic gửi trong `tgs_accounting_bridge` | Lớp PHP dựng `bizcity_ledger_intake@1`, băm nội dung → `version`, gửi lô 200, xử lý `bizcity_connector@1` | Cho mọi plugin WordPress / PHP |

## 3. Luật phụ thuộc giữa gói

```
@bizcity/ledger-contracts   ←  không phụ thuộc gói nội bộ nào
        ▲            ▲
        │            └──── bizcity/ledger-php-sdk (sinh từ JSON Schema)
@bizcity/module-sdk
        ▲
phân hệ, add-in  ──►  @bizcity/<phan-he>-domain (nếu có)
        ▲
apps/api, apps/web (lắp ráp)
```

- Gói ở dưới **không bao giờ** import gói ở trên.
- `ledger-contracts` đổi kiểu phá vỡ → tăng major **và** ra hợp đồng `@2`; giữ `@1` song song tối thiểu 2 bản phát hành.
- JSON Schema của mọi khuôn trong `ledger-contracts` sinh tự động (zod → JSON Schema) ở bước build và đặt ở `docs/contracts/*.schema.json`; CI so sánh bản sinh với bản trong repo (lệch = đỏ).

## 4. Cách chuyển (không gãy)

1. Tạo `packages/ledger-contracts` re-export từ `packages/contracts` (tên gói `@bizcity/ledger-contracts`).
2. Đổi import dần trong `apps/*`; `@ketoan/contracts` giữ làm bí danh.
3. Chuyển `src/mua-hang/*` sang `packages/mua-hang-domain`.
4. Khi không còn ai import `@ketoan/contracts`: xoá bí danh.
