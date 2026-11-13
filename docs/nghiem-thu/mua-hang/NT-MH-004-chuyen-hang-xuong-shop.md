# NT-MH-004 · Chuyển hàng xuống shop (MH19): tuỳ chọn làm tròn thùng, cách phân bổ khi kho thiếu
<!-- [2026-11-13 kiennt] NGHIEM-THU — tạo phiếu. -->

| | |
|---|---|
| Phân hệ | mua hàng (lối vào thêm ở Kho) |
| Màn hình | MH19 Chuyển hàng xuống shop (giữ nguyên tên); thêm mục cùng tên ở menu Kho |
| Bộ phận yêu cầu | Kho / Mua hàng |
| Ngày tạo | 13/11/2026 |
| Trạng thái | Đã chốt (13/11/2026, kiennt) · Chờ nghiệm thu |

## 1. Mục đích quản trị
Giống Phân tích đặt hàng bên Mua hàng: kế toán kho chọn **kho chuyển** rồi chọn **các shop** cần phân tích, phần mềm gợi ý số chuyển
theo **tồn max** (cần chuyển = max shop − tồn shop − hàng đang đi đường − đề nghị đã chốt chưa làm), rồi chốt thành **đề nghị chuyển**
(mỗi shop một đề nghị) như MH19 hôm nay. Thêm hai nhóm tuỳ chọn khi phân tích:
- **Làm tròn**: *Theo cài từng mã* (như hôm nay) · *Nguyên thùng* (mọi mã làm tròn theo đơn vị mua) · *Không làm tròn* (đúng số cần).
- **Khi kho không đủ hàng**: *Thiếu nhiều nhất trước* (như hôm nay) · *Theo thứ tự shop đã chọn* · *Chia đều* (bằng nhau mỗi shop) · *Chỉnh tay*.
Không đổi cách lên phiếu chuyển kho từ đề nghị (thẻ "Đề nghị đã chốt").

## 2. Khai báo trước
- Chi nhánh cha KT (kho tổng `KT-HH`), ba shop S1, S2, S3 thuộc KT (Phân cấp chi nhánh).
- Mặt hàng `SUA01`, ĐVT nhỏ nhất Hộp, ĐVT mua Thùng = 12 hộp; ngưỡng làm tròn (Công thức) = nửa thùng; cài từng mã: *Tự động*.
- Tồn max và tồn tại ngày phân tích:

| | Max | Tồn | Đi đường | Cần chuyển (thiếu) |
|---|---|---|---|---|
| KT-HH (kho chuyển) | — | **60** | — | — |
| S1 | 100 | 20 | 0 | 80 |
| S2 | 50 | 10 | 0 | 40 |
| S3 | 30 | 25 | 0 | 5 |

## 3. Các bước thao tác
1. Kho → Chuyển hàng xuống shop (hoặc Mua hàng → MH19). Chọn chi nhánh cha KT, kho chuyển KT-HH, chọn shop theo thứ tự **S2, S3, S1**.
2. Chọn *Làm tròn* và *Khi kho không đủ* như từng dòng ở mục 5, bấm **Phân tích**.
3. Xem số chuyển từng shop, sửa nếu cần, bấm **Chốt đề nghị** → mỗi shop một đề nghị chuyển.

## 4. Số liệu đầu vào
Như mục 2. Kho chỉ có 60 hộp, tổng cần 125 hộp → phải phân bổ.

## 5. Kết quả mong đợi

**Số muốn chuyển theo cách làm tròn** (trước khi chia kho):

| Làm tròn | S1 (thiếu 80) | S2 (thiếu 40) | S3 (thiếu 5) |
|---|---|---|---|
| Không làm tròn | 80 | 40 | 5 |
| Nguyên thùng (12, ngưỡng nửa thùng) | 84 (7 thùng) | 36 (3 thùng) | 0 (dư 5 < 6, chờ lần sau) |
| Theo cài từng mã (*Tự động*) | 84 | 40 (3 thùng + 4 lẻ) | 5 (lẻ) |

**Chia kho 60 hộp khi không đủ** (làm tròn *Không làm tròn*, shop chọn theo thứ tự S2, S3, S1):

| Cách phân bổ | S1 | S2 | S3 | Tổng |
|---|---|---|---|---|
| Thiếu nhiều nhất trước (tỉ lệ thiếu / max cao trước, bằng nhau thì thiếu nhiều trước) | 60 | 0 | 0 | 60 |
| Theo thứ tự shop đã chọn (S2 → S3 → S1) | 15 | 40 | 5 | 60 |
| Chia đều (lần lượt từng hộp theo thứ tự đã chọn, không vượt số cần) | 27 | 28 | 5 | 60 |
| Chỉnh tay | trống | trống | trống | người dùng nhập; tổng theo mã ≤ 60 |

**Chia đều với *Nguyên thùng*** (muốn 84 / 36 / 0, chia từng thùng lần lượt S2 → S1): S1 **24**, S2 **36**, S3 0 — tổng 60.

**Trên màn hình:**

| Mục | Mong đợi |
|---|---|
| Cột Thiếu sau chia | = muốn chuyển − được chia (vd *Theo thứ tự*: S1 thiếu 65) |
| Chỉnh tay, tổng một mã > tồn kho chuyển | Không cho chốt, báo "SUA01: chia 70 > tồn kho 60" |
| Tuỳ chọn đã chọn | Nhớ cho lần mở sau (trên máy người dùng) |
| Chốt đề nghị | Mỗi shop có số > 0 một đề nghị chuyển, như MH19 hiện nay |
| Menu Kho | Có mục "Chuyển hàng xuống shop" (MH19) mở đúng màn này; tên màn không đổi |

**Bút toán:** không có (đề nghị chuyển chưa ghi sổ).

**Sai số làm tròn chấp nhận:** 0 (số lượng nguyên theo ĐVT nhỏ nhất).

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Kho đủ hàng (tồn 200) | Mọi cách phân bổ cho cùng kết quả = số muốn chuyển |
| 2 | Mã không khai ĐVT mua (không có thùng) chọn *Nguyên thùng* | Làm như *Không làm tròn* |
| 3 | Chưa chọn shop nào | Phân tích mọi shop của chi nhánh cha, thứ tự theo mã shop |
| 4 | Shop đã có đề nghị chốt chưa làm | Trừ vào số thiếu của shop và tồn kho chia được (như hiện nay) |
| 5 | Chỉnh tay nhập số âm | Chặn |

## 7. Kết quả chạy
<!-- [2026-11-13 10:00 AM kiennt] NT-MH-004 — kết quả chạy -->

| | |
|---|---|
| Ngày chạy | 13/11/2026 |
| Bản code (commit) | nhánh `feat/chuyen-hang-xuong-shop` |
| Test tự động | `apps/api/test/chuyen-hang-xuong-shop.test.ts` — 10 / 10 đạt; `ton-max.test.ts` 28 / 28 (không đổi hành vi cũ) |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
| Muốn chuyển — Không làm tròn | 80 / 40 / 5 | 80 / 40 / 5 | 0 | |
| Muốn chuyển — Nguyên thùng | 84 / 36 / 0 | 84 / 36 / 0 | 0 | |
| Muốn chuyển — Theo cài từng mã (Tự động) | 84 / 40 / 5 | 84 / 40 / 5 | 0 | |
| Thiếu nhiều nhất trước | 60 / 0 / 0 | 60 / 0 / 0 | 0 | |
| Theo thứ tự S2 → S3 → S1 | 15 / 40 / 5; S1 thiếu 65 | 15 / 40 / 5; 65 | 0 | |
| Chia đều | 27 / 28 / 5 | 27 / 28 / 5 | 0 | |
| Chia đều + Nguyên thùng | 24 / 36 / 0 | 24 / 36 / 0 | 0 | |
| Chỉnh tay | để trống | 0 / 0 / 0 | 0 | |
| Chỉnh tay tổng 70 > 60 | Không cho chốt | 400 "SUA01: chia 70 > tồn kho 60"; giao diện báo đỏ, khoá nút Chốt | 0 | Kiểm cả máy chủ (cộng đề nghị đã chốt chưa làm) |
| Lệch chuẩn 1 (kho đủ) | = số muốn chuyển | Đúng cả 4 cách | 0 | |
| Lệch chuẩn 2 (không có thùng + Nguyên thùng) | Như không làm tròn | Đúng | 0 | |
| Lệch chuẩn 3 (chưa chọn shop) | Mọi shop, theo mã | Đúng | 0 | |
| Lệch chuẩn 4 (đề nghị đã chốt chưa làm) | Trừ vào tồn kho chia được | Tồn kho chia được về 0; chốt thêm bị chặn | 0 | |
| Menu Kho | Mục "Chuyển hàng xuống shop" | Có, mở MH19; tên màn giữ nguyên | 0 | |
| Nhớ tuỳ chọn | Lần mở sau giữ lựa chọn | Lưu trên máy người dùng | 0 | |
