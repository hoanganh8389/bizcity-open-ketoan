# @bizcity/cli — lệnh `bizcity`
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — README gói: lệnh, nguồn sự thật, test -->

Một cửa lệnh cho developer. **CLI không giữ luật riêng**: mỗi lệnh gọi lại công cụ sẵn có của repo (bộ kiểm chuẩn, hàm của `@ketoan/contracts`, API của đơn vị). Thiếu bản dựng hoặc máy chủ thì báo **SKIP** kèm lý do, không bao giờ coi là PASS.

Chạy ở gốc repo: `npx bizcity <lệnh>`. Chưa `npm install` thì dùng `node packages/cli/bin/bizcity.mjs <lệnh>`.

## Lệnh

| Lệnh | Làm gì | Cần |
|---|---|---|
| `module new <key>` | Sinh `modules/<key>/` từ `templates/starter-module` | — |
| `module check <key>` | Luật module, kế toán (tĩnh), typecheck, test hợp đồng | `npm ci`, CSDL test |
| `module accounting-check <key>` | Module không đụng bảng sổ, không số tài khoản, `docType` / `docKey` đúng hợp đồng; chứng từ mẫu qua `event check` | — (mẫu cần máy chủ) |
| `event check <tệp.json>` | Khuôn, tổng tiền, tiền kiểm, bút toán thử | máy chủ cho tiền kiểm và bút toán |
| `flow check --sku --period [--to]` | Luồng mua → kho → bán → giá vốn → lãi lỗ → đóng kỳ, sổ kho ↔ sổ cái | máy chủ |
| `explain <MÃ>` | Nghĩa, vì sao, ai sửa, theo vai | — |
| `skills install [--to]` | Chép skill kế toán cho AI | — |
| `migrate`, `ledger verify`, `doctor` | Migration, toàn vẹn sổ, kiểm môi trường | CSDL |

Máy chủ: `BIZCITY_SERVER` + `BIZCITY_API_KEY`, hoặc `--server` / `--key`. Mã thoát: `0` PASS, `1` FAIL, `2` SKIP hoặc lỗi dùng lệnh. Chi tiết cách đọc kết quả: [docs/core/02](../../docs/core/02-cong-cu-kiem.md).

## Bên trong

| Tệp | Lệnh |
|---|---|
| `bin/bizcity.mjs` | điều phối, trợ giúp |
| `lib/sources.mjs` | nạp nguồn sự thật (bản dựng contracts, kernel; danh mục F22; `diag-codes.json`) |
| `lib/event-check.mjs`, `lib/flow-check.mjs`, `lib/explain.mjs` | `event check`, `flow check`, `explain` |
| `lib/module-accounting.mjs`, `lib/gates.mjs` | `module accounting-check`, cổng chờ (sản xuất) |
| `lib/skills-install.mjs` | `skills install` |

## Test

```bash
npm test -w @bizcity/cli      # node --test, không cần CSDL; một số ca bỏ qua khi chưa dựng contracts
```
