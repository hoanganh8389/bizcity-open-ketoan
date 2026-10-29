# CI/CD

> **Tệp chạy:** [../../.github/workflows/ci.yml](../../.github/workflows/ci.yml) · **Luật:** [R-QG](../rules/RULE-QUALITY-GATE.md)

## 1. Đường ống

```
PR / push main
  ├─ job guard      (≈10 giây, không cần CSDL)
  │    • số migration không trùng                       R-DB-3
  │    • không ghi bảng nhân ngoài module sở hữu         R-LEDGER-4, R-EVENT-2, R-BOUND-2
  │    • cờ thoát trigger chỉ ở chỗ cho phép             R-LEDGER E1–E3
  │    • không test .only / .skip mới                    R-QG-8
  ├─ job typecheck  npm ci → npm run typecheck           (contracts, api, web)
  ├─ job test       PostgreSQL 16 service → db:migrate → npm test
  │                 → tải lên artefact test-report.json  (bằng chứng R-QG-6)
  └─ workflow conformance (.github/workflows/conformance.yml, ADR-0006)
       ├─ selfcheck    --self-test → --lane selfcheck --strict   (không cần npm ci; bảng điểm vào trang tóm tắt)
       └─ diagnostics  npm ci → db:seed → npm test → --lane diagnostics (toàn vẹn sổ trên dữ liệu test)
merge main
  └─ (Giai đoạn 3) build image có nhãn → registry → triển khai bản test bằng cap-nhat.sh
tag vX.Y.Z
  └─ (Giai đoạn 3) phát hành: image + CHANGELOG + bảng tương thích hợp đồng
```

## 2. Quy tắc grep canh ranh giới

Viết ở [`scripts/kiem-chuan.sh`](../../scripts/kiem-chuan.sh) (chạy được trên máy dev: `bash scripts/kiem-chuan.sh`); bước `guard` của `ci.yml` gọi script này. Mỗi quy tắc in **tệp:dòng** vi phạm rồi trả lỗi.

| Quy tắc | Mẫu tìm | Được phép ở |
|---|---|---|
| Ghi sổ cái | `insertInto\('ledger_` · `updateTable\('ledger_` · `INSERT INTO ledger_` | `apps/api/src/modules/ledger/` |
| Ghi sự việc | `insertInto\('(accounting_events\|accounting_event_versions\|posting_log)'\)` | `apps/api/src/modules/documents/` |
| Gọi thẳng ledger | `ledgerService\.(post\|reverse)\(` | `modules/{ledger,posting,documents}` + **danh sách nợ** (vouchers, closing, assets, inventory) — xoá dần ở Giai đoạn 1 |
| Cờ thoát trigger | `cost_overwrite` · `allow_ledger_purge` · `session_replication_role` | lần lượt: `db/migrations/` + `modules/ledger/` + test · `db/migrations/` + test · `scripts/xoa-chung-tu.sh` + test (chứng minh vai trò ứng dụng không đặt được) |
| Trùng số migration | `ls db/migrations \| cut -c1-4 \| uniq -d` | — **chặn** (đã sửa `0028` trùng ngày 2026-10-30: `0028_thue_kkkn` → `0031`, ghi nhận qua `RENAMED` trong `db/migrate.ts`) |

Danh sách nợ đặt trong biến `DEBT_LEDGER_CALLERS` ở đầu script; xoá phần tử nào thì quy tắc tự chặt lại.

## 3. Môi trường test trong CI

| Biến | Giá trị |
|---|---|
| `DATABASE_URL` | `postgres://ketoan:ketoan@localhost:5432/ketoan` (service container) |
| `NODE_ENV` | `test` |
| `JWT_SECRET` | chuỗi giả ≥ 32 ký tự |
| `ENABLED_MODULES` | `*` |

`vitest` chạy tuần tự từng tệp (`fileParallelism: false`), mỗi tệp tạo đơn vị riêng.

## 4. Nhánh và duyệt

| Quy tắc | |
|---|---|
| Nhánh chính | `main` — được bảo vệ: cần CI xanh + duyệt theo CODEOWNERS |
| Đụng nhân (T0) | 2 người duyệt, 1 thuộc nhóm Lõi |
| Commit | Tiếng Việt hoặc Anh, một ý một commit; PR theo [../../.github/PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md) |
