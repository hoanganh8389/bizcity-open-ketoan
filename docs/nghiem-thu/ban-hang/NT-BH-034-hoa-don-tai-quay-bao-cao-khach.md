# NT-BH-034 · Hoá đơn điện tử tại quầy làm y POS cũ, và báo cáo khách hàng
<!-- [2026-11-19 Võ Hoàng] NGHIEM-THU — chốt NT-BH-034 (anh Hoàng, 19/11); sửa 19/11: bỏ QR / trang công khai, làm y luồng POS cũ (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`; đọc thêm `phieu-ban`, `loyalty`, `voucher`); máy bán React (`tgs_pos/react`); website `tgs_pos` + `tgs-viettel-invoice` |
| Màn hình | Máy bán — màn "Khách xuất hoá đơn" sau khi thanh toán; báo cáo khách hàng (mới, module pos) |
| Mục được giao | Bán hàng: yêu cầu ERP tab Banhang-CTKM POS-002d/e (hoá đơn điện tử tại quầy), Report e (báo cáo khách chi tiết), Report g (quyết toán quà theo khách) |
| Ngày tạo | 19/11/2026 |
| Trạng thái | **Đã chốt 19/11/2026** (Võ Hoàng) |
| Căn cứ | Luồng POS cũ (`tgs_pos/assets/js/pos-payment.js` `openPaidReceiptWithViettelReview`, `openItemReviewModal`, `proceedItemReview`, `_sendTaxAndPrintBills`; `pos-tax-lookup.js`; khối "Khách xuất hoá đơn" trong `tgs_pos/templates/front/pos-layout-tailwind.php` (plugin website, ngoài repo này)); NT-BH-010 (người mua trên đơn, `pos.order.invoice-buyer`) |

## 1. Hiện trạng
**POS cũ:** thanh toán xong, màn **"Khách xuất hoá đơn"** tự mở (shop có plugin Viettel), điền sẵn khách của đơn → thu ngân nhập / tra MST → **"Gửi thuế & in bill"**: in bill ngay, phát hành Viettel chạy ngầm, tự gửi email PDF, báo Zalo kế toán. Khách không lấy hoá đơn → vẫn một hoá đơn "Bán cho người tiêu dùng" (không có hoá đơn gộp cuối ngày). "Hủy gửi thuế" (Esc) → in bill, đơn chờ ở màn Gửi thuế để gửi sau.

**Máy bán React:** chỉ có nút tay "Hoá đơn VAT" sau khi chốt (bấm "Bán đơn mới" là bỏ qua); không tra MST; MST chỉ nhận 10 / 13 số (chặn CCCD 12 số); thiếu luật bắt buộc; không gửi email; luật bỏ chọn quà khác cũ; phát hành chặn màn (khách đứng chờ); thiếu ô SĐT; hồ sơ khách lúc bán không có email / địa chỉ.

## 2. Cách làm
### A. Hoá đơn tại quầy — làm y POS cũ (Q1)
1. **Tự mở màn "Khách xuất hoá đơn"** ngay sau khi thanh toán (shop có plugin Viettel), điền sẵn khách của đơn; **"Gửi thuế & in bill"** (Enter) và **"Hủy gửi thuế"** (Esc → in bill, đơn chờ ở màn Gửi thuế / Đơn hàng để gửi sau).
2. **Mã số thuế / căn cước:** nhận **10, 12 (CCCD), 13 số** — ở máy bán và ở máy chủ (`pos.order.invoice-buyer`).
3. **Tra cứu MST** (nút "Tra cứu" + tự tra khi rời ô; dùng đường tra + bộ nhớ đệm của website như POS cũ): tự điền và khoá Tên công ty, Địa chỉ; cảnh báo doanh nghiệp ngừng hoạt động; mã 12 số không tra.
4. **Luật bắt buộc** (như `taxBuyerRequirement` cũ): có MST → bắt buộc tên người mua (không phải "Khách lẻ") và địa chỉ; mã 12 số → bắt buộc email; email đã gõ thì đúng định dạng; báo đỏ đúng ô. Kiểm cả ở máy chủ.
5. **Dòng quà gửi thuế** (như cũ): mã Nội bộ / Z và quà kèm sữa dưới 24 tháng (cả quà cấp đơn khi đơn có hàng dưới 24 tháng) **luôn bỏ, khoá**; dòng 0đ khác bật / tắt được; dòng có tiền luôn gửi; hàng chính dưới 24 tháng cảnh báo, bấm lần hai mới gửi.
6. **In bill trước, phát hành chạy ngầm**, báo kết quả bằng thông báo; xong thì **tự gửi email PDF** (email trống thì bỏ qua) và **báo Zalo** kế toán như cũ.
7. **Ô SĐT**, bản xem trước tờ hoá đơn, nhãn "Bán cho người tiêu dùng" khi không có tên.
8. **Hồ sơ khách lúc bán** có MST, email, địa chỉ, tên công ty (sửa tại chỗ) để màn hoá đơn được điền sẵn.
9. **Viettel báo lỗi người mua / MST** → mở lại form sửa rồi phát hành lại.

### B. Báo cáo khách hàng (Q2 — ở kế toán, module `pos`)
- Mỗi **khách × kỳ × cửa hàng**: số đơn, tiền hàng, giảm giá, thực trả, trả hàng; **voucher đã dùng**; **điểm tích / đổi**; **quà đã nhận** (số lượng, giá trị theo giá bán / giá vốn khi đã tính) — Report g; cửa hàng đã mua.
- Bấm khách → **từng lần mua**: mặt hàng, đơn giá, số lượng, khuyến mại, voucher, điểm, quà.
- Gộp **đơn máy bán + phiếu bán BH10** (số liệu của `phieu-ban`, `loyalty`, `voucher` lấy qua action đọc). Lọc nhiều cửa hàng (`branchCodes`), kênh; xuất Excel. Quyền xem `pos:report`.

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Thanh toán đơn ở shop có Viettel | Màn "Khách xuất hoá đơn" tự mở, điền sẵn khách |
| Nhập MST doanh nghiệp, bấm Tra cứu | Tự điền + khoá tên công ty, địa chỉ |
| MST có nhưng thiếu địa chỉ / tên là "Khách lẻ" | Báo đỏ đúng ô, không gửi |
| Khách cá nhân nhập CCCD 12 số + email | Nhận; phát hành được (máy chủ cũng nhận) |
| CCCD 12 số không có email | Báo bắt buộc email |
| "Gửi thuế & in bill" | Bill in ngay; hoá đơn phát hành ngầm; email PDF tới khách; báo Zalo |
| Đơn có quà kèm sữa dưới 24 tháng | Dòng quà bị bỏ và khoá, không bật lại được |
| "Hủy gửi thuế" | Bill in; đơn chờ gửi sau ở màn Gửi thuế / Đơn hàng |
| Viettel báo sai MST | Mở lại form sửa, phát hành lại |
| Báo cáo khách 01–19/11, CN01 + CN02 | Mỗi khách: đơn, tiền, voucher, điểm, quà; xem từng lần mua; gồm cả BH10 |
| Người không có `pos:report` | 403 ở báo cáo khách |

## 4. Đã chốt (19/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Hoá đơn điện tử | **Không có QR / trang công khai.** Khách muốn hoá đơn thì nói lúc ra đơn; làm **y luồng POS cũ** |
| Q2 | Báo cáo khách | Làm ở kế toán, cùng đợt |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-034-hoa-don-bao-cao-khach.test.ts` (chưa tách — tạo khi code) |

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 19/11/2026 | Tạo phiếu, chốt Q1–Q4 (bản QR) |
| 19/11/2026 | Anh Hoàng: bỏ QR và trang công khai; hoá đơn tại quầy làm y POS cũ (đối chiếu luồng cũ, 10 chỗ React còn thiếu) |
