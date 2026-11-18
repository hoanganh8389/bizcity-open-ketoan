# NT-DM-007 · Cơ cấu tổ chức (DM16): nhập Excel bằng trình nhập chung; tệp Xuất nhập lại được
<!-- [2026-11-18 01:45 PM kiennt] NGHIEM-THU — tạo phiếu theo báo lỗi của người dùng: DM16 nhập Excel khác các màn khác và không nhập được tệp xuất (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM16 Cơ cấu tổ chức; trang Nhập Excel chung |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 18/11/2026 |
| Trạng thái | Đã chốt (kiennt, 18/11/2026) |

## 1. Hiện trạng và lỗi
- DM16 dùng trình nhập riêng (một hộp chọn tệp 4 sheet), **khác** mọi màn danh mục khác (trình nhập chung 4 bước: chọn tệp → ghép cột → kiểm tra → kết quả; có tệp mẫu, tệp lỗi).
- Trình nhập riêng gặp **một dòng lỗi là không ghi gì** cả tệp.
- Tệp **Xuất** của DM16 không nhập lại được: phòng ban riêng của từng cửa hàng (vd `BH0089`) không hiện thành dòng trên cây nên **không được xuất** ở sheet *Phòng ban*, trong khi cột *Phòng ban* của sheet *Cửa hàng* trỏ tới chúng. Tệp thật của người dùng (`co-cau-to-chuc.xlsx`: 53 cơ cấu, 763 cửa hàng, 863 kho, 69 phòng ban): cả 763 cửa hàng báo "Không có phòng ban …" → không nhập được gì. Máy chủ cũng bắt buộc phòng ban có sẵn khi gắn cho cửa hàng.

## 2. Cách làm

| Mục | Nội dung |
|---|---|
| Xuất | Sheet *Phòng ban* xuất **mọi** phòng ban, kể cả phòng ban riêng của cửa hàng. Các sheet khác giữ nguyên cột (tệp cũ vẫn dùng được) |
| Nút Nhập Excel | Thành **Nhập Excel ▾** chọn một trong 4 loại: **Cơ cấu**, **Phòng ban**, **Cửa hàng**, **Kho** — mỗi loại mở trình nhập chung như các màn khác. Ghi rõ thứ tự nên nhập: Cơ cấu → Phòng ban → Cửa hàng → Kho |
| Sheet | Tệp 4 sheet từ nút Xuất dùng thẳng: trình nhập **tự chọn sheet trùng tên loại** (Cơ cấu / Phòng ban / Cửa hàng / Kho), vẫn đổi được |
| Luật chung | Như NT-DM-005: khoá theo mã; đã có → cập nhật, chưa có → thêm; ô trống giữ nguyên; cột *Theo dõi* (x / trống) theo tệp Xuất; dòng lỗi bỏ qua, dòng đúng vẫn ghi; tải tệp lỗi |
| Cơ cấu | Loại (Công ty / Cơ cấu), Mã, Tên, Thuộc (mã), MST (10 số hoặc 10 số-3 số), Mô tả, Theo dõi. Cơ cấu cha có sẵn hoặc trong tệp — ghi cha trước con |
| Phòng ban | Mã, Tên, Thuộc cơ cấu (mã), Ghi chú, Theo dõi. Cơ cấu phải có sẵn |
| Cửa hàng | Mã, Tên, Thuộc cơ cấu (mã), MST, Phòng ban, Tên công ty in, Địa chỉ, Điện thoại, Ghi chú, Theo dõi. Cơ cấu phải có sẵn. **Phòng ban chưa có: tự tạo phòng ban đó** (tên = "Phòng ban " + tên cửa hàng, thuộc cùng cơ cấu) rồi gắn — để tệp xuất từ máy cũ (thiếu phòng ban riêng) vẫn nạp được |
| Kho | Mã kho (≤ 12 ký tự), Tên kho, Cửa hàng (mã), Loại kho, Kho mặc định, Địa chỉ, Ghi chú, Theo dõi. Cửa hàng, loại kho phải có sẵn |
| Ghi | Qua API sẵn có như form DM16 (org-units, dimensions/department, branches, warehouses) — không sửa API, không migration, không đụng lõi |
| Bỏ | Trình nhập riêng 4 sheet (`NhapCoCau`) |

Tệp: `apps/web/src/lib/nhapExcelDanhMuc.ts` (4 loại nhập), `apps/web/src/components/NhapExcelWizard.tsx` (tự chọn sheet theo loại — thêm trường `sheet` cho NhapLoai ở `apps/web/src/lib/nhapExcel.ts`), `apps/web/src/features/catalog/CoCauExcel.tsx` (xuất phòng ban; bỏ NhapCoCau), `apps/web/src/features/catalog/CoCauToChucPage.tsx` (nút), `docs/huong-dan/so-do-to-chuc.md`, `docs/huong-dan/nhap-excel.md`.

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Tệp `co-cau-to-chuc.xlsx` của người dùng, nhập lần lượt Cơ cấu → Phòng ban → Cửa hàng → Kho vào DB trắng | 53 cơ cấu, 69 phòng ban (+ phòng ban riêng tự tạo), 763 cửa hàng, 863 kho; số lỗi = 0 |
| Xuất DM16 → nhập lại nguyên tệp (4 loại) | 0 thêm mới, không ô nào đổi |
| Xuất DM16 ở máy A → nhập vào máy B trắng | Đủ, đúng; phòng ban riêng của cửa hàng đúng tên như máy A |
| Sửa 1 ô + thêm 1 dòng mỗi sheet → nhập | Chỉ đổi đúng chỗ đó |
| Dòng sai (cơ cấu cha không có, cửa hàng của kho không có, loại kho lạ, MST sai) | Báo từng dòng; dòng khác vẫn ghi |

## 4. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Nhập Cửa hàng trước Cơ cấu | Dòng có "Thuộc cơ cấu" chưa có báo lỗi — nhập Cơ cấu trước |
| 2 | Chọn loại Kho nhưng sheet Cửa hàng | Ghép cột thiếu "Mã kho" — báo như trình nhập chung |
| 3 | Hai cơ cấu là cha của nhau trong tệp | Báo vòng cơ cấu cha |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test | Trên màn hình (tệp thật của người dùng + khứ hồi); 4 lệnh kiểm |

## 6. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo và chốt — người dùng chọn: trình nhập chung; phòng ban của cửa hàng chưa có thì tự tạo |
