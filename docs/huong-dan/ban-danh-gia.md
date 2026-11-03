# Bàn đánh giá (HT08)
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — hướng dẫn màn HT08 (trước đây nút Hướng dẫn hiện "Chưa có hướng dẫn"); viết theo apps/web/src/features/system/ReviewBoardPage.tsx -->

Bàn đánh giá là **checklist các tình huống lỗi thường gặp**, xếp theo vai người rà, mỗi cảnh báo kèm cách khắc phục cụ thể. Nguồn là tự chẩn đoán của đơn vị và danh mục tình huống lỗi F22. Màn **chỉ đọc**: không có nút sửa sổ, tắt kiểm hay bỏ qua.

## Chọn vai

| Vai | Dùng khi |
|---|---|
| **Kế toán trưởng** | Rà định kỳ, trước khi khoá kỳ |
| **Kiểm soát / ban kiểm soát** | Rà độc lập; xem thêm các lần người dùng đã xác nhận cảnh báo |
| **Thanh tra thuế — tự rà trước** | Tự rà trước khi cơ quan thuế làm việc |

Đổi vai thì danh sách ca và ca ưu tiên đổi theo.

## Đọc kết quả

Dải đầu đếm số ca theo trạng thái:

| Trạng thái | Nghĩa |
|---|---|
| ✘ **Lỗi** | Sổ có chỗ sai, cần xử lý |
| ⚠ **Cảnh báo** | Cần xem và quyết định |
| ✔ **Đạt** | Kiểm không thấy vấn đề |
| ⛔ **Chặn đúng** | Phần mềm đã chặn đúng tình huống này |
| ○ **Chưa kiểm được** | Chưa có cách kiểm trên bản cài. **Không tính là đạt** |
| ↗ **Kiểm ở màn khác** | Xem ở màn được chỉ |

Ô **Chỉ hiện việc cần làm** (bật sẵn) chỉ giữ ca Lỗi và Cảnh báo. Bỏ tick để xem cả ca đã đạt. Ca xếp theo nhóm (kho, thuế, cuối kỳ, công nợ, tiền…); nhóm có việc hiện số việc.

## Xử lý một ca

Bấm **Cách khắc phục** ở ca có Lỗi hoặc Cảnh báo. Mở ra bốn khối:

1. **Hiện tượng**: mẫu chỗ bị lỗi (vd chi nhánh, mặt hàng, tháng).
2. **Vì sao**: hậu quả nếu để nguyên.
3. **Cách khắc phục**: các bước, màn cần mở, ai làm. Không bao giờ là sửa thẳng sổ.
4. **Kiểm lại**: bấm **Kiểm lại &lt;mã&gt;** sau khi sửa. Màn chạy lại đúng mã đó và báo ngay kết quả mới. Ca không có mã kiểm thì mở lại màn ở bước cuối để xem.

Nút **Kiểm lại tất cả** ở đầu màn kiểm lại toàn bộ.

## In biên bản

Nút **In biên bản** in **Biên bản tự rà** theo vai đang chọn: tên đơn vị, lúc in, nguồn dữ liệu, bảng mọi ca (mã, nội dung, trạng thái, phương án) và chỗ ký cho người lập, kế toán trưởng, trưởng ban kiểm soát.

## Lưu ý

- Vai **Kiểm soát** có thêm bảng **Các lần xác nhận cảnh báo gần đây**: ai đã chọn tiếp tục khi còn cảnh báo, chứng từ hoặc kỳ nào, mã cảnh báo, lý do. Đây là bằng chứng, không phải lỗi.
- Đọc câu miễn trừ cuối màn: biên bản tự rà không phải kết luận của cơ quan nhà nước.
- Muốn xem đơn vị đáp ứng bộ quy định tới đâu, dùng [Kiểm chuẩn](kiem-chuan.md) (HT06).
