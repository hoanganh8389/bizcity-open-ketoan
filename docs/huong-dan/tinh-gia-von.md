# Tính giá vốn (ACC49)

<!-- [2026-11-17 Nguyễn Văn Thủy] viết lại theo cách tính và cách ghi sổ hiện tại (đóng góp) -->

Tính **giá vốn bình quân gia quyền theo tháng** cho từng mặt hàng, trong một phạm vi trên Cơ cấu tổ chức, rồi ghi **một phiếu giá vốn tháng** cho từng shop / chi nhánh.

## Dùng màn này

1. **Phạm vi tính (cơ cấu)** → bấm **Chọn…**, chọn một nút trên cây (vùng, chi nhánh, tỉnh) hoặc một shop. Mọi shop bên dưới nút đó **dồn chung** tồn đầu, nhập, chi phí, thưởng… để ra **một giá vốn bình quân cho mỗi mã**. Thường chọn **chi nhánh cấp 2** (chi nhánh đại diện nhập mua rồi chuyển xuống shop nằm trong cùng nút).
2. **Công thức**: công thức đang áp dụng cho tháng, chỉ xem (bấm vào thấy dạng phân số). Xem mục *Công thức* bên dưới.
3. Chọn **Tháng**, bấm **Tính giá vốn**. Mỗi lần tính lưu một thẻ ở **Lịch sử tính** (bên trái): giờ tính, phạm vi, kỳ, số mã, người tính, công thức đã dùng.
4. Bấm một thẻ để xem **bảng giá vốn** của lần đó (bên phải). Rê chuột lên tiêu đề cột để xem giải thích; cột chi tiết bật ở nút **Cột**.

| Cột | Ý nghĩa |
|---|---|
| Tồn đầu (SL, $) · Giá vốn BQ đầu kỳ | Tồn cuối tháng trước; giá vốn BQ đầu kỳ = Tồn đầu $ ÷ SL (hoặc giá nhập từ Excel) |
| Nhập mua (SL, $) | Nhập từ nhà cung cấp theo **giá Net** (chưa VAT − chiết khấu trên phiếu) |
| Chi phí (+) | Chi phí mua hàng phân bổ vào mã (vận chuyển, bốc xếp…) — tăng giá vốn |
| Thưởng, CK (−) | Thưởng / chiết khấu theo hàng mua phân bổ vào mã — giảm giá vốn |
| Nhập khác (SL, $) | Trả nhà cung cấp (âm), nhập điều chỉnh, nhận từ phạm vi khác |
| **Giá vốn BQ cuối kỳ** | Tổng giá trị ÷ tổng số lượng của các cột trên |
| Xuất · Tồn cuối (SL, $) | Giá vốn hàng xuất và tồn cuối = SL × Giá vốn BQ cuối kỳ |
| Chênh lệch trả NCC (ẩn sẵn) | Tiền trên phiếu trả NCC − giá trị trừ khỏi giá vốn |

## Công thức

```
                     Giá trị tồn đầu + nhập mua + chi phí phân bổ − thưởng, CK phân bổ − trả NCC + nhập điều chỉnh + nhận từ phạm vi khác
Giá vốn BQ cuối kỳ = ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
                     SL tồn đầu + nhập mua − trả NCC + nhập điều chỉnh + nhận từ phạm vi khác
```

- Hai sổ, chọn theo bản cài (`BOOK_MODE`): **nội bộ** (mọi chứng từ) và **thuế** (chứng từ có số hoá đơn). Khác nhau ở hàng trả NCC và xuất chi nhánh — xem màn **Công thức giá vốn (ACC49A)**.
- Căn cứ tính theo **nghiệp vụ**, không theo lý do trên phiếu (lý do chỉ là nhãn).
- Công thức **cố định**. Cần đổi (ví dụ đầu năm tài chính): bấm ô Công thức → **Đổi công thức…** → chọn lựa chọn, **Áp dụng từ tháng**, mật khẩu. Tháng trước giữ công thức cũ; không áp vào tháng đã khoá sổ. Đổi xong tính lại các tháng từ tháng áp dụng.

## Từng nghiệp vụ

- **Tồn đầu** = tồn cuối tháng trước. Tháng trước chưa tính thì phần mềm tự tính lần lượt các tháng còn thiếu.
- **Chuyển kho trong cùng phạm vi** (chi nhánh đại diện → shop, shop ↔ shop): hàng chỉ đổi chỗ, không đổi giá vốn, không vào công thức. **Nhận từ phạm vi khác**: vào công thức theo giá trên phiếu chuyển; phiếu không có giá thì theo giá vốn bên gửi.
- **Chi phí mua hàng** (phiếu Chi phí mua hàng) và **thưởng, chiết khấu sau mua** (Giảm giá hàng mua, Tính thưởng cuối kỳ): đã chia đến từng mã theo các phiếu nhập được gắn; cộng / trừ vào giá trị của đúng mã đó, không đổi số lượng. Chỉ đưa vào đây chiết khấu theo hàng mua; khoản hỗ trợ quảng cáo, trưng bày lập phiếu riêng.
- **Hàng trả nhà cung cấp**:
  - Sổ nội bộ: thành tiền − thuế trên phiếu, **không vượt giá trị đang có** (tồn đầu + nhập trong kỳ); trả hết số đang có thì lấy hết giá trị đang có.
  - Sổ thuế: **định giá theo tồn đầu**:

  | Trường hợp | Giá trị trừ khỏi công thức |
  |---|---|
  | Tiền trả bằng 0 | 0 |
  | Đơn giá trả ≤ đơn giá tồn đầu | SL trả × đơn giá tồn đầu |
  | Tiền trả ≤ giá trị tồn đầu | Tiền trả |
  | SL trả ≤ SL tồn đầu | Giá trị tồn đầu |
  | Còn lại | Giá trị tồn đầu + (SL trả − SL tồn đầu) × đơn giá trả |

  Phần **chênh lệch** = tiền trên phiếu trả − giá trị trừ khỏi công thức, ghi ở phiếu giá vốn tháng (xem *Ghi sổ*), để tồn kho trên sổ khớp bảng giá vốn.
- **Nhập điều chỉnh tăng**: SL × đơn giá trên phiếu (SL 0 thì là điều chỉnh giá trị).
- **Xuất chi nhánh theo giá bán** (sổ thuế; phiếu bán ghi lý do bán nội bộ): giá vốn ghi ngay bằng giá bán, trừ khỏi cả tử và mẫu.
- **Quà khuyến mãi nhận kèm phiếu mua**: vào tồn với giá 0, không vào công thức.
- **Khách trả hàng**: hoàn đúng giá vốn lúc bán.

  | Trường hợp | Giá vốn hoàn |
  |---|---|
  | Bán và trả cùng tháng | SL trả × giá vốn tháng |
  | Bán tháng trước, trả tháng này | SL trả × **giá vốn tháng bán gốc** |
  | Phiếu trả không ghi phiếu bán gốc | SL trả × giá vốn bình quân tồn đầu tháng trả |

- Tháng không nhập gì (mẫu số bằng 0): dùng giá vốn gần nhất của các tháng trước.

## Nhập giá vốn bình quân đầu kỳ từ Excel

Dùng khi bắt đầu áp dụng (chưa có tồn đầu đủ giá trị) hoặc khi cần chốt lại giá đầu kỳ của một tháng. Bấm **Nhập giá vốn bình quân đầu kỳ … từ Excel**, làm 4 bước:

1. **Chọn tệp nguồn** — kéo thả tệp, hoặc **Tải tệp mẫu** (Mã hàng, Tên hàng, Giá vốn bình quân đầu kỳ + sheet Hướng dẫn).
2. **Ghép dữ liệu** — tự ghép cột theo tên.
3. **Kiểm tra dữ liệu** — kiểm từng dòng, **chưa ghi**: mã không có trong danh mục, giá không phải số / âm, mã lặp (lấy dòng đầu). **Tải tệp lỗi** để sửa rồi nạp lại.
4. **Kết quả nhập** — nhập các dòng hợp lệ rồi tính giá vốn tháng ngay.

- Giá trị tồn đầu = SL tồn đầu × giá nhập, rồi bình quân với nhập trong tháng. Tháng sau tự lấy tiếp.
- Tệp mới **thay toàn bộ** giá đầu kỳ đã nhập của tháng. Mã không có trong tệp lấy tồn cuối tháng trước.
- Bỏ giá đã nhập: **Bỏ giá đầu kỳ đã nhập**. Cột **Nguồn giá đầu kỳ** (bật ở Cột) cho biết mã lấy giá từ Excel hay tồn cuối tháng trước.

## Ghi sổ

Phiếu bán, khách trả, chuyển kho, điều chỉnh **không mang giá vốn** (trong tháng chỉ có số lượng). Tính giá vốn ghi **một phiếu "Giá vốn hàng xuất"** cho từng shop / chi nhánh, số `GV MM/YYYY <mã>`, ngày cuối tháng, **chi tiết theo từng mã hàng**:

| Nghiệp vụ | Nợ | Có |
|---|---|---|
| Bán hàng | Giá vốn (hàng tặng: TK giá vốn hàng tặng) | Kho |
| Khách trả hàng | Kho | Giá vốn |
| Chuyển kho đi | Hàng đang chuyển (khác đơn vị hạch toán: phải thu nội bộ hàng) | Kho |
| Chuyển kho đến | Kho | Hàng đang chuyển (phải thu nội bộ hàng) |
| Xuất / nhập điều chỉnh | TK theo mục đích xuất (không có: thiếu / thừa chờ xử lý) | Kho (ngược lại khi nhập) |
| Chênh lệch trả NCC | Kho / Chênh lệch hàng trả NCC (phiếu trả lớn hơn) | ngược lại khi phiếu trả nhỏ hơn |

Tài khoản lấy từ **Quy tắc hạch toán (ACC41)** và loại kho, không viết cứng. Tính lại: phiếu giá vốn cũ được **đảo** (ghi số âm) rồi ghi phiếu mới.

## Lưu ý

- Thứ tự cuối tháng: **tính giá vốn → xem lãi lỗ → kết chuyển → khoá sổ**. Tính lại giá vốn sau khi đã kết chuyển thì phải kết chuyển lại.
- Tính lại bao nhiêu lần cũng được (ví dụ có phiếu muộn).
- Kỳ đã khoá sổ thì không tính lại được.
- Hàng xuất mà hệ thống nguồn đã gửi kèm giá vốn (bán nội bộ theo giá bán) thì giá vốn ghi cùng phiếu đó, không tính lại ở đây.

## Căn cứ pháp lý

Chuẩn mực kế toán số 02 — Hàng tồn kho (giá gốc gồm chi phí mua, trừ chiết khấu thương mại; phương pháp bình quân gia quyền, áp dụng nhất quán); Thông tư 99/2025/TT-BTC, tài khoản 156, 632.
