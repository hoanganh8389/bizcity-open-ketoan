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
<!-- [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-036: kết quả code + kiểm (đóng góp) -->
**21/11/2026 — code xong trên nhánh `feat/nt-bh-036-phieu-ban-mau-phieu-mua`** (chỉ giao diện).

**Đã đổi**
- `apps/web/src/components/phieu-hang/KhungPhieu.tsx` (mới): khung cửa sổ phiếu dựng như phiếu mua (`DockScope`, `useDockWindow`, `MinimizeButton`, `useKiemLoi`) — tiêu đề (tên + số + nhãn trạng thái + "Đang xem"), tổng tiền chữ lớn, **một** nút `btn-help` mở `HelpDrawer`, thu nhỏ, đóng; thân hai cột (cột Trợ lý thu gọn được, nhớ theo máy); dòng phím tắt; chân (lý do chưa ghi + nút). Không dùng `Modal` nên hết nút Hướng dẫn thứ hai; không sửa `ui.tsx`, `PhieuMuaForm.tsx`.
- `apps/web/src/components/phieu-hang/khung-phieu.css` (mới): bố cục khung, gói trong `.kp-sheet` (không phụ thuộc `mua-hang.css`, không đè phiếu mua); dùng lại lớp chung `mh-sheet` / `mh-head` / `mh-panel` / `view-plain` của `theme.css`.
- `PhieuHangForm.tsx`: bỏ `Modal` + nút Hướng dẫn trong thân; khối đầu phiếu một khung (Số phiếu, Ngày, Chi nhánh, Kho, Khách hàng, Kênh bán / Phiếu gốc, Thu tiền, Ghi chú) có *Thu gọn đầu phiếu*; thẻ *Hàng hoá (n)* / *Thu tiền* (BH11 *Trả tiền khách*) / *Hoá đơn*; cột *Trợ lý bán hàng*: *Kiểm tra*, *Khuyến mại & voucher* (chuyển từ thân form), *Tổng tiền*; chân *In* / *Ghi* / *Sửa* / *Thoát*. Lệnh gọi API, dữ liệu gửi (`saleInput`), điều kiện chặn Ghi (`problems`), in giữ nguyên.
- `PhieuHangPage.tsx`: truyền `helpKey`, cờ `startEdit` (nút Sửa của danh sách mở thẳng chế độ sửa — thay `openNextInEdit` của khung chung).
- `docs/huong-dan/ban-hang-quy-trinh.md`: mục bố cục phiếu BH10 / BH11.

**Việc của khung chung được làm lại trong KhungPhieu**: chế độ xem phiếu đã ghi (nhãn *Đang xem*, ô khoá, nút *Sửa*, F2 / Enter / bấm đúp = Sửa); Ctrl + S bấm *Ghi* (nút khoá thì báo lý do); Esc đóng (đang mở Hướng dẫn thì Esc chỉ đóng Hướng dẫn); thu nhỏ xuống thanh dưới; tổng tiền ở tiêu đề; báo lỗi tại ô (`useKiemLoi`); dòng phím tắt F9 / Ctrl + S / Esc.

**Kiểm**
- `npm run typecheck` (gốc): đạt. `npm run build -w @ketoan/web`: đạt. Không có test web riêng cho phiếu hàng.
- Trình duyệt (vite dev :4180 → API Docker :8088, đơn vị `demo`; Docker dựng từ commit khác nên chạy giao diện của nhánh bằng vite): BH10 mới, BH11 mới, BH10 / BH11 đã duyệt — mỗi hộp **1** nút Hướng dẫn (phiếu mua so sánh: 1). Chế độ xem phiếu nháp kiểm bằng cách đổi trạng thái trong phản hồi GET ở trình duyệt (không ghi gì vào CSDL): mở bằng bấm đúp → *Đang xem*, ô khoá, chân *In · Sửa · Thoát*; F2 → sửa, chân *In · Ghi · Thoát*; nút *Sửa* của danh sách → vào thẳng chế độ sửa; Esc đóng; không lỗi trang.
- Ảnh: `C:\Users\thuyn\AppData\Local\Temp\claude\f20639bf250e4278\4946fdce-2ef3-4626-8e6f-a890fc558c5d\scratchpad
t036-bh10-moi.png`, `nt036-bh10-the-thu-tien.png`, `nt036-bh10-huong-dan.png`, `nt036-bh10-da-duyet.png`, `nt036-bh10-nhap-xem.png`, `nt036-bh10-nhap-sua.png`, `nt036-bh10-thu-gon.png`, `nt036-bh11-moi.png`, `nt036-bh11-da-duyet.png`, `nt036-mua-so-sanh.png` (thư mục tạm của phiên, không đưa vào repo).

**Khác thiết kế / chưa làm**
- Thẻ *Lịch sử*: chưa có — form phiếu bán chưa có dữ liệu lịch sử (§3.3 "nếu phiếu đã ghi"); không thêm API.
- Chân không có nút *Duyệt*: phiếu bán vẫn duyệt / bỏ duyệt ở thanh nút danh sách như cũ (không thêm luồng). Thanh nút bảng hàng chỉ có *+ Thêm dòng* (phiếu bán chưa có Nhập Excel).
- Bảng hàng cột cố định, bề rộng cột gọn lại (Mã 150, ĐVT 70, Kho 90…) để Tên hàng đủ chỗ cạnh cột Trợ lý; bảng rộng hơn khung thì cuộn ngang.
- Bấm vào ô khi đang xem: không còn câu nhắc + nháy nút Sửa của khung chung; thay bằng cách của phiếu mua (ô khoá, nhãn "Đang xem — bấm Sửa để thay đổi", bấm đúp để sửa). "Ghi và thoát" của khung chung không áp (màn chưa dùng `viewAgain`).
- Tồn sổ của cửa hàng (cảnh báo bán quá tồn): khi đang xem chưa đọc tồn của cửa hàng; bấm Sửa mới đọc (trước đây đọc ngay lúc mở).
- Hướng dẫn `docs/huong-dan/phieu-hang.md` ngoài phạm vi giữ chỗ — mô tả bố cục mới ghi ở `ban-hang-quy-trinh.md`.
- Chưa lập + duyệt phiếu bán có voucher / phiếu trả thật để so số tiền (§5): không đổi nghiệp vụ, không ghi dữ liệu vào đơn vị demo đang dùng chung; nên kiểm lại khi Docker dựng từ nhánh.

**Kiểm thêm trên bản cài Docker dựng từ nhánh (Võ Hoàng, 21/11):**
- Lập phiếu bán trên màn mới (CN02, 1 dòng 100021001, thu tiền ngay) → Ghi được nháp BH2611000003; tổng trên màn 300.926 + 24.074 = 325.000 khớp số máy chủ lưu, khoản thu TM 325.000.
- Bảng hàng tràn mất cột Tiền thuế / tổng khi mở Trợ lý (tối thiểu 1.150px > phần trái ~1.070px) → giảm còn 1.000px, cột Mã hàng 120px; đã hết tràn.
- Phiếu ghi nợ chưa chọn khách: trước đây Kiểm tra báo "Đủ thông tin" rồi máy chủ trả VALIDATION_ERROR khi Ghi (luật có từ trước, `domain/doc.ts`) → Kiểm tra nay báo trước "Còn ghi nợ (thu chưa đủ) — chọn khách hàng hoặc thu đủ tiền", nút Ghi khoá; bước 2 ghi rõ "để trống = khách lẻ, chỉ khi thu đủ tiền".

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 21/11/2026 | Tạo phiếu, chốt Q1–Q4; giữ chỗ code |
| 21/11/2026 | Code xong (khung KhungPhieu, form theo mẫu phiếu mua), điền §6 |
| 21/11/2026 | Thử trên bản cài: sửa bảng hàng tràn cột; Kiểm tra báo trước phiếu ghi nợ phải chọn khách |
