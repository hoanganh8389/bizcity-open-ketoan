# Hỏi đáp thường gặp

Mỗi mục bắt đầu bằng dòng `## Câu hỏi`. Thêm câu hỏi mới: viết thêm một mục `##` vào tệp này (hoặc tạo tệp `.md` khác trong thư mục `docs/tro-ly/`), trợ lý tự hiện.

Không cần sửa mã nguồn: người có quyền sửa danh mục thêm câu hỏi, hướng dẫn, ảnh ở **Trợ lý (TI12) → Dữ liệu huấn luyện**. Dữ liệu đó lưu tệp `<DATA_DIR>/tro-ly/<mã công ty>.jsonl` (ảnh ở `img/`), ổ Docker `appdata`, sao lưu cùng `scripts/sao-luu.sh`.

## Chứng từ từ cửa hàng về đâu, khi nào vào sổ?

Mọi phiếu từ cửa hàng (bán, hoàn, thu chi theo đơn, nhập mua, trả nhà cung cấp, chuyển kho, điều chỉnh tồn, xuất điều chỉnh) về trạm **Định khoản tự động (ACC14)** ở trạng thái **Chờ định khoản**. Kế toán bấm vào phiếu để **xem trước bút toán**, đúng thì bấm **Định khoản** (một phiếu) hoặc tích nhiều phiếu rồi **Định khoản các chứng từ đã chọn**. Chỉ phiếu đã duyệt ở cửa hàng mới được kéo về.

## "Chờ định khoản lại (sổ theo v1)" là gì?

Phiếu đã định khoản ở phiên bản cũ, sau đó cửa hàng **sửa phiếu** nên phiếu lên phiên bản mới. Sổ vẫn đang theo phiên bản cũ cho tới khi kế toán bấm **Định khoản lại**: bút toán nào thay đổi thì được ghi số âm để đảo rồi ghi bút toán mới; bút toán không đổi giữ nguyên.

## "Chờ huỷ" là gì? Phiếu xoá ở cửa hàng có tự mất khỏi sổ không?

Không tự mất. Phiếu bị xoá hoặc bỏ duyệt ở cửa hàng sẽ hiện **Chờ huỷ (phiếu đã xoá ở nguồn)** ở ACC14. Kế toán kiểm tra rồi bấm **Định khoản huỷ**: các bút toán của phiếu được ghi số âm (không xoá dòng sổ), giữ đủ lịch sử.

## Vì sao bút toán bị "Đã đảo" và có bút toán "Ghi số âm"?

Sổ cái **chỉ được thêm, không được sửa xoá**. Khi chứng từ đổi (sửa, định khoản lại, huỷ), bút toán cũ được đánh dấu **Đã đảo** và có một bút toán **Ghi số âm** triệt tiêu nó, rồi mới ghi bút toán mới. Ở **Sổ nhật ký chung (ACC89)** chọn "Bút toán hiển thị" để xem cả bút toán đã đảo; bấm một dòng rồi bấm **Lịch sử thay đổi** để xem đủ các lần thay đổi.

## Lý do (XBA, XCN, XSD1…) dùng để làm gì?

Lý do quyết định **tài khoản đối ứng, doanh thu, chi phí** của bút toán (danh mục **Lý do - Tài khoản, ACC18**). Cùng một phiếu xuất hàng, đổi lý do là đổi bút toán. Tài khoản lấy theo thứ tự: lý do → nhóm hạch toán của mặt hàng (ACC17) → tài khoản ngầm định (ACC41). Dùng thẻ **Luồng bút toán** của trợ lý để xem một lý do ghi Nợ / Có tài khoản nào.

## Vì sao phiếu bán có dòng giá vốn 0 đồng?

Giá vốn tính theo **bình quân gia quyền cuối tháng** cho từng nhóm tính giá (đơn vị hạch toán). Lúc định khoản chưa có đơn giá vốn, nên mỗi mặt hàng của phiếu có sẵn một cặp dòng giá vốn **0 đồng** (Nợ giá vốn hoặc chi phí theo lý do / Có kho). Chạy **Tính giá vốn (ACC49)** cuối tháng thì phần mềm **ghi đè số tiền** = số lượng × đơn giá lên chính các dòng đó; tính lại cũng ghi đè, không sinh bút toán ghi số âm.

## Phiếu xuất điều chỉnh, chuyển kho, điều chỉnh tồn định khoản xong sao bút toán toàn 0 đồng?

Các phiếu này thường chỉ có số lượng. Định khoản xong thì thẻ kho đã ghi số lượng, sổ cái có sẵn các dòng theo từng mặt hàng với số tiền **0 đồng**. Chạy **Tính giá vốn (ACC49)** thì số tiền được ghi đè theo đơn giá vốn.

## Hàng khuyến mãi, hàng thuế 0% / không chịu thuế có lên sổ không?

Có. Mọi dòng hàng của phiếu bán, hoàn, mua, trả nhà cung cấp, chuyển kho, điều chỉnh, xuất điều chỉnh đều ghi đủ các cặp Nợ / Có **theo từng mặt hàng, kể cả khi số tiền bằng 0**: hàng khuyến mãi có cặp tiền hàng 0 và thuế 0, hàng thuế 0% / không chịu thuế có cặp thuế 0 mang mã thuế. Giá vốn hàng khuyến mãi ghi vào tài khoản chi phí khuyến mãi theo lý do, số tiền có khi chạy **Tính giá vốn (ACC49)**. Riêng dòng thu chi tiền bằng 0 thì không ghi.

## Chiết khấu cho khách hạch toán thế nào?

Chiết khấu ghi ngay trên hoá đơn: doanh thu ghi theo **tiền đã trừ chiết khấu**, thuế tính trên số đã trừ; không có bút toán chiết khấu riêng. Kho vẫn giảm đúng theo giá vốn, không phụ thuộc giá bán.

## Đổi trả tại quầy (trả hàng rồi lấy hàng khác) ghi thế nào?

Phiếu hoàn ghi giảm doanh thu và thuế, Có công nợ khách; phiếu bán mới ghi Nợ công nợ khách. Phần tiền hàng trả lại được **đối trừ** với phiếu bán mới (không có phiếu chi), khách chỉ trả thêm phần chênh bằng phiếu thu. Xem ở thẻ **Lịch sử thanh toán** của phiếu bán / phiếu hoàn.

## Muốn biết một hoá đơn đã thu tiền chưa, còn nợ bao nhiêu?

Mở hoá đơn (từ ACC14, BH02…), chọn thẻ **Lịch sử thanh toán**: liệt kê phiếu thu, phiếu chi trả khách, phần đối trừ, kèm trạng thái và dòng **Còn phải thu**. Ở **Tổng hợp bán hàng (BH02)** cách xem **Theo phiếu** có cột **Còn nợ**. Phiếu thu chưa định khoản thì chưa tính là đã thu.

## Thuế đầu vào và đầu ra dùng mã nào?

Bán và hàng bán trả lại dùng mã **R05, R08, R10** (thuế đầu ra, 33311). Nhập mua và trả hàng nhà cung cấp dùng mã **V05, V08, V10** (thuế đầu vào, 1331). Danh mục ở **Loại thuế (ACC43)**.

## Ngày lọc mặc định khi mở màn là gì?

Màn danh sách, nhật ký mở ra lấy **hôm nay** cho nhẹ. Báo cáo theo kỳ (báo cáo tài chính, cân đối, thuế, nhập xuất tồn…) lấy **đầu tháng đến hôm nay**. Trong một lần đăng nhập, kỳ bạn đã chọn ở một màn được dùng cho các màn mở sau.

## Tìm nhanh một màn bằng cách nào?

Gõ mã hoặc tên vào ô **Tìm chức năng** trên thanh trên cùng (hoặc bấm **Ctrl + K**), ví dụ gõ `89` ra Sổ nhật ký chung. Màn hay dùng thì bấm biểu tượng ghim cạnh tên ở menu để đưa lên thanh trên cùng.
