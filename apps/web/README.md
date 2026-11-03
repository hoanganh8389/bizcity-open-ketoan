# @ketoan/web — Giao diện web
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — README ứng dụng: cấu trúc, nút Hướng dẫn, lệnh -->

Giao diện web phần mềm kế toán (React + Vite). Cung cấp bản thật của [`@bizcity/ui-kit`](../../packages/ui-kit/README.md) cho màn của module (`provideUiKit`).

## Cấu trúc `src/`

| Thư mục | Có gì |
|---|---|
| `phan-he/` | Menu và màn theo phân hệ; mỗi mục menu có `key`, `path`, mã màn (`code`), quyền |
| `features/` | Màn dùng chung (vd `features/system/`: Kiểm chuẩn, Hồ sơ kế toán, Bàn đánh giá) |
| `components/`, `layout/`, `lib/` | Thành phần, khung trang, tiện ích (API, phiên, định dạng) |
| `help/` | Nút **Hướng dẫn** của mỗi màn |
| `pages.tsx` | Bảng định tuyến |

## Nút Hướng dẫn

`help/guides.ts` nạp mọi tệp `docs/huong-dan/<khoá>.md`; khoá là **`key` của mục menu**. Màn mới phải có tệp hướng dẫn cùng khoá, không thì nút hiện "Chưa có hướng dẫn". Phép kiểm `SC-DOC-6` (báo mục menu thiếu hướng dẫn) đã chốt thiết kế ở [RULE-QUALITY-GATE](../../docs/rules/RULE-QUALITY-GATE.md), mã đang làm ở PHASE-027 CK-2, chưa có trên `main`.

## Lệnh

```bash
npm run dev -w @ketoan/web
npm run build -w @ketoan/web
npm run typecheck -w @ketoan/web
```
