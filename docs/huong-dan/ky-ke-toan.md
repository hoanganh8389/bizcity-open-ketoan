# Đóng / mở kỳ kế toán (ACC2)

Màn có bốn tab: **Đóng / mở kỳ** (lưới khoá), **Danh sách kỳ**, **Nhật ký khoá / mở**, **Khoá theo ngày**.

## Kỳ

Kỳ kế toán là tháng dương lịch, không vắt qua năm. Kỳ **tự tạo** khi có chứng từ đầu tiên rơi vào tháng đó.

Tab **Danh sách kỳ**, nút **Khai kỳ năm …** tạo trước đủ 12 kỳ của năm đang xem (kỳ đã có thì giữ nguyên).

**Chứng từ ngày tương lai:** phiếu thu, chi, báo có, báo nợ, phiếu kế toán, số dư đầu kỳ **không được** có ngày sau cuối tháng hiện tại, trừ khi kỳ của tháng đó đã được khai. Muốn lập trước chứng từ cho tháng sau, khai kỳ trước.

## Đóng / mở kỳ (lưới khoá)

Chọn **năm, tháng**. Lưới có mỗi hàng một chi nhánh, mỗi cột một loại chứng từ (chia nhóm Bán hàng; Mua hàng, kho; Tiền; Kế toán). Ô có dấu tick là đã khoá.

| Thao tác | Cách làm |
|---|---|
| Khoá / mở một ô | Tick / bỏ tick ô |
| Khoá / mở cả một chi nhánh | Bấm tên chi nhánh |
| Khoá / mở cả một loại chứng từ | Bấm tên cột (áp cho các chi nhánh đang hiện) |
| Đóng kỳ | Bấm **Đóng kỳ**: tick mọi ô của các chi nhánh đang hiện |
| Lưu | Bấm **Ghi** (nút ghi rõ số ô thay đổi; ô đổi tô vàng). **Bỏ thay đổi** để trở lại như cũ |

- Ô **Tìm chi nhánh** lọc bớt hàng; Đóng kỳ và bấm tên cột chỉ áp cho các hàng đang hiện.
- Có ô **mở khoá** thì phải ghi **lý do**; lý do lưu ở nhật ký.
- Chi nhánh đã khoá đủ mọi loại chứng từ hiện nhãn **Đã đóng**.

### Bảng kiểm trước khi khoá

Phía trên lưới hiện các việc chưa xong của tháng đang chọn (chỉ hiện mục có số khác 0), mỗi mục có liên kết **Xem**:

- chứng từ nhận lỗi, chưa ghi sổ;
- chứng từ lệch với bút toán; số dư lưu sẵn lệch với sổ cái;
- phiếu trả lại không nối được phiếu gốc;
- yêu cầu thanh toán chờ duyệt hoặc chưa chi;
- chi nhánh có bán hàng nhưng chưa tính giá vốn;
- chi nhánh có phát sinh nhưng chưa kết chuyển lãi lỗ;
- chi nhánh có kết chuyển đã lỗi thời (số liệu hoặc bút toán kết chuyển mẫu đổi sau khi kết chuyển);
- chi nhánh đã kết chuyển mà doanh thu, chi phí, 911 còn số dư cuối kỳ.

Bảng kiểm chỉ nhắc, không chặn việc khoá.

### Khoá chung

Tab **Danh sách kỳ**, nút **Khoá chung**: khoá một lần cho **mọi chi nhánh** và/hoặc **mọi loại chứng từ** (áp cả chi nhánh mở sau này). Ô thuộc khoá chung hiện tick xám ở lưới, không bỏ được ở lưới; mở ở tab Danh sách kỳ (bắt buộc lý do).

### Khi kỳ đã khoá

- chứng từ gửi sang có ngày trong kỳ → trạng thái **Lỗi** "Kỳ kế toán đã được khóa…";
- không lập, sửa, huỷ được phiếu của kỳ; sửa ngày một phiếu từ kỳ đã khoá sang kỳ mở (hoặc ngược lại) cũng bị chặn — phần mềm xét cả **ngày cũ và ngày mới** của phiếu;
- không kết chuyển, không tính lại giá vốn được nếu loại chứng từ Kết chuyển / Giá vốn hàng xuất đã khoá.

Khoá áp cho mọi người, kể cả chủ đơn vị. Cần quyền khoá sổ (chủ đơn vị, kế toán trưởng) mới khoá / mở được.

## Nhật ký khoá / mở

Tab **Nhật ký khoá / mở** liệt kê theo tháng: lúc nào, ai, khoá hay mở, chi nhánh, loại chứng từ, lý do.

## Khoá theo ngày

Ngoài khoá kỳ, chủ đơn vị / kế toán trưởng đặt thêm các luật sau (chỉ chặn **kế toán viên**; chủ đơn vị, kế toán trưởng và chứng từ gửi sang qua khoá API không bị chặn):

| Luật | Tác dụng |
|---|---|
| Khoá dữ liệu đến ngày | Chứng từ có ngày đến hết ngày này thì không lập, sửa, huỷ được |
| Chỉ sửa chứng từ trong N ngày | Chỉ lập, sửa, huỷ chứng từ có ngày trong N ngày gần nhất (0 = không giới hạn) |
| Chỉ lập phiếu ngày hôm nay | Không lập, sửa phiếu ngày quá khứ hay tương lai |
| Kế toán viên không được huỷ phiếu | Vẫn sửa được; huỷ cần kế toán trưởng |

Khi sửa phiếu, phần mềm xét cả ngày cũ lẫn ngày mới. Phiếu bị chặn thì mở ra chỉ xem được, kèm dòng báo lý do.

## Số dư đầu kỳ các tháng

Số dư đầu kỳ của mỗi tháng = số dư cuối kỳ tháng trước, phần mềm **tự tính liên tục** từ sổ cái. Không có bước "kết chuyển số dư sang kỳ sau"; sửa chứng từ tháng trước thì số đầu kỳ các tháng sau tự đúng. Số dư đầu kỳ chỉ nhập **một lần** khi bắt đầu dùng phần mềm (ACC15).

## Trình tự cuối tháng

1. Kiểm tra mọi chứng từ của kỳ đã ghi sổ (Định khoản tự động ACC14, không còn chứng từ lỗi).
2. Lập các phiếu kế toán trích trước, phân bổ, khấu hao.
3. Tính giá vốn (ACC49).
4. **Kết chuyển lãi/lỗ (ACC6)** từng chi nhánh, lần lượt từng tháng (tháng trước chưa kết chuyển thì không kết chuyển được tháng sau).
5. Xem báo cáo, đối chiếu.
6. Mở ACC2, xem bảng kiểm, **Đóng kỳ** rồi **Ghi**.

## Căn cứ pháp lý

Luật Kế toán 88/2015/QH13, Điều 26 (khoá sổ) và Điều 27 (sửa sai sót sau khi khoá sổ). Xem thêm màn **Căn cứ pháp lý** (TI11), trang *Sổ kế toán: ghi, khoá, sửa, lưu trữ*.
