# NT-BH-015 · Phiếu bán / trả hàng nhập tay vào sổ thật (BH10, BH11): số theo cửa hàng, chính sách như máy bán, kho theo sổ kế toán
<!-- [2026-11-13 11:00 PM Võ Hoàng] NGHIEM-THU — tạo phiếu đợt (b) Bán hàng: phiếu bán / trả nhập tay thành chứng từ thật, module modules/phieu-ban (chữ chốt docs/nghiep-vu/21) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module mới `phieu-ban`, nhóm menu `ban-hang`) |
| Màn hình | BH10 *Phiếu bán hàng*, BH11 *Hàng bán trả lại* (nhập tay — bán buôn, bán nợ, bán ngoài quầy) |
| Bộ phận yêu cầu | Kế toán bán hàng, bán buôn |
| Ngày tạo | 13/11/2026 |
| Trạng thái | Nháp — anh Hoàng chốt hướng 13/11: làm thành đợt riêng; kho lấy sổ open-ketoan làm gốc; đặt ở module mới |

Chữ chốt thiết kế: [nghiep-vu/21](../../nghiep-vu/21-phieu-ban-nhap-tay.md).

## 1. Mục đích quản trị
Hiện BH10 / BH11 chạy bằng **dữ liệu giả** lưu ở trình duyệt — trông như thật nhưng không vào sổ, dễ gây nhầm. Đợt này biến chúng thành chứng từ thật: lưu ở máy chủ, có nháp → duyệt → ghi sổ, số phiếu theo cửa hàng không trùng, giá và chính sách bán **cùng bộ tính với máy bán POS**, trừ tồn theo kho của sổ kế toán. Bán buôn, bán nợ, bán ngoài quầy đi chung một luồng với bán lẻ.

## 2. Khai báo trước
- Chi nhánh (cửa hàng), kho của chi nhánh, mặt hàng có thuế đầu ra, bảng giá, khách hàng (khách nợ có hạn thanh toán).
- Chế độ ghi sổ `sale` / `sale_return` (ghi ngay hoặc chờ duyệt) ở Cài đặt bán hàng BH17.
- Chương trình bán / khuyến mại đã phát hành (nếu muốn áp).

## 3. Các bước thao tác
1. **Bán hàng → Phiếu bán hàng → Thêm**: chọn cửa hàng, kho xuất, khách; số phiếu để trống.
2. Thêm dòng hàng: phần mềm điền giá theo bảng giá **của cửa hàng** (như máy bán), tự gợi ý khuyến mại / quà theo chương trình đang chạy; người lập bỏ chọn được từng khuyến mại.
3. Nhập thu tiền (hoặc để trống = ghi công nợ), số hoá đơn / ký hiệu nếu đã xuất hoá đơn.
4. **Ghi** → phiếu nháp có số. **Duyệt** → vào sổ (ghi ngay hoặc chờ ở ACC14 theo BH17).
5. **Bỏ duyệt** → bút toán đảo, phiếu về nháp, sửa được.
6. **Hàng bán trả lại**: chọn phiếu bán gốc, số lượng trả không quá số còn trả được.

## 4. Số liệu đầu vào
- Cửa hàng `CN01`, kho `K01`; khách `KH001` (khách nợ, hạn 30 ngày).
- Mặt hàng `SUA330` 330.000 / hộp (gồm thuế 8 %), tồn kho 10 hộp.
- Chương trình giảm 10 % cho `SUA330` đang chạy ở `CN01`.

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Phiếu nháp | Ghi → lưu ở máy chủ, số `BH2611000001` (cửa hàng `CN01`, tháng 11/2026); mở máy khác thấy cùng phiếu; không còn dải "DỮ LIỆU GIẢ" |
| 2 | Số phiếu theo cửa hàng | `CN02` có dãy riêng `BH2611000001`; đầu số `BH` khác `HD` của máy bán; gõ tay số đã có ở cùng cửa hàng + loại → báo trùng, không Ghi |
| 3 | Giá | dòng `SUA330` điền 330.000 theo bảng giá của `CN01` (như máy bán) |
| 4 | Chính sách | gợi ý giảm 10 % (33.000 / hộp) từ chương trình; dòng mang mã chính sách; bỏ chọn → không giảm |
| 5 | Duyệt, bán 2 hộp ghi nợ | sổ: Nợ 1311 (KH001) / Có 5111x, Có 33311 — đúng tổng sau giảm; Nợ 632 / Có 156 theo giá vốn; tồn `CN01/K01` còn 8 |
| 6 | Bỏ duyệt | bút toán đảo (số âm), phiếu về nháp, tồn về 10 |
| 7 | Trả 1 hộp từ phiếu gốc | phiếu trả nối phiếu gốc; không trả quá số còn trả; sổ ghi hàng bán bị trả lại theo ACC41; tồn +1 |
| 8 | Hoá đơn ghi tay | số hoá đơn / ký hiệu đã có → lên bảng kê bán ra theo phiếu |
| 9 | Danh sách | lọc kỳ, cửa hàng, trạng thái, tìm theo số phiếu / khách / số hoá đơn; cột cửa hàng luôn hiện cạnh số phiếu |
| 10 | Phiếu cũ trên trình duyệt | phiếu giả đã thử ở máy không chuyển sang sổ; màn báo một lần "phiếu thử trên máy này không còn dùng" |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Bán vượt tồn của kho | Như máy bán và sổ hiện nay: **không chặn** (giá vốn tính cuối tháng); màn hiện cảnh báo vàng "tồn theo sổ còn X" ở dòng đó |
| 2 | Mặt hàng thiếu thuế đầu ra / chưa có giá | Chặn Ghi, chỉ rõ dòng |
| 3 | Cửa hàng **chưa chuyển kho sang open-ketoan** (tồn ở sổ khác tồn thực tế) | Phiếu vẫn ghi; màn cảnh báo "tồn kho của cửa hàng chưa chuyển sang sổ kế toán — số tồn có thể lệch" (xem chữ chốt §1) |
| 4 | Kỳ đã khoá | Duyệt / bỏ duyệt bị chặn như mọi chứng từ |
| 5 | Phiếu đã duyệt | Không sửa, không xoá; muốn sửa → bỏ duyệt |
| 6 | Trả hàng vượt số đã bán / phiếu gốc chưa duyệt | Chặn |

## Cần chốt (mặc định tạm — làm theo mặc định nếu không ai sửa)

| # | Câu hỏi | Mặc định tạm |
|---|---|---|
| Q1 | Phát hành hoá đơn điện tử ngay từ phiếu nhập tay? | **Đợt sau**: đi cùng đường máy bán (bản sao sổ → website → plugin hoá đơn), cần sửa phía website. Đợt này ghi tay số hoá đơn đã xuất |
| Q2 | Chặn vượt hạn mức nợ khách? | **Đợt 4** (Chính sách bán, `sale.credit_limit@1`); đợt này chỉ hiện công nợ hiện tại của khách |
| Q3 | Đầu số | Bán `BH`, trả `TL` + năm tháng + 6 số, theo cửa hàng × loại × tháng |
| Q4 | Người lập được tự duyệt phiếu của mình? | Được, nếu có quyền ghi chứng từ (như phiếu mua hàng) |

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
