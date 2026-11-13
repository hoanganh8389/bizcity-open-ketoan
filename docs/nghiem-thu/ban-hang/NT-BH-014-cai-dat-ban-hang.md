# NT-BH-014 · Cài đặt bán hàng: một màn cho bán lẻ, phiếu kế toán chênh lệch két, tài khoản hàng bán bị trả lại
<!-- [2026-11-13 06:30 PM Võ Hoàng] NGHIEM-THU — tạo phiếu đợt 3 Bán hàng (chữ chốt docs/nghiep-vu/20) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`, nhóm menu `ban-hang`) |
| Màn hình | BH17 *Cài đặt bán hàng* (`/app/pos/cai-dat`), BH15 *Sổ ca bán*, ACC41 *Tài khoản ngầm định*, ACC14 *Trạm chứng từ* |
| Bộ phận yêu cầu | Kế toán bán hàng, kế toán trưởng |
| Ngày tạo | 13/11/2026 |
| Trạng thái | Nháp — nghiệp vụ đã chốt 13/11 (NT-BH-007 Q1, NT-BH-005 R12; "làm như đề xuất, có lỗi sửa sau") |

Chữ chốt thiết kế: [nghiep-vu/20](../../nghiep-vu/20-cai-dat-ban-hang-chenh-lech-ket.md).

## 1. Mục đích quản trị
Kế toán bán hàng có **một màn** xem và sửa mọi cài đặt bán lẻ: tham số máy bán, cách ghi sổ chứng từ bán, xử lý chênh lệch két, tài khoản hạch toán. Tiền thiếu / thừa két khi chốt ca tự lên sổ (tài sản thiếu / thừa chờ xử lý), không lập tay. Hàng bán bị trả lại vào đúng 5213 (52131) theo hệ thống tài khoản của đơn vị, sửa được ở ACC41 mà không báo lỗi.

## 2. Khai báo trước
- Đơn vị có tài khoản 1381, 3381, 1111, 52131 (hệ thống tài khoản mẫu có sẵn), đối tượng chi nhánh `CN-<mã>`.
- Máy bán POS đã bán được, có ca mở với tiền đầu ca.

## 3. Các bước thao tác
1. Mở **Bán hàng → Cài đặt → Cài đặt bán hàng (BH17)**: thấy 4 khối ① Máy bán tại quầy ② Ghi sổ chứng từ bán ③ Chênh lệch két ④ Tài khoản hạch toán bán hàng.
2. Khối ③: bấm **Tạo lý do mặc định** (lần đầu), Ghi.
3. Ở máy bán: mở ca 1.000.000, bán tiền mặt 330.000, chốt ca đếm 1.320.000.
4. Mở ACC14 và Sổ ca bán: xem phiếu kế toán của ca.
5. Mở ACC41, nhóm *Bán hàng*: sửa dòng "Hàng bán trả lại – Bán hàng hoá dịch vụ – Giảm trừ công nợ", Ghi.

## 4. Số liệu đầu vào
Đơn vị demo Docker (chi nhánh có máy bán, ca mở); đơn vị test sạch cho test tự động.

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Khối ① | 4 tham số như cũ (hạn trả, bắt buộc mở ca, ca theo chi nhánh, ngưỡng chênh lệch); ghi như cũ |
| 2 | Khối ② | `sale`, `sale_return`: *Ghi ngay* / *Chờ duyệt*; đổi một loại không làm mất chế độ của loại chứng từ khác |
| 3 | Khối ③ | bật / tắt "Lập phiếu kế toán khi chốt ca lệch két" (mặc định bật); hai lý do Thiếu (Nợ 1381 / Có 1111), Thừa (Nợ 1111 / Có 3381) — sửa được TK; trạng thái "chưa có lý do" + nút **Tạo lý do mặc định** |
| 4 | Khối ④ | danh sách loại nhóm *Bán hàng* của ACC41 (tên, TK Nợ, TK Có), chỉ đọc, nút **Sửa ở ACC41** |
| 5 | Chốt ca thiếu 10.000 | một phiếu kế toán: Nợ 1381 (đối tượng `CN-<mã>`) / Có 1111 — 10.000; diễn giải có ca, thu ngân, số phải có / đếm được; Sổ ca hiện "đã lập phiếu kế toán" |
| 6 | Chốt ca thừa 5.000 | Nợ 1111 / Có 3381 (đối tượng `CN-<mã>`) — 5.000 |
| 7 | Lệch 0, hoặc khối ③ tắt | không lập phiếu; biên bản ca như cũ |
| 8 | ACC41 dòng trả lại | lọc 3387; 5213; 711, mặc định 52131 — **Ghi được** |
| 9 | ACC41 dòng giảm giá hàng bán | lọc 3387; 5212; 711, mặc định tài khoản con của 5212 |
| 10 | Menu, Luồng chi tiết | không còn mục mờ "Định khoản bán hàng"; ô *Tài khoản hạch toán* / *Cài đặt bán hàng* mở BH17 |
| 11 | Hướng dẫn | bài `pos-cai-dat.md`, `pos-ca-ban.md` viết lại theo màn mới |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Chưa có lý do / lý do thiếu TK khi chốt ca | Ca **vẫn chốt**; phiếu kế toán nằm ở ACC14 thẻ *Lỗi*; Sổ ca hiện "phiếu kế toán lỗi". Kế toán tạo lý do ở BH17 rồi *Ghi sổ lại* |
| 2 | Gửi chốt ca hai lần (mạng chập chờn) | Lần sau báo `POS_SHIFT_CLOSED`; không có phiếu thứ hai (khoá chứng từ theo ca) |
| 3 | Kỳ kế toán đã khoá ở ngày chốt ca | Như chứng từ bán: phiếu lỗi kỳ khoá ở ACC14, ca vẫn chốt |
| 4 | Kế toán đã tự sửa lọc ở ACC41 trước khi cập nhật | Cập nhật giữ nguyên dòng đã sửa tay |
| 5 | Người không có quyền ghi cấu hình / danh mục | Màn chỉ xem; nút Ghi, Tạo lý do ẩn |
| 6 | Ca chốt trước khi cập nhật | Không lập phiếu bù |

## 7. Kết quả chạy
| Mục | Mong đợi | Thực tế | Lệch | Ghi chú |
|---|---|---|---|---|

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 13/11/2026 | Tạo phiếu |
