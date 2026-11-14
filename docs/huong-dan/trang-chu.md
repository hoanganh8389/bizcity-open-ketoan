# Trang Tổng quan và phân hệ

Phần mềm chia thành các **phân hệ**, mỗi phân hệ là một "ứng dụng" riêng có menu chức năng của nó:

| Phân hệ | Làm gì |
|---|---|
| Kế toán | Chứng từ, định khoản, sổ sách, công nợ, báo cáo tài chính, khoá sổ |
| Quỹ | Thu chi tiền mặt, ngân hàng, đề nghị thanh toán, sổ quỹ |
| Mua hàng | Nhà cung cấp, mua hàng, trả hàng nhà cung cấp, công nợ phải trả |
| Bán hàng | Khách hàng, bán hàng, hàng bán trả lại, công nợ phải thu |
| Kho | Nhập xuất, chuyển kho, tồn kho, giá vốn, mặt hàng & bảng giá |
| Tài sản | Tài sản cố định, khấu hao, công cụ dụng cụ |
| Thuế | Hoá đơn, bảng kê, tờ khai thuế |
| Hệ thống | Đơn vị, người dùng & phân quyền, khoá API, kết nối |

## Cách dùng

- **Trang Tổng quan** (bấm logo hoặc nút ⊞ trên thanh trên cùng): lưới biểu tượng các phân hệ. Chỉ hiện phân hệ bạn có quyền dùng ít nhất một chức năng.
- **Bấm một phân hệ** → trang chủ phân hệ: các nhóm chức năng dạng thẻ. Menu chức năng của phân hệ cũng hiện ở **thanh bên trái**.
- **Thanh trên cùng** có tên các phân hệ để chuyển nhanh, không cần quay về Tổng quan.
- Một chức năng có thể nằm ở nhiều phân hệ (vd Nhập xuất tồn ở cả Kế toán và Kho; Danh mục mặt hàng ở Kế toán, Bán hàng, Mua hàng, Kho). Mở ở đâu cũng là cùng một màn, cùng dữ liệu.
- Mở một màn bằng ô **Tìm chức năng** (Ctrl + K) hay thẻ đã ghim thì phần mềm tự chuyển sang phân hệ chứa màn đó.
- **Bảng điều khiển số liệu** (doanh thu, thuế, tiền thu, chứng từ lỗi): liên kết dưới lưới phân hệ, hoặc Kế toán → Bảng điều khiển.

## Tìm màn ở đâu

- **Trang Tổng quan** là bảng điều hành: truy cập nhanh (Phân hệ, Hay dùng), tình hình tài chính, lịch công việc. Bấm một ô số để xem báo cáo gốc; bấm một ngày trên lịch để xem việc ngày đó. Ô phân hệ mở trang chủ của nhóm: sơ đồ các bước, bấm bước nào mở màn đó. Hàng **Tiện ích** bên dưới có danh mục liên quan; ở Mua hàng có thêm **Luồng chi tiết**.
- **Menu trái** chia theo việc: Tiền, Mua hàng, Bán hàng, Kho, Công nợ, Tài sản, Thuế, Tổng hợp, Danh mục, Số dư ban đầu. Bấm một nhóm để bung danh sách màn.
- **Thẻ dưới dải màn đang mở** là các màn chính của nhóm đang làm, bấm một lần để chuyển.
- **Báo cáo** nằm ở một trang riêng, mở từ cuối menu trái hoặc thẻ Báo cáo của nhóm.
- **Thanh mép phải** có Việc cần làm (dấu `!` là có việc gấp ở nhóm đang làm), Trợ lý và Thông báo. Bấm icon để mở; đưa chuột ra ngoài hoặc bấm nút thu nhỏ để thu lại; bấm ghim nếu muốn giữ bảng mở.
- Biết mã màn thì bấm Ctrl + K rồi gõ mã, mã vẫn dùng như cũ.

## Đơn vị chưa có chứng từ <!-- [2026-11-14 03:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-3 -->

Đơn vị mới (chưa có bút toán, chưa có chứng từ nào kể cả nháp) thì đầu Tổng quan hiện thẻ **Đơn vị chưa có chứng từ nào** với ba đường bắt đầu:

1. **Nạp danh mục chuẩn**: màn Dữ liệu gốc (TI08), xem trước rồi nạp.
2. **Nhập số dư đầu kỳ**: tiền, công nợ, hàng tồn khi bắt đầu dùng phần mềm.
3. **Lập chứng từ đầu tiên**: phiếu thu, phiếu chi, phiếu mua, bán.

Người không có quyền cài đặt thấy dòng *Đơn vị chưa có dữ liệu — nhờ chủ đơn vị thiết lập*. Có chứng từ đầu tiên là thẻ tự ẩn. Máy chủ trả trạng thái này ở `GET /api/v1/setup/status`.
