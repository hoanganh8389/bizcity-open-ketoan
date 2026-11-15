# 24. Quy tắc hạch toán

<!-- [2026-11-15 Nguyễn Văn Thủy] Chuẩn hạch toán tự động: ba tầng, năm nguồn tài khoản, khung bất biến, phạm vi được đổi (đóng góp) -->

Tài liệu chuẩn cho người làm phần mềm và người quản trị cấu hình. Trả lời ba câu: **chứng từ đi vào sổ thế nào**, **tài khoản lấy từ đâu**, **được đổi gì và không được đổi gì**.

Thay cho: Tài khoản ngầm định theo loại chứng từ (bảng 0126), bảng quy tắc định khoản có điều kiện (0096), tài khoản trên lý do và công tắc lý do, tài khoản theo mặt hàng / nhóm hạch toán ([18](18-bo-ly-do-loai-nghiep-vu.md), [15](15-quy-tac-dinh-khoan.md) là tài liệu cũ).

## 1. Ba tầng

```
NGUỒN (bán hàng, kho, mua hàng)  →  CỔNG NHẬN CHỨNG TỪ             →  SỔ KẾ TOÁN
làm giá, khuyến mại tự do           POST /api/v1/documents             bút toán từng dòng mã hàng
chỉ gửi sự việc,                    kiểm khuôn, chống trùng            (chi nhánh, kho, đối tượng, mặt hàng)
không gửi tài khoản                 tra QUY TẮC HẠCH TOÁN              giá vốn ghi khi tính giá vốn tháng
                                    lỗi → hàng chờ ACC14, không mất
```

- **Nguồn** chỉ biết nghiệp vụ của mình: bán gì, bao nhiêu, thuế, thu bằng gì, hàng chính hay hàng tặng, kho nào, mục đích xuất. Khuôn gửi: [docs/api](../api/README.md).
- **Cổng** là chỗ duy nhất biến chứng từ thành bút toán. Không hệ thống nào khác tự tính tài khoản.
- **Sổ** lưu từng dòng mã hàng; bảng gộp theo tài khoản (0134) để xem gọn. Giá vốn bình quân tháng tính sau, theo mã và chi nhánh cấp 2 ([11](11-hang-hoa-gia-von-tu-goc.md)).

## 2. Năm nguồn tài khoản

Mỗi chân bút toán lấy tài khoản từ **đúng một** nguồn. Mỗi nguồn khai **một nơi**.

| Nguồn | Quyết định | Khai ở |
|---|---|---|
| **Tài khoản của quy tắc** | Doanh thu, hàng bán trả lại, giá vốn, giá vốn hàng tặng, phải thu, phải trả, hàng đang chuyển, nội bộ, thừa / thiếu chờ xử lý; tài khoản dự phòng của các nguồn dưới | Quy tắc hạch toán (ACC41) |
| **Hình thức thanh toán** | Tài khoản tiền / công nợ của khoản thu, chi; thu hộ gắn đối tượng | Hình thức thanh toán (DM05), Tài khoản ngân hàng (DM09) |
| **Loại kho** (qua phân kho trên dòng) | Tài khoản kho; loại không sở hữu (giữ hộ) không tính giá vốn | Loại kho (DM18) |
| **Loại thuế** (qua dòng hàng, thuế suất theo mã hàng có ngày hiệu lực) | Tài khoản thuế | Loại thuế (ACC43) |
| **Mục đích xuất** | Tài khoản đối ứng của phiếu xuất kho không bán / nhập kho khác | Quy tắc hạch toán (ACC41), mục Mục đích xuất |

Thứ tự khi trùng: mục đích xuất → hình thức thanh toán / loại kho / loại thuế → tài khoản của quy tắc. Trên phiếu nghiệp vụ (mua, bán, kho, chuyển kho) không có ô chọn tài khoản: tài khoản chỉ quyết định ở màn Quy tắc hạch toán. Chỉ chứng từ kế toán tự lập (phiếu thu, phiếu chi, phiếu kế toán, đề nghị chi) mới chọn tài khoản trên phiếu.

**Không còn** tài khoản theo từng mặt hàng. Đổi thuế suất hàng loạt (theo nhóm hàng, có ngày hiệu lực) không đụng quy tắc, vì tài khoản thuế nằm ở loại thuế.

## 3. Khung Nợ / Có (bất biến)

Khung nằm trong code (`packages/kernel/src/modules/posting/rules/*.rule.ts`), mô tả ở `scheme.ts`. Đổi khung là đổi code, có test.

| Nghiệp vụ (`docType`) | Nợ | Có |
|---|---|---|
| Bán hàng `sale` | Phải thu khách (tổng) | Doanh thu (tiền hàng) · Thuế đầu ra (tiền thuế) |
| ↳ thu tiền ngay (mỗi khoản một phiếu thu) | Tiền theo hình thức | Phải thu khách |
| ↳ giá vốn (theo kho xuất) | Giá vốn · hàng tặng: giá vốn hàng tặng kèm | Kho theo loại kho |
| Hàng bán trả lại `sale_return` | Hàng bán bị trả lại · Thuế đầu ra | Phải thu khách |
| ↳ trả tiền khách | Phải thu khách | Tiền theo hình thức |
| ↳ hàng về kho | Kho theo loại kho | Giá vốn |
| Mua hàng `purchase` | Kho theo loại kho · Thuế đầu vào | Phải trả NCC |
| ↳ trả tiền ngay | Phải trả NCC | Tiền theo hình thức |
| Trả hàng NCC `purchase_return` | Phải trả NCC | Kho theo loại kho · Thuế đầu vào |
| Thu tiền khách `customer_payment` | Tiền theo hình thức | Phải thu khách (`direction: out` thì ngược lại) |
| Trả tiền NCC `supplier_payment` | Phải trả NCC | Tiền theo hình thức |
| Chuyển kho `transfer` | Nơi xuất: hàng đang chuyển / phải thu nội bộ · Nơi nhận: kho | Nơi xuất: kho · Nơi nhận: hàng đang chuyển / phải thu nội bộ |
| Xuất kho không bán `stock_adjustment` giảm | Mục đích xuất (không có: thiếu chờ xử lý) | Kho theo loại kho |
| Nhập kho khác `stock_adjustment` tăng | Kho theo loại kho | Mục đích xuất (không có: thừa chờ xử lý) |
| Chuyển tiền `cash_transfer` | Nơi chuyển: tiền đang chuyển / phải thu nội bộ · Nơi nhận: tiền | Nơi chuyển: tiền · Nơi nhận: tiền đang chuyển / phải trả nội bộ |

Hàng đang chuyển dùng khi hai chi nhánh **cùng** đơn vị hạch toán; khác đơn vị thì qua phải thu / phải trả nội bộ.

Ngoài cổng (lập trong phần mềm kế toán): phiếu thu chi khác, phiếu kế toán (khấu hao, phân bổ, lương, thuế, kết chuyển) — mẫu định khoản cố định trong code (`loaiPhieu.ts`), người lập chọn tài khoản trong lọc.

## 4. Được đổi và không được đổi

| Không đổi (khoá trong code) | Đổi được (màn ACC41, có kiểm) |
|---|---|
| Khung Nợ / Có của từng nghiệp vụ | Tài khoản của quy tắc — chỉ tài khoản chi tiết, trong phạm vi đầu số của khoá |
| Nợ = Có; chỉ ghi tài khoản chi tiết; kỳ khoá không ghi | Mục đích xuất: thêm, sửa tên / tài khoản (trong phạm vi), ngừng dùng |
| Sổ chỉ thêm: sửa = phiên bản mới (ghi số âm cũ + mới), huỷ = ghi số âm | Hình thức thanh toán, loại kho, loại thuế: ở danh mục của nó |
| Dòng có hàng mang mặt hàng, chi nhánh, kho, đối tượng | |
| Lý do trên chứng từ không đổi tài khoản (chỉ là nhãn để lọc báo cáo) | |

Phạm vi đầu số của từng khoá:

| Khoá | Tài khoản của | Phạm vi |
|---|---|---|
| `receivable` | Phải thu khách hàng | 131 |
| `payable` | Phải trả nhà cung cấp | 331 |
| `revenue` | Doanh thu bán hàng | 511 |
| `sales_return` | Hàng bán bị trả lại | 521 |
| `cogs` | Giá vốn hàng bán | 632 |
| `gift_cogs` | Giá vốn hàng tặng kèm | 632, 641, 642 |
| `inventory` | Kho (dự phòng khi loại kho chưa khai) | 15 |
| `tax_output` | Thuế đầu ra (dự phòng) | 3331 |
| `tax_input` | Thuế đầu vào (dự phòng) | 133 |
| `goods_in_transit` | Hàng đang chuyển | 15 |
| `internal_receivable_goods` | Phải thu nội bộ hàng | 136, 138 |
| `internal_receivable` / `internal_payable` | Phải thu / phải trả nội bộ tiền | 136, 138 / 336, 338 |
| `cash_in_transit` | Tiền đang chuyển | 113 |
| `stock_surplus` / `stock_shortage` | Thừa / thiếu chờ xử lý | 338, 711 / 138, 632, 811 |
| `promotion_expense` | Chi phí hàng khuyến mại (màn mua hàng) | 641, 642 |

Mục đích xuất chọn trong: 138, 15, 211, 241, 242, 334, 338, 353, 632, 641, 642, 711, 811.

## 5. Đổi tài khoản thì sao

- Chứng từ ghi sổ **từ lúc đổi** (kể cả định khoản lại) theo tài khoản mới. Bút toán đã ghi không tự đổi.
- Muốn chứng từ cũ theo tài khoản mới: định khoản lại ở ACC14 (ghi số âm bút toán cũ, ghi bút toán mới; kỳ khoá không làm được).
- Mọi lần đổi ghi nhật ký (ai, lúc nào, từ tài khoản nào sang tài khoản nào).

## 6. Kiểm tra trước khi đổi

Màn ACC41 có **Xem thử bút toán**: chọn chi nhánh, mã hàng, tiền, thuế, hình thức thanh toán / mục đích → thấy bút toán sẽ ghi, có kiểm Nợ = Có. Hệ thống nguồn dùng API tương ứng: `POST /api/v1/posting/scheme/preview` ([api/17](../api/17-quy-tac-hach-toan.md)).

## 7. Mở rộng về sau

- **Nghiệp vụ mới** (ví dụ bán sàn thương mại điện tử): thêm `docType` ở khuôn chứng từ, viết luật trong `rules/`, thêm mô tả vào `scheme.ts`, thêm khoá tài khoản (có phạm vi) nếu cần. Màn ACC41 và API đọc quy tắc tự hiện.
- **Tách doanh thu theo ngành hàng** (nếu thật cần): thêm một nguồn "nhóm hàng" có phạm vi, không quay lại khai theo từng mã.
- **Phân bổ chi phí mua / thưởng nhãn hàng**: phiếu chi phí (tăng giá vốn) và phiếu thưởng (giảm giá vốn) ở phân hệ Mua hàng, ghi theo mã hàng, đi vào công thức giá vốn tháng.
