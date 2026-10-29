# Kho, mua hàng và giá vốn

Phần này giải thích hàng hoá đi vào sổ kế toán thế nào: mua về, chuyển giữa các kho / cửa hàng, kiểm kê, bán ra, và giá vốn được tính ra sao. Đọc sau *Nguyên tắc và nghiệp vụ mẫu*.

## 1. Vì sao kho quan trọng với kế toán

Bán một hộp sữa luôn có **hai cặp bút toán**: doanh thu (Nợ 131 / Có 511, Có 3331) và **giá vốn** (Nợ 632 / Có 156). Không có giá vốn thì lãi lỗ sai, tồn kho trên sổ sai.

Giá vốn cần biết hộp sữa đó **mua vào bao nhiêu tiền**. Mà một mặt hàng nhập nhiều lần với giá khác nhau, lại chuyển qua nhiều kho, nên phải có quy tắc tính: phần mềm dùng **bình quân gia quyền theo tháng**.

## 2. Các chứng từ kho và định khoản

| Chứng từ (`docType`) | Chuyện xảy ra | Nợ | Có |
|---|---|---|---|
| Nhập mua `purchase` | Hàng về kho, nợ nhà cung cấp | 1561 kho (tiền hàng), 1331 thuế vào | 3312 phải trả NCC |
| Trả NCC `purchase_return` | Trả hàng, giảm nợ | 3312 | 1561, 1331 |
| Chuyển kho `transfer` — nơi xuất | Hàng lên xe | 1579 hàng đang chuyển | 1561 (kho xuất) |
| Chuyển kho `transfer` — nơi nhận | Cửa hàng xác nhận đã nhận | 1561 (kho nhận) | 1579 |
| Điều chỉnh tăng `stock_adjustment` | Kiểm kê thừa | 1561 | 3381 thừa chờ xử lý |
| Điều chỉnh giảm `stock_adjustment` | Kiểm kê thiếu, hàng hỏng | 1381 thiếu chờ xử lý (hoặc TK của lý do) | 1561 |
| Bán `sale` | Hàng ra khỏi kho | 632 giá vốn | 1561 |
| Khách trả `sale_return` | Hàng về lại kho | 1561 | 632 |

| Bán nội bộ `sale` + lý do `XCN` | Bán cho chi nhánh khác theo giá bán | 13681 (doanh thu, thuế); 6326 giá vốn = giá bán | 51116, 33311; 1561 |

Chuyển kho giữa hai chi nhánh **khác đơn vị hạch toán** dùng 13681 (phải thu nội bộ) thay cho 1579, đối tượng là chi nhánh bên kia.

**Hàng đang chuyển (1579)**: số dư = hàng kho đã xuất mà cửa hàng chưa xác nhận nhận. Cuối tháng số dư này phải nhỏ; còn lớn tức là có phiếu bị quên xác nhận.

Mọi chứng từ kho đều ghi thêm vào bảng `inventory_movements` (một dòng mỗi lần hàng vào / ra một chi nhánh, số lượng có dấu). Đây là nguồn của báo cáo nhập xuất tồn và tính giá vốn.

## 3. Giá vốn bình quân tháng

Các chi nhánh cùng **đơn vị hạch toán** (một pháp nhân) dùng chung một đơn giá cho mỗi mặt hàng mỗi tháng:

```
            Giá trị tồn đầu + nhập mua − trả NCC + điều chỉnh tăng + nhận từ đơn vị khác
Đơn giá = ─────────────────────────────────────────────────────────────────────────────
            Số lượng tồn đầu + nhập mua − trả NCC + điều chỉnh tăng + nhận từ đơn vị khác
```

Ví dụ: tháng 9 nhập 10 hộp × 70.000 → tồn 10 hộp = 700.000. Tháng 10 nhập thêm 10 hộp × 76.000:

```
Đơn giá tháng 10 = (700.000 + 760.000) / (10 + 10) = 73.000 / hộp
```

Tháng 10 bán 5 hộp, kiểm kê thiếu 1 → giá vốn 5 × 73.000 = 365.000; thiếu 73.000; tồn cuối 14 hộp = 1.022.000.

**Ghi sổ giá vốn.** Trong tháng, hệ thống bán hàng thường chưa biết giá vốn, nên khi định khoản, mỗi mặt hàng của phiếu bán, hoàn, chuyển kho, điều chỉnh, xuất điều chỉnh có sẵn **cặp dòng giá vốn 0 đồng** ngay trong bút toán của phiếu. Cuối tháng kế toán bấm **Tính giá vốn (ACC49)**: phần mềm tính đơn giá rồi **ghi đè số tiền** lên các dòng đó (tính lại cũng ghi đè, không sinh bút toán ghi số âm — ngoại lệ có chủ đích của nguyên tắc "sổ cái chỉ thêm", chỉ áp cho dòng giá vốn chờ tính, để sổ nhẹ). Phiếu định khoản trước khi có dòng giá vốn sẵn thì vẫn ghi vào **một chứng từ "Giá vốn hàng xuất"** của từng chi nhánh (ngày cuối tháng).

Thứ tự cuối tháng: **khoá nhận chứng từ → tính giá vốn → tính khấu hao, phân bổ → kết chuyển lãi lỗ → khoá sổ.**

## 4. Bảng và code

| Khái niệm | Bảng | Code |
|---|---|---|
| Hàng vào / ra kho | `inventory_movements` | `modules/inventory/inventory-movement.repository.ts` |
| Đơn giá bình quân tháng | `inventory_costs` | `modules/inventory/costing.service.ts` |
| Định khoản nhập mua, trả NCC | `ledger_entries`, `ledger_lines` | `modules/posting/rules/purchase.rule.ts` |
| Định khoản chuyển kho, điều chỉnh | | `modules/posting/rules/stock.rule.ts` |
| Nhập xuất tồn, sổ chi tiết hàng hoá | đọc `inventory_movements` + `inventory_costs` | `modules/inventory/inventory-report.service.ts` |

Hai luật riêng trong công thức:

- Hàng **bán nội bộ theo giá bán** (XCN) bị trừ khỏi cả tử (theo giá bán) và mẫu trước khi chia.
- Hàng **trả nhà cung cấp** định giá theo tồn đầu (5 trường hợp, xem hướng dẫn màn Tính giá vốn); tồn kho trên sổ vẫn giảm theo tiền trên phiếu.

## 5. Tiền giữa các chi nhánh

| Chứng từ | Chuyện xảy ra | Nợ | Có |
|---|---|---|---|
| Chuyển tiền `cash_transfer` — nơi chuyển | Tiền rời quỹ | 11319 tiền đang chuyển | 1111 / 112 |
| Chuyển tiền — nơi nhận | Nơi nhận xác nhận | 1111 / 112 | 11319 |
| Thu hộ `customer_payment` — nơi thu (A) | Khách trả tiền ở A cho hoá đơn của B | Tiền | 33681 (đối tượng B) |
| Thu hộ — chi nhánh có hoá đơn (B) | Công nợ khách ở B giảm | 13681 (đối tượng A) | 1311 (khách) |
| Trả hộ `supplier_payment` — nơi chi (A) | A trả NCC thay cho B | 13681 (đối tượng B) | Tiền |
| Trả hộ — chi nhánh nợ NCC (B) | Công nợ NCC ở B giảm | 3312 (NCC) | 33681 (đối tượng A) |

Cặp 13681 / 33681 theo từng chi nhánh cho biết chi nhánh nào đang giữ tiền, đang nợ chi nhánh nào.

## 6. Còn để mở

- Nguồn gửi phiếu chuyển kho, nhập mua, chuyển tiền, thu chi sang phần mềm kế toán (hệ thống nào, có bước "nơi nhận xác nhận" không).
