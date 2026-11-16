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
| `GET /customers/:id?branch=` | `loyalty:read` | điểm của khách (khuôn `CustomerLoyalty`): số dư, dùng được, hạng, lô, 50 dòng gần nhất |

## Sự kiện nghe

`pos.order.recorded` (tích), `pos.return.recorded` (hoàn). Chưa phát sự kiện riêng.

## Chưa làm (NT-BH-020 bước 2, 3)

Đổi điểm lấy quà / voucher khi bán, dùng voucher; hết hạn lô hằng ngày; nạp số dư đầu từ website; báo cáo, màn quản trị.
