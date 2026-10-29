# Cấn trừ công nợ (BT03)

Lập phiếu bù trừ công nợ mà không qua tiền: một đối tượng vừa là khách vừa là nhà cung cấp, hoặc bù trừ / chuyển nợ giữa hai đối tượng.

## Cùng một đối tượng

Ví dụ công ty A còn nợ mình 5 triệu (dư Nợ 131) và mình còn nợ A 3 triệu (dư Có 331).

1. **Kiểu cấn trừ** = "Cùng một đối tượng", chọn ngày, chi nhánh, đối tượng.
2. Màn hiện số dư công nợ từng tài khoản của đối tượng tại ngày cấn trừ.
3. Ở dòng dư Nợ (phải thu) bấm **Ghi Có TK này**; ở dòng dư Có (phải trả) bấm **Ghi Nợ TK này**.
4. **Số tiền cấn trừ** tự điền = phần nhỏ hơn của hai bên (3 triệu); sửa được.
5. Bấm **Ghi sổ phiếu cấn trừ** → phiếu kế toán Nợ 331 / Có 131, cùng đối tượng A.

Sau cấn trừ: A còn nợ mình 2 triệu, mình hết nợ A.

## Giữa hai đối tượng

Ví dụ A nợ mình 2 triệu, mình nợ B 4 triệu, ba bên thoả thuận A trả thẳng cho B.

1. **Kiểu cấn trừ** = "Giữa hai đối tượng".
2. **Đối tượng A** (ghi Có): chọn tài khoản phải thu của A.
3. **Đối tượng B** (ghi Nợ): chọn tài khoản phải trả của B.
4. Ghi sổ → Nợ 331 (đối tượng B) / Có 131 (đối tượng A).

## Lưu ý

- Số tiền lớn hơn số dư thì màn cảnh báo nhưng vẫn cho ghi (kế toán tự quyết).
- Tài khoản Nợ / Có gõ tay được nếu cần cấn trừ tài khoản không hiện trong bảng số dư.
- Phiếu sinh ra là **phiếu kế toán** thường (chứng từ kèm theo ghi "Cấn trừ công nợ"): sửa, huỷ ở màn Phiếu kế toán. Khi sửa, dòng phiếu có thêm ô **Đối tượng bên Có**.
- Cấn trừ không ảnh hưởng tiền, không lên bảng kê thuế.
- Phiếu cấn trừ sinh hai khoản công nợ (một bên mỗi tài khoản). Ghép chúng với hoá đơn cụ thể ở màn [Khoản công nợ và đối trừ](khoan-cong-no.md), hoặc bấm Tự đối trừ.

## Chọn từng hoá đơn cần cấn trừ

Sau khi chọn tài khoản hai bên, màn hiện danh sách các khoản còn nợ của đối tượng:

- bên **Có** (ví dụ 1311): các hoá đơn bán, phiếu ghi tăng phải thu chưa thu đủ;
- bên **Nợ** (ví dụ 33111): các phiếu nhập, phiếu ghi tăng phải trả chưa trả đủ.

Tick các khoản muốn cấn trừ (ví dụ một phiếu bán với nhiều phiếu nhập); ô **Cấn trừ** mặc định bằng số còn nợ, sửa được. Số tiền cấn trừ tự gợi ý bằng phần nhỏ hơn của tổng hai bên. Ghi xong, các khoản đã chọn được **gạch nợ** ngay (khoản chọn trước được gạch trước); xem ở màn Khoản công nợ (CN01).

Không chọn khoản nào thì phiếu chỉ cấn trừ số dư; gạch nợ sau ở màn Khoản công nợ.
