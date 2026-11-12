# NT-BH-006 · Máy bán POS đọc danh mục, giá bán theo chi nhánh và tồn của cửa hàng từ kế toán
<!-- [2026-11-12 03:00 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: kế hoạch module POS (đề xuất P-MP-1, P-MP-2) — máy bán lấy danh mục, giá, tồn từ Core thay cho website. (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `pos`; danh mục (DM10 Mặt hàng, DM14 Bảng giá), kho |
| Màn hình | Máy bán POS React (ô tìm hàng, quét mã, ĐVT, giá, tồn); phía kế toán: DM10, DM14, Sổ kho |
| Bộ phận yêu cầu | Phòng kế toán, bộ phận bán lẻ, bộ phận kinh doanh (giá) |
| Ngày tạo | 12/11/2026 |
| Trạng thái | Nháp |

Căn cứ: chốt của bộ phận bán lẻ ngày 12/11/2026 — (1) giá bán khác nhau theo cửa hàng; (2) cửa hàng nào chỉ xem tồn của cửa hàng đó; (3) khuyến mại do Core tính (phiếu riêng NT-BH-003). Luật lấy giá: hướng dẫn [Bảng giá bán (DM14)](../../huong-dan/bang-gia.md).

## 1. Mục đích quản trị
Máy bán hiện còn đọc danh mục, giá, tồn ở website cửa hàng (bản sao), trong khi đơn bán ghi ở kế toán. Hai nguồn lệch thì đơn bị chặn (mã chưa có ở kế toán, thuế khai khác) hoặc bán sai giá. Phiếu này khoá việc máy bán đọc **một nguồn**: danh mục, giá theo bảng giá của chi nhánh, tồn của chính cửa hàng — đúng dữ liệu kế toán đang dùng để ghi sổ.

## 2. Khai báo trước
- Chi nhánh `CN01` (cửa hàng thử), `CN02` (cửa hàng khác). Bảng giá công ty `BGCT`; bảng giá chi nhánh `BG01` gán cho `CN01`; `CN02` không gán bảng giá nào.
- Mặt hàng `SUA400` (hàng thường, R08), ĐVT Hộp (×1, bán chính) và Thùng (×12); `SUAC` (hàng **chính**, R08), ĐVT Hộp.
- Giá: `BGCT`: `SUA400` Hộp 330.000, Thùng 3.800.000; `SUAC` Hộp 500.000. `BG01`: `SUA400` Hộp 320.000 (Thùng chưa khai); `SUAC` Hộp 450.000.
- Sổ kho: `CN01` nhập 20 hộp `SUA400`, bán 3 hộp; `CN02` nhập 50 hộp `SUA400`.

## 3. Các bước thao tác
1. Thu ngân `CN01` mở máy bán: máy kéo toàn bộ danh mục của chi nhánh (một lần, rồi kéo phần đổi).
2. Quét / gõ `SUA400`, chọn ĐVT Hộp rồi Thùng; quét `SUAC`.
3. Xem tồn `SUA400` trên dòng hàng.
4. Kế toán đổi giá Hộp `SUA400` ở `BG01` thành 325.000; thu ngân kéo lại danh mục.

## 4. Số liệu đầu vào
Như mục 2. Tồn tính theo ĐVT nhỏ nhất (Hộp).

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Giá `SUA400` Hộp ở `CN01` | 320.000 (bảng giá chi nhánh `BG01`) |
| 2 | Giá `SUA400` Thùng ở `CN01` | 3.800.000 (`BG01` chưa khai Thùng → lấy bảng giá công ty) |
| 3 | Giá `SUAC` Hộp ở `CN01` | 500.000 (hàng chính chỉ lấy bảng giá công ty, bỏ qua 450.000 của `BG01`) |
| 4 | Giá `SUA400` Hộp ở `CN02` | 330.000 (chi nhánh chưa gán bảng giá → bảng giá công ty) |
| 5 | Mặt hàng ngừng bán / ngừng dùng | không có trong danh mục máy bán |
| 6 | Thuế suất, Biến thể, Gửi lên thuế, mã vạch, ĐVT bán chính | đúng như DM10 |
| 7 | Tồn `SUA400` ở máy `CN01` | 17 (20 − 3); không thấy 50 của `CN02` |
| 8 | Máy `CN01` hỏi tồn của `CN02` | không có đường đọc tồn chi nhánh khác (xem lệch chuẩn 3) |
| 9 | Sau khi đổi giá ở bước 4 | lần kéo sau trả 325.000; phiên bản danh mục đổi |
| 10 | Đơn bán với giá máy đọc được | đơn ghi sổ như NT-BH-004, không lệch giá / thuế |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Mặt hàng chưa khai giá ở cả bảng giá chi nhánh lẫn công ty | Máy nhận giá rỗng (bán giá 0 bị chặn ở máy, như hiện tại) |
| 2 | Bảng giá chi nhánh ngừng dùng | Như chưa gán: lấy bảng giá công ty |
| 3 | Thu ngân gửi mã chi nhánh khác chi nhánh của mình | **Đợt này:** máy chỉ gửi chi nhánh của vé đăng nhập WP; Core chưa thi hành phạm vi chi nhánh của người dùng (`user_role_assignments` có `scope_type = branch` nhưng bộ giải phạm vi thuộc PHASE-028 W3). Khi Core có, module đọc phạm vi của phiên và từ chối chi nhánh ngoài phạm vi (`FORBIDDEN`) |
| 4 | Tồn âm (bán vượt khi mất mạng) | Trả số âm, không chặn bán (như POS hiện tại) |
| 5 | Mã đã đổi / gộp | Tồn gom theo `item_id`, hiện dưới mã hiện hành |

## 7. Kết quả chạy
| Mục | Mong đợi | Thực tế | Lệch | Ghi chú |
|---|---|---|---|---|

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 12/11/2026 | Tạo phiếu |
