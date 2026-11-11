# 06. Dán từ Excel (Ctrl + V) vào lưới chứng từ

<!-- [2026-11-11 Nguyễn Văn Thủy] dán nhiều ô từ Excel / Google Sheets vào lưới dòng của form chứng từ (đóng góp) -->

Chép một vùng ô ở Excel (hoặc Google Sheets), bấm vào lưới chứng từ, **Ctrl + V**. Dán một ô thì ô đang gõ nhận như thường; dán nhiều ô (có Tab hoặc xuống dòng) thì phần mềm điền vào lưới.

## 1. Người dùng thấy gì

| Form | Dán ở đâu | Cách điền |
|---|---|---|
| Phiếu thu / chi / báo có / báo nợ | Bất kỳ ô nào ở lưới chi tiết | Không tiêu đề: từ ô đang đứng ghi sang phải, xuống dưới, thiếu dòng tự thêm (dòng mới mang đối tượng, nhân viên, diễn giải đầu phiếu). Cột Nợ / Có không nhập được thì bỏ qua — chép "Tài khoản, Số tiền, Diễn giải" là vào đúng chỗ. Có dòng tiêu đề (Tài khoản, Số tiền, Diễn giải, Đối tượng…): ghép theo tên cột, thêm dòng. |
| Phiếu kế toán | Lưới chi tiết phiếu (lưới trên) | Kiểu **TK Nợ, TK Có, Số tiền, Diễn giải** (có tiêu đề, hoặc không tiêu đề mà dán ở cột Tài khoản): mỗi dòng Excel thành một dòng ghi Nợ kèm tài khoản đối ứng ghi Có ở lưới dưới. Tiêu đề theo tên cột lưới (Tài khoản, PS Nợ, TK đối ứng…): ghép theo tên. Còn lại: như Excel, từ ô đang đứng. |
| Nhập mua, đơn đặt, trả hàng… (MH11) | Bảng hàng — kể cả khi phiếu chưa có dòng (bấm vào ô "Phiếu chưa có hàng") | Có tiêu đề: ghép theo tên cột như tệp Nhập Excel dòng hàng (Mã hàng, ĐVT, Số lượng, Đơn giá, CK %, Số lô, Hạn dùng…). Không tiêu đề: cột đầu là Mã hàng, các ô số tiếp theo lần lượt là Số lượng, Đơn giá, CK % (ô chữ như Tên hàng bỏ qua; không có số lượng = 1, không có đơn giá = giá mua của NCC). Qua cùng bộ kiểm với Nhập Excel; dòng sai (mã chưa có, ĐVT chưa khai) bỏ qua và báo ngay trên bảng. |
| Mẫu phiếu, phiếu công nợ | Lưới dòng | Như Excel, từ ô đang đứng (TK Nợ, TK Có, Số tiền, Diễn giải). |

Số tiền đọc được cả `1.250.000`, `1,250,000`, `1250000`; ô tài khoản chép kiểu `6422 - Chi phí quản lý` lấy số hiệu `6422`; ngày `dd/mm/yyyy`. Phiếu chuyển kho giữ nút **Dán từ Excel** riêng.

## 2. Sửa kèm ở ô chọn mã (dùng chung mọi form)

- **Esc khi danh sách gợi ý đang mở** chỉ đóng danh sách, không thoát cả phiếu; trước đây ô chọn (kiểu ô tìm kiếm) còn bị trình duyệt xoá chữ khi Esc, rời ô là mất mã đã chọn.
- Gõ nhanh / quét mã rồi Enter: mã khớp đúng một mã có trong danh mục thì lấy mã đó, không lấy nhầm dòng gợi ý đầu khi danh sách chưa kịp lọc.
- Giá trị đổi từ bên ngoài (dán, tự điền) khi ô đang được chọn: hiện ngay, rời ô không ghi đè bằng chữ cũ.

## 3. Kỹ thuật

- `apps/web/src/lib/danExcel.ts`: `bangDan(text)` đọc clipboard (Tab / xuống dòng, ô có ngoặc kép) thành bảng ô, dán một ô trả `null`; `soDan` đọc số; `khongDau` để nhận tiêu đề.
- Mỗi form gắn `onPaste` ở `tbody`, dòng có `data-dong`, cột lấy theo `td.cellIndex` → bảng vị trí cột → trường.
- Phiếu mua dùng lại `nhapDongHang` (map + check) và `importLines` của Nhập Excel dòng hàng; tiêu đề nhận bằng `readTable`.
- `components/pickers.tsx` (CodePicker): ba sửa ở mục 2.
