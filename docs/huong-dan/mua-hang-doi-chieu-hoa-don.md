# Đối chiếu hoá đơn (MH31)

Phiếu nhập mua chia theo **tình trạng hoá đơn đầu vào**, theo kế hoạch hoá đơn khai ở đơn đặt hàng (ô **Hoá đơn**: Cùng hàng / Nhận sau N ngày / Không lấy).

## Các ô đầu màn

| Ô | Ý nghĩa |
|---|---|
| Quá hạn HĐ | Đơn hẹn nhận hoá đơn sau N ngày, đã quá hạn mà phiếu nhập chưa có hoá đơn |
| Thiếu HĐ | Hoá đơn đi cùng hàng nhưng phiếu nhập chưa ghi số hoá đơn |
| Chờ HĐ | Đơn hẹn nhận hoá đơn sau, còn trong hạn |
| Đã có HĐ | Phiếu nhập đã ghi số hoá đơn (kèm tình trạng đối soát ở MH22: khớp / lệch) |
| Không lấy HĐ | Đơn khai không lấy hoá đơn — không theo dõi |
| HĐ chưa có phiếu nhập | Hoá đơn NCC đã nhập ở MH22 nhưng chưa gắn phiếu nhập nào |

Mỗi ô có số phiếu và tổng tiền. Bấm ô để xem danh sách. Hạn hoá đơn tính từ **ngày nhận hàng**.

## Gắn hoá đơn

- Phiếu chưa có hoá đơn: cột **Hoá đơn** gợi ý các hoá đơn cùng NCC chưa gắn phiếu, tiền gần nhất lên đầu (**✓ / khớp tiền** khi lệch không quá 0,5%). Chọn rồi bấm **Gắn**.
- Ô **HĐ chưa có phiếu nhập**: làm ngược lại — chọn phiếu nhập chờ hoá đơn của NCC đó rồi **Gắn**.
- Phiếu **chưa duyệt**: chỉ ghi số / ký hiệu / ngày hoá đơn vào phiếu.
- Phiếu **đã ghi sổ**: phần mềm lập điều chỉnh, ghi hoá đơn và duyệt lại ngay (đảo bút toán cũ, ghi bút toán mới có hoá đơn — thuế đầu vào theo hoá đơn). Nếu phiếu còn cảnh báo chặn duyệt thì không gắn, phiếu giữ nguyên — mở phiếu để xử lý.

NCC chưa có hoá đơn nào để gắn: nhập hoá đơn ở **MH22 Hoá đơn đầu vào của NCC** (Excel, XML, quét) trước.
