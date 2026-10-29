# Hệ thống tài khoản (ACC1)

Danh mục tài khoản theo **Thông tư 99/2025/TT-BTC** (áp dụng từ năm tài chính 2026), chi tiết cấp 2, cấp 3 theo nhu cầu đơn vị (Thông tư 99 cho doanh nghiệp tự mở tài khoản chi tiết).

## Màn hình

Thanh nút: **Thêm** (Ctrl+N) · **Sửa** (Ctrl+E, hoặc bấm đúp một dòng) · **Xoá** (Ctrl+Delete) · **Nạp** (F5) · **Xuất** Excel (Ctrl+F8).

**Hai kiểu xem** (nút cạnh thanh nút):

- **Dạng cây** (mặc định lần đầu): tài khoản cấp 1, bấm mũi tên trước tên để mở / thu tài khoản con; nút **Mở hết**, **Thu gọn hết**. Thu gọn chỉ ẩn nhánh, không đổi dữ liệu.
- **Dạng bảng**: mỗi tài khoản một dòng, có cột Tài khoản mẹ và Cấp; sắp xếp, lọc theo từng cột, nhóm theo cột như mọi lưới.
- Phần mềm nhớ kiểu xem gần nhất của từng người dùng (trên máy đang dùng); mở lại màn thì tự hiện kiểu đó.

**Tìm và lọc** (hàng dưới thanh nút, áp cho cả hai kiểu xem):

- Ô tìm: gõ số tài khoản (khớp phần đầu, ví dụ `111` ra 111, 1111, 1112…) hoặc một phần tên (không phân biệt hoa thường, có dấu hay không dấu).
- Lọc **Cấp**, **Trạng thái** (đang / ngừng sử dụng), **Sổ cái** (có / không); chọn nhiều điều kiện thì kết quả thoả cùng lúc mọi điều kiện.
- **Xoá bộ lọc** trở về toàn bộ danh mục.
- Dạng cây khi đang lọc: hiện tài khoản khớp kèm đường dẫn tài khoản cha (tài khoản cha không khớp hiện chữ nhạt), các nhánh có kết quả mở sẵn.
- Không có tài khoản nào khớp: báo "Không tìm thấy tài khoản phù hợp". Danh mục trống: "Chưa có dữ liệu tài khoản kế toán".

Lưới có các cột theo thứ tự: Số tài khoản, Tài khoản mẹ, Cấp, Tên tài khoản, Tên tài khoản EN, rồi một cột ô tích cho mỗi cờ: Tài khoản FC, Bộ phận, Hợp đồng, Đối tượng, Sản phẩm, Khoản mục, Acc VAT, Nợ, Vay, Lưỡng tính, Luôn tăng, Sổ cái, Chi phí, và cột Trạng thái. Nút "Cột" bật thêm các cột ẩn sẵn: Nhân viên, Lưu chuyển tiền tệ, Công nợ nội bộ, Vụ việc, Dự án, Nguồn vốn, Số dư, Loại. Ô tích lọc được: gõ `x` (có tích) hoặc `0` (không tích). Kéo tiêu đề cột vào ô "Kéo một cột vào đây…" để nhóm theo cột đó.

Tài khoản tổng hợp in đậm. Tài khoản ngừng dùng hiện mờ.

## Form thêm / sửa

- **Thông tin chung**: Số tài khoản (*), Tài khoản mẹ, Tên tài khoản (*), Tên tiếng anh, Có hạch toán ngoại tệ.
- **Theo dõi chi tiết theo**: nhân viên, mã lưu chuyển tiền tệ, khoản mục (lý do), sản phẩm, đối tượng công nợ, hợp đồng, bộ phận, tài khoản công nợ nội bộ.
- **Tính chất tài khoản**: là tài khoản thuế GTGT, có ghi nhận công nợ, tài khoản lưỡng tính, tài khoản tài sản (luôn tăng), tài khoản sổ cái, tài khoản giá thành. Nếu không phải lưỡng tính thì chọn số dư thường ở bên Nợ hay Có.
- **Theo dõi thêm**: vụ việc, dự án, nguồn vốn, tài khoản vay, ngừng sử dụng.

### Ô tích nào có tác dụng

| Ô tích | Tác dụng khi tích |
|---|---|
| Theo dõi chi tiết theo đối tượng công nợ | Lập phiếu bắt buộc chọn đối tượng; sổ công nợ, số dư, đối trừ theo từng đối tượng |
| Có ghi nhận công nợ | Như trên: bắt buộc chọn đối tượng, theo dõi số dư theo đối tượng |
| Tài khoản lưỡng tính | Số dư tách Nợ / Có theo từng đối tượng (131, 331…); cũng theo dõi theo đối tượng |
| Theo dõi theo khoản mục, bộ phận, hợp đồng, nhân viên, vụ việc, dự án, nguồn vốn | Phiếu có tài khoản này hiện cột tương ứng và bắt buộc chọn mã (khi danh mục đó đã có dữ liệu) |
| Số dư thường ở bên | Bên Nợ hay Có khi tính số dư, công nợ |
| Ngừng sử dụng | Không ghi sổ được vào tài khoản |

Các ô còn lại ghi **(phân loại)** trong form: tài khoản thuế GTGT, tài khoản tài sản, sổ cái, giá thành, vay, mã lưu chuyển tiền tệ, sản phẩm, công nợ nội bộ. Các ô này được lưu, lọc, xuất Excel nhưng không đổi cách ghi sổ:

- Báo cáo lưu chuyển tiền tệ lấy dòng tiền theo các tài khoản tiền 111, 112, 113 (không phụ thuộc ô mã lưu chuyển tiền tệ).
- Báo cáo công nợ nội bộ lấy theo tài khoản 1368 / 3368.
- Thuế tính theo màn **Loại thuế** (ACC43).

"Có hạch toán ngoại tệ" **chưa áp dụng**: phần mềm chưa nhập nguyên tệ, tỷ giá.

## Quy tắc

- Chỉ **tài khoản chi tiết** (không có tài khoản con) mới được ghi sổ.
- Số tài khoản con phải **bắt đầu bằng số tài khoản mẹ**. Khi thêm con, tài khoản mẹ tự thành tài khoản tổng hợp. Không thêm được con dưới tài khoản mẹ đã có phát sinh. Không thêm được con dưới tài khoản mẹ đã ngừng sử dụng. Số tài khoản không được trùng.
- Không đổi được số tài khoản sau khi tạo.
- **Xoá** chỉ được khi tài khoản chưa có tài khoản con và chưa có phát sinh; nếu không, tích "Ngừng sử dụng". Khi xoá tài khoản con cuối cùng, tài khoản mẹ ghi sổ trực tiếp được trở lại.

**Quay về dữ liệu gốc** đặt lại tên, tên tiếng Anh, tính chất và mọi cờ theo tệp gốc. Tài khoản còn thiếu sẽ được thêm, tài khoản đơn vị tự thêm được giữ nguyên.

## Căn cứ pháp lý

Thông tư 99/2025/TT-BTC, Phụ lục II — hệ thống tài khoản kế toán doanh nghiệp. Xem thêm màn **Căn cứ pháp lý** (TI11), trang *Hệ thống tài khoản và báo cáo tài chính*.
