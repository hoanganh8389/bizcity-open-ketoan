# NT-DM-009 · Mã nhóm hàng được trùng ở ngành khác, chỉ chặn trùng trong cùng ngành
<!-- [2026-11-18 03:10 PM kiennt] NGHIEM-THU — tạo phiếu. -->

| | |
|---|---|
| Phân hệ | danh mục |
| Màn hình | DM11 Danh mục nhóm hàng (thêm / sửa nhóm, nhập Excel) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 18/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Mục đích quản trị
Hiện **Mã nhóm hàng** (tên ngắn trên cây) bị chặn trùng với mọi nhóm trong hệ thống, nên không đặt được cùng tên ở hai ngành khác nhau (vd thêm nhóm "Bỉm tã" dưới ngành ĐỒ UỐNG bị báo trùng với ngành "Bỉm tã"). Đổi lại: **trong cùng một cây (cùng ngành hàng cấp 1) không được trùng; khác ngành thì được trùng.**

Người dùng xác nhận yêu cầu ngày 18/11/2026 (đã chốt).

## 2. Khai báo trước
- Ngành "Bỉm tã" (cấp 1) và ngành "ĐỒ UỐNG" (cấp 1) có nhãn bên dưới.

## 3. Các bước thao tác
1. DM11 → chọn ngành ĐỒ UỐNG → **+ Tạo nhãn mới trong ngành này**.
2. Mã nhóm hàng = `Bỉm tã`, mã ngắn hợp lệ → **Ghi**.
3. Trong ngành ĐỒ UỐNG thêm tiếp một nhóm (cấp nào cũng được) cũng tên `bỉm  TÃ`.

## 5. Kết quả mong đợi

| Mục | Mong đợi |
|---|---|
| Bước 2 | Ghi được, không báo đỏ dưới ô Mã nhóm hàng |
| Bước 3 | Báo "Mã nhóm hàng đã dùng cho nhóm "ĐỒ UỐNG / Bỉm tã" — đặt mã khác", không ghi được (API trả 409 nếu gọi thẳng) |
| So trùng | Không phân biệt hoa thường, dấu cách thừa (như cũ) |
| Phạm vi "cùng cây" | Toàn bộ nhánh dưới ngành hàng cấp 1 chứa nhóm (ngành, nhãn, nhóm, cấp sâu hơn). Gốc "Nhóm hàng" (nếu có) không tính là ngành |
| Thêm ngành hàng (cấp 1) | Không trùng tên ngành hàng khác; được trùng tên nhãn / nhóm của ngành khác |
| Nhập Excel DM11 | Cùng luật: báo dòng lỗi khi trùng trong cùng ngành; khác ngành được thêm |

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Thêm ngành hàng tên trùng ngành đang có | Chặn, báo "đã dùng cho ngành hàng khác" |
| 2 | Sửa tên nhóm thành tên đang có ở nhánh khác **cùng ngành** | Chặn |
| 3 | Nhập Excel, nhóm cha ghi theo tên mà tên đó có ở nhiều ngành | Báo không rõ nhóm cha (như NT-DM-003) — ghi đường dẫn đầy đủ |
| 4 | Mã ngắn trùng nhóm cùng cha | Vẫn chặn như cũ (không đổi) |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 18/11/2026 |
| Bản code (commit) | nhánh `fix/nt-dm-009-ma-nhom-trung-khac-nganh` |
| Test tự động | `apps/api/test/nhom-hang.test.ts` — "mã nhóm hàng trùng trong cùng ngành bị chặn; khác ngành thì được" |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
| Thêm "nhóm  THỬ" dưới nhãn khác cùng ngành "Ngành thử" (đã có "Nhóm thử") | 409 | 409, thông báo nêu ngành "Ngành thử" | 0 | |
| Thêm "Nhóm thử" dưới ngành "Ngành khác" | Ghi được | 200 | 0 | |
| Thêm ngành "Ngành thử" (trùng ngành) | 409 | 409 | 0 | |
| Thêm ngành "Nhãn thử B" (trùng tên nhãn ngành khác) | Ghi được | 200 | 0 | |
