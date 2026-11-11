# NT-BH-004 · Đơn bán tại quầy từ máy bán POS (tiền mặt, chia tiền, giảm giá tay)
<!-- [2026-11-09 03:30 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: kế hoạch module POS đợt W1, đơn bán POS → chứng từ sale qua module pos. (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `pos` (kế hoạch module POS) |
| Màn hình | Máy bán POS React (`/pos/sale`); phía kế toán: ACC14, Sổ cái, Nhật ký bán hàng |
| Bộ phận yêu cầu | Phòng kế toán, bộ phận bán lẻ |
| Ngày tạo | 09/11/2026 |
| Trạng thái | Nháp |

## 1. Mục đích quản trị
Mỗi đơn chốt ở quầy vào sổ đúng một chứng từ bán hàng, đúng tiền hàng, tiền thuế, tiền thu theo từng hình thức, đúng ngày bán, không trùng khi máy gửi lại. Kế toán dùng để đối chiếu doanh thu, thuế đầu ra, tiền mặt / tiền gửi của từng cửa hàng theo ngày.

## 2. Khai báo trước
- Chi nhánh `CN01` trong danh mục chi nhánh.
- Mặt hàng: `SUA400` *Sữa bột 400g*, ĐVT Hộp, mã thuế đầu ra `R08`; `TA01` *Tã quần L*, ĐVT Gói, mã thuế đầu ra `R10`.
- Hình thức thanh toán `TM` (tiền mặt), `CK` (chuyển khoản) theo gói định khoản mặc định.
- Chế độ định khoản loại `sale`: ghi ngay (để thấy bút toán khi chạy); để *chờ duyệt* thì chứng từ nằm ở ACC14, duyệt xong ra cùng bút toán.

## 3. Các bước thao tác
1. Thu ngân mở màn bán hàng ở chi nhánh `CN01`, ngày bán 09/11/2026.
2. Quét mặt hàng, sửa số lượng, giảm giá tay theo dòng (nếu có), chọn khách.
3. Thanh toán: tiền mặt (F9) hoặc nhiều hình thức (F8); chốt đơn.
4. Kế toán mở ACC14 / Sổ cái, lọc chứng từ `pos:CN01:sale:…`.

## 4. Số liệu đầu vào

**Tình huống 1 — khách lẻ, tiền mặt**

| Mặt hàng | ĐVT | Giá gồm thuế | SL | Giảm tay | Mã thuế |
|---|---|---|---|---|---|
| SUA400 | Hộp | 324.000 | 1 | — | R08 |

Khách đưa 500.000 tiền mặt.

**Tình huống 2 — khách có SĐT, giảm giá tay, chia tiền**

| Mặt hàng | ĐVT | Giá gồm thuế | SL | Giảm tay | Mã thuế |
|---|---|---|---|---|---|
| SUA400 | Hộp | 324.000 | 2 | 10% | R08 |
| TA01 | Gói | 215.000 | 1 | — | R10 |

Khách: SĐT `0911222333`, tên *Khách thử POS* (chưa có trong danh mục). Trả: tiền mặt 300.000 + chuyển khoản 498.200.

## 5. Kết quả mong đợi

Công thức (như máy bán và POS đang chạy): thành tiền dòng = làm tròn(giá × SL − giảm tay); tiền chưa thuế = làm tròn(thành tiền chưa làm tròn ÷ (1 + thuế suất)); tiền thuế = thành tiền − tiền chưa thuế.

**Trên chứng từ / màn hình:**

| Mục | Tình huống 1 | Tình huống 2 |
|---|---|---|
| Mã phiếu | `HD2611000001` | `HD2611000002` (số kế tiếp cùng chi nhánh, cùng tháng) |
| Trạng thái đơn | Hoàn tất | Hoàn tất |
| docKey | `pos:CN01:sale:<id đơn>` | như bên trái |
| Ngày chứng từ | 09/11/2026 | 09/11/2026 |
| Khách trên chứng từ | Khách lẻ (không đối tượng) | `0911222333` *Khách thử POS* — tự thêm vào danh mục khách |
| Dòng SUA400 | chưa thuế 300.000 · thuế 24.000 · thành tiền 324.000 | SL 2 · giảm 64.800 · chưa thuế 540.000 · thuế 43.200 · thành tiền 583.200 |
| Dòng TA01 | — | chưa thuế 195.455 · thuế 19.545 · thành tiền 215.000 |
| Tổng chưa thuế / thuế / tổng | 300.000 / 24.000 / 324.000 | 735.455 / 62.745 / 798.200 |
| Thu theo hình thức | TM 324.000 (tiền thối 176.000, không ghi sổ) | TM 300.000 · CK 498.200 |

**Bút toán** (tài khoản do gói định khoản của đơn vị quyết; dưới đây là gói mặc định `vn-tt99-nen`):

| Nợ | Có | Số tiền | Ghi chú |
|---|---|---|---|
| 1311 | 51111 | 300.000 | TH1 doanh thu |
| 1311 | 33311 | 24.000 | TH1 thuế GTGT đầu ra |
| 1111 | 1311 | 324.000 | TH1 thu tiền mặt (phiếu thu đi kèm) |
| 1311 | 51111 | 735.455 | TH2 doanh thu (540.000 + 195.455) |
| 1311 | 33311 | 62.745 | TH2 thuế đầu ra (43.200 + 19.545) |
| 1111 | 1311 | 300.000 | TH2 thu tiền mặt |
| 11210005 | 1311 | 498.200 | TH2 thu chuyển khoản |

Giá vốn không ghi lúc bán: tính bình quân cuối tháng (ACC49), xuất kho số lượng ghi ngay.

**Báo cáo phải thấy:** Nhật ký bán hàng ngày 09/11/2026 chi nhánh CN01 có 2 chứng từ, doanh thu 1.035.455, thuế 86.745. Sổ chi tiết 1311 của khách `0911222333` số dư cuối = 0.

**Sai số làm tròn chấp nhận:** 0đ.

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Gửi lại đúng đơn đó (cùng id đơn) do mất mạng | Trả lại đơn cũ, cùng mã phiếu; không thêm chứng từ, không tiêu số phiếu mới |
| 1b | Cùng id đơn nhưng nội dung khác (máy sửa đơn đã gửi) | Chặn (`CONFLICT`, `POS_ORDER_ID_REUSED`); không trả nhầm đơn cũ, không thêm chứng từ |
| 1c | Hai máy gửi cùng lúc cùng một đơn | Một mã phiếu, một chứng từ; cả hai lần gửi nhận cùng đơn, không lỗi hệ thống |
| 2 | Mặt hàng không có trong danh mục | Chặn (`VALIDATION_ERROR`, nêu mã hàng); không lưu đơn, không chứng từ |
| 3 | Mặt hàng chưa khai mã thuế đầu ra | Chặn (`POS_TAX_NOT_DECLARED`, nêu mã hàng) |
| 4 | Tiền mặt khách đưa ít hơn tổng | Chặn (`POS_CASH_INSUFFICIENT`) |
| 5 | Chia tiền: tổng các phần ≠ tổng đơn, hoặc hình thức không có trong danh mục | Chặn (`VALIDATION_ERROR`, nói rõ chênh bao nhiêu / mã nào) |
| 6 | Tổng máy tính khác tổng phần mềm tính | Chặn (`POS_PRICE_CHANGED`), không ghi |
| 7 | SL ≤ 0, giá âm, giảm tay lớn hơn thành tiền, giảm % > 100 | Chặn (`VALIDATION_ERROR`) |
| 8 | Đơn có CTKM / mã giảm giá, dòng quà, đổi điểm, trả QR, ghi nợ | Chặn, báo "chưa nhận ở đợt này" — không ghi sai một phần |
| 9 | Chi nhánh không có trong danh mục | Chặn (`VALIDATION_ERROR`) |
| 10 | Đơn bán ngoại tuyến hôm trước, gửi lên hôm nay | Ngày chứng từ = ngày bán (hôm trước), không phải ngày gửi |
| 11 | Lỗi định khoản lúc nộp chứng từ | Đơn cũng không được lưu (cùng giao dịch), máy nhận lỗi, gửi lại được |
| 12 | Đơn có hàng 0đ của mã **không gửi thuế** (hàng Nội bộ, vd mã `11005100103`) — ở POS đang chạy dòng này tách sang bill Z | Đợt này chặn rõ (`POS_NOT_SUPPORTED_YET`, kèm danh sách mã), không đơn, không chứng từ: cách ghi sổ bill Z đi cùng phiếu quà. Hàng Nội bộ mà máy gửi giá khác 0 → `POS_PRICE_CHANGED` (Nội bộ luôn 0đ) |
| 13 | Đơn có mã **không gửi thuế mà thu tiền** (vd mã kẹp quà `11005100102` 54.000) | Bán như dòng thường: doanh thu, thuế, thu tiền đúng số; không tách bill Z (phiếu thu khớp phiếu bán); đơn trả máy ghi dòng đó `sendTax = false` để không lên hoá đơn điện tử |
| 14 | Thu ngân đăng nhập bằng tài khoản hệ thống quản trị (vé chỉ mang quyền máy bán `pos:sell`) rồi gọi thẳng chứng từ của phần mềm kế toán | Bán được bình thường; xem / lập chứng từ khác bị từ chối (403) — thu ngân không có quyền kế toán |

Mọi quyết định ở 12–13 đọc ô **Gửi lên thuế** và ô **Biến thể** của mặt hàng (khung nhìn `bizcity_read.products`, migration 0102), **không đọc chữ cuối mã**. Dòng chứng từ mang `itemId` của mặt hàng.

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 09/11/2026 (lệch chuẩn 12–13: 10/11/2026), CSDL test `ketoan_test` (PostgreSQL 16, Docker), gói định khoản mặc định |
| Bản code (commit) | chưa commit — nhánh `feat/module-pos-w1` trên máy (đã gộp `main` f933cd1a) |
| Test tự động | `apps/api/test/nt-bh-004-pos-don-ban.test.ts` (13 ca, đạt), `modules/pos/test/order.test.ts` (21 ca, đạt), `apps/api/test/read-views.test.ts` (khung nhìn 0102, đạt) |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
| TH1 mã phiếu / trạng thái | HD2611000001 · Hoàn tất | HD2611000001 · completed | 0 | |
| TH1 chưa thuế / thuế / tổng / thối | 300.000 / 24.000 / 324.000 / 176.000 | 300.000 / 24.000 / 324.000 / 176.000 | 0 | |
| TH1 bút toán | 1311 Nợ 324.000 Có 324.000 · 51111 Có 300.000 · 33311 Có 24.000 · 1111 Nợ 324.000 | đúng như mong đợi | 0 | chứng từ `posted`, ngày 2026-11-09 |
| TH2 mã phiếu | HD2611000002 | HD2611000002 | 0 | |
| TH2 dòng | 540.000 + 43.200 · 195.455 + 19.545 | 540.000 + 43.200 · 195.455 + 19.545 | 0 | |
| TH2 tổng | 735.455 / 62.745 / 798.200 | 735.455 / 62.745 / 798.200 | 0 | |
| TH2 bút toán | 51111 Có 735.455 · 33311 Có 62.745 · 1111 Nợ 300.000 · 11210005 Nợ 498.200 · 1311 Nợ = Có 798.200 | đúng như mong đợi, không tài khoản nào khác | 0 | |
| TH2 khách | `0911222333` *Khách thử POS* thêm vào danh mục | có | 0 | |
| Báo cáo ngày 09/11 CN01 | doanh thu 1.035.455 · thuế 86.745 · 1311 khách = 0 | 1.035.455 · 86.745 · 0 | 0 | |
| Lệch chuẩn 1 (gửi lại) | đơn cũ, không chứng từ mới | đúng | — | |
| Lệch chuẩn 2–9 | chặn đúng lý do, không đơn, không chứng từ | đúng; lỗi khuôn trả HTTP 400 (Core), lý do ở `details.reason` | — | D-MP-11 |
| Lệch chuẩn 10 (ngoại tuyến) | ngày chứng từ = ngày bán 31/10, số HD2610… | 2026-10-31 · HD2610000001 | — | |
| Lệch chuẩn 11 (kỳ khoá) | không lưu đơn, không tiêu số | `PERIOD_LOCKED`, không đơn, không bộ đếm | — | |
| Lệch chuẩn 12 (bill Z) | chặn, nêu mã; Nội bộ giá ≠ 0 → lệch giá | `POS_NOT_SUPPORTED_YET` (`details.info.billZ = [11005100103]`) · `POS_PRICE_CHANGED` 409; không đơn, không chứng từ | — | D-MP-12 |
| Lệch chuẩn 13 (không gửi thuế, có tiền) | 378.000; dòng 2 `sendTax = false`; không bill Z | 378.000 · `[SUA400, true] [11005100102, false]` · không `zBill` | 0 | |
| `itemId` trên dòng chứng từ | đúng định danh của từng mã | khớp `products.item_id` từng dòng | 0 | |
| Tách thuế so với máy bán | khớp từng đồng | 15.996 ca lưới giá × thuế suất khớp | 0 | `order.test.ts` |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 09/11/2026 | Tạo phiếu (kế hoạch module POS đợt W1) |
| 10/11/2026 | Thêm lệch chuẩn 12–13 theo mã số cha – con (ô Gửi lên thuế / Biến thể), `itemId` trên dòng chứng từ |
| 10/11/2026 | Thêm lệch chuẩn 1b (cùng id đơn, khác nội dung), 1c (gửi đồng thời); dòng chứng từ: đơn giá chưa thuế trước giảm, giảm tay ở `discount` (đơn giá × SL − giảm = thành tiền chưa thuế) |
| 10/11/2026 | Thêm lệch chuẩn 14: quyền riêng máy bán `pos:sell` (không cần quyền lập chứng từ của kế toán) |
