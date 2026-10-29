# Kết chuyển lãi/lỗ (ACC6)

Cuối kỳ, chuyển toàn bộ doanh thu, chi phí phát sinh trong kỳ sang tài khoản **911 Xác định kết quả kinh doanh**, rồi chuyển lãi hoặc lỗ sang **4212 Lợi nhuận chưa phân phối**.

## Các bước

Trước khi kết chuyển: **tính giá vốn (ACC49)** rồi **tính khấu hao, phân bổ (ACC31)** của tháng, để chi phí đủ trước khi chuyển sang 911.

Màn làm theo HTsoft. Bên trái là bảng lọc **Từ ngày / Đến ngày** (theo ngày chứng từ), bấm **Tìm kiếm**. Thanh nút: **Thêm · Xem · Xóa · Nạp · Bút toán kết chuyển mẫu · Xuất**, góc phải có **Lợi nhuận năm trước**. Lưới danh sách phiếu kết chuyển gồm Kỳ kế toán, Ngày tạo, Số phiếu chuyển, Chi nhánh, User, Diễn giải, Tình trạng, Chọn (như HTsoft, cột Chọn ở cuối). Cột Số tiền và Kết quả ẩn sẵn, bật ở nút Cột. Kéo một cột lên ô phía trên lưới để nhóm theo cột đó.

1. Bấm **Thêm**: mở form **Kết chuyển lãi/ lỗ**. Bên trái chọn **Năm**, **Kỳ kế toán** và tích **Chi nhánh kết chuyển** (mặc định tất cả). Năm và kỳ lấy theo **DM Kỳ kế toán và khoá sổ (ACC2)**: chỉ hiện các kỳ đã có; chọn sẵn tháng trước. Bên phải là danh mục bút toán kết chuyển sẽ chạy theo thứ tự; sửa được cột **Thứ tự** ngay trên lưới (cần quyền sửa danh mục): bấm Kết chuyển thì thứ tự mới được lưu vào danh mục (một phiên bản mới, lý do "Sửa thứ tự khi kết chuyển") rồi mới kết chuyển; thứ tự sai thì báo lỗi, không kết chuyển gì.
2. Bấm **Kết chuyển**: chạy ngay, không hỏi lại (như HTsoft). Mỗi chi nhánh một chứng từ `KC <tháng/năm> <chi nhánh>`, ghi ngày cuối kỳ. Xong thì báo **Cập nhật thành công!**, form đóng, danh sách nạp lại. Phần mềm báo và không ghi khi:
   - chưa chọn chi nhánh, chưa khai báo bút toán kết chuyển, hoặc bút toán kết chuyển mẫu sai (xem bảng luật bên dưới);
   - **tháng trước chưa kết chuyển** (form vẫn mở, khung đỏ theo từng chi nhánh): phải kết chuyển các tháng đó trước;
   - kỳ đã khoá sổ.
3. Chọn một dòng rồi bấm **Xem**, hoặc bấm đúp dòng: mở **Thông tin bút toán kết chuyển**. Form có Kỳ kế toán, Chi nhánh, UserID, Ngày lập phiếu và lưới bút toán như HTsoft (Tài khoản nợ, Tài khoản có, Diễn giải, Số tiền, Số dư cuối kỳ, Kiểu, Khoản mục, Phòng ban, Hợp đồng; phiếu kết chuyển ghi trước khi có các cột này thì Số dư cuối kỳ, Kiểu, Phòng ban, Hợp đồng để trống, kết chuyển lại để có), nút **Xuất Excel**. Form cũng báo **số dư còn lại sau kết chuyển** (tài khoản doanh thu, chi phí chưa có bước kết chuyển, hoặc có số dư từ trước kỳ) và **cần kết chuyển lại**.

## Kết chuyển tuần tự

Trong một năm, tháng trước phải kết chuyển xong mới kết chuyển được tháng sau. Tháng trước "chưa xong" là tháng có tài khoản doanh thu, chi phí (đầu số nguồn của các bước kết chuyển, trừ 911) còn phát sinh thuần khác 0 mà chưa có chứng từ kết chuyển. Tháng 1 không bị kiểm tra (năm trước chốt bằng bước Lợi nhuận năm trước).

## Phần mềm tự kiểm tra sau khi kết chuyển

Ngay sau khi ghi, phần mềm đọc lại sổ cái đến cuối kỳ:

- **TK 911 còn số dư** → huỷ cả lần kết chuyển, không ghi gì, báo lỗi. (Chỉ xảy ra khi bút toán kết chuyển mẫu sai.)
- **TK doanh thu, chi phí (loại 5–8) còn số dư** → vẫn ghi, nhưng báo danh sách tài khoản kèm lý do: *chưa có bước kết chuyển* (khai thêm bước) hoặc *số dư từ trước kỳ*. Cột Tình trạng của danh sách hiện nhãn **Còn số dư**; bảng kiểm khoá kỳ (ACC2) cũng nhắc.

## Kết chuyển lại

Sau khi kết chuyển mà kỳ đó có thêm hoặc sửa chứng từ: bấm **Thêm**, chọn lại kỳ và bấm **Kết chuyển**, hoặc mở phiếu (Xem) và bấm **Kết chuyển lại**. Bút toán kết chuyển cũ được đảo bằng ghi số âm, bút toán mới ghi theo số mới. Không cần xoá trước. Form Xem ghi **lần** kết chuyển thứ mấy của kỳ.

Phần mềm tự phát hiện kỳ **cần kết chuyển lại** (nhãn đỏ ở cột Tình trạng của danh sách, mục riêng trong bảng kiểm khoá kỳ) khi, sau lần kết chuyển:

- có chứng từ mới / sửa / huỷ làm đổi số thuần của tài khoản doanh thu, chi phí trong kỳ (phiếu muộn, tính lại giá vốn…). Ghi rồi huỷ, hoặc sửa mà số không đổi thì không tính;
- số dư đầu 911 đổi (kỳ trước kết chuyển lại hoặc huỷ làm 911 còn số);
- bút toán kết chuyển mẫu đã sửa.

Tick **Kết chuyển lại các tháng sau** ở form Thêm trước khi bấm Kết chuyển: kết chuyển xong tháng chọn thì kết chuyển lại luôn các tháng sau (cùng năm) đã kết chuyển của chi nhánh, lần lượt từng tháng. Dùng sau khi sửa bút toán kết chuyển mẫu: chọn tháng đầu tiên cần làm lại, tick ô này. Tháng nào lỗi (ví dụ kỳ đã khoá) thì dừng ở tháng đó và báo.

## Nguồn của một lần kết chuyển

Nút **Nguồn kết chuyển** ở form Xem: thời điểm chốt số, số bút toán nguồn, phiên bản quy tắc đã dùng, phát sinh Nợ / Có từng tài khoản lúc kết chuyển. Bấm một tài khoản để xem các bút toán tạo nên số đó (đã ghi trước thời điểm chốt số), bấm bút toán để mở chứng từ gốc. Chứng từ kết chuyển ghi trước khi có tính năng này không có nút Nguồn; kết chuyển lại để có.

## Huỷ kết chuyển

Tích các phiếu ở cột **Chọn** (ô ở tiêu đề chọn tất cả đang hiện) rồi bấm **Xóa**, xác nhận và nhập lý do. HTsoft xoá hẳn phiếu; ở đây sổ cái chỉ thêm nên phiếu được **huỷ**: bút toán kết chuyển bị đảo, số dư doanh thu, chi phí của kỳ trở lại như trước, phiếu vẫn hiện trong danh sách với tình trạng *Đã huỷ*.

## Bút toán kết chuyển mẫu

Nút **Bút toán kết chuyển mẫu** mở **Danh mục bút toán kết chuyển**. Danh mục có thanh nút **Thêm · Sửa · Xoá · Nạp · Xuất** và **Lịch sử phiên bản**; lưới gồm Thứ tự, Từ tài khoản, Tới tài khoản, Diễn giải, Số dư cuối kỳ, Kiểu, Áp dụng. Phần mềm chạy các bước lần lượt theo **Thứ tự**. Thêm hoặc Sửa (bấm đúp một dòng) mở form **Thông tin bút toán kết chuyển**:

- **Thông tin chung**: Thứ tự tính toán, Diễn giải (bắt buộc), Tài khoản đi, Tài khoản đến (không được trùng nhau);
- **Kiểu kết chuyển**: *Kết chuyển số dư cuối* (cộng cả số dư đầu kỳ, dùng cho 911 → 4212) hoặc *Kết chuyển số phát sinh*;
- **Loại kết chuyển**: *Kết chuyển từ tài khoản NỢ sang tài khoản CÓ* (Bên Nợ), *Kết chuyển từ tài khoản CÓ sang tài khoản NỢ* (Bên Có), *Chương trình tự xác định* (Hai chiều);
- **Áp dụng**: bỏ tích để tạm không chạy bước này. Đây là thêm của ketoan, HTsoft không có.

Bấm **Ghi** để lưu. Mỗi lần lưu là một phiên bản mới, lý do tự ghi (ví dụ "Thêm 622 → 154"). Bộ mặc định:

| Thứ tự | Từ TK | Sang TK | Cách kết chuyển |
|---:|---|---|---|
| 0 | 621 | 154 | Bên Nợ |
| 0 | 711 | 911 | Hai chiều |
| 0 | 811 | 911 | Bên Nợ |
| 10 | 154 | 6324 | Bên Nợ |
| 74 – 77 | 5211, 5212, 5213 | 51111 | Bên Nợ |
| 80 | 511 | 911 | Bên Có |
| 85 | 632 | 911 | Bên Nợ |
| 87 | 515 | 911 | Bên Có |
| 90 | 635 | 911 | Bên Nợ |
| 93 | 821 | 911 | Bên Nợ |
| 94 | 641 | 911 | Bên Nợ |
| 95 | 642 | 911 | Bên Nợ |
| 100 | 911 | 4212 | Hai chiều, **lấy cả số dư đầu kỳ** |

| Cách kết chuyển | Bút toán sinh ra |
|---|---|
| Bên Nợ (chi phí, giảm trừ) | Nợ tài khoản đích / Có tài khoản nguồn = Nợ − Có trong kỳ |
| Bên Có (doanh thu, thu nhập) | Nợ tài khoản nguồn / Có tài khoản đích = Có − Nợ trong kỳ |
| Hai chiều (theo số dư) | Bên nào lớn hơn thì chuyển phần chênh sang tài khoản đích |

- **Từ tài khoản** là đầu số: `511` gồm mọi tài khoản con 5111, 51111…
- **Sang tài khoản** phải là tài khoản chi tiết, không theo dõi đối tượng.
- Bước sau thấy kết quả của bước trước: giảm trừ doanh thu (521x) chuyển về 51111 trước, rồi doanh thu mới chuyển sang 911 theo số thuần. Vì vậy **thứ tự quan trọng**.
- **Lấy số dư đầu**: cộng cả số dư đầu kỳ của tài khoản nguồn (dùng cho 911 → 4212, để phần còn treo trên 911 từ kỳ trước cũng được chuyển hết).
- Mỗi dòng kết chuyển giữ nguyên **khoản mục, bộ phận (phòng ban), hợp đồng** của tài khoản nguồn, nên báo cáo theo các chiều này vẫn đúng sau kết chuyển.
- Tài khoản có số dư ngược chiều (ví dụ chi phí bị ghi giảm nhiều hơn ghi tăng) thì dòng kết chuyển đổi bên thay vì ghi số âm.
- Đơn vị chưa sửa gì thì dùng bộ mặc định. Chỉ kế toán trưởng và chủ sở hữu sửa được.

### Phần mềm chặn khi lưu (và khi kết chuyển)

| Luật | Ví dụ bị chặn |
|---|---|
| Chỉ kết chuyển **từ** doanh thu, chi phí (loại 5–8), 154 hoặc 911 | `131 → 911`, `1111 → 911`, `1561 → 911` |
| Chỉ kết chuyển **đến** 154, 155, 5xx, 632x, 911 hoặc 421x | `511 → 3331` |
| Tài khoản đích không nằm trong đầu số nguồn | `63 → 632` |
| Bước đổ số vào một đầu số phải chạy **trước** bước kết chuyển đầu số đó | `511 → 911` thứ tự 70, `5211 → 51111` thứ tự 74 (giảm trừ treo lại trên 51111) |
| Có đúng một bước `911 → 421x`, kiểu Hai chiều, bật Lấy số dư đầu, chạy sau cùng | thiếu bước 911, bước 911 không ở cuối |

Cảnh báo (vẫn lưu được): tài khoản doanh thu, chi phí chưa có bước kết chuyển (ví dụ 622, 627); kiểu kết chuyển trái tính chất tài khoản; bật Lấy số dư đầu cho bước khác 911.

### Lịch sử phiên bản

Mỗi lần lưu (Ghi, Xoá) làm danh mục khác bộ đang dùng thì lưu thành một phiên bản mới (người sửa, lúc sửa, lý do tự ghi, đủ danh sách). Nút **Lịch sử phiên bản** trên thanh nút của danh mục. Mỗi chứng từ kết chuyển ghi kèm phiên bản và bản chụp bộ quy tắc đã chạy. Ghi lại y nguyên bộ đang dùng thì không thêm phiên bản.

## Lợi nhuận năm trước (đầu năm mới)

Nút **Lợi nhuận năm trước** (góc phải thanh nút): khi sang năm mới, số dư tài khoản lợi nhuận năm nay (4212) đến hết 31/12 năm trước được chuyển sang lợi nhuận năm trước (4211), ghi ngày **01/01** năm mới.

1. Kết chuyển lãi lỗ tháng 12 của năm trước xong mới làm bước này.
2. Nhập **Năm mới** → **Xem trước**: bảng liệt kê số dư từng chi nhánh (lãi = dư Có, lỗ = dư Nợ).
3. Bấm **Kết chuyển**. Lãi: Nợ 4212 / Có 4211. Lỗ: Nợ 4211 / Có 4212.

Chạy lại (sau khi sửa số năm trước) thì bút toán cũ được đảo rồi ghi lại theo số mới, không cộng đôi. Chứng từ có số `KC LN <năm trước> <chi nhánh>`, hiện trong danh sách phiếu kết chuyển (kỳ *LN năm …*), xoá (huỷ) ở đó như phiếu khác.

## Lưu ý

- **Báo cáo kết quả kinh doanh (ACC9)** không tính bút toán kết chuyển nên xem được cả trước và sau khi kết chuyển, số như nhau.
- Kỳ đã **khoá sổ** cho loại chứng từ "Kết chuyển" thì không kết chuyển, không huỷ được. Mở khoá ở **DM Kỳ kế toán và khoá sổ (ACC2)**.
- **Số dư đầu kỳ (ACC15)** không nhận tài khoản doanh thu, chi phí (loại 5–8) và 911. Lãi, lỗ luỹ kế trước ngày bắt đầu dùng phần mềm nhập vào 4212 (năm nay) hoặc 4211 (năm trước).
- Thứ tự làm cuối tháng: kiểm tra chứng từ lỗi (ACC14) → lập các phiếu kế toán trích trước, phân bổ → kết chuyển → xem báo cáo → khoá sổ.
