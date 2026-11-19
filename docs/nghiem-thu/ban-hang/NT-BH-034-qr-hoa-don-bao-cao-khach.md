# NT-BH-034 · QR lấy hoá đơn điện tử trên bill (khách tự nhập MST / email) và báo cáo khách hàng
<!-- [2026-11-19 Võ Hoàng] NGHIEM-THU — chốt NT-BH-034 (anh Hoàng, 19/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`; đọc thêm `phieu-ban`, `loyalty`, `voucher`); website `tgs_pos` + `tgs-viettel-invoice`; máy bán React (`tgs_pos/react`) |
| Màn hình | Bill máy bán; trang công khai "Lấy hoá đơn" trên website shop; báo cáo khách hàng (mới, module pos) |
| Mục được giao | Bán hàng: yêu cầu ERP tab Banhang-CTKM POS-002e (QR lấy hoá đơn, khách tự gửi mail), Report e (báo cáo khách chi tiết), Report g (quyết toán quà theo khách) |
| Ngày tạo | 19/11/2026 |
| Trạng thái | **Đã chốt 19/11/2026** (Võ Hoàng) |
| Căn cứ | Yêu cầu ERP 02/11/2026; NT-BH-010 (người mua hoá đơn trên đơn, `pos.order.invoice-buyer`); plugin `tgs-viettel-invoice` (phát hành + gửi CQT từ phiếu bán website) |

## 1. Hiện trạng
- Thu ngân nhập người mua hoá đơn trên máy bán (`invoice-buyer`), website phát hành qua Viettel. Bill chỉ có QR thanh toán; khách không tự lấy hoá đơn được.
- Không có báo cáo theo khách (hàng đã mua, voucher, điểm, quà, nơi mua).

## 2. Cách làm
### A. QR lấy hoá đơn
1. **Bill in QR "Lấy hoá đơn điện tử"** (máy bán React): đường dẫn tới trang công khai trên **website của shop** (Q1), mang mã bill + **chữ ký** (HMAC, chống đoán / sửa mã bill) + hạn dùng.
2. **Trang công khai** (website, không cần đăng nhập): hiện tóm tắt bill (số, ngày, tổng tiền — không lộ thông tin khách khác); khách nhập **MST** (tự tra tên / địa chỉ đơn vị), hoặc tên + địa chỉ (cá nhân), **email** nhận hoá đơn.
3. **Thời hạn** (Q2): chỉ **trong ngày bán**. Quá ngày → báo "đã qua ngày bán, liên hệ cửa hàng"; đơn không lấy thì vào hoá đơn tổng hợp cuối ngày như hiện nay.
4. **Phát hành** (Q3): MST hợp lệ → **tự phát hành ngay** qua Viettel (đúng đường plugin hiện có), **gửi email** + hiện link tải. Lưu người mua về **đơn bên kế toán** (`invoice-buyer` — một nguồn, như NT-BH-010) trước khi phát hành. Một bill chỉ lấy **một lần** (đã có hoá đơn → hiện lại link). MST không hợp lệ / rủi ro / lỗi phát hành → báo khách, ghi yêu cầu chờ kế toán xử lý.
5. Chống lạm dụng: giới hạn số lần thử theo bill / IP; không lộ dữ liệu ngoài bill đó.

### B. Báo cáo khách hàng (Q4 — làm ở kế toán, module `pos`)
- Mỗi **khách × kỳ × cửa hàng**: số đơn, tiền hàng, giảm giá, thực trả, trả hàng; **voucher đã dùng**; **điểm tích / đổi**; **quà đã nhận** (số lượng, giá trị theo giá bán / giá vốn khi đã tính) — Report g; cửa hàng đã mua.
- Bấm khách → **từng lần mua**: mặt hàng, đơn giá, số lượng, khuyến mại, voucher, điểm, quà.
- Gộp **đơn máy bán + phiếu bán BH10** (module không đọc bảng nhau — số liệu của `phieu-ban`, `loyalty`, `voucher` lấy qua action đọc). Lọc nhiều cửa hàng (`branchCodes`), kênh; xuất Excel. Quyền xem `pos:report`.

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| In bill đơn `CN02BT10005` | Có QR "Lấy hoá đơn điện tử" |
| Khách quét, nhập MST hợp lệ + email trong ngày bán | Hoá đơn phát hành, email gửi, trang hiện link tải; đơn bên kế toán có người mua |
| Quét lại bill đã lấy | Hiện lại hoá đơn đã phát hành, không phát hành lần hai |
| Sửa mã bill trong đường dẫn | Từ chối (chữ ký sai) |
| Quét sau ngày bán | Báo hết hạn, không phát hành |
| MST không hợp lệ | Báo lỗi, không phát hành |
| Báo cáo khách 01–19/11, CN01 + CN02 | Mỗi khách: đơn, tiền, voucher, điểm, quà; xem từng lần mua; gồm cả BH10 |
| Người không có `pos:report` | 403 |

## 4. Đã chốt (19/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Trang lấy hoá đơn | Website của shop |
| Q2 | Thời hạn | Trong ngày bán |
| Q3 | Phát hành | Tự phát hành + gửi email; lỗi / MST rủi ro thì chờ kế toán |
| Q4 | Báo cáo khách | Làm ở kế toán, cùng đợt |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-034-qr-hoa-don-bao-cao-khach.test.ts` (chưa tách — tạo khi code) |

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 19/11/2026 | Tạo phiếu, chốt Q1–Q4 |
