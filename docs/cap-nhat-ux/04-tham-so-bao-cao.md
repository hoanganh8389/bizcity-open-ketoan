# 04. Bảng tham số báo cáo dạng ngăn kéo

<!-- [2026-11-11 Nguyễn Văn Thủy] đợt 3 cập nhật trải nghiệm: tham số báo cáo bên phải, tóm tắt tham số, số chứng từ là liên kết (đóng góp) -->

Ngày: 11/11/2026. Áp cho mọi màn dùng khung bảng lọc chung (`ReportSideLayout` / `FilterLayout`, 37 màn: sổ nhật ký chung, sổ cái, sổ chi tiết tài khoản, nhập xuất tồn, công nợ, danh sách phiếu thu chi, MH11…).

## Người dùng thấy gì

- Báo cáo chiếm **trọn bề ngang**. Dòng trên cùng **tóm tắt tham số đang xem** (Kỳ, Từ ngày, Đến ngày, tài khoản, chi nhánh…) và nút **Chọn tham số**.
- Bấm **Chọn tham số**: ngăn kéo mở bên phải, đủ các ô như trước. Bấm **Tìm kiếm** (nút chính) → ngăn tự đóng, dòng tóm tắt cập nhật. Esc / bấm ra ngoài để đóng.
- Ai quen bảng lọc bên trái: nút **Ghim bên trái** trong ngăn kéo (trở về như cũ); muốn trở lại ngăn kéo thì bấm **Bỏ ghim** trên bảng lọc. Nhớ theo máy. Giao diện cổ điển mặc định ghim.
- Bảng nào bấm dòng là mở chứng từ / bút toán thì ô **Số chứng từ** hiện như liên kết (xanh, gạch chân khi rê); phiếu chưa duyệt vẫn chữ cam.

## Kỹ thuật

- `apps/web/src/components/ReportPanel.tsx`: `ReportSideLayout` thêm chế độ không ghim (`localStorage['ketoan.rp.ghim']`); bảng tham số luôn được dựng (chỉ ẩn) nên đóng / mở không mất ô đang chọn; tóm tắt đọc từ nhãn + giá trị ô của bảng lọc (`tomTat`).
- `apps/web/src/components/DataGrid.tsx`: ô có `data-col` = khoá cột (để CSS / kiểm thử nhắm đúng cột).
- CSS ở `styles/giao-dien-xanh.css` (khối "Bảng tham số dạng ngăn kéo").

## Chưa làm

- Lưu bộ tham số có tên ("Lưu báo cáo") và danh sách báo cáo đã lưu.
- Gửi báo cáo định kỳ qua email.
