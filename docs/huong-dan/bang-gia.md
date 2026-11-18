# Bảng giá bán (DM14)

Danh sách bảng giá của công ty và **chi nhánh nào áp bảng giá nào**. Đây là nơi duy nhất khai việc này. Các website cửa hàng tự kéo về vài phút một lần.

## Cửa hàng nhận bảng giá thế nào

```
Bảng giá  →  gán cho chi nhánh (DM02)  →  website cửa hàng có cùng mã chi nhánh  →  bán theo bảng giá đó
```

- Mỗi website cửa hàng đã nối sẵn với **một mã chi nhánh** (cũng là mã chi nhánh trên chứng từ gửi sang kế toán). Gán bảng giá cho chi nhánh nào thì website của chi nhánh đó dùng bảng giá ấy.
- Mỗi chi nhánh áp **một** bảng giá. Gán chi nhánh sang bảng giá mới thì nó tự rời bảng giá cũ (form có ghi "đang ở … (sẽ chuyển sang đây)").
- Chi nhánh **chưa gán** bảng giá nào → dùng **bảng giá công ty**. Lưới hiện các chi nhánh này ở cột *Chi nhánh áp dụng* của bảng giá công ty, kèm chữ **(chưa gán)**.
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
| Gán / gỡ chi nhánh | Sửa bảng giá, tích / bỏ tích ở mục **Chi nhánh áp dụng**. Đơn vị có sơ đồ tổ chức (DM16): chọn trên **cây** — tích một nhóm (miền, chi nhánh, tỉnh…) là chọn mọi điểm kinh doanh trong nhóm, ô gạch ngang = chọn một phần; ô tìm lọc theo mã / tên. Chi nhánh chưa gắn sơ đồ tổ chức tích ở danh sách **Chưa gắn sơ đồ tổ chức** dưới cây. Đơn vị chưa có sơ đồ tổ chức: cây theo **phân cấp kho tổng → cửa hàng** (Phân cấp chi nhánh, MH15) — tích một kho tổng là chọn kho tổng và mọi cửa hàng của nó, chi nhánh chưa xếp nằm ở nhóm **Chưa xếp**; chưa khai phân cấp thì danh sách chi nhánh, có ô tìm và **Chọn hết đang hiện** / **Bỏ hết đang hiện**. Chi nhánh đang ở bảng giá khác mà tích sang thì form ghi "Chuyển từ bảng giá khác sang đây"; ghi xong chi nhánh rời bảng giá cũ. |
| Ngừng bảng giá | Bỏ tích **Đang dùng**. |
| Xoá bảng giá | Chỉ xoá được bảng giá không phải bảng giá công ty và đã gỡ hết chi nhánh. Giá đã khai ở bảng đó bị xoá theo. |

Cột **Số ô giá** = số ô đã khai giá ở bảng giá đó, để biết bảng giá nào còn trống.

## Giá theo mặt hàng (phần dưới)

<!-- [2026-11-17 11:33 AM kiennt] DM14 — màn gọn: hướng dẫn trên lưới chuyển vào đây (đóng góp) -->
Bấm chọn một bảng giá ở lưới trên, phần dưới hiện **mọi mặt hàng × đơn vị tính** của bảng giá đó, kể cả ô chưa khai giá. Chưa chọn bảng giá nào thì phần dưới hiện bảng giá công ty. Góc tiêu đề phần dưới ghi số ô đã có giá / tổng số ô (rê chuột để xem số mã hàng).

| Cột | Ghi chú |
|---|---|
| Mã hàng, Tên hàng, ĐVT, Quy đổi, Bán chính | Lấy từ khai báo mặt hàng (DM10). Thiếu ĐVT thì bấm đúp dòng để mở mặt hàng, thêm ĐVT. |
| Giá công ty | Hiện khi đang xem bảng giá chi nhánh, để so. |
| Đơn giá | Giá của bảng giá đang chọn. Bình thường chỉ xem; bấm **Sửa giá** thì ô mới nhập được. Ô đang sửa tô vàng. Xoá trắng ô = bỏ giá. |
| Hàng chính | Ô giá chi nhánh của hàng chính tô mờ: cửa hàng chỉ bán hàng chính theo giá công ty, giá chi nhánh không dùng. |

- Nút **Tất cả / Đã có giá / Còn trống / Đang sửa** lọc nhanh. Ô lọc trên đầu từng cột lọc theo mã, tên, ĐVT… như mọi lưới.
- **Điền theo tỉ lệ** (chỉ hiện khi đang sửa giá): với các mặt hàng đang hiện, ô trống = giá ĐVT đã có ÷ tỉ lệ × tỉ lệ cần (vd Lon 450.000 → Thùng 24 = 10.800.000). Điền xong vẫn phải bấm Ghi giá.
- Bấm **Sửa giá** → nút đổi thành **Ghi giá**, ô Đơn giá nhập được. Sửa xong bấm **Ghi giá (n ô)** để lưu, hoặc **Bỏ sửa** để huỷ; xong cả hai đều quay về chỉ xem, nút trở lại **Sửa giá**. Cửa hàng nhận giá mới sau vài phút.
- **Bấm đúp một dòng** để mở mặt hàng (DM10).
- **Xuất Excel** để gửi duyệt giá / đối chiếu.
- Giá cũng sửa được trong form mặt hàng (DM10 → thẻ ĐVT & giá bán), hai nơi là một dữ liệu.

## Nhập giá từ Excel
<!-- [2026-11-17 09:13 PM kiennt] NT-DM-003 — nhập giá bán từ Excel ở lưới giá (đóng góp) -->

1. Bấm dòng bảng giá → ở lưới giá bên dưới bấm **Xuất Excel** để lấy tệp (cột Mã hàng, Tên hàng, ĐVT, Quy đổi, …, **Đơn giá**).
2. Sửa cột **Đơn giá** trên Excel (thêm giá cho ô còn trống, đổi giá ô đã có). Có thể xoá bớt dòng không đổi.
3. Bấm **Nhập Excel**, chọn tệp → xem trước: số ô thêm giá, đổi giá, không đổi; dòng lỗi (mã hàng / ĐVT không có trong bảng giá, đơn giá không phải số) bị bỏ qua.
4. Bấm **Ghi** — như bấm Ghi giá. Ô Đơn giá để trống thì giữ nguyên giá đang có (muốn bỏ giá: Sửa giá trên lưới, xoá ô).

Mặt hàng thêm bằng Nhập Excel ở danh mục mặt hàng chưa có giá: khai giá ở đây (lọc **Còn trống**) hoặc nhập Excel như trên.
