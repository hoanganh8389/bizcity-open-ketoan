# Bảng điểm đầu vào (ACC94)
<!-- [2026-11-03 08:49 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-6 — hướng dẫn màn Bảng điểm đầu vào (PHASE-021 W4), viết từ IntakeScorePage.tsx và intake/score.ts -->

Màn này cho biết **chứng từ gửi vào có đạt ngay lần đầu không** và **lỗi nào hay gặp**, để cả nhóm cùng học cách nhập đúng. Bảng không dùng để đánh giá cá nhân: chỉ có mã lỗi, điểm và số đếm, không có nội dung chứng từ. Mọi kế toán xem được.

## Chọn khung thời gian

Chọn **7, 30 hoặc 90 ngày gần nhất** (mặc định 30). Mọi số trên màn tính trong khung đó.

## Năm ô số

| Ô | Nghĩa | Tính thế nào |
|---|---|---|
| Đạt lần đầu | Tỷ lệ chứng từ vào sổ ngay, không phải dừng ở bể chờ | chứng từ chưa từng có mục bể ÷ chứng từ gửi. Một "chứng từ gửi" là một mã chứng từ (`docKey`) khác nhau; gửi lại cùng mã không tính thêm |
| Điểm TB mục bể | Mức nặng nhẹ trung bình của các mục phải dừng | trung bình điểm các mục bể trong khung; **0 nghĩa là còn lỗi chặn** |
| Mục đang mở | Số mục bể chưa xử lý xong, kèm tuổi của mục cũ nhất | bấm vào để mở Trạm kiểm tra đầu vào |
| Thời gian xử lý (trung vị) | Từ lúc nhận tới lúc đóng một mục bể | trung vị của các mục đóng trong khung, tính bằng giờ |
| Sửa tại bể (lệch nguồn) | Tỷ lệ mục được sửa hoặc chấp nhận ngay tại bể thay vì sửa ở hệ thống gửi | (nộp lại + chấp nhận) ÷ mục đã đóng. Tỷ lệ cao nghĩa là dữ liệu ở hệ thống nguồn vẫn sai: sửa tận gốc ở đó |

## Ba bảng chia nhóm

| Bảng | Mỗi dòng là | Dùng để |
|---|---|---|
| Theo nguồn | hệ thống gửi: ứng dụng có khoá API (`app:<khoá>`), hệ thống ngoài, hoặc **Nhập tay** | biết hệ thống nào gửi dữ liệu kém nhất |
| Theo người lập | người lập chứng từ | biết ai cần hướng dẫn thêm |
| Theo loại | loại chứng từ (bán hàng, mua hàng, phiếu thu…) | biết loại nào hay sai cấu hình |

Mỗi dòng có: số đã gửi, tỷ lệ đạt lần đầu, điểm TB và mã lỗi **hay gặp** nhất của nhóm đó.

## Mười mã lỗi nhiều nhất

Danh sách mã lỗi gặp nhiều nhất trong khung. Bấm **Bài học** để đọc mã đó nghĩa là gì, vì sao bị chặn và sửa ở đâu.

## Đạt lần đầu theo tuần

Biểu đồ cột cho tỷ lệ đạt lần đầu từng tuần. Rê chuột lên một cột để xem số của tuần đó. Đường đi lên nghĩa là cách nhập đã tốt hơn.

## Lưu ý

- Chứng từ dùng **Kiểm thử** (gửi thử để xem lỗi trước) không được tính vào bảng.
- Màn trống ("Chưa có chứng từ trong khung") nghĩa là khung đã chọn chưa nhận chứng từ nào: chọn khung dài hơn.
- Dữ liệu lấy từ `GET /api/v1/intake/score`, cần quyền `documents:write`.
