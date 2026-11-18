# NT-DM-006 · Nút Nhân bản ở các màn danh mục; thanh nút: nút chức năng bên trái
<!-- [2026-11-18 01:30 PM kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng: nhân bản ở mọi màn danh mục (như nút cũ của ACC1), đảo thanh nút (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | ACC1, DM15, ACC43, DM18, DM08, DM12, DM13, DM04 (và các danh mục cùng màn: phòng ban, khoản mục…), DM09, DM05, DM14, DM11, DM16; thanh nút chung của mọi màn dùng `CatalogToolbar` |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 18/11/2026 |
| Trạng thái | Đã chốt (kiennt, 18/11/2026 — chọn: mọi màn trừ DM10; đảo nút áp cho mọi màn; chung nhánh NT-DM-004/005) |

## 1. Mục đích quản trị
Khai nhanh mục gần giống mục có sẵn (thuế 8% → thuế 10%, ngân hàng thứ hai, nhân viên cùng chi nhánh…) mà không gõ lại từ đầu. Thanh nút thống nhất: nút thao tác ở bên trái, phần chọn kiểu xem / lọc ở bên phải.

## 2. Nút Nhân bản
Logic như nút Nhân bản cũ của ACC1 (đã bỏ ngày 17/11): chọn một dòng → bấm **Nhân bản** → mở form **Thêm** điền sẵn thông tin của dòng đó, **mã để trống** (hoặc gợi ý mã mới như nút Thêm); sửa rồi Ghi như thêm mới. Chưa chọn dòng thì nút mờ (ghi rõ lý do). Không có quyền ghi thì ẩn. Không chép số liệu phát sinh, lịch sử, thùng rác.

| Màn | Điền sẵn | Để trống / đặt lại (vì phải khác mục gốc) |
|---|---|---|
| ACC1 Hệ thống tài khoản | Tên, TK tổng hợp, tính chất, diễn giải, theo dõi chi tiết | Số TK; trạng thái = đang dùng |
| DM15 Đơn vị tính | Ghi chú | Tên; đang dùng |
| ACC43 Biểu thuế | Tên, thuế suất, chiều, tài khoản, nhóm bảng kê | Mã thuế |
| DM18 Loại kho | Tên, công dụng, tài khoản | Mã (loại mới không phải loại gốc của hệ thống) |
| DM08 Nhóm đối tượng | Tên, nhóm cha, dùng cho, ghi chú | Mã |
| DM12 / DM13 Khách hàng / NCC | Nhóm, tên, địa chỉ, liên hệ, thông tin khác | Mã (tự cấp như Thêm), **mã số thuế** (không được trùng) |
| DM04 Nhân viên (và các danh mục cùng màn) | Tên, chức vụ, chi nhánh, phòng ban, thông tin khác | Mã |
| DM09 Tài khoản ngân hàng | Tên ngân hàng, chi nhánh NH, địa chỉ, chủ TK, tiền tệ | Mã, **số TK**, **tài khoản hạch toán** (mỗi TK kế toán chỉ gắn một ngân hàng) |
| DM05 Hình thức thanh toán | Tên, tài khoản, TK ngân hàng, ghi công nợ, đối tượng nhận hộ | Mã |
| DM14 Bảng giá | Tên, ghi chú | Mã; **chi nhánh áp dụng** (mỗi chi nhánh một bảng giá); không phải bảng giá công ty. Không chép giá — giá chép bằng Xuất / Nhập Excel ở lưới giá |
| DM11 Nhóm hàng | Tên, nhóm cha (cùng cấp) | Mã ngắn (gợi ý như Thêm) |
| DM16 Cơ cấu tổ chức | Loại nút, nút cha, tên, địa chỉ, MST, thông tin khác | Mã; kho: không là kho mặc định |

DM10 Mặt hàng **không làm ở phiếu này** (tệp thuộc phạm vi PHASE-026 — Nguyễn Văn Thủy). ACC41 không áp dụng (không phải danh sách thêm / xoá). ACC41A **chưa làm** Nhân bản: form bước kết chuyển (`apps/web/src/phan-he/ke-toan/closing/ClosingPage.tsx`) thuộc phạm vi giữ chỗ NT-HT-003 — làm sau khi dòng đó xong; thanh nút ACC41A vẫn đảo (dùng thanh chung).

## 3. Thanh nút
| Trước | Sau |
|---|---|
| Phần chọn kiểu xem / lọc (Gọn · Chi tiết ở ACC41; Cây · Sơ đồ · … ở DM16; tiêu đề khung ở DM11; ô "hiện mục ẩn" ở DM04…) **bên trái**, nút chức năng dồn **bên phải** | Nút chức năng (Thêm · Nhân bản · Nạp · Xuất · In · Xoá · Thùng rác · Nhập Excel · nút riêng của màn) **bên trái**, phần chọn kiểu xem / lọc **bên phải** |

Sửa ở thanh chung `CatalogToolbar` nên áp cho mọi màn dùng thanh này (kể cả DM10, ACC37, ACC31); DM11, DM16 có thanh riêng sửa cùng kiểu. Phím tắt giữ nguyên.

Tệp: `apps/web/src/components/CatalogToolbar.tsx`, các trang của màn ở mục 2, hướng dẫn liên quan. Chỉ sửa giao diện — không sửa API, không migration, không đụng lõi.

## 4. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Mỗi màn ở mục 2: chọn dòng → Nhân bản → nhập mã mới → Ghi | Có mục mới giống mục gốc ở các ô "điền sẵn", mục gốc không đổi |
| Nhân bản rồi Thoát không ghi | Không có gì thay đổi |
| Chưa chọn dòng | Nút Nhân bản mờ, rê chuột thấy lý do |
| Mọi màn dùng thanh nút chung | Nút chức năng ở bên trái, kiểu xem / lọc ở bên phải |

## 5. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Nhân bản rồi Ghi mà không đổi mã (mã trống) | Báo thiếu mã như form Thêm (KH / NCC: tự cấp mã) |
| 2 | Nhân bản rồi gõ mã đã có | Báo mã đã có (NT-DM-002) |
| 3 | DM09 nhân bản rồi chọn lại đúng TK hạch toán của ngân hàng gốc | Báo TK đã gắn ngân hàng khác (máy chủ) |

## 6. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test | Trên màn hình từng màn; 4 lệnh kiểm |

## 7. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 8. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo và chốt theo lựa chọn của người dùng (mọi màn trừ DM10; đảo nút cho mọi màn; chung nhánh). ACC41A Nhân bản để sau — ClosingPage.tsx thuộc NT-HT-003 |
