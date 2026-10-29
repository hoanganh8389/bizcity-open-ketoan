# Cây thư mục đích và luật phụ thuộc

> Đích của Phase 2–4 ([PHASES.md](PHASES.md)). Code hiện tại ánh xạ vào cây này ở [REUSE-MAP.md](REUSE-MAP.md). Không đổi tên bảng CSDL hiện có (ADR-0002).

## 1. Cây thư mục

```
bizcity-core/                       (repo open-ketoan sau khi tách)
├── AGENTS.md                       luật cho AI agent: đọc gì, sinh gì, chạy kiểm gì
├── bizcity.config.ts               cấu hình có kiểu: module bật, BOOK_MODE, Cell, CSDL
├── packages/
│   ├── kernel/                     @bizcity/kernel        — nhân kế toán (K)
│   │   ├── intake/                 cửa nạp sự việc (từ modules/documents), eventStore.commit
│   │   ├── posting/                luật định khoản, AccountResolver
│   │   ├── ledger/                 sổ cái chỉ thêm, số dư ngày
│   │   ├── periods/  accounts/  config/  tax/  closing/
│   │   ├── subledgers/             công nợ, kho + giá vốn, hoá đơn
│   │   ├── projections/            bảng tra cứu dựng lại được (dòng bán…)
│   │   ├── seeds/                  TT200, tài khoản ngầm định, lý do
│   │   └── public.ts               API công khai DUY NHẤT: submit, cancel, get, query
│   ├── data/                       @bizcity/data          — giao dịch theo đơn vị, RLS, runner migration, masterdata
│   ├── permissions/                @bizcity/permissions   — registry quyền mở, vai trò, khoá API
│   ├── audit/                      @bizcity/audit         — Evidence: nhật ký chỉ thêm, biên nhận
│   ├── events/                     @bizcity/events        — outbox, dispatcher, subscriber, đồng hồ
│   ├── actions/                    @bizcity/actions       — defineAction, idempotency, lỗi, HTTP/OpenAPI
│   ├── documents/                  @bizcity/documents     — số, phiên bản, liên kết, đính kèm, luồng duyệt, ký
│   ├── module-sdk/                 @bizcity/module-sdk    — defineModule, ctx; mặt tiền DUY NHẤT cho module
│   ├── cli/                        @bizcity/cli           — bizcity doctor | migrate | module new | module check
│   └── ui-kit/                     @bizcity/ui-kit        — DataGrid, form chứng từ, bộ lọc, in, khung trang, client
├── modules/                        mỗi module: bizcity.module.json + api/ + web/ + migrations/ + tests/
│   ├── ke-toan/                    màn, báo cáo, phiếu kế toán, kết chuyển (giao diện), kế hoạch
│   ├── danh-muc/  kho/  ban-hang/  mua-hang/  quy/  tai-san/  thue/
│   ├── hop-dong/                   ca chuẩn (GOLDEN-CASE-HOP-DONG.md)
│   └── crm/                        kiểm chứng Phase 5
├── adapters/
│   ├── postgres/                   kết nối, RLS GUC, role CSDL theo module
│   ├── cell/                       MCP server, channel gateway, gọi LLM/OCR/RAG (tuỳ chọn)
│   └── wordpress/                  connector WooCommerce/ACC14 + bizcity/ledger-php-sdk
├── apps/
│   ├── server/                     lắp Kernel + Platform + module bật → Fastify
│   └── web/                        vỏ React: đăng nhập, lưới ứng dụng, nạp web/ của module bật
├── templates/
│   └── starter-module/             khuôn `bizcity module new` sinh ra
├── contracts/                      *.schema.json máy đọc (sinh từ zod), bizcity-standard.json
└── tests/
    ├── conformance/                bộ kiểm cài module (CONFORMANCE.md)
    └── kernel/                     624 phép thử hiện có + assertLedgerInvariants
```

Thư mục `docs/` giữ nguyên vị trí; `docs/contracts/*.md` là bản người đọc, `contracts/*.schema.json` là bản máy kiểm.

## 2. Luật phụ thuộc (Tier 0 với Kernel, Tier 1 còn lại)

```
                 data ──► permissions ──► audit ──► events ──► actions ──► documents
                   ▲                                                         │
                   └──────────────── kernel (dùng mọi gói Platform) ◄────────┘
                                           │ public.ts
                                           ▼
                                      module-sdk  ◄──── ui-kit (chỉ web)
                                           ▲
                         modules/*  ·  adapters/cell  ·  adapters/wordpress
```

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **LAYOUT-1** | Gói Platform **không** import `@bizcity/kernel`. Platform không biết kế toán tồn tại | dependency-cruiser trong CI |
| **LAYOUT-2** | `modules/*` chỉ import `@bizcity/module-sdk`, `@bizcity/ui-kit` và thư viện ngoài. Không import `packages/*/src/**`, không import module khác | `package.json#exports` chỉ mở `index`; CONF-STATIC-1 |
| **LAYOUT-3** | Kernel chỉ mở `public.ts` (`submit`, `cancel`, `get`, `query`, đăng ký quyền / sự kiện của Kernel). Mọi thứ khác là nội bộ | `exports` của gói |
| **LAYOUT-4** | `adapters/cell` là tuỳ chọn: xoá thư mục này đi, `apps/server` vẫn build và chạy đủ kế toán | CI job "no-cell" (P1) |
| **LAYOUT-5** | Một gói = một chủ bảng. Bảng của gói nào thì chỉ gói đó ghi (Kernel: `ledger_*`, `accounting_events*`, `posting_log`, `debt_*`, `inventory_*`, `tax_invoice*`…) | CI grep `insertInto/updateTable/deleteFrom` + role CSDL (Phase 3) |
| **LAYOUT-6** | `apps/*` chỉ lắp ráp, không chứa luật nghiệp vụ | review |

## 3. Kernel vs module Kế toán

"Lấy kế toán làm hạt nhân nhưng không biến tất cả thành kế toán" thể hiện bằng ranh giới này:

| Thuộc Kernel (đóng, không cài / gỡ) | Thuộc `modules/ke-toan` (module như mọi module) |
|---|---|
| Nhận sự việc, phiên bản, đảo khi sửa | Màn nhập phiếu kế toán, danh sách chứng từ, Chờ định khoản (ACC14) |
| Luật định khoản, tra tài khoản | Màn cấu hình lý do, tài khoản ngầm định (gọi action của Kernel) |
| Sổ cái, số dư ngày, khoá kỳ | Báo cáo tài chính, sổ chi tiết, cân đối phát sinh (đọc qua `ledger.query`) |
| Công nợ, kho, giá vốn, hoá đơn (sổ phụ) | Đối chiếu công nợ, kế hoạch dòng tiền, xác nhận công nợ |
| Bút toán kết chuyển, chuyển số dư cuối năm | Màn kết chuyển, màn số dư đầu kỳ |

Hệ quả: tắt `modules/ke-toan` thì Kernel vẫn nhận chứng từ từ POS / WooCommerce và ghi sổ đúng; chỉ mất giao diện. Một doanh nghiệp chỉ cần CRM + hợp đồng vẫn có sổ cái đúng chuẩn phía sau mà không thấy màn kế toán nào.

## 4. `bizcity.config.ts`

```ts
import { defineConfig } from '@bizcity/cli';

export default defineConfig({
  standard: '^1.0',
  database: { url: process.env.DATABASE_URL! },
  book: { mode: 'internal' },                 // internal | tax (BOOK_MODE hiện nay)
  modules: ['ke-toan', 'kho', 'mua-hang', 'hop-dong'],   // thay ENABLED_MODULES
  cell: process.env.BIZCITY_CELL_URL           // không có = chạy độc lập (P1)
    ? { url: process.env.BIZCITY_CELL_URL, apiKey: process.env.BIZCITY_CELL_KEY! }
    : undefined,
});
```

Biến môi trường hiện có (`ENABLED_MODULES`, `ADDINS`, `BOOK_MODE`) vẫn được đọc trong suốt major 1 để máy chủ đang chạy không phải đổi cấu hình (VER-3).

## 5. Cấu trúc một module

```
modules/<key>/
├── bizcity.module.json        manifest (bizcity_module@1)
├── api/
│   ├── index.ts               export default defineModule({ actions, subscribers, documents })
│   ├── actions/*.ts           mỗi tệp một defineAction
│   ├── documents/*.ts         defineDocumentType: zod header/lines, luồng, ánh xạ sổ
│   ├── subscribers/*.ts       xử lý sự kiện (idempotent)
│   └── schemas/*.ts           zod của thực thể (nguồn sinh JSON Schema)
├── migrations/0001_*.sql      schema mod_<key>, có tenant_id + RLS + COMMENT
├── web/
│   ├── index.tsx              export default defineWebModule({ routes, menu, slots })
│   └── screens/*.tsx          chỉ dùng @bizcity/ui-kit
├── tests/                     test riêng + chạy `bizcity module check`
└── README.md                  mô tả nghiệp vụ, luồng, sự kiện phát / nghe
```

Khuôn này do `bizcity module new <key>` sinh từ `templates/starter-module/`.
