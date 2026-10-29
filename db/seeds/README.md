# Dữ liệu gốc

Danh mục và cấu hình định khoản chuẩn của công ty. Phần mềm đọc thẳng từ đây:

- **Quay về dữ liệu gốc** (màn TI08 ở menu Tiện ích, nút ở đầu các màn danh mục): chép đè từng bộ từ tệp vào danh mục của đơn vị.
- **Định khoản** mặt hàng chưa có trong danh mục mặt hàng: lấy bộ tài khoản, loại thuế từ `mat-hang-tai-khoan.jsonl`.
- **Khởi tạo đơn vị** (`src/db/seed.ts`): hệ thống tài khoản từ `tai-khoan.csv`.

| Tệp | Danh mục | Ghi chú |
|---|---|---|
| `tai-khoan.csv` | Hệ thống tài khoản (ACC1) | Tên, tên tiếng Anh, tính chất số dư, cờ theo dõi chi tiết và cờ tính chất (ngoại tệ, thuế GTGT, công nợ nội bộ, luôn tăng, sổ cái…) |
| `tai-khoan-ngam-dinh.jsonl` | Tài khoản ngầm định (ACC41) | mười một ô của form + tài khoản của bộ định khoản |
| `loai-thue.jsonl` | Loại thuế (ACC43) | |
| `khoan-muc.jsonl` | Khoản mục (ACC24) | cây cha – con |
| `bo-phan.jsonl` | Bộ phận (ACC26) | cửa hàng: BH + mã cửa hàng |
| `chi-nhanh.jsonl` | Chi nhánh (DM02) | chỉ thêm / cập nhật |
| `kho.jsonl` | Kho theo chi nhánh (DM12) | mã kho, chi nhánh sở hữu, kho mặc định (nhận dòng nhập xuất không ghi mã kho); chỉ thêm / cập nhật |
| `ly-do.jsonl` | Lý do – tài khoản (ACC18) | |
| `nhom-hach-toan.jsonl` | Nhóm hạch toán mặt hàng (ACC17) | bộ tài khoản; mặt hàng gán nhóm ở `mat-hang-tai-khoan.jsonl` |
| `phan-loai-hang.jsonl` | Phân loại hàng hoá (DM11) | group = cây nhóm hàng; industry = cấp 1; brand = cấp 2 |
| `mat-hang-tai-khoan.jsonl` | Mặt hàng (DM10, ACC17) | chỉ thêm / cập nhật; gồm ghi chú, thuế TTĐB; bộ định khoản đọc thẳng khi mặt hàng chưa có trong phần mềm |
| `nhom-doi-tuong.jsonl` | Nhóm đối tượng (DM08) | |
| `doi-tuong.jsonl` | Đối tượng (DM03) | không gồm khách lẻ; chỉ thêm / cập nhật |
| `ngan-hang.jsonl` | Tài khoản ngân hàng (DM09) | |
| `hinh-thuc-thanh-toan.jsonl` | Hình thức thanh toán (DM05) | |
| `nhan-vien.jsonl` | Nhân viên (DM04) | |
| `hop-dong.jsonl` | Hợp đồng (ACC25) | |
| `loai-tai-san.jsonl` | Loại tài sản (ACC37) | loại cha "TSCĐ hữu hình" |
| `nhom-ccdc.jsonl` | Nhóm công cụ dụng cụ (ACC19) | |
| `nguon-von.jsonl`, `muc-dich-su-dung.jsonl`, `vu-viec.jsonl`, `du-an.jsonl` | ACC20, ACC21, DM06, DM07 | trống |

Thứ tự quay về toàn bộ khai ở `DATASETS` (`src/modules/default-data/default-data.service.ts`).

Định dạng JSONL: mỗi dòng một đối tượng JSON. Dòng đầu của mỗi tệp là mô tả (`_bang`, `_mo_ta`, `_cot`), không phải bản ghi.

Lập từ danh mục đang dùng của công ty ngày 14/10/2026. Sửa bản gốc thì sửa thẳng tệp (giữ đúng tên trường), chạy test `test/default-data.test.ts`, rồi cập nhật phần mềm.
