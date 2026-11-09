# PHASE-032 · 20 — Phải tách mã hàng và mã tài khoản kế toán
<!-- [2026-11-09 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — W0: điểm dễ thiết kế sai; thành phần định danh của một mặt hàng; hành trình hạch toán theo TT99; luật R-ITEM-10 / R-INV-2; việc sửa tài liệu và dữ liệu -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Đây là điểm **rất dễ thiết kế sai**. Một mặt hàng đi qua nhiều tài khoản kế toán khác nhau trong suốt vòng đời. Vì vậy **không dùng mã tài khoản 156, 632 hoặc 511 làm định danh cố định của hàng hoá**. Cái giữ xuyên suốt, bất biến là `item_id` và **chuỗi tham chiếu chứng từ**, không phải một số hiệu tài khoản.

## 1. Thành phần định danh của một mặt hàng — ví dụ SKU `010-025-001-XD`

| Thành phần | Cách quản lý | Nguyên tắc | Ở đâu |
|---|---|---|---|
| `item_id` | ULID bất biến, cấp một lần | Không đổi trong toàn bộ vòng đời; mọi liên kết kế toán trỏ vào đây | `items.item_id` (0065), R-ITEM-0 |
| `sku` (`010-025-001-XD`) | Mã hàng hiển thị, **có phiên bản + ngày hiệu lực** | Đổi mã = thêm phiên bản; mã cũ vẫn tra được cho chứng từ cũ; không dùng lại cho hàng khác | `item_codes` (kind `sku`), R-ITEM-0 |
| `parent_item_id` | Sản phẩm cha | Nhóm các biến thể để xem tổng; không là khoá kế toán | `items.parent_item_id` (0067), D026-2 |
| `lot_id` / `lot_no` | Lô hàng thực tế, hạn dùng, trạng thái | Phân biệt các lần nhập; FEFO / cách ly / huỷ theo lô | `inventory_lots` (W1), R-INV-3 |
| `warehouse` | Kho lưu hàng | Thay đổi khi chuyển kho; không đổi giá trị trong cùng đơn vị kế toán | `inventory_movements.warehouse_code`, R-INV-8 |
| `posting_group` (nhóm hạch toán) | Thuộc tính phân loại **có phiên bản theo ngày** | Cho biết hàng này dùng TK kho / giá vốn / doanh thu nào **tại ngày**; đổi nhóm không sửa sổ | `item_classification`, R-ITEM-4 / R-ITEM-7 |
| `account_code` (156, 632, 511…) | **Kết quả** tra tại ngày: lý do → nhóm hạch toán → chế độ kế toán (phiên bản) | Xác định theo **nghiệp vụ và chính sách**, không gắn vào hàng; chỉ xuất hiện trên dòng sổ cái | `ledger_lines.account_code`, R-POST-2, R-ITEM-10 |

Nói ngắn: **`item_id` là ai**, **`sku` là tên gọi hiện hành**, **lô là ở đâu / hạn bao lâu**, **nhóm hạch toán là thuộc nhóm nào tại ngày**, **tài khoản là hậu quả kế toán của một nghiệp vụ** — bốn thứ đầu thuộc Master Data và Inventory Engine, thứ cuối thuộc Accounting Kernel.

## 2. Hành trình hạch toán của **cùng một** mặt hàng (TT99/2025)

| Nghiệp vụ | Định khoản thường gặp | Định danh giữ xuyên suốt | Lý do (ví dụ gói nền) |
|---|---|---|---|
| Mua nhập kho | Nợ 156 / Có 331 (thuế Nợ 1331) | cùng `item_id`, tạo lô, tạo lớp `receipt` | `NMH1` |
| Bán hàng | Nợ 111, 131 / Có 511, 3331 | cùng `item_id`, trừ lô, dòng xuất chờ phân bổ | `XBA` |
| Ghi nhận giá vốn (khi settle) | Nợ 632 / Có 156 | cùng `item_id`, phân bổ → lớp | từ `CostingResult` |
| Khách trả hàng nhập lại | Nợ 156 / Có 632 (doanh thu: Nợ 5213 / Có 131) | cùng `item_id`, **đảo đúng phân bổ gốc** | `NTH1` |
| Trả hàng nhà cung cấp | Nợ 331 / Có 156 (chênh lệch theo lý do) | cùng `item_id`, về lớp `receipt` gốc | `XTR1` |
| Huỷ hàng hết hạn | Nợ TK xử lý theo nguyên nhân (1381, 811, 641…) / Có 156 | cùng `item_id`, đúng `lot_id`, lớp theo phương pháp | lý do huỷ |
| Kiểm kê thiếu / thừa | Nợ 1381 / Có 156 · Nợ 156 / Có 3381 | cùng `item_id`, chứng từ kiểm kê, lớp theo phương pháp | `XKK` / `NKK` |
| Chuyển kho cùng đơn vị | Nợ 1579 / Có 156 → Nợ 156 / Có 1579 | cùng `item_id`, phân bổ chuyển lớp, giá trị không đổi | `XCKho` |
| Chuyển giữa hai pháp nhân | bán / mua nội bộ, công nợ 136 / 336 | cùng `item_id` ở cả hai bên (hoặc ánh xạ), lớp mới bên nhận | `XCN` + chính sách giá nội bộ |
| Kết chuyển giá vốn | Nợ 911 / Có 632 | theo kỳ, **đơn vị tài khoản** — không theo mặt hàng | kết chuyển |

Cùng một `item_id` đi qua **156 → 632 → 156 (trả) → 1579 → 156 → 1381 → 911**. Nếu đặt hàng theo "tài khoản 156", hàng "biến mất" khi vào 1579, "đổi bản chất" khi vào 632, và không có cách nào nối lần trả về lần bán. Điều duy nhất không đổi trong suốt hành trình là **`item_id` + chuỗi tham chiếu chứng từ** (`economic_event_id`, `document_line_id`, `original_line_ref`, `cost_allocation_id`).

Số tài khoản trong bảng trên là **ví dụ theo gói nền TT99** — luật định khoản không viết cứng số nào (R-POST-2); đơn vị dùng TT200 hay chế độ khác thì đổi gói, không đổi mô hình.

## 3. Những cách gọi sai hay gặp và cách sửa

| Nói sai | Vì sao sai | Nói đúng |
|---|---|---|
| "hàng 156", "nhóm 632" | tài khoản không là thuộc tính của hàng; cùng hàng sang 1579 / 632 / 1381 | "hàng thuộc nhóm hạch toán *Hàng hoá*; tại ngày này nhóm trỏ TK kho 156, giá vốn 632" |
| "SKU đuôi `M` thì vào 6323" | suy tài khoản từ mã (R-ITEM-4 cấm); đổi mã là sai sổ | "phân loại *khuyến mại* (có phiên bản) → nhóm hạch toán → tài khoản" |
| "lô 156-2026-11" | tên lô mang số tài khoản; lô sang kho khác / huỷ vẫn giữ tên sai | lô = số lô nhà sản xuất / nội bộ, không mang tài khoản |
| "bảng tồn kho có cột `account_code`" | sổ chi tiết lẫn với sổ cái; đổi chế độ phải sửa tồn | tồn theo (kho, `item_id`, lô); tài khoản tra khi đối chiếu (`CT-COST-004`) |
| "doanh thu của mã X" (sau khi X đổi mã) | báo cáo theo mã đứt lịch sử | báo cáo theo `item_id`, hiện mã tại ngày hoặc mã hiện hành (người xem chọn) |

## 4. Luật

- **R-ITEM-10** (mới, [RULE-ITEM](../../rules/RULE-ITEM.md)): mã hàng ≠ mã tài khoản; không dùng số hiệu tài khoản làm định danh / nhóm / tiền tố / tên lô / thuộc tính cố định của hàng; bảng kho / lô / lớp / phân bổ không có cột tài khoản.
- **R-INV-2** ([RULE-INVENTORY](../../rules/RULE-INVENTORY.md)): bảng Engine không có cột tài khoản; tài khoản chỉ trên dòng sổ cái, tra tại ngày.
- Đã có: R-ITEM-0 (định danh bất biến), R-ITEM-4 (không suy tài khoản từ mã), R-POST-2 (không viết cứng tài khoản trong luật), R-MD-2 (ngoài gửi mã, trong lưu định danh; **tài khoản là ngoại lệ** — số hiệu là định danh của chính tài khoản, không của hàng).

Kiểm: **SC-INV-2** (migration bảng Engine không có `account*`), **SC-DOC** mở rộng (tài liệu `docs/**` không có cụm "hàng 156", "nhóm 632", "lô 156" ngoài ví dụ có dấu ngoặc kép như trang này), **SC-ITEM-3** (luật định khoản không import `skuInfo`).

## 5. Việc phải sửa (ghi vào checklist S032-3, S032-4)

| Chỗ | Hôm nay | Sửa |
|---|---|---|
| `docs/nghiep-vu/11-hang-hoa-gia-von-tu-goc.md` §2–§3 | bảng tài khoản "hiểu đơn giản", `NHT01` → 1561 / 6321 / 51111 | giữ, thêm câu *"đây là kết quả tại ngày theo chế độ, không phải thuộc tính của hàng"* và liên kết tới trang này |
| `docs/huong-dan/tinh-gia-von.md` §Ghi sổ | bảng Nợ / Có theo nghiệp vụ | giữ, ghi rõ "ví dụ gói nền TT99; tra theo lý do → nhóm" + mục Kiến trúc tổng thể |
| `docs/can-cu/04-hang-ton-kho-gia-von.md` | "Nợ 156", "Có 632" trong lời văn | thêm chú thích một lần ở đầu: số tài khoản là ví dụ TT99 |
| dữ liệu mẫu / preset | tên nhóm hạch toán có số TK (`NHT01 (1561)`) | tên nhóm không mang số; số hiện ở cột riêng "tại ngày" |
| màn thẻ mặt hàng | "TK kho 1561" cứng | "Hạch toán hôm nay: nhóm → 1561 / 6321 / 51111, theo chế độ v… từ …" (R-ITEM-4 đã tả) |
| tên lô ở mua hàng | tự do | kiểm `lot_no` không khớp `^\d{3,4}\b` kiểu số tài khoản → hint |
