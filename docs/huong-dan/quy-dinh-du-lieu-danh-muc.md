# Quy định dữ liệu danh mục (HT09)
<!-- [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09: hướng dẫn màn Quy định dữ liệu danh mục (duyệt luật nhắc, tự thêm mặt hàng) -->

Màn của **kế toán trưởng** (và chủ đơn vị). Ở đây đơn vị quyết định hai việc:

1. mặt hàng mới đến từ chứng từ của hệ thống bán hàng vào sổ thế nào;
2. khung **Vì sao** trong form danh mục nhắc người nhập điều gì.

Người khác mở được màn để xem, nhưng không thấy nút.

## 1. Mặt hàng mới từ chứng từ

| Chế độ | Khi chứng từ mang mã hàng lạ |
|---|---|
| **Bật** (mặc định) | Mặt hàng được thêm vào danh mục và chứng từ vào sổ ngay, theo nhóm hạch toán mặc định. Kế toán **được nhắc**: thông báo "Chứng từ … đã tự thêm n mặt hàng — cần kiểm" (nêu mặt hàng thiếu đơn vị tính, ghi theo nhóm mặc định) và dải nhắc ở danh sách mặt hàng. |
| **Tắt** | Phần mềm tạo **mặt hàng nháp** (điền sẵn tên, đơn vị tính từ dòng). Chứng từ chờ ở **Trạm kiểm tra** với mã [IN-ITEM-001](loi-dau-vao/IN-ITEM-001.md) tới khi kế toán kích hoạt mặt hàng. |

Mọi đơn vị, kể cả đơn vị mới, mặc định **bật**: việc bán hàng không dừng, sai thì nhắc (luật chung R-GATE-9 — mặc định cho phép, nhắc khi sai). **Tắt** là quyết định của kế toán trưởng khi đơn vị muốn kiểm mặt hàng mới trước khi vào sổ.

**Trước khi tắt**, xem dòng tóm tắt ngay trên màn: "7 ngày qua, chứng từ đã tự thêm N mặt hàng — X thiếu đơn vị tính, Y chưa có nhóm hạch toán". Danh sách mặt hàng (DM10) cũng hiện dải nhắc này.

**Khi tắt**:
- Cửa hàng vẫn bán bình thường. Chứng từ vẫn được nhận, chỉ chưa vào sổ nếu có mã mới.
- Kế toán có thêm việc kích hoạt mặt hàng nháp. Ở danh sách mặt hàng có nút **Kích hoạt hàng loạt**: chọn nhiều mặt hàng, điền một lần đơn vị tính / nhóm hạch toán cho những ô còn trống. Mặt hàng nào vẫn thiếu thì giữ nháp và được liệt kê.
- Nên báo trước bên tích hợp POS để họ đồng bộ danh mục trước khi gửi chứng từ.

Đổi chế độ bắt buộc ghi lý do; mỗi lần đổi có trong nhật ký.

## 2. Duyệt luật nhắc

Mỗi luật hiện **đúng như người nhập thấy trong form**, với giá trị minh hoạ. Các tab Tài khoản / Đối tượng / Mặt hàng ghi số đã duyệt trên tổng, để duyệt từng nhóm nhỏ.

| Nút | Tác dụng |
|---|---|
| **Đồng ý** | Bỏ nhãn "nội dung nháp" của luật ở đơn vị bạn. |
| **Sửa câu chữ** | Viết lại câu ngắn / vì sao / cách sửa. Chỉ dùng được các biến của luật gốc (ví dụ `{code}`, `{root}`); phần mềm thay bằng giá trị thật. Ô để giống mặc định thì đi theo bản mặc định. |
| **Hạ xuống nhắc** | Chỉ có với **cảnh báo mềm**. Ở đơn vị bạn, cảnh báo thành nhắc: người lưu không phải ghi lý do nữa. Bắt buộc ghi lý do quyết định. |
| **Bỏ hạ mức** / **Về mặc định** | Quay lại như trước. |

- **Mức chặn không hạ được**: chặn chỉ dùng cho lỗi làm hỏng dữ liệu, ví dụ thiếu đơn vị tính gốc.
- Luật chưa duyệt vẫn chạy như hiện nay, chỉ mang nhãn "nháp".
- Bản phát hành sau sửa câu chữ hoặc mức của một luật thì bản duyệt cũ **hết hiệu lực**: luật hiện "luật đã đổi — cần duyệt lại".
- Mỗi lần duyệt ghi nhật ký `catalog.rule.review`: ai, lúc nào, quyết định gì, lý do.

Quyền: đổi tự thêm mặt hàng cần quyền **Cấu hình** (settings:write); duyệt luật cần quyền **Duyệt kiểm chuẩn** (conformance:approve), tức kế toán trưởng / chủ đơn vị.
