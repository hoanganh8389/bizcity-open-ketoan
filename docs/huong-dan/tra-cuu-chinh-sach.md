# Tra chính sách theo mã hàng (TC01)

<!-- [2026-11-20 khanhtd] TRA-CUU — hướng dẫn màn TC01 của phân hệ Tra cứu (modules/tra-cuu) -->

Trả lời câu hỏi: **"Mua mã này thì được những chiết khấu / khuyến mại nào, cái nào đang áp, cái nào bị chặn, vì sao?"** — mà không phải mở từng chính sách hay lập thử phiếu.

**Mở ở đâu:** menu **Tra cứu → Tra chính sách theo mã hàng** (TC01). Từ form chính sách (MH04), khung cảnh báo *Áp riêng* có link từng mã mở thẳng màn này.

**Quyền:** *Chính sách mua hàng — xem* (`mua-hang:chinh-sach-xem`) — ai xem được Chính sách mua hàng (MH04) thì tra được.

## Cách dùng

1. **Mã hàng** (bắt buộc): gõ mã hoặc tên.
2. **Nhà cung cấp**: danh sách là các NCC có chính sách hoặc có giá mua của mã này; mặc định NCC đầu tiên.
3. **Số lượng**, **ĐVT**: như dòng phiếu nhập (mặc định 1, ĐVT mua mặc định). Đổi SL để xem bậc chiết khấu, mua X tặng Y.
4. **Đơn giá**: trống = giá mua của NCC còn hiệu lực ở ngày phiếu. Chưa có giá mua thì nhập tay — không có giá thì chiết khấu % ra 0đ.
5. **Chi nhánh**: chính sách khai theo chi nhánh chỉ khớp khi chọn đúng chi nhánh nhập.
6. **Ngày phiếu**: trống = hôm nay; chính sách lấy bản có hiệu lực ngày đó.

Sửa SL / đơn giá: rời ô hoặc Enter là tra lại.

## Đọc kết quả

Dòng trên cùng là **phiếu nhập thử**: SL × đơn giá, CK dòng, CK trên đơn, tiền sau CK, giá vốn thực tế / ĐVT, quà. Phần mềm tính bằng đúng bộ máy của phiếu nhập thật — lập phiếu thật cùng số liệu sẽ ra cùng số. **Không lưu gì, không vào sổ.**

Bảng chính sách, mỗi dòng một trạng thái:

| Trạng thái | Nghĩa | Muốn đổi |
|---|---|---|
| **Đang áp** | Đang giảm tiền / tặng quà cho dòng này. *thắng áp riêng* = chương trình áp riêng được chọn cho mã | — |
| **Chưa đủ điều kiện** | Khớp mã nhưng chưa đạt SL tối thiểu / tổng đơn — cột *Vì sao* ghi mua thêm bao nhiêu | Tăng SL thử lại |
| **Bị áp riêng chặn** | Mã đang nhận một chương trình *áp riêng* khác, nên chính sách này không áp | Bỏ tích Áp riêng của chương trình kia, hoặc tích Áp riêng ở chính sách này và đặt ưu tiên cao hơn |
| **Không dùng** | Khớp mã nhưng phần mềm lấy nguồn khác: chiết khấu dòng chỉ lấy **một** nguồn (bảng CK theo mã → bậc số lượng → CK trên đơn riêng mã); CK trên đơn chỉ lấy **một** chính sách (phạm vi hẹp hơn / ưu tiên cao hơn) | Sửa phạm vi / ưu tiên ở MH04 |

- Cột **Đang giảm**: số tiền chính sách đó đang giảm trên phiếu thử. Dòng *Cộng* = tổng chiết khấu.
- Cột **Nếu chỉ mình nó**: giảm / tặng bao nhiêu khi chỉ có chính sách đó — để so trước khi chọn *Áp riêng* hay đặt ưu tiên.
- Hai chương trình áp riêng trở lên cùng khớp: khung **Áp riêng** nói vì sao cái thắng thắng (ưu tiên cao hơn; bằng nhau thì lợi hơn; vẫn bằng thì theo mã chính sách).
- **Chính sách khác áp cho mã / NCC này** (CKTT, hạn thanh toán, hạn mức, thưởng…): không tính theo dòng lúc lập phiếu, không xét áp riêng — chỉ liệt kê.

Sửa chính sách ở [Chính sách mua hàng (MH04)](mua-hang-chinh-sach.md). Ý nghĩa *Áp riêng*, *Cộng dồn*, *Ưu tiên*: mục *Cách áp* của [hướng dẫn Chính sách mua hàng](mua-hang-chinh-sach.md).
