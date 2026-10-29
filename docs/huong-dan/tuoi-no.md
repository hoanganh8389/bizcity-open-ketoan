# Công nợ theo tuổi nợ (ACC67, ACC67A, ACC67B) và Sổ công nợ theo hạn thanh toán (ACC39)

## Tuổi nợ trước và quá hạn (ACC67, ACC67A, ACC67B)

Tại một ngày, mỗi đối tượng còn nợ bao nhiêu, chia theo **số ngày còn tới hạn** (trước hạn, TH) và **số ngày đã quá hạn** (QH) của từng chứng từ.

| Màn | Cột |
|---|---|
| ACC67 Tuổi nợ trước và quá hạn | Mã, Tên khách hàng, Tổng nợ, Không có hạn nợ, TH 1 - 30 … TH Trên 120, Tổng trước hạn, QH 1 - 30 … QH Trên 120, Tổng quá hạn |
| ACC67A Tuổi nợ trước hạn | Mã, Tên khách hàng, Không có hạn nợ, TH 1 - 30 … TH Trên 120 |
| ACC67B Tuổi nợ quá hạn | Mã, Tên khách hàng, Không có hạn nợ, QH 1 - 30 … QH Trên 120 |

**Ô lọc** (bảng bên trái): Số tài khoản (`131` mặc định; `331` cho phải trả), Nhóm KH, KH/NCC, Đến ngày, Bước nhảy (số ngày một khoảng, mặc định 30), Chi nhánh.

**Cách tính**

- Mỗi chứng từ công nợ có **hạn thanh toán**: ngày hạn ghi trên chứng từ, hoặc ngày chứng từ + hạn thanh toán của đối tượng (danh mục Đối tượng).
- Số còn nợ của chứng từ tại "Đến ngày" = số tiền trừ các lần đối trừ (thanh toán) đến ngày đó. Khoản trả tiền, hàng trả lại chưa đối trừ vào chứng từ nào mang số âm.
- Hạn trùng ngày chứng từ (đối tượng không có hạn) → cột **Không có hạn nợ**.
- Chưa tới hạn → cột **TH** theo số ngày còn lại tới hạn (tới hạn đúng ngày xem tính vào TH 1 - 30).
- Đã quá hạn → cột **QH** theo số ngày quá hạn.
- Bấm một dòng để mở sổ chi tiết công nợ của đối tượng.

## Sổ công nợ theo hạn thanh toán (ACC39)

Theo từng đối tượng, trong khoảng ngày:

- **Dòng đối tượng** (in đậm): Dư Đầu Kỳ, Ps Nợ, Ps Có, Dư cuối kỳ.
- **Dòng chứng từ**: Ngày CT, Số CT, Ngày phải TT, Hạn thanh toán (số ngày), Diễn Giải, Ps Nợ, Ps Có, Mã / Tên nhân viên. Chứng từ bán chịu (mua chịu) có cột bên kia là số đã thanh toán trong kỳ.
- **Dòng thanh toán** dưới mỗi chứng từ: Số, Ngày, Giá trị của phiếu đã trừ vào chứng từ đó.
- Khoản trả tiền chưa trừ vào chứng từ nào trong kỳ đứng thành dòng riêng.

Ô lọc: Từ ngày, Đến ngày, Số tài khoản, Nhóm KH, Khách hàng / Nhà cung cấp, Chi nhánh.

## Lưu ý

- Các màn này đọc **khoản công nợ và đối trừ** (màn Khoản công nợ và đối trừ, CN01). Phiếu thu / chi chưa chọn trả cho chứng từ nào thì nằm thành khoản trả trước, chưa trừ vào chứng từ cụ thể; đối trừ ở CN01 (có nút tự đối trừ theo hạn cũ trước).
- Tổng còn nợ bằng số dư trên Sổ tổng hợp công nợ (ACC38) khi mọi chứng từ công nợ đều có khoản công nợ tương ứng.
