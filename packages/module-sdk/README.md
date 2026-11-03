# @bizcity/module-sdk — SDK cho module
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — README gói: lối vào cho dev viết module, lệnh, giới hạn -->

**Mặt tiền duy nhất** module được import từ Bizcity: `defineModule`, `defineAction`, `defineSubscriber`, kiểu `ctx`, `Errors`, `z`, tiền. Phần web: `@bizcity/module-sdk/web` (`defineWebModule`). Không mở `db`, bảng Kernel, `ledgerService`, `postDocumentIn`, `eventStore`.

Tài liệu đầy đủ của API: [API.md](API.md).

## Bắt đầu một module

```bash
npx bizcity module new <key> --label "Tên" --code XX   # sinh modules/<key>/ từ templates/starter-module
npx bizcity module check <key>                         # manifest, luật, typecheck, test hợp đồng
```

Đọc `modules/<key>/AGENTS.md` sau khi sinh. Hợp đồng: [BIZCITY-MODULE-v1](../../docs/contracts/BIZCITY-MODULE-v1.md). Lệnh kiểm riêng phần kế toán của module (`module accounting-check`, mã AC-1..6) đang làm ở [PHASE-027](../../docs/phases/PHASE-027-CORE-KE-TOAN-CHO-DEV/README.md) CK-1, chưa có trên `main`. <!-- [2026-11-03 10:34 PM Johnny Chu - Chu Hoàng Anh] FLOW — README chỉ nói lệnh đang có trên main -->

## Tiền vào sổ

- Gửi chứng từ qua `ctx.ledger.submit({ docType, docKey: '<key>:…', … })`, khai `docType` ở `ledger.submits` của `bizcity.module.json`.
- Phiếu kế toán của module (phân bổ, trích trước, chi phí lương): `manual_journal`, dòng chỉ có lý do và số tiền ([hướng dẫn](../../docs/api/15-phieu-ke-toan-module.md)).
- Đọc sổ: `ctx.ledger.query` hoặc khung nhìn `bizcity_read.*`.

## Năng lực

Mỗi API trỏ tới một năng lực trong [`bizcity-standard.json`](../../docs/standard/bizcity-standard.json). Năng lực `planned` có kiểu nhưng runtime ném `CAPABILITY_MISSING`; khai năng lực dùng tới ở `requires.capabilities`.

## Lệnh

```bash
npm run build -w @bizcity/module-sdk
npm run typecheck -w @bizcity/module-sdk
```
