# NT-BH-008 · Màn quản trị bán lẻ máy POS trong phân hệ Bán hàng
<!-- [2026-11-12 09:00 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: năm màn quản trị bán lẻ của module pos trong nhóm Bán hàng (Đơn bán máy POS, Phiếu trả hàng máy POS, Sổ ca bán, Tổng quan bán lẻ, Cài đặt bán hàng). (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `pos` (màn `/app/pos/…`, nhóm *Bán hàng* của menu trái) |
| Màn hình | BH13 Đơn bán máy POS · BH14 Phiếu trả hàng máy POS · BH15 Sổ ca bán · BH16 Tổng quan bán lẻ · BH17 Cài đặt bán hàng |
| Bộ phận yêu cầu | Phòng kế toán (đối chiếu đơn, tiền mặt, chênh lệch két), cửa hàng trưởng, ban điều hành (tổng quan) |
| Ngày tạo | 12/11/2026 |
| Trạng thái | **Đã chốt 13/11/2026** — người dùng (Võ Hoàng) chốt theo đề xuất của nhóm POS, sai thì sửa sau; phòng kế toán xác nhận lại theo tệp *Nghiep-vu-ban-hang-POS-2026-11-13-da-chot.xlsx* |

<!-- [2026-11-13 02:10 PM Võ Hoàng] CHOT-0 — đợt 0: chốt nghiệp vụ theo đề xuất (đóng góp) -->
**Chốt 13/11/2026:**
- Giữ mặc định BH17: hạn trả 3 ngày, không bắt buộc mở ca, một ca / chi nhánh, ngưỡng tô đỏ chênh lệch két 0 đ.
- Quyền `pos:report` (xem 5 màn quản trị bán lẻ) cấp cho kế toán và quản lý bán lẻ; thu ngân không có.
- Năm màn BH13–BH17 và chương trình bán BH12 chuyển vào **nhóm Bán hàng** (Phần riêng giữ lối tắt) — đợt menu (NT-BH-013).

Căn cứ: đơn / phiếu trả / ca bán đã ghi ở module `pos` (NT-BH-004, 005, 006, 007); giao diện theo khung chung của phần mềm (danh sách trên – dưới `docs/cap-nhat-ux/05-danh-sach-tren-duoi.md`, bộ tham số kỳ / chi nhánh `docs/cap-nhat-ux/07-bo-tham-so-bao-cao.md`, thẻ chỉ số, menu theo phân hệ `docs/cap-nhat-ux/13-khung-menu.md`). Máy bán là nơi thu ngân thao tác; các màn ở đây là nơi **kế toán và quản lý xem, đối chiếu, cài đặt** — không bán hàng trên các màn này.

## 1. Mục đích quản trị
Kế toán thấy đủ đơn bán, phiếu trả, ca bán của **mọi cửa hàng** trong một chỗ, đối chiếu được với chứng từ đã vào sổ và với tiền mặt két; cửa hàng trưởng / ban điều hành xem doanh thu theo cửa hàng, hình thức, giờ, mặt hàng; kế toán trưởng đặt các tham số bán lẻ (hạn trả hàng, ca bán…) thay cho số viết cứng trong code.

## 2. Khai báo trước
- Hai chi nhánh `CN01`, `CN02`; dữ liệu bán như NT-BH-007 §4 ở `CN01` (đơn A 660.000 TM + CK, đơn B 325.000 TM, trả 1 hộp đơn B 325.000 TM, ca đầu 1.000.000 chốt đếm 1.320.000) và một đơn 330.000 ở `CN02`.
- Người dùng kế toán có quyền xem bán lẻ (quyền module mới `pos:report`); thu ngân chỉ có `pos:sell` / `pos:return` / `pos:cancel` thì **không** mở được các màn này.

## 3. Các bước thao tác
1. Kế toán mở *Bán hàng → Đơn bán máy POS*, chọn kỳ hôm nay, tích hai chi nhánh.
2. Bấm một đơn: nửa dưới hiện dòng hàng; bấm đúp mở chi tiết (thanh toán, ca, thu ngân, chứng từ sổ, bản sao website).
3. Mở *Phiếu trả hàng máy POS*, *Sổ ca bán* (lọc "ca có chênh lệch"), *Tổng quan bán lẻ*.
4. Kế toán trưởng mở *Cài đặt bán hàng*, đổi hạn trả hàng 3 → 5 ngày, bấm Ghi; thu ngân trả một đơn bán 4 ngày trước.

## 4. Số liệu đầu vào
Như mục 2.

## 5. Kết quả mong đợi

| # | Màn | Kiểm | Kết quả |
|---|---|---|---|
| 1 | BH13 | Danh sách kỳ hôm nay, hai chi nhánh | 3 đơn, mới nhất trước; cột: mã phiếu, ngày giờ, chi nhánh, thu ngân, ca, khách, hình thức, tổng tiền, trạng thái đơn, trạng thái chứng từ sổ (lúc gửi) |
| 2 | BH13 | Thẻ chỉ số | Số đơn 3 · Doanh thu 1.315.000 · Đã hoàn 325.000 · Thuần 990.000 |
| 3 | BH13 | Bấm một lần đơn A | Nửa dưới: 2 dòng hàng (mã, tên, ĐVT, SL, đơn giá, thành tiền, thuế) |
| 4 | BH13 | Lọc chi nhánh `CN02` | Chỉ đơn 330.000 |
| 5 | BH14 | Danh sách phiếu trả | 1 phiếu 325.000, đơn gốc = mã đơn B, hình thức TM, lý do |
| 6 | BH15 | Sổ ca | Ca `CN01`: đầu ca 1.000.000, phải có 1.330.000, đếm được 1.320.000, **chênh lệch −10.000**, người chốt, giờ chốt; lọc "ca có chênh lệch" ra đúng ca này |
| 7 | BH16 | Tổng quan ngày, hai chi nhánh | Doanh thu 1.315.000, trả 325.000, thuần 990.000; theo chi nhánh, theo hình thức (kèm tên), theo giờ, mặt hàng bán chạy |
| 8 | BH17 | Đổi hạn trả hàng 3 → 5, Ghi | Lưu ở cấu hình của đơn vị (có phiên bản, ai đổi, lúc nào); trả đơn 4 ngày trước **không** còn đòi người duyệt |
| 9 | Mọi màn | Xuất Excel | Theo định dạng chuẩn (kẻ ô, tiêu đề nền xám, số phân cách) |
| 10 | Quyền | Đăng nhập thu ngân (chỉ `pos:sell`) | Không thấy năm mục menu; gọi thẳng API đọc quản trị → 403 |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Kỳ không có đơn | Bảng trống "Không có đơn trong kỳ", thẻ chỉ số 0 |
| 2 | Đơn có chứng từ đang chờ duyệt / lỗi ghi sổ | Cột trạng thái chứng từ hiện đúng (chờ duyệt / lỗi); không ẩn đơn |
| 3 | Bản sao website chưa nhận / lỗi | Không hiện ở màn này (module không biết kết quả giao webhook) — xem ở *Hệ thống → Sự kiện* (việc giao `tgs-wp.webhook`) |
| 4 | Đặt hạn trả hàng ngoài khoảng 0–60 ngày | Từ chối ngay ở ô nhập (lỗi tại ô) |
| 5 | Cài đặt chưa đặt | Dùng mặc định của khoá (hạn trả 3 ngày, không bắt buộc mở ca, một ca / chi nhánh) |

## 7. Cài đặt bán hàng (BH17) — khoá cấu hình
Khoá thuộc module `pos`, khai ở `modules/pos/settings.registry.json` + mục `settings` của manifest (gộp vào registry lúc nạp module — `registerModuleSettings`), module đọc bằng `ctx.settings.get`, ghi qua `PUT /api/v1/settings/values/:key` của Core:

| Khoá | Kiểu | Mặc định | Ghi chú |
|---|---|---|---|
| `bizcity.pos.return_days` | số nguyên 0–60 | 3 | Hạn trả hàng không cần duyệt (họp kế toán 04/11) |
| `bizcity.pos.require_open_shift` | đúng / sai | sai | NT-BH-007 Q2 |
| `bizcity.pos.shift_scope` | `branch` / `device` | `branch` | NT-BH-007 Q3 (đợt này chỉ thi hành `branch`) |
| `bizcity.pos.cash_diff_alert` | số tiền ≥ 0 | 0 | Sổ ca tô đỏ ca chênh lệch vượt ngưỡng |

## 8. Kết quả chạy
| Mục | Mong đợi | Thực tế | Lệch | Ghi chú |
|---|---|---|---|---|
| §5 dòng 1–4 (BH13) | 3 đơn; 1.315.000 / 325.000 / 990.000; lọc CN02 | đúng | — | test NT-BH-008 |
| §5 dòng 5 (BH14) | 1 phiếu 325.000 nối đơn B | đúng | — | |
| §5 dòng 6 (BH15) | phải có 1.330.000, đếm 1.320.000, −10.000, tô đỏ | đúng | — | |
| §5 dòng 7 (BH16) | thuần 990.000; CN01 660.000, CN02 330.000 | đúng | — | |
| §5 dòng 8 (BH17) | hạn trả 5 → đơn 4 ngày không cần duyệt; 99 bị từ chối | đúng | — | |
| §5 dòng 10 (quyền) | thu ngân chỉ `pos:sell` → 403 | đúng | — | |

## 9. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 10. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 12/11/2026 | Tạo phiếu |
| 12/11/2026 | Bỏ cột bản sao website (module không biết kết quả giao); khoá cấu hình khai ở module; ghi kết quả chạy |
