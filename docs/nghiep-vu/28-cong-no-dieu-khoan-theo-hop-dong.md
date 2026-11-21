# 28. Công nợ & điều khoản thanh toán theo hợp đồng

<!-- [2026-11-21 Nguyễn Văn Thủy] (đóng góp) -->

## 1. Yêu cầu

Mọi thứ của một lần mua xuất phát từ hợp đồng, nên công nợ cũng phải đi theo hợp đồng:

- **Hạn mức công nợ** và **điều khoản thanh toán** là điều khoản của hợp đồng, không phải chính sách chiết khấu. Phải khai ở bước *Điều khoản hợp đồng*, không khai trong danh sách *Chính sách mua*.
- **NCC không theo hợp đồng**: thẻ *Không theo hợp đồng* có khối riêng *Công nợ & điều khoản thanh toán (ngoài hợp đồng)*, tách khỏi chính sách.
- **Đơn đặt hàng**: chọn hợp đồng (hoặc không theo hợp đồng) thì ô *Ngân sách mua* lấy được hạn mức công nợ còn lại tương ứng.
- **Công nợ NCC (MH05)**: hạn mức hiện theo từng hợp đồng / ngoài hợp đồng, có tên rõ ràng.

## 2. Cách làm — không thêm bảng

Dữ liệu vẫn là chính sách `credit_limit` / `payment_term` (`pricing.policy` trong sổ chứng từ). Hợp đồng chứa chúng qua `scope.contractCode`. Chỉ đổi hai chỗ:

1. **Cách áp** (`policyApplies`, `findPolicy`), riêng hai loại này:
   - Hạn mức / điều khoản gắn hợp đồng X chỉ áp cho phiếu thuộc hợp đồng X.
   - Phiếu thuộc X ưu tiên dùng hạn mức / điều khoản của X.
   - Phiếu ngoài hợp đồng, hoặc hợp đồng chưa khai, dùng hạn mức / điều khoản chung của NCC (không gắn hợp đồng).
   - Các loại chính sách khác giữ nguyên như cũ (hợp đồng chỉ để gom).
2. **Nợ đã dùng của hạn mức hợp đồng** = nợ còn mở của các phiếu đã duyệt thuộc hợp đồng X, cộng đơn / phiếu đang chờ thuộc X.
   Hạn mức chung của NCC vẫn tính trên toàn bộ nợ của NCC, là trần tổng.

## 3. Giao diện

| Chỗ | Thay đổi |
|---|---|
| Hợp đồng — bước 3 *Điều khoản hợp đồng* | Thêm khối **Công nợ & điều khoản thanh toán**: điều khoản thanh toán, hạn mức công nợ (khai / sửa), đang dùng / còn lại |
| Hợp đồng — bước 4 *Giá mua và chính sách* | Ô *+ Thêm chính sách* bỏ hai loại trên |
| Hồ sơ NCC — thẻ *Không theo hợp đồng* | Khối **Công nợ & điều khoản thanh toán (ngoài hợp đồng)** đứng trên Giá mua; chính sách bỏ hai loại trên |
| Đơn đặt hàng | Dưới *Ngân sách mua*: "Hạn mức công nợ còn X (theo hợp đồng Y / ngoài hợp đồng)"; ô trống thì tự điền, có nút lấy lại |
| Công nợ NCC (MH05) | *Theo nhà cung cấp*: mỗi thẻ ghi rõ **Hợp đồng Y** hoặc **Ngoài hợp đồng** |

## 4. Kết quả (21/11/2026)

- Lõi: `CONTRACT_BOUND_KINDS` = hạn mức công nợ + điều khoản thanh toán. Gắn hợp đồng thì chỉ áp phiếu thuộc hợp đồng, và phiếu của hợp đồng ưu tiên bản của hợp đồng. `contractUsage` tính nợ của các phiếu thuộc hợp đồng.
- Kiểm tra phiếu (Trợ lý): thuộc hợp đồng thì báo hạn mức của hợp đồng; hạn mức chung của NCC vẫn là trần tổng. Vượt hạn mức → lỗi chặn duyệt, người có quyền bấm **Duyệt ngoại lệ** (như cũ).
- Danh sách NCC: không có hạn mức chung thì hiện tổng hạn mức các hợp đồng đang hiệu lực (`creditByContract`). Điều khoản thanh toán ghi rõ "(hợp đồng X)".
- Giao diện:
  - khối *Công nợ & điều khoản thanh toán* ở hợp đồng bước 3 và ở thẻ *Không theo hợp đồng*; danh sách chính sách bỏ hai loại này;
  - đơn đặt: *Ngân sách mua* tự lấy hạn mức còn lại;
  - MH05: hạn mức chia theo NCC → hợp đồng / ngoài hợp đồng, có ô tìm; *Đến hạn* có ô tìm, lọc hợp đồng, bấm ô tuổi nợ để lọc, bảng chuẩn có Excel;
  - danh sách chứng từ và các hộp chọn đơn / phiếu: cột Hợp đồng ("không theo HĐ").
- Đi kèm: trang *Báo cáo* dạng danh sách xếp 2–3 cột. *Bàn làm việc mua hàng*: thẻ bước chỉ còn nhãn đếm; danh sách việc cần xử lý ở khung **Cần xử lý** góc dưới bên phải.
- Test: `apps/api/test/cong-no-theo-hop-dong.test.ts`.
