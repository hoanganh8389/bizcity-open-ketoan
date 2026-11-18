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
<!-- [2026-11-17 04:28 PM kiennt] DM11 — màn ba cột Ngành → Nhãn → Nhóm và bảng mặt hàng (đóng góp) -->

Ba cột nối tiếp: **1 Ngành hàng** (cấp 1) → **2 Nhãn hàng** (cấp 2) → **3 Nhóm hàng** (cấp 3). Bấm một ngành thì cột Nhãn hiện các nhãn của ngành đó; bấm một nhãn thì cột Nhóm hiện các nhóm của nhãn.

Mỗi dòng: **mã ngắn** (ô màu đầu dòng), tên, **số mặt hàng** (cộng cả nhóm con), dấu ✓ ở dòng đang chọn.
- *chưa mã*: nhóm cấp 1–3 chưa có mã ngắn — mặt hàng thuộc nhóm này chưa sinh được mã.
- *trùng mã*: cùng mã ngắn với một nhóm khác cùng cấp — cần sửa để mã hàng không trùng đầu.

Ô **Tìm kiếm** (trên ba cột): gõ tên hoặc mã ngắn; mỗi cột chỉ còn nhóm khớp và nhóm cha của nó.

Bảng **Mặt hàng** bên dưới: mặt hàng của nhánh đang chọn (gồm cả nhóm con), ô chọn trạng thái (Tất cả / Đang dùng / Ngừng dùng / Nháp). Bấm đúp một dòng để mở mặt hàng.

## Thao tác

- **Sửa nhóm**: bấm đúp dòng nhóm, hoặc nút bút chì ở dòng đang chọn. Đổi mã nhóm hàng, tên, ghi chú, Đang dùng; mã ngắn chỉ đổi được khi nhóm chưa có mặt hàng.
- **Lịch sử**: nút đồng hồ ở dòng đang chọn — ai thêm / sửa, lúc nào, đổi gì.
- **+ Thêm ngành hàng / + Tạo nhãn mới trong ngành này / + Tạo nhóm mới trong nhãn này** (cuối mỗi cột): thêm nhóm vào cấp đó. Mã ngắn điền sẵn mã kế tiếp.
- **Thêm mặt hàng** (trên cùng): mở form mặt hàng, nhóm điền sẵn theo nhóm đang chọn, mã tự sinh.
- **Xoá / Thùng rác**: xoá nhóm đang chọn vào thùng rác, khôi phục được. Muốn ngừng mà không xoá thì **Sửa**, bỏ tích **Đang dùng**.

## Phần mềm tự chặn

- Mã ngắn phải **đúng số ký tự** của cấp (gợi ý luôn hiện dưới ô, sai thì báo đỏ). Hai nhóm cùng cha không trùng mã ngắn.
- **Nhóm (hoặc nhóm con bên dưới) đã có mặt hàng: không đổi mã ngắn, không chuyển nhóm** — mã hàng đã ghép theo.
- Mã nhóm hàng không được trùng **nhóm cùng cha** (kể cả hai ngành hàng với nhau) và không trùng **tên nhóm cha** của nó (không phân biệt hoa thường, dấu cách thừa). Khác cha thì được trùng, kể cả trong cùng ngành: vd "Bỉm tã" vừa là ngành hàng vừa là nhãn dưới ngành ĐỒ UỐNG; hai nhãn khác nhau của cùng ngành đều có nhóm "Sữa nước". Sửa tên nhóm cũng không được trùng tên nhóm con trực tiếp. <!-- [2026-11-18 03:10 PM kiennt] NT-DM-009 — trùng mã nhóm hàng: chặn cùng cha và trùng tên cha. -->
- Không chuyển một nhóm vào nhánh con của chính nó.

## Nhập Excel

Tệp mẫu có các cột: **Nhóm cha** (đường dẫn, vd `BỈM/ TÃ / Aiwibi`, trống = cấp 1), **Mã nhóm hàng**, **Mã ngắn**, **Tên nhóm hàng** (trống = tự ghép), **Đang dùng**.

- Cùng nhóm cha + cùng mã nhóm hàng với nhóm đang có → cập nhật; khác → thêm mới.
- Tên nhóm cha trùng ở nhiều nhánh thì ghi **đường dẫn đầy đủ** (vd `ĐỒ UỐNG / Bỉm tã`).
- Nhóm cha ở dòng trên trong cùng tệp cũng được (phần mềm ghi cha trước).
- Bước Kiểm tra báo từng dòng sai (mã ngắn sai độ dài, trùng, nhóm cha chưa có, nhóm đã có mặt hàng mà đổi mã ngắn…); chỉ ghi dòng đúng.
