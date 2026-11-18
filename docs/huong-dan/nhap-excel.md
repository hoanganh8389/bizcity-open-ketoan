# Nhập dữ liệu từ Excel (TI14)

<!-- [2026-11-11 Nguyễn Văn Thủy] hướng dẫn trình nhập Excel dùng chung (đóng góp) -->

Một cách nhập cho mọi loại: **Khách hàng, Nhà cung cấp, Mặt hàng, Nhóm hàng, Đơn vị tính, Kho, Hệ thống tài khoản, Biểu thuế, Loại kho, Nhóm khách hàng / nhà cung cấp, Nhân viên, Tài khoản ngân hàng, Hình thức thanh toán, Bảng giá, Tài khoản ngầm định, Tài khoản kết chuyển, Số dư tài khoản đầu kỳ, Tồn kho đầu kỳ, Tồn max, Phiếu thu, Phiếu chi, Thu tiền gửi, Chi tiền gửi, Phiếu kế toán**. Mở ở **Tiện ích → Nhập dữ liệu từ Excel**, hoặc nút **Nhập Excel** ở danh sách.

## Bốn bước

1. **Chọn tệp nguồn**: kéo thả hoặc bấm chọn tệp. Chưa có tệp thì bấm **Tải tệp mẫu** (sheet Hướng dẫn ghi cách điền từng cột). Chọn sheet, dòng tiêu đề (phần mềm tự dò). Chọn cách nhập:
   - *Thêm mới và cập nhật*: mã chưa có → thêm, mã đã có → sửa.
   - *Chỉ thêm mới*: mã đã có báo lỗi.
   - *Chỉ cập nhật*: mã chưa có báo lỗi — dùng để sửa hàng loạt.
2. **Ghép dữ liệu**: phần mềm tự ghép cột theo tên. Cột nào sai thì chọn lại ở ô *Cột trên tệp Excel*. Ô **Ngầm định** là giá trị dùng khi tệp không có cột hoặc ô trống (ví dụ Kiểu = Khách hàng). Cách ghép được nhớ cho lần sau.
3. **Kiểm tra dữ liệu**: phần mềm kiểm từng dòng, **chưa ghi gì**. Xem số dòng hợp lệ, không hợp lệ và lỗi từng dòng. Bấm **Tải tệp lỗi** để sửa trong Excel rồi nạp lại.
4. **Kết quả nhập**: bấm *Nhập … dòng hợp lệ* — dòng lỗi bỏ qua. Tải tệp kết quả hoặc mở danh sách để xem.

## Lưu ý

- Dòng cập nhật: ô trống **giữ nguyên** giá trị đang có.
- Khách hàng / NCC thêm mới để trống mã: phần mềm tự cấp mã nối dãy của nhóm.
- Mã số thuế không được trùng đối tượng khác. Mặt hàng đã có không đổi ĐVT qua Excel.
- **Số dư tài khoản đầu kỳ**: mỗi dòng một tài khoản (và đối tượng với 131, 331…), ghi Dư Nợ hoặc Dư Có; mỗi chi nhánh thành một phiếu số dư.
  Tổng Dư Nợ phải bằng tổng Dư Có của chi nhánh (hoặc ghi cột *TK cân đối*). Tài khoản doanh thu, chi phí (loại 5–8, 911) không có số dư — lãi lỗ luỹ kế ghi 4212 / 4211.
  Chi nhánh đã có phiếu số dư thì sửa phiếu đó (ACC15) hoặc huỷ trước khi nhập lại. Phiếu của chi nhánh còn dòng lỗi thì cả phiếu chưa ghi.
- **Phiếu thu / chi / thu tiền gửi / chi tiền gửi / phiếu kế toán**: các dòng cùng *Số chứng từ* là một phiếu nhiều dòng; để trống số thì mỗi dòng một phiếu, tự cấp số. Bước kiểm tra **ghi sổ thử rồi huỷ** nên báo đúng mọi lỗi (khoản mục, bộ phận, đối tượng bắt buộc, kỳ khoá…).
  Phiếu nhập vào ở trạng thái **Chờ duyệt** (chữ cam, chưa có bút toán). Ở danh sách phiếu: tích các phiếu rồi bấm **Ghi sổ** để ghi hàng loạt; phiếu nào lỗi báo riêng.
- **Nhóm hàng**: mỗi dòng một nhóm; cột *Nhóm cha* ghi mã (hoặc đúng tên) nhóm có sẵn hay ở dòng khác trong tệp — thứ tự dòng không quan trọng, phần mềm ghi cha trước con.
  Mã ngắn theo cấp: cấp 1 đủ 2 ký tự, cấp 2 đủ 3, cấp 3 đủ 1; không trùng nhóm cùng cha. Dòng cha lỗi thì các nhóm con của nó cũng chưa ghi.
- **Tồn kho đầu kỳ (số lượng)**: mỗi dòng Kho × Mã hàng × Số lượng tồn (ĐVT nhỏ nhất), cả tệp một ngày. Phần mềm so với tồn trên sổ của kho đó: kết quả hiện *tồn trên sổ → tồn theo tệp*; mỗi kho có chênh lệch thành một phiếu điều chỉnh kho, ghi sổ ngay.
  Mã không có trong tệp giữ nguyên tồn. Nhập lại cả tệp không sinh thêm chênh lệch. Giá trị tồn (tiền) nhập qua số dư tài khoản 156.
- **Tồn max**: Kho × Mã hàng × Tồn max — dùng tính chuyển hàng về shop và đề xuất đặt mua (xem ở Tồn max).
- **Dán thẳng vào phiếu đang lập**: chép vùng ô ở Excel, bấm vào lưới dòng của phiếu, Ctrl + V. Phiếu thu / chi: từ ô đang đứng ghi sang phải, xuống dưới. Phiếu kế toán: chép các cột TK Nợ, TK Có, Số tiền, Diễn giải rồi dán ở cột Tài khoản — mỗi dòng thành một bút toán. Phiếu mua: chép Mã hàng, Số lượng, Đơn giá (kèm dòng tiêu đề thì ghép theo tên cột); mã chưa có báo ngay trên bảng.
- Phiếu nhập mua, đơn đặt hàng: dùng nút **Nhập từ Excel** ở Tổng hợp mua hàng (MH11).

## Danh mục: xuất ở máy này, nhập ở máy khác
<!-- [2026-11-18 11:20 AM kiennt] NT-DM-004, NT-DM-005 — nhập Excel cho mọi màn danh mục (đóng góp) -->

Mọi màn danh mục có nút **Nhập Excel** và nhận đúng tệp **Xuất** của chính màn đó. Dựng đơn vị mới: Xuất từng danh mục ở máy cũ, Nhập Excel ở máy mới theo thứ tự danh mục (xem *Quy trình* ở menu Danh mục).

- Khoá dòng là **mã** (không phân biệt hoa thường): mã đã có → cập nhật, chưa có → thêm mới.
- Tệp Xuất chỉ có **các cột đang hiện** trên lưới. Muốn chép đủ thông tin thì bật cột ẩn ở nút **Cột** trước khi Xuất. Tệp thiếu cột: mục đã có giữ nguyên, mục mới lấy mặc định như form.
- Cột tích (tệp Xuất ghi **x** / để trống, vd *Hoạt động*, *Ghi công nợ*): cột có ô nào được điền thì ô trống hiểu là **Không**.
- Tài khoản, chi nhánh, mã tham chiếu (tài khoản ngân hàng, đối tượng, nhóm cha…) phải có sẵn — nhập các danh mục nền trước.
- **Biểu thuế**: thiếu cột *Chiều* thì suy theo tài khoản (133… đầu vào, 333… đầu ra); thiếu *Nhóm bảng kê* thì theo thuế suất.
- **Nhóm khách hàng / NCC**: nhóm cha có thể ở dòng khác trong tệp — phần mềm ghi cha trước con, chặn vòng nhóm cha.
- **Tài khoản ngân hàng**: mỗi tài khoản kế toán chỉ gắn một tài khoản ngân hàng.
- **Bảng giá**: tệp danh sách bảng giá (mã, tên, chi nhánh áp dụng…). Giá từng mặt hàng nhập ở lưới giá của bảng giá.
- **Tài khoản ngầm định** (tệp chế độ Gọn: Loại · TK Nợ · TK Có): chỉ đặt các ô ngầm định sửa được; không thêm / xoá loại. Tài khoản lấy theo hình thức thanh toán / loại kho / thuế sửa ở màn đó. Một ô dùng ở nhiều loại thì đổi ở mọi loại.
- **Tài khoản kết chuyển**: khoá dòng là cặp *từ → đến*; bước không có trong tệp giữ nguyên; cả bộ lưu một lần thành phiên bản mới. Bộ còn bước trỏ tới tài khoản chưa có thì không lưu được — khai đủ tài khoản ở Hệ thống tài khoản trước.

