# Khai thuế — Tờ khai thuế GTGT (ACC66)

Lập **tờ khai thuế GTGT mẫu 01/GTGT** (phương pháp khấu trừ) theo tháng hoặc quý. Số liệu lấy từ **sổ hoá đơn** (cùng nguồn với Bảng kê mua vào ACC64, Bảng kê bán ra ACC65). Trước khi lập, nên mở **Bổ sung thông tin thuế (ACC78)** để bổ sung hoá đơn về muộn, chọn kỳ kê khai, đánh dấu hoá đơn không được khấu trừ.

## Màn Khai thuế

- Thanh trên: **Thiết lập thông tin cơ quan thuế, tổ chức, cá nhân cung cấp dịch vụ thuế** (tên, mã số thuế, đại lý thuế, người ký), **Tải lại**, **Khai bổ sung ▾**, **Lập tờ khai ▾** (01/GTGT, 03/TNDN).
- Bảng **Tờ khai tháng / Tờ khai quý**: Kỳ kê khai, Loại tờ khai (Lần đầu / Bổ sung lần n), Thông tư áp dụng, Trạng thái (Chưa nộp tờ khai / TCT đã chấp nhận), Chức năng: **Xem ▾** — Xem, Đánh dấu TCT chấp nhận, Xóa.
- Khung bên phải: tờ khai cần lập tháng này, năm nay.

## Lập tờ khai

1. Bấm **Lập tờ khai** → hộp **Chọn kỳ tính thuế**: kỳ kê khai (tháng / quý), tháng (quý), năm, danh mục ngành nghề; **Chọn phụ lục kê khai**: BKBR_01-1/GTGT bảng kê bán ra, BKMV_01-2/GTGT bảng kê mua vào, PL giảm thuế theo Nghị quyết 204/2025/QH15; tích **Lấy lên HHDV mua vào thuộc nhóm 4** nếu muốn bảng kê mua vào có cả hoá đơn không đủ điều kiện khấu trừ. Bấm **Đồng ý**.
2. Hộp **Tờ khai thuế GTGT khấu trừ (01/GTGT)**: thẻ **Tờ khai** và các phụ lục đã chọn (thêm phụ lục ở ô **+ Phụ lục**).
   - Đầu tờ khai [01a]–[08] lấy theo thông tin thiết lập. Các chỉ tiêu tự tính từ hoá đơn: [23] [24] mua vào; [26] không chịu thuế; [29] 0%; [30] [31] 5%; [32] [33] 10% gồm cả hàng giảm còn 8%.
   - Ô có khung nhập tay: [22] (ngầm định [43] kỳ trước), [25] (trống = [24] trừ thuế hoá đơn không được khấu trừ), [23a] [24a], [32b], [34a], [37] [38], [39a], [40b], [42].
   - **Chọn CT không tính thuế**: tích các hoá đơn bán ra không tính thuế; giá trị lên [32a] và không lên bảng kê 01-1.
   - **Lấy lại dữ liệu**: lấy lại số từ sổ hoá đơn, bỏ số nhập tay.
   - Cuối tờ khai: Nhân viên đại lý thuế (họ tên, chứng chỉ hành nghề), **Người ký**, **Ngày ký** (bắt buộc).
3. Chân hộp: **Hủy** · **Ghi** · **Ghi và In**. Mở lại tờ khai đã ghi: chế độ xem với **In ▾** (tờ khai, phụ lục giảm thuế, bảng kê 01-1, 01-2), **Tiện ích ▾** (Xuất Excel, Hoá đơn mua vào từ 5 triệu, Chi tiết theo thuế suất, Đối chiếu sổ cái), **Sửa**.

Bảng kê 01-1, 01-2 có cột **Chi nhánh** để xem hoá đơn theo từng chi nhánh / kho; tờ khai lập cho cả đơn vị.

## Sau khi nộp

Nộp tờ khai qua cổng thuế điện tử xong, ở danh sách chọn **Xem ▾ → Đánh dấu TCT chấp nhận**. Tờ khai đã chấp nhận bị khoá (không sửa, không xoá); muốn điều chỉnh thì **Khai bổ sung**.

## Khai bổ sung (01/KHBS)

Dùng khi đã nộp tờ khai mà sau đó phát hiện sai sót: hoá đơn về muộn của kỳ đó, hoá đơn điều chỉnh, sửa ô nhập tay…

1. Ở màn Khai thuế bấm **Khai bổ sung ▾**, chọn kỳ đã được chấp nhận.
2. Phần mềm tính lại tờ khai theo sổ hoá đơn hiện tại và lập **bản giải trình 01/KHBS**. Phần mềm tính lại tờ khai theo sổ hoá đơn hiện tại và lập **bản giải trình 01/KHBS**:
   - từng chỉ tiêu điều chỉnh: số đã kê khai, số điều chỉnh, chênh lệch;
   - số thuế phải nộp tăng thêm hoặc giảm, thay đổi của [43].
3. Chọn **ngày dự kiến nộp tiền** để tính **tiền chậm nộp**:
   - tiền chậm nộp = số thuế tăng thêm × 0,03% × số ngày;
   - số ngày tính từ ngày kế tiếp **hạn nộp** đến ngày liền trước ngày nộp tiền. Ví dụ hạn 20/10, nộp 25/10: 4 ngày;
   - hạn nộp: khai tháng là ngày 20 tháng sau, khai quý là ngày cuối tháng đầu quý sau. Rơi vào thứ bảy, chủ nhật thì lùi sang thứ hai. Ngày nghỉ lễ phần mềm chưa tính: kế toán tự kiểm tra.
4. Bấm **Lưu tờ khai bổ sung** (lưu luôn ở trạng thái chính thức). **Xuất Excel 01/KHBS** để nộp kèm.

Tờ khai lần đầu và các lần bổ sung trước vẫn được giữ. Danh sách ghi Loại tờ khai "Bổ sung lần n". Kỳ sau lấy [43] của lần khai mới nhất làm [22].

Cách khác theo quy định: hoá đơn mua vào về muộn có thể kê khai vào kỳ phát hiện thay vì khai bổ sung. Chọn kỳ kê khai ở màn ACC78.

## Nộp tờ khai

Bấm **Xuất Excel**: một tệp gồm các sheet Tờ khai, Bảng kê bán ra 01-1, Bảng kê mua vào 01-2, Giảm thuế NQ 204 (kèm cột Chi nhánh để đối chiếu nội bộ), sau đó nhập số vào phần mềm khai thuế hoặc cổng thuế điện tử. Phần mềm chưa xuất tệp XML để nộp thẳng: cấu trúc tệp XML của mẫu tờ khai mới chưa được kiểm chứng, nộp tệp sai cấu trúc sẽ bị từ chối.

## Mẫu áp dụng

- Từ **01/7/2026**: mẫu 01/GTGT theo **Thông tư 89/2026/TT-BTC**. Mẫu này thêm [32b] (hàng hoá, dịch vụ bán ra không tính vào giá tính thuế) và [34a] (hàng hoá, dịch vụ bán ra không thuộc phạm vi điều chỉnh của pháp luật thuế GTGT), đồng thời sửa công thức [27] và [34].
- Trước đó: mẫu theo Thông tư 80/2021/TT-BTC. Các mã chỉ tiêu giống nhau, chỉ không có [32b] và [34a].
- Cách kê hàng giảm thuế 8% vào dòng 10% kèm phụ lục là theo hướng dẫn thông dụng *(cần đối chiếu văn bản gốc của Nghị định 174/2025 và Thông tư 89/2026)*.

## Căn cứ pháp lý

Luật Thuế GTGT 48/2024/QH15 (sửa đổi bởi Luật 149/2025/QH15); Nghị định 181/2025/NĐ-CP; Nghị quyết 204/2025/QH15 và Nghị định 174/2025/NĐ-CP (giảm thuế 8% đến hết 31/12/2026); Thông tư 89/2026/TT-BTC (mẫu tờ khai từ 01/7/2026). Xem thêm màn **Căn cứ pháp lý** (TI11).
