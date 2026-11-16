# NT-BH-019 · Máy bán POS: tạo khách mới tại quầy, bán hàng 0đ không gửi thuế (bill Z) qua kế toán
<!-- [2026-11-15 09:30 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: hai phần máy bán React còn chạy dữ liệu giả ở bản hybrid (đóng góp) -->
<!-- [2026-11-15 10:45 AM Võ Hoàng] NGHIEM-THU — chốt Q1–Q3; Q1, Q2 ghi cách làm theo năng lực Core đang có; chia hai bước (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`) |
| Màn hình | Máy bán POS React (vỏ WP `/pos/`): ô Khách hàng → *Thêm khách*; giỏ có hàng 0đ không gửi thuế (quà mã Z) |
| Bộ phận yêu cầu | Thu ngân, kế toán bán hàng |
| Ngày tạo | 15/11/2026 |
| Trạng thái | Chờ nghiệm thu (bước 1: kiểm 1, 2, 3; bước 2: kiểm 4, 5, 6) |

## 1. Mục đích quản trị
Máy bán React ở cửa hàng đã đi kế toán thật cho bán, trả, ca, danh mục, khuyến mại. Còn hai việc vẫn chạy dữ liệu giả (dải vàng báo "Còn dùng dữ liệu giả"), dùng tới là **không ghi sổ**:
1. **Tạo khách mới** tại quầy (khách chưa có SĐT trong danh mục).
2. **Bill Z**: hàng 0đ không gửi thuế (quà mã Z, sữa < 24 tháng — chốt 10/11: không lên thuế). Module pos hiện **từ chối** cả đơn có dòng như vậy ("chưa nhận hàng 0đ không gửi thuế (bill Z) ở đợt này"), thu ngân phải bán đường cũ.

## 2. Khai báo trước
- Mặt hàng có cờ *gửi thuế* đúng (mã Z = không gửi thuế).
- Khách: mã = SĐT (10 số, bắt đầu 0) như hiện nay.

## 3. Các bước thao tác
1. Ô Khách hàng gõ SĐT chưa có → **Thêm khách** → tên, SĐT (ngày sinh, hạng nếu có) → Lưu → khách vào đơn.
2. Quét hàng mã Z (hoặc được tặng theo chương trình) → giỏ hiện dòng 0đ → thanh toán như thường.
3. Đơn đã xong có dòng 0đ còn ở bill chính → *Chuyển sang bill Z*.

## 4. Số liệu đầu vào
Cửa hàng `CN01`; mặt hàng `100021001` 325.000 (gửi thuế 8 %); quà `11005100103Z` (đuôi Z = không gửi thuế), 0đ; khách mới `0901234567` "Chị Lan".

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Tạo khách | đơn bán cho khách mới `0901234567` được nhận → khách có ở danh mục đối tượng (DM12) theo đối tượng của chứng từ bán; tìm lại ở máy bán thấy kèm số đơn; SĐT đã có → máy bán hiện khách cũ, không tạo trùng |
| 2 | Bán có hàng 0đ không gửi thuế | đơn được nhận; dòng 0đ mã không gửi thuế nằm trên chứng từ bán dạng **dòng quà** (0đ, không doanh thu, không thuế), đơn trả máy tách dòng đó sang `zBill` (mã đơn + `Z`) → máy bán in **bill Z** riêng, không lên hoá đơn điện tử; vẫn trừ tồn, giá vốn tháng ghi theo luật hàng khuyến mãi |
| 3 | Website | bản sao về shop: phiếu bán + phiếu `zsale` / `zexport` như POS cũ |
| 4 | Chuyển sang bill Z | dòng 0đ của đơn đã hoàn tất chuyển sang bill Z; dòng có tiền → chặn |
| 5 | Trả hàng có quà Z | trả cả quà theo bill Z; phiếu trả mang cờ quà như chứng từ bán (giá vốn đảo cùng luật hàng khuyến mãi) |
| 6 | Dải vàng | dùng hai việc trên không còn hiện "Còn dùng dữ liệu giả" |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | SĐT sai khuôn / thiếu tên | chặn, chỉ rõ ô |
| 2 | Dòng mã không gửi thuế có tiền | nhận như dòng bán, không tách bill Z, không lên hoá đơn (`sendTax = false`) — giữ như POS đang chạy (D-MP-12); không chặn vì chỉ bất biến lõi mới chặn (R-GATE-9) |
| 3 | Mất mạng khi tạo khách | đơn vẫn bán được với khách lẻ, nhắc tạo lại |

## Đã chốt (15/11/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Tạo khách đi đường nào | **Khách mới đi kèm đơn**: chứng từ bán mang `partner` (mã = SĐT, tên, SĐT), cửa nạp Core tự thêm đối tượng theo mã (`document.service` → `partnerRepository.upsert`). Không tạo khách rời khi chưa bán. Không sửa Core: `ctx.actions.call` của module chỉ gọi action đọc nên module không gọi được `core.partner.upsert`, và cũng không cần |
| Q2 | Bill Z nộp sổ thế nào | Không doanh thu, không thuế, không hoá đơn điện tử; vẫn trừ tồn và có giá vốn. Cách nộp: dòng 0đ mã không gửi thuế đi **chung chứng từ bán dạng dòng quà** (`isGift`), như quà mã Z theo chương trình đã làm ở NT-BH-003; tài khoản giá vốn hàng khuyến mãi do kế toán đặt (lý do / chính sách hạch toán, chốt 10/11). **Không** nộp phiếu điều chỉnh giảm kho riêng: luật định khoản loại `stock_adjustment` ghi đối ứng "hàng thiếu chờ xử lý" khi lý do chỉ khai tài khoản chi phí (lý do quà `XTA*`) → sai bản chất. Bill Z là phiếu in của máy bán (tách theo `sendTax`), như POS đang chạy |
| Q3 | Thứ tự | Bước 1: nhận bill Z khi bán + khách mới đi kèm đơn (kiểm 1, 2, 3, 6). Bước 2: chuyển sang bill Z, trả hàng có quà Z (kiểm 4, 5) |

## 7. Kết quả chạy

**Bước 1 — 15/11/2026, nhánh `feat/nt-bh-019-bill-z`.** Test tự động `apps/api/test/nt-bh-019-pos-bill-z.test.ts` (5/5), `modules/pos/test/order.test.ts` (tách bill Z, dòng quà trên chứng từ); `nt-bh-004` sửa ca "bill Z chặn rõ" → còn ca giá Nội bộ khác 0.

| Kiểm | Mong đợi | Phần mềm (test + chạy thật Docker demo) |
|---|---|---|
| 1 | khách mới có ở DM12, tìm lại thấy số đơn, SĐT đã có không tạo trùng | đối tượng `0901234567` "Chị Lan" loại khách hàng; `GET /customers?q=` trả 1 đơn, đơn sau trả 2; một đối tượng. Chạy thật: `0901234570` tìm lại thấy 1 đơn |
| 2 | dòng 0đ không gửi thuế nhận, không doanh thu / thuế, in bill Z | đơn 325.000 = 300.926 + 24.074; quà ở `zBill` `HD2611000001Z`; chứng từ: quà `isGift` 0đ; sổ: Nợ 1111 325.000 / Có 1311; Nợ 1311 / Có 51111 300.926, 33311 24.074 — không dòng nào cho quà. Chạy thật `HD2611000021` (đã ghi sổ, số như trên) |
| 3 | bản sao website: phiếu bán + `zsale` / `zexport` | chạy thật `HD2611000023` → shop2: phiếu bán (10) 325.000, phiếu thu (7), phiếu xuất (2) lon sữa; **`HD2611000023Z`** (10) 0đ + phiếu xuất (2) quà `100045001Z` SL 1 |
| lệch 1 | SĐT sai / thiếu tên chặn, chỉ rõ ô | `POS_BAD_PHONE` (`customer.phone`), `POS_MISSING_NAME` (`customer.name`) |
| lệch 2 | dòng không gửi thuế có tiền | nhận như dòng bán, không tách bill Z (test đơn vị) |

Chênh lệch, ghi chú:
- Mã quà phải có ở danh mục website thì bản sao mới ghi được (mã chỉ có ở kế toán → website trả lỗi `tgs_map_unknown_sku`, sự kiện thử lại) — đúng thiết kế bản sao, không phải lỗi bill Z.
- Trả hàng: quà bill Z vẫn trả được (0đ); cờ quà trên phiếu trả làm ở bước 2.
- Bộ kiểm: `module check pos` ĐẠT, `kiem-chuan` ĐẠT, typecheck 0 lỗi, `selfcheck --strict` giống `main` (13 mục đỏ có sẵn, không thêm). `npm test` nhóm bán hàng: 113/114 — ca đỏ `NT-BH-005 · app tgs-wp` đỏ sẵn trên `main`, không do bước này.

**Bước 2 — 15/11/2026, nhánh `feat/nt-bh-019-buoc-2`.** Test `apps/api/test/nt-bh-019-pos-bill-z.test.ts` (6/6).

| Kiểm | Mong đợi | Phần mềm (test + chạy thật Docker demo) |
|---|---|---|
| 4 | chuyển dòng 0đ của đơn đã xong sang bill Z; dòng có tiền chặn | test: dòng giảm 100% → `zBill` mã đơn + Z, đơn phiên bản 2, một sự kiện `pos.order.recorded:…:v2`, sổ không đổi; dòng có tiền 409, dòng không có 404, gọi lại 200 không tăng phiên bản. Chạy thật `HD2611000026` → `HD2611000026Z`; website ghi lại: phiếu xuất chính còn dòng có tiền, thêm `HD2611000026Z` (0đ) + phiếu xuất Z |
| 5 | trả cả quà theo bill Z | test: trả lon sữa + quà → phiếu trả 325.000, dòng quà `isGift` 0đ. Chạy thật `TH2611000011` trả `HD2611000023` (lon + quà `100045001Z`): đã ghi sổ, quà mang cờ quà |
| 6 | dải vàng không còn báo hai việc này | máy bán React bản hybrid: `move-to-z` đi module thật (bỏ khỏi phần giả); khách mới đi kèm đơn không gọi `POST /pos/customers` |

Ghi chú: dòng giảm 100% chuyển sang bill Z giữ đơn giá gốc ở bản sao website (tổng 0đ), như dòng có giảm.

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 15/11/2026 | Tạo phiếu (nháp) |
| 15/11/2026 | Chốt Q1–Q3; sửa kết quả 1, 2 và lệch chuẩn 2 theo cách làm đã chốt |
| 15/11/2026 | Bước 1 xong, ghi kết quả chạy; chuyển Chờ nghiệm thu |
| 15/11/2026 | Bước 2 xong (chuyển sang bill Z, cờ quà phiếu trả), ghi kết quả chạy |
