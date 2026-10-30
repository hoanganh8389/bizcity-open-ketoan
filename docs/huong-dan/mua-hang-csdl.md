# Cơ sở dữ liệu mua hàng (MH13)

Trang giải thích cơ sở dữ liệu của phân hệ Mua hàng: dev mới đọc để hiểu hệ thống, và dùng để thuyết trình thiết kế. Phần **Bảng & cột** đọc thẳng từ CSDL đang chạy, nên luôn khớp với thực tế: thêm migration là trang tự cập nhật.

| Thẻ | Nội dung |
|---|---|
| ① Tóm tắt 1 phút | 5 ý chính của thiết kế (khai báo một nơi · mọi phiếu một bảng · chính sách là dữ liệu · hoá đơn NCC giữ nguyên cách NCC ghi · duyệt = ghi sổ lõi), câu "ĐVT là trung gian, tồn kho là ĐVT nhỏ nhất", bảng **thuật ngữ ↔ bảng ↔ màn hình** kèm số dòng. **Mở đầu thuyết trình ở đây.** |
| ② Sơ đồ & nguyên tắc | Sơ đồ quan hệ các bảng (bấm tên bảng để xem cột), 5 nguyên tắc thiết kế. |
| ③ Ví dụ một phiếu | Vinh Châu giao Sữa TH: khai báo → đơn 10 Thùng → nhận 5 Thùng → duyệt → trả tiền → giá vốn cuối tháng. Mỗi bước ghi dòng nào vào bảng nào, với số cụ thể. |
| ④ Quy trình từng bước | Các bước từ khai báo, tồn max, đặt hàng, nhập kho, **hoá đơn NCC → nhận diện mã → đối soát (5b)** đến trả tiền, cuối kỳ: làm ở màn nào, đọc / ghi bảng nào, phần mềm tự làm gì, kiểm tra gì. |
| ⑤ ĐVT & tồn kho | Chỗ nào quy đổi, ví dụ 2 Thùng → 96 Hộp, thứ tự chọn ĐVT mặc định. |
| ⑥ Bảng & cột | Từng bảng đọc thẳng từ CSDL. Tích **Chế độ thuyết trình** thì chỉ hiện tên cột và ý nghĩa; bỏ tích thì hiện thêm kiểu, bắt buộc, mặc định, chỉ mục, trigger. |
| ⑦ JSON | Mẫu dữ liệu dòng hàng của phiếu, quy tắc chính sách, khuôn hoá đơn NCC đọc được (Excel / AI / API), dòng nhật ký. |
| ⑧ 25 tình huống | Mỗi tình huống của tài liệu yêu cầu: giải quyết ở bảng nào, con số tài liệu so với con số phần mềm (✓ khớp). |
| ⑨ Mở rộng & tối ưu | Thêm tính năng làm ở đâu, tối ưu đang có, việc khi dữ liệu lớn. |

Thứ tự thuyết trình gợi ý: ① → ② → ③ → ⑧. Dev mới đọc thêm ④ ⑤ ⑥ ⑨.

Muốn ý nghĩa một cột hiện trên trang thì viết `COMMENT ON COLUMN …` trong file migration.
