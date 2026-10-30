# ADR-0008 · Cây thư mục lean: đánh giá đề xuất 9 thư mục gốc, chốt ánh xạ vào TARGET-LAYOUT

- Trạng thái: Chấp nhận
- Ngày: 2026-10-30 · Người quyết: chủ dự án (Johnny Chu)
- Luật / hợp đồng liên quan: [TARGET-LAYOUT](../standard/TARGET-LAYOUT.md) (LAYOUT-1..8), ADR-0005, [ADR-0007](ADR-0007-goi-chia-se-va-ha-tang.md), [Bản công bố kiến trúc](../CONG-BO-KIEN-TRUC.md)

## Bối cảnh

Có đề xuất cây thư mục chuẩn hoá:

```
open-ketoan/
├── core/            accounting · ledger · inventory · compliance
├── contracts/       domains · commands · events · evidence · policies · extensions
├── event-platform/  registry · publisher · outbox · consumers · replay · transports
├── database/        migrations · queries · generated
├── sdk/             typescript · mcp · cli
├── community/       module-template · contract-test-kit
└── docs/            architecture · legal-matrix · event-catalog
```

Tiêu chí của core open-framework là **lean, gọn**:
- ít thư mục gốc;
- một gói một chủ (LAYOUT-5);
- không tách nhỏ khi chưa có lý do đo được;
- không đổi tên hàng loạt khi đổi tên không mang thêm bảo đảm nào.

## Đánh giá từng thư mục

| Đề xuất | Đánh giá | Chốt | Vì sao |
|---|---|---|---|
| `core/{accounting, ledger, inventory, compliance}` | **Đúng ý, gộp lại** | **một** gói `packages/kernel/` (đã có trong TARGET-LAYOUT), bên trong: `intake/`, `posting/`, `ledger/`, `periods/`, `subledgers/{debts,inventory}/`, `tax/`, `closing/`, `compliance/` | Sổ cái, kho (giá vốn), công nợ ghi trong **cùng một giao dịch** (STD-DOM-6). Tách thành 4 gói thì phải mở API chéo giữa chúng và mất ranh giới `public.ts` duy nhất (LAYOUT-3). `compliance/` là cổng kiểm chạy thật (khoá kỳ, lưu trữ, phiên bản chính sách), nằm trong Kernel |
| `contracts/{domains, commands, events, evidence, policies, extensions}` | **Nhận, gộp 6 → 5** | `contracts/{domain, commands, events, compliance, extensions}/`: bản **máy đọc** (JSON Schema, registry). Bản người đọc giữ ở `docs/contracts/` | Ba lớp kiểm soát (Domain, Event, Compliance) mỗi lớp một thư mục. `evidence` và `policies` (phiên bản chế độ kế toán) là yêu cầu tuân thủ, gộp vào `compliance/`. `commands` = khai báo action (`bizcity_action@1`) |
| `event-platform/{registry, publisher, outbox, consumers, replay, transports}` | **Đúng phần trong, sai vị trí** | `packages/events/{registry, outbox, dispatcher, subscribers, replay}`; transport là `adapters/nats`, `adapters/webhook` | Một thư mục gốc riêng cho sự kiện thì sự kiện thành "nền tảng thứ hai". Outbox phải ghi **cùng giao dịch** với sổ (R-OUTBOX-1), nên nó là gói Platform dùng chung giao dịch của `packages/data`. Transport là tuỳ chọn (LAYOUT-8) |
| `database/{migrations, queries, generated}` | **Nhận một phần** | giữ `db/migrations/` (SQL là nguồn sự thật, không sửa khi đã phát hành, có khoá checksum) + `db/seeds/`. **Không** có `queries/` chung. Kiểu sinh ra (`generated`) nằm cạnh gói chủ | Truy vấn thuộc gói chủ bảng (LAYOUT-5). Một thư mục `queries/` chung sẽ thành nơi mọi module với vào bảng nhân. Đổi `db/` → `database/` không thêm bảo đảm nào, lại làm gãy các đường dẫn đang dùng (runner, Docker, bộ kiểm) |
| `sdk/{typescript, mcp, cli}` | **Nhận ý, đặt trong `packages/`** | `packages/module-sdk/` (TypeScript), `packages/cli/`; máy chủ MCP sinh từ registry action trong Core | Client MCP bên ngoài dùng giao thức MCP chuẩn, không cần SDK riêng. Mọi gói npm ở `packages/` cho npm workspaces |
| `community/{module-template, contract-test-kit}` | **Nhận ý, giữ vị trí đã có** | `templates/starter-module/`; bộ kiểm hợp đồng là `tests/conformance/` (cùng một bộ cho Core và module, ADR-0006), sau này phát hành thành `npx @bizcity/check` | Bộ kiểm hợp đồng của cộng đồng phải **là** bộ CI của Core, không phải bản sao dễ lệch |
| `docs/{architecture, legal-matrix, event-catalog}` | **Nhận** | `docs/architecture/` (đã có); ma trận pháp lý trong [`bizcity_compliance@1`](../contracts/BIZCITY-COMPLIANCE-v1.md); danh mục sự kiện **sinh** từ registry sự kiện (`coreEvents` + manifest module) | Danh mục sự kiện viết tay sẽ lệch code |

## Quyết định

Cây gốc lean (11 mục, mỗi mục một vai trò, không trùng):

```
apps/            lắp ráp: server (API + MCP), web
packages/        kernel (Accounting Core) · data · permissions · audit · events · actions · documents · observability · module-sdk · cli · ui-kit
modules/         module cài / gỡ được (cộng đồng tự do phát triển)
adapters/        nối hạ tầng / hệ thống ngoài, tuỳ chọn (cell, wordpress, oidc, nats, redis, einvoice…)
contracts/       bản máy đọc của ba lớp kiểm soát: domain · commands · events · compliance · extensions
db/              migrations (SQL, bất biến khi đã phát hành) · seeds
templates/       starter-module
presets/         gói cài nhanh theo ngành
infrastructure/  cấu hình vận hành: monitoring, backup (PITR)
tests/           conformance (bộ kiểm hợp đồng dùng chung) · kernel
docs/            architecture · contracts · rules · standard · adr · ops
```

Chuyển dần theo PHASES, không đổi chỗ hàng loạt một lần:
- `packages/kernel`: PHASES 2.3, sau 2.1;
- `packages/events`: G2-05;
- `contracts/`: khi tách bản máy đọc ra khỏi `docs/contracts/*.schema.json`.

## Hệ quả

- **Được:** ít thư mục gốc; ba lớp kiểm soát có chỗ đặt rõ; không gói nào hút truy vấn của gói khác; bộ kiểm cộng đồng và CI là một.
- **Mất / chấp nhận:** đường dẫn khác với đề xuất ban đầu (`packages/kernel` thay `core/`, `db/` thay `database/`). Bảng ánh xạ ở trên là chỗ tra.
- **Việc phải làm:** cập nhật TARGET-LAYOUT (cây + `contracts/` 5 thư mục con); danh mục sự kiện sinh tự động (Phase 3, cùng `events.subscribe`).

## Phương án đã cân nhắc

1. **Theo đúng cây đề xuất.** Tên rõ nghĩa với người mới. Nhưng tách Kernel thành 4 gói, thêm thư mục gốc cho sự kiện và cho truy vấn chung, và phải đổi `db/` hàng loạt. Loại.
2. **Giữ nguyên TARGET-LAYOUT, bỏ qua đề xuất.** Bỏ lỡ hai ý tốt: `contracts/` theo ba lớp kiểm soát, và danh mục sự kiện / ma trận pháp lý trong tài liệu. Loại.
3. **Nhận ý, gộp theo tiêu chí lean (quyết định này).**
