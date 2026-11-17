# NT-DM-003 · Xuất Excel dùng được để nhập lại (danh mục) + nhập giá bán từ Excel
<!-- [2026-11-17 09:10 PM kiennt] NGHIEM-THU — tạo phiếu từ đợt kiểm thử lần 2 (17/11/2026, khứ hồi xuất → nhập Excel); chốt cùng người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | Mọi màn có lưới (DataGrid); DM10, DM14 |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 17/11/2026 |
| Trạng thái | Đã chốt (kiennt, 17/11/2026) |

## 1. Mục đích quản trị
Tệp **Xuất** của một danh mục phải dùng được ngay để **Nhập** lại (sửa hàng loạt trên Excel rồi nạp vào), và dữ liệu nạp vào phải đúng như khai trên form. Đợt kiểm thử lần 2 cho thấy DM10 xuất ra không nhập lại được và nhập Excel tạo mặt hàng thiếu thuế suất.

## 2. Khai báo trước
Như tệp kiểm thử lần 2 (~/Documents/kiem-thu-danh-muc/lan-2): nhóm hàng 3 cấp, mặt hàng 110011001, 120422001, bảng giá BGCTY, BGCG.

## 3. Các lỗi và cách sửa

| Mã | Mức | Lỗi | Cách sửa | Tệp |
|---|---|---|---|---|
| E1 | Cao | Tệp xuất lấy **câu giải thích (tooltip) của cột** làm tiêu đề thay cho tên cột (vd "Thuế GTGT (%)" → "Thuế suất GTGT bán ra"; "Trạng thái" → "Đang hoạt động · Chờ duyệt…") — trình nhập không ghép được cột | Tiêu đề xuất = tên cột hiện trên lưới; tooltip chỉ dùng khi tên cột không phải chữ | apps/web/src/components/DataGrid.tsx |
| E2 | Cao | DM10 xuất cột Nhóm hàng dạng đường dẫn "Sữa bột / Vinamilk / Sữa bột trẻ em" → nhập lại báo "chưa có" mọi dòng | Trình nhập mặt hàng nhận thêm đường dẫn nhóm (tên các cấp cách " / "); nhận "Thuế GTGT (%)" và giá trị "8%"; nhận trạng thái "Chờ duyệt" (= đang hoạt động, còn nháp) | apps/api/src/modules/catalog/catalog-import.ts (**phạm vi PHASE-026**); apps/web/src/lib/nhapExcel.ts |
| E3 | Cao | Mặt hàng tạo qua Nhập Excel **không có thuế suất** mà vẫn Đang hoạt động (form bắt buộc) | Mặt hàng **mới** phải có Thuế suất GTGT (hoặc mã VAT ra), thiếu thì dòng không hợp lệ. Giá bán: nhập ở màn Bảng giá (dòng mới bên dưới) | catalog-import.ts (**PHASE-026**) |
| E3b | — | DM14 chưa nhập được giá từ Excel | Lưới giá của từng bảng giá thêm **Nhập Excel**: nhận đúng tệp "Xuất Excel" của lưới (Mã hàng, ĐVT, Đơn giá); xem trước số ô thêm / đổi / bỏ giá, dòng lỗi (mã hàng / ĐVT không có); Ghi qua PUT /price-lists/:code/prices như nút Ghi giá | apps/web/src/features/catalog/PriceRowsPanel.tsx |
| E4 | Thấp | DM10 đang bật Sửa thuế GTGT thì tệp xuất có thêm cột "Tích chọn" | Cột không xuất (thuộc tính noExport của cột) | DataGrid.tsx; ProductsPage.tsx (**PHASE-026**) |

## 4. Số liệu đầu vào
Tệp xuất của DM10, DM14 (BGCTY) ở mục 2.

## 5. Kết quả mong đợi

| Mục | Mong đợi |
|---|---|
| Xuất DM10, DM18, ACC41A… | Tiêu đề cột = tên cột trên lưới |
| Nhập lại nguyên tệp xuất DM10 | 0 dòng lỗi; xuất lại không đổi ô nào |
| Sửa tệp DM10 thêm mặt hàng mới (thuế 10%) | Mặt hàng mới đúng nhóm, ĐVT, thuế 10% |
| Dòng mặt hàng mới không có thuế suất | Không hợp lệ: "Mặt hàng mới phải có Thuế suất GTGT" |
| DM14 BGCTY: Xuất Excel → sửa giá 1 ô, thêm giá cho ô còn trống → Nhập Excel | Xem trước đúng số ô; ghi xong lưới giá đúng; xuất lại chỉ đổi đúng các ô đó |
| Nhập giá có mã hàng / ĐVT không có trong bảng | Báo dòng lỗi, không ghi dòng đó |
| DM10 bật Sửa thuế GTGT → Xuất | Không có cột "Tích chọn" |

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Đường dẫn nhóm sai một cấp | Báo nhóm chưa có |
| 2 | Hai nhóm cấp 3 trùng tên ở hai nhánh, tệp chỉ ghi tên | Báo không rõ nhóm (ghi đường dẫn hoặc mã) |
| 3 | Ô Đơn giá trống trong tệp giá | Bỏ giá ô đó chỉ khi cột Đơn giá có trong tệp và người dùng chọn; mặc định bỏ qua ô trống |
| 4 | Tệp cũ (không qua nút Xuất) có cột "Thuế suất GTGT (%)" | Vẫn ghép như trước |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | apps/api/test/nt-dm-003-nhap-xuat-excel.test.ts |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 17/11/2026 | Tạo và chốt: E1–E4; giá bán nhập ở DM14 (người dùng chọn chỉ bắt buộc thuế suất ở nhập mặt hàng) |
