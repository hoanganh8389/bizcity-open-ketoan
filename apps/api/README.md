# @ketoan/api — API phần mềm kế toán
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — README ứng dụng: cấu trúc, tài liệu API, lệnh, test -->

Ứng dụng Fastify: nhận chứng từ, định khoản, sổ cái, báo cáo. Ghép [`@bizcity/kernel`](../../packages/kernel/README.md), [`@bizcity/platform`](../../packages/platform/README.md), các phân hệ nghiệp vụ và module.

## Cấu trúc `src/`

| Thư mục | Có gì |
|---|---|
| `app.ts`, `main.ts` | Dựng ứng dụng (đăng ký route, tự chẩn đoán, Swagger), khởi động |
| `phan-he/` | Phân hệ nghiệp vụ: `ban-hang`, `mua-hang`, `kho`, `quy`, `tai-san`, `thue`, `ke-toan`, `he-thong`, `api` |
| `modules/` | Thành phần dùng chung của ứng dụng (danh mục, báo cáo kho, tham chiếu chứng từ…) |
| `addins/` | Tiện ích gắn thêm: `excel-export`, `spreadsheet-ai`, `tro-ly` |
| `core/` | Runtime ở mức ứng dụng (action, chứng từ, sự kiện, workflow) |
| `kernel/public.ts`, `db/{types,client,migrate}.ts` | **Tệp chuyển tiếp**: mã đã dời sang `@bizcity/kernel`, `@bizcity/platform`. Mã mới import thẳng gói |
| `db/setup.ts` | Điểm vào job `db-migrate` (Docker): áp migration còn thiếu, seed dữ liệu gốc (chạy lại an toàn), rồi thoát; API chỉ khởi động sau job này |
| `cli/module.ts` | Lệnh `npm run module` (migrate, sync module) |

## Tài liệu API

- Mọi route, thử trên trình duyệt: `https://<máy chủ>/api/docs` (Swagger, sinh từ khuôn zod).
- Gửi chứng từ từ hệ thống ngoài: [docs/api/](../../docs/api/README.md).

## Lệnh

```bash
npm run dev -w @ketoan/api         # chạy phát triển
npm run build -w @ketoan/api
npm run db:migrate -w @ketoan/api
npm run db:seed -w @ketoan/api
npm test -w @ketoan/api            # vitest, cần PostgreSQL: docker compose up -d db
```

Test nằm ở `apps/api/test/`. Cách dựng máy dev và CSDL test: [docs/phat-trien.md](../../docs/phat-trien.md).
