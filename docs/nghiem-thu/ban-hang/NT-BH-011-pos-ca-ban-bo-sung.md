# NT-BH-011 · Ca bán bổ sung: bắt buộc mở ca, Excel tồn cuối ca
<!-- [2026-11-12 11:50 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: thi hành cài đặt "bắt buộc mở ca" (BH17) và xuất Excel tồn cuối ca như nút "Chốt ca cuối ngày" của POS cũ. (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `pos` (bổ sung NT-BH-007) |
| Màn hình | Máy bán POS React: màn bán (báo chưa mở ca), màn *Chốt ca* (nút *Xuất tồn kho cuối ca*); kế toán: BH17 Cài đặt bán hàng |
| Bộ phận yêu cầu | Bộ phận bán lẻ, phòng kế toán |
| Ngày tạo | 12/11/2026 |
| Trạng thái | Nháp — mặc định tạm, phòng kế toán sửa sau |

## 1. Mục đích quản trị
- Đơn vị muốn đối chiếu két chặt thì bật *Bắt buộc mở ca*: mọi đơn thuộc một ca có người chịu trách nhiệm.
- Giữ thói quen của POS cũ: cuối ca xuất Excel tồn kho của cửa hàng (STT, mã, tên, ĐVT nhỏ nhất, số lượng, dòng tổng).

## 2. Khai báo trước
BH17: *Bắt buộc mở ca* = bật (mặc định tắt).

## 3. Các bước thao tác
1. Chưa mở ca, thu ngân gửi một đơn.
2. Mở ca, gửi lại đơn.
3. Cuối ca bấm *Xuất tồn kho cuối ca* rồi chốt ca.

## 4. Số liệu đầu vào
Tồn cửa hàng như sổ kho kế toán (NT-BH-006).

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Bật bắt buộc, chưa mở ca, gửi đơn | Từ chối `POS_SHIFT_REQUIRED`; máy bán báo "Chưa mở ca" và dẫn sang mở ca |
| 2 | Đã mở ca | Nhận đơn như thường |
| 3 | Tắt bắt buộc (mặc định) | Nhận đơn khi chưa mở ca (ca theo ngày) — như hiện nay |
| 4 | Khởi động máy bán | Bootstrap trả `requireOpenShift` theo BH17 |
| 5 | Xuất tồn kho cuối ca | Excel: tiêu đề, cửa hàng, giờ xuất, người xuất; cột STT · Mã hàng · Tên hàng · ĐVT nhỏ nhất · Số lượng; dòng TỔNG CỘNG; số liệu = tồn của chính cửa hàng ở sổ kho kế toán lúc bấm |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Máy ngoại tuyến gửi đơn bù khi đã bật bắt buộc | Đơn có `offlineCreatedAt` vẫn nhận (đã bán thật), ghi cảnh báo |
| 2 | Chặn chốt ca khi còn hoá đơn chưa gửi thuế (POS cũ) | Để đợt sau — trạng thái hoá đơn nằm ở plugin website, module chưa đọc được |

## 7. Kết quả chạy
| Mục | Mong đợi | Thực tế | Lệch | Ghi chú |
|---|---|---|---|---|
| §5 dòng 3 (tắt bắt buộc — mặc định) | chưa mở ca vẫn bán; bootstrap `requireOpenShift = false` | đúng | — | test NT-BH-011, 13/11 |
| §5 dòng 1, 2, 4 + lệch chuẩn 1 | bật: chưa mở ca `POS_SHIFT_REQUIRED`; đơn ngoại tuyến vẫn nhận; mở ca bán được | đúng | — | |
| §5 dòng 5 (tồn cả cửa hàng) | mã tồn khác 0, tên, ĐVT, số lượng theo sổ kho | đúng (nhập 20, bán 3 → 17) | — | máy bán React: nút Xuất tồn kho cuối ca (tgs_pos_react 4da54fb) |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 12/11/2026 | Tạo phiếu |
| 13/11/2026 | Ghi kết quả chạy (test NT-BH-011 3/3) |
