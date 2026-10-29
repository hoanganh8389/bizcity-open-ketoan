# Luồng bán hàng sang kế toán

Bài này để cả team (kế toán và lập trình) cùng một cách hiểu: chứng từ ở cửa hàng sang phần mềm kế toán đi qua những bước nào, phiếu nào định khoản ra sao, dữ liệu lưu ở đâu, kế toán cấu hình và xem ở màn nào.

Ưu tiên của đợt này: **phần hàng hoá** (doanh thu, giá vốn, nhập xuất tồn theo mặt hàng) phải đúng và đủ trước, các phần khác làm sau.

## 1. Sơ đồ tổng

```
Cửa hàng (máy bán hàng)
  │  bán, trả hàng, thu chi, chuyển kho, kiểm kê
  │  mỗi chứng từ: mã chi nhánh, lý do, mặt hàng, số lượng, tiền hàng, thuế, giá vốn (nếu có), hình thức thanh toán
  ▼
Nhận chứng từ  (API POST /api/v1/documents)
  │  lưu nguyên bản theo phiên bản (accounting_events); sửa ở cửa hàng = phiên bản mới, sổ ghi đảo rồi ghi lại
  ▼
Bộ định khoản
  │  tra tài khoản: lý do → nhóm hạch toán của mặt hàng → loại thuế → hình thức thanh toán → tài khoản ngầm định
  │  gắn chiều: bộ phận = bộ phận của chi nhánh; khoản mục = khoản mục của lý do
  │  thiếu cấu hình → chứng từ "lỗi", không ghi bừa; sửa cấu hình rồi ghi lại
  ▼
Sổ cái  (ledger_entries, ledger_lines)
  │  một sổ nhật ký chung; chứng từ chờ định khoản ở ACC14, kế toán định khoản theo lô
  │  đồng thời: sales_lines (báo cáo bán hàng), inventory_movements (kho), debt_items (công nợ), tax_invoices (bảng kê)
  ▼
Cuối tháng: tính giá vốn bình quân → khấu hao → kết chuyển → khoá sổ
  ▼
Báo cáo: doanh thu, giá vốn từng mặt hàng; nhập xuất tồn; công nợ; lãi lỗ theo cửa hàng, theo khoản mục
```

## 2. Ba thứ quyết định tài khoản

### 2.1. Lý do (ACC18)

Mỗi chứng từ mang một **lý do** (XBA xuất bán tại cửa hàng, NTH1 nhập trả hàng bán, XCN xuất bán chi nhánh khác…). Chứng từ không ghi lý do thì dùng lý do mặc định của loại chứng từ (cờ `default`). Lý do có:

| Trường | Dùng làm gì |
|---|---|
| TK đối ứng | Tài khoản công nợ / tiền / nội bộ của nghiệp vụ (1311, 3312, 13681…) |
| TK doanh thu | Có thì **thay** tài khoản doanh thu (hoặc hàng trả lại) của mặt hàng |
| TK chi phí | Có thì **thay** tài khoản giá vốn của mặt hàng (xuất dùng, xuất huỷ, tặng → chi phí) |
| Khoản mục | Gắn vào mọi dòng của bút toán theo lý do đó |
| Cờ | `default` (lý do mặc định của loại chứng từ), `costAtSalePrice` (giá vốn = giá bán, bán nội bộ), `giftCostToPromotion` (hàng tặng vào chi phí khuyến mại), `postToLedger` |

Mỗi công ty cấu hình tài khoản theo lý do khác nhau, nên khi làm một nghiệp vụ mới của cửa hàng: **xem lý do trước**.

### 2.2. Nhóm hạch toán của mặt hàng (ACC17)

Mỗi mặt hàng thuộc một bộ tài khoản: **kho, giá vốn, doanh thu, chiết khấu, hàng bán trả lại**, kèm loại thuế ra / vào. Thực tế chỉ có khoảng 20 bộ; phần lớn mặt hàng dùng bộ hàng hoá thường (1561 – 6321 – 51111 – 52111 – 52131), hàng khuyến mại dùng bộ riêng (1561 – 6323 – 51113 – 52113 – 52133), công cụ dụng cụ dùng 1531 – 64138.

Mặt hàng chưa có trong danh mục mặt hàng của phần mềm: bộ định khoản đọc bộ tài khoản, loại thuế từ **tệp dữ liệu gốc** (`apps/api/seeds/mat-hang-tai-khoan.jsonl`); không có ở đó thì dùng nhóm mặc định.

### 2.3. Hình thức thanh toán (DM05)

Mỗi hình thức trỏ tới một tài khoản tiền: TM → 1111, CK → 112 chi tiết, Voucher → 3387. QR và quẹt thẻ vào tài khoản công ty (QR, POS, mã đuôi -CT) → **13681 chi tiết đối tượng NC600000** (công ty nhận tiền hộ): khách trả vào tài khoản của công ty, cửa hàng ghi phải thu nội bộ, không ghi 112. Mã đuôi -CN: tiền vào tài khoản ngân hàng của chi nhánh, ghi Nợ 11319 (tiền đang chuyển), ngân hàng báo có mới chuyển sang 112 chi nhánh. Hình thức "Ghi công nợ", "Đối trừ" không ghi bút toán thu: tiền còn trên tài khoản đối ứng theo khách.

## 3. Sơ đồ chữ T từng nghiệp vụ

Các số liệu là ví dụ; tài khoản lấy theo cấu hình mặc định. Dòng đánh dấu **[BP]** mang bộ phận của cửa hàng.

### 3.1. Bán lẻ tại cửa hàng (lý do XBA)

Bán 1 hộp sữa: tiền hàng 100.000, thuế 8% 8.000, giá vốn 70.000; khách trả 50.000 tiền mặt, 58.000 QR.

| # | Nợ | Có | Số tiền | |
|---|---|---|---|---|
| 1 | 1311 | 51111 | 100.000 | Doanh thu [BP] |
| 2 | 1311 | 33311 | 8.000 | Thuế đầu ra |
| 3 | 6321 | 1561 | 70.000 | Giá vốn [BP] (chưa có giá vốn thì ghi khi tính giá vốn cuối tháng) |
| 4 | 1111 | 1311 | 50.000 | Thu tiền mặt |
| 5 | 13681 (đối tượng NC600000) | 1311 | 58.000 | Thu QR — tiền vào tài khoản công ty |

```
        1311                    51111                 33311
  (1) 100.000 | (4) 50.000            | (1) 100.000         | (2) 8.000
  (2)   8.000 | (5) 58.000
  → về 0 khi thu đủ

        6321                    1561                  1111            13681 (QR, NC600000)
  (3) 70.000 |                      | (3) 70.000   (4) 50.000 |      (5) 58.000 |
```

1311 là cầu nối: Nợ số phải thu của hoá đơn, Có số đã thu. Khách nợ (Ghi công nợ) thì 1311 còn dư Nợ theo khách. Lưu ý: lý do XBA đang chỉ định doanh thu 51111, nên mọi hàng bán qua XBA ghi 51111 kể cả hàng khuyến mại; giá vốn vẫn theo nhóm của mặt hàng.

### 3.2. Khách trả hàng (lý do NTH1)

| # | Nợ | Có | Số tiền | |
|---|---|---|---|---|
| 1 | 52131 | 1311 | 100.000 | Hàng bán bị trả lại [BP] |
| 2 | 33311 | 1311 | 8.000 | Giảm thuế đầu ra |
| 3 | 1561 | 6321 | 70.000 | Nhập lại kho, giảm giá vốn [BP] |
| 4 | 1311 | 1111 | 108.000 | Trả tiền lại khách |

Báo cáo "hàng bán trả lại" lọc theo **ngày phiếu trả**, không theo ngày hoá đơn gốc.

### 3.3. Hàng khuyến mại, quà tặng kèm

Dòng quà tặng (giá 0) chỉ có giá vốn: Nợ giá vốn của nhóm hàng khuyến mại (6323) / Có 1561 [BP]. Lý do bật cờ "hàng tặng vào chi phí" thì Nợ chi phí khuyến mại (64184) thay cho 6323.

### 3.4. Bán cho chi nhánh khác (lý do XCN)

| # | Nợ | Có | |
|---|---|---|---|
| 1 | 13681 (đối tượng: chi nhánh mua) | 51116 | Doanh thu nội bộ [BP] |
| 2 | 13681 | 33311 | Thuế |
| 3 | 6326 | 1561 | Giá vốn nội bộ = giá bán, không tính vào giá vốn bình quân [BP] |

### 3.5. Chuyển kho

| Nơi | Nợ | Có | Khi nào |
|---|---|---|---|
| Chi nhánh xuất | 1579 hàng đang chuyển | 1561 | Ngay khi xuất |
| Chi nhánh nhận | 1561 | 1579 | Khi xác nhận đã nhận |

Hai chi nhánh khác đơn vị hạch toán: trung gian là 13681 — ô "TK phải thu nội bộ hàng" ở ACC41, trống thì dùng "phải thu nội bộ tiền" (đối tượng là chi nhánh bên kia). Không có doanh thu, không có thuế. Số dư 1579 = hàng đang trên đường.

### 3.6. Thu tiền khách nợ, chuyển tiền

- Thu nợ: Nợ 1111 / 112 / Có 1311 (chọn khoản nợ để trừ, khoản cũ trước).
- Thu hộ công nợ của chi nhánh khác: nơi thu Nợ tiền / Có 33681; chi nhánh có công nợ Nợ 13681 / Có 1311.
- Nộp tiền về công ty: cửa hàng Nợ 11319 / Có 1111; nơi nhận Nợ 112 / Có 11319 khi tiền về.

### 3.6a. Tiền của hoá đơn đi tiếp đến đâu

| Khoản | Lúc bán (cửa hàng) | Sau đó |
|---|---|---|
| Tiền mặt | Nợ 1111 / Có 1311 | Nộp tiền: Nợ 11319 / Có 1111 (cửa hàng), Nợ 112 chi nhánh hoặc 1111 văn phòng / Có 11319 khi tiền về |
| QR, thẻ vào tài khoản chi nhánh (-CN) | Nợ 11319 / Có 1311 | Ngân hàng báo có: Nợ 112 chi nhánh / Có 11319 (phiếu báo có) |
| QR, thẻ vào tài khoản công ty (QR, POS, -CT) | Nợ 13681 (đối tượng công ty) / Có 1311 | Công ty trả về hoặc bù trừ: Nợ 112 / Có 13681. Phí QR, thẻ cuối tháng: Nợ 64275 / Có 13681 |
| Tiền QR vào tài khoản một chi nhánh khác (khác đơn vị hạch toán) | Nơi nhận tiền: Nợ 112 / Có 33681 (đối tượng chi nhánh bán); chi nhánh bán: Nợ 13681 / Có 1311 | Hai bên đối trừ 13681 / 33681 |
| Voucher | Nợ 3387 / Có 1311 | Cuối tháng: voucher khách Nợ 64184 / Có 3387; voucher nhân viên Nợ 3341 / Có 3387 (trừ lương) |
| Khách chuyển nhầm, chuyển thừa | Tiền về: Nợ 112 / Có 33881 | Hoàn khách: Nợ 33881 / Có 112 |

Hoá đơn giá trị gia tăng ghi theo kỳ thực bán, mã số thuế của chi nhánh.

Chuyển hàng giữa kho và cửa hàng đi qua **1579 hàng đang chuyển** (mục 3.5): nơi xuất Nợ 1579 / Có 1561, nơi nhận Nợ 1561 / Có 1579. Bán hàng cho **chi nhánh khác**: Nợ 13681, 6326 / Có 51116, 33311, 1561, giá vốn bằng doanh thu nội bộ (giá kho).

### 3.7. Nhập mua, điều chỉnh kho

- Nhập mua (NMH1): Nợ 1561 / Có 3312 (tiền hàng); Nợ 1331 / Có 3312 (thuế). Không sinh giá vốn.
- Kiểm kê thừa: Nợ 1561 / Có TK đối ứng của lý do điều chỉnh tăng. Kiểm kê thiếu: Nợ TK đối ứng của lý do điều chỉnh giảm / Có 1561.

## 4. Lãi lỗ từng cửa hàng: bộ phận và khoản mục

Quy tắc hạch toán:

1. **Mọi tài khoản lãi lỗ (loại 5, 6, 7, 8) bắt buộc gắn bộ phận.** Mỗi cửa hàng là một bộ phận, mã **BH + mã cửa hàng** (cửa hàng 26001 Bảo Hà → BH26001); HO, chi nhánh, phòng ban cũng là bộ phận.
2. **Khoản mục** gắn cho chi phí để biết chi vào việc gì. Ví dụ tiền điện cửa hàng Bảo Hà: Nợ 641… bộ phận BH26001, khoản mục CPHD01.

Thực hiện trong phần mềm:

- Danh mục **Chi nhánh (DM02)** có cột **Bộ phận**. Bút toán tự động từ cửa hàng (doanh thu, giá vốn, trả lại…) tự mang bộ phận này trên mọi dòng. Quay về dữ liệu gốc của danh mục bộ phận thì chi nhánh chưa gắn được gắn theo quy ước BH + mã cửa hàng.
- **DM tài khoản (ACC1)** bật "theo dõi bộ phận", "theo dõi khoản mục". Phiếu nhập tay vào tài khoản đã bật thì bắt buộc chọn. Quay về dữ liệu gốc phần theo dõi chiều của tài khoản thì bật bộ phận cho mọi tài khoản loại 5 – 8.
- Lý do có khoản mục: bút toán theo lý do đó mang khoản mục trên mọi dòng.

Khoản mục bắt buộc cho chi phí quản trị: tài khoản chi phí bán hàng, quản lý chi tiết (641x, 642x). Quay về dữ liệu gốc phần theo dõi chiều của tài khoản thì bật khoản mục cho các tài khoản này; phiếu nhập tay vào 641x, 642x phải chọn khoản mục.

## 5. Dữ liệu gốc

Toàn bộ danh mục chuẩn của công ty lưu bằng **tệp** trong `db/seeds/` (22 bộ, xem README ở đó): hệ thống tài khoản, tài khoản ngầm định, loại thuế, khoản mục, bộ phận, chi nhánh, lý do, nhóm hạch toán, phân loại hàng hoá, mặt hàng (20.985), nhóm đối tượng, đối tượng (16.459, không gồm khách lẻ), ngân hàng, hình thức thanh toán, nhân viên, hợp đồng, loại tài sản, nhóm công cụ dụng cụ, nguồn vốn, mục đích sử dụng, vụ việc, dự án.

Người dùng thêm, sửa, xoá danh mục thoải mái. Khi cần làm sạch: nút **Quay về dữ liệu gốc** ở đầu **mọi** màn danh mục, hoặc **Quay về toàn bộ** ở màn **Dữ liệu gốc (TI08)** (chạy đúng thứ tự phụ thuộc). Quay về: thêm lại cái thiếu, ghi đè theo tệp; mã tự thêm chưa dùng thì xoá, đã dùng trên sổ thì khoá (riêng chi nhánh, đối tượng, mặt hàng chỉ thêm / cập nhật). Không sửa chứng từ, sổ cái đã ghi.

## 6. Báo cáo hàng hoá cần có

| Báo cáo | Màn | Nguồn |
|---|---|---|
| Doanh thu, giá vốn theo hoá đơn, mặt hàng, nhóm / ngành / loại hàng, cửa hàng, khách | BH01, BH02 | `sales_lines` |
| Nhập xuất tồn theo mặt hàng, nhóm hàng, nhóm hạch toán, chi nhánh; mua hàng, giá vốn theo phân loại | ACC83 | `inventory_movements` + đơn giá vốn tháng |
| Lãi gộp theo mặt hàng, nhóm hàng, cửa hàng, khách | BH04 | `sales_lines` + giá vốn dòng / đơn giá vốn tháng |
| Bảng kê chuyển kho (đã nhận, trên đường) | HH01 | `inventory_movements` |
| Sổ chi tiết một mặt hàng | ACC82 | `inventory_movements` |
| Bảng đơn giá vốn tháng | ACC49 | `inventory_costs` |
| Công nợ theo mặt hàng | ACC68 | sổ cái |
| Kết quả kinh doanh theo cửa hàng (bộ phận) hoặc chi nhánh | KQ01 (và ACC69, ACC90) | sổ cái theo `dims.department` / chi nhánh |

## 7. Kiểm tra khi làm một nghiệp vụ mới của cửa hàng

1. Chứng từ ghi lý do gì? Lý do đó khai tài khoản đối ứng, doanh thu, chi phí, khoản mục chưa?
2. Mặt hàng thuộc bộ tài khoản nào? Có trong danh mục mặt hàng hoặc tệp gốc không?
3. Loại thuế, hình thức thanh toán có khai tài khoản chưa?
4. Chi nhánh đã gắn bộ phận chưa?
5. Kéo (hoặc đẩy) thử một chứng từ từ hệ thống bán hàng, mở ở Định khoản tự động (ACC14), xem trước định khoản, xem bút toán và đối chiếu với sơ đồ chữ T ở mục 3.
