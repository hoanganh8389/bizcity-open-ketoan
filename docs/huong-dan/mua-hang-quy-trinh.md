# Quy trình mua hàng

Trang chủ phân hệ **Mua hàng** (bấm biểu tượng Mua hàng ở trang Tổng quan). Mọi việc của phân hệ nằm trên một sơ đồ: nhìn là biết làm gì tiếp theo.

## Việc cần làm

Phần mềm tự rà sổ và chứng từ mỗi lần mở trang, gom các việc tồn đọng. Bấm một việc là mở đúng màn đã lọc sẵn.

| Việc | Mở ra |
|---|---|
| Chứng từ chờ duyệt | Danh sách chứng từ đang chờ duyệt |
| Phiếu còn lỗi chặn duyệt (vượt hạn mức, thiếu lô, trùng hoá đơn, thừa quà…) | Chỉ những phiếu còn lỗi |
| Công nợ quá hạn / đến hạn hôm nay / sắp đến hạn | Hạn mức & công nợ → thẻ Đến hạn |
| Đơn đặt hàng chưa nhận đủ | Danh sách đơn đặt |
| Lô hết hạn / cận date | Lô & hạn dùng |
| Thưởng cuối kỳ chưa lập phiếu | Tính thưởng cuối kỳ |
| Chi phí mua hàng chưa phân bổ | Phân bổ & giá vốn thực tế |
| Quà tặng vượt mức / chưa có giá trị | Sổ quà tặng |
| Phiếu nháp chưa gửi duyệt | Danh sách phiếu nháp |

Không còn việc nào thì trang báo **"Không có việc tồn đọng"**.

## Sơ đồ luồng mua hàng

Sơ đồ đọc **từ trái sang phải** (theo thời gian) và **từ trên xuống dưới** (khai báo → làm → phát sinh). Mọi ô đều bấm được.

### Tầng giữa — luồng chính (7 bước, nối bằng mũi tên)

| Bước | Phần mềm làm sẵn cho bạn |
|---|---|
| 1. **Tồn max** (MH16) | Mức tồn max theo kho từng shop; shop gửi phiếu đăng ký, duyệt là cập nhật mức |
| 2. **Phân tích đặt hàng** (MH02) | Số cần mua tính theo **Công thức đặt hàng** (MH18) đang lưu của chi nhánh — sơ đồ hiện đủ từng thành phần + / − (mặc định: tồn max kho − tồn kho − hàng đi đường về kho − hàng đi đường xuống shop + tổng tồn max shop − tổng tồn shop + bán 7 ngày của mọi shop − SL mua chưa nhập kho); **phân cha – con**: tồn mã con (quà, kẹp quà, mã Z…) cộng vào mã cha, mã con còn nhiều thì mua mã cha ít đi, không bị thừa; chia sẵn theo NCC, bấm một lần là ra đơn |
| 3. **Đơn đặt hàng** | Tự áp chương trình khuyến mại, chiết khấu; giá theo bảng giá NCC; kiểm hạn mức; chụp số liệu tồn lúc lập |
| 4. **Nhập kho khi NCC giao** | Lập từ đơn (chép phần còn thiếu); tự thêm hàng tặng, tính hạn trả; cảnh báo lệch giá, trùng hoá đơn, cận date |
| 5. **Đối chiếu tiến độ nhập** (MH21) | So đơn ↔ phiếu nhập: thiếu, thừa, lệch giá; bắt phiếu nhập ngoài đơn; đơn còn treo |
| 6. **Công nợ & hạn trả** (MH05) | Tính hạn trả theo điều khoản NCC; nhắc nợ đến hạn, quá hạn; chặn duyệt khi vượt hạn mức |
| 7. **Trả tiền NCC** | Gợi ý khoản đến hạn; trả đúng hạn tự hưởng chiết khấu thanh toán; đối trừ tiền đã ứng trước |

Bấm ô bước → mở danh sách / màn của bước đó. Nút **Lập mới** → mở ngay phiếu mới đúng loại. Nhãn vàng / xanh là số phiếu **chờ duyệt** / **nháp**; ô màu đỏ / vàng trong bước là việc tồn đọng của bước đó.

### Tầng trên — khai báo, cấu hình (nét đứt, mũi tên chỉ xuống bước dùng nó)

- Bước 1: **Phân cấp chi nhánh – shop** (MH15: chi nhánh cha đặt NCC, shop con nhận hàng), **Phiếu đăng ký tồn max** (MH17).
- Bước 2: **Công thức đặt hàng** (MH18), **Mặt hàng & phân cha – con** (DM10).
- Bước 3: **Nhà cung cấp & bảng giá** (MH01), **Chính sách & khuyến mại** (MH04).
- Bước 4: **Cài đặt mua hàng** (MH12).

### Tầng dưới — phát sinh bên rìa (treo dưới bước sinh ra nó)

- Đơn đặt hàng → **Ứng trước NCC**.
- Nhập kho → **Chuyển hàng xuống shop** (MH19), **Quà tặng**, **Chi phí mua hàng**, **Lô & hạn dùng**.
- Đối chiếu → **Trả lại / đổi hàng**.
- Công nợ → **Chiết khấu sau mua**, **Thưởng cuối kỳ** (MH06).
- Trả tiền → **Phân bổ & giá vốn thực tế** (MH07).

**In ấn:** mỗi bước in được có dòng **In: …** ghi tên mẫu (đơn đặt: Đơn đặt hàng, Biên bản bàn giao; nhập kho: Phiếu nhập kho 01-VT có giá / A5 / không giá; trả hàng: Phiếu xuất trả, bản 80mm, Phiếu đổi hàng; trả tiền / ứng trước: Phiếu chi, Ủy nhiệm chi; chi phí, CK sau mua, quà…). Cách in: mở phiếu (hoặc chọn phiếu ở danh sách MH03) → bấm **In**, chọn mẫu và khổ giấy. Mẫu mặc định, chữ ký, khổ giấy khai ở ô **Mẫu in chứng từ (HT05)** trên tầng khai báo.

Dải xanh dưới sơ đồ nhắc vòng lặp: hàng bán ở shop làm tồn giảm → Phân tích đặt hàng đề xuất lần đặt kế tiếp.

## Báo cáo, theo dõi

Các báo cáo và màn theo dõi nằm ở menu bên trái (nhóm **Báo cáo mua hàng**, **Nghiệp vụ mua hàng**).

Muốn xem danh sách đầy đủ các chức năng theo nhóm: bấm thẻ **Tất cả chức năng**.
