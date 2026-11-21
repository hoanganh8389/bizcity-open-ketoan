# 27. Đơn đặt giao nhiều chi nhánh · phiếu nhập nhiều hoá đơn · đối soát 3 bên theo chi nhánh

> Kế hoạch làm (21/11/2026). Mục tiêu: một luồng thông suốt **Đơn đặt → (các) Phiếu nhập theo từng chi nhánh → (các) Hoá đơn → Đối soát**,
> chỗ nào lệch thì phần mềm tự báo, cần thì duyệt đặc biệt (duyệt ngoại lệ). Mọi phép đếm "còn phải nhập / đã nhận / theo hoá đơn"
> đều tính **theo chi nhánh nhận hàng**, không cộng lẫn chi nhánh khác.

## 0. Nguyên tắc chung

| # | Nguyên tắc |
|---|---|
| N1 | **Chi nhánh nhận hàng** của một dòng đơn = chi nhánh của dòng (`line.branchCode`) → không có thì chi nhánh của "Giao tại kho" (`deliveryBranch`) → không có thì chi nhánh lập chứng từ. Đây là "chi nhánh nhận" dùng cho mọi đối chiếu. |
| N2 | **Phân kho lưu ở từng dòng** (`line.warehouseCode`). "Giao tại kho" ở đầu đơn chỉ là **danh sách tham chiếu** (chọn nhiều kho), tự cập nhật theo các dòng. |
| N3 | **Phiếu nhập luôn thuộc một chi nhánh nhận.** Đơn giao 3 chi nhánh → 3 phiếu nhập (mỗi chi nhánh lập phiếu của mình), đơn theo dõi cả 3. |
| N4 | Phiếu nhập có thể có **nhiều hoá đơn** (NCC tách hoá đơn, hoá đơn điều chỉnh). SL theo hoá đơn = **cộng dồn** các hoá đơn. |
| N5 | Lệch giữa **SL còn phải nhập (đơn, chi nhánh này) · SL thực nhận · SL theo hoá đơn** → cảnh báo ở dòng, ở bảng đối soát, ở Trợ lý. Lệch hoá đơn ↔ thực nhận = **chặn duyệt**, người có quyền **Duyệt ngoại lệ** (ghi lý do). |
| N6 | Thông tin phụ của phiếu nhập (chuỗi chứng từ, tiến độ, đối soát tóm tắt) đưa vào **Trợ lý mua hàng** bên phải; đầu phiếu chỉ còn ô nhập. |

## 1. Đơn đặt hàng

### 1.1 Giao tại kho chọn nhiều kho (tham chiếu)
- Ô "Giao tại kho" thành ô **chọn nhiều** (tích ô), danh sách theo cây: kho của chi nhánh lập chứng từ + kho của mọi chi nhánh con; gõ tìm được.
- Lưu `deliveryWarehouses: string[]` (tham chiếu). `deliveryWarehouse` (kho đầu tiên) giữ để tương thích dữ liệu cũ, máy chủ tự điền.
- Dòng hàng: đổi **Chi nhánh nhận** → tự điền **kho mặc định của chi nhánh đó** (ưu tiên kho đã tích ở đầu đơn thuộc chi nhánh đó), đổi được trong phạm vi chi nhánh đó và chi nhánh con.
- Danh sách tham chiếu ở đầu đơn **tự cập nhật** = mọi kho đang dùng ở các dòng (thêm kho ở dòng → đầu đơn tích thêm).
- Dòng mới thêm: chi nhánh nhận = chi nhánh của kho tích đầu tiên (hoặc chi nhánh lập), kho = kho đó.

### 1.2 Khoản mục
- Cột **Khoản mục** ở bảng hàng **ẩn mặc định** (bật ở nút Cột).
- Dòng **ăn theo khoản mục đầu phiếu**; đầu phiếu chưa chọn thì cột dòng khoá (không chọn được), không chọn cũng được.

### 1.3 Kế hoạch hoá đơn
- Lựa chọn: **Giao kèm hàng** · **Gửi sau N ngày** · **Hàng không có hoá đơn** (đổi chữ "Không lấy").
- "Gửi sau N ngày" có thêm **tính từ**: *ngày đặt đơn* hoặc *ngày nhận hàng (phiếu nhập)*. Lưu `invoicePlan.from = 'order' | 'receipt'` (mặc định `receipt` như cũ).
- Hạn hoá đơn: `from = order` → ngày đơn + N; `from = receipt` → ngày nhận hàng của từng phiếu nhập + N.

### 1.4 Mẫu đơn gửi NCC theo từng chi nhánh
- Đơn giao k chi nhánh → hộp "Mẫu đơn gửi NCC" có **k thẻ**, mỗi thẻ: dòng của chi nhánh đó, "Giao tại kho" = kho của chi nhánh đó (các kho của dòng), địa chỉ / tên chi nhánh nhận, **tổng tiền tính từ các dòng của chi nhánh đó**.
- "Xuất Excel đúng mẫu": một tệp, **mỗi chi nhánh một trang tính** (hoặc nút xuất từng thẻ).

### 1.5 Tiến độ giao theo chi nhánh
- Thẻ mới **"Tiến độ giao"** trong đơn: theo từng chi nhánh nhận → từng mã: Đặt · Đã nhận (phiếu đã duyệt của chi nhánh đó) · Đang chờ (phiếu nháp / chờ duyệt) · Còn lại · Tình trạng; dưới mỗi chi nhánh: các phiếu nhập (bấm mở) và hoá đơn của chúng.
- Trợ lý "Tiến độ giao hàng của đơn" chia theo chi nhánh (mỗi chi nhánh một khối gọn: đủ / còn thiếu bao nhiêu).

### 1.6 Mở lại đơn
- Đơn đã có phiếu nhập (chưa huỷ): nút **Mở lại đơn** bị khoá, chú thích rõ: "Đơn đã có phiếu nhập NM… — không mở lại được; muốn đổi thì giảm phần còn lại / đóng đơn, hoặc huỷ phiếu nhập trước". Không để bấm rồi mới báo lỗi đỏ.

## 2. Phiếu nhập mua

### 2.1 Bỏ thanh chuỗi chứng từ trên đầu phiếu
- Thanh "Hợp đồng › Đơn đặt › Phiếu nhập › Hoá đơn › Thanh toán" chuyển vào **Trợ lý** thành khối "Chuỗi chứng từ" (dọc, gọn) — áp cho mọi loại phiếu.

### 2.2 Cột đối chiếu ở dòng hàng (phiếu theo đơn)
| Cột | Ý nghĩa |
|---|---|
| **Còn phải nhập (đơn)** | Phần còn lại của đơn **cho chi nhánh của phiếu** (không tính phiếu này), quy về ĐVT của dòng |
| **SL thực nhập** | Số lượng của phiếu này (cột SL hiện có) |
| **SL theo hoá đơn** | Cộng dồn SL mã đó trên **các hoá đơn** của phiếu (hoá đơn đã nhập ở MH22, quy về ĐVT của dòng) |
- Lệch tô màu ô + chú thích: thực nhập > còn phải nhập (nhập vượt đơn), hoá đơn ≠ thực nhập.

### 2.3 Nhiều hoá đơn trên một phiếu
- Dữ liệu: `invoices: { no, serial?, date, total?, supplierInvoiceId?, adjusts?: string; note?; by?; at? }[]` — `invoice` (cũ) = hoá đơn đầu tiên (máy chủ tự đồng bộ để dữ liệu cũ, báo cáo cũ chạy tiếp).
- Thẻ "Hoá đơn & đối soát": bảng các hoá đơn (thêm dòng / bỏ dòng / chọn từ MH22), cột "Điều chỉnh cho hoá đơn" (hoá đơn điều chỉnh ghi rõ điều chỉnh hoá đơn nào), người thêm, lúc thêm; nút **Lịch sử hoá đơn** (mọi lần thêm / bỏ / sửa hoá đơn của phiếu, ghi nhật ký JSONL).
- Gắn hoá đơn ở MH31 = **thêm** vào danh sách (không thay hoá đơn cũ).

### 2.4 Đối soát 3 bên theo dòng
- Bảng: Mã · Tên · ĐVT · **Còn phải nhập (đơn, CN)** · **Thực nhận** · **Theo hoá đơn (cộng dồn)** · Lệch đơn · Lệch hoá đơn · Kết quả.
- Lệch → cảnh báo ở bảng + ở Trợ lý (khối "Kiểm tra").
- Mã kiểm mới: `inv_qty_diff` (SL hoá đơn ≠ thực nhận, **chặn duyệt**, cho Duyệt ngoại lệ), `inv_line_missing` (mã trên phiếu không có trên hoá đơn / ngược lại, cảnh báo).

### 2.5 Ghi sổ khi có nhiều hoá đơn (thuế đầu vào đúng từng hoá đơn)
- Lõi ghi sổ: **một chứng từ kế toán chỉ mang một hoá đơn** (`tax_invoices` theo chứng từ). Vì vậy phiếu có k ≥ 2 hoá đơn → khi duyệt, phần mua hàng **tách thành k chứng từ kế toán** (giống phiếu đổi hàng sinh 2 chứng từ):
  - chia dòng theo **SL từng mã trên từng hoá đơn** (hoá đơn đã nhận diện mã ở MH22);
  - tiền / thuế / chiết khấu của mỗi phần theo tỷ lệ SL; phần lẻ làm tròn dồn vào phần cuối;
  - SL không nằm trên hoá đơn nào → phần không hoá đơn (chứng từ kế toán không hoá đơn).
- Hoá đơn **chưa nhận diện mã** (chỉ có số, ngày, tổng): **chặn duyệt** với lời nhắc "nhận diện dòng hoá đơn ở MH22" — không đoán.
- Điều chỉnh / bỏ duyệt: đảo đủ k chứng từ (đã có sẵn: phiếu giữ danh sách `links`).

### 2.6 Phiếu nhập lập từ đơn
- Mỗi dòng chỉ lấy **phần còn lại của chi nhánh phiếu** (đã có ở `receiptFromOrder(..., branch)`); kiểm "nhận vượt đơn", "giao một phần", "lệch giá" ở phân tích máy chủ đổi sang **tiến độ theo chi nhánh**.

## 3. Đối chiếu ở các màn khác
- **MH21 Đối chiếu đơn đặt ↔ phiếu nhập**: mỗi dòng = đơn × **chi nhánh nhận** × mã.
- **MH31 Đối chiếu hoá đơn**: tình trạng hoá đơn theo phiếu dùng `invoices[]` (đủ / thiếu một phần theo SL), hạn theo `invoicePlan.from`; thêm cột chi nhánh nhận; gắn hoá đơn = thêm.
- **Bàn làm việc**: việc "lệch hoá đơn ↔ thực nhận" (`inv_qty_diff`).
- **Chuỗi chứng từ** (Trợ lý): đơn → các phiếu nhập theo chi nhánh → các hoá đơn.

## 4. Lỗi cần sửa
| Lỗi | Hướng xử lý |
|---|---|
| "Duyệt điều chỉnh" báo `CONFLICT · LEDGER_APPEND_ONLY` (bản thử, phiếu NM26110002) | **Đã sửa.** Nguyên nhân: phiếu có chiết khấu / quà theo chính sách → chứng từ kế toán mang `policyRefs`; duyệt bản 2 thì lõi cất phiên bản cũ rồi `UPDATE accounting_event_versions SET policy_check` — bảng này chỉ được thêm (trigger `accounting_event_versions_no_update`). Sửa: ghi `policy_check` ngay trong câu INSERT (`packages/kernel/.../document.repository.ts`). Test `dieu-chinh-co-chinh-sach.test.ts` tái hiện lỗi trước khi sửa. |
| "Mở lại đơn" báo đỏ "Phiếu NM… đang dựa trên phiếu này" | **Đã sửa.** Nút khoá khi đơn có phiếu nhập chưa huỷ (rê chuột xem phiếu nào); máy chủ chặn cả phiếu nhập nháp / chờ duyệt, lời báo "không mở lại đơn được — huỷ các phiếu nhập trước". |

## 5. Dữ liệu (không thêm bảng)
- `PDoc`: `deliveryWarehouses?`, `invoices?`, `invoicePlan.from?`; `PLine` đã có `branchCode`, `warehouseCode`, `costItem`.
- Lưu trong `purchase_documents.data` (DATA_KEYS + `toDoc`); `invoice_no` cột cũ = hoá đơn đầu (báo cáo cũ, trùng số hoá đơn).
- Lịch sử hoá đơn: nhật ký JSONL sẵn có (`log.ts`, sự kiện `invoice_added / invoice_removed`).

## 6. Thứ tự làm & kiểm thử
| Đợt | Việc | Kiểm thử |
|---|---|---|
| A | Miền: `orderProgress` theo chi nhánh, `invoicePlan.from`, `invoices[]` + SL theo hoá đơn, tách phần ghi sổ theo hoá đơn | Test miền (vitest): đơn 2 chi nhánh cùng mã; phiếu 2 hoá đơn chia SL; hạn hoá đơn theo ngày đơn |
| B | Máy chủ: lưu / đồng bộ `invoice`↔`invoices`, phân tích theo chi nhánh, `inv_qty_diff`, ghi sổ tách k chứng từ, gắn hoá đơn = thêm, Mở lại đơn | Test API: duyệt phiếu 2 hoá đơn → 2 chứng từ kế toán, 2 dòng `tax_invoices`; lệch SL hoá đơn chặn, duyệt ngoại lệ được; điều chỉnh đảo đủ |
| C | Giao diện đơn: giao tại kho nhiều kho, dòng tự điền kho, khoản mục ẩn / ăn theo, mẫu NCC theo chi nhánh, thẻ Tiến độ giao, Trợ lý theo chi nhánh | Chụp màn hình từng bước |
| D | Giao diện phiếu nhập: bỏ thanh chuỗi (vào Trợ lý), 3 cột đối chiếu, bảng nhiều hoá đơn + lịch sử, đối soát 3 bên | Chụp màn hình; lập phiếu từ đơn 2 chi nhánh |
| E | MH21, MH31, Bàn làm việc theo chi nhánh / nhiều hoá đơn | Chụp + test API |
| F | Bộ test mua hàng, 25 tình huống, hợp đồng, hoá đơn NCC, sổ chứng từ; kiểm chuẩn | Toàn bộ đạt mới đẩy |

## 7. Kết quả (21/11/2026)
- Đợt A–E đã làm; test API mới: `phieu-nhap-nhieu-hoa-don` (6 ca), `dieu-chinh-co-chinh-sach`; miền `don-nhieu-chi-nhanh` (7 ca). Bộ mua hàng + chính sách / lõi: 26 tệp, 192 ca đạt.
- Giao diện đã chụp kiểm: đơn 3 nơi nhận (thẻ Tiến độ giao, Trợ lý theo chi nhánh, mẫu NCC 3 thẻ / 3 sheet), phiếu nhập 2 hoá đơn (bảng hoá đơn, chuỗi điều chỉnh, đối soát 3 bên, cột Còn phải nhập / Theo HĐ), phiếu chi nhánh con nhận vượt phần của mình.
- Tình trạng một mã của đơn tính cả phiếu nhập chờ duyệt: "chờ duyệt X — đủ khi duyệt", "chờ duyệt X · thừa Y".
- Danh sách kho ở dòng đơn = kho của chi nhánh nhận của dòng + chi nhánh con (theo cây cơ cấu DM16); hộp "Giao tại kho" hiện cả kho đang dùng ở dòng thuộc chi nhánh ngoài nhánh đầu đơn.
