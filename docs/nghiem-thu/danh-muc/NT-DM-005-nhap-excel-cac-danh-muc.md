# NT-DM-005 · Nhập Excel cho các màn danh mục còn thiếu (ACC43, DM18, DM08, DM04, DM09, DM05, DM14, ACC41, ACC41A)
<!-- [2026-11-18 10:20 AM kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng: màn danh mục nào cũng phải nhập được từ Excel (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | ACC43 Biểu thuế, DM18 Loại kho, DM08 Nhóm khách hàng / nhà cung cấp, DM04 Nhân viên, DM09 Tài khoản ngân hàng, DM05 Hình thức thanh toán, DM14 Bảng giá (danh sách bảng giá), ACC41 Tài khoản ngầm định, ACC41A Tài khoản kết chuyển; trang Nhập Excel chung |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 18/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Mục đích quản trị
Dựng đơn vị mới bằng cách **Xuất** danh mục ở máy chủ cũ rồi **Nhập Excel** ở máy mới, cho **mọi** màn danh mục (theo thứ tự nhập danh mục). Sau NT-DM-004 còn 9 màn chỉ xuất được, phải gõ tay.

## 2. Cách làm chung (như DM15 — NT-DM-004)

| Mục | Nội dung |
|---|---|
| Nút | Mỗi màn thêm nút **Nhập Excel** trên thanh công cụ (ẩn khi không có quyền ghi); trang Nhập Excel chung có thêm các loại tương ứng |
| Tệp | Tệp **Xuất** của chính màn đó nhập lại được ngay (khứ hồi). Tệp mẫu có đủ các cột, kể cả cột ẩn trên lưới |
| Cột ẩn | Tệp Xuất **chỉ có cột đang hiện**. Muốn chép đủ thông tin thì bật cột ẩn ở nút **Cột** trước khi Xuất. Tệp thiếu cột: mục đã có giữ nguyên giá trị cũ; mục mới lấy mặc định như form (hoặc suy ra — ghi ở từng màn) |
| Khoá dòng | Mã (không phân biệt hoa thường). Đã có → cập nhật; chưa có → thêm mới. Chế độ Thêm mới / Cập nhật / Cả hai |
| Ô trống | Ô chữ trống: đã có = giữ nguyên. Cột tích (tệp Xuất ghi `x` / trống): cột có ô nào được điền thì ô trống = **Không**; cả cột trống = giữ nguyên / mặc định |
| Kiểm tra | Như form của màn: bắt buộc, độ dài, mã trùng trong tệp, mã đang nằm trong Thùng rác, tài khoản / chi nhánh / mã tham chiếu phải có. Dòng lỗi không ghi |
| Ghi | Qua API sẵn có của từng màn (như bấm Ghi trên form) — **không sửa API, không migration, không đụng lõi** |

## 3. Từng màn

| Màn | Cột (tiêu đề tệp Xuất) | Ghi riêng |
|---|---|---|
| **ACC43** Biểu thuế | Mã thuế (*), Tên thuế (*), Thuế suất (nhận `8` / `8%`), Tài khoản, Chiều, Nhóm bảng kê, Hoạt động | **Chiều** (cột ẩn) thiếu với thuế mới: suy theo tài khoản — 133… = Đầu vào, 333… = Đầu ra; không suy được thì báo lỗi. **Nhóm bảng kê** thiếu: theo thuế suất (KCT / 0 / 5 / 8 / 10). Tài khoản phải là TK chi tiết đã có ở ACC1. Thêm mới: POST, sửa: PATCH |
| **DM18** Loại kho | Mã (*), Tên loại kho (*), Công dụng, Tài khoản hạch toán | Mã chữ in hoa / số 2–12 ký tự. Tài khoản (nếu có) phải có ở ACC1. Loại mới: bán được, hàng của mình, theo dõi hạn dùng như form; loại đã có giữ nguyên các công tắc này. Cột Số kho bỏ qua |
| **DM08** Nhóm KH / NCC | Mã nhóm KH (*), Tên nhóm KH (*), Ghi chú, Nhóm cha, Dùng cho (Mọi loại / Khách hàng / Nhà cung cấp / Nhân viên / Nội bộ / Khác), Hoạt động | Nhóm cha phải có sẵn hoặc có trong tệp (ghi nhóm cha trước); chặn vòng cha như form (NT-DM-002). Cột Số đối tượng bỏ qua |
| **DM04** Nhân viên | Mã NV (*), Tên NV (*), Chức vụ, Email, Chi nhánh làm việc, Di động, Địa chỉ, Theo dõi, Nhóm NV, Ghi chú, Mã phòng ban | Chi nhánh phải có (DM16), mã phòng ban phải có. Các thông tin khác của nhân viên không có trong tệp giữ nguyên |
| **DM09** TK ngân hàng | Mã ngân hàng (*), Tên ngân hàng (*), Số TK, Tài khoản hạch toán (*), Ghi chú, Hoạt động; cột ẩn: Địa chỉ, Điện thoại, Chủ TK, Người liên lạc, Chi nhánh ngân hàng, Chi nhánh dùng, Tiền tệ | Tài khoản hạch toán phải là TK chi tiết ở ACC1 (112…); mỗi tài khoản kế toán chỉ gắn một tài khoản ngân hàng (như máy chủ — báo ngay ở bước Kiểm tra). Tiền tệ trống = VND. Cột Tên tài khoản hạch toán bỏ qua |
| **DM05** Hình thức thanh toán | Mã (*), Tên (*), Tài khoản hạch toán (*), Tài khoản ngân hàng, Đối tượng nhận hộ, Ghi công nợ, Hoạt động, Thứ tự (ẩn) | Tài khoản ngân hàng phải có ở DM09; đối tượng nhận hộ phải có (đang dùng). Cột "HTTT qua ngân hàng" bỏ qua (tự tính) |
| **DM14** Bảng giá (danh sách) | Mã bảng giá (*), Tên bảng giá (*), Bảng giá công ty, Chi nhánh áp dụng, Ghi chú, Đang dùng | Chi nhánh áp dụng: lấy các mã chi nhánh trước dấu cách, cách nhau dấu phẩy; mục "(chưa gán)" bỏ qua. Chi nhánh phải có (DM16); chi nhánh đang ở bảng giá khác thì chuyển sang như form. Cột Số ô giá bỏ qua. Giá từng mặt hàng vẫn nhập ở lưới giá (NT-DM-003) |
| **ACC41** Tài khoản ngầm định | Loại, TK Nợ, TK Có (tệp Xuất chế độ Gọn) | Không thêm / xoá dòng — chỉ đặt **tài khoản ngầm định sửa được** (như hộp Sửa của dòng). Ghép dòng theo cột Loại. TK lấy theo hình thức thanh toán / loại kho / thuế… (nguồn khác) không đổi ở đây — sửa ở màn nguồn. Một bên có từ 2 ô sửa được: ghi các tài khoản theo thứ tự như tệp Xuất (số tài khoản bằng số ô); ghi một tài khoản thì đặt cho mọi ô của bên đó; khác thì báo lỗi. Một ô ngầm định dùng ở nhiều dòng mà tệp ghi khác nhau thì báo lỗi. Tài khoản phải là TK chi tiết, đúng khoảng cho phép của ô |
| **ACC41A** Tài khoản kết chuyển | Thứ tự kết chuyển (*), Kết chuyển từ (*), Kết chuyển đến (*), Bên kết chuyển (Nợ / Có / Hai bên), Diễn giải, Kết chuyển số dư cuối (ẩn), Trạng thái (Đang sử dụng / Ngừng sử dụng) | Khoá dòng = cặp "từ → đến" (cột Mã kết chuyển). Bước có trong tệp: cập nhật / thêm; bước không có trong tệp giữ nguyên. Cả bộ ghi một lần (ghi chú phiên bản "Nhập Excel"). **Còn lỗi L04** (lõi, chưa sửa): bộ kết chuyển trỏ tới TK chưa có ở ACC1 thì không lưu được — trình nhập báo đúng câu lỗi của máy chủ, không ghi gì. Cột Loại kết chuyển bỏ qua |

Tệp: `apps/web/src/lib/nhapExcelDanhMuc.ts` (tệp mới, chưa tách — đề xuất; các loại nhập), `apps/web/src/lib/nhapExcel.ts` (đăng ký), các trang của 9 màn (nút), `docs/huong-dan/` của các màn + `nhap-excel.md`.

## 4. Số liệu đầu vào
Dữ liệu nhập tay trên DB trắng như đợt kiểm thử lần 3 (`~/Documents/kiem-thu-danh-muc/lan-3`).

## 5. Kết quả mong đợi (mỗi màn)

| Mục | Mong đợi |
|---|---|
| Nhập lại nguyên tệp Xuất | 0 lỗi, 0 thêm mới; xuất lại không đổi ô nào |
| Sửa 1–2 ô + thêm 1 dòng rồi nhập | Chỉ đổi đúng các ô đó; dòng mới đúng mọi cột |
| Xoá hết (hoặc DB khác) rồi nhập tệp Xuất | Tạo lại đủ, đúng; xuất lại khớp tệp gốc (trừ cột tự tính / người sửa / ngày sửa) |
| Tệp có dòng sai (thiếu bắt buộc, mã tham chiếu không có, giá trị lạ) | Báo từng dòng, không ghi dòng đó |
| ACC41: đổi một TK Có trong tệp rồi nhập | Ô ngầm định tương ứng đổi; các dòng khác dùng chung ô đó cũng đổi theo |
| ACC41A: ACC1 đủ TK, đổi Diễn giải một bước rồi nhập | Lưu thành phiên bản mới, chỉ bước đó đổi |

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Tệp ACC43 không có cột Chiều, thuế mới TK 5111 | Báo không suy được chiều — ghi cột Chiều |
| 2 | DM08 nhóm A cha B, nhóm B cha A trong cùng tệp | Báo vòng nhóm cha |
| 3 | DM05 Tài khoản ngân hàng không có ở DM09 | Báo dòng lỗi |
| 4 | DM14 hai bảng giá cùng ghi chi nhánh OC02 | Báo trùng chi nhánh trong tệp |
| 5 | ACC41 dòng "Loại" không có trên màn | Báo dòng không khớp loại nào |
| 6 | ACC41A thiếu TK 154 ở ACC1 | Báo lỗi của máy chủ (L04), không ghi |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 18/11/2026 |
| Bản code (commit) | nhánh `feat/nt-dm-004-nhap-excel-dvt` (một commit mỗi màn) |
| Test trên màn hình | **44/44 ĐẠT** — DB tạm (bản sao DB thật: 592 tài khoản, 1 chi nhánh), API riêng, web dev nhánh này. 7 màn danh sách, mỗi màn 5 ca: nạp tệp vào màn trống (như máy mới) → Xuất đối chiếu → nhập lại nguyên tệp xuất (0 thêm mới, xuất lại không đổi) → sửa 1 ô + thêm 1 dòng (đổi đúng 2 chỗ) → tệp dòng sai (báo đủ, không ghi). ACC43: thuế đầu vào không có cột Chiều suy đúng Đầu vào; KCT suy đúng nhóm bảng kê. DM08: nhóm con đứng trước nhóm cha trong tệp vẫn ghi đúng; chặn vòng cha. ACC41 (4 ca): nhập lại nguyên tệp; đặt TK cho Doanh thu, Giá vốn (2 ô ngầm định bên Nợ) — ô dùng chung đổi theo ở loại khác; loại lạ / TK lạ / TK ngoài khoảng / TK lấy từ màn khác báo lỗi. ACC41A (5 ca): nhập lại nguyên tệp; sửa diễn giải, ngừng 1 bước, thêm bước 6321 → 911 (lưu phiên bản mới, đổi đúng 3 chỗ); dòng sai; bước trỏ TK chưa có báo lỗi L04, không ghi |
| selfcheck | Không có lỗi mới so với main |
| kiem-chuan | ĐẠT |
| typecheck | ĐẠT |
| npm test | 2270 đạt / 5 lỗi — không do phiếu này (chỉ sửa web), cùng 5 test như NT-DM-004: db-rules, mat-khau-mac-dinh, nt-bh-005 lỗi sẵn trên main; nt-bh-003, nt-bh-012 đạt khi chạy riêng |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo và chốt; người dùng chọn: cả 9 màn, một PR (chung nhánh NT-DM-004), mỗi màn một commit |
| 18/11/2026 | Khi test: ACC41 ghép nhiều ô ngầm định theo thứ tự tệp Xuất (trước: báo sửa trên form — tệp xuất không nạp lại được); DM09 kiểm một TK kế toán – một TK ngân hàng ngay ở bước Kiểm tra. Code xong, chuyển Chờ nghiệm thu |
