# Tính giá vốn (ACC49)

Tính đơn giá vốn **bình quân gia quyền theo tháng** cho từng mặt hàng, rồi ghi sổ giá vốn của hàng đã xuất trong tháng.

## Cách tính

Các chi nhánh cùng **đơn vị hạch toán** dùng chung một đơn giá cho mỗi mặt hàng trong tháng:

```
            Giá trị tồn đầu + nhập mua − trả nhà cung cấp + điều chỉnh tăng + nhận từ đơn vị khác
Đơn giá = ───────────────────────────────────────────────────────────────────────────────────────
            Số lượng tồn đầu + nhập mua − trả nhà cung cấp + điều chỉnh tăng + nhận từ đơn vị khác
```

- **Tồn đầu** là tồn cuối tháng trước. Tháng trước chưa tính thì phần mềm tự tính lần lượt các tháng còn thiếu.
- **Chuyển kho giữa hai cửa hàng cùng đơn vị** không làm đổi đơn giá (hàng chỉ đổi chỗ).
- Tháng không nhập gì (mẫu số bằng 0) thì dùng đơn giá gần nhất của các tháng trước.
- **Hàng bán nội bộ theo giá bán** (lý do XCN): giá vốn đã ghi ngay bằng giá bán, và bị **trừ khỏi cả tử và mẫu** của công thức trên.
- **Hàng bán nội bộ theo giá bán, xuất tặng thưởng khách hàng** (lý do có đánh dấu "Xuất theo giá trị chứng từ", mặc định XCN, XTA1.4): như trên.
- **Hàng trả nhà cung cấp với lý do có đánh dấu "định giá theo tồn đầu"** (mặc định XTR1, XTR9) được định giá theo tồn đầu, không lấy thẳng tiền trên phiếu trả:

  | Trường hợp | Giá trị đưa vào công thức |
  |---|---|
  | Tiền trả bằng 0 | 0 |
  | Đơn giá trả ≤ đơn giá tồn đầu | Số lượng trả × đơn giá tồn đầu |
  | Tiền trả ≤ giá trị tồn đầu | Tiền trả |
  | Số lượng trả ≤ số lượng tồn đầu | Giá trị tồn đầu |
  | Còn lại | Giá trị tồn đầu + (số lượng trả − số lượng tồn đầu) × đơn giá trả |

  Tồn kho trên sổ vẫn giảm đúng số tiền ghi trên phiếu trả.

- **Phiếu trả với lý do khác** (XDC, XKK, XTT1, XTT2, XTR3, XTR4, XTRCN…): lấy đúng **thành tiền − thuế** trên phiếu đưa vào công thức.
- **Nhập điều chỉnh tăng** vào công thức theo giá trị trên phiếu (số lượng 0 thì là điều chỉnh giá trị); lý do có đánh dấu "không tính vào đơn giá bình quân" (ví dụ ĐGTTK) thì bỏ ra ngoài, chỉ tăng số lượng tồn.
- Phiếu không ghi lý do dùng lý do mặc định của loại chứng từ.

Các đánh dấu trên khai ở **Lý do – Tài khoản (ACC18)**, phần "Tính giá vốn" của từng lý do.

## Nhập giá vốn tháng từ Excel (giai đoạn chạy song song)

Khi phần mềm mới mới áp cho một số cửa hàng, dữ liệu nhập xuất chưa đủ để tự tính bình quân. Mỗi tháng kế toán lấy **bảng giá vốn tháng** từ phần mềm kế toán đang dùng rồi nhập vào đây:

1. Chọn **Tháng**, bấm **Nhập giá vốn tháng … từ Excel**, chọn tệp `.xlsx` / `.xls` / `.csv`.
2. Tệp cần cột **Mã hàng** (bắt buộc) và **Giá vốn**; **Tên hàng** chỉ để tham khảo. Dòng tiêu đề nằm trong 10 dòng đầu. Một mã lặp nhiều dòng (ví dụ xuất từ thẻ kho) thì lấy giá khác 0 xuất hiện nhiều nhất (dòng nhập / xuất nội bộ đôi khi mang giá khác).
3. Bấm **Ghi**: phần mềm thay toàn bộ giá đã nhập của tháng đó, tính giá vốn và **ghi đè vào dòng giá vốn của mọi phiếu trong tháng** ngay.

- Mỗi mã hàng **một giá vốn** cho mọi chi nhánh, hàng chính hay khuyến mãi như nhau; giữ đủ số lẻ (ví dụ 434442,8361), tiền giá vốn từng phiếu làm tròn đồng.
- Mã **không có trong tệp** vẫn tính bình quân; phần mềm báo danh sách mã có xuất trong tháng mà thiếu trong tệp.
- Ô **Cập nhật chứng từ từ ngày … đến ngày …** (trong tháng, mặc định cả tháng): chỉ ghi đè giá vốn cho chứng từ có ngày chứng từ trong khoảng đó, mọi loại chứng từ; chứng từ ngoài khoảng giữ nguyên số đang có. Hữu ích khi cửa hàng mới áp dụng giữa tháng.
- Bảng đơn giá có cột **Nguồn giá** (Nhập Excel / Tính bình quân). Bấm tính lại tháng đó vẫn giữ giá đã nhập; muốn bỏ thì bấm **Bỏ giá đã nhập**.

## Ghi sổ

Phiếu **chưa có giá vốn** (bán hàng, khách trả, chuyển kho đi / đến, điều chỉnh tăng / giảm, xuất điều chỉnh) khi định khoản đã có sẵn **dòng giá vốn 0 đồng cho từng mặt hàng** ngay trong bút toán của phiếu. Tính giá vốn **ghi đè số tiền** = số lượng × đơn giá vừa tính (làm tròn đồng, theo từng phiếu, từng mặt hàng) lên chính các dòng đó:

| Nghiệp vụ | Nợ | Có |
|---|---|---|
| Bán hàng | 632 Giá vốn (hàng tặng có thể vào 641) | 156 Hàng hoá |
| Khách trả hàng | 156 | 632 |
| Chuyển kho đi | 1579 Hàng đang chuyển (khác đơn vị: 13681) | 156 |
| Chuyển kho đến | 156 | 1579 (13681) |
| Kiểm kê thiếu | 1381 Thiếu chờ xử lý | 156 |
| Kiểm kê thừa | 156 | 3381 Thừa chờ xử lý |

Phiếu định khoản **trước khi** có dòng giá vốn sẵn (dữ liệu cũ) thì giá vốn vẫn ghi vào một chứng từ **"Giá vốn hàng xuất"** của từng chi nhánh, ngày cuối tháng. Định khoản lại các phiếu đó thì chúng có dòng giá vốn sẵn như phiếu mới.

## Lưu ý

- **Tính giá vốn trước, rồi mới kết chuyển lãi lỗ.** Đã kết chuyển rồi mới tính giá vốn thì phải kết chuyển lại.
- Bấm tính lại bao nhiêu lần cũng được (ví dụ khi có thêm phiếu muộn): số tiền dòng giá vốn **được ghi đè**, không sinh bút toán ghi số âm (riêng chứng từ "Giá vốn hàng xuất" của dữ liệu cũ vẫn ghi số âm rồi ghi lại).
- Phiếu đổi phiên bản và được định khoản lại thì dòng giá vốn trở về 0, cần bấm tính giá vốn lại.
- Kỳ đã khoá sổ thì không tính lại được.
- Hàng xuất mà hệ thống bán hàng đã gửi kèm giá vốn thì giá vốn được ghi cùng bút toán của chứng từ, không tính lại ở đây.

## Căn cứ pháp lý

Chuẩn mực kế toán số 02 — Hàng tồn kho (phương pháp bình quân gia quyền); Thông tư 99/2025/TT-BTC, hướng dẫn tài khoản 156, 632. Xem thêm màn **Căn cứ pháp lý** (TI11), trang *Hàng tồn kho và giá vốn*.
