# @bizcity/kernel — Accounting Kernel
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — README gói: bề mặt công khai, thành phần, luật, lệnh -->

Lõi ghi sổ của Bizcity Core: cửa nạp sự việc, định khoản, sổ cái chỉ thêm, kỳ, sổ phụ công nợ và kho, thuế, kết chuyển. Thuộc trụ cột I (sổ cái bất biến) và V (chính sách, chế độ kế toán có phiên bản) trong [bảng trụ cột](../../docs/standard/tru-cot.json).

## Dùng thế nào

- Bề mặt công khai duy nhất là gốc gói: `import { … } from '@bizcity/kernel'` (`src/index.ts`).
- Đường con `@bizcity/kernel/*` chỉ dành cho test của Core. Ngoài Kernel **không** import đường con (`SC-KERNEL-6`), **không** đọc thẳng bảng `ledger_*` (`SC-KERNEL-7`): đọc qua khung nhìn `bizcity_read.*`.
- Module **không** dùng gói này: module đi qua [`@bizcity/module-sdk`](../module-sdk/README.md).

## Bên trong `src/modules/`

| Nhóm | Module |
|---|---|
| Cửa nạp, chứng từ | `intake` (tiền kiểm, bể chờ), `documents` (một cửa ghi sự việc) |
| Định khoản | `posting` (luật định khoản theo `docType`), `posting-config`, `accounts`, `tax-codes` |
| Sổ, kỳ | `ledger` (sổ cái chỉ thêm), `vouchers`, `periods` (khoá kỳ, bảng kiểm), `closing` (kết chuyển) |
| Sổ phụ, thuế | `debts`, `inventory` (giá vốn bình quân tháng), `tax-invoices`, `tax-info` |
| Kiểm | `conformance` (Kiểm chuẩn), `review` (danh mục tình huống lỗi F22, Bàn đánh giá) |
| Dữ liệu mặc định | `default-data`; seed hệ thống tài khoản, lý do ở `src/db/seed.ts` |

Mỗi module có `*.diagnostics.ts` (tự chẩn đoán) thì có bản cùng mã ở lane `tests/conformance/diagnostics/` (R-DIAG-9).

## Luật

- [RULE-KERNEL](../../docs/rules/RULE-KERNEL.md): thành phần nào thuộc Kernel, mức thay đổi.
- [RULE-LEDGER](../../docs/rules/RULE-LEDGER.md): sổ chỉ thêm, sửa là đảo.
- [ADR-0001](../../docs/adr/ADR-0001-mot-cua-su-viec.md): một cửa sự việc.

## Lệnh

```bash
npm run build -w @bizcity/kernel
npm run typecheck -w @bizcity/kernel
```

Test của Kernel nằm ở `apps/api/test/`, cần PostgreSQL (`docker compose up -d db`, xem [phát triển](../../docs/phat-trien.md)).
