# Danh mục mặt hàng (DM10) và phân loại hàng hoá (DM11)

Đây là **danh mục hàng chuẩn của công ty**. Mặt hàng, đơn vị tính, tỉ lệ quy đổi, giá bán, trạng thái bán khai **ở đây**. Hệ thống bán hàng (các website cửa hàng) tự kéo về vài phút một lần để hiển thị và bán, không sửa được bên đó.

> Muốn đổi gì về mặt hàng (tên, ảnh, ĐVT, giá, cấm bán…) thì sửa ở đây, đợi vài phút là cửa hàng thấy.

## Thêm / sửa mặt hàng

Bấm **Thêm**, hoặc bấm đúp một dòng. Form có 4 thẻ, bấm **Ghi** một lần là lưu cả 4.

### 1. Thông tin

| Ô | Ghi chú |
|---|---|
| Nhóm hàng | Chọn tới **nhóm cấp 3** (vd Sữa bột / ABBOTT / Sữa công thức trẻ em). Nhóm quyết định mã hàng. |
| Mã hàng | Chọn nhóm hàng là **tự sinh** mã kế tiếp (xem *Sinh mã hàng* bên dưới); nút **Sinh mã** để sinh lại. Mã đã lưu không đổi được. |
| Barcode | Nhiều mã cách nhau dấu `/`. |
| Tên hàng | Tên in trên hoá đơn, hiện ở màn bán hàng. |
| Ảnh | Dán đường dẫn ảnh (https://…), ô bên cạnh hiện ảnh xem trước. |
| Mô tả, xuất xứ, khối lượng, ghi chú | Thông tin thêm. |

### 2. Đơn vị tính

Thẻ này **chỉ** khai đơn vị tính và quy đổi. Giá bán ở thẻ **Giá bán**; giá mua ở thẻ **Mua hàng**.

- Dòng tô cam **Nhỏ nhất** là ĐVT nhỏ nhất. Tồn kho luôn tính theo ĐVT này.
- **Tên ĐVT**: chọn trong danh sách (Danh mục đơn vị tính DM15), gõ vài chữ để lọc. Tên chưa có thì chọn dòng **＋ tên mới**: lưu xong tên đó tự vào danh mục.
- **Quy đổi**: khai đúng như nhà cung cấp nói. Ví dụ `1 Thùng = 12 Lốc`: gõ 12, chọn Lốc. Phần mềm tự ra `= 48 Lon`. Dải trên cùng tóm tắt: **1 Thùng = 12 Lốc = 48 Lon**.
- Trên đơn đặt và phiếu nhập, dòng hàng ghi đúng ĐVT trung gian (Lốc, Thùng) NCC giao. Chỉ khi ghi kho phần mềm mới quy về ĐVT nhỏ nhất.
- **Bán chính** / **Mua mặc định**: bấm nút **Bán** / **Mua** trên dòng ĐVT.
- Nút **+ Lốc, + Thùng…** để thêm nhanh. Dòng tô đỏ là dòng chưa đủ thông tin (trùng tên, chưa nhập quy đổi).

### 2b. Giá bán (cấu hình bán hàng)

- Mỗi **bảng giá một dòng**, mỗi **ĐVT một cột**. Dòng đầu là bảng giá công ty.
- **Ô trống hiện giá gợi ý** tính theo tỉ lệ, ví dụ "≈ 1.360.000" = giá Lon × 4. Bấm **lấy** để dùng.
- Dòng chi nhánh: hiện **% chênh so với giá công ty**, có nút **Lấy giá công ty** (điền ô trống) và **Ẩn**.
- **Dán từ Excel**: copy một dòng (hoặc nhiều dòng) số, dán vào ô đầu.
- Hàng chính chỉ bán theo giá công ty. Hàng thường ưu tiên giá chi nhánh, không có thì lấy giá công ty.

### 3. Trạng thái

| Cờ | Ý nghĩa |
|---|---|
| Hàng chính | Chỉ bán theo giá công ty (xem bảng trên). |
| Sữa cho trẻ dưới 24 tháng | Luật cấm khuyến mại: cửa hàng tự chặn mọi chương trình khuyến mại cho mã này. |
| Không được bán (vật tư chỉ nhập) | Không hiện ở màn bán hàng, chỉ nhập kho / dùng nội bộ. |
| Được xuất điều chỉnh dù vẫn bán | Cho lập phiếu xuất điều chỉnh với mã đang bán. |
| Đang theo dõi | Bỏ tích để ngừng mặt hàng (không xoá dữ liệu cũ). |

### 4. Kế toán

| Ô | Ghi chú |
|---|---|
| Thuế suất GTGT | Chọn **8% / 10% / 5% / 0% (xuất khẩu) / Không chịu thuế (KCT)**. Máy tự đặt mã VAT ra / vào chuẩn (vd 8% → R08 / V08, KCT → KCT / V13K), hiện ngay dưới ô. |
| Mã thuế chi tiết | Bấm để mở khi cần mã đặc biệt (vd R08A giá có thuế, V051…) hoặc **thuế tiêu thụ đặc biệt** (chỉ rượu, bia, nước ngọt có đường…; sữa, bỉm để trống). Mã riêng thì ô Thuế suất hiện "Mã riêng: …". |
| Nhóm hạch toán | Tài khoản kho, giá vốn, doanh thu; trống = nhóm mặc định. Sửa từng tài khoản của mặt hàng ở ACC17. |

> Không chịu thuế (KCT) khác thuế suất 0%: KCT không kê thuế, 0% là hàng xuất khẩu. Chọn đúng ở ô Thuế suất là đủ, không có ô tích riêng.

## Sinh mã hàng

### Quy tắc 

Cây **Nhóm hàng** có 3 cấp: **Ngành → Nhãn (hãng) → Nhóm sản phẩm**. Mã hàng ghép từ mã của 3 cấp + số tự sinh:

| Loại | Cấu trúc | Ví dụ | Đọc là |
|---|---|---|---|
| Hàng thường (9 ký tự) | ngành 2 + nhãn 3 + nhóm 1 + số 3 | **11 005 4 057** | Sữa bột · Vinamilk · Sữa người lớn · số 057 |
| Hàng combo | như trên, nhóm = **8** | 11 005 **8** 001 | combo Vinamilk |
| Quà khuyến mại | **Q** + nhãn 3 + nhóm 1 + số **4** | **Q 006 1 0017** | quà · Abbott · đồ chơi · số 0017 |
| Mã biến thể (10 ký tự) | mã thường + **1 chữ đuôi** | 110054057**K** | xem bảng đuôi bên dưới |

Chữ đuôi (ký tự thứ 10):

| Đuôi | Nghĩa | Tên hàng đặt thế nào |
|---|---|---|
| K | Hàng chia giá | Tên hàng thường + " K" |
| M | Hàng khuyến mại (ghi nhận 0 đồng) | "KM " + tên hàng thường |
| Q | Hàng kẹp quà KM (bán kèm, không tách) | Tên hàng thường + " Kẹp quà KM" |
| T | Hàng có tem | Tên hàng thường + " T" |
| Z | Đuôi riêng đang dùng (≈ 580 mã, nhiều ở đồ chơi / quà) | "(Z) " + tên hàng |
| B | Đuôi riêng đang dùng (≈ 160 mã) | Tên hàng + " B" |
| D, C | Đuôi riêng đang dùng (vài chục mã, bỉm / tã) | Tên hàng + " D" / " (C)" |
| khác (1–3 chữ, vd CB) | Đuôi riêng khác | Tên hàng + " " + đuôi |

Số liệu đuôi theo danh mục mã hàng hiện có (26/10/2026): M ≈ 1.650 mã, Z ≈ 580, T ≈ 490, Q ≈ 470, B ≈ 160, K ≈ 95, D, C vài chục, CB 1. K / M / Q / T là đuôi chuẩn; Z, B, D, C… là quy ước riêng — phần mềm cho dùng, đọc là "mã phụ", sổ thuế nhập theo mã hàng thường (9 ký tự đầu).

Số tự sinh = số lớn nhất đang có của **mã 9 ký tự** cùng tiền tố + 1 (mã có đuôi không làm nhảy số).

### Thao tác

1. **Chọn Nhóm hàng**: gõ vài chữ không dấu theo thứ tự tuỳ ý (vd `etsuko sua tam`, `vinamilk sua cong thuc`), Enter. Danh sách chỉ hiện nhóm sản phẩm (cấp 3) nên không chọn nhầm ngành / nhãn.
2. Phần mềm tự:
   - sinh **Mã hàng** kế tiếp — dưới ô mã hiện từng đoạn: `Ngành 17 · Nhãn 167 · Nhóm 6 · Số 005`;
   - điền **Ngành hàng**, **Nhãn hàng** theo cây nhóm và khoá lại (khai một chỗ là nhóm hàng).
3. Chọn lại nhóm khác: mã và ngành / nhãn đổi theo nhóm mới.
4. Cần mã biến thể: ô bên cạnh mã chọn **K / M / Q / T** hoặc **Đuôi riêng (Z, B…)** — mã thêm chữ đuôi, tên hàng đặt theo mẫu.
5. **Muốn mã riêng, không theo quy tắc**: gõ thẳng vào ô Mã hàng.
   - Mã gõ tay được **giữ nguyên** khi đổi nhóm.
   - Dưới ô báo "không theo quy tắc mã hàng — vẫn lưu được" hoặc "khác tiền tố của nhóm đã chọn" để kiểm lại.
   - Bấm **Sinh mã** để quay về mã chuẩn của nhóm.
6. Mặt hàng đã có → nút **Tạo mã biến thể…** ở chân form: bấm thẻ đuôi (đuôi chuẩn K / M / Q / T, đuôi riêng Z / B / D / C, hoặc **…** gõ đuôi khác 1–3 chữ). Hộp hiện trước mã mới + tên theo mẫu; mã đã có thì thẻ ghi "đã có" và không cho tạo trùng. **Enter** hoặc nút **Tạo mã …** mở form mặt hàng mới đã chép nhóm, nhãn, ĐVT, thuế.
7. Mã đã lưu **không đổi được** (đã dùng trên chứng từ, tồn kho, giá). Sai mã thì tạo mã mới đúng, ngừng dùng mã cũ (Trạng thái → Ngừng).

**Đoạn mã của nhóm** (cột *Đoạn mã trong mã hàng* ở **Nhóm hàng (DM11)**, có trong menu Mua hàng → Danh mục mua hàng) chưa khai thì phần mềm tự lo:
- nhóm đã có mặt hàng: lấy đoạn mã từ các mã hàng đang có trong nhóm;
- nhóm mới tinh: cấp số kế tiếp sau các nhóm cùng cha (Sữa người lớn là 4 thì Sữa bầu mới là 5).
- Mã tìm được ghi lại vào nhóm, sửa được ở DM11 → thẻ Nhóm hàng → ô **Mã SKU**.

### Câu hỏi hay gặp (để trả lời khi họp)

- **"Quy tắc sinh mã của các em là gì?"** — Theo quy tắc mã hàng của công ty: mã = ngành (2) + nhãn (3) + nhóm (1) + số tự sinh (3); quà khuyến mại Q + nhãn + nhóm + 4 số; biến thể thêm chữ đuôi K / M / Q / T (và các đuôi riêng đang dùng Z, B, D, C…). Phần mềm **chỉ đề xuất** mã kế tiếp, người nhập vẫn sửa / gõ tay được.
- **"Đoạn mã của nhóm lấy ở đâu?"** — Từ chính các mã hàng đang có trong nhóm (vd nhóm Vinamilk – Sữa công thức có 110053024 → 11 · 005 · 3). Nhóm mới chưa có mã nào thì lấy số kế tiếp sau các nhóm cùng cha. Kế toán sửa được ở DM11.
- **"Số tự sinh tính thế nào?"** — Số lớn nhất của các mã 9 ký tự cùng tiền tố + 1. Mã có đuôi (K, M, Z…) không làm nhảy số.
- **"Gõ mã khác quy tắc có được không?"** — Được (mã đặc biệt). Phần mềm cảnh báo "không theo quy tắc" nhưng vẫn lưu; trùng mã thì chặn.
- **"Đổi mã đã lưu?"** — Không (mã đã nằm trên chứng từ, tồn kho, giá). Sai thì tạo mã đúng, ngừng mã cũ.
- **"Ngành, nhãn có phải chọn lại không?"** — Không. Chọn nhóm sản phẩm (cấp 3) là ngành = cấp 1, nhãn = cấp 2 tự điền. Khuyến mại, hạn mức, thưởng theo nhãn đều dùng nhãn này.

### Kiểm thử sinh mã (cho người kiểm thử)

| # | Làm | Kết quả đúng |
|---|---|---|
| 1 | Thêm mặt hàng, chọn nhóm `etsuko sua tam` | Mã 17 167 6 + số kế tiếp; Ngành = Đồ dùng cho mẹ & bé, Nhãn = ETSUKO, hai ô bị khoá |
| 2 | Chọn lại nhóm `vinamilk sua cong thuc` | Mã đổi sang 11 005 3 + số kế tiếp; nhãn đổi thành Vinamilk |
| 3 | Chọn đuôi **K** | Mã thêm K (10 ký tự); dưới ô hiện "Đuôi K · Chia giá" |
| 4 | Gõ tay `MA-RIENG-01`, rồi đổi nhóm | Mã giữ `MA-RIENG-01`; báo "không theo quy tắc — vẫn lưu được" |
| 5 | Bấm **Sinh mã** | Mã quay về mã chuẩn của nhóm đang chọn (giữ đuôi đang chọn) |
| 6 | Ghi, rồi thêm mặt hàng khác cùng nhóm | Số tự sinh tăng 1 |
| 7 | Gõ một mã đã có, Ghi | Báo trùng mã, không lưu |
| 8 | Lưu mã có đuôi (…058K), sinh mã cùng nhóm | Số tự sinh không bị nhảy vì mã có đuôi |
| 9 | Nhóm quà khuyến mại (ngành Q) | Mã dạng Q + 3 + 1 + 4 số |
| 10 | Mở mặt hàng đã có → **Tạo mã biến thể…** → bấm thẻ **M** → Enter (thử thêm thẻ của đuôi đã có: báo "đã có", nút Tạo bị khoá) | Form mới: mã = mã cũ + M, tên "KM " + tên cũ, cùng nhóm / ĐVT / thuế |
| 11 | Nhóm mới tạo chưa có mặt hàng | Mã nhóm tự cấp (số kế tiếp của nhóm cùng cha), số tự sinh 001 |
| 12 | Chọn đuôi **Z**, rồi **Đuôi khác (gõ 1–3 chữ)** gõ `CB` vào ô hiện ngay bên cạnh | Mã thêm Z (tên "(Z) …"); mã thêm CB, dưới ô hiện "Mã phụ (CB)" |

Các trường hợp 1–3, 6–9, 11 đã có phép thử tự động (`apps/api/test/sinh-ma-hang.test.ts`).

## Danh sách (DM10)

- Bên trái là **cây nhóm hàng**: bấm một nhóm để xem mặt hàng của nhóm đó và các nhóm con.
- Thanh nút: Thêm · Sửa (bấm đúp) · Xoá · Nạp · Xuất · Tìm nhanh (mã, tên, ghi chú) · lọc nhóm hạch toán, trạng thái.
- Chỉ **xoá** được mặt hàng chưa có nhập xuất. Mặt hàng đã dùng thì bỏ tích "Đang theo dõi".
- Chứng từ mang mã hàng chưa có thì mặt hàng tự thêm (cột **Nguồn** = "Tự thêm từ chứng từ"). Mã tự thêm chưa khai ĐVT thì **chưa xuống cửa hàng**; khai ĐVT là cửa hàng thấy.

## Phân loại hàng hoá (DM11)

Bốn thẻ **Nhóm hàng**, **Ngành hàng**, **Nhãn hàng**, **Loại hàng**. Lưới: mã, tên, Path (đường dẫn cây), thuộc, số mặt hàng đang gắn. Form: mã (*), tên, phân cấp (thuộc mục nào).

- Thẻ **Nhóm hàng** có thêm cột / ô **Mã SKU**: đoạn mã ghép khi sinh mã hàng. Cấp 1 thường 2 chữ số (11), cấp 2 thường 3 chữ số (006), cấp 3 thường 1 chữ số (3).
- Nút **Suy mã SKU**: điền mã SKU cho các nhóm chưa khai, đoán từ mã hàng đang có trong nhóm. Hiện danh sách xem trước rồi mới hỏi áp dụng. Nhóm đã khai không bị đổi.
- Chỉ xoá được mục chưa gắn mặt hàng và chưa có mục con.

## Thẻ Mua hàng (khi dùng phân hệ Mua hàng)

Thẻ có 4 khối. Mỗi khối có nút sửa riêng, không phải bấm Sửa cả hộp thoại.

1. **Giá mua riêng của sản phẩm** (tím): giá mua cố định (tham khảo) riêng cho mã này. Khi có giá vốn chuẩn thì điền vào đây. Đặt cạnh để so:
   - **giá vốn bình quân** tháng gần nhất;
   - **giá vốn tạm tính** theo tồn hiện tại;
   - **giá nhập gần nhất**.

   Các số cùng quy về ĐVT đang xem, giá chưa thuế, kèm % chênh lệch.
   - NCC nào chưa khai giá riêng thì phiếu nhập so với giá này, lệch quá mức ở **Cài đặt mua hàng (MH12)** (mặc định 2%) thì cảnh báo — một mức chung, không khai từng dòng.
   - Bấm **Khai / Sửa giá mua riêng**. Có nút **lấy nhanh** theo giá vốn bình quân hoặc giá nhập gần nhất.
   - Đổi giá từ một ngày khác thì giá cũ được giữ trong **Lịch sử giá mua riêng**.
2. **Giá mua theo từng nhà cung cấp** (xanh lá): NCC nào bán mã này, theo ĐVT nào, giá riêng bao nhiêu. Đây cũng chính là bảng ở hồ sơ NCC.
   - Bấm **Sửa bảng** để sửa, rồi **Lưu thay đổi**.
   - **Bỏ** = ngừng áp. **Xoá** = xoá hẳn dòng.
3. **Tồn max theo chi nhánh – kho** (cam): mức hàng muốn có ở từng shop / kho — shop dưới max thì được chia thêm, kho dưới max thì tính vào cần nhập.
4. **Các lần nhập gần nhất**.

## Tồn max (thẻ Mua hàng → khối ③)

Khối này liệt kê max của mã ở mọi chi nhánh / shop (cùng bảng với màn **Tồn max MH16**). Bấm **+ Thêm tồn max** mở hộp riêng:
- **Chi nhánh / shop** (theo cây chi nhánh cha → shop) và **Kho** (trống = kho mặc định; shop thường chỉ có một kho);
- **Nhập theo ĐVT** quen dùng (vd Thùng) — phần mềm lưu quy về ĐVT nhỏ nhất;
- **Tồn max** (quan trọng) và **Tồn min** (tuỳ chọn, thường chỉ cho kho); dòng xanh "Phần mềm sẽ làm…" tự tính ví dụ.

Khai hàng loạt, xem gợi ý theo tốc độ bán: màn **Tồn max (MH16)** — nút **Xem mọi shop (MH16)** mở sẵn mã này.

## Họ mã (mã cha – mã con)

- Mỗi mặt hàng có ô **Mã hàng cha (họ mã)** ở thẻ *Thông tin* (chỉ 1 cấp). Mã con: mã kẹp quà / khuyến mại / chia giá / Z, B… của cùng sản phẩm, hoặc **mã đặt tên khác nhưng bản chất là sản phẩm ấy** (chọn tay). Mã đang là mã cha thì ô này liệt kê các mã con.
- **Tự điền theo mã:** tạo mã mới dạng 9 số + đuôi (trừ T) mà mã gốc đã có → tự nhận mã gốc làm mã cha. Nút **Quét cha – con theo mã** (thanh công cụ DM10, cần **mật khẩu công cụ**) quét lại toàn danh mục, **giữ mã cha đã chọn tay**. Nút **Theo mã: …** / **Bỏ** trên form để gán / bỏ nhanh.
- Đuôi **T (có tem)** đặt riêng với NCC → không tự gộp (muốn gộp thì chọn tay); vẫn đứng cạnh mã gốc vì danh sách sắp theo mã.
- Danh sách xếp **mã con ngay dưới mã cha**, thụt vào (└); mã cha có nhãn **+N**. Phân tích đặt hàng (MH02) cộng dồn cả họ vào mã cha.

## Hàng không chịu thuế GTGT (KCT)

Khai **thuế bán ra KCT** (hoặc R00K) thì **thuế mua vào tự là V13K** — "Thuế GTGT đầu vào 0% (không chịu VAT)" — nếu để trống: phiếu mua không tự lấy 8%. Phiếu mua / đơn đặt: ô thuế suất chọn **KCT (không chịu thuế)**, tiền thuế 0; bán ra dùng mã KCT. Khác với **Không kê khai (KKKN)** — dùng cho quà / hàng không có hoá đơn.
