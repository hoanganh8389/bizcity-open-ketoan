# Sổ cái (ACC88)

Sổ cái của **một tài khoản** theo mẫu S03b: số dư đầu kỳ, từng phát sinh Nợ / Có kèm tài khoản đối ứng, tổng phát sinh trong kỳ và số dư cuối kỳ. Sổ cái **không có cột số dư sau từng dòng** — muốn xem số dư luỹ kế dùng **Sổ chi tiết tài khoản (ACC12)**.

## Cách dùng

- Ô **Tài khoản**: nhập số tài khoản rồi nhấn Enter. Nhập tài khoản tổng hợp (ví dụ `131`, `511`) thì gồm mọi tài khoản con — đây là cách xem sổ cái theo tài khoản cấp 1.
- Ô **TK đối ứng**: chỉ xem các dòng có tài khoản đối ứng bắt đầu bằng đầu số này (ví dụ sổ cái 1311 chỉ phần đối ứng 511).
- **Kiểu báo cáo**:
  - *Theo chi tiết chứng từ*: mỗi dòng sổ cái một dòng.
  - *Theo chứng từ và tài khoản đối ứng*: các dòng của cùng một chứng từ có cùng tài khoản đối ứng gom lại.
  - *Theo chứng từ*: mỗi chứng từ một dòng.
  Đổi kiểu báo cáo không đổi tổng phát sinh và số dư.
- **TK đối ứng** trên từng dòng là tài khoản ở phía bên kia của cùng cặp định khoản.
- Cột: Ngày, tháng ghi sổ; Số chứng từ; Số hoá đơn; Diễn giải; Tài khoản đối ứng; Phát sinh Nợ; Phát sinh Có; Chi nhánh; **Tài khoản** (tài khoản chi tiết của dòng, hữu ích khi lọc theo tài khoản tổng hợp). Dòng đầu là **Số đầu kỳ**, cuối bảng là **Phát sinh trong kỳ** và **Số cuối kỳ**.
- Bút toán kết chuyển cuối kỳ hiện thành dòng có chữ **KC**, ghi ngày cuối kỳ.
- Bấm một dòng để mở bút toán, từ đó mở tiếp chứng từ gốc.
- Sổ chỉ hiện bút toán đang có hiệu lực; chứng từ đã sửa thì hiện theo bản mới nhất.

Muốn xem mọi tài khoản cùng lúc theo trình tự thời gian, dùng **Sổ nhật ký chung (ACC89)**.
