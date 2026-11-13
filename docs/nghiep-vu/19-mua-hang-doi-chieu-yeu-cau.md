<!-- [2026-11-13 Nguyễn Văn Thủy] đối chiếu yêu cầu quy trình mua hàng (tài liệu nghiệp vụ của phòng kế toán) với phần mềm (đóng góp) -->
# Mua hàng — đối chiếu yêu cầu nghiệp vụ với phần mềm

Nguồn yêu cầu: tài liệu "Quy trình mua – bán hàng hoá thương mại" của phòng kế toán (mục 1, 2, 4, 5, 6 và phần danh mục).
Ký hiệu: **Có** = đã chạy · **Một phần** = có nhưng thiếu ý · **Chưa** = chưa làm.

## 1. Luồng 11 bước mua hàng

| # | Bước | Kiểm soát yêu cầu | Phần mềm | Trạng thái |
|---|---|---|---|---|
| 1 | Khai NCC, mặt hàng | Trùng MST, trạng thái MST | NCC mua hàng (MH01), Quản lý mặt hàng (DM10); trùng MST báo khi lưu | Một phần — chưa tra trạng thái MST tự động |
| 2 | Chọn NCC, ký hợp đồng | Lưu bản scan hợp đồng | Hồ sơ NCC có hợp đồng mua bán (số, ngày ký) + đính kèm | Có |
| 3 | Bảng giá mua, chiết khấu, thưởng | Gắn hợp đồng, có hiệu lực, được duyệt | Giá NCC theo ngày hiệu lực (MH01), Chính sách mua (MH04) có giai đoạn, áp đồng thời / áp riêng | Một phần — chính sách chưa có bước duyệt riêng |
| 4 | Xác định nhu cầu | Gợi ý số lượng từ tồn | Phân tích đặt hàng (MH02) theo tồn max, công thức (MH18) | Có |
| 5 | Lập đơn đặt | Lấy giá, CK, kỳ hạn theo hợp đồng | Đơn đặt tự áp giá NCC + chính sách đang chạy + hạn trả | Có |
| 6 | Duyệt đơn, gửi NCC | Giá lệch hợp đồng cần cấp cao hơn duyệt | Duyệt đơn; giá lệch quá % (MH12) cảnh báo; vượt hạn mức cần người có quyền | Một phần — chưa phân cấp người duyệt theo mức lệch |
| 7 | Nhận hàng, kiểm lô / HSD | Biên bản giao nhận | Phiếu nhập lập từ đơn, nhập số lô + HSD theo từng phân kho | Có |
| 8 | Nhập kho | Không nhập vượt PO | Đối chiếu đơn ↔ phiếu nhập (MH21); **mới:** công tắc MH12 "Không cho nhập vượt số lượng đơn đặt" (bật = chặn duyệt) | Có |
| 8b | Hoá đơn mua, chi phí mua | Đối chiếu HĐ – PO – HĐĐT – phiếu nhập | Hoá đơn NCC (MH22) so từng dòng với phiếu nhập; chi phí mua hàng + phân bổ (MH07) theo giá trị / số lượng | Có |
| 8c | Công nợ phải trả | Ngày đến hạn theo hợp đồng | Hạn trả tính theo điều khoản NCC; Hạn mức & công nợ đến hạn (MH05) | Có |
| 9 | Thanh toán | Chỉ trả khoản đã khớp; bù trừ | Trả tiền NCC gợi ý khoản đến hạn, đối trừ ứng trước; cấn trừ công nợ (BT03) | Một phần — chưa chặn trả khoản chưa khớp hoá đơn |
| 10 | Trả hàng NCC | Tham chiếu phiếu nhập gốc | Trả lại hàng mua chọn phiếu nhập gốc | Có |
| 11 | Quyết toán thưởng, thanh lý HĐ | Tự tính theo phát sinh thực tế | Tính thưởng cuối kỳ (MH06) theo doanh số thực tế | Một phần — chưa có thao tác "thanh lý hợp đồng" |

## 2. Hạch toán mua hàng

Định khoản lấy từ **Tài khoản ngầm định** theo loại chứng từ (ACC41) — một nơi khai. Mua hàng không còn bảng tài khoản riêng (MH12 chỉ hiện "đang dùng").

| Nghiệp vụ | Định khoản theo tài liệu | Phần mềm |
|---|---|---|
| Nhập kho có HĐ | Nợ 156, 1331 / Có 331 | Có |
| Chi phí mua hàng | Nợ 156, 1331 / Có 331, phân bổ theo đơn giao | Có (MH07) |
| Trả hàng NCC | Nợ 331 / Có 156, 1331 | Có |
| Thanh toán | Nợ 331 / Có 112 | Có |
| CK thương mại theo doanh số | Nợ 331 / Có 156 (hàng còn tồn), 632 (hàng đã bán), 1331 | Một phần — đang giảm giá hàng mua; chưa tách phần đã bán vào 632 |
| CK thanh toán | Nợ 331 hoặc 112 / Có 515 | Có |
| Hàng KM hãng tặng đại lý (có HĐ) | Nợ 331 / Có 156, chia giá vốn | Có (quà có giá trị) |
| Hàng KM tặng người tiêu dùng | Chỉ theo dõi số lượng, không chia giá vốn; mã KM con gắn mã cha | Có (quà không hoá đơn, mã con theo mã cha) |

## 3. Báo cáo mua hàng

| Báo cáo | Phần mềm |
|---|---|
| Sổ tổng hợp / chi tiết công nợ phải trả | Có (ACC38B, chi tiết theo đối tượng) |
| Sổ chi tiết / tổng hợp công nợ theo hợp đồng | Chưa — cần thêm cột hợp đồng vào công nợ phải trả |
| Tổng hợp mua hàng theo mặt hàng | Có (MH23A) |
| Tổng hợp mua hàng theo chi nhánh | Một phần — Báo cáo mua hàng (MH23) lọc / nhóm theo chi nhánh |
| Biên bản đối chiếu công nợ | Có (CN07) |

## 4. Việc tiếp theo (theo thứ tự lõi trước)

1. Công nợ theo hợp đồng: mang mã hợp đồng từ đơn đặt → phiếu nhập → công nợ; thêm 2 báo cáo theo hợp đồng.
2. CK thương mại sau mua: tách phần hàng đã bán (632) / còn tồn (156) theo tồn tại ngày ghi nhận.
3. Duyệt nhiều cấp theo mức lệch giá / vượt hạn mức — dùng chung cho mua, bán, chi tiền (một màn cấu hình luật duyệt).
4. Tra trạng thái MST khi khai NCC / khách hàng.
5. Thanh lý hợp đồng: khoá hợp đồng, chặn đơn mới, chốt số liệu thưởng.

Mỗi việc làm xong: cập nhật bảng trên, thêm test theo tình huống trong tài liệu, chụp màn kiểm tra.
