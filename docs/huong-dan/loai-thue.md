# Loại thuế (ACC43)

| Ô | Ghi chú |
|---|---|
| Mã | **Phải trùng** mã thuế trên dòng hàng của chứng từ (`taxCode`), ví dụ R08, R05, R10, KCT |
| Chiều | Đầu ra (bán) hoặc đầu vào (mua) |
| Thuế suất | Phần trăm |
| Tài khoản thuế | Tài khoản ghi tiền thuế (đầu ra thường 33311; đầu vào 1331). Trống → dùng tài khoản ngầm định |
| Nhóm trên bảng kê | Hoá đơn được xếp vào nhóm nào trên bảng kê: Không chịu thuế, 0%, 5%, 8%, 10%, Không kê khai |

Khi thuế suất thay đổi theo chính sách (ví dụ giảm từ 10% xuống 8%), thêm loại thuế mới thay vì sửa loại cũ, để chứng từ cũ vẫn đúng.

## Màn hình

Lưới gồm: Mã thuế, Tên thuế, Thuế, Tài khoản. Nút "Cột" bật thêm Chiều, Nhóm bảng kê, Ngừng dùng. Thanh nút: Thêm · Sửa (hoặc bấm đúp) · Xoá · Nạp · Xuất. Chỉ xoá được loại thuế chưa dùng trên sổ và chưa gán cho mặt hàng nào.

## Căn cứ pháp lý

Luật Thuế GTGT 48/2024/QH15; thuế suất 8%: Nghị quyết 204/2025/QH15 và Nghị định 174/2025/NĐ-CP, áp dụng đến hết 31/12/2026. Xem thêm màn **Căn cứ pháp lý** (TI11), trang *Hoá đơn và thuế GTGT*.
