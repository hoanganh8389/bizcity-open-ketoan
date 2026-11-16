# Điểm thành viên (BH19)
<!-- [2026-11-16 11:10 AM Võ Hoàng] LOYALTY — hướng dẫn màn BH19, NT-BH-020 bước 3 (đóng góp) -->

Sổ điểm thành viên của khách mua ở máy bán: điểm tích, đổi, hết hạn, hoàn trong kỳ; điểm còn của từng khách. Màn **chỉ xem**.

## Mở màn
Menu trái → **Phần riêng** → **Điểm thành viên**. Cần quyền *Xem điểm thành viên* (`loyalty:read`) — mặc định có ở chủ đơn vị, kế toán trưởng, kế toán, người xem.

## Điểm đến từ đâu
- **Chính sách tích điểm** (tích theo tiền, theo mã hàng, nhân điểm, thưởng theo mức đơn; hạng và hệ số; quà / voucher đổi điểm) khai ở website (plugin tích điểm). Website tự gửi sang mỗi giờ và ngay khi lưu chính sách.
- **Tích**: đơn máy bán hoàn tất có khách → tự tích theo chính sách của cửa hàng. Mỗi lần tích là một **lô** có hạn dùng.
- **Đổi**: khách đổi điểm lấy quà / voucher ở quầy → trừ lô hết hạn sớm nhất trước. Quà ra dòng quà 0đ, voucher dùng ở đơn sau (tiền giảm trên chứng từ bán).
- **Hoàn**: trả hàng → trừ điểm đã tích của phần trả (theo tỉ lệ tiền trả).
- **Hết hạn**: mỗi đêm, phần còn lại của lô quá hạn ghi thành dòng hết hạn.
- **Số dư cũ**: ngày cửa hàng chuyển sang máy bán mới, số dư điểm ở website được nạp một lần (tổng đã tích + phần đã dùng → giữ đúng số dư và hạng).

## Bảng tham số (bên trái)
- **Kỳ**: mặc định đầu tháng tới hôm nay. Bấm **Tìm kiếm** để áp.

## Đọc màn
- **Thẻ chỉ số**: điểm còn cuối kỳ (số khách), tích / đổi / hết hạn trong kỳ.
- **Phát sinh theo cửa hàng**: tích, đổi, hết hạn, hoàn khi trả hàng, điều chỉnh. Dòng *(không theo cửa hàng)* là hết hạn và số dư cũ.
- **Số dư theo hạng**: số khách, tổng điểm còn của mỗi hạng (hạng theo tổng điểm đã tích).
- **Khách**: 500 khách điểm còn nhiều nhất, kèm tích / đổi / hết hạn trong kỳ. Rê chuột vào tiêu đề cột để xem cách tính; nút xuất Excel ở góc bảng.

## Kế toán
Điểm **không** hạch toán lúc tích. Chỉ khi khách đổi: quà là dòng quà 0đ trên chứng từ bán (giá vốn hàng tặng), voucher là tiền giảm trên dòng chứng từ bán. Tài khoản do kế toán đặt ở *Quy tắc hạch toán*.
