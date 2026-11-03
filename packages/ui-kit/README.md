# @bizcity/ui-kit — Bộ giao diện cho module
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — README gói: vai trò, cách dùng, lệnh -->

**Mặt tiền duy nhất** phần web của module được import: khung trang, ô lỗi, trường, hộp thoại, tiền, client API có phiên đăng nhập. Bản thật do khung giao diện `apps/web` cung cấp lúc khởi động (`provideUiKit`).

## Dùng thế nào

- Màn của module chỉ import `@bizcity/ui-kit` và `react`. **Không** import nội bộ `apps/web`.
- Danh sách thành phần và chữ ký: chú thích đầu tệp `src/index.tsx`.
- Gọi API của module: `/api/v1/m/<key>/…` bằng `useApi()`.

## Lệnh

```bash
npm run typecheck -w @bizcity/ui-kit
```

Gói không có bước dựng riêng: `apps/web` biên dịch cùng.
