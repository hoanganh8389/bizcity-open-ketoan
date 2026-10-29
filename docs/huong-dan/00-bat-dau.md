# Bắt đầu sử dụng

Phần mềm kế toán lấy **sổ cái** làm trung tâm. Chứng từ bán hàng, trả hàng… được hệ thống bán hàng gửi sang tự động qua API; chứng từ nhận về được liệt kê ở **Định khoản tự động (ACC14)**, kế toán chọn chứng từ và bấm **Định khoản** để phần mềm **tự định khoản** theo cấu hình rồi ghi sổ (loại chứng từ nào được đặt chế độ ghi ngay thì tự ghi sổ khi nhận). Kế toán làm việc chủ yếu ở: kiểm tra chứng từ, xem sổ sách, báo cáo thuế, và giữ cấu hình hạch toán đúng.

## Thứ tự thiết lập lần đầu

1. **Danh mục → DM Tài khoản (ACC1)**: kiểm tra tài khoản chi tiết công ty dùng.
2. **Danh mục → Chi nhánh**: khai báo đủ cửa hàng, mã trùng với mã hệ thống bán hàng gửi sang.
3. **Danh mục → Loại thuế (ACC43)**: mã loại thuế (R08, R05, KCT…) trùng với mã trên dòng hàng.
4. **Danh mục → Hình thức thanh toán**: mỗi hình thức (tiền mặt, QR, thẻ…) gắn một tài khoản tiền.
5. **Danh mục → Lý do - Tài khoản (ACC18)**, **Mặt hàng - Tài khoản (ACC17)**, **Tài khoản ngầm định (ACC41)**.
6. Cho hệ thống bán hàng bắt đầu gửi chứng từ; theo dõi ở **Nghiệp vụ kế toán → Định khoản tự động (ACC14)**.

## Một sổ kế toán

Mỗi đơn vị có **một sổ kế toán** (sổ nhật ký chung) gồm mọi chứng từ đã định khoản, kể cả phiếu nội bộ không xuất hoá đơn. Số liệu thuế (chứng từ có hoá đơn) được theo dõi ở **sổ hoá đơn** (bảng kê bán ra, mua vào) và ở **hệ thống thuế** riêng: phiếu bán, phiếu trả có số hoá đơn được chuyển định kỳ sang đó thành chứng từ mới. **Phiếu nội bộ** không vào sổ hoá đơn và không chuyển sang hệ thống thuế.

## Sửa chứng từ đã ghi sổ

Sổ cái **chỉ thêm, không xoá**. Khi hệ thống bán hàng gửi phiên bản mới của chứng từ (hoặc huỷ), lúc định khoản lại phần mềm ghi một **bút toán ghi số âm** để đảo bút toán cũ rồi ghi bút toán mới. Số phát sinh trên báo cáo vẫn là số thuần; lịch sử còn nguyên để tra lại.

## Mở hộp thoại: xem trước, bấm Sửa mới sửa

- Bấm đúp một dòng: hộp thoại mở ở chế độ **Đang xem**, mọi ô bị khoá để tránh sửa nhầm. Bấm **Sửa** ở thanh công cụ (Ctrl+E): mở thẳng chế độ sửa.
- Muốn sửa: bấm **Sửa** ở chân hộp thoại, hoặc nhấn **Enter** / **F2** (bấm đúp vào nội dung không mở sửa — tránh sửa nhầm). Sửa xong bấm **Ghi**: hộp thoại không đóng mà quay về **Đang xem** với dữ liệu vừa lưu. Bấm **Thoát** để đóng.
- Khi đang xem, các ô hiện như chữ thường cho dễ đọc. Nút **Xoá**, **In**, **Huỷ phiếu** vẫn có ở chân hộp thoại.
- Thêm mới thì hộp thoại mở sẵn để nhập.
- Khi đang xem vẫn chuyển thẻ, mở Hướng dẫn, in phiếu được.

## Bảng dễ nhìn, kéo giãn cột

- Mọi bảng có kẻ đủ đường cột / dòng, tiêu đề có nền, dòng xen màu.
- Rê chuột lên tiêu đề cột: mép phải hiện **vạch xanh** — đó là chỗ kéo giãn cột.

## Di chuyển bằng phím trong bảng

- Đang ở một ô nhập trong bảng: **↑ / ↓** (hoặc **Enter**) sang ô cùng cột ở dòng trên / dưới, như Excel. Chữ trong ô được chọn sẵn để gõ đè.
- Ô chọn có danh sách thả xuống (mã hàng, NCC…): ↑ ↓ dùng để chọn trong danh sách.

## Kéo giãn cột mọi bảng

- Rê chuột vào **mép phải tiêu đề cột**, con trỏ đổi thành ↔, kéo để đổi độ rộng. Thu hẹp được nhỏ hơn độ dài chữ; chữ dài sẽ hiện "…".
- Kéo hẹp được tới khoảng **1 cm** (chữ dài tự ẩn thành "…") để xem nhiều cột cùng lúc, không phải cuộn ngang.
- **Bấm đúp vào mép** để trả bảng về độ rộng tự động.
- Độ rộng được nhớ theo màn hình: mở lại vẫn giữ.

## Menu chức năng

Thanh menu **bên trái** giống bảng điều khiển kế toán quen dùng, cùng tên, cùng thứ tự 10 nhóm: Nghiệp vụ kế toán · Nghiệp vụ thuế · Nghiệp vụ TSCĐ và CCDC · Báo cáo chung · Báo cáo công nợ · BC Quỹ & ngân hàng · Báo cáo thuế · BC TSCĐ và CCDC · Danh mục · Tiện ích. Sau cùng là nhóm **Bán hàng** (báo cáo bán hàng từ cửa hàng) và **Hệ thống** (người dùng, khoá API).

- Bấm tên nhóm để mở / thu gọn. Nhóm của màn đang xem tự mở; các nhóm bạn đã mở được nhớ cho lần sau.
- Mỗi chức năng có **mã quen** (ACC65, ACC88…) ở bên phải, cũng hiện cạnh tiêu đề màn hình.
- Chức năng ghi **"chưa có"** (chữ mờ) là chức năng phần mềm chưa làm trong phiên bản này.
- Nút **Thu gọn** ở đáy menu để dành chỗ cho bảng số liệu rộng; bấm biểu tượng ở mép trái để mở lại.

## Chọn tài khoản, đối tượng, mã hàng (không cần nhớ số)

Các ô **Tài khoản**, **TK đối ứng**, **Đối tượng / Khách hàng / Nhà cung cấp**, **Mã hàng**, **Khoản mục, Bộ phận, Hợp đồng** đều có danh sách gợi ý:

- **Bấm vào ô** là hiện danh sách dạng *số — tên*. Ví dụ 111 — Tiền mặt, 1311 — Phải thu của khách hàng.
- **Gõ số hoặc chữ để lọc**: gõ `13` ra các tài khoản bắt đầu bằng 13; gõ `tien mat` (không dấu cũng được) ra Tiền mặt. Đối tượng tìm được theo mã, tên hoặc mã số thuế.
- **↑ ↓** để chọn dòng, **Enter** để lấy, **Esc** để đóng. Người đã thuộc số vẫn gõ thẳng mã rồi Enter như cũ.
- Chọn xong, tên hiện mờ ngay trong ô để biết mình đang xem gì.
- Ở báo cáo, chọn được cả tài khoản tổng hợp (in đậm, ghi "TK tổng hợp"): chọn 111 là xem gộp 1111, 1112… Khi nhập phiếu chỉ hiện tài khoản chi tiết.
- Ô nhận nhiều tài khoản (ví dụ *Tài khoản tiền* ở Bảng kê số dư tiền): chọn lần lượt, các mã tự nối bằng dấu phẩy.

## Bảng số liệu (lọc, sắp xếp như Excel)

Mọi danh sách, sổ, báo cáo dùng chung một kiểu bảng:

- **Hàng lọc** ngay dưới tiêu đề cột: gõ vào ô của cột nào thì lọc theo cột đó, không cần gõ dấu, không phân biệt hoa thường. Lọc nhiều cột cùng lúc được.
  - Cột số tiền, số lượng: gõ `>1000000`, `<0`, `>=5`, `=0`, `<>0` hoặc khoảng `100000..500000`; gõ một số thì tìm các ô có chứa chữ số đó.
  - Cột ngày: gõ `05/10` hoặc `10/2026`.
- **Lọc nhanh theo giá trị**: bấm biểu tượng phễu cạnh tên cột → hiện danh sách các giá trị của cột kèm số dòng; tích chọn giá trị cần xem (có ô tìm, "Chọn tất cả"), bấm **Đồng ý**. Cột đang lọc có phễu tô màu; "Bỏ lọc cột" để bỏ.
- Bấm **tiêu đề cột** để sắp xếp tăng dần, bấm lần nữa để giảm dần, lần thứ ba bỏ sắp xếp.
- Nút **Xuất Excel** ngay trên bảng: xuất ra tệp `.xlsx` **đúng những gì đang thấy** — cột đang hiện, dòng đã lọc, thứ tự đã sắp, kèm dòng tên báo cáo và dòng tổng; số tiền là số thật, cộng trừ được trong Excel. (Nút "Xuất Excel" ở góc trên màn hình vẫn xuất toàn bộ số liệu của kỳ theo mẫu cố định.)
- Khi đang lọc hoặc sắp xếp: dòng tiêu đề nhóm, dòng cộng nhóm, dòng số dư đầu kỳ / cuối kỳ tạm ẩn để bảng thành danh sách phẳng; dòng **Tổng cộng** cộng lại theo các dòng đang hiện (ghi "đang lọc"). Nút **Bỏ lọc, sắp xếp** trả bảng về như cũ.
- **Kéo mép phải** tiêu đề cột để giãn hoặc thu cột. Nút **Cột** để ẩn / hiện cột (một số cột phụ như chi nhánh, khoản mục, hợp đồng ẩn sẵn). Bảng nhớ độ rộng và cột ẩn cho lần sau; "Trả về mặc định" để đặt lại.
- Tiêu đề cột và dòng tổng luôn hiện khi cuộn; bảng rộng có **thanh cuộn ngang** ở đáy bảng.
- Bấm một dòng: dòng được tô xanh (dòng đang chọn) và mở chi tiết (bút toán, chứng từ gốc…).
- Không có phân trang: mọi danh sách, sổ, báo cáo hiện **toàn bộ** kết quả theo khoảng ngày và các ô lọc phía trên. Bảng dài (hàng chục nghìn dòng) vẫn cuộn mượt vì chỉ vẽ phần đang thấy; lọc, sắp xếp, dòng tổng và Xuất Excel tính trên toàn bộ.

## Làm việc nhiều thẻ

Mỗi màn mở ra thành một **thẻ** ở phía trên vùng làm việc, mở được nhiều màn cùng lúc.

- Bấm vào thẻ để chuyển màn. Màn cũ **giữ nguyên** ô lọc và số liệu đang xem, không phải tìm lại.
- Bấm **×** trên thẻ (hoặc bấm chuột giữa vào thẻ) để đóng. Đóng thẻ đang xem thì tự chuyển sang thẻ bên cạnh.
- **Chuột phải** vào thẻ: Đóng thẻ này · Đóng các thẻ khác · Đóng tất cả.
- Bấm vào một dòng để xem chi tiết ở màn khác (ví dụ từ Sổ tổng hợp công nợ sang Sổ chi tiết công nợ của một khách) cũng mở thành thẻ mới.
- Tải lại trang (F5) vẫn giữ các thẻ đang mở. Mở tối đa 20 thẻ; quá thì thẻ mở lâu nhất tự đóng.

## Mẹo thao tác nhanh

- **Tìm chức năng**: bấm biểu tượng kính lúp ở góc trên phải (hoặc Ctrl + K), gõ số mã (`65`, `10`, `88`) hoặc một phần tên không cần dấu (`thue ra`, `ket chuyen`), rồi Enter.
- **Chọn nhanh kỳ**: ô **Kỳ** ở mọi báo cáo có sẵn Hôm nay, Tháng này, Tháng trước, Quý này, Quý trước, Năm nay, Năm trước. Vẫn sửa được từng ngày ở hai ô bên cạnh.
- **Kỳ được nhớ**: đã chọn kỳ ở một báo cáo thì mở báo cáo khác vẫn là kỳ đó, không phải chọn lại.
- **Chọn nhiều chi nhánh**: danh sách **Chi nhánh** trong bảng lọc bên trái cho tích nhiều cửa hàng cùng lúc, có ô tìm theo mã hoặc tên; ô **Chọn** ở đầu danh sách tích / bỏ tích tất cả. Bấm **Tìm kiếm** để xem theo các chi nhánh đã tích.
  - **Nhớ theo màn**: mỗi màn nhớ các chi nhánh đã tích lần trước (trên máy đang dùng); mở lại màn đó là tự tích lại. Màn nào nhớ màn nấy.
  - **Chọn nhanh** (nút ở dòng cuối danh sách): tích các chi nhánh cần dùng chung, bấm **Chọn nhanh → Lưu bộ chọn mới**, đặt tên (ví dụ "Chi nhánh Phú Thọ"). Ở bất kỳ màn nào, bấm **Chọn nhanh** rồi bấm tên bộ là tích đúng các chi nhánh đó; danh sách vẫn hiện đủ mọi chi nhánh để tích thêm, bỏ bớt. Lưu trùng tên thì thay bằng các chi nhánh đang tích; nút × để xoá bộ. Bộ đang khớp với các ô tích được tô màu.
- **In**: nút **In** ở góc phải mỗi màn in đúng bảng đang xem (khổ A4 ngang, có tên đơn vị và ô chữ ký). Phiếu thu, chi, báo nợ, báo có in bằng nút **In phiếu** trong hộp phiếu.
- **Xem nguồn gốc con số**: bấm vào dòng trên sổ để mở bút toán, từ bút toán mở tiếp chứng từ gốc.

