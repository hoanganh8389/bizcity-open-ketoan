# Sơ đồ tổ chức (DM16)
<!-- [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — hướng dẫn màn Sơ đồ tổ chức -->
<!-- [2026-11-03 02:10 PM Nguyễn Văn Thủy] SDTC — viết lại gọn theo màn đơn giản, bỏ "đơn vị mua hàng" -->
<!-- [2026-11-03 03:00 PM Nguyễn Văn Thủy] SDTC — bỏ ô Mã ngắn, Alias -->

Sơ đồ tổ chức là cây quản lý của công ty:

```
Công ty
└─ BAC  Miền Bắc                 (cấp 1)
   └─ PT  Chi nhánh Phú Thọ      (cấp 2)
      ├─ PTO  Phú Thọ            (cấp 3)
      ├─ LCI  Lào Cai
      └─ YBI, VPC, TQG, HGG …
```

Mỗi **chi nhánh / cửa hàng** gắn vào một nút, thường là nút cấp 3 (tỉnh). Bạn gắn ở **Danh mục chi nhánh (DM02)**: mở chi nhánh → ô **Thuộc SĐTC** → bấm kính lúp → chọn nút.

## Màn hình

- **Trái**: cây. Gõ mã hoặc tên để tìm, không cần dấu.
- **Phải trên**: **Mã** (mã nút, không đổi được sau khi thêm), **Tên**, **Mô tả** (ghi chú tuỳ ý) của nút đang chọn.
- **Phải dưới**: các nút con của nút đang chọn. Ô **Xem** chuyển sang *Xem toàn bộ nhóm cấp 1 / 2 / 3…* hoặc *Xem tất cả*. Bấm đúp một dòng để đi xuống nút đó.

## Thao tác

| Nút | Làm gì |
|---|---|
| **Thêm** | Thêm nút con dưới nút đang chọn. Nhập Mã, Tên rồi bấm **Ghi**. |
| **Sửa** | Sửa tên, mô tả rồi bấm **Ghi**. **Hoãn** để bỏ. |
| **Xoá** | Chỉ xoá được nút **không còn nút con** và **không còn chi nhánh nào gắn vào**. Còn thì phần mềm báo tên chi nhánh / nút con, chuyển đi trước rồi xoá. |
| **Nạp** | Tải lại cây. |
| **Xuất / Nhập Excel** | Tệp 2 sheet: **Nút** (Mã, Tên, Mã cha, Mô tả) và **Gắn chi nhánh** (Mã chi nhánh, Mã nút). Phần mềm kiểm từng dòng, cho xem trước, có lỗi thì không ghi gì. |
| **Quay về dữ liệu gốc** | Đặt lại cây và việc gắn chi nhánh đúng như tệp gốc (`db/seeds`). Nút bạn tự thêm mà không còn chi nhánh thì xoá. Dùng khi đã sửa lộn xộn. |

Shop đổi đuôi mã (lên Plus / Premium, đóng thành _OFF) vẫn khớp được: cùng 5 số đầu là cùng một shop.

## Phần mềm tự làm

- **Mua hàng**: ở Phân tích đặt hàng, Tồn max, Chuyển hàng xuống shop, Công thức đặt hàng, ô **Chi nhánh** chọn theo cây (ví dụ *PT · Chi nhánh Phú Thọ*). Phần mềm lấy mọi cửa hàng nằm dưới PT. Hàng về kho của chi nhánh có mã dạng `xx000` (PT → 08000), bạn không phải khai gì thêm.
- **Báo cáo**: ở bảng lọc bên trái có thẻ **Cây** (Công ty → Miền → Chi nhánh → Tỉnh → cửa hàng → kho). Tích một nút là chọn hết các cửa hàng và kho bên dưới.
