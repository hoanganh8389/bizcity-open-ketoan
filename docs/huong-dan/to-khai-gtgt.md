# Tờ khai thuế GTGT (ACC66)

Lập **tờ khai thuế GTGT mẫu 01/GTGT** (phương pháp khấu trừ) theo tháng hoặc quý. Số liệu lấy từ **sổ hoá đơn**, tức là cùng nguồn với Bảng kê mua vào (ACC64) và Bảng kê bán ra (ACC65).

Trước khi lập, nên mở **Bổ sung thông tin thuế (ACC78)** để bổ sung hoá đơn về muộn, sửa thông tin hoá đơn còn thiếu, chọn kỳ kê khai. Hoá đơn được xếp vào kỳ theo **kỳ kê khai** (nếu có chọn), không thì theo ngày hoá đơn.

## Cách lập

1. Chọn **kỳ khai** (tháng hoặc quý), kỳ và năm. Để trống chi nhánh nghĩa là khai cho cả đơn vị.
2. Phần mềm điền các chỉ tiêu lấy từ hoá đơn:
   - **[23] [24]**: giá trị và thuế của hàng hoá, dịch vụ mua vào.
   - **[26]**: bán ra không chịu thuế.
   - **[29]**: bán ra thuế suất 0%.
   - **[30] [31]**: bán ra thuế suất 5%.
   - **[32] [33]**: bán ra thuế suất 10%, **gồm cả hàng giảm thuế còn 8%**. Doanh thu và thuế 8% kê ở dòng 10%, kèm phụ lục giảm thuế.
   - Các chỉ tiêu cộng trừ tính theo công thức của mẫu:
     - [27] = [29] + [30] + [32] + [32a] − [32b]
     - [28] = [31] + [33]
     - [34] = [26] + [27] + [34a]
     - [36] = [35] − [25]
     - [40a] = [36] − [22] + [37] − [38] − [39a], nếu không âm
     - [43] = [41] − [42]
3. Nhập tay các ô có khung:
   - **[22]** thuế còn được khấu trừ kỳ trước. Ngầm định bằng [43] của tờ khai kỳ trước đã lưu.
   - **[25]** thuế được khấu trừ. Để trống thì bằng [24] trừ thuế của các hoá đơn đã đánh dấu **không được khấu trừ** ở màn Bổ sung thông tin thuế (ACC78).
   - [23a] [24a] hàng nhập khẩu; [32b], [34a]; [37] [38] điều chỉnh kỳ trước; [39a], [40b]; [42] đề nghị hoàn.
4. Bấm **Lưu nháp** hoặc **Lưu chính thức**. Kỳ sau sẽ lấy [43] của kỳ này làm [22].

## Xem lại tờ khai đã lưu

- Mục **Các tờ khai đã lưu** (dưới bộ lọc) liệt kê mọi kỳ đã lưu: trạng thái nháp / chính thức, thuế đầu ra, được khấu trừ, phải nộp, còn khấu trừ, thời điểm lưu. Bấm một dòng để mở kỳ đó.
- Tờ khai **chính thức** bị khoá:
  - Màn hiện **đúng số đã lưu**, không tự tính lại theo hoá đơn. Các ô nhập tay bị khoá.
  - Nếu hoá đơn của kỳ thay đổi sau khi lưu (hoá đơn về muộn, hoá đơn điều chỉnh), màn hiện cảnh báo chỉ tiêu nào lệch, lưu bao nhiêu và tính lại ra bao nhiêu.
    - Đã nộp tờ khai thì bấm **Lập tờ khai bổ sung** (xem dưới).
    - Chưa nộp thì bấm **Mở lại để sửa**: tờ khai về bản nháp và được tính lại; sửa xong lưu chính thức lại.

## Khai bổ sung (01/KHBS)

Dùng khi đã nộp tờ khai mà sau đó phát hiện sai sót: hoá đơn về muộn của kỳ đó, hoá đơn điều chỉnh, sửa ô nhập tay…

1. Mở kỳ cần bổ sung. Màn báo chỉ tiêu nào lệch so với tờ khai đã nộp.
2. Bấm **Lập tờ khai bổ sung**. Phần mềm tính lại tờ khai theo sổ hoá đơn hiện tại và lập **bản giải trình 01/KHBS**:
   - từng chỉ tiêu điều chỉnh: số đã kê khai, số điều chỉnh, chênh lệch;
   - số thuế phải nộp tăng thêm hoặc giảm, thay đổi của [43].
3. Chọn **ngày dự kiến nộp tiền** để tính **tiền chậm nộp**:
   - tiền chậm nộp = số thuế tăng thêm × 0,03% × số ngày;
   - số ngày tính từ ngày kế tiếp **hạn nộp** đến ngày liền trước ngày nộp tiền. Ví dụ hạn 20/10, nộp 25/10: 4 ngày;
   - hạn nộp: khai tháng là ngày 20 tháng sau, khai quý là ngày cuối tháng đầu quý sau. Rơi vào thứ bảy, chủ nhật thì lùi sang thứ hai. Ngày nghỉ lễ phần mềm chưa tính: kế toán tự kiểm tra.
4. Bấm **Lưu tờ khai bổ sung** (lưu luôn ở trạng thái chính thức). **Xuất Excel 01/KHBS** để nộp kèm.

Tờ khai lần đầu và các lần bổ sung trước vẫn được giữ. Danh sách "Các tờ khai đã lưu" ghi rõ "bổ sung lần n". Kỳ sau lấy [43] của lần khai mới nhất làm [22].

Cách khác theo quy định: hoá đơn mua vào về muộn có thể kê khai vào kỳ phát hiện thay vì khai bổ sung. Chọn kỳ kê khai ở màn ACC78.

## Các thẻ

Thẻ theo mẫu tờ khai và phụ lục:

- **Tờ khai**: đầu tờ khai [01a] ngành nghề, [01b] kỳ tính thuế, [02] lần đầu / [03] bổ sung lần thứ, [04] tên người nộp thuế, [05] mã số thuế, [06] [07] đại lý thuế (khai ở Thông tin người nộp thuế), rồi các chỉ tiêu.
- **BKBR_01-1/GTGT** — Bảng kê hoá đơn, chứng từ hàng hoá, dịch vụ bán ra: từng hoá đơn chia 4 nhóm (1 không chịu thuế, 2 thuế suất 0%, 3 thuế suất 5%, 4 thuế suất 10% gồm hàng giảm còn 8%), mỗi nhóm có dòng **Tổng nhóm**.
- **BKMV_01-2/GTGT** — Bảng kê hoá đơn, chứng từ hàng hoá, dịch vụ mua vào: nhóm 1 dùng riêng cho SXKD đủ điều kiện khấu trừ; nhóm 2, 3 (dùng chung, dự án đầu tư); tích **Lấy lên HHDV mua vào thuộc nhóm 4** để hiện cả hoá đơn không đủ điều kiện khấu trừ (đánh dấu ở ACC78).
- **PL 204/2025/QH15** — Giảm thuế GTGT theo Nghị quyết 204/2025/QH15: I hàng mua vào thuế suất 8% (thuế [06]); II hàng bán ra, thuế suất 10% giảm còn 8%, thuế được giảm [08]; III chênh lệch [09] = [08] − [06].

Thẻ quản trị (không nộp cơ quan thuế):

- Cột **Chi nhánh** ở hai bảng kê: hoá đơn của chi nhánh / kho nào. Chọn chi nhánh ở bảng tham số để xem số của riêng chi nhánh đó; tờ khai nộp cơ quan thuế lập cho cả đơn vị (để trống chi nhánh).
- **Hoá đơn mua vào từ 5 triệu**: muốn được khấu trừ thì cần chứng từ thanh toán không dùng tiền mặt; hoá đơn thiếu chứng từ thì trừ phần thuế khỏi [25].
- **Chi tiết theo thuế suất**: số hoá đơn, giá trị, thuế theo từng nhóm và chỉ tiêu nhóm đó lên.
- **Đối chiếu sổ cái**: [24] với phát sinh Nợ 133, [28] với phát sinh Có 33311, [22] với dư Nợ 133 đầu kỳ.

## Nộp tờ khai

Bấm **Xuất Excel**: một tệp gồm các sheet Tờ khai, Bảng kê bán ra 01-1, Bảng kê mua vào 01-2, Giảm thuế NQ 204 (kèm cột Chi nhánh để đối chiếu nội bộ), sau đó nhập số vào phần mềm khai thuế hoặc cổng thuế điện tử. Phần mềm chưa xuất tệp XML để nộp thẳng: cấu trúc tệp XML của mẫu tờ khai mới chưa được kiểm chứng, nộp tệp sai cấu trúc sẽ bị từ chối.

## Mẫu áp dụng

- Từ **01/7/2026**: mẫu 01/GTGT theo **Thông tư 89/2026/TT-BTC**. Mẫu này thêm [32b] (hàng hoá, dịch vụ bán ra không tính vào giá tính thuế) và [34a] (hàng hoá, dịch vụ bán ra không thuộc phạm vi điều chỉnh của pháp luật thuế GTGT), đồng thời sửa công thức [27] và [34].
- Trước đó: mẫu theo Thông tư 80/2021/TT-BTC. Các mã chỉ tiêu giống nhau, chỉ không có [32b] và [34a].
- Cách kê hàng giảm thuế 8% vào dòng 10% kèm phụ lục là theo hướng dẫn thông dụng *(cần đối chiếu văn bản gốc của Nghị định 174/2025 và Thông tư 89/2026)*.

## Căn cứ pháp lý

Luật Thuế GTGT 48/2024/QH15 (sửa đổi bởi Luật 149/2025/QH15); Nghị định 181/2025/NĐ-CP; Nghị quyết 204/2025/QH15 và Nghị định 174/2025/NĐ-CP (giảm thuế 8% đến hết 31/12/2026); Thông tư 89/2026/TT-BTC (mẫu tờ khai từ 01/7/2026). Xem thêm màn **Căn cứ pháp lý** (TI11).
