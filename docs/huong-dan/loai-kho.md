# Loại kho

Mỗi kho thuộc **một loại**. Loại quyết định kho được dùng cho nghiệp vụ nào (nhập mua, bán, khách trả…).

## Loại kho

Bảng gồm: Mã · Tên loại kho · Công dụng · TK kho · Số kho đang dùng. <!-- [2026-11-20 kiennt] NT-DM-014 — loại giữ hộ khoá TK; nhập Excel nhận cột Số kho (đóng góp) -->

Có sẵn 12 loại gốc (KHH hàng kinh doanh, KKM khuyến mại, KHG gửi bán, KTL trả lại, KCL cách ly, KLO lỗi, KHHAN cận hạn, KHHSD hết hạn, KDC điều chuyển, KNB nhận giữ hộ, KCB chờ bán, KCC chờ chứng từ).

- Thanh nút: **Thêm · Nạp · Xuất · In · Xoá · Thùng rác**.
- **Xem / Sửa**: bấm đúp một dòng mở hộp thoại ở chế độ xem, bấm **Sửa** (hoặc Enter / F2) để sửa; Ctrl+E vào thẳng chế độ sửa. Ô gồm mã, tên, công dụng, TK kho (chỉ nhận tài khoản chi tiết cấp cuối — chọn tài khoản tổng hợp thì báo đỏ, không Ghi được). Ở form kho (Cơ cấu tổ chức) ô Loại kho có nút **+** để thêm loại mới ngay tại chỗ.
- **Xoá**: loại kho chuyển vào **Thùng rác** — vẫn lưu trong dữ liệu, không còn hiện ở danh sách, tự bỏ khỏi các nghiệp vụ. Còn kho đang dùng loại đó thì phải đổi loại của kho trước.
- **Thùng rác**: **Khôi phục** để dùng lại, hoặc **Xoá vĩnh viễn** (cần quyền quản trị; nhật ký vẫn ghi đủ nội dung). Chứng từ, bút toán đã ghi với kho thuộc loại đó giữ nguyên.

## TK kho của loại

Mọi bút toán có hàng đi vào / ra kho thuộc loại này ghi vào **TK kho của loại**, ưu tiên hơn Tài khoản ngầm định: nhập mua, trả hàng nhà cung cấp, giá vốn bán hàng, khách trả hàng, chuyển kho (mỗi đầu theo kho của đầu đó), nhập / xuất kho khác, kiểm kê.

- Dòng chứng từ không ghi kho → theo kho mặc định của chi nhánh.
- TK kho trống → theo Tài khoản ngầm định như trước.
- TK kho là tài khoản tổng hợp (ví dụ 156) → không ghi sổ được: cột TK kho hiện **đỏ ⚠**, bút toán vẫn theo Tài khoản ngầm định. Sửa loại kho, chọn tài khoản chi tiết (1561, 1562…).
- Đặt tên loại kho thế nào tuỳ đơn vị; kho thuộc loại nào thì ghi vào TK kho của loại đó.
- Chứng từ đã ghi giữ nguyên; muốn định khoản lại theo TK mới thì ghi lại chứng từ.
- **Loại không thuộc sở hữu** (KNB nhận giữ hộ): hàng của bên khác, không ghi sổ kho → ô TK khoá, cột TK hiện *không ghi sổ*. Loại đang lỡ có TK: cột TK hiện đỏ; mở Sửa, bấm **Bỏ TK** rồi Ghi.

## Nghiệp vụ dùng loại kho

Bảng này nằm ngay dưới hướng dẫn, trong ngăn **Hướng dẫn** của màn Loại kho. Mỗi nghiệp vụ một dòng: **Tự chọn kho loại** (chứng từ điền sẵn kho thuộc loại này của chi nhánh) · **Dùng được thêm** (các loại khác chọn được). Kho thuộc loại không có trong dòng thì không chọn được.

Bấm **Sửa** (hoặc bấm đúp dòng): tích ô **Dùng được** cho các loại kho, chấm **Tự chọn** cho một loại.

Ví dụ: Khách trả hàng tự chọn Kho hàng trả lại, dùng được thêm Kho hàng hoá kinh doanh → phiếu khách trả tự vào kho hàng trả lại; nhập mua không vào được kho hàng lỗi.

## Kho

Ở Danh mục kho, mỗi kho chọn **Loại kho**. Nút **Tạo nhanh bộ kho**: chọn chi nhánh, tích các loại cần → tạo các kho một lần (mã = mã chi nhánh + loại); loại chi nhánh đã có kho thì bỏ qua.

## Nhập Excel
<!-- [2026-11-18 11:20 AM kiennt] NT-DM-004, NT-DM-005 — nhập Excel cho mọi màn danh mục (đóng góp) -->

Nút **Nhập Excel** nhận tệp Xuất của màn này (mã, tên, công dụng, tài khoản hạch toán; cột **Số kho** chỉ xem, bỏ qua). Loại mới bán được, hàng của mình, theo dõi hạn dùng như khi thêm trên form. Loại hàng nhận giữ hộ (KNB) không có TK kho — dòng ghi TK cho loại này báo lỗi, không ghi. Xem [Nhập dữ liệu từ Excel](nhap-excel.md).
