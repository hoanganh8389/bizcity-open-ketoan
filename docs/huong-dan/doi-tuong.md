# Đối tượng (DM03), nhóm đối tượng (DM08)

Khách hàng, nhà cung cấp, nhân viên, đơn vị nội bộ — dùng để theo dõi công nợ.

## Đối tượng từ đâu ra

- **Tự tạo** khi chứng từ gửi kèm thông tin khách (mã thường là số điện thoại). Gửi lại với thông tin mới thì tự cập nhật; ô bỏ trống không xoá thông tin cũ.
- Hệ thống bán hàng, mua hàng có thể **đồng bộ cả danh mục** qua API (`PUT /api/v1/partners`, tối đa 1000 đối tượng một lần).
- Chứng từ không có khách → gắn đối tượng **KHACH-LE** (Khách lẻ).

## Cha – con (đơn vị mẹ và chi nhánh)

Nhà cung cấp hay khách hàng lớn thường có **đơn vị mẹ** và nhiều **chi nhánh** (cùng hoặc khác mã số thuế). Hợp đồng ký một nơi, hàng do nơi khác giao, thưởng lại do nơi khác trả — nên phải biết đơn vị nào thuộc đơn vị nào.

- **Thêm chi nhánh**: chọn đơn vị mẹ trên danh sách → **+ Thêm đơn vị con** (hoặc mở hồ sơ đơn vị mẹ → mục *Đơn vị con* → **Thêm đơn vị con**). Mã tự cấp **mã cha-001**, **-002**…; MST chi nhánh dạng *MST mẹ-005* thì mã lấy đúng đuôi *-005*.
- Ô **Thuộc đơn vị cha** ở đầu hồ sơ: chọn / bỏ đơn vị mẹ. Đơn vị cũ (mã có từ trước) gắn vào mẹ được, giữ nguyên mã.
  - Chọn **Thuộc nhóm** trước: ô liệt kê đối tượng nằm trong **nhóm cha** của nhóm đó (vd nhóm *NCC-CN – chi nhánh của NCC* thì liệt kê đối tượng trong nhóm cha của nó).
  - Theo vai trò đã tích: **Nhà cung cấp** → chỉ nhà cung cấp; **Khách hàng** → chỉ khách hàng; tích **cả hai** → cả hai.
- Gõ MST chi nhánh mà đã có đơn vị mang MST mẹ: phần mềm hỏi **Gắn làm đơn vị con?**
- Trong một nhóm mẹ – con được dùng chung MST; đơn vị ngoài nhóm trùng MST thì bị chặn.
- Không chọn chính mình, không vòng lặp; đơn vị con mang mã của mẹ thì không chuyển sang mẹ khác — lập đơn vị mới dưới mẹ mới, ngừng dùng mã cũ.
- **Xem dạng cây**: nút **Cây cha – con** trên thanh công cụ; bấm dòng mở / đóng, bấm đúp mở hồ sơ, đi sâu thì có **Quay lại**.
- Ô chọn đối tượng trên phiếu hiện kèm **thuộc …** để biết chi nhánh của bên nào.
- Phiếu, hoá đơn luôn ghi vào **đơn vị nhỏ nhất** (đơn vị xuất / nhận hoá đơn). Mỗi đối tượng có định danh cố định *dt_…* lưu cả vào sổ cái và chứng từ mua, nên đổi mã, tên hay đơn vị mẹ sau này số liệu cũ vẫn đúng chỗ; báo cáo gom lên đơn vị mẹ theo cây.
- Mọi lần sửa ghi vào **Lịch sử thay đổi** trong hồ sơ (ai, lúc nào, ô nào từ gì sang gì).

## Đổi MST, tên, địa chỉ theo ngày hiệu lực <!-- [2026-11-19 12:30 PM khanhtd] NT-DM-011 — hướng dẫn ngày hiệu lực khi đổi MST / tên / địa chỉ -->

Đối tác đổi mã số thuế (thường kèm tên pháp lý, địa chỉ) nhưng hay **báo trễ**. Phần mềm giữ mọi phiên bản; chứng từ đọc tên / MST **theo ngày chứng từ**.

- Mở hồ sơ đối tượng **đã có**, sửa MST / tên / địa chỉ → hiện ô **Hiệu lực từ ngày**. Chọn ngày đối tác bắt đầu dùng MST mới (được chọn ngày đã qua; không chọn ngày sau hôm nay). Để trống = từ hôm nay.
- **Một lần Ghi = một phiên bản = một ngày.** Đổi cùng lúc thì sửa cả ba ô, Ghi một lần. Đổi ở các ngày khác nhau thì ghi từng lần, **ngày cũ trước** (vd MST từ 01/10, địa chỉ từ 15/10: ghi MST rồi mới ghi địa chỉ). Phiên bản đã ghi không sửa được — chọn nhầm ngày thì chỉ thêm được phiên bản sau, nên kiểm kỹ trước khi Ghi.
- Khi Ghi, nếu còn hoá đơn từ ngày đó mang MST cũ, khung **Vì sao** báo **PART-HINT-005** ("Có N hoá đơn … vẫn mang MST cũ"); lưu được, ghi lý do.
- **Hoá đơn, chứng từ đã lập không bị sửa** (hoá đơn giữ đúng MST in trên hoá đơn). Chúng được liệt kê để rà:
  - hồ sơ đối tượng → mục **Lịch sử MST, tên, địa chỉ**: mỗi phiên bản một dòng, cột **Hoá đơn lệch** — bấm để xem từng hoá đơn;
  - **Bàn làm việc kế toán** (HT08) → *Việc hôm nay*: phép kiểm **PARTNER_TAX_MISMATCH** (chạy mỗi đêm, bắt cả hoá đơn nhập về sau).
- Rà xong: hoá đơn lập **trước** ngày đối tác đổi MST thì ghi lý do khi khoá kỳ; hoá đơn lập **sau** mà vẫn ghi MST cũ thì yêu cầu đối tác lập hoá đơn điều chỉnh / thay thế.
- MST cũ của một đối tượng không gán được cho đối tượng mới (báo trùng như MST đang dùng).
- Thêm mới, đồng bộ từ hệ thống bán hàng, nhập Excel: không có ô ngày — thay đổi có hiệu lực từ hôm nay.

## Màn hình

Ngoài màn **Đối tượng (DM03)** gồm mọi kiểu, có hai màn tách riêng theo kiểu (cùng cách dùng, cùng form):

| Màn | Hiện | Thêm mới |
|---|---|---|
| **Khách hàng (DM12)** | Đối tượng kiểu khách hàng | Thuộc kiểu sẵn là Khách hàng |
| **Nhà cung cấp (DM13)** | Đối tượng kiểu nhà cung cấp | Thuộc kiểu sẵn là Nhà cung cấp |

Ở các màn này ô lọc "Mọi loại" ẩn đi, ô lọc nhóm chỉ còn nhóm của kiểu đó, tên cột theo kiểu (Mã NCC, Tên NCC…). Mã tự động vẫn theo nhóm (xem dưới). Khách hàng còn ở menu Bán hàng → Danh mục bán hàng; Nhà cung cấp ở Mua hàng → Danh mục mua hàng.


Thanh nút: Thêm (Ctrl+N) · Sửa (Ctrl+E, hoặc bấm đúp dòng) · Xoá (Ctrl+Delete) · Nạp (F5) · Xuất · ô **Tìm nhanh** (mã, tên, alias, mã số thuế, điện thoại, tên công ty, tìm trên toàn danh mục) · lọc nhóm, loại, trạng thái.

Lưới theo thứ tự cột của danh mục khách hàng: Mã KH, Tên KH, Địa chỉ NR, Điện thoại (khách hàng: một cột — form ghi cùng số vào điện thoại / di động; nhà cung cấp có thêm cột Di động người liên hệ), Nhóm KH, Người đại diện, Địa chỉ cty, MST, Fax, Email, Website, Chức vụ, Ngày tạo KH, Theo dõi, Người QL, Chi nhánh QL, Ghi chú, Tên viết tắt, Tên công ty, Tài khoản NH, Chủ TK, Mở tại, Giới hạn nợ, Giới hạn ngày nợ, Giới hạn số phiếu nợ, Người tạo. Danh sách hiện toàn bộ đối tượng (không phân trang).

Form **Khách hàng / Nhà cung cấp**:
- **Thuộc kiểu** (đầu form): khách hàng, nhà cung cấp, nhân viên, nội bộ, khác. Nhóm chỉ hiện các nhóm khai cho kiểu đó.
- **Thông tin chung**:
  - Ngày tạo KH, **Thuộc nhóm (\*)**, **Mã (\*)**; Khách hàng tiềm năng, Ghi chú.
  - Thông tin cá nhân: tên, địa chỉ, mobile, telephone, ngày sinh, giới tính, email, loại khách hàng (cá nhân / doanh nghiệp).
  - Thông tin công ty: tên công ty, tên viết tắt, alias (tên gọi khác, tìm nhanh được theo alias), địa chỉ công ty, mã số thuế, fax, website, người đại diện, chức vụ.
- **Mua bán hàng**: công nợ (giới hạn nợ, giới hạn ngày nợ, giới hạn số phiếu nợ) và tài khoản ngân hàng (số TK, chủ TK, mở tại).
- **Nội bộ quản lý**: người quản lý (danh mục Nhân viên), chi nhánh quản lý, người tạo, ngày tạo.
- **Theo dõi** ở chân form: bỏ tích để khoá đối tượng.

### Nhập Excel khách hàng / nhà cung cấp
<!-- [2026-11-20 kiennt] NT-DM-016 — nhập Excel đủ cột của form, cột liên kết tra theo tên (đóng góp) -->

Màn **Nhập Excel** (loại Khách hàng / Nhà cung cấp) nhận gần đủ các ô của form: mã, tên, nhóm, MST, địa chỉ, **Điện thoại**, email, ngày sinh, giới tính (Nam / Nữ), loại khách hàng (KH cá nhân / KH doanh nghiệp), khách hàng tiềm năng, tên công ty, tên viết tắt, alias, địa chỉ Cty, fax, website, chức vụ (nhà cung cấp có thêm người liên hệ), tài khoản NH, chủ TK, mở tại, giới hạn nợ / ngày nợ / số phiếu nợ, người QL, chi nhánh QL, đơn vị cha, theo dõi, ghi chú. Tên cột trùng tên cột của lưới, nên tệp Xuất (bật đủ cột) nhập lại được.

- Bắt buộc như form: dòng mới phải có **Tên**; **khách hàng mới** phải có **Nhóm** (đơn vị con lấy nhóm của đơn vị cha). Các cột khác không bắt buộc; dòng cập nhật để trống thì giữ nguyên.
- **Cột liên kết** — Nhóm, Người QL (nhân viên), Chi nhánh QL, Thuộc đơn vị cha: ghi **tên** (hoặc mã). Tên không có trong danh mục, hoặc trùng nhiều mục → **dòng báo lỗi, không nhập**; trùng tên thì ghi mã.
- Khách hàng: cột Điện thoại ghi cả điện thoại và di động như form.
<!-- [2026-11-20 kiennt] NT-DM-016 — bỏ cột Kiểu; cha / con cùng tệp (đóng góp) -->
- Tệp mẫu không có cột **Kiểu**: dòng mới nhận kiểu theo màn đang nhập (DM12 → Khách hàng, Nhà cung cấp → Nhà cung cấp); dòng cập nhật giữ kiểu cũ.
- **Đơn vị mẹ và chi nhánh trong cùng một tệp**: đặt dòng đơn vị mẹ lên trên (mã để trống được), ở dòng chi nhánh ghi **tên** đơn vị mẹ vào cột Thuộc đơn vị cha và để trống mã → khi ghi, chi nhánh nhận mã `mã mẹ-001`, `-002`… Dòng mẹ lỗi thì các dòng con của nó cũng không nhập.

### Mã tự động khi thêm mới

Mã theo nhóm: chọn **Thuộc nhóm** thì mã tự nhảy tới mã kế tiếp của **dãy mã đông nhất trong nhóm** đó, giữ nguyên tiền tố và độ dài. Ví dụ nhóm NCC hàng hoá đang có `NC100001`…`NC100642` thì mã mới là `NC100643`; nhóm Chủ nhà đang tới `NC400638` thì mã mới là `NC400639`. Dòng nhỏ dưới ô mã cho biết đang nối dãy nào.

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

**Nhập Excel** <!-- [2026-11-18 11:20 AM kiennt] NT-DM-004, NT-DM-005 — nhập Excel cho mọi màn danh mục (đóng góp) -->: nút ở màn Nhóm đối tượng nhận tệp Xuất (mã nhóm, tên, ghi chú, nhóm cha, dùng cho, hoạt động). Nhóm cha có thể ở dòng khác trong tệp — phần mềm ghi cha trước con, chặn vòng nhóm cha. Xem [Nhập dữ liệu từ Excel](nhap-excel.md).

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

## Khung "Vì sao" khi khai báo <!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 -->

Dưới form đối tượng có khung **Vì sao** đổi theo ô bạn vừa chọn:

| Dấu | Nghĩa | Bạn làm gì |
|---|---|---|
| ℹ | nhắc hệ quả (vd tài khoản con kế thừa bản chất tài khoản cha) | đọc |
| ▶ | giải thích bản chất (bấm để mở) | đọc khi cần |
| ⚠ | cảnh báo mềm: hợp lệ nhưng thường sai về kế toán | sửa bằng nút gợi ý, **hoặc** vẫn Ghi — khi đó phải ghi lý do (ít nhất 5 ký tự); lý do vào nhật ký, người lưu tự chịu trách nhiệm vì đã được cảnh báo |
| ✘ | chặn: sai toàn vẹn dữ liệu | phải sửa mới Ghi được |

Nút Ghi hiện số cảnh báo đang có ("Ghi (có 1 cảnh báo)"). Nội dung cảnh báo đang ở dạng **nháp** tới khi kế toán trưởng duyệt.
