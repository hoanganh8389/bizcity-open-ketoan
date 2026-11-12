# Nhóm hàng (DM11)
<!-- [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — hướng dẫn màn Nhóm hàng (một cây, bỏ các thẻ ngành / nhãn / loại) -->
<!-- [2026-11-12 Nguyễn Văn Thủy] viết lại theo màn một bảng cây: Mã nhóm hàng, Mã ngắn, Tên nhóm hàng; không xoá; có lịch sử -->

Nhóm hàng là **một cây** để quản trị hàng hoá từ trên xuống: cấp 1 → cấp 2 → cấp 3 (cấp 4, 5 để chia nhỏ thêm).

Mỗi nhóm có:

| Ô | Là gì | Ví dụ |
|---|---|---|
| **Mã nhóm hàng** | Tên ngắn hiện trên cây | Bỉm/ Tã quần trẻ em |
| **Mã ngắn (mã ghép)** | Đoạn ghép vào mã hàng | 3 |
| **Tên nhóm hàng** | Tên đầy đủ — tự ghép theo nhóm cha, sửa được | BỈM/ TÃ Angel Bỉm/ Tã quần trẻ em |

## Mã ngắn ghép thành mã hàng

```
Mã hàng = mã ngắn cấp 1 + mã ngắn cấp 2 + mã ngắn cấp 3 + số thứ tự (3 số)
```

- Cấp 1: 2 chữ số, không bắt đầu bằng 0.
- Cấp 2: 3 ký tự (chữ hoặc số).
- Cấp 3: 1 ký tự (chữ hoặc số).

Thêm mặt hàng mới chỉ cần chọn nhóm cấp 3, phần mềm tự sinh mã.

## Màn hình

Một bảng dạng cây. Mỗi dòng: Mã ngắn, Mã nhóm hàng, Tên nhóm hàng, Cấp, **Số mặt hàng** (cộng cả nhóm con), Đang dùng, Người tạo, Người sửa (kèm thời gian). Nhóm cấp 1–3 chưa có mã ngắn hiện chữ đỏ *chưa có*.

- Bấm vào dòng để mở / thu nhóm con. Nút **Cột** ẩn / hiện Tên nhóm hàng, Ghi chú, Người tạo, Người sửa. **Mở hết / Thu hết** ở trên cùng.
- Ô **Tìm**: gõ mã hoặc tên; bảng chỉ còn nhóm khớp và đường đi tới nó.
- Ô **Xem dạng cây / Chỉ nhóm cấp 1…5**: xem riêng toàn bộ nhóm một cấp.

## Thao tác — nút ngay trên từng dòng

- **Sửa**: đổi mã nhóm hàng, tên nhóm hàng, Đang dùng; mã ngắn và nút **Đổi…** (chuyển nhóm) chỉ dùng được khi nhóm chưa có mặt hàng.
- **+ Mặt hàng** (chỉ ở nhóm cấp 3): mở form thêm mặt hàng, nhóm điền sẵn, mã tự sinh.
- **+ Nhóm con** (cấp 1, 2): thêm nhóm cấp dưới. Mã ngắn điền sẵn mã kế tiếp, tên nhóm hàng tự ghép; nhập mã nhóm hàng rồi **Ghi**.
- **Lịch sử**: ai thêm / sửa, lúc nào, đổi gì.
- **＋ Thêm nhóm cấp 1** (dòng đầu bảng, khi xem dạng cây): thêm ngành mới.
- Không có xoá: muốn ngừng thì **Sửa**, bỏ tích **Đang dùng**.

## Phần mềm tự chặn

- Mã ngắn phải **đúng số ký tự** của cấp (gợi ý luôn hiện dưới ô, sai thì báo đỏ). Hai nhóm cùng cha không trùng mã ngắn.
- **Nhóm (hoặc nhóm con bên dưới) đã có mặt hàng: không đổi mã ngắn, không chuyển nhóm** — mã hàng đã ghép theo.
- Mã nhóm hàng không được trùng nhóm khác trong hệ thống.
- Không chuyển một nhóm vào nhánh con của chính nó.

## Nhập Excel

Tệp mẫu có các cột: **Nhóm cha** (đường dẫn, vd `BỈM/ TÃ / Aiwibi`, trống = cấp 1), **Mã nhóm hàng**, **Mã ngắn**, **Tên nhóm hàng** (trống = tự ghép), **Đang dùng**.

- Cùng nhóm cha + cùng mã nhóm hàng với nhóm đang có → cập nhật; khác → thêm mới.
- Nhóm cha ở dòng trên trong cùng tệp cũng được (phần mềm ghi cha trước).
- Bước Kiểm tra báo từng dòng sai (mã ngắn sai độ dài, trùng, nhóm cha chưa có, nhóm đã có mặt hàng mà đổi mã ngắn…); chỉ ghi dòng đúng.
