# NT-BH-036 · Phiếu bán / trả bán (BH10, BH11) cùng mẫu với phiếu mua
<!-- [2026-11-21 Võ Hoàng] NGHIEM-THU — chốt NT-BH-036 (anh Hoàng, 21/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (giao diện phiếu bán dùng chung `apps/web/src/components/phieu-hang/`) |
| Màn hình | BH10 Phiếu bán hàng, BH11 Trả lại hàng bán (hộp thoại Thêm / Sửa / Xem); phiếu bán mở từ đơn đặt hàng BH20 |
| Ngày tạo | 21/11/2026 |
| Trạng thái | **Đã chốt 21/11/2026** (Võ Hoàng) |
| Căn cứ | Anh Hoàng kiểm 21/11: hộp thoại "Phiếu bán hàng (mới)" có **2 nút Hướng dẫn** (một ở tiêu đề do khung hộp thoại chung, một trong thân form), giao diện khác phiếu "Nhập mua (mới)" — cần một mẫu cho mua và bán |

## 1. Hiện trạng
- Phiếu bán / trả bán dùng `PhieuHangForm` đặt trong khung hộp thoại chung (`Modal`). Khung tự thêm nút "? Hướng dẫn" ở tiêu đề (thẻ HT17 theo hộp thoại, thường trống), form có thêm nút "? Hướng dẫn" riêng (hướng dẫn `phieu-hang`) → 2 nút.
- Thân phiếu xếp dọc một cột: thông tin phiếu, hoá đơn, bảng hàng, khuyến mại, voucher, thu tiền; tổng tiền chỉ ở tiêu đề.
- Phiếu mua ("Nhập mua (mới)", `PhieuMuaForm`) đã có bố cục khác: một nút Hướng dẫn, khối đầu phiếu, các thẻ, cột phải *Trợ lý*, chân nút Ghi / Gửi duyệt / Duyệt / Thoát.

## 2. Đã chốt (21/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Nút Hướng dẫn | **Một nút**, giống phiếu mua (nút `btn-help` ở tiêu đề); bỏ nút thừa |
| Q2 | Mức giống phiếu mua | **Cùng bố cục đầy đủ** — chỉ đổi giao diện, nghiệp vụ giữ nguyên |
| Q3 | Áp cho màn nào | **Cả BH10 và BH11** (một mẫu, như phiếu mua / trả mua) |
| Q4 | Luồng | **Phiếu mới NT-BH-036**, code sau khi PR NT-BH-035 merge (form đã có ô kênh + voucher) |

## 3. Cách làm
1. **Khung:** tiêu đề "Phiếu bán hàng (mới) / số phiếu" + nhãn trạng thái (Nháp / Đã duyệt) như phiếu mua; bên phải tổng tiền ("Phải thu khách" / "Phải trả khách" với BH11), **một** nút "? Hướng dẫn" (mở hướng dẫn `phieu-hang`), thu nhỏ, đóng. Không còn nút Hướng dẫn trong thân form.
   - Dùng tham số của khung hộp thoại chung nếu đủ (vd `helpKey`); nếu phải dựng khung riêng như phiếu mua (`DockScope`, `useDockWindow`) thì dựng ở `components/phieu-hang/`, **không sửa** `PhieuMuaForm.tsx`, `ui.tsx` (thuộc giữ chỗ khác). Thiếu tham số ở khung chung → dừng, hỏi anh trước.
2. **Khối đầu phiếu** (một khung viền như phiếu mua): Số phiếu, Ngày, Chi nhánh lập chứng từ, Kho xuất, Khách hàng, Kênh bán, Thu tiền (chưa thu / thu ngay), Ghi chú; BH11 thêm Số phiếu bán gốc, Lý do. Có nút *Thu gọn đầu phiếu*.
3. **Các thẻ** dưới đầu phiếu: *Hàng hoá (n)* (thanh nút: Thêm dòng, Nhập Excel nếu đang có; bảng hàng như hiện tại), *Thu tiền* (khoản thu), *Hoá đơn* (số, ký hiệu, ngày hoá đơn), *Lịch sử* (nếu phiếu đã ghi).
4. **Cột phải "Trợ lý bán hàng"** (thu gọn được): *Kiểm tra* (các bước / lỗi "chưa ghi được" đang hiện ở chân), *Khuyến mại & voucher* (nút Áp khuyến mại, mã giảm giá, mã voucher + Kiểm voucher — chuyển từ thân form), *Tổng tiền* (tiền hàng, chiết khấu, giảm voucher, tiền trước thuế, thuế GTGT, phải thu / phải trả).
5. **Chân:** dòng "Chưa ghi được: …" bên trái; nút Ghi / Duyệt (ghi sổ) / Thoát bên phải như phiếu mua (giữ đúng quyền và luồng hiện có, không thêm Gửi duyệt nếu phiếu bán chưa có bước đó). Phím tắt giữ nguyên (F9, Ctrl + S, Esc).
6. Chế độ *Xem* (phiếu đã ghi / đã duyệt) và *Sửa* giữ như hiện tại.
7. Cập nhật `docs/huong-dan/` của phiếu bán (ảnh / mô tả bố cục mới).

## 4. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Mở BH10 Thêm mới | Một nút Hướng dẫn ở tiêu đề; bố cục đầu phiếu / thẻ / Trợ lý / chân như "Nhập mua (mới)" |
| Mở BH11 Thêm mới | Cùng mẫu; có ô phiếu bán gốc, lý do; tổng "Phải trả khách" |
| Lập, ghi, duyệt phiếu bán có khuyến mại + voucher + thu tiền | Kết quả (số tiền, bút toán, kho) **như trước khi đổi giao diện** |
| Phiếu đã duyệt | Mở ở chế độ Xem, nút Sửa / bỏ duyệt như cũ |
| Phiếu bán mở từ đơn đặt hàng BH20 (giao hàng) | Cùng mẫu, đủ dòng hàng + phí ship |

## 5. Kiểm
- Test web hiện có của phiếu bán (nếu có) đạt; typecheck; build web.
- Trình duyệt (Docker dựng từ nhánh): chụp BH10, BH11 mới / xem; lập + duyệt một phiếu bán có voucher, một phiếu trả; so số tiền với cùng phiếu lập qua API.

## 6. Kết quả chạy
_(điền khi code xong)_

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 21/11/2026 | Tạo phiếu, chốt Q1–Q4; giữ chỗ code |
