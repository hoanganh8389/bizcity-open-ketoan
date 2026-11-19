# NT-DM-010 · Nhóm hàng (DM11): đổi tên ô — Tên ngành, Mã hoá, Mô tả (không bắt buộc)
<!-- [2026-11-18 05:00 PM kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (ảnh form "Sửa nhóm Đồ dùng cho mẹ & bé") (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM11 Danh mục nhóm hàng — hộp Thêm / Sửa nhóm; Nhập / Xuất Excel nhóm hàng |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 18/11/2026 |
| Trạng thái | Đã chốt (kiennt, 18/11/2026 — chọn: luôn "Tên ngành"; đổi cả form, Excel, hướng dẫn) |

## 1. Yêu cầu

| Trước | Sau | Ghi chú |
|---|---|---|
| Mã nhóm hàng (*) | **Tên ngành** (*) | Mọi cấp đều ghi "Tên ngành" (người dùng chọn). Vẫn bắt buộc, vẫn không trùng như NT-DM-009 |
| Mã ngắn (mã ghép) (*) | **Mã hoá** (*) | Quy tắc giữ nguyên (cấp 1 = 2 chữ số, cấp 2 = 3 ký tự, cấp 3 = 1 ký tự; khoá khi nhóm đã có mặt hàng) |
| Tên nhóm hàng (*) | **Mô tả** | **Không bắt buộc**; không tự ghép tên nhóm cha + tên nữa — để trống được. Nhóm đã có giá trị cũ thì giữ, sửa / xoá được |

## 2. Phạm vi
- Hộp Thêm / Sửa nhóm DM11: nhãn ô, gợi ý (tip), câu báo lỗi phía giao diện ("Nhập tên ngành", "Tên ngành trùng …", "Mã hoá cấp … phải là …").
- Excel nhóm hàng (nút Xuất của DM11 và loại nhập `nhom-hang`): tiêu đề cột **Tên ngành**, **Mã hoá**, **Mô tả**; tệp cũ có cột *Mã nhóm hàng*, *Mã ngắn*, *Tên nhóm hàng* vẫn nhập được (tên cũ thành tên gọi khác). Mô tả trống: không tự ghép.
- Hướng dẫn `nhom-hang.md`, `nhap-excel.md`, `danh-muc-quy-trinh.md`.
- **Không đổi**: tên trường trong CSDL / API (`name`, `skuCode`, `fullName`); câu báo lỗi do máy chủ trả (vẫn có thể ghi "mã nhóm hàng") — muốn đổi thì làm phiếu riêng phía API. Không đụng lõi.

Tệp: `apps/web/src/features/catalog/NhomHangPage.tsx`, `apps/web/src/lib/nhapExcel.ts` (loại nhập nhóm hàng), `docs/huong-dan/nhom-hang.md`, `docs/huong-dan/nhap-excel.md`, `docs/huong-dan/danh-muc-quy-trinh.md`.

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Mở Sửa nhóm "Đồ dùng cho mẹ & bé" | Ba ô: Tên ngành (*), Mã hoá (*), Mô tả |
| Thêm nhóm, để trống Mô tả → Ghi | Ghi được, Mô tả trống |
| Thêm nhóm, để trống Tên ngành | Báo "Nhập tên ngành", không ghi |
| Xuất Excel DM11 | Cột Tên ngành, Mã hoá, Mô tả |
| Nhập lại tệp vừa xuất; nhập tệp cũ (cột Mã nhóm hàng / Mã ngắn / Tên nhóm hàng) | Đều ghép cột đúng, không lỗi, không đổi ô nào |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test | Trên màn hình; 4 lệnh kiểm |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo và chốt theo yêu cầu, người dùng chọn: luôn "Tên ngành"; đổi cả form, Excel, hướng dẫn |
