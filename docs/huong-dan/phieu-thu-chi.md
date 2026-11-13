# Thu, chi tiền (ACC51, ACC52)

Dùng cho các khoản thu, chi **tiền mặt** tại quỹ do kế toán tự lập. Tiền qua **tài khoản ngân hàng** thì dùng **Thu, chi tiền gửi**.

> Tiền bán hàng ở cửa hàng **đã được ghi tự động** theo chứng từ bán hàng. Không lập phiếu thu cho các khoản đó nữa, nếu không tiền sẽ bị ghi hai lần.

## Danh sách

- **Bảng lọc bên trái**: kỳ, chi nhánh. Ô **Loại phiếu** trên thanh nút: Tất cả / Phiếu thu / Phiếu chi.
- Ô trên cùng: **Tổng thu**, **Tổng chi** và số dư tiền.
- Nút **Thu tiền ▾**: Phiếu thu · Thu tiền theo hóa đơn. Nút **Chi tiền ▾**: Phiếu chi · Trả tiền theo hóa đơn.
- Bấm một dòng xem dòng hạch toán ở dưới, bấm đúp mở phiếu. Nút **Cột** ẩn / hiện cột. Tích nhiều phiếu rồi **In** để in liên tục.

## Lập phiếu

**Đầu phiếu**: **Loại** (Thu khác, Chi khác, Rút tiền gửi về nhập quỹ…: chọn loại thì tự điền tài khoản), Đối tượng, Người nộp / Người nhận, Địa chỉ, Lý do (tự ghi "Thu tiền của …" / "Chi tiền cho …", sửa được), Nhân viên, Ngày, Số phiếu (để trống thì tự cấp khi ghi: `PT26-000001`, `PC26-000001`…).

**Hạch toán**: mỗi dòng Diễn giải · TK Nợ · TK Có · Số tiền · Đối tượng · Tên đối tượng. Các cột thêm (Mục thu/chi, Khoản mục CP, Bộ phận, Hợp đồng, Nhân viên, Thuế…) bật ở nút **Cột**; cột đã có dữ liệu tự hiện. Dán được từ Excel vào lưới.

**Theo hóa đơn**: chọn đối tượng xong, bảng chứng từ còn nợ tự mở; tích chứng từ rồi **Chọn**: mỗi chứng từ thành một dòng, số tiền bằng số còn nợ (sửa nhỏ hơn được).

Chân phiếu: **Hủy** · **Ghi** · **Ghi và thêm** (Ctrl + S ghi, Esc hủy).

| Loại phiếu | Tài khoản tiền mặt | Tài khoản ở từng dòng |
|---|---|---|
| Phiếu thu | ghi **Nợ** 111 | ghi **Có** (131 thu nợ khách, 711 thu khác) |
| Phiếu chi | ghi **Có** 111 | ghi **Nợ** (331 trả người bán, 642 chi phí) |

Phần mềm báo ở đúng ô và không ghi khi: thiếu tài khoản, chưa có dòng, dòng thiếu số tiền, tài khoản bắt buộc đối tượng / khoản mục / bộ phận / hợp đồng mà chưa chọn, số tiền một dòng lớn hơn số còn nợ của chứng từ, kỳ đã khoá sổ.

## Ví dụ thường gặp

| Việc | Loại phiếu | Tài khoản đối ứng |
|---|---|---|
| Nộp tiền mặt vào ngân hàng | Phiếu chi | tài khoản ngân hàng 112… |
| Rút tiền gửi về quỹ | Phiếu thu | tài khoản ngân hàng 112… |
| Khách trả nợ bằng tiền mặt | Phiếu thu | 131… + chọn đối tượng |
| Chi tiền mặt mua văn phòng phẩm | Phiếu chi | 642… |

Nộp tiền mặt vào ngân hàng chỉ lập **một** phiếu (phiếu chi), không lập thêm thu tiền gửi cho cùng khoản đó.

## Đối tượng công nợ

Dòng dùng tài khoản công nợ (131, 331, 141…) phải có đối tượng: ở cột **Đối tượng** của dòng, hoặc ô **Khách hàng** ở đầu phiếu. Đối tượng chưa có thì thêm ở **Danh mục → Đối tượng** trước.

## Sửa và huỷ

- Bấm vào dòng phiếu để mở, sửa rồi bấm **Ghi**. Bút toán cũ được đảo bằng ghi số âm, bút toán mới ghi theo nội dung mới; số phiếu và loại phiếu giữ nguyên.
- **Xóa** đảo toàn bộ bút toán. Phiếu đã huỷ vẫn nằm trong danh sách để tra cứu, không sửa lại được.
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
