# Nhập dữ liệu khởi đầu (MH20)

Màn này đưa số liệu từ **tệp Excel của phần mềm cũ** vào ERP, để chạy thử hoặc để bắt đầu dùng. Màn có 3 thẻ. Thẻ nào cũng làm theo cùng các bước:

1. **Chọn tệp** (hoặc kéo thả tệp vào).
2. Chọn **Sheet**. Phần mềm tự chọn sheet có đủ cột cần.
3. Bấm **Phân tích** để xem trước. Bước này **chưa ghi** gì.
4. Bấm nút **Ghi** (hoặc **Tạo phiếu**) để ghi thật.

Phần mềm nhận cột **theo tên tiêu đề**, không cần đúng thứ tự cột. Dòng phía trên tiêu đề (tên báo cáo, ngày…) tự bỏ qua. **Chạy lại bao nhiêu lần cũng được**: dữ liệu đã có thì bị ghi đè.

Cột **Kho** là **mã kho** ở Danh mục kho (DM12), ví dụ `02008` hoặc `08-HH`. Nếu không có kho mang mã đó, phần mềm tìm chi nhánh có mã trùng hoặc bắt đầu bằng mã đó (ví dụ `00001` → `00001Premium`), rồi dùng kho mặc định của chi nhánh. Mã kho bị Excel làm mất số 0 ở đầu (`2008`) cũng tự được bù lại thành `02008`.

## ① Giá mua theo NCC

- **Tệp**: các dòng phiếu nhập (Excel xuất từ màn phiếu nhập / hàng mua).
  - Cột bắt buộc: **Mã NCC, Mã hàng, Số lượng, TT trước VAT**.
  - Cột nên có: *Nhà cung cấp* (dùng để tạo NCC mới), *Tên hàng*, *ĐVT*, *Ngày tạo*.
- **Cách tính**:
  - Mỗi bộ NCC × mã hàng × ĐVT lấy **dòng mới nhất** (theo Ngày tạo). Nếu tệp không có ngày thì lấy dòng nằm dưới cùng.
  - **Giá = TT trước VAT ÷ Số lượng** (giá chưa VAT).
  - Bỏ các dòng có **TT < 1đ**: đó là dòng trả hàng hoặc hàng tặng.
- **ĐVT**:
  - Nếu tệp có cột ĐVT thì giá tính theo đúng ĐVT đó. Mặt hàng phải đã khai ĐVT này ở DM10, nếu chưa thì dòng báo lỗi.
  - Nếu tệp không có cột ĐVT thì giá tính theo ĐVT nhỏ nhất.
- **Khi ghi**:
  - NCC chưa có thì phần mềm tự tạo.
  - Giá được ghi vào **Mặt hàng & giá mua** của NCC và **đè giá cũ** cùng NCC × mã × ĐVT.
  - Giá không đổi thì bỏ qua.
  - Mã chưa có trong danh mục mặt hàng thì báo lỗi và không ghi.

## ② Cân tồn kho (phiếu điều chỉnh tự động)

- **Tệp**: tồn kho theo mặt hàng. Cột bắt buộc: **Kho, Mã hàng, Số lượng**. Số lượng ở đây là tồn đúng.
- **Phân tích**:
  - Phần mềm so tồn trong tệp với **tồn trên sổ ERP của đúng kho đó** và ra **Điều chỉnh = Tồn theo tệp − Tồn trên sổ**.
  - Nếu tích **Mã không có trong tệp → cân về 0**: mã đang có tồn trên sổ ở kho đó nhưng tệp không có thì được đưa về 0.
- **Màn hình**:
  - Bảng **Theo kho** cho biết mỗi kho có bao nhiêu mã tăng, giảm, đã khớp. Tích những kho muốn tạo phiếu.
  - Bảng **Chi tiết từng mã**: bấm **Xem** ở một kho để chỉ xem kho đó. Lọc nhanh bằng các ô màu (tăng / giảm / có chênh lệch / đã khớp / lỗi).
- **Tạo phiếu điều chỉnh**:
  - Mỗi kho được tạo **một phiếu điều chỉnh kho**. Mỗi dòng mang số có dấu: **+** là tăng, **−** là giảm. Phiếu **ghi sổ ngay** theo ngày chọn.
  - Giá trị của phiếu được tính khi chạy giá vốn tháng.
  - Ghi xong, phân tích lại thì phải không còn chênh lệch.
- Kho trong tệp không có ở DM12 thì bị bỏ qua và có cảnh báo. Khai kho xong thì phân tích lại.

## ③ Tồn max

- **Tệp**: cột bắt buộc là **Kho, Mã hàng, Tồn max**. Có thể dùng chính tệp tồn kho theo mặt hàng có cột Tồn max.
- **Khi ghi**: phần mềm ghi vào **Tồn max (MH16)** theo chi nhánh – kho – mã, với tồn min = 0. Mức cũ thì bị đè.
- Dòng có ô Tồn max trống thì bỏ qua (khác với max = 0).
- Kho hoặc mã không có trong danh mục thì báo lỗi và không ghi.

## Thứ tự nên làm khi bắt đầu một chi nhánh

1. **Phân cấp chi nhánh – shop (MH15)**.
2. **① Giá mua**.
3. **② Cân tồn**: tồn trên sổ khớp số thực tế.
4. **③ Tồn max**.
5. Sau đó mới chạy **Phân tích đặt hàng (MH02)** và **Chuyển hàng xuống shop (MH19)**.
