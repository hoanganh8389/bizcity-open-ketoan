# 10. Định danh mặt hàng: đổi mã, gộp mã, lịch sử

Mỗi mặt hàng có một định danh `item_id` không bao giờ đổi. Người dùng làm việc bằng mã. Hệ thống nối dữ liệu bằng định danh, nên đổi tên hay đổi mã vẫn lấy đủ lịch sử để tính giá vốn và làm báo cáo.

Thiết kế đầy đủ: `docs/core/06-xuong-ca-dinh-danh.md`.

## Ba lớp của một mặt hàng

| Lớp | Bảng | Ai dùng | Đổi được không |
|---|---|---|---|
| Định danh | `items.item_id` | Hệ thống, hệ ngoài | Không bao giờ |
| Mã | `item_codes`: mã hàng, mã vạch, bí danh, mã hệ ngoài, có ngày hiệu lực | Người dùng, hệ ngoài | Có, mỗi lần một phiên bản |
| Phân loại | `item_classification`: nhóm hạch toán, thuế, theo ngày | Định khoản | Có, chứng từ cũ giữ phân loại cũ |

## Bảng nào lưu gì

| Nhóm | Bảng | Cột mã hàng nghĩa là | `item_id` |
|---|---|---|---|
| Danh mục | `products` | Mã hiện hành | Có |
| Cấu hình | `product_units`, `product_prices`, `supplier_products`, `supplier_item_aliases`, `stock_levels`, `stock_sku_settings` | Mã hiện hành, đổi mã thì đổi theo | Có |
| Lịch sử | `ledger_lines`, `inventory_movements`, `inventory_costs`, `tax_invoice_lines`, `supplier_invoice_lines` | Mã lúc ghi, không bao giờ sửa | Có |
| Dòng phiếu trong JSON | `purchase_documents`, `transfer_requests`, `stock_max_requests` | Mã lúc lập phiếu | Có, là `itemId` trên từng dòng |
| Bảng ảo | `sales_lines`, `inventory_movements_cur` | Xem chú thích bảng | Có |
| Nguyên bản nguồn | `accounting_events.payload`, `document_versions.snapshot` | Đúng như nguồn gửi | Không gắn: đây là căn cứ so nội dung phiếu. Định danh nằm trên dòng sổ, dòng kho sinh ra từ phiếu |
| Chính sách mua | `purchase_policies.scope`, `rule` | Mã hiện hành trong JSON, đổi mã và gộp mã thì đổi theo | Không gắn |

Bảng mới có cột mã hàng mà thiếu `item_id` thì bộ test báo đỏ.

## Ba cách hỏi

| Câu hỏi | Cách lấy | Kết quả |
|---|---|---|
| Toàn bộ lịch sử sản phẩm | Lọc bằng mã bất kỳ (mã cũ, mã đã gộp đều được) | Một dòng liền qua mọi lần đổi mã, gộp mã |
| Chỉ phần ghi dưới một mã | Sổ kế toán: thêm `codeOnly=true`. Sổ kho: cột `snapshot_sku` | Chỉ các dòng lúc đó mang mã này |
| Cả họ cha – con | `items.parent_item_id` | Cộng dồn, không sửa dòng nào |

## Đổi mã

Mở mặt hàng, bấm **Đổi mã**, nhập mã mới và lý do. Có hiệu lực từ hôm nay.

- Sổ và chứng từ cũ vẫn ghi mã cũ.
- Đơn vị tính, bảng giá, giá nhà cung cấp, tồn max, chính sách mua chuyển sang mã mới.
- Gõ mã cũ vẫn tìm ra mặt hàng này. Chứng từ gửi mã cũ vào vẫn ghi đúng mặt hàng, không sinh hàng mới.

## Gộp mã

Mở mặt hàng bị gộp, bấm **Gộp mã**, nhập mã mặt hàng giữ lại, bấm **Kiểm tra**, rồi nhập lý do.

- Mặt hàng cũ giữ định danh, chuyển sang ngừng dùng, trỏ sang mặt hàng giữ lại qua `merged_into_item_id`.
- Sổ cũ không dòng nào bị sửa. Báo cáo gom một dòng qua `root_item_id`.
- Mã cũ thành bí danh của mặt hàng giữ lại, từ ngày gộp.
- Gộp được nhiều lần: A vào B, sau đó B vào C. Chuỗi cũ giữ nguyên, tra mã A theo ngày ra đúng mặt hàng tại ngày đó.

Không gộp được khi: mặt hàng bị gộp còn tồn, khác đơn vị tính gốc, hoặc mặt hàng giữ lại đã ngừng dùng. Còn tồn thì lập chứng từ chuyển tồn trước: danh mục không tự sinh bút toán.

## Lịch sử

Thẻ **Lịch sử** trên form mặt hàng: lúc thao tác, ngày hiệu lực, người làm, nội dung, gồm cả các thay đổi của mặt hàng đã gộp vào.

## Hệ ngoài (web bán hàng, phần mềm khác)

1. Lần đầu: gọi `GET /api/v1/items/resolve?code=<mã>` để lấy `itemId` và lưu lại. Hoặc khai mã bên đó bằng `POST /api/v1/items/add-code`, loại `external:woocommerce`.
2. Gửi chứng từ: mỗi dòng gửi `sku`, hoặc `itemId`, hoặc cả hai. Gửi `itemId` thì đổi mã không ảnh hưởng. Gửi cả hai mà khác mặt hàng thì bị từ chối.
3. Đồng bộ danh mục: mỗi mặt hàng trả thêm `itemId`, `parentItemId`. Mã bị bỏ trả `replacedByItemId`.
4. Đọc theo định danh: `GET /api/v1/items/:itemId`.
