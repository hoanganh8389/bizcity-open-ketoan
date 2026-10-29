# Hợp đồng (ACC25) và lịch thanh toán hợp đồng (HD01)

Theo dõi hợp đồng thuê nhà, tín dụng, mua tài sản, nhà cung cấp…: doanh thu, chi phí, công nợ theo từng hợp đồng, và **các kỳ phải trả** để không trễ hạn.

## Khai hợp đồng (ACC25)

Bấm **Thêm**, nhập:

| Ô | Ghi chú |
|---|---|
| Mã, tên | Mã không sửa được sau khi ghi |
| Loại hợp đồng | Thuê nhà, mặt bằng · Nhà cung cấp hàng hoá · Mua tài sản, chi phí, dịch vụ · Tín dụng, vay · Bán hàng · Khác |
| Hợp đồng gốc | Phụ lục hợp đồng thì chọn hợp đồng gốc |
| Khách hàng / nhà cung cấp | Mã ở danh mục Đối tượng (chủ nhà, ngân hàng, nhà cung cấp…) |
| Nhân viên phụ trách | Mã ở danh mục Nhân viên |
| Ngày ký, ngày kết thúc, giá trị | |
| Nộp thuế thay chủ nhà | Chỉ hiện với hợp đồng thuê nhà: đơn vị kê khai, nộp thay thuế GTGT, TNCN của cá nhân cho thuê |

Lọc danh sách theo loại hợp đồng; tìm theo mã, tên, ghi chú.

Mã hợp đồng chọn được trên dòng phiếu (phần chiều phân tích), trên thẻ tài sản; báo cáo chi phí ACC44 gom được theo hợp đồng.

## Lãi lỗ theo hợp đồng (ACC70, ACC71)

Ở nhóm **Báo cáo chung**:

- **ACC70 Tổng hợp**: mỗi hợp đồng một dòng — doanh thu, thu nhập (tài khoản loại 5, 7), giá vốn, chi phí (loại 6, 8), lãi / lỗ.
- **ACC71 Chi tiết**: tách thêm theo từng tài khoản.

Chỉ tính các dòng phiếu **có chọn hợp đồng**; không tính bút toán kết chuyển.

## Lịch thanh toán

Ở cuối hộp sửa hợp đồng, phần **Lịch thanh toán**:

1. **Sinh lịch đều**: nhập ngày kỳ đầu đến hạn, số kỳ, mỗi kỳ cách bao nhiêu tháng, số tiền mỗi kỳ, thuế nộp thay mỗi kỳ → bấm **Sinh lịch**. Ví dụ thuê nhà trả hằng tháng ngày 5, 36 kỳ.
2. Sửa từng kỳ nếu khác (tăng giá theo phụ lục, kỳ lẻ…), **Thêm kỳ**, xoá kỳ.
3. Bấm **Ghi** để lưu cả hợp đồng và lịch.

Sinh lại lịch khi đã có kỳ đã trả sẽ thay toàn bộ lịch (phần mềm hỏi lại trước).

## Lịch thanh toán hợp đồng (HD01)

Màn nhắc hạn, ở nhóm **Báo cáo công nợ**:

- Liệt kê các kỳ đến hạn tới ngày chọn (mặc định 60 ngày tới), kể cả kỳ đã quá hạn mà chưa trả (chữ đỏ).
- Lọc theo trạng thái (chưa trả / đã trả / huỷ) và loại hợp đồng.
- Bấm một kỳ chưa trả để **đánh dấu đã trả**, ghi số phiếu chi / uỷ nhiệm chi.
- Nút **Lập yêu cầu TT** (kỳ chưa trả, hợp đồng có đối tượng): lập **yêu cầu thanh toán** (CN05) điền sẵn đối tượng, số tiền (gồm thuế nộp thay), hạn chi, nội dung, số hợp đồng; chọn chi nhánh, hình thức, **TK ghi Nợ khi chi** (chi phí thuê, trả trước, phải trả, nợ vay…) rồi **Lưu nháp** hoặc **Gửi duyệt**. Cột *Yêu cầu thanh toán* hiện số yêu cầu đã lập. Mỗi kỳ chỉ một yêu cầu đang hiệu lực (bị từ chối hoặc huỷ thì lập lại được). Khi yêu cầu được duyệt và **lập phiếu chi / báo nợ**, kỳ tự chuyển sang **đã trả** kèm số phiếu.

Đánh dấu đã trả bằng tay chỉ là ghi nhận trên lịch. Không đi qua yêu cầu thanh toán thì việc chi tiền vẫn lập **phiếu chi / báo nợ** như bình thường (chọn hợp đồng ở dòng phiếu để chi phí, công nợ theo được hợp đồng).
