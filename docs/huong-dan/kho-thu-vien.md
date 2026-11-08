# Kho thư viện (HT14)
<!-- [2026-11-08 12:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-47: hướng dẫn màn HT14 Kho thư viện -->

Menu **Hệ thống → Kho thư viện** (HT14). Ai có quyền xem danh mục đều mở được.

Thư viện là dữ liệu tham chiếu **chung mọi đơn vị**, đi theo bản phần mềm: tham số pháp lý theo ngày (lương cơ sở, tỷ lệ bảo hiểm, biểu thuế…), ngày nghỉ lễ, mã chức năng và vai trò mẫu. Đơn vị **chỉ xem**; giá trị riêng của đơn vị đặt ở Cấu hình hệ thống (HT13). Giải thích chung: [Thư viện dùng chung](thu-vien.md).

## Ba thẻ

- **Tổng quan** — có bao nhiêu thư viện, bao nhiêu mục, bao nhiêu mục đã được duyệt; thư viện nào cần chú ý (còn mục chưa duyệt, bản cuối đã lâu). Từ bản này có **số lượt dùng 30 ngày** <!-- [2026-11-08 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-48 -->: mỗi thư viện bao nhiêu lượt qua / cảnh báo / chặn; mỗi phân hệ, kênh (POS, kết nối…) dùng thư viện thế nào (đỏ khi bị chặn từ 1 % lượt, vàng khi dùng mã ngừng hoặc có cảnh báo); mã thông báo gặp nhiều nhất; số lượt nhập **mã lạ** — gợi ý bổ sung thư viện. Hệ thống chỉ đếm, không lưu giá trị người nhập. Số liệu có thể trễ vài chục giây.
- **Danh sách** — mỗi thư viện một thẻ: loại, bản, ngày phát hành, người duyệt nội dung. Bấm **Mở** để xem chi tiết.
- **Chi tiết thư viện**:
  - *Mục*: ô chọn giống ô chọn trên các phiếu; đổi **Ngày đọc giá trị** để xem giá trị đúng ngày (vd lương cơ sở trước và sau 01/07/2026).
  - *Phiên bản*: các bản đã phát hành và thay đổi; bản đã phát hành không bị sửa.
  - *Luật*: luật kiểm riêng của thư viện, mức (chặn / cảnh báo / nhắc), điều kiện viết bằng lời.
  - *Căn cứ* <!-- [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49a -->: căn cứ của từng mục (văn bản đã liên kết hay chỉ ghi chữ) và đơn vị mình đã **đối chiếu** chưa. Kế toán trưởng / chủ đơn vị bấm **Xác nhận** (ghi lý do, nơi đã đối chiếu) hoặc **Gỡ**. Xác nhận được lưu làm bằng chứng; khi phần mềm cập nhật thư viện mà nội dung mục đó đổi, nhãn chuyển sang "hết hiệu lực" để đối chiếu lại. Thư viện **Căn cứ pháp lý** (`vn.can-cu-phap-ly`) liệt kê các văn bản dùng làm căn cứ, hiệu lực và văn bản thay thế.
  - *Kiểm thử*: nhập mã, giá trị, ngày chứng từ → hệ thống kiểm như khi lưu phiếu và **gợi ý** giá trị đúng; bấm gợi ý để điền. Không ghi gì vào sổ.

## Nhãn

- **chưa duyệt** — giá trị lấy từ nguồn, người giữ thư viện chưa đối chiếu văn bản gốc. Đối chiếu trước khi dùng để tính tiền.
- **ngừng dùng** — mã cũ, vẫn tra được nghĩa cho chứng từ cũ; dữ liệu mới dùng mã thay thế.

Mã thông báo `LIB-…`: xem [Tra mã phát hiện](ma-loi/README.md), mục Cổng L.
