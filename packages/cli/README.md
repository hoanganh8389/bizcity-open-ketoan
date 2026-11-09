# @bizcity/cli — lệnh `bizcity`
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — README gói: lệnh, nguồn sự thật, test -->
<!-- [2026-11-06 11:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-30b: evidence verify (ADR-0030) -->
<!-- [2026-11-08 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-50: lệnh library (thư viện dùng chung bizcity_library@1) -->

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
| `library list` · `library search <từ khoá> [--lib] [--at]` | Thư viện dùng chung (`libraries/*`): phiên bản, số mục, đã đối chiếu; tìm mã theo mã / tên / bí danh, giá trị tại ngày | — (ngoại tuyến) |
| `library check <id> <giá trị | {json} | @tệp>` | Kiểm ô nhập bằng bộ kiểm của Core (`core.library.validate`). Mã thoát riêng: `0` PASS · `1` FAIL · `2` SKIP · `3` WARN | máy chủ (có cấu hình đơn vị), hoặc bản dựng `@bizcity/platform` |
| `library new <id> --kind --title --source` | Khung `libraries/<id>/` (library.json đã đóng dấu, README) qua SC-LIB-1 ngay | — |
| `library diff <id> [--base origin/main]` | Thay đổi so với main, bản cần lên (major / minor / patch) so với bản đã khai, lỗi khuôn SC-LIB-1 | git |
| `skills install [--to]` | Chép skill kế toán cho AI | — |
| `migrate`, `ledger verify`, `doctor` | Migration, toàn vẹn sổ, kiểm môi trường | CSDL |
| `evidence verify --dir <thư mục>` | Bản niêm phong bằng chứng của một đơn vị (`DATA_DIR/bang-chung/<đơn vị>`): băm tệp, băm từng dòng, manifest nối ngày ([ADR-0030](../../docs/adr/ADR-0030-ban-niem-phong-bang-chung.md)); chiều CSDL ở `GET /api/v1/evidence/verify` | — (chỉ thư mục) |

Máy chủ: `BIZCITY_SERVER` + `BIZCITY_API_KEY`, hoặc `--server` / `--key`. Mã thoát: `0` PASS, `1` FAIL, `2` SKIP hoặc lỗi dùng lệnh. Chi tiết cách đọc kết quả: [docs/core/02](../../docs/core/02-cong-cu-kiem.md).

## Bên trong

| Tệp | Lệnh |
|---|---|
| `bin/bizcity.mjs` | điều phối, trợ giúp |
| `lib/sources.mjs` | nạp nguồn sự thật (bản dựng contracts, kernel; danh mục F22; `diag-codes.json`) |
| `lib/event-check.mjs`, `lib/flow-check.mjs`, `lib/explain.mjs` | `event check`, `flow check`, `explain` |
| `lib/module-accounting.mjs`, `lib/gates.mjs` | `module accounting-check`, cổng chờ (sản xuất) |
| `lib/skills-install.mjs` | `skills install` |
| `lib/library.mjs` | `library …` (luật khuôn / băm / đóng dấu lấy từ `scripts/thu-vien/thu-vien.mjs`, kiểm ô lấy từ engine của platform) |

## Test

```bash
npm test -w @bizcity/cli      # node --test, không cần CSDL; một số ca bỏ qua khi chưa dựng contracts
```
