# Bút toán sổ cái (ACC3)

Danh sách mọi bút toán đã ghi vào sổ cái.

## Lọc

Khoảng ngày (ngày hạch toán), chi nhánh, **tài khoản** (gõ đầu số, ví dụ `511` để lấy mọi bút toán có dòng thuộc tài khoản 511x), số chứng từ / số bút toán / số hoá đơn.

## Đọc bút toán

Bấm một dòng để xem các dòng Nợ/Có. Cột **Cặp** cho biết dòng Nợ và dòng Có nào sinh ra cùng nhau — đây là cơ sở để các sổ in được cột "tài khoản đối ứng". Cột **Phần** cho biết dòng thuộc tiền hàng, thuế, giá vốn hay thanh toán.

## Số bút toán

Dạng `BT26-0000123` (năm 2026). Cấp lúc ghi sổ, liền mạch theo năm.

## Ghi số âm

Nhãn **Ghi số âm** đánh dấu bút toán đảo: cùng tài khoản, cùng bên với bút toán gốc nhưng số tiền âm. Bút toán gốc chuyển trạng thái **Đã đảo**. Hai bút toán này triệt tiêu nhau; số liệu đang hiệu lực là bút toán mới nhất.

## Liên kết bút toán

Mọi quan hệ giữa bút toán mới và bút toán gốc được ghi ở một bảng riêng (**ledger_links**). Bảng này chỉ thêm, không sửa, không xoá. Bảng chỉ để tra cứu, truy vết; không có số tiền, không ảnh hưởng số liệu báo cáo.

| Quan hệ | Khi nào |
|---|---|
| Đảo (ghi số âm) | Sửa, huỷ chứng từ đã ghi sổ: bút toán đảo trỏ về bút toán gốc. Mỗi bút toán chỉ bị đảo một lần. |
| Trả lại hàng | Phiếu hàng bán trả lại, trả hàng nhà cung cấp có chứng từ gốc: bút toán trả hàng trỏ về bút toán bán / mua gốc. |
| Điều chỉnh, quà tặng, thay thế | Dành cho phiếu kế toán điều chỉnh, quà khuyến mại, hoá đơn thay thế. |

Bấm một bút toán, xem phần **Liên kết bút toán** ở cuối: hai chiều (bút toán này trỏ tới đâu, bút toán nào trỏ tới nó). Bấm một dòng để mở bút toán liên kết.

Trả hàng là nghiệp vụ mới (Nợ 5213 / Có 131…), không đảo bút toán bán gốc, để báo cáo vẫn có số "hàng bán bị trả lại"; liên kết chỉ để truy vết.

## Căn cứ pháp lý

Luật Kế toán 88/2015/QH13, Điều 27: bút toán đã ghi không xoá, sửa sai bằng ghi số âm hoặc chứng từ điều chỉnh. Xem thêm màn **Căn cứ pháp lý** (TI11), trang *Sổ kế toán: ghi, khoá, sửa, lưu trữ*.
