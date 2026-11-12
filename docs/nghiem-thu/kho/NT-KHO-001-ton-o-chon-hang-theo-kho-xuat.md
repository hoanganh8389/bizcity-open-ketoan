# NT-KHO-001 · Ô chọn mặt hàng ở phiếu chuyển kho hiện tồn theo kho xuất của phiếu
<!-- [2026-11-12 kiennt] NGHIEM-THU — tạo phiếu. -->

| | |
|---|---|
| Phân hệ | kho |
| Màn hình | KHO01 (Phiếu chuyển kho) |
| Bộ phận yêu cầu | Kho / Phòng kế toán |
| Ngày tạo | 12/11/2026 |
| Trạng thái | Đã chốt (12/11/2026, kiennt) |

## 1. Mục đích quản trị
Khi chọn hàng để chuyển, thủ kho phải thấy **đúng số còn ở kho xuất của phiếu** tại ngày phiếu, để không chuyển quá số có.
Hiện ô chọn mặt hàng hiện "Tồn (<chi nhánh đang làm việc>)": lấy theo chi nhánh chọn ở đầu trang (không phải chi nhánh xuất
của phiếu), cộng mọi kho của chi nhánh, tồn hiện tại (không theo ngày phiếu) — lệch với cột Tồn trên lưới phiếu.

## 2. Khai báo trước
- Chi nhánh CN-A có hai kho: `KA-1` (mặc định), `KA-2`. Chi nhánh CN-B có kho `KB-1` (mặc định).
- Mặt hàng `HANG01`.
- Chi nhánh đang làm việc (ô đầu trang) = CN-B.

## 3. Các bước thao tác
1. Vào Kho → Phiếu chuyển kho, bấm Thêm.
2. Chi nhánh xuất CN-A, kho xuất `KA-1`, ngày 10/11/2026.
3. Gõ `HANG01` ở ô Mã hàng, xem cột Tồn trong danh sách xổ.
4. Đổi kho xuất sang `KA-2`, xem lại. Đổi ngày phiếu sang 05/11/2026, xem lại.

## 4. Số liệu đầu vào

| Ngày | Chứng từ | Chi nhánh / kho | HANG01 |
|---|---|---|---|
| 01/11/2026 | Nhập mua | CN-A / KA-1 | +100 |
| 03/11/2026 | Nhập mua | CN-A / KA-2 | +30 |
| 08/11/2026 | Nhập mua | CN-A / KA-1 | +20 |
| 12/11/2026 | Bán | CN-A / KA-1 | −50 |
| 02/11/2026 | Nhập mua | CN-B / KB-1 | +7 |

## 5. Kết quả mong đợi

**Trên chứng từ / màn hình:**

| Mục | Mong đợi |
|---|---|
| Tiêu đề cột ở ô chọn hàng | `Tồn (KA-1)` — theo kho xuất của phiếu, không theo chi nhánh đang làm việc |
| Tồn HANG01, kho KA-1, ngày 10/11 | 120 (100 + 20; phiếu bán 12/11 sau ngày phiếu không tính) |
| Đổi kho xuất KA-2, ngày 10/11 | 30 |
| Kho KA-1, ngày 05/11 | 100 |
| Số ở ô chọn = số cột Tồn trên lưới sau khi lấy dòng | Bằng nhau |
| Chưa chọn chi nhánh xuất | Ô chọn hiện cột "Tồn" như cũ (theo chi nhánh đang làm việc) |
| Dòng thẻ kho cũ không ghi mã kho | Tính vào kho mặc định (KA-1), cùng luật cột Tồn |

**Bút toán:** không có (chỉ hiển thị).

**Báo cáo phải thấy:** BC nhập xuất tồn (ACC83) lọc CN-A / KA-1 đến 10/11 ra tồn cuối HANG01 = 120.

**Sai số làm tròn chấp nhận:** 0.

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Màn khác dùng ô chọn mặt hàng (phiếu mua, phiếu kế toán…) | Giữ nguyên như cũ (tồn theo chi nhánh đang làm việc) |
| 2 | Sửa một phiếu chuyển kho đã ghi | Ô chọn hiện tồn không trừ chính phiếu đang sửa (như cột Tồn) |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/<tệp>.test.ts` |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
