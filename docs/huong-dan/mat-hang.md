# Danh mục mặt hàng (DM10)

Đây là **danh mục hàng chuẩn của công ty**. Mặt hàng, đơn vị tính, tỉ lệ quy đổi, giá bán, trạng thái bán khai **ở đây**. Hệ thống bán hàng (các website cửa hàng) tự kéo về vài phút một lần để hiển thị và bán, không sửa được bên đó.

> Muốn đổi gì về mặt hàng (tên, ảnh, ĐVT, giá, cấm bán…) thì sửa ở đây, đợi vài phút là cửa hàng thấy.

## Thêm / sửa mặt hàng <!-- [2026-11-10 04:30 PM Nguyễn Văn Thủy] PHASE-026 — rà form mặt hàng, tên không trùng, Cận date (đóng góp) -->

Bấm **Thêm**, hoặc bấm đúp một dòng. Bấm **Ghi** một lần là lưu cả các thẻ.

- **Thêm** là thêm **mặt hàng mới**. Mặt hàng con của mặt hàng đã có thì mở mặt hàng đó, bấm **Thêm sản phẩm con**.
- **Mã** gồm chữ số và chữ cái, không dấu cách.
- **Tên không được trùng** với mặt hàng khác (không phân biệt hoa thường, dấu cách thừa), kể cả mặt hàng đã ngừng. Gõ tới đâu báo tới đó, nút Ghi khoá cho tới khi đổi tên.

### 1. Thông tin

| Ô | Ghi chú |
|---|---|
| Nhóm hàng | Chọn tới **nhóm cấp 3** (vd Sữa bột / ABBOTT / Sữa công thức trẻ em). Nhóm quyết định mã hàng; ngành, nhãn tự điền. |
| Mã hàng | Chọn nhóm là **tự sinh** mã kế tiếp; nút **Sinh mã** để sinh lại. Mã đã lưu không sửa ở ô này (dùng nút **Đổi mã**). |
| Tên hàng | Tên in trên hoá đơn, hiện ở màn bán hàng. Không trùng mặt hàng khác. |
| Mã hàng cha | Chỉ có ở mặt hàng đã lưu. Mã cha thì liệt kê các mã con. Mã chưa có cha: chỉ chọn khi là **mã cũ của cùng sản phẩm** cần gom vào mã cha. |
| Barcode | Nhiều mã cách nhau dấu `/`. |
| Ảnh, mô tả, xuất xứ, khối lượng, ghi chú | Thông tin thêm. |

### Sản phẩm con

Mở **mã cha**, bấm **Thêm sản phẩm con**, gõ **mã con** và tên, bấm **Tạo và thêm tiếp**.

- **Mã con** bắt đầu bằng mã cha. Để nguyên mã cha thì tự cấp mã kế tiếp.
- **Tên** ghi phần phân biệt (màu, size, kiểu đóng gói…). Không trùng mặt hàng khác.
- Đơn vị tính, nhóm hàng, thuế suất lấy theo mã cha. Giá bán khai sau, ở thẻ Giá bán.
- Mã con là **mặt hàng riêng**: tồn riêng, giá riêng; báo cáo, đặt hàng gom được theo mã cha.

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

Chọn **Nhóm hàng** là phần mềm sinh mã kế tiếp theo đoạn mã của nhóm. Gõ tay mã riêng được.

### Thao tác

1. **Chọn Nhóm hàng**: gõ vài chữ không dấu theo thứ tự tuỳ ý (vd `etsuko sua tam`, `vinamilk sua cong thuc`), Enter. Danh sách chỉ có nhóm cấp 3.
2. Phần mềm sinh **Mã hàng** kế tiếp, dưới ô mã hiện từng đoạn `Ngành 17 · Nhãn 167 · Nhóm 6 · Số 005`.
3. Chọn lại nhóm khác: mã đổi theo nhóm mới.
4. Gõ tay mã riêng được; mã gõ tay giữ nguyên khi đổi nhóm. Bấm **Sinh mã** để quay về mã chuẩn.
5. Mặt hàng con: dùng **Thêm sản phẩm con** ở mã cha.

**Đoạn mã của nhóm** (cột *Đoạn mã trong mã hàng* ở **Nhóm hàng (DM11)**) chưa khai thì phần mềm tự lấy từ các mã đang có trong nhóm; nhóm mới tinh thì cấp số kế tiếp sau các nhóm cùng cha. Sửa được ở DM11 → ô **Mã ngắn**.

### Câu hỏi hay gặp

- **Đặt tên trùng được không?** Không. Trùng thì quầy, kho dễ chọn nhầm.

### Kiểm thử (cho người kiểm thử)

| # | Làm | Kết quả đúng |
|---|---|---|
| 1 | Thêm mặt hàng, chọn nhóm `etsuko sua tam` | Mã 17 167 6 + số kế tiếp; ngành, nhãn tự điền |
| 2 | Chọn lại nhóm `vinamilk sua cong thuc` | Mã đổi sang 11 005 3 + số kế tiếp |
| 3 | Gõ mã có dấu cách | Báo "Mã chỉ gồm chữ số và chữ cái", nút Ghi khoá |
| 4 | Gõ tên trùng một mặt hàng đang có (khác hoa thường) | Báo "Tên này đã dùng cho mã …", nút Ghi khoá |
| 5 | Ghi, rồi thêm mặt hàng khác cùng nhóm | Số tự sinh tăng 1 |
| 6 | Gõ một mã đã có, Ghi | Báo trùng mã, không lưu |
| 7 | Mở mặt hàng → **Thêm sản phẩm con** → gõ mã con, tên | Tạo được, mã con trỏ về mã cha |

Phép thử tự động: `apps/api/test/sinh-ma-hang.test.ts`, `apps/api/test/san-pham-con.test.ts`.

## Danh sách (DM10)

- Bên trái là **cây nhóm hàng**: bấm một nhóm để xem mặt hàng của nhóm đó và các nhóm con.
- Thanh nút: Thêm · Sửa (bấm đúp) · Xoá · Nạp · Xuất · Tìm nhanh (mã, tên, ghi chú) · lọc nhóm hạch toán, trạng thái.
- Chỉ **xoá** được mặt hàng chưa có nhập xuất. Mặt hàng đã dùng thì bỏ tích "Đang theo dõi".
- Chứng từ mang mã hàng chưa có thì mặt hàng tự thêm (cột **Nguồn** = "Tự thêm từ chứng từ"). Mã tự thêm chưa khai ĐVT thì **chưa xuống cửa hàng**; khai ĐVT là cửa hàng thấy.

## Nhóm hàng (DM11)

Cây nhóm hàng (cấp 1 → 2 → 3 → …), mã ngắn từng cấp và cách thêm / sửa: xem [Nhóm hàng](nhom-hang.md).

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

## Đổi mã, gộp mã, lịch sử <!-- [2026-11-05 02:20 PM Nguyễn Văn Thủy] PHASE-026 — S026-23 (đóng góp) -->

Mở mặt hàng, dùng các nút ở cuối form. Cả hai có hiệu lực từ hôm nay, bắt buộc ghi lý do.

| Việc | Kết quả |
|---|---|
| **Đổi mã** | Sổ và chứng từ cũ giữ mã cũ. ĐVT, bảng giá, giá nhà cung cấp, tồn max chuyển sang mã mới. Chứng từ gửi mã cũ vào vẫn ghi đúng mặt hàng. Ô tìm ở danh sách chỉ tìm theo mã hiện hành, tên, ghi chú. |
| **Gộp mã** | Mã này ngừng dùng và trỏ sang mặt hàng giữ lại. Sổ cũ không đổi. Gộp tiếp được nhiều lần. Phải hết tồn trước khi gộp: còn tồn thì lập phiếu chuyển tồn sang mã giữ lại trước |

Thẻ **Lịch sử** hiện từng lần đổi: lúc nào, ai, hiệu lực từ ngày nào, lý do. Báo cáo theo mặt hàng gom một dòng theo mã hiện hành.

## Họ mã (mã cha – mã con)

- Chỉ 1 cấp: mã con không có con.
- Mã con tạo bằng **Thêm sản phẩm con**. Mã cũ cùng sản phẩm (chữ cuối, hoặc đặt tên khác) thì gom bằng ô **Mã hàng cha** ở thẻ Thông tin; mã cũ có chữ cuối có nút gợi ý **Theo mã: …**.
- Nút **Quét cha – con theo mã** (thanh công cụ DM10, cần **mật khẩu công cụ**) gom lại các mã cũ có chữ cuối, giữ mã cha đã chọn tay.
- Danh sách xếp **mã con ngay dưới mã cha**, thụt vào (└); mã cha có nhãn **+N**. Phân tích đặt hàng (MH02) cộng dồn cả họ vào mã cha.

## Hàng không chịu thuế GTGT (KCT)

Khai **thuế bán ra KCT** (hoặc R00K) thì **thuế mua vào tự là V13K** — "Thuế GTGT đầu vào 0% (không chịu VAT)" — nếu để trống: phiếu mua không tự lấy 8%. Phiếu mua / đơn đặt: ô thuế suất chọn **KCT (không chịu thuế)**, tiền thuế 0; bán ra dùng mã KCT. Khác với **Không kê khai (KKKN)** — dùng cho quà / hàng không có hoá đơn.

## Mặt hàng nháp <!-- [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28 / 29 -->

Khi bạn Ghi mặt hàng mà khai báo còn **lỗi chặn** (khung **Vì sao** dưới form có dấu ✘), mặt hàng vẫn được lưu nhưng ở trạng thái **Nháp**:

- nút Ghi đổi thành **"Lưu nháp (còn n lỗi chặn)"**; danh sách mặt hàng hiện nhãn **Nháp**, lọc được bằng "Nháp (chưa kích hoạt)";
- mặt hàng nháp **không** có ở ô chọn mặt hàng của phiếu; chứng từ từ POS / hệ thống khác có mặt hàng này được giữ ở **Trạm kiểm tra đầu vào** với mã [IN-ITEM-009](loi-dau-vao/IN-ITEM-009.md);
- sửa hết lỗi chặn rồi Ghi → mặt hàng **tự kích hoạt**; các chứng từ đang chờ vì nó được kiểm lại tự động.

Lỗi chặn hiện có: thiếu đơn vị tính gốc (`ITEM-BLOCK-001`); thiếu nhóm hạch toán khi đơn vị chưa có nhóm mặc định (`ITEM-BLOCK-002`). Thiếu nhóm hạch toán nhưng có nhóm mặc định chỉ là **cảnh báo mềm** (`ITEM-HINT-001`): lưu được ngay sau khi ghi lý do. Tra mọi mã ở [Tra mã phát hiện](ma-loi/README.md).

## Mặt hàng mới từ chứng từ và kích hoạt hàng loạt <!-- [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09 / D024-3 -->

Chứng từ của hệ thống bán hàng mang mã hàng chưa có trong danh mục thì xử lý theo chế độ kế toán trưởng chọn ở [Quy định dữ liệu danh mục](quy-dinh-du-lieu-danh-muc.md):

- **bật** (như trước): mặt hàng được thêm thẳng vào danh mục. Danh sách mặt hàng hiện dải nhắc "N ngày qua chứng từ đã tự thêm … mặt hàng — X thiếu đơn vị tính, Y chưa có nhóm hạch toán" để kế toán kiểm;
- **tắt**: mặt hàng mới thành **nháp**, chứng từ chờ ở Trạm kiểm tra với mã [IN-ITEM-001](loi-dau-vao/IN-ITEM-001.md).

Nút **Kích hoạt hàng loạt** ở danh sách mặt hàng: chọn các mặt hàng nháp, điền một lần đơn vị tính / nhóm hạch toán cho ô **còn trống** (không ghi đè ô đã có). Mặt hàng nào hết lỗi chặn thì kích hoạt, còn thiếu thì giữ nháp và được liệt kê. Chứng từ đang chờ vì các mặt hàng vừa kích hoạt được kiểm lại tự động. Dùng nhóm mặc định cho mặt hàng chưa có nhóm thì phải ghi lý do.

## Danh sách lớn

Mỗi trang hiện tối đa 5.000 mặt hàng. Danh mục nhiều hơn thì có thanh chuyển trang ở dưới lưới; dùng ô tìm hoặc cây nhóm hàng để đến đúng mặt hàng. Tìm được theo một phần mã, tên, ghi chú, không cần gõ dấu.
