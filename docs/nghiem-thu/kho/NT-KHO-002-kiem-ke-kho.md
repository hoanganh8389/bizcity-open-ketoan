# NT-KHO-002 · Kiểm kê kho: biên bản kiểm kê, xử lý chênh lệch bằng phiếu điều chỉnh tồn
<!-- [2026-11-12 kiennt] NGHIEM-THU — tạo phiếu. -->

| | |
|---|---|
| Phân hệ | kho |
| Màn hình | KHO02 (Kiểm kê kho) — mới |
| Bộ phận yêu cầu | Kho / Phòng kế toán |
| Ngày tạo | 12/11/2026 |
| Trạng thái | Đã chốt (12/11/2026, kiennt) |

## 1. Mục đích quản trị
Ghi lại kết quả đếm thực tế một kho tại một ngày, so với số trên sổ, ai tham gia, hàng còn tốt hay kém / mất phẩm chất,
rồi xử lý chênh lệch thành chứng từ trong sổ. Thủ kho và kế toán dùng cuối tháng / cuối năm hoặc kiểm đột xuất.
Làm ngoài lõi: biên bản ở phân hệ Kho; xử lý chênh lệch sinh **phiếu điều chỉnh tồn** (`stock_adjustment`) đã có, dùng lý
do `NDC` (kiểm kê thừa, TK 3381) / `XDC` (kiểm kê thiếu, TK 1381) của đơn vị. Khi lõi có loại chứng từ kiểm kê (S032-19)
thì chuyển sang, biên bản giữ nguyên.

## 2. Khai báo trước
- Chi nhánh CN-A, kho `KA-1` (mặc định).
- Mặt hàng `HANG01` (Hộp), `HANG02` (Gói), `HANG03` (Chai).
- Lý do `NDC`, `XDC` có sẵn trong danh mục lý do (ACC18).

## 3. Các bước thao tác
1. Kho → Kiểm kê kho → Thêm. Chọn chi nhánh CN-A, kho `KA-1`, ngày kiểm kê 30/11/2026, mục đích "Kiểm kê cuối tháng 11".
2. Bấm **Lấy số tồn**: phần mềm điền mọi mặt hàng có tồn hoặc có phát sinh ở `KA-1` đến hết ngày 30/11, cột *Theo sổ*.
3. Nhập *Theo kiểm kê* (gõ tay, hoặc **Nhập kết quả từ Excel**: Mã hàng, Số lượng kiểm kê, Phẩm chất, Ghi chú).
4. Nhập thành viên tham gia (Họ tên, Chức danh, Đại diện), kết luận. Đính kèm ảnh biên bản ký tay (NT-QUY-001).
5. **Ghi** biên bản (chưa đụng sổ). Bấm **Xử lý chênh lệch** → phần mềm sinh phiếu điều chỉnh tồn, biên bản chuyển *Đã xử lý*.

## 4. Số liệu đầu vào

Thẻ kho `KA-1` đến 30/11/2026: HANG01 = 120, HANG02 = 50, HANG03 = 10. Đơn giá bình quân tháng 11/2026 (sau tính giá vốn):
HANG01 = 10.000 đ, HANG02 = 5.000 đ.

| Mã hàng | Theo sổ | Theo kiểm kê | Phẩm chất |
|---|---|---|---|
| HANG01 | 120 | 118 | Còn tốt 116, kém phẩm chất 2 |
| HANG02 | 50 | 53 | Còn tốt 53 |
| HANG03 | 10 | 10 | Còn tốt 10 |

## 5. Kết quả mong đợi

**Trên chứng từ / màn hình:**

| Mục | Mong đợi |
|---|---|
| Chênh lệch HANG01 / HANG02 / HANG03 | −2 / +3 / 0 |
| Dòng tổng | Theo sổ 180, kiểm kê 181, chênh lệch +1 |
| Bấm Xử lý chênh lệch | Sinh **một** phiếu điều chỉnh tồn `direction: mixed`, ngày 30/11, kho `KA-1`, 2 dòng: HANG01 −2, HANG02 +3 (HANG03 không có dòng) |
| Liên kết | Biên bản hiện số phiếu điều chỉnh; phiếu điều chỉnh có tham chiếu về biên bản |
| Sửa biên bản đã xử lý | Không sửa được số kiểm kê; muốn sửa phải **Bỏ xử lý** (huỷ phiếu điều chỉnh) trước |
| BC nhập xuất tồn (ACC83) KA-1 tháng 11 | Tồn cuối HANG01 = 118, HANG02 = 53, HANG03 = 10 |
| In | Biên bản kiểm kê vật tư, hàng hoá (mẫu 05-VT; kế toán trưởng xác nhận mẫu theo chế độ đang áp) |

**Bút toán** (sau khi tính giá vốn tháng 11):

| Nợ | Có | Số tiền | Ghi chú |
|---|---|---|---|
| 1381 | 156 | 20.000 | HANG01 thiếu 2 × 10.000 (lý do XDC) |
| 156 | 3381 | 15.000 | HANG02 thừa 3 × 5.000 (lý do NDC) |

**Báo cáo phải thấy:** Sổ chi tiết hàng hoá HANG01 tháng 11 có dòng xuất 2 ngày 30/11 theo số phiếu điều chỉnh.

**Sai số làm tròn chấp nhận:** 0 đ (số lượng); giá trị theo đơn giá bình quân tháng, ≤ 1 đ mỗi dòng.

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Bấm Xử lý chênh lệch khi mọi dòng chênh lệch = 0 | Không sinh phiếu, báo "Không có chênh lệch", biên bản vẫn *Đã xử lý* |
| 2 | Nhập số kiểm kê âm / để trống | Chặn ghi, tô ô lỗi ("số kiểm kê ≥ 0") |
| 3 | Kỳ 11/2026 đã khoá rồi bấm Xử lý chênh lệch | Không sinh phiếu, báo kỳ đã khoá (lỗi của sổ, giữ nguyên biên bản) |
| 4 | Sau khi lập biên bản lại có chứng từ ghi lùi vào KA-1 trước 30/11 | Biên bản nhắc "Số theo sổ đã đổi", có nút Lấy lại số tồn; không tự đổi số kiểm kê |
| 5 | Nhập từ Excel có mã hàng không có trong danh mục | Báo dòng lỗi, không thêm dòng đó |
| 6 | Bỏ xử lý | Huỷ phiếu điều chỉnh (bút toán đảo, không xoá), biên bản về *Chưa xử lý* |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/kiem-ke-kho.test.ts` |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
