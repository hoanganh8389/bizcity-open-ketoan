# Nhóm hàng (DM11)
<!-- [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — hướng dẫn màn Nhóm hàng (một cây, bỏ các thẻ ngành / nhãn / loại) -->
<!-- [2026-11-12 Nguyễn Văn Thủy] viết lại theo màn tối giản: một ô Mã nhóm hàng, không xoá, có lịch sử -->

Nhóm hàng là **một cây** để quản trị hàng hoá từ trên xuống. Báo cáo theo mã hàng chọn được nhóm trên cây này.

```
Nhóm hàng
└─ Cấp 1   mã nhóm 2 chữ số, không bắt đầu bằng 0
   └─ Cấp 2   mã nhóm 3 ký tự (chữ hoặc số)
      └─ Cấp 3   mã nhóm 1 ký tự (chữ hoặc số)
```

## Mã hàng ghép từ mã nhóm

```
Mã hàng = mã nhóm cấp 1 + mã nhóm cấp 2 + mã nhóm cấp 3 + số thứ tự (3 số)
```

Thêm mặt hàng mới chỉ cần chọn nhóm cấp 3, phần mềm tự sinh mã.

## Màn hình

- **Trái**: cây nhóm hàng. Gõ tên để tìm.
- **Phải trên**: thẻ của nhóm đang chọn — đường dẫn, **mã nhóm**, **tên**, cấp, số mặt hàng, ai tạo / sửa lúc nào. Nút **Sửa** và **+ Thêm nhóm con** nằm ngay trên thẻ.
- **Phải dưới**: **Danh sách nhóm** (mặc định là nhóm con; ô bên phải chọn xem toàn bộ nhóm cấp 1, 2, 3… hoặc tất cả; bấm đúp một dòng để đi tới nhóm đó) và **Lịch sử** (mỗi lần thêm / sửa: ai, lúc nào, đổi gì). Nhóm chưa có mã hiện chữ đỏ *chưa có*.

## Thao tác

- **Thêm ngành mới**: nút **Thêm nhóm cấp 1** trên cùng.
- **Thêm nhóm con**: chọn nhóm trên cây → **+ Thêm nhóm con**. Mã điền sẵn mã kế tiếp (sửa được), nhập tên, **Ghi**.
- **Sửa**: chọn nhóm → **Sửa**. Chuyển sang nhóm khác: nút **Đổi…** ở ô Thuộc nhóm.
- **Ngừng dùng**: không có xoá — **Sửa**, bỏ tích **Đang dùng**.

## Phần mềm tự chặn

- Mã nhóm phải **đúng số ký tự** của cấp (gợi ý luôn hiện dưới ô, sai thì báo đỏ).
- Cấp 1 chỉ gồm chữ số, không bắt đầu bằng 0.
- Hai nhóm cùng cha không được trùng mã.
- Không chuyển một nhóm vào nhánh con của chính nó. Đổi cấp thì nhập lại mã theo cấp mới; **mã hàng đã có không đổi.**
