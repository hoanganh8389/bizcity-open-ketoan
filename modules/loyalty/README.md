# Module `loyalty` — Điểm thành viên

Sổ điểm thành viên của đơn vị (phiếu [NT-BH-020](../../docs/nghiem-thu/ban-hang/NT-BH-020-pos-tich-diem.md); thiết kế
`tgs_pos_react/docs/module-pos/70-TICH-DIEM.md`). Không nộp chứng từ: điểm **chỉ hạch toán lúc đổi** (quà / voucher nằm trên chứng từ
bán của module `pos`, định khoản do kế toán đặt).

## Nghiệp vụ

- **Chính sách** là của website (`tgs_loyalty_points`): 4 loại tích (theo tiền, theo mã hàng, nhân điểm, thưởng theo mức đơn), hạng
  + hệ số, danh mục đổi quà / voucher. Website đẩy `LoyaltyProgram` của từng cửa hàng sang `POST /program` (khoá API, quyền
  `catalog:write`); module giữ mọi phiên bản, tính bằng bản mới nhất. Máy bán không gửi được chính sách.
- **Sổ điểm chỉ thêm** (`mod_loyalty.entries`): mỗi lần tích / đổi / hết hạn / điều chỉnh / hoàn là một dòng có dấu. Dòng dương là
  **lô** có hạn (`expires_at`); dòng âm ghi phân bổ theo lô. Số dư = tổng dòng. Khách theo mã đối tượng (máy bán: SĐT).
- **Tích** khi đơn máy bán hoàn tất có khách (sự kiện `pos.order.recorded`): bộ tính chép từ máy bán (`api/domain/engine.ts`, khớp
  engine PHP 14 chính sách × 400 đơn); hạng theo tổng điểm đã tích trước đơn; hạn lô = số ngày dài nhất của các chính sách đã cho
  điểm (0 = không hạn). Một đơn một dòng tích (giao lại / phiên bản sau không tích thêm; đơn QR tích khi hoàn tất).
- **Hoàn** khi trả hàng (`pos.return.recorded`): điểm đã tích × tiền trả / tổng đơn, cộng dồn các phiếu trả, làm tròn xuống; trừ lô
  của chính đơn trước. Không để số dư âm (thiếu thì hoàn phần còn, ghi chú).

## API (`/api/v1/m/loyalty`)

| Đường | Quyền | Việc |
|---|---|---|
| `POST /program` | `catalog:write` | website đẩy chính sách `{ branchCode, storeId, program }`; cùng phiên bản → `changed: false` (đặt trạng thái, không cần Idempotency-Key) |
| `GET /program?branch=` | `loyalty:read` | chính sách mới nhất của cửa hàng (khuôn `LoyaltyProgram` của máy bán); không `branch` → danh sách cửa hàng đã có |
| `GET /customers/:id?branch=` | `loyalty:read` | điểm của khách (khuôn `CustomerLoyalty`): số dư, dùng được, hạng, lô, 50 dòng gần nhất, voucher còn dùng |
| `GET /vouchers/:code` | `loyalty:read` | tra voucher đổi điểm (khuôn `LoyaltyVoucher`); đã dùng / hết hạn vẫn trả kèm trạng thái |
| action `loyalty.redeem.quote` (không HTTP) | `loyalty:read` | module `pos` gọi chéo lúc nhận đơn có khách / voucher: phần thưởng đổi được không, quà gì, mã voucher sẽ phát (định theo đơn), tiền giảm voucher, điểm đơn này |

## Đổi điểm, voucher (bước 2)

- **Đổi điểm** khi bán: đơn mang `loyalty.redeem`; module `pos` hỏi `loyalty.redeem.quote` (đủ điểm, đúng hạng, quà đúng mã / số lượng). Quà là dòng quà 0đ trên chứng từ bán (giá vốn hàng tặng — kế toán đặt). Voucher có mã định theo đơn (in ngay trên bill).
- Khi nhận sự kiện đơn đã ghi sổ: một dòng **đổi** trừ lô hết hạn sớm nhất trước (thiếu thì trừ phần còn, ghi chú), phát voucher (bảng `vouchers`), rồi tích điểm.
- **Dùng voucher**: mã trong `promotionSelections` (coupon); `pos` chia tiền giảm theo thành tiền dòng (`allocate`) — chứng từ bán mang tiền giảm ở dòng (doanh thu ghi sau giảm). Khi nhận sự kiện: voucher chuyển *đã dùng*; dùng trùng ở hai máy cùng lúc → ghi chú ở voucher.

## Sự kiện nghe

`pos.order.recorded` (đổi, phát / dùng voucher, tích), `pos.return.recorded` (hoàn). Chưa phát sự kiện riêng.

## Chưa làm (NT-BH-020 bước 3)

Hết hạn lô hằng ngày; nạp số dư đầu từ website; báo cáo, màn quản trị; hoàn điểm đã đổi khi trả hàng có quà đổi điểm.
