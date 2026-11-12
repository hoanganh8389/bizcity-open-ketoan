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

Một bảng dạng cây duy nhất. Mỗi dòng là một nhóm: **Mã nhóm**, **Tên**, Cấp, Số mặt hàng, Đang dùng, Người tạo, Người sửa (kèm thời gian). Nhóm chưa có mã hiện chữ đỏ *chưa có*.

- Bấm tên nhóm (hoặc mũi tên ▸) để mở / thu nhóm con. **Mở hết / Thu hết** ở trên cùng.
- Ô **Tìm**: gõ mã hoặc tên, bảng chỉ còn nhóm khớp và đường đi tới nó.
- Ô **Xem dạng cây / Chỉ nhóm cấp 1…5**: xem riêng toàn bộ nhóm một cấp.

## Thao tác — nút ngay trên từng dòng

- **Sửa**: đổi mã, tên, Đang dùng; nút **Đổi…** để chuyển sang nhóm khác.
- **+ Nhóm con**: thêm nhóm cấp dưới. Mã điền sẵn mã kế tiếp (sửa được), nhập tên, **Ghi**.
- **Lịch sử**: ai thêm / sửa, lúc nào, đổi gì.
- **Thêm nhóm cấp 1** (góc phải trên): thêm ngành mới.
- Không có xoá: muốn ngừng thì **Sửa**, bỏ tích **Đang dùng**.

## Phần mềm tự chặn

- Mã nhóm phải **đúng số ký tự** của cấp (gợi ý luôn hiện dưới ô, sai thì báo đỏ).
- Cấp 1 chỉ gồm chữ số, không bắt đầu bằng 0.
- Hai nhóm cùng cha không được trùng mã.
- Không chuyển một nhóm vào nhánh con của chính nó. Đổi cấp thì nhập lại mã theo cấp mới; **mã hàng đã có không đổi.**
