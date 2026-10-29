# Kiểm tra chứng từ, hoá đơn (ACC93)

Rà một lượt các trường hợp **dễ làm số liệu lệch** trước khi đối chiếu với bên phát hành hoá đơn điện tử hoặc với hệ thống bán hàng. Nên xem màn này trước khi chốt số thuế và trước khi khoá sổ.

Mỗi mục có nhãn xanh (không có gì cần xử lý) hoặc nhãn vàng kèm số trường hợp.

| Mục | Ý nghĩa | Cách xử lý |
|---|---|---|
| 1. Chứng từ lỗi, chưa ghi sổ | Chứng từ đã nhận nhưng chưa vào sổ, nên **thiếu trong mọi báo cáo** | Bấm vào dòng, đọc lý do lỗi (thường thiếu cấu hình tài khoản), sửa cấu hình rồi chạy **Định khoản tự động (ACC14)** cho khoảng ngày đó |
| 2. Số hoá đơn trùng | Cùng ký hiệu và số hoá đơn nằm trên nhiều chứng từ bán | Kiểm tra ở hệ thống bán hàng: một trong các chứng từ đang gắn sai số hoá đơn |
| 3. Số hoá đơn nhảy cóc | Trong dải số đã nhận của một ký hiệu còn thiếu số | Hoá đơn thiếu có thể chưa gửi sang, bị huỷ, hoặc thuộc chi nhánh / kỳ khác. Bỏ lọc chi nhánh và nới khoảng ngày để kiểm tra lại |
| 4. Hoá đơn bị thay thế, điều chỉnh, huỷ | Hoá đơn không còn ở trạng thái bình thường | Kiểm tra hoá đơn thay thế / điều chỉnh tương ứng đã về chưa |
| 5. Phiếu bán, trả lại không có hoá đơn | Có trên sổ kế toán nhưng không lên bảng kê bán ra, không chuyển sang hệ thống thuế | Bình thường với phiếu nội bộ; bất thường nếu lẽ ra phải xuất hoá đơn |
| 6. Phiếu trả lại không nối được phiếu gốc | Phiếu trả hàng (bán, mua) không gửi mã phiếu gốc, phiếu gốc chưa nhận, hoặc phiếu gốc đã huỷ | Phiếu trả vẫn ghi sổ đủ. Kiểm tra ở hệ thống gửi: gửi bổ sung phiếu gốc, hoặc gửi lại phiếu trả kèm mã phiếu gốc |
| 7. Chứng từ lệch bút toán | Chứng từ đã ghi sổ mà không còn bút toán hiệu lực, hoặc đã huỷ mà còn bút toán hiệu lực | Bình thường luôn khớp. Có dòng thì báo người quản trị |
| 8. Sổ tổng hợp lệch sổ chi tiết | Số phát sinh theo ngày khác tổng các dòng bút toán (theo chi nhánh, tài khoản, ngày) | Bình thường luôn khớp. Có dòng thì báo người quản trị |

## Lưu ý

- Mỗi mục hiện tối đa 200 dòng đầu.
- Mục 3 chỉ xét hoá đơn bán, tính trong khoảng ngày và chi nhánh đang lọc. Số hoá đơn có chữ ở đầu (ví dụ `C26TNH31079`) được tách phần số ở cuối để xét liền số; phần chữ ghép vào cột Ký hiệu. Lọc một chi nhánh mà ký hiệu dùng chung nhiều chi nhánh thì sẽ thấy nhảy số nhiều: đó là số của chi nhánh khác.
- Bấm vào dòng chứng từ để mở chứng từ gốc.

## Đối chiếu chi tiết từng hoá đơn

Dùng **Báo cáo bán hàng (BH01)**, lọc Phạm vi = "Có hoá đơn", rồi **Xuất Excel**. Tệp có đủ ký hiệu, số hoá đơn, số chứng từ, mã hàng, số lượng, tiền hàng, thuế suất, tiền thuế từng dòng để so với bảng kê chi tiết của bên phát hành hoá đơn.
