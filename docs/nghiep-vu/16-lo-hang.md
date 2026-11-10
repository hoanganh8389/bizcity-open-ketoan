# 16. Lô hàng xuyên suốt

> 10/11/2026 — đã làm phần nền. Mã: `db/migrations/0098_lo_hang.sql`, `packages/kernel/src/modules/inventory/lot.service.ts`, `apps/api/src/modules/lots/`, màn `apps/web/src/features/lots/TonTheoLoPage.tsx` (KHO05), test `apps/api/test/lo-hang.test.ts`.

## 1. Yêu cầu

- Tên hàng từ lúc mua đến lúc bán / kê khai thuế phải theo **tên lúc mua**, kể cả khi gõ khác. Không sinh mã mới chỉ vì tên khác.
- Quản lý theo lô xuyên suốt: nhập, chuyển kho, bán (tự xuất lô cũ trước), khách trả (về đúng lô). Biết lô còn bao nhiêu để lên chương trình, so sánh giá.
- Giao diện vẫn theo mặt hàng; lô là lớp dữ liệu nâng cao. `item_id` xuyên suốt.

## 2. Đã chốt

| Câu hỏi | Chốt |
|---|---|
| Lô sinh ra theo gì | Số lô + hạn dùng của nhà cung cấp (trên dòng phiếu nhập). Không ghi → lô không số của mặt hàng |
| Tên lúc mua | Thuộc về lô: tên trên dòng nhập đầu tiên. Nhập thêm cùng lô khác tên → giữ tên đầu, ghi `names_seen` |
| Xuất | Tự động hạn dùng sớm trước, cùng hạn thì nhập trước; theo chi nhánh + kho. Phiếu ghi số lô thì đúng lô đó |
| Khách trả | Về đúng lô đã xuất của phiếu gốc (`originalDocKey`), lô xuất trước trả trước |
| Chuyển kho | Phiếu ghi lô (WordPress gợi ý hạn sớm trước, người lập sửa được) → cả hai đầu cùng lô. Trống → đầu xuất tự chọn hạn sớm trước; phiếu một chứng từ hai đầu thì bên nhận theo lô bên xuất |
| Nguyên tắc chung | **Có điền thì ưu tiên, để trống thì theo quy tắc** |
| Giá vốn | Vẫn bình quân tháng; lô không đổi giá vốn |
| Hoá đơn bán ra | **Theo đúng bill ở cửa hàng**: bill một dòng thì hoá đơn một dòng, tên theo dòng bán — lô không tách dòng hoá đơn (chốt 10/11/2026). Lô, tên lúc mua là dữ liệu tra cứu đi kèm dòng |

## 3. Cách làm

- `item_lots`: lô (item_id, item_key, lot_no, exp_date, purchase_name, names_seen, phiếu nhập đầu).
- `inventory_lot_moves`: mỗi dòng `inventory_movements` chia ra các lô (`how`: line / fifo / return / transfer / shortage / nolot). Xoá theo dòng kho → sửa phiếu thì phân lô ghi lại.
- Phân lô chạy ngay sau khi ghi dòng kho (`inventory-movement.repository` → `allocateLots`). Thiếu tồn lô → phần thiếu vào lô không số để tồn lô luôn khớp tồn kho.
- `GET /api/v1/lots/suggest`: gợi ý lô khi lập phiếu xuất (đúng thứ tự Kernel tự chọn). WordPress dùng ở form chuyển kho — xem `tgs_shop_management/docs/lo-hang-xuyen-suot.md`.
- `rebuildLots`: phân lô lại theo thứ tự (ngày, chứng từ) — dùng khi phiếu về muộn / sửa ngày.
- Dòng phiếu kho (chuyển, điều chỉnh) có thêm `lotNo`, `expDate` (tuỳ chọn).

## 4. Còn lại

- POS / kho WordPress chưa gửi số lô; ERP tự phân lô khi nhận phiếu — chưa có màn chọn lô ở POS khi cần bán đúng lô (xả cận date).
- Phiếu trả không có phiếu gốc → lô không số (chưa đoán lô).
- Chuyển kho hai phiếu một đầu (`leg`) **không ghi lô** → bên nhận vào lô không số. Đã xử lý ở nguồn: form chuyển kho WordPress gợi ý lô (`GET /api/v1/lots/suggest`) và ghi `lot_no` lên dòng, cầu nối gửi `lotNo` cho cả hai đầu → bên nhận đúng lô (10/11/2026).
- Nối với chương trình bán: hạn mức theo lô (chỉ xả lô cận date).
- Phân lô chạy tuần tự khi hai phiếu cùng lúc lấy cùng lô → có thể lệch nhẹ; "Phân lô lại" sửa.
