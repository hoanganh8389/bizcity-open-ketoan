# 09. Tồn max, chuyển hàng shop và đặt mua hàng theo chi nhánh

Đây là tài liệu ghi nhớ luồng mua hàng thực tế ở chi nhánh, viết để không phải giải thích lại.
- Phần A: luồng nghiệp vụ.
- Phần B: cách làm trên ERP.
- Phần C: những gì ghi lại khi khảo sát website bán hàng (multisite). Website chỉ dùng để tham khảo; **ERP là nơi làm chuẩn**: phân cấp, tồn max, công thức, đơn đặt đều nằm ở ERP.

---

## A. Luồng nghiệp vụ

### A1. Phân cấp: chi nhánh cha → shop (2 cấp)

- Công ty có nhiều **chi nhánh cha**, ví dụ Phú Thọ `08000`. Chi nhánh cha là nơi có **kho tổng**.
- Mỗi chi nhánh cha có các **shop con**. Một chi nhánh cha có thể có tới ~70 shop.
- **Mua hàng được làm ở chi nhánh cha:**
  1. NCC giao hàng về kho của chi nhánh cha.
  2. Kho chia hàng xuống shop bằng phiếu chuyển kho.
- Mỗi shop thường có **một kho** (kho mặc định). Chi nhánh cha có **nhiều kho**: kho hàng, kho khuyến mại, kho chờ xử lý, kho luân chuyển…
- Chỉ có 2 cấp: chi nhánh cha và shop. Shop không có shop con.

### A2. Tồn max là gốc của mọi thứ

- **Max quan trọng hơn min.**
  - Shop chỉ cần max.
  - Kho cần max, min thì có cũng được.
- Max luôn khai theo **(chi nhánh / shop, kho, mã hàng)**. Lý do: chi nhánh cha có nhiều kho, max đi theo kho.
- **Shop đăng ký max 2 lần / tháng** bằng phiếu đăng ký tồn max:
  - Gợi ý max lấy từ **tốc độ bán**, tức số bán trung bình 1 ngày. Mặc định đo trong 7 ngày gần nhất, đặt được riêng cho từng mã.
  - Max gợi ý = bán / ngày × số ngày cần đủ hàng, rồi làm tròn theo quy cách.
- **Kho không bán hàng** nên không có tốc độ bán. Max kho gợi ý = tổng max các shop con + % dự phòng.
- Phiếu đăng ký max có danh sách để **duyệt**:
  - Duyệt xong thì max được ghi vào hệ thống.
  - Có thể cài **duyệt tự động** khi max mới lệch max cũ không quá X%.
- **API tồn max** dành cho POS:
  - POS đọc max của shop.
  - POS gửi phiếu đăng ký max lên ERP.
- **Hàng mới** là mã chưa từng về kho, NCC gửi mẫu Excel để đăng ký.
  1. Chi nhánh cha tạo **phiếu đăng ký max hàng mới**, chưa cần mã hàng: chỉ cần tên, mã bên NCC, quy cách.
  2. Các shop điền max vào bảng *mặt hàng × shop* để xem nhu cầu.
  3. Chị mua hàng gửi đơn cho NCC.
  4. Hàng về kho thì mới tạo mã hàng.
  5. Có mã rồi thì **gắn ngược** mã vào phiếu đăng ký và đơn đặt.
  6. Max của hàng mới được áp vào hệ thống khi đã có mã.

### A3. Chuyển hàng kho → shop tự động

- Mỗi shop được chia hàng **2 lần / tuần**.
- Đề xuất chuyển tự tính: **cần chuyển = max shop − tồn shop − hàng đang đi đường đến shop**.
- Làm tròn hợp lý theo **ĐVT trung gian** (thùng). Bình thường chuyển nguyên thùng, chỉ một số mã mới chuyển lẻ. Cách làm tròn đặt được cho từng mã:
  - **Tự động** (mặc định): thiếu từ nửa thùng trở lên thì làm tròn lên thùng; ít hơn thì chuyển lẻ, hoặc chờ lần sau nếu mã đó chỉ chuyển nguyên thùng.
  - **Luôn nguyên thùng.**
  - **Luôn lẻ.**
- Không chuyển quá số kho đang có. Kho không đủ thì ưu tiên shop thiếu nhiều nhất so với max.
- Kế toán kho **quét danh sách đề nghị chuyển** này để lên phiếu chuyển kho, hoặc kho / POS đọc qua API.
- **Hàng đi đường** là hàng đã xuất ở đầu đi nhưng đầu nhận chưa xác nhận. Đầu đi bị trừ tồn ngay khi lập phiếu xuất, đây là luồng đã có. Số đi đường = số xuất − số đã nhận.

### A4. Công thức đặt mua (cho chi nhánh cha)

Công thức đang dùng thực tế, cột "Số lượng cần nhập tháng này":

```
SL cần nhập = (Tồn max kho − Tồn kho − Hàng đi đường về kho − Hàng đi đường xuống shop)
            + (Tổng tồn max shop − Tổng tồn shop)
            + Doanh số 1 tuần của toàn bộ shop          ← dự phòng
            − SL mua chưa nhập kho                     ← đơn đã đặt, chưa về
```

- **BH tháng liền kề** (bán tháng trước) chỉ để tham khảo, không vào công thức.
- **SL mua chưa nhập kho**: phần còn lại chưa về của mọi đơn đặt đang mở, **của mọi NCC**, cho mã đó, trong chi nhánh cha. Nếu không trừ thì đặt nhiều đơn sẽ thừa hoặc thiếu. Một mã có thể mua ở nhiều NCC nên phải tính chung cho mọi NCC.
- **Số âm** nghĩa là đang dư hàng, không cần đặt.
- **Công thức phải cài được**, và mỗi chi nhánh cha có công thức riêng. Ví dụ chi nhánh khác không cộng doanh số 1 tuần, hoặc cộng 2 tuần. Trang công thức cho chọn:
  - kho nào tính vào **tồn kho** (vd kho hàng + kho khuyến mại) và kho nào lấy **max kho**;
  - danh sách kho của từng shop (thường mỗi shop một kho);
  - từng thành phần bật / tắt, dấu, hệ số, số ngày;
  - tính phần shop theo **cộng gộp** (shop dư bù shop thiếu, cách đang dùng) hay **chỉ cộng phần thiếu** từng shop;
  - làm tròn số gợi ý mua theo quy cách thùng;
  - (đã bỏ) mã có đuôi không còn "bỏ qua": mã con (đuôi Z, Q, K, M, T, B… có mã gốc trong danh mục) cộng dồn vào mã cha — họ mã 1 cấp, tự quét theo mã.
- Trang công thức hiện **công thức bằng chữ** và **ví dụ tính với một mã thật**.

### A5. Phân tích đặt hàng và đơn đặt mua

- Bảng phân tích có các cột:
  - Mã hàng, Tên, Đơn giá chưa VAT, CTKM;
  - **SL cần nhập**, BH tháng liền kề, Doanh số 1 tuần;
  - Tồn max kho, Tồn kho, Hàng đi đường, SL mua chưa nhập kho;
  - Tồn max shop, Tồn shop.
- Hàng được **nhóm theo nhãn + NCC**, dòng tiêu đề nhóm dạng `Nutricare │ NC100625 – Công ty CP phân phối và logistics Hùng Cường`. Cách này dễ nhìn, dễ chia việc.
- Lọc nhanh: **mã cần nhập** (số dương) / **mã đang dư** (số âm).
- Chọn dòng của một NCC → **lập đơn đặt**. SL gợi ý làm tròn theo quy cách thùng; hiện 2 lựa chọn làm tròn xuống / lên, như "30 / 36".
- **Đơn đặt mua** có đủ cột tồn như phân tích, cùng các phần sau:
  - **Ghi chú từng dòng.** Ghi chú khai sẵn ở mặt hàng của NCC thì tự điền vào.
  - **Ngân sách mua** để ước lượng: tổng sau CK so với ngân sách → còn / vượt bao nhiêu.
  - Ngày giao, giao tại kho nào.
  - **Dòng hàng mới**: chưa có mã, chỉ có tên + mã bên NCC + ĐVT + quy cách. Không bắt phải khai mã hàng trước.
  - **Xem trước dạng mẫu Excel** (màu sắc như mẫu NCC đã quen) và **xuất Excel đúng mẫu đó** để gửi NCC.
- **NCC thực tế không giao đủ**, giao thừa hoặc thiếu. Phiếu nhập kho kế thừa đơn đặt, theo dõi tiến độ còn bao nhiêu chưa về (đã có). Dòng hàng mới phải **gắn mã** trước khi duyệt phiếu nhập; gắn xong thì ghi ngược mã vào đơn đặt.

### A6. Mặt hàng của NCC, tệp đính kèm

- Mặt hàng NCC quản lý có:
  - **Mã bên NCC** + **Tên hàng bên NCC**. Hai thông tin này để sau tích hợp AI: hoá đơn đỏ về kho, quét là tự nhận ra mã của mình.
  - **Ghi chú**, tự điền vào ghi chú dòng đơn đặt.
- Tệp đính kèm (hợp đồng, báo giá, mẫu Excel NCC) **xem nhanh ngay trên web**, không phải tải về: PDF, ảnh và Excel xem trực tiếp.

---

## B. Làm trên ERP

### B1. Bảng dữ liệu (migration 0020)

| Bảng / cột | Để làm gì |
|---|---|
| `branches.parent_id`, `branches.level` | Phân cấp 2 cấp: `level = 'branch'` (chi nhánh cha, có kho tổng) hoặc `'shop'`; shop trỏ `parent_id` về chi nhánh cha. Lần đầu tự xếp theo mã: mã `xx000` là chi nhánh cha, mã cùng 2 số đầu là shop con. |
| `stock_levels` | Tồn max / min theo (chi nhánh, kho, mã hàng). Một nơi khai duy nhất, thay chính sách cũ "Tồn min–max". |
| `stock_sku_settings` | Riêng từng mã: số ngày đo tốc độ bán, số ngày cần đủ hàng, cách làm tròn khi chuyển (tự động / nguyên thùng / lẻ). Trống = theo cài đặt chung của công thức. |
| `stock_max_requests` | Phiếu đăng ký tồn max: loại `existing` (mã đã có, shop đăng ký) / `new_item` (hàng mới, bảng mặt hàng × shop). Dòng hàng nằm trong `data` jsonb. Trạng thái: `draft` → `submitted` → `approved` / `cancelled`; khi duyệt thì max được ghi luôn. |
| `order_formulas` | Công thức đặt hàng của từng chi nhánh cha (`config` jsonb: kho tính tồn, kho lấy max, các thành phần, làm tròn, đuôi bỏ qua). |
| `transfer_requests` | Đề nghị chuyển hàng kho → shop đã chốt (dòng trong `data`), trạng thái `open` → `done` / `cancelled`. Kế toán kho / API quét danh sách này. |
| `supplier_products.ncc_name` | Tên hàng bên NCC (đi cùng `ncc_sku`, `note` có sẵn). |
| Dòng phiếu mua (`lines` jsonb) | Thêm `note`, `pack` (quy cách), `nccSku`, `nccName`, `newItem` (dòng hàng chưa có mã). Phiếu: `budget`, `deliveryDate`, `deliveryWarehouse`. |

Số liệu tồn đều tính từ `inventory_movements`:
- **Tồn** theo (chi nhánh, kho, mã) = tổng `qty`.
- **Bán / ngày** = −tổng `qty` của `sale` + `sale_return` trong N ngày ÷ N.
- **Đi đường** = xuất chuyển − đã nhận, theo cặp phiếu chuyển (cùng cách bảng kê chuyển kho), tính về **đầu nhận**.
- **Chưa nhập kho** = phần còn lại của đơn đặt đang mở (`orderProgress`).

### B2. Màn hình (phân hệ Mua hàng)

| Mã | Màn | Ghi chú |
|---|---|---|
| MH15 | Phân cấp chi nhánh – shop | Cây chi nhánh cha → shop: chọn cha, kéo / chọn shop vào, tự xếp theo mã, tìm, nhập / xuất Excel; đếm số shop, số kho. |
| MH16 | Tồn max | Chọn chi nhánh cha. Chế độ **theo shop** (mỗi mã: tồn, bán / ngày, gợi ý max, max hiện tại sửa được) và **theo mã** (một mã: kho + mọi shop). Áp gợi ý hàng loạt, nhập / xuất Excel theo mẫu, khai riêng tốc độ bán từng mã. |
| MH17 | Phiếu đăng ký tồn max | Danh sách theo ngày, không phân trang; tạo phiếu cho shop (gợi ý sẵn) hoặc phiếu hàng mới (bảng mặt hàng × shop); duyệt / duyệt tự động; gắn mã cho hàng mới. |
| MH18 | Công thức đặt hàng | Cài công thức cho từng chi nhánh cha; xem công thức bằng chữ + ví dụ một mã; danh sách kho của chi nhánh và của từng shop. |
| MH02 | Phân tích đặt hàng | Bảng kiểu Excel nhóm theo nhãn + NCC (thay màn đề xuất cũ); lọc cần nhập / đang dư; chọn → lập đơn đặt. |
| MH20 | Nhập dữ liệu khởi đầu | ① giá mua NCC từ dòng phiếu nhập ② cân tồn → phiếu điều chỉnh kho +/− từng kho ③ tồn max. Cột Kho = mã kho DM12. |
| MH19 | Đề xuất chuyển hàng shop | Theo chi nhánh cha: shop nào thiếu bao nhiêu, làm tròn thùng, giới hạn theo tồn kho; chốt thành đề nghị chuyển; danh sách đề nghị để kho quét. |
| MH03 | Đơn đặt mua (trong Chứng từ) | Thêm cột tồn, ghi chú dòng, ngân sách, dòng hàng mới, xem mẫu Excel NCC, xuất Excel mẫu NCC. |

Màn nào cũng có nút Hướng dẫn (`docs/huong-dan/mua-hang-*.md`), mẫu nhập Excel, xuất Excel và cột kéo giãn (DataGrid).

### B3. API (dùng chung cho POS / website)

```
GET  /api/v1/stock/hierarchy                         cây chi nhánh cha → shop (+ kho)
PUT  /api/v1/stock/hierarchy                         lưu phân cấp
GET  /api/v1/stock/levels?branchCode=&skus=          tồn max / min
PUT  /api/v1/stock/levels                            ghi hàng loạt (nhập Excel, áp gợi ý)
GET  /api/v1/stock/velocity?branchCode=&days=        bán / ngày theo mã
GET  /api/v1/stock/max-requests?from=&to=&status=    phiếu đăng ký max
POST /api/v1/stock/max-requests                      tạo (POS gửi lên)
POST /api/v1/stock/max-requests/:id/approve          duyệt (ghi max)
GET  /api/v1/stock/formulas/:branchCode              công thức
PUT  /api/v1/stock/formulas/:branchCode
GET  /api/v1/stock/order-analysis?branchCode=        phân tích đặt hàng theo công thức
GET  /api/v1/stock/transfer-suggest?branchCode=      đề xuất chuyển hàng shop
GET  /api/v1/stock/transfer-requests?status=         đề nghị chuyển đã chốt (kho / POS quét)
POST /api/v1/stock/transfer-requests                 chốt đề nghị
```

---

## C. Ghi nhớ khi khảo sát website (multisite)

- **Phân cấp**:
  - Plugin `tgs-multisite-hierarchy`, trang `view=multisite-hierarchy-setup`.
  - Lưu JSON cây trong option `tgs_multisite_hierarchy_data`.
  - Site có con = kho (`is_warehouse_blog`).
- **Tồn max / min**:
  - Bảng `wp_global_sku_stock_config(product_sku, blog_id, site_type 0 = shop / 1 = kho, min_qty, max_qty, config_note)`.
  - **Không có kho trong khoá.** Đây là điểm ERP làm lại cho đúng: max theo kho.
- **Tốc độ bán**:
  - Bảng `wp_global_sku_sell_speed_config`: cửa sổ ngày min / max, theo mã, có mặc định cho shop và cho kho.
  - Bán / ngày = tổng bán trong cửa sổ ÷ số ngày.
  - Gợi ý max shop = làm tròn lên của bán / ngày.
  - Gợi ý max kho = tổng max shop con + % dự phòng.
- **Phiếu đăng ký max**:
  - Mã có sẵn: shop gửi → kho duyệt (sửa được) → ghi max.
  - Hàng mới: kho tạo phiếu mặt hàng × shop → shop điền → kho duyệt → gắn mã khi có → ghi max.
  - Trạng thái: nháp / chờ duyệt / đã duyệt / đã huỷ / đã cập nhật max.
  - Có gửi mail kèm Excel.
- **Phân tích mua hàng** (`view=purchase-analysis`):
  - Công thức ở mục A4.
  - Bỏ mã đuôi `Z` / `M`.
  - Thứ tự và nhóm dòng theo bảng bố cục (nhóm, NCC, thứ tự).
  - SL mua chưa nhập = tổng SL các đơn mua đang mở (chưa duyệt hoặc đã duyệt) của mã.
- **Tạo phiếu mua hàng**:
  - Mẫu Excel đơn đặt hàng:
    - tiêu đề "ĐƠN ĐẶT HÀNG";
    - khối Mã NPP / Tên NPP / Địa chỉ / Điện thoại;
    - Ngày giờ ĐH / Ngày giao / Giao tại kho;
    - dòng "Bộ phận mua hàng đề nghị Quý Nhà phân phối xuất hàng và hoá đơn khi giao hàng".
  - Cột của bảng:
    - STT, Mã SP, Mã vạch, Tên SP, Quy cách ĐVT / thùng, ĐVT, Đơn giá chưa VAT;
    - SL Mua / KM;
    - **SL cần nhập** (nền cam `#FFC000`), **Tồn kho** (nền vàng `#FFF200`), SL mua chưa nhập kho;
    - Phân tích thông minh: BH tháng liền kề, Doanh số 1 tuần, Tồn max kho, Hàng đi đường, Tồn max shop, Tồn shop;
    - % CK, Thành tiền CK, Thành tiền sau CK, Ghi chú.
  - Dòng "A – TỔNG TRỊ GIÁ HÀNG ĐẶT".
  - Font Times New Roman, khổ ngang.
  - Ô nhập SL mua gợi ý bội số quy cách (xuống / lên).
  - Ngân sách mua: còn / vượt.
- POS có màn "Đăng ký tồn max cho sản phẩm mới" (`tgs_pos/includes/stock-max`).
