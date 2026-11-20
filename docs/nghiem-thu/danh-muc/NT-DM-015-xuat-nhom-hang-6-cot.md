# NT-DM-015 · Nhóm hàng (DM11): tệp Xuất / Nhập Excel chia 6 cột Ngành – Nhãn – Nhóm
<!-- [2026-11-20 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng: xuất Excel nhóm hàng chia 6 cột mã / tên ngành, nhãn, nhóm (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM11 Nhóm hàng — nút **Xuất**; Nhập Excel loại `nhom-hang` |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 20/11/2026 |
| Trạng thái | Đã chốt (kiennt, 20/11/2026) |

## 1. Yêu cầu

| Trước | Sau |
|---|---|
| Nhóm cha (đường dẫn) · Tên ngành · Mã hoá · Mô tả · Cấp · Số mặt hàng · Đang dùng · Ghi chú · Người tạo · Lúc tạo · Người sửa · Lúc sửa | **Mã ngành · Tên ngành · Mã nhãn · Tên nhãn · Mã nhóm · Tên nhóm** · Mô tả · Cấp · Số mặt hàng · Đang dùng · Ghi chú · Người tạo · Lúc tạo · Người sửa · Lúc sửa |

- Mỗi dòng vẫn là **một nhóm** của cây: dòng ngành (cấp 1) điền 2 cột đầu; dòng nhãn (cấp 2) điền 4 cột; dòng nhóm (cấp 3) điền đủ 6 cột. Các cột sau (Mô tả, Cấp, Số mặt hàng…) là của chính nhóm ở dòng đó.
- **Mã** = Mã hoá (đoạn ghép vào mã hàng: ngành 2 số, nhãn 3 ký tự, nhóm 1 ký tự). **Tên** = Tên ngành (tên trên cây) của cấp đó.
- Nhóm sâu hơn cấp 3 (ít gặp): cột Tên nhóm ghi đường dẫn từ cấp 3, vd `Sữa bột trẻ em / Lon nhỏ`; Mã nhóm là mã hoá của nhóm ở dòng đó.

## 2. Nhập Excel

- Nhập lại được **tệp Xuất mới** (6 cột): phần mềm lấy nhóm ở cấp sâu nhất có tên trên dòng; nhóm cha = tên các cấp bên trên.
- Tệp kiểu cũ (Nhóm cha · Tên ngành · Mã hoá) **vẫn nhập được** như trước.
- Quy tắc kiểm giữ nguyên (độ dài mã hoá theo cấp, trùng tên cùng cha, nhóm đã có mặt hàng không đổi mã hoá…).

## 3. Phạm vi

Tệp: `apps/web/src/features/catalog/NhomHangPage.tsx` (chỉ hàm Xuất), `apps/web/src/lib/nhapExcel.ts` (chỉ loại nhập `nhom-hang`), `docs/huong-dan/nhom-hang.md`. Không đổi API, CSDL.

## 4. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | DM11 → Xuất | 6 cột đầu như mục 1; dòng ngành / nhãn / nhóm điền đúng số cột |
| 2 | Nhập lại tệp vừa xuất, không sửa | Mọi dòng "Cập nhật", không lỗi, không đổi gì |
| 3 | Sửa Tên nhóm của một dòng cấp 3 rồi nhập | Thêm nhóm mới dưới đúng ngành / nhãn (khoá là nhóm cha + tên) |
| 4 | Thêm dòng mới: ngành, nhãn có sẵn + Mã nhóm `7`, Tên nhóm mới | Thêm nhóm cấp 3 dưới đúng nhãn, mã hoá 7 |
| 5 | Nhập tệp kiểu cũ (Nhóm cha, Tên ngành, Mã hoá) | Như trước |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test | Trên màn hình; 4 lệnh kiểm |

## 6. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 20/11/2026 | Tạo và chốt theo yêu cầu |
