# Thiết kế hạch toán (ACC92)

<!-- [2026-11-10 09:00 PM Nguyễn Văn Thủy] PHASE-026 — thiết kế hạch toán (đóng góp) -->
<!-- [2026-11-10 04:30 PM Nguyễn Văn Thủy] PHASE-026 — viết lại theo bảng quy tắc định khoản (đóng góp) -->

Một chỗ để **nhìn và quyết định khoản** cho mọi nghiệp vụ: phiếu thuộc nghiệp vụ nào, có điều kiện gì, quy tắc nào bắt, ra bút toán gì.

## 1. Ba thứ cần biết

| | Là gì |
|---|---|
| **Nghiệp vụ** | Bán hàng, Khách trả hàng, Nhập mua, Trả NCC, Chuyển kho, Nhập / Xuất điều chỉnh kho, Thu tiền, Chi tiền. Kế toán **tự thêm** được nghiệp vụ riêng (vd *Xuất quà tặng NCC*). |
| **Quy tắc** | Một câu: *Khi* [nghiệp vụ] *có* [điều kiện] *thì khoản* [tiền hàng / thuế / giá vốn / tiền thanh toán] *ghi* Nợ … Có … |
| **Tài khoản tự tra** | Khoản không có quy tắc nào khớp thì dùng tài khoản ngầm định, tài khoản của loại thuế, của hình thức thanh toán như trước. Chưa khai quy tắc nào thì sổ không đổi gì. |

## 2. Quy tắc nào thắng

1. Chỉ xét quy tắc **đã duyệt**, có **hiệu lực tại ngày chứng từ**, khớp **mọi** điều kiện đã điền. Điều kiện để trống = mọi trường hợp.
2. **Cụ thể hơn thắng**: quy tắc của nghiệp vụ tự tạo thắng quy tắc của nghiệp vụ gốc; quy tắc nhiều điều kiện hơn thắng quy tắc ít điều kiện.
3. Ngang nhau thì xét **Ưu tiên** (số lớn thắng). Vẫn ngang nhau thì phần mềm **không cho lưu** — thêm điều kiện hoặc đặt ưu tiên khác.
4. Ô Nợ / Có của quy tắc **để trống** = giữ tài khoản tự tra cho bên đó.

Điều kiện dùng được: **Loại hàng** (Hàng bán, Quà, Vật tư, Dịch vụ… — ô Loại hàng của mặt hàng), **Loại thuế**, **Hình thức thanh toán**, **Hàng tặng**, **Loại chương trình** (KM của NCC, KM của công ty, Xả hàng cận date…), **Chương trình** (đúng một chính sách NCC / chương trình bán), **Chiều chuyển kho**, **Cùng đơn vị hạch toán**.

> Ví dụ: cùng là ly tặng, nhưng *Loại chương trình = KM của NCC* ghi một kiểu, *KM của công ty* ghi kiểu khác — không cần tách nhóm hàng hay tạo mã mới.

## 3. Thẻ "Sơ đồ định khoản"

Bên trái chọn nghiệp vụ. Bên phải là một **phiếu mẫu chạy qua đúng bộ định khoản thật**:

**Chứng từ mẫu → Điều kiện của phiếu → Quy tắc → Bút toán → Sổ cái**

- Đổi **Loại hàng, Loại thuế, Hình thức, Chương trình, Hàng tặng, Ngày** ở thanh trên để xem quy tắc nào bắt.
- Quy tắc **viền xanh** = thắng. Quy tắc mờ = cũng khớp nhưng ít cụ thể hơn. Ô **Tài khoản tự tra** = khoản không có quy tắc.
- Ở bút toán, tài khoản **nền xanh** là do quy tắc đặt, số **gạch ngang** bên cạnh là tài khoản tự tra bị đè.
- **Bấm một bút toán** để thêm quy tắc cho khoản đó. **Bấm một quy tắc** để xem, duyệt, đề xuất sửa.
- Nút **+ Thêm nghiệp vụ**: đặt tên, chọn *Dựa trên* (vd Xuất điều chỉnh kho), nhập *Mã*. Mã này thành lý do chứng từ: lập phiếu chọn lý do đó thì phiếu đi theo nghiệp vụ mới.

## 4. Đề xuất và duyệt

- Thêm / sửa quy tắc là **đề xuất** (trạng thái *Chờ duyệt*), chưa áp vào chứng từ nào. Hộp khai báo có ô **Chạy thử** cho thấy bút toán trước → sau ngay khi chọn tài khoản.
- Người có quyền cấu hình (kế toán trưởng, chủ đơn vị) bấm **Duyệt** thì quy tắc áp cho chứng từ **từ ngày hiệu lực**. **Từ chối** phải ghi lý do.
- Quy tắc đang áp **không sửa thẳng**: bấm **Đề xuất sửa**, chọn ngày hiệu lực mới. Duyệt xong, bản cũ tự đóng ở ngày đó — chứng từ trước ngày đó (kể cả khi định khoản lại) vẫn theo bản cũ.
- **Ngừng áp** từ một ngày: chứng từ trước ngày đó giữ nguyên.
- Quy tắc đã duyệt **không xoá** được (chứng từ cũ còn theo nó). Đề xuất chưa duyệt thì xoá được.

## 5. Thẻ "Quy tắc" và "Lịch sử thay đổi"

- **Quy tắc**: lọc theo nghiệp vụ, theo trạng thái (Chờ duyệt, Đang áp, Sắp áp, Đã đóng, Từ chối). Dòng vàng = chờ duyệt.
- **Lịch sử thay đổi**: ai đề xuất, ai duyệt / từ chối, lúc nào, nội dung gì.

## 6. Lưu ý

- Lõi vẫn kiểm mọi bút toán: Nợ = Có, tài khoản phải là tài khoản chi tiết đang dùng, tài khoản công nợ phải có đối tượng, kỳ chưa khoá. Quy tắc trỏ tài khoản sai thì phiếu bị chặn và báo rõ.
- Giá vốn hàng bán ghi ở **phiếu giá vốn cuối tháng** — phiếu đó cũng đi theo quy tắc khoản *Giá vốn* (theo hàng tặng, nghiệp vụ).
- Nhóm hạch toán mặt hàng và màn Lý do – Tài khoản đã ẩn khỏi menu; tài khoản theo mặt hàng không cần khai nữa.
