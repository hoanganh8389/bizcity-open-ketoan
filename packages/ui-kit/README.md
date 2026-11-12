# @bizcity/ui-kit — Bộ giao diện cho module
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — README gói: vai trò, cách dùng, lệnh -->

**Mặt tiền duy nhất** phần web của module được import: khung trang, ô lỗi, trường, hộp thoại, tiền, client API có phiên đăng nhập. Bản thật do khung giao diện `apps/web` cung cấp lúc khởi động (`provideUiKit`).

## Dùng thế nào

- Màn của module chỉ import `@bizcity/ui-kit` và `react`. **Không** import nội bộ `apps/web`.
- Danh sách thành phần và chữ ký: chú thích đầu tệp `src/index.tsx`.
- Gọi API của module: `/api/v1/m/<key>/…` bằng `useApi()`.
<!-- [2026-11-12 10:20 PM Võ Hoàng] POS-UIKIT — 1.4.0-draft §3b (đóng góp) -->
- Màn danh sách / báo cáo (1.4.0-draft, [BIZCITY-EXTENSION §3b](../../docs/contracts/BIZCITY-EXTENSION-v1.md)): `DataGrid` (lọc / sắp xếp / tổng cột / Xuất Excel chuẩn), `KpiCards`, `FilterLayout` + `PeriodField` + `BranchCheckList` (bảng tham số bên trái, bộ tham số đã lưu), `ItemPicker`, `BranchPicker`, `useApi().getPage` (đọc kèm meta: trang, tổng của cả kết quả lọc) — chính là thành phần của màn Core, chữ ký ở `src/grid.tsx`.

## Lệnh

```bash
npm run typecheck -w @bizcity/ui-kit
```

Gói không có bước dựng riêng: `apps/web` biên dịch cùng.
