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
- **Phải trên**: nhóm đang chọn — Thuộc nhóm, **Mã nhóm hàng**, **Tên nhóm hàng**, Đang dùng; dòng cuối ghi ai tạo, ai sửa lần cuối, lúc nào.
- **Phải dưới**: thẻ **Nhóm con** (bấm đúp một dòng để đi xuống) và thẻ **Lịch sử** (mỗi lần thêm / sửa: ai, lúc nào, đổi gì).

## Thao tác

| Nút | Làm gì |
|---|---|
| **Thêm** | Chọn nhóm cha trên cây rồi bấm **Thêm** (chưa chọn: thêm nhóm cấp 1). Mã nhóm điền sẵn số kế tiếp; nhập **Tên** rồi bấm **Ghi**. |
| **Sửa** | Sửa mã, tên, Đang dùng. Chuyển sang nhóm khác: bấm kính lúp ở ô **Thuộc nhóm**. **Hoãn** để bỏ. |
| **Ngừng dùng** | Không có xoá. Bấm **Sửa**, bỏ tích **Đang dùng**. |
| **Nạp / Xuất / Nhập Excel** | Tải lại / xuất lưới ra Excel / nhập nhiều nhóm từ tệp. |

## Phần mềm tự chặn

- Mã nhóm phải **đúng số ký tự** của cấp (gợi ý luôn hiện dưới ô, sai thì báo đỏ).
- Cấp 1 chỉ gồm chữ số, không bắt đầu bằng 0.
- Hai nhóm cùng cha không được trùng mã.
- Không chuyển một nhóm vào nhánh con của chính nó. Đổi cấp thì nhập lại mã theo cấp mới; **mã hàng đã có không đổi.**
