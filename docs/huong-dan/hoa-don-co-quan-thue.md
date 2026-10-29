# Hoá đơn từ cơ quan thuế (THUE01) và cảnh báo hoá đơn rủi ro (THUE02)

## Lấy dữ liệu từ cổng hoá đơn điện tử

Phần mềm không tự đăng nhập vào cổng hoá đơn điện tử của cơ quan thuế (cổng đòi tài khoản doanh nghiệp và mã xác nhận). Kế toán tải tệp từ cổng rồi nhập vào THUE01:

| Cách | Trên cổng | Ở THUE01 |
|---|---|---|
| Danh sách hoá đơn | Tra cứu hoá đơn → chọn **Hóa đơn điện tử mua vào** (hoặc bán ra), khoảng ngày → **Xuất excel** | Chọn ô **Hoá đơn** đúng chiều (Mua vào / Bán ra) → **Nhập Excel từ cổng** |
| Từng hoá đơn | Mở hoá đơn → tải tệp **XML** | **Nhập XML hoá đơn** (chọn được nhiều tệp); phần mềm tự nhận mua vào / bán ra theo mã số thuế người bán so với MST đơn vị (HT03) |

Trước khi ghi, màn hiện số hoá đơn đọc được, tổng tiền hàng, tổng thuế, khoảng ngày, các dòng bị bỏ qua và các cột không dùng. Phần mềm tìm dòng tiêu đề có cột "Số hóa đơn" trong 20 dòng đầu, so tên cột không phân biệt hoa thường, có dấu hay không dấu; cổng đổi mẫu cột thì xem danh sách "cột không dùng" để biết.

Hoá đơn nhập lại (cùng người bán, ký hiệu, số) được **cập nhật** theo tệp mới (ví dụ trạng thái đổi từ "Hóa đơn mới" sang "Hóa đơn đã bị thay thế"). Dữ liệu cổng **chỉ để đối chiếu, không ghi sổ**. Nút **Xoá dữ liệu cổng** xoá hoá đơn cổng đã nhập trong khoảng ngày đang xem (để nhập lại), không ảnh hưởng sổ.

## Đối chiếu với sổ hoá đơn

Chọn chiều, khoảng ngày (theo ngày hoá đơn). Mỗi hoá đơn ra một trong các kết quả:

| Kết quả | Nghĩa | Việc cần làm |
|---|---|---|
| Khớp | Có ở cả hai nơi, tiền hàng và tiền thuế lệch không quá 1 đồng | — |
| Lệch tiền | Có ở cả hai nơi nhưng tiền khác nhau | Kiểm tra chứng từ, sửa ở nơi phát sinh hoặc bổ sung thông tin thuế (ACC78) |
| Trên cổng đã huỷ / thay thế | Cổng báo hoá đơn đã bị huỷ, xoá bỏ hoặc bị thay thế, sổ vẫn ghi | Ghi giảm / huỷ chứng từ, lấy hoá đơn thay thế |
| Chưa có trong sổ | Có trên cổng, phần mềm chưa nhận chứng từ | Chọn rồi **Chuyển thành chứng từ nguồn** |
| Không có trên cổng | Sổ có, cổng không có | Kiểm tra số, ký hiệu, MST trên chứng từ; có thể chưa tải đủ dữ liệu cổng |

So khớp theo **ký hiệu hoá đơn (6 ký tự, ví dụ C26TAA) + số hoá đơn**, mua vào thêm **mã số thuế người bán**. Phần mềm tự bỏ ký hiệu mẫu số đứng đầu (1C26TAA), số 0 đầu (0004567) và tách số hoá đơn bị ghi dính ký hiệu (C26TAA4567). Hoá đơn trên cổng đã huỷ / bị thay thế mà sổ cũng không có thì coi là khớp.

Bấm các ô đếm phía trên bảng để lọc theo kết quả. **Xuất Excel** ở bảng để gửi đối chiếu.

### Chuyển hoá đơn chưa có trong sổ thành chứng từ nguồn

Tick các hoá đơn **Chưa có trong sổ**, chọn **Chi nhánh nhận**, bấm **Chuyển … hoá đơn thành chứng từ nguồn**. Mỗi hoá đơn thành một chứng từ nguồn (CN06) loại *Hoá đơn mua vào* (hoặc *bán ra*): đối tượng tìm theo mã số thuế (chưa có thì tạo mới, mã = MST), số tiền = tổng thanh toán. Sau đó lập phiếu ghi tăng công nợ phải trả (CN03) hoặc phải thu (CN02) bằng nút chọn chứng từ nguồn. Hoá đơn đã chuyển hiện "Đã tạo" ở cột Chứng từ nguồn, không chuyển lần hai.

## Cảnh báo hoá đơn rủi ro (THUE02)

Tab **Hoá đơn rủi ro** liệt kê hoá đơn **mua vào** (trong sổ và trên cổng) có ít nhất một dấu hiệu:

| Cảnh báo | Điều kiện |
|---|---|
| Người bán rủi ro | Mã số thuế người bán có trong danh sách người nộp thuế rủi ro, hoá đơn lập từ ngày bắt đầu rủi ro |
| MST sai / Không có MST | Mã số thuế không đúng dạng 10 số (hoặc 10 số -xxx), sai chữ số kiểm tra, hoặc để trống |
| Trên cổng đã huỷ / thay thế | Như ở THUE01 |
| Lệch tiền với cổng | Như ở THUE01 |
| Cổng báo không hợp lệ | Kết quả kiểm tra trên cổng có chữ "không hợp lệ", "sai sót", "từ chối" |
| Không có trên cổng | Sổ có, cổng không có, **chỉ xét các tháng đã nhập dữ liệu cổng** |
| Chưa có trong sổ | Kèm theo một cảnh báo khác, hoá đơn chỉ có trên cổng |

Chưa nhập dữ liệu cổng thì vẫn kiểm được mã số thuế và danh sách người nộp thuế rủi ro.

Tab **Người nộp thuế rủi ro**: khai người bán đã có thông báo của cơ quan thuế (ngừng hoạt động, không hoạt động tại địa chỉ đăng ký / bỏ trốn, tạm ngừng kinh doanh, rủi ro cao). Thêm từng người, hoặc **Nhập từ Excel** với các cột: *Mã số thuế, Tên, Loại rủi ro, Từ ngày, Nguồn, Ghi chú* (Loại rủi ro ghi chữ như "Ngừng hoạt động", "Bỏ địa chỉ kinh doanh", "Tạm ngừng", "Rủi ro cao"). Bấm một dòng để sửa; nút thùng rác để bỏ khỏi danh sách.

Hoá đơn của người bán ngừng hoạt động / bỏ trốn có thể bị cơ quan thuế không cho khấu trừ thuế GTGT đầu vào và không tính vào chi phí được trừ. Kiểm tra kỹ trước khi kê khai khấu trừ.
