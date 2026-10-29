# Cơ sở dữ liệu (db/)

Khu của **người phụ trách cơ sở dữ liệu**. Mọi phân hệ (Kế toán, Mua hàng, Bán hàng, Kho…) dùng chung **một** PostgreSQL; cấu trúc bảng chỉ đổi ở đây.

| Thư mục | Nội dung |
|---|---|
| `migrations/0001_goc_…` → `0009_goc_…` | **Cấu trúc gốc** chia theo mảng: nền tảng, danh mục, cấu hình định khoản, kỳ kế toán, chứng từ, sổ cái, kho & bán hàng, thuế, tài sản. Đọc file của mảng nào là biết mảng đó có bảng gì. |
| `migrations/0010_…` trở đi | Thay đổi mới, theo số thứ tự. Mỗi bảng, cột mới có `COMMENT ON`. |
| `seeds/` | Dữ liệu gốc: hệ thống tài khoản (`tai-khoan.csv`), loại thuế, lý do, danh mục chuẩn (JSONL)… |

## Chạy

| Cách | Lệnh |
|---|---|
| Docker (máy chủ, máy dev) | `docker compose up db-migrate` — job áp migration chưa chạy + seed rồi thoát. `docker compose up -d` tự chạy job này trước khi bật API. |
| Dòng lệnh (dev) | `npm run db:migrate -w @ketoan/api` · `npm run db:seed -w @ketoan/api` |
| Xem nhật ký | `docker compose logs db-migrate` |

API trong Docker **không tự đổi cấu trúc DB** (`AUTO_MIGRATE=0`): còn migration chưa áp thì API không khởi động, báo chạy job db-migrate. Chạy dev trên máy (`npm run dev`) thì API tự áp như cũ.

## Cấu trúc gốc (23/10/2026)

67 migration lịch sử (`0001_nen_tang` … `0067_danh_muc_hang_chuan`, tra lại trong lịch sử git) được gộp thành 9 file gốc `000x_goc_*.sql`, sinh bằng `pg_dump --schema-only` từ một cơ sở dữ liệu chạy đủ 67 file cũ — đã đối chiếu: cấu trúc giống hệt.

- Cơ sở dữ liệu **mới**: chạy 9 file gốc là đủ bảng.
- Cơ sở dữ liệu **đang chạy** (máy chủ, máy anh em — đã áp tới `0067`): trình chạy migration chỉ **ghi nhận** 9 file gốc, không chạy lại (`apps/api/src/db/migrate.ts`, `BASELINE`). Đang dở giữa chừng (chưa tới `0067`) thì dừng, báo cập nhật bằng bản trước.
- Khoá ngoại, bảng ảo, trigger tham chiếu bảng của mảng sau nằm ở file của mảng sau (chạy theo số thứ tự là đúng).

## Luật

1. **Không sửa file migration đã chạy ở máy chủ thật** (kể cả 9 file gốc) — muốn đổi thì thêm file mới số kế tiếp (`0010_mo_ta.sql`…).
2. Mỗi file chạy trong một giao dịch; lỗi thì dừng, không ghi nhận (bảng `schema_migrations`). Khoá `pg_advisory_lock(727001)` chặn hai nơi chạy cùng lúc.
3. Thêm bảng: viết `COMMENT ON TABLE/COLUMN`, khai kiểu ở `apps/api/src/db/types.ts`, thêm giải thích ở `apps/api/src/modules/system/schema-catalog.ts` (test `db-rules` bắt buộc).
4. Chi tiết quy ước tên bảng, cột: `docs/co-so-du-lieu.md`.
