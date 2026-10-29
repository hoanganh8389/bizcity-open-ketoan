# Phiếu thu (ACC51) và Phiếu chi (ACC52)

Dùng cho các khoản thu, chi **tiền mặt** tại quỹ do kế toán tự lập: thu nợ bằng tiền mặt, chi phí, nộp tiền mặt vào ngân hàng, rút tiền về quỹ…

Tiền qua **tài khoản ngân hàng** thì dùng **Phiếu báo có (ACC54)** và **Phiếu báo nợ (ACC53)**.

> Tiền bán hàng ở cửa hàng **đã được ghi tự động** theo chứng từ bán hàng. Không lập phiếu thu cho các khoản đó nữa, nếu không tiền sẽ bị ghi hai lần.

## Danh sách phiếu

- **Bảng lọc bên trái**: Từ ngày, Đến ngày, Chi nhánh (tích chọn; ô "Chọn" tích / bỏ tất cả), bấm **Tìm kiếm**. Nút **In các phiếu đã chọn** in các phiếu đã tích, mỗi phiếu một trang.
- **Thanh nút**: **Thêm** (lập phiếu), **Sửa**, **Copy** (lập phiếu mới điền sẵn nội dung phiếu đã chọn, ngày hôm nay, số mới), **Xóa**, **Nạp** (tải lại), **In**, **Xuất** (Excel). Sửa / Copy cần tích ô **Chọn** ở đúng một phiếu; Xóa, In theo mọi phiếu đã tích.
- **Cột**: Chọn, Số phiếu, Nhân viên, Ghi chú, Tiền tệ, Tỷ giá, Số tiền, Tài khoản, Ngày hạch toán, Đối tượng, Ngân hàng, Lý do, Số HĐ, Người nhận, Địa chỉ, Điện thoại, Ngày tạo, Ngày sửa, User tạo, User sửa, Tên nhân viên. Nút **Cột** để ẩn / hiện, kéo đổi thứ tự.
- Bấm một dòng để mở phiếu. Phiếu đã xóa không còn hiện trong danh sách.

## Lập phiếu

Bấm **Lập phiếu thu** (hoặc **Lập phiếu chi**). Thanh nút trên cùng: **Ghi**, **Ghi và thêm mới** (ghi xong mở tiếp phiếu trống), **In**, **Xuất** (xuất lưới chi tiết ra Excel), **Xóa**, **Đóng**.

**Đầu phiếu**

| Ô | Ghi chú |
|---|---|
| Số chứng từ | Để trống thì tự cấp khi ghi: `PT26-000001`, `PC26-000001`… |
| Ngày chứng từ | |
| Tài khoản nợ (phiếu chi: Tài khoản có) | Tài khoản tiền mặt của cả phiếu (111…) |
| Tiền tệ | VND, tỷ giá 1 |
| Số tiền | Tổng tiền của phiếu; phải bằng tổng các dòng chi tiết cộng tiền thuế |
| Lý do | Lý do thu / chi (danh mục Lý do – tài khoản, ACC18); ghi lên bút toán |
| Nhân viên, Tên NV | Bắt buộc khi đã khai danh mục nhân viên; dòng chưa chọn nhân viên lấy theo ô này |
| Khách hàng, Tên KH, Điện thoại, Địa chỉ | Chọn mã thì tự điền tên, điện thoại, địa chỉ |
| Người nộp (phiếu chi: Người nhận) | Tự điền người đại diện của khách hàng, sửa được |
| Diễn giải, Chi nhánh | |

**Chi tiết phiếu**

- **Thêm chi tiết phiếu** (hoặc nút + ở đầu dòng): thêm một dòng với tài khoản theo lý do, số tiền bằng ô Số tiền, khách hàng / nhân viên / diễn giải theo đầu phiếu. **Xóa chi tiết phiếu** (hoặc nút thùng rác) xoá dòng đang chọn.
- Lưới có cột **Nợ** và **Có**. Phiếu thu nhập số tiền ở cột **Có**, phiếu chi nhập ở cột **Nợ**; cột còn lại để trống.
- Các cột khác: Đối tượng, Mã lưu chuyển tiền tệ, Diễn giải, Thuế, Nhân viên, Tiền thuế, Ngày HĐ, Khoản mục, Số HĐ, Số seri, Mẫu HĐ, Đối tượng thuế VAT, Mã số thuế, Số hóa đơn, Ngày hóa đơn, Tổng tiền HĐ, Số còn nợ, Bộ phận, Hợp đồng. Dòng cuối cộng số dòng và số tiền.
- **Tìm chứng từ** (chọn Khách hàng trước): hiện các chứng từ còn nợ của khách hàng (phiếu chi: nợ nhà cung cấp). Tick chứng từ rồi bấm **Chọn**: mỗi chứng từ thành một dòng, tài khoản công nợ của chứng từ, số tiền bằng số còn nợ (sửa nhỏ hơn được). Ghi phiếu là thanh toán cho đúng các chứng từ đó.

Bấm **Ghi**. Phiếu được lưu và vào danh sách **Định khoản tự động (ACC14)**; ghi sổ khi kế toán định khoản (loại phiếu đặt chế độ ghi ngay thì ghi sổ luôn).

| Loại phiếu | Tài khoản tiền mặt | Tài khoản ở từng dòng |
|---|---|---|
| Phiếu thu | ghi **Nợ** | ghi **Có** (ví dụ 131 thu nợ khách, 711 thu khác) |
| Phiếu chi | ghi **Có** | ghi **Nợ** (ví dụ 331 trả người bán, 642 chi phí) |

Phần mềm báo và không ghi khi: thiếu tài khoản tiền, thiếu nhân viên, chưa có dòng, dòng thiếu tài khoản hoặc số tiền, có tiền thuế mà chưa chọn thuế, tài khoản bắt buộc đối tượng / khoản mục / bộ phận / hợp đồng mà chưa chọn, số tiền một dòng lớn hơn số còn nợ của chứng từ, hoặc **Số tiền** đầu phiếu khác tổng chi tiết cộng thuế.

## Ví dụ thường gặp

| Việc | Loại phiếu | Tài khoản đối ứng |
|---|---|---|
| Nộp tiền mặt vào ngân hàng | Phiếu chi | tài khoản ngân hàng 112… |
| Rút tiền gửi về quỹ | Phiếu thu | tài khoản ngân hàng 112… |
| Khách trả nợ bằng tiền mặt | Phiếu thu | 131… + chọn đối tượng |
| Chi tiền mặt mua văn phòng phẩm | Phiếu chi | 642… |

Nộp tiền mặt vào ngân hàng chỉ lập **một** phiếu (phiếu chi), không lập thêm phiếu báo có cho cùng khoản đó.

## Đối tượng công nợ

Dòng dùng tài khoản công nợ (131, 331, 141…) phải có đối tượng: ở cột **Đối tượng** của dòng, hoặc ô **Khách hàng** ở đầu phiếu. Đối tượng chưa có thì thêm ở **Danh mục → Đối tượng** trước.

## Sửa và huỷ

- Bấm vào dòng phiếu để mở, sửa rồi bấm **Ghi**. Bút toán cũ được đảo bằng ghi số âm, bút toán mới ghi theo nội dung mới; số phiếu và loại phiếu giữ nguyên.
- **Xóa** (trong form phiếu) đảo toàn bộ bút toán. Phiếu đã huỷ vẫn nằm trong danh sách để tra cứu, không sửa lại được.
- Kỳ đã khoá sổ thì không lập, sửa, huỷ phiếu của kỳ đó.
- Nút **Bút toán** ở cuối dòng cho xem các bút toán đã ghi của phiếu.

Xem tiền quỹ còn bao nhiêu ở **Sổ quỹ tiền mặt (ACC55)**.

## In liên tục nhiều phiếu

Ở danh sách phiếu, tích ô **Chọn** ở các phiếu (ô ở tiêu đề chọn tất cả), bấm **In** hoặc **In các phiếu đã chọn**: các phiếu in một lần, mỗi phiếu một trang, theo thứ tự ngày, số phiếu.

## Ký xác nhận trên phiếu

Mở phiếu, phần **Ký xác nhận trên phiếu** ở cuối form có các ô theo mẫu phiếu (người lập phiếu, thủ quỹ, kế toán trưởng, giám đốc); bấm **Ký** ở ô của mình. Ký hàng loạt: ở danh sách phiếu, tick phiếu, chọn **Ký với vai…** rồi bấm **Ký … phiếu**.

| Ô | Ai ký được |
|---|---|
| Người lập phiếu | Người đã lập phiếu (kế toán trưởng ký thay được) |
| Thủ quỹ | Người có quyền ghi chứng từ |
| Kế toán trưởng | Kế toán trưởng, chủ đơn vị |
| Giám đốc | Chủ đơn vị |

Phiếu đã huỷ, phiếu đã có chữ ký vai đó, phiếu mình không được ký vai đó được bỏ qua và liệt kê.

Phiếu in có chữ ký thì ô chữ ký ghi **Đã ký xác nhận**, tên người ký và giờ ký (vẫn chừa chỗ ký tay). Chữ ký gắn với **phiên bản** phiếu: sửa phiếu sau khi ký thì chữ ký cũ hết hiệu lực (hiện "đã ký bản cũ"), cần ký lại. Huỷ chữ ký: người đã ký hoặc chủ đơn vị bấm nút × cạnh chữ ký.

Đây là **xác nhận trong phần mềm** (có nhật ký ai ký, lúc nào), chưa phải chữ ký số dùng chứng thư số (token USB) theo Luật Giao dịch điện tử.
