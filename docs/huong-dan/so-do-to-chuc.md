# Cơ cấu tổ chức (DM16)
<!-- [2026-11-20 Nguyễn Văn Thủy] Viết lại theo mô hình một bảng: đơn vị lồng nhau – phân kho – bộ phận (0173) -->

Mọi cấp (công ty, miền, chi nhánh, tỉnh, cửa hàng…) đều là một **đơn vị**. Chúng chỉ khác nhau ở **tên gọi cấp**, do bạn tự đặt.
Đơn vị nào cũng có thể chứa đơn vị con, có **phân kho** và **bộ phận** riêng.

```
Công ty TGS                         cấp 1
└─ Miền Bắc                         cấp 2
   └─ Chi nhánh Phú Thọ             cấp 3   ← có phân kho trung gian, bộ phận kế toán
      └─ Cửa hàng 08001             cấp 4   ← có phân kho hàng hoá, bộ phận bán hàng
```

Đường dẫn của đơn vị ghi theo kiểu **Công ty TGS / Miền Bắc / Chi nhánh Phú Thọ**. Ô **Thuộc** và các bảng đều hiện đường dẫn này.

## Ba thứ cần khai

| Loại | Thuộc | Ô chính |
|---|---|---|
| **Đơn vị** | Một đơn vị khác (trống = cấp cao nhất) | Mã, Tên, Tên gọi cấp, MST, Tên in chứng từ, Địa chỉ, Điện thoại |
| **Phân kho** | Một đơn vị | Mã phân kho, Tên, Loại kho, Mặc định |
| **Bộ phận** | Một đơn vị | Mã bộ phận, Tên |

- **Mã không được trùng** giữa đơn vị, phân kho và bộ phận.
- **MST**: đơn vị tự khai thì dùng MST của nó. Để trống thì dùng MST của cấp gần nhất phía trên có khai (bảng hiện dấu ↑).
- Tạo đơn vị là **tự có một bộ phận** (đổi tên được). Chứng từ chưa chọn bộ phận thì tính vào bộ phận này.
- **Bộ phận cha – con** (không bắt buộc): một bộ phận có thể thuộc một bộ phận khác **trong cùng đơn vị**,
  ví dụ *Kế toán → Kế toán thuế*, *Logistic → Kho, Đội xe*. Không chọn được bộ phận của đơn vị khác. Chuyển bộ phận sang đơn vị khác thì nó bỏ cha cũ.

## Chứng từ ghi gì

Mỗi chứng từ lưu ba định danh nhỏ nhất: **đơn vị**, **phân kho**, **bộ phận**.
Chứng từ không chọn phân kho / bộ phận thì lấy cái mặc định của đơn vị.
Nhờ vậy, đổi mã, đổi tên hay chuyển đơn vị sang nhánh khác về sau, số liệu cũ vẫn đúng chỗ.
Báo cáo và định mức chi phí theo đơn vị → bộ phận → khoản mục dựa trên ba định danh này.

## Thao tác

- **Xem**: *Cây* (trái) + chi tiết (phải), *Sơ đồ* (chọn "Xem từ" để xem một nhánh), *Danh sách* (Đơn vị / Phân kho / Bộ phận).
- **Bảng**: không phân trang. Gõ vào hàng lọc dưới tiêu đề để lọc từng cột, bấm tiêu đề để sắp xếp.
  Nút **Cột** để ẩn / hiện cột. Cột *Người tạo, Ngày tạo, Người sửa, Ngày sửa* đang ẩn sẵn. Nút **Xuất Excel** xuất đúng các dòng đang lọc.
- **Tab Phân kho / Bộ phận** chỉ hiện của riêng đơn vị đang chọn. Bấm **Toàn nhánh** để xem cả các đơn vị cấp dưới.
- **Tab Bộ phận**: bảng xếp theo cây (bộ phận con thụt vào dưới cha, có cột *Bộ phận cha*). Bấm **Sơ đồ bộ phận** để xem dạng sơ đồ tổ chức:
  bấm một ô để sửa, rê chuột vào ô rồi bấm **+** để thêm bộ phận con, nút **Toàn màn hình** để xem rộng.
- **Sơ đồ** (chung): tích *Hiện bộ phận* thì mỗi đơn vị hiện cây bộ phận cha – con của nó.
- **Thêm**: nút *Thêm đơn vị* ở đầu trang, hoặc *Thêm* trong chi tiết một đơn vị (đơn vị con / phân kho / bộ phận).
- **Sửa**: *Chỉnh sửa* trong chi tiết, hoặc bấm đúp một dòng trong bảng. Đổi **Thuộc** là chuyển đơn vị sang nhánh khác. Lần chuyển được ghi ở tab **Lịch sử**.
- **Xoá**: xoá vĩnh viễn, kèm toàn bộ đơn vị con, phân kho, bộ phận bên trong. Hộp xoá liệt kê hết những gì sẽ mất trước khi bạn đồng ý.
  Xoá bộ phận cha thì xoá cả bộ phận con. Đơn vị / phân kho / bộ phận **đã có chứng từ** thì không xoá được. Hãy chuyển sang *Ngừng hoạt động*.

## Xuất / nhập Excel

Nút **⋯** → **Xuất Excel** tạo một tệp ba sheet: **Đơn vị**, **Phân kho**, **Bộ phận**.
Cột **Thuộc (mã)** ghi mã đơn vị cha / đơn vị chứa; sheet Bộ phận có thêm **Bộ phận cha (mã)** (cùng đơn vị, để trống = cấp cao nhất). Cột **Đường dẫn** chỉ để đọc.

Nhập theo thứ tự **1. Đơn vị → 2. Phân kho → 3. Bộ phận** (ở nút ⋯):

- Có thể dùng chính tệp vừa xuất: sửa hoặc thêm dòng rồi nhập lại.
- Mã đã có thì cập nhật, mã mới thì thêm.
- Dòng lỗi được báo trước khi ghi: trùng mã khác loại, đơn vị cha không có, MST sai, vòng lặp cha – con.
