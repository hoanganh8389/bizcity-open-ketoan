# Bảng giá bán (DM14)

Danh sách bảng giá của công ty và **chi nhánh nào áp bảng giá nào**. Đây là nơi duy nhất khai việc này. Các website cửa hàng tự kéo về vài phút một lần.

## Cửa hàng nhận bảng giá thế nào

```
Bảng giá  →  gán cho chi nhánh (DM02)  →  website cửa hàng có cùng mã chi nhánh  →  bán theo bảng giá đó
```

- Mỗi website cửa hàng đã nối sẵn với **một mã chi nhánh** (cũng là mã chi nhánh trên chứng từ gửi sang kế toán). Gán bảng giá cho chi nhánh nào thì website của chi nhánh đó dùng bảng giá ấy.
- Mỗi chi nhánh áp **một** bảng giá. Gán chi nhánh sang bảng giá mới thì nó tự rời bảng giá cũ (form có ghi "đang ở … (sẽ chuyển sang đây)").
- Chi nhánh **chưa gán** bảng giá nào → dùng **bảng giá công ty**.
- Chi nhánh chưa có ở DM02 thì không gán được: thêm chi nhánh ở DM02 trước, mã phải trùng mã website cửa hàng.

## Luật lấy giá khi bán

| Loại hàng | Thứ tự lấy giá |
|---|---|
| Hàng chính | Chỉ **bảng giá công ty**, không lấy giá chi nhánh. |
| Hàng thường | **Bảng giá chi nhánh** của cửa hàng → không có thì bảng giá công ty. |

Đánh dấu hàng chính ở form mặt hàng (DM10, thẻ Trạng thái).

## Thao tác

| Việc | Cách làm |
|---|---|
| Thêm bảng giá | Bấm **Thêm**, nhập Mã bảng giá, Tên bảng giá, tích các chi nhánh áp dụng, bấm **Ghi**. |
| Đổi bảng giá công ty | Sửa bảng giá muốn làm bảng giá công ty, tích **Bảng giá công ty**. Chỉ có **một** bảng giá công ty, bảng cũ tự thành bảng giá thường. |
| Gán / gỡ chi nhánh | Sửa bảng giá, tích / bỏ tích chi nhánh. Ô tìm và nút **Chọn hết đang hiện** / **Bỏ hết đang hiện** giúp chọn nhanh theo tỉnh. |
| Ngừng bảng giá | Bỏ tích **Đang dùng**. |
| Xoá bảng giá | Chỉ xoá được bảng giá không phải bảng giá công ty và đã gỡ hết chi nhánh. Giá đã khai ở bảng đó bị xoá theo. |

Cột **Số ô giá** = số ô đã khai giá ở bảng giá đó, để biết bảng giá nào còn trống.

## Giá theo mặt hàng (phần dưới)

Bấm chọn một bảng giá ở lưới trên, phần dưới hiện **mọi mặt hàng × đơn vị tính** của bảng giá đó, kể cả ô chưa khai giá.

| Cột | Ghi chú |
|---|---|
| Mã hàng, Tên hàng, ĐVT, Tỉ lệ, Bán chính | Lấy từ khai báo mặt hàng (DM10). Thiếu ĐVT thì bấm đúp dòng để mở mặt hàng, thêm ĐVT. |
| Giá công ty | Hiện khi đang xem bảng giá chi nhánh, để so. |
| Giá <bảng giá> | **Gõ thẳng vào ô** để sửa. Ô đang sửa tô vàng. Xoá trắng ô = bỏ giá. |
| Hàng chính | Ô giá chi nhánh của hàng chính tô mờ: cửa hàng chỉ bán hàng chính theo giá công ty, giá chi nhánh không dùng. |

- Nút **Tất cả / Đã có giá / Còn trống / Đang sửa** lọc nhanh. Ô lọc trên đầu từng cột lọc theo mã, tên, ĐVT… như mọi lưới.
- **Điền theo tỉ lệ**: với các mặt hàng đang hiện, ô trống = giá ĐVT đã có ÷ tỉ lệ × tỉ lệ cần (vd Lon 450.000 → Thùng 24 = 10.800.000). Điền xong vẫn phải bấm Ghi giá.
- Sửa xong bấm **Ghi giá (n ô)**, hoặc **Bỏ sửa** để huỷ. Cửa hàng nhận giá mới sau vài phút.
- **Xuất Excel** để gửi duyệt giá / đối chiếu.
- Giá cũng sửa được trong form mặt hàng (DM10 → thẻ ĐVT & giá bán), hai nơi là một dữ liệu.
