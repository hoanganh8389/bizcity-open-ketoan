# 10. Thêm nhanh chi nhánh, phân kho ngay trên phiếu

<!-- [2026-11-11 Nguyễn Văn Thủy] ô chi nhánh có + thêm nhanh; ô phân kho lọc theo chi nhánh đang chọn, có + thêm phân kho (đóng góp) -->

Nguyên tắc: thiếu danh mục nào thì thêm ngay tại ô đang chọn, không phải thoát phiếu sang màn danh mục (như thêm nhanh khách hàng / NCC / mặt hàng). Phân quyền chi tiết tính sau.

## Người dùng thấy gì

- **Ô chi nhánh** trên form (chứng từ, danh mục — `BranchPicker` chọn chi nhánh đang dùng): nút **+** (hoặc **F9**, hoặc dòng "Thêm chi nhánh" cuối danh sách) mở hộp **Thông tin chi nhánh**; chữ đang gõ điền sẵn vào mã (gõ kiểu mã) hoặc tên. Ghi xong ô tự chọn chi nhánh vừa thêm. Ô chi nhánh ở bảng lọc báo cáo không có +.
- **Ô phân kho** (`ChonKho`): chỉ hiện kho đang dùng của chi nhánh đang chọn, tự chọn kho mặc định khi đổi chi nhánh; nút **+** mở hộp **Thông tin kho** điền sẵn chi nhánh. Ghi xong ô tự chọn kho mới.
- Phiếu mua (MH11): ô **Phân kho** và **Kho nhận hàng** (đơn đặt) chuyển sang `ChonKho` (trước là ô chọn không có +). Phiếu chuyển kho, phiếu hàng dùng `ChonKho` từ trước.

## Kỹ thuật

- `components/filters.tsx` `BranchPicker`: prop `addable` (mặc định = `activeOnly`), cần quyền `catalog:write`; mở `BranchForm` (export từ `features/catalog/BranchesPage.tsx`, thêm `onSaved(code)`), nạp lười.
- `components/phieu-hang/ChonKho.tsx`: `WarehouseForm` (`features/catalog/WarehousesPage.tsx`) với `onSaved`.
