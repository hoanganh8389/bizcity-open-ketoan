# Đối tượng (DM03), nhóm đối tượng (DM08)

Khách hàng, nhà cung cấp, nhân viên, đơn vị nội bộ — dùng để theo dõi công nợ.

## Đối tượng từ đâu ra

- **Tự tạo** khi chứng từ gửi kèm thông tin khách (mã thường là số điện thoại). Gửi lại với thông tin mới thì tự cập nhật; ô bỏ trống không xoá thông tin cũ.
- Hệ thống bán hàng, mua hàng có thể **đồng bộ cả danh mục** qua API (`PUT /api/v1/partners`, tối đa 1000 đối tượng một lần).
- Chứng từ không có khách → gắn đối tượng **KHACH-LE** (Khách lẻ).

## Màn hình

Ngoài màn **Đối tượng (DM03)** gồm mọi kiểu, có hai màn tách riêng theo kiểu (cùng cách dùng, cùng form):

| Màn | Hiện | Thêm mới |
|---|---|---|
| **Khách hàng (DM12)** | Đối tượng kiểu khách hàng | Thuộc kiểu sẵn là Khách hàng |
| **Nhà cung cấp (DM13)** | Đối tượng kiểu nhà cung cấp | Thuộc kiểu sẵn là Nhà cung cấp |

Ở các màn này ô lọc "Mọi loại" ẩn đi, ô lọc nhóm chỉ còn nhóm của kiểu đó, tên cột theo kiểu (Mã NCC, Tên NCC…). Mã tự động vẫn theo nhóm (xem dưới). Khách hàng còn ở menu Bán hàng → Danh mục bán hàng; Nhà cung cấp ở Mua hàng → Danh mục mua hàng.


Thanh nút: Thêm (Ctrl+N) · Sửa (Ctrl+E, hoặc bấm đúp dòng) · Xoá (Ctrl+Delete) · Nạp (F5) · Xuất · ô **Tìm nhanh** (mã, tên, alias, mã số thuế, điện thoại, tên công ty, tìm trên toàn danh mục) · lọc nhóm, loại, trạng thái.

Lưới theo thứ tự cột của danh mục khách hàng: Mã KH, Tên KH, Địa chỉ NR, Điện thoại, Di động, Nhóm KH, Người đại diện, Địa chỉ cty, MST, Fax, Email, Website, Chức vụ, Ngày tạo KH, Theo dõi, Người QL, Chi nhánh QL, Ghi chú, Tên viết tắt, Tên công ty, Tài khoản NH, Chủ TK, Mở tại, Giới hạn nợ, Giới hạn ngày nợ, Giới hạn số phiếu nợ, Người tạo. Danh sách hiện toàn bộ đối tượng (không phân trang).

Form **Khách hàng / Nhà cung cấp** (giống màn của HTsoft):
- **Thuộc kiểu** (đầu form): khách hàng, nhà cung cấp, nhân viên, nội bộ, khác. Nhóm chỉ hiện các nhóm khai cho kiểu đó.
- **Thông tin chung**:
  - Ngày tạo KH, **Thuộc nhóm (\*)**, **Mã (\*)**; Khách hàng tiềm năng, Ghi chú.
  - Thông tin cá nhân: tên, địa chỉ, mobile, telephone, ngày sinh, giới tính, email, loại khách hàng (cá nhân / doanh nghiệp).
  - Thông tin công ty: tên công ty, tên viết tắt, alias (tên gọi khác, tìm nhanh được theo alias), địa chỉ công ty, mã số thuế, fax, website, người đại diện, chức vụ.
- **Mua bán hàng**: công nợ (giới hạn nợ, giới hạn ngày nợ, giới hạn số phiếu nợ) và tài khoản ngân hàng (số TK, chủ TK, mở tại).
- **Nội bộ quản lý**: người quản lý (danh mục Nhân viên), chi nhánh quản lý, người tạo, ngày tạo.
- **Theo dõi** ở chân form: bỏ tích để khoá đối tượng.

### Mã tự động khi thêm mới

Như HTsoft (lấy mã khách hàng theo nhóm): chọn **Thuộc nhóm** thì mã tự nhảy tới mã kế tiếp của **dãy mã đông nhất trong nhóm** đó, giữ nguyên tiền tố và độ dài. Ví dụ nhóm NCC hàng hoá đang có `NC100001`…`NC100642` thì mã mới là `NC100643`; nhóm Chủ nhà đang tới `NC400638` thì mã mới là `NC400639`. Dòng nhỏ dưới ô mã cho biết đang nối dãy nào.

- Nhóm chưa có mã nào có đuôi số: nối dãy đông nhất của mọi đối tượng cùng kiểu. Vẫn chưa có: tiền tố mặc định theo kiểu + `000001` (khách hàng `KH`, nhà cung cấp `NCC`, nhân viên `NV`, nội bộ `NB`, khác `DT`).
- Mã gợi ý đã có (trùng với dãy khác) thì tự tăng tiếp.
- Tự gõ mã thì đổi nhóm không ghi đè nữa; bấm **↻ Lấy mã mới** để lấy lại mã tự động.
- **Mã đã có thì không thêm được** (báo tên, kiểu của đối tượng đang dùng mã đó), không ghi đè đối tượng cũ.

### Báo trùng số điện thoại, mã số thuế

Khi thêm mới, gõ xong **Mobile**, **Telephone** hoặc **Mã số thuế** mà số đó đã có ở đối tượng khác, phần mềm hỏi có mở đối tượng đó để sửa không. Chọn **OK** thì form chuyển sang sửa đối tượng đã có; **Cancel** thì vẫn thêm mới.

**Lấy thông tin theo mã số thuế** (cách nhanh): ô **Mã số thuế** (NCC: ngay dưới mã; khách hàng: khối Thông tin công ty) — gõ MST rồi bấm **Lấy thông tin** (hoặc Enter): phần mềm tra doanh nghiệp theo dữ liệu Cục Thuế và điền sẵn **tên trên hoá đơn, tên viết tắt, địa chỉ đăng ký** (có khoá dịch vụ tra cứu thì thêm người đại diện, ngành nghề, ngày thành lập). Thêm mới mà chưa gõ tên thì rời ô MST là tự tra (chỉ điền ô đang trống); bấm nút là điền lại theo kết quả. Dưới ô MST hiện trạng thái thuế — **⚠ đỏ khi doanh nghiệp đã ngừng hoạt động** (kiểm tra trước khi giao dịch) — và báo ngay nếu MST **đã có ở đối tượng khác**. Nhận MST 10 số, 10 số-3 số (đơn vị phụ thuộc, gõ liền 13 số cũng được), 12 số (hộ kinh doanh); dấu chấm, khoảng trắng tự bỏ. Không tra được (mất mạng, nguồn giới hạn lượt) thì nhập tay như thường.


Bắt buộc: Thuộc kiểu, Thuộc nhóm (khi kiểu đó có nhóm), Mã. Email nếu nhập phải đúng dạng.

**Xoá** chỉ được với đối tượng chưa có trên sổ. Đối tượng đã ghi sổ thì bỏ tích "Theo dõi".

## Kế toán bổ sung

Bấm một dòng để sửa. Ngoài tên, mã số thuế, địa chỉ…, kế toán khai thêm:

| Thông tin | Dùng để |
|---|---|
| **Nhóm** | Lọc, gom báo cáo theo nhóm (khách lẻ, khách buôn, NCC hàng hoá, NCC tài sản / dịch vụ, chủ nhà…) |
| **Hạn thanh toán (ngày)** | Báo cáo tuổi nợ theo hạn (ACC39, ACC67A, ACC67B) dùng hạn riêng này để xếp **trong hạn / quá hạn**. Để trống thì dùng "Số ngày được nợ" chung trên báo cáo |
| **Hạn mức nợ** | Báo cáo tuổi nợ cảnh báo đối tượng **vượt hạn mức** |
| **Đang theo dõi** | Bỏ chọn để **khoá**: không chọn được trên phiếu mới, số liệu cũ giữ nguyên; chứng từ hệ thống bán hàng gửi sang vẫn nhận |

Các thông tin này **không bị ghi đè** khi chứng từ hoặc đồng bộ danh mục gửi sang mà không kèm chúng.

Lọc danh sách theo nhóm, loại (khách hàng / nhà cung cấp…), trạng thái (đang theo dõi / đã khoá); tìm theo mã, tên, mã số thuế.

## Nhóm đối tượng (DM08)

- Có sẵn các nhóm: Khách mua lẻ, Khách mua buôn, Nhà cung cấp hàng hoá, Nhà cung cấp tài sản / dịch vụ, Chủ nhà, Nhân viên, Cơ quan nhà nước, Nội bộ, Thành viên góp vốn.
- Thêm nhóm, nhóm con (chọn nhóm cha). "Dùng cho" chỉ để gợi ý: khi sửa đối tượng loại Khách hàng, ô Nhóm chỉ hiện nhóm dành cho khách hàng hoặc mọi loại.
- Không xoá nhóm đã dùng: bỏ chọn "Đang dùng".

## Xem công nợ

**Sổ chi tiết công nợ (ACC40)** hoặc **Sổ chi tiết tài khoản**, tài khoản 131 / 331, nhập mã đối tượng.

## Thông tin bổ sung

| Ô | Dùng để |
|---|---|
| Người đại diện / liên hệ | Ghi trên biên bản đối chiếu, hợp đồng |
| Số tài khoản ngân hàng, chủ tài khoản, mở tại ngân hàng | In uỷ nhiệm chi, đối chiếu chuyển khoản |
| Giới hạn số phiếu còn nợ | Cùng **hạn mức nợ** và **hạn thanh toán**: ba điều kiện kiểm soát bán chịu |

Các ô này do kế toán nhập; chứng từ và đồng bộ danh mục gửi sang không ghi đè (trừ khi bên gửi gửi kèm đúng trường đó).

Nhóm **Cơ quan nhà nước** có sẵn hai nhóm con: **Cơ quan thuế**, **Cơ quan bảo hiểm**.
