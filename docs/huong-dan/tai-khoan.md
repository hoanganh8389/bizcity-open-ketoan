# Hệ thống tài khoản (ACC1)

Danh mục tài khoản theo **Thông tư 99/2025/TT-BTC** (áp dụng từ năm tài chính 2026), chi tiết cấp 2, cấp 3 theo nhu cầu đơn vị (Thông tư 99 cho doanh nghiệp tự mở tài khoản chi tiết).

## Màn hình

Thanh nút: **Thêm** (Ctrl+N) · **Sửa** (Ctrl+E, hoặc bấm đúp một dòng) · **Xoá** (Ctrl+Delete) · **Nạp** (F5) · **Xuất** Excel · **Nhân bản** · **Ngừng sử dụng / Dùng lại** · **Nhập Excel**.

Danh sách dạng cây, các cột: **Số tài khoản · Tên tài khoản · Tính chất · Tên tiếng Anh · Diễn giải · Trạng thái**.

- Bấm ⊞ trước số tài khoản để mở tài khoản con, ⊟ để thu lại; nút **Mở rộng** / **Thu gọn** mở hoặc thu cả cây.
- Tài khoản tổng hợp (có tài khoản con) in đậm; tài khoản ngừng sử dụng hiện mờ.
- Ô tìm: gõ số tài khoản (khớp phần đầu, ví dụ `111` ra 111, 1111, 1112…) hoặc một phần tên (không phân biệt hoa thường, có dấu hay không dấu). Lọc **Trạng thái**. Đang tìm thì hiện tài khoản khớp kèm tài khoản cha (cha không khớp hiện chữ nhạt).
- Nút **Cột** bật thêm: TK tổng hợp, Cấp và các ô "theo dõi chi tiết theo" (Đối tượng, Nhân viên, Khoản mục chi phí…).
- **Xuất**: tệp `Danh_sach_he_thong_tai_khoan.xlsx` — tiêu đề "DANH SÁCH HỆ THỐNG TÀI KHOẢN", cột STT, Số tài khoản, Tên tài khoản, Tính chất, Tên tiếng Anh, Diễn giải, Trạng thái. Sửa tệp này rồi **Nhập Excel** lại được (số đã có thì cập nhật, số mới thì thêm).
- **Nhân bản**: mở form thêm mới chép thông tin tài khoản đang chọn, chỉ cần gõ số tài khoản mới.
- **Ngừng sử dụng**: không chọn được tài khoản khi lập chứng từ mới; số liệu cũ giữ nguyên. Bấm **Dùng lại** để bật lại.

## Form thêm / sửa

- **Số tài khoản (\*)**, **Tên tài khoản (\*)**, **Tài khoản tổng hợp** (trống = cấp 1), **Tính chất (\*)**: Dư Nợ / Dư Có / Lưỡng tính, **Diễn giải** (ghi chú cách dùng, không ảnh hưởng ghi sổ).
- **Theo dõi chi tiết theo**: Đối tượng, Nhân viên, Khoản mục chi phí, Bộ phận, Hợp đồng, Vụ việc, Dự án, Nguồn vốn, Mục thu / chi, Mặt hàng. Tích = khi hạch toán vào tài khoản này bắt buộc nhập thông tin đó trên dòng chứng từ.
- **Tên tài khoản theo ngôn ngữ**: Tên tiếng Anh.
- Bấm **Ghi** mà còn thiếu ô bắt buộc, hoặc số tài khoản trùng / không bắt đầu bằng số tài khoản tổng hợp: ô đó viền đỏ, có dòng báo ngay dưới ô. Thêm mới có nút **Ghi và thêm** để thêm tiếp tài khoản cùng tài khoản tổng hợp.

### Ô tích nào có tác dụng

| Ô tích / ô chọn | Tác dụng |
|---|---|
| Đối tượng | Lập phiếu bắt buộc chọn đối tượng; sổ công nợ, số dư, đối trừ theo từng đối tượng |
| Tính chất Lưỡng tính | Số dư tách Nợ / Có theo từng đối tượng (131, 331…); cũng theo dõi theo đối tượng |
| Nhân viên, Khoản mục chi phí, Bộ phận, Hợp đồng, Vụ việc, Dự án, Nguồn vốn | Phiếu có tài khoản này hiện cột tương ứng và bắt buộc chọn mã (khi danh mục đó đã có dữ liệu) |
| Mục thu / chi, Mặt hàng | Phân loại (lưu, lọc, xuất); báo cáo lưu chuyển tiền tệ lấy dòng tiền theo 111, 112, 113 |
| Tính chất Dư Nợ / Dư Có | Bên Nợ hay Có khi tính số dư, công nợ |
| Ngừng sử dụng | Không ghi sổ được vào tài khoản |

Các cờ phân loại cũ (TK ngoại tệ, thuế GTGT, vay, tài sản, sổ cái, giá thành, công nợ nội bộ) không đổi cách ghi sổ nên không còn trên màn; dữ liệu vẫn giữ nguyên.

## Quy tắc

- Chỉ **tài khoản chi tiết** (không có tài khoản con) mới được ghi sổ.
- Số tài khoản con phải **bắt đầu bằng số tài khoản mẹ**. Khi thêm con, tài khoản mẹ tự thành tài khoản tổng hợp. Không thêm được con dưới tài khoản mẹ đã có phát sinh. Không thêm được con dưới tài khoản mẹ đã ngừng sử dụng. Số tài khoản không được trùng.
- Không đổi được số tài khoản sau khi tạo.
- **Xoá** chỉ được khi tài khoản chưa có tài khoản con và chưa có phát sinh; nếu không, bấm **Ngừng sử dụng**. Khi xoá tài khoản con cuối cùng, tài khoản mẹ ghi sổ trực tiếp được trở lại.

**Quay về dữ liệu gốc** đặt lại tên, tên tiếng Anh, tính chất và mọi cờ theo tệp gốc. Tài khoản còn thiếu sẽ được thêm, tài khoản đơn vị tự thêm được giữ nguyên.

## Căn cứ pháp lý

Thông tư 99/2025/TT-BTC, Phụ lục II — hệ thống tài khoản kế toán doanh nghiệp. Xem thêm màn **Căn cứ pháp lý** (TI11), trang *Hệ thống tài khoản và báo cáo tài chính*.

## Khung "Vì sao" khi khai báo <!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 -->

Dưới form tài khoản có khung **Vì sao** đổi theo ô bạn vừa chọn:

| Dấu | Nghĩa | Bạn làm gì |
|---|---|---|
| ℹ | nhắc hệ quả (vd tài khoản con kế thừa bản chất tài khoản cha) | đọc |
| ▶ | giải thích bản chất (bấm để mở) | đọc khi cần |
| ⚠ | cảnh báo mềm: hợp lệ nhưng thường sai về kế toán | sửa bằng nút gợi ý, **hoặc** vẫn Ghi — khi đó phải ghi lý do (ít nhất 5 ký tự); lý do vào nhật ký, người lưu tự chịu trách nhiệm vì đã được cảnh báo |
| ✘ | chặn: sai toàn vẹn dữ liệu | phải sửa mới Ghi được |

Nút Ghi hiện số cảnh báo đang có ("Ghi (có 1 cảnh báo)"). Nội dung cảnh báo đang ở dạng **nháp** tới khi kế toán trưởng duyệt.
