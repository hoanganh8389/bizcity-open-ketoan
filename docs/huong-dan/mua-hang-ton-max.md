# Tồn max (MH16)

**Tồn max** là mức hàng muốn có ở một shop hoặc một kho. Max quan trọng hơn min:
- **Shop** chỉ cần khai max.
- **Kho** cần khai max; min có cũng được.

Max luôn khai theo **chi nhánh – kho – mã hàng**, tính theo ĐVT nhỏ nhất (Lon, Hộp…). Max là gốc của:
- **Chuyển hàng xuống shop (MH19)**: shop dưới max thì được chia thêm.
- **Phân tích đặt hàng (MH02)**: tổng max kho + max shop, trừ tồn, ra số cần nhập.

## Xem theo chi nhánh / shop

1. Chọn **Chi nhánh cha**. Gõ mã hoặc tên để tìm (không cần dấu); cạnh tên có số shop và số shop đã ngừng.
2. Chọn nơi cần xem (ô gõ tìm):
   - **Kho chi nhánh** (dòng đầu, mang mã chi nhánh cha, vd `08000 · Kho chi nhánh`);
   - hoặc **một shop**. Shop đã ngừng xếp cuối danh sách, ghi chữ **ngừng**; cạnh mỗi shop là mã kho của nó.
3. **Phân kho**: luôn hiện kho của chi nhánh / shop đang xem (vd `08-HH`). Kho chi nhánh cha có nhiều kho thì chọn kho; shop thường chỉ có một kho cố định. Max khai theo từng kho.
   - **Gợi ý max chỉ ở kho chính**: kho lấy max của chi nhánh cha (mặc định, vd `08-HH`, đổi ở Công thức đặt hàng) và kho chuẩn của shop.
   - **Kho phụ** (kho khuyến mại `08-KM`…): không gợi ý, chỉ hiện mã đã có max / tồn ở kho đó. Khai tay (Thêm mã, Nhập Excel), để tồn max không bị tính trùng ở nhiều kho.
4. Mỗi mã một dòng; cột **Mã kho** đứng đầu bảng:

| Cột | Nghĩa |
|---|---|
| Mã kho | Kho của dòng (đúng kho đang chọn ở ô Phân kho) |
| Tồn | Tồn hiện tại ở kho đó |
| Bán / ngày | Chỉ có ở shop. Bán trung bình mỗi ngày, đo trong N ngày gần nhất (mặc định 7) |
| Tổng max shop | Chỉ có ở kho. Cộng max của mọi shop con |
| **Gợi ý max** | Shop = bán / ngày × số ngày cần đủ hàng (mặc định 7). Kho = tổng max shop + % dự phòng (mặc định 10%). Bấm vào số để dùng |
| **Tồn max / Tồn min** | Sửa ngay trên ô (ô sửa chuyển màu cam) |
| Thiếu so max | Max − tồn |
| Chuyển xuống shop | Cách làm tròn khi chia hàng: **Tự động** / **Nguyên thùng** / **Lẻ** |
| ⚙ | Cài riêng cho mã: số ngày đo bán, số ngày cần đủ hàng |

Sửa xong bấm **Lưu**. Muốn huỷ phần đang sửa thì bấm **Bỏ**.

## Khai nhanh

- **Gợi ý cho mã chưa có max**: điền gợi ý vào mọi dòng đang lọc mà chưa có max.
- **Áp gợi ý cho dòng đang lọc**: điền gợi ý cho mọi dòng đang hiện, ghi đè max đang có. Lọc trước rồi mới bấm.
- **+ Thêm mã**: khai max cho mã chưa có tồn, chưa có bán, ví dụ hàng sắp về.
- **Nhập Excel**: một tệp chứa được cả kho lẫn mọi shop. Các cột:
  - *Mã chi nhánh*
  - *Mã kho* (trống = kho mặc định)
  - *Mã hàng*
  - *Tồn max*
  - *Tồn min*

  Dòng nào đã có thì được cập nhật.
- **Xuất Excel** (nút trên bảng): xuất đúng những dòng đang thấy.

## Ô màu trên cùng (bấm để lọc)

- **Đang dưới max**: những mã sẽ được chia thêm hoặc đặt thêm.
- **Có bán, chưa có max**: nên khai max cho các mã này.
- **Max lệch gợi ý > 30%**: nên xem lại.

## Xem theo mã hàng

Chọn **Theo mã hàng** rồi gõ mã: một mã hiện ở kho chi nhánh cha và ở mọi shop (tồn, bán / ngày, gợi ý, max), sửa ngay trên bảng.

Từ form mặt hàng → thẻ *Mua hàng* → **Xem mọi shop (MH16)** cũng mở đúng màn này.

## Shop tự đăng ký max

Shop đăng ký lại max 2 lần / tháng ở **Phiếu đăng ký tồn max (MH17)**. Phiếu duyệt xong thì max được ghi vào đây, cột nguồn ghi *phiếu đăng ký*.
