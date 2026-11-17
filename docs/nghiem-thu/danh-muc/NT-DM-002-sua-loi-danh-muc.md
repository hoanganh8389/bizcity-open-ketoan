# NT-DM-002 · Sửa lỗi danh mục mức cao, trung bình (đợt kiểm thử 17/11/2026)
<!-- [2026-11-17 07:22 PM kiennt] NGHIEM-THU — tạo phiếu từ kết quả kiểm thử 271 ca các màn danh mục (đóng góp) -->
<!-- [2026-11-17 07:26 PM kiennt] NGHIEM-THU — chốt phạm vi: L01–L03, L06, L07; L04, L05 nằm ở lõi, bỏ qua (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM18, DM08, DM04, DM09, DM05, DM14, ACC1, DM11, ACC43, DM10 |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 17/11/2026 |
| Trạng thái | Đã chốt (kiennt, 17/11/2026) |

## 1. Mục đích quản trị
Danh mục là gốc của mọi chứng từ. Đợt kiểm thử 17/11 (DB trắng, nhập tay toàn bộ, 271 ca) phát hiện các lỗi làm **mất dữ liệu danh mục không báo** (thêm trùng mã ghi đè), **để lại dữ liệu hỏng** (xoá cha còn con, xoá mục đang được dùng) . Phiếu này sửa các lỗi mức Cao và Trung bình ngoài lõi.

## 2. Khai báo trước
Dữ liệu như sheet "Dữ liệu đã tạo" của tệp kiểm thử: TK 156/1561, 911, 4212; thuế R08; ngân hàng TCB; HTTT CK; nhóm KH-LE, NCC-SUA, NCC-SUA-NK; NCC002 ngừng giao dịch; nhóm hàng Sữa bột → Vinamilk → Sữa bột cho bé; mặt hàng 110011001 (thuế R08).

## 3. Các lỗi và cách sửa

| Mã | Mức | Lỗi | Cách sửa | Tệp |
|---|---|---|---|---|
| L01 | Cao | Thêm mới trùng mã **ghi đè** bản ghi cũ (DM18, DM08, DM04, DM09, DM05, DM14) — API các màn này là PUT theo mã (thêm hoặc sửa) | Form **Thêm**: mã đã có trong danh mục thì báo "Mã … đã có: <tên>. Nhập mã khác.", khoá nút Ghi (như DM12, DM13). Không đổi API (đồng bộ ngoài vẫn dùng PUT thêm-hoặc-sửa). | WarehouseTypesPage, PartnersPage (nhóm), DimensionsPage (nhân viên), BankAccountsPage, PaymentMethodsPage, PriceListsPage |
| L02 | Cao | **Xoá được cha khi còn con**: ACC1 (156 còn 1561), DM11 (ngành còn nhãn / nhóm) | Thùng rác danh mục kiểm trước khi xoá: còn dòng con (cùng parent_code, cùng loại) thì bỏ qua dòng đó, báo "còn N mục con (…) — xoá mục con trước". Áp cho tài khoản, nhóm hàng, nhóm đối tượng, danh mục có cây. | apps/api/src/modules/catalog-trash/catalog-trash.ts |
| L03 | Cao | **Xoá được mục đang được dùng** (không có khoá ngoại): thuế R08 đang ở mặt hàng; ngân hàng TCB đang ở HTTT | Cùng chỗ L02: danh sách tham chiếu theo danh mục, có tham chiếu thì bỏ qua, báo "đang được dùng ở <màn>: <mã…> — chỉ ngừng dùng". Tham chiếu: thuế ← mặt hàng (thuế ra / vào); ngân hàng ← HTTT; tài khoản ← thuế, ngân hàng, HTTT, ngầm định, nhóm hạch toán; nhóm hàng ← mặt hàng; nhóm đối tượng ← đối tượng. | catalog-trash.ts |
| L06 | TB | DM08 cho đặt **vòng nhóm cha – con** | API PUT nhóm đối tượng: nhóm cha mới nằm trong nhánh con của chính nó thì từ chối; form bỏ nhóm con khỏi ô Nhóm cha. | partner.routes.ts, PartnersPage |
| L07 | TB | Ô chọn NCC **gợi ý cả NCC đã ngừng giao dịch** (DM05 Đối tượng nhận hộ, DM10 bước Khai báo giá mua) | Truyền activeOnly cho PartnerPicker ở hai chỗ (giá trị đang chọn vẫn hiện). | PaymentMethodsPage; ProductFullForm (**phạm vi PHASE-026 của anh Thủy** — báo trước khi merge) |

**Ngoài phạm vi (lõi Kernel, chờ chủ lõi):** L04 — ACC41A không lưu được thay đổi nào khi hệ thống TK thiếu TK mà bộ kết chuyển mặc định trỏ tới (154, 6324, 51111…), kể cả bỏ "Áp dụng"; L05 — ACC41A báo "đang theo dõi đối tượng" cho TK chỉ là Lưỡng tính. Cả hai ở packages/kernel/src/modules/closing/closing.service.ts; người dùng chốt bỏ qua ở lượt này.

## 4. Số liệu đầu vào
Như mục 2.

## 5. Kết quả mong đợi

| Mục | Mong đợi |
|---|---|
| Thêm loại kho HH (đã có) ở DM18; tương tự DM08 KH-LE, DM04 NV001, DM09 VCB, DM05 TM, DM14 BGCG | Báo "Mã … đã có: <tên>", Ghi khoá; bản ghi cũ giữ nguyên |
| ACC1 xoá 156 (còn 1561) | Không xoá, báo còn TK con 1561 |
| DM11 xoá ngành Sữa bột (còn nhãn Vinamilk) | Không xoá, báo còn nhóm con |
| ACC43 xoá R08 (mặt hàng 110011001 dùng) | Không xoá, báo đang được mặt hàng dùng |
| DM09 xoá TCB (HTTT CK dùng) | Không xoá, báo HTTT CK đang dùng |
| Xoá mục không còn con / không được dùng | Vẫn vào thùng rác như cũ |
| DM08 đặt NCC-SUA thuộc NCC-SUA-NK | Không chọn được / API từ chối |
| DM05, DM10 gõ "NCC" ở ô NCC | Không có NCC002 (ngừng) |

**Bút toán:** không có. **Báo cáo:** không đổi.

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Xoá hàng loạt nhiều dòng, trong đó vài dòng còn con / đang dùng | Xoá các dòng hợp lệ, liệt kê dòng bị bỏ qua kèm lý do |
| 2 | Sửa (không phải thêm) bản ghi đang có | Ghi bình thường, không báo trùng |
| 3 | Đồng bộ từ hệ thống ngoài qua PUT | Giữ hành vi thêm-hoặc-sửa |
| 4 | Thêm mã đã có trong thùng rác | Báo mã đang ở thùng rác — khôi phục hoặc dùng mã khác |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | apps/api/test/nt-dm-002-sua-loi-danh-muc.test.ts |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 17/11/2026 | Tạo phiếu từ tệp kiểm thử Test-case-danh-muc-2026-11-17.xlsx |
| 17/11/2026 | Chốt: sửa L01–L03, L06, L07; L04, L05 (lõi) bỏ qua lượt này |
