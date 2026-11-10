# Tồn theo lô (KHO05)

<!-- [2026-11-10 06:30 PM Nguyễn Văn Thủy] PHASE-026 — lô hàng (đóng góp) -->

Theo dõi hàng **theo lô** xuyên suốt mua → chuyển kho → bán → khách trả, mà vẫn **một mã hàng** (lô gắn theo định danh mặt hàng, đổi mã không mất lô). Giá vốn vẫn **bình quân tháng** — lô chỉ theo dõi số lượng, hạn dùng và tên.

## Lô sinh ra thế nào

- Một lô = **mặt hàng + số lô + hạn dùng** của nhà cung cấp, ghi trên dòng phiếu nhập.
- Phiếu nhập không ghi số lô / hạn dùng → hàng vào **lô không số** của mặt hàng.
- **Tên lúc mua**: tên trên dòng phiếu nhập / hoá đơn NCC lần đầu nhập lô — kể cả khi gõ khác danh mục. Lô nhập thêm với tên khác vẫn cùng lô; tên khác được ghi lại ("khác tên"), tên lúc mua giữ nguyên.

## Hàng đi theo lô tự động

| Nghiệp vụ | Lô |
|---|---|
| Bán, trả NCC, xuất chuyển, xuất điều chỉnh | Phiếu ghi số lô → đúng lô đó. Không ghi → **tự động lô hạn dùng sớm trước** (cùng hạn: nhập trước), ở đúng chi nhánh, kho |
| Khách trả hàng (có phiếu bán gốc) | **Về đúng lô đã xuất** của phiếu gốc (lô xuất trước trả trước) |
| Nhận chuyển kho | **Đúng các lô bên xuất** đã xuất |
| Bán quá tồn lô | Phần thiếu ghi vào lô không số (tồn âm) để tổng tồn lô luôn khớp tồn kho |

Sửa phiếu → phân lô ghi lại. Phiếu về muộn / sửa ngày làm thứ tự lệch → bấm **Phân lô lại** (chạy lại theo đúng thứ tự ngày; không đổi sổ, không đổi giá vốn).

## Màn

- **Tồn theo lô**: lọc mã / tên / số lô, chi nhánh, sắp hết hạn (đỏ = hết hạn, cam ≤ 30 ngày, vàng ≤ 90 ngày). Bấm một lô xem **thẻ lô**: vào / ra ở phiếu nào, cách chọn lô, tồn cộng dồn.
- **Lô theo phiếu**: nhập khoá phiếu → từng dòng lấy từ lô nào và tên lúc mua của lô (tra cứu). **Hoá đơn vẫn theo đúng bill ở cửa hàng** — bill một dòng thì hoá đơn một dòng, lô không tách dòng.

Lô còn tồn và hạn dùng là căn cứ để lên chương trình xả hàng cận date (Chương trình bán BH12) và so sánh giá giữa các lô.
