# NT-BH-017 · Phiếu bán / trả kế toán lập về website của shop (không cần plugin POS)
<!-- [2026-11-14 10:30 AM Võ Hoàng] NGHIEM-THU — tạo phiếu: phiếu bán / trả nhập tay (module phieu-ban) đồng bộ về website shop qua cầu nối (chữ chốt docs/nghiep-vu/23) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `phieu-ban`, app `tgs-wp`) + website shop (plugin cầu nối `tgs_accounting_bridge`) |
| Màn hình | BH10 *Phiếu bán hàng*, BH11 *Hàng bán trả lại* (kế toán); sổ phiếu của website shop (trang quản trị shop) |
| Bộ phận yêu cầu | Ban giám đốc (sếp anh Hoàng, 14/11): "trường hợp không gắn plugin WP POS thì màn module bán hàng vẫn edit, ra đơn theo từng shop, kế toán edit ở đó, vẫn sync được về POS" |
| Ngày tạo | 14/11/2026 |
| Trạng thái | Nháp — bước 3 của đợt (b) phiếu bán nhập tay (NT-BH-015) |

Chữ chốt thiết kế: [nghiep-vu/23](../../nghiep-vu/23-phieu-ban-ve-website.md).

## 1. Mục đích quản trị
Kế toán lập, sửa phiếu bán / trả cho **từng shop** ở phần mềm kế toán (BH10 / BH11). Phiếu đã duyệt tự có ở **website của shop đó** như phiếu shop tự lập: tồn của shop, doanh thu, báo cáo, hoá đơn điện tử ở website đều thấy. Shop **không cần cài plugin máy bán POS**. Kế toán sửa (bỏ duyệt → sửa → duyệt lại) thì website cập nhật theo, không ra hai phiếu.

## 2. Khai báo trước
- Website shop đã nối chi nhánh bên kế toán (Cấu hình phân cấp multisite; cầu nối tự tạo chi nhánh — cầu nối 0.3.3).
- Cầu nối bật nhận sự kiện kế toán (bí mật webhook giống máy bán React); app `tgs-wp` đã kết nối ở đơn vị kế toán, địa chỉ webhook trỏ cửa nhận của cầu nối.

## 3. Các bước thao tác
1. Kế toán lập phiếu bán cho shop `CN01` ở BH10, duyệt.
2. Mở website shop `CN01` (trang quản trị shop): thấy phiếu bán cùng số, cùng dòng hàng, cùng tiền; phiếu thu theo hình thức; phiếu xuất kho.
3. Kế toán bỏ duyệt, sửa số lượng, duyệt lại → website cập nhật đúng phiếu đó.
4. Kế toán lập phiếu trả nối phiếu bán gốc → website có phiếu hoàn nối phiếu bán.
5. Kế toán bỏ duyệt phiếu (không duyệt lại) → phiếu ở website bị huỷ (xoá mềm).

## 4. Số liệu đầu vào
Shop `CN01` (website shop2 trên LocalWP) **không bật** máy bán POS; mặt hàng có thuế 8 %; khách nợ `KH001`.

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Duyệt phiếu bán | trong vài giây website shop có phiếu bán (số phiếu kế toán), dòng hàng, thuế; phiếu thu theo từng hình thức (nếu có thu); phiếu xuất kho; người lập = tên kế toán |
| 2 | Shop không cài / không bật POS | vẫn nhận (điều kiện "bật POS React" bỏ đi) |
| 3 | Bỏ duyệt → sửa → duyệt lại | website ghi đè **tại chỗ** phiếu cũ (cùng mã phiếu website), không thêm phiếu mới |
| 4 | Bỏ duyệt không duyệt lại | phiếu ở website xoá mềm |
| 5 | Phiếu trả nối gốc | website có phiếu hoàn nối phiếu bán đã có |
| 6 | Không gửi ngược | cầu nối **không** gửi lại sang kế toán các phiếu do bản sao ghi (không chứng từ trùng) |
| 7 | Gửi lại / sự kiện cũ đến sau | không ghi trùng; bản cũ hơn bản đang có bị bỏ qua |
| 8 | Hoá đơn điện tử | phiếu bán có ở website → phát hành được hoá đơn bằng plugin hoá đơn như phiếu shop tự lập (thao tác tay ở website; tự phát hành: đợt sau) |
| 9 | Máy bán POS React | đơn máy bán vẫn về website như cũ, qua cùng cửa nhận mới |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Chi nhánh không khớp website nào | Sự kiện bị từ chối, app `tgs-wp` giao lại theo lịch; trang Cổng kế toán liệt kê sự kiện chờ |
| 2 | Chữ ký sai / thiếu | 401, không ghi |
| 3 | Mã hàng chưa có ở website | Từ chối, giao lại sau khi đồng bộ danh mục (cầu nối kéo danh mục mỗi giờ) |
| 4 | Website đang khoá kỳ / phiếu đã chốt ở website | Ghi nhận lỗi ở hàng chờ, kế toán xem ở Cổng kế toán |

## Cần chốt (mặc định tạm)

| # | Câu hỏi | Mặc định tạm |
|---|---|---|
| Q1 | Website được sửa phiếu do kế toán lập không? | **Không** — phiếu bản sao chỉ xem ở website; sửa ở kế toán |
| Q2 | Tự phát hành hoá đơn điện tử khi duyệt? | Đợt sau (cần quy tắc ai phát hành: kế toán hay shop) |

## 7. Kết quả chạy
| Mục | Mong đợi | Thực tế | Lệch | Ghi chú |
|---|---|---|---|---|

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 14/11/2026 | Tạo phiếu |
