# Nhà cung cấp mua hàng (MH01)

Mua hàng **đi từ nhà cung cấp**. Mọi thứ của một NCC (hợp đồng, hạn mức, hạn trả, chiết khấu, thưởng, giá mua, mặt hàng, chứng từ, tệp) nằm ở **một hồ sơ**.

## Danh sách nhà cung cấp

Mỗi NCC một dòng: STT, mã, tên, MST, **nợ phải trả** (theo sổ), **quá hạn**, **sắp đến hạn**, **hạn mức** và phần đã dùng, **điều khoản thanh toán** bằng chữ, số chính sách, **hợp đồng đến ngày**, đơn đang mở, lần nhập gần nhất, mua tháng này, số chứng từ, số tệp.

- Thẻ **Đang giao dịch**: NCC có chính sách / chứng từ / công nợ / tệp. Thẻ **Mọi nhà cung cấp**: cả danh mục.
- Lọc, sắp xếp từng cột; **Xuất Excel**. Dòng có nợ quá hạn tô vàng; hợp đồng hết hạn tô đỏ, sắp hết hạn (30 ngày) tô cam.
- Bấm đúp một dòng (hoặc gõ mã / tên ở ô trên cùng) để mở **hồ sơ NCC**. NCC mới: nút **+ Thêm nhà cung cấp** (cùng một form với danh mục đối tượng — không khai ở nơi khác).

## Hồ sơ nhà cung cấp

**Đầu trang:** tên, MST, địa chỉ, điện thoại, tài khoản ngân hàng, điều khoản thanh toán, nút **Sửa thông tin NCC** (tên, MST, địa chỉ, **nhóm nhà cung cấp**, ngân hàng…); dòng **Nhãn hàng đang bán** (chỉ xem — tổng hợp từ mặt hàng NCC bán / đã nhập; nhãn khai ở Danh mục mặt hàng, không khai riêng ở NCC; lập chính sách cho NCC thì ô Nhãn gợi ý trước các nhãn này); nút **Đơn đặt hàng · Phiếu nhập · Trả hàng · Trả tiền · Nhập Excel** — mở chứng từ mới đã điền sẵn NCC này. Bốn ô số: nợ (quá hạn), hạn mức (đã dùng / còn), mua tháng này, đơn đang mở.

| Thẻ | Nội dung |
|---|---|
| Tổng quan | Đơn đặt đang chờ giao (đã nhận / đặt, nút **Lập phiếu nhập**), thanh hạn mức, mua theo tháng, khoản phải trả đang mở theo hạn |
| Hợp đồng & điều khoản | Hợp đồng (số, ngày ký, hiệu lực), **hạn mức công nợ**, **điều khoản thanh toán**, theo dõi lô |
| Chiết khấu & khuyến mại | CK trên đơn, bậc số lượng, CKTT, mua X tặng Y, ngân sách quà |
| Thưởng | Thưởng doanh số theo kỳ, chỉ tiêu nhãn, giai đoạn, chỉ tiêu cung ứng |
| Mặt hàng & giá mua | NCC bán **mã nào, ĐVT nào, giá bao nhiêu**: **mã + tên hàng bên NCC** (để sau quét hoá đơn đỏ tự nhận ra mã của mình), ĐVT đặt hàng (Đặt theo ĐVT này), giá mua cố định (gồm / chưa thuế, hiệu lực), lần mua gần nhất, **ghi chú** (tự điền vào ghi chú dòng khi lập đơn đặt), người sửa lần cuối; dưới bảng: nút mở **Phân tích đặt hàng** lọc sẵn NCC |
| Chứng từ | Mọi chứng từ của NCC (lọc, xuất Excel, bấm đúp mở); cột **Theo chứng từ** cho biết phiếu nhập lập từ đơn nào, phiếu trả / trả tiền theo phiếu nhập nào |
| Tệp đính kèm | Hợp đồng, CO, CQ, báo giá, hoá đơn, biên bản… (kéo thả, tối đa 15 MB / tệp). **Bấm tên tệp là xem ngay trên web** (PDF, ảnh, Excel từng sheet) — không phải tải về; nút ⬇ để tải |
| Nhật ký | Ai tạo / sửa chính sách, gắn tệp, duyệt phiếu — lúc nào |

**Mỗi thứ khai một nơi:**

| Khai gì | Ở đâu | Chỗ khác |
|---|---|---|
| Thông tin NCC, nhóm NCC | Form NCC (nút *+ Thêm nhà cung cấp* / *Sửa thông tin NCC*); danh sách nhóm: menu **Nhóm nhà cung cấp** | chỉ chọn / xem |
| Mã hàng, **ĐVT và tỉ lệ quy đổi** (Hộp 1 · Lốc 4 · Thùng 48), ĐVT bán chính, **ĐVT mua mặc định** | Danh mục mặt hàng → thẻ ĐVT | mọi phiếu **chọn** ĐVT trong danh sách này, không gõ tay |
| NCC bán mã nào, ĐVT NCC hay giao, giá mua cố định | Bảng **Mặt hàng & giá mua** — mở từ hồ sơ NCC (theo NCC) hoặc từ mặt hàng → thẻ *Mua hàng* (theo mã). Cùng một bảng | phiếu tự điền ĐVT, giá; lệch giá thì cảnh báo |
| Tồn max (theo chi nhánh – kho) | Màn **Tồn max (MH16)** hoặc mặt hàng → thẻ *Mua hàng* | phân tích đặt hàng, chia hàng xuống shop tự tính |

**Thẻ Mặt hàng & giá mua** — sửa ngay trên bảng rồi **Lưu thay đổi**:
- **Tự động:** nút **Khai N mã đã mua** lấy các mã đã từng đặt / nhập của NCC (dòng mờ "chỉ có lịch sử" → bấm *Khai*).
- **Tay:** chọn một mã → **Thêm mã**; hoặc **Dán nhiều mã** (copy cột mã từ Excel) → xem trước → đưa vào bảng.
- **Excel:** **Nhập Excel** → *Hướng dẫn các cột* (Mã hàng bắt buộc; ĐVT, Giá mua, Gồm thuế, Mã hàng NCC, Tên hàng NCC, Hiệu lực từ, Ghi chú) + **Tải file mẫu** → chọn tệp → **xem trước** (mã chưa có trong danh mục hoặc ĐVT không có ở mặt hàng báo đỏ, bỏ qua) → đưa vào bảng → kiểm → **Lưu thay đổi**.
- **Giá:** hai cột **Giá chưa thuế** và **Giá gồm thuế** (theo cột *Thuế* = thuế suất đầu vào của mặt hàng). Gõ ô nào cũng được, ô kia tự quy đổi; ô vừa gõ in đậm. Giá nhập từ *Nhập dữ liệu khởi đầu (MH20)* là giá chưa thuế, giá gồm thuế tự hiện theo.
- **Điền giá lần mua gần nhất (N mã):** mã đã từng mua của NCC mà chưa khai giá → lấy đơn giá lần mua gần nhất (quy đúng ĐVT), kiểm rồi *Lưu thay đổi*.
- **ĐVT** chọn trong danh sách ĐVT của mặt hàng. Lập đơn / phiếu với NCC này dùng **đúng ĐVT ghi trên dòng**: NCC bán theo Thùng thì khai dòng ĐVT Thùng (giá theo Thùng). NCC khai nhiều ĐVT cho cùng mã thì ưu tiên ĐVT *Mua mặc định* của mặt hàng, không có thì dòng giá mới nhất. Mã NCC chưa khai thì dùng *Mua mặc định* (thẻ ĐVT của mặt hàng) → Bán chính → nhỏ nhất. Khai giá Thùng mà phiếu nhập theo Lon → phần mềm tự quy đổi giá theo tỉ lệ để so.
- **Đổi giá theo đợt:** thêm dòng mới cùng mã × ĐVT với *Hiệu lực từ* mới — dòng cũ giữ làm lịch sử. Phần mềm lấy đợt có *Hiệu lực từ* mới nhất. Lưu dòng **trùng** (cùng NCC, mã, ĐVT, cùng giá) với dòng đang có thì phần mềm nhắc — không cần thêm dòng.
- **Xoá** (nút đỏ cuối dòng, khi bấm *Sửa bảng*) = **xoá vĩnh viễn** dòng giá (hỏi lại trước khi xoá); phiếu đã lập không bị ảnh hưởng. Dòng chưa lưu thì Xoá chỉ bỏ khỏi bảng.
- **Nạp dữ liệu mẫu (MH00)** không ghi đè giá đơn vị đã tự khai: NCC × mã × ĐVT đã có giá của đơn vị thì giữ, bỏ qua giá mẫu.
- **Giá chung** (áp mọi NCC): khai ở mặt hàng → thẻ *Mua hàng*, để trống cột NCC. Giá của đúng NCC luôn thắng giá chung.
- Lập đơn đặt / phiếu nhập cho NCC: nút **Điền mặt hàng của NCC** hiện sẵn mọi mã (đúng ĐVT, đúng giá) để tích chọn và điền số lượng.
- Kho luôn ghi theo **ĐVT nhỏ nhất**: nhập 2 Thùng (48) → kho tăng 96 Hộp, giá vốn theo hộp.

**Xem nhanh thông tin NCC:** ở mọi chỗ có NCC (phiếu, danh sách chứng từ, bảng chính sách, đề xuất đặt hàng, nhập Excel) có nút **ⓘ** — bấm xem MST, địa chỉ, điện thoại, email, người liên hệ, tài khoản ngân hàng, điều khoản, hạn mức, nợ, hợp đồng, kèm nút mở hồ sơ.

**Lịch sử thay đổi:** thẻ *Nhật ký* của hồ sơ, form từng chính sách và thẻ *Lịch sử* của từng phiếu ghi **ai làm, lúc nào, đổi gì từ gì sang gì** (ví dụ "Nội dung: Hạn mức 600 triệu → Hạn mức 700 triệu", "Dòng 130181002: SL 14.400 → 14.448").

**Khai chính sách ở từng thẻ:** bấm nút **+ <loại>** → NCC đã khoá sẵn, chọn **mẫu nhanh** rồi sửa số → đọc dòng *"Phần mềm sẽ hiểu là…"* → **Ghi**. Mã tự đặt `<mã NCC>-<loại>` (ví dụ `NC100227-HANMUC`, `NC100227-HANTT`). Mỗi dòng chính sách có STT, người tạo và ngày giờ tạo.

## Điều khoản thanh toán (đủ các kiểu theo hợp đồng)

| Kiểu | Ví dụ hợp đồng | Khai |
|---|---|---|
| X ngày làm việc từ ngày nhận đủ hàng và hồ sơ (trừ T7, CN, lễ) | Vinh Châu, Bảo Huy: 10 ngày | Trong vòng X ngày · Ngày làm việc (trừ T7, CN, lễ) |
| X ngày làm việc chỉ trừ CN + lễ, trả vào ngày cố định | Diana: 15 ngày, trả mùng 5 / 15 / 25 | Ngày làm việc (chỉ trừ CN, lễ) · Chỉ trả vào ngày 5, 15, 25 |
| X ngày lịch | Lifesfood: 30 ngày | Ngày lịch |
| Trước ngày N hàng tháng | Hoàng Tuấn: trước ngày 25 | Trước ngày N hàng tháng (nhận trước / đúng ngày N → ngày N tháng đó; sau ngày N → tháng sau) |
| Nhận hàng thanh toán ngay | Hoàng Gia Phú | Nhận hàng thanh toán ngay |
| Thanh toán trước khi giao | Đại Thịnh | Thanh toán trước khi giao hàng (lập phiếu ứng trước theo đơn) |
| Công nợ cố định | — | Công nợ cố định (không tính hạn từng phiếu) |

Hạn rơi vào ngày nghỉ / lễ (khai ở **Cài đặt mua hàng**) thì sang ngày làm việc kế tiếp. Phiếu nhập có ô **Ngày nhận đủ hàng & hồ sơ** (mốc tính hạn). Hoá đơn sai phải điều chỉnh: ở thẻ *Hoá đơn & đối soát* ghi ngày báo NCC và ngày nhận hoá đơn điều chỉnh — hạn tự lùi đúng số ngày.

## Form thông tin nhà cung cấp (nút "Sửa thông tin NCC")

NCC là doanh nghiệp nên form chỉ có **một bộ thông tin chính thức, đúng như trên hoá đơn**: nhóm, mã, **tên công ty**, MST, tên viết tắt, **địa chỉ theo đăng ký kinh doanh**, điện thoại, email, người liên hệ + chức vụ, di động người liên hệ, website; khối **tài khoản ngân hàng** (để trả tiền); ghi chú. Phiếu mua, báo cáo lấy đúng tên / địa chỉ / MST này.

- Không có các ô dành cho khách lẻ (ngày sinh, giới tính, khách hàng tiềm năng, loại khách hàng, fax, alias).
- Không khai hạn mức, hạn thanh toán ở form này — khai ở **Hồ sơ NCC** (chính sách Hạn mức công nợ, Điều khoản thanh toán), một nơi cho mọi điều kiện mua.
- Chân form ghi **người tạo, ngày giờ tạo**; danh sách NCC (MH01) có cột **Người tạo**, **Ngày giờ tạo**.
- Bỏ tích **Đang giao dịch** khi ngừng mua của NCC.
- **Đối tượng này là** (đầu form) — một chỗ chọn vai trò, tích một hoặc cả hai:
  - **Nhà cung cấp** — bán hàng cho mình, dùng ở phiếu mua;
  - **Khách hàng** — mua hàng của mình, dùng ở phiếu bán;
  - tích cả hai (đơn vị vừa bán vừa mua): cùng một mã hiện ở cả danh sách nhà cung cấp và khách hàng; công nợ phải trả (331) và phải thu (131) theo dõi riêng; danh sách đối tượng ghi vai trò "Nhà cung cấp + Khách hàng";
  - **Loại khác…**: nhân viên, nội bộ… (không phải khách hàng / nhà cung cấp).
- Có vai trò Nhà cung cấp thì form là thông tin doanh nghiệp gọn như trên; chỉ là khách hàng thì form khách hàng (có ô **Khách hàng tiềm năng** = khách chưa mua lần nào, để chăm sóc).
- Mỗi ô tích có dòng chữ nhỏ ngay bên cạnh nói rõ tích / bỏ tích nghĩa là gì.
- **Vừa là khách hàng** (ô tích cạnh "Thuộc kiểu"): đơn vị vừa bán cho mình vừa mua của mình — cùng một mã hiện ở cả danh sách nhà cung cấp và khách hàng, lập phiếu mua lẫn phiếu bán đều chọn được; công nợ phải trả (331) và phải thu (131) vẫn theo dõi riêng theo tài khoản. Form khách hàng có ô ngược lại **Vừa là nhà cung cấp**.
- Ô **Khách hàng tiềm năng** (chỉ ở form khách hàng) là đánh dấu khách **chưa mua lần nào** để chăm sóc — không phải "vừa là khách vừa là NCC".
- Mỗi ô tích đều có dòng chữ nhỏ ngay bên cạnh nói rõ tích / bỏ tích nghĩa là gì.
- **Vừa là khách hàng** (ô tích cạnh "Thuộc kiểu"): đơn vị vừa bán cho mình vừa mua của mình — cùng một mã hiện ở cả danh sách nhà cung cấp và khách hàng, lập phiếu mua lẫn phiếu bán đều chọn được; công nợ phải trả (331) và phải thu (131) vẫn theo dõi riêng theo tài khoản. Form khách hàng có ô ngược lại **Vừa là nhà cung cấp**.
- Ô **Khách hàng tiềm năng** (chỉ ở form khách hàng) là đánh dấu khách **chưa mua lần nào** để chăm sóc — không phải "vừa là khách vừa là NCC".

## Nút chứng từ ở đầu hồ sơ — làm ngay trong hồ sơ NCC

Các nút **Đơn đặt hàng · Phiếu nhập · Trả hàng · Trả tiền** bấm vào hiện menu nhỏ:
- **Lập … mới** — mở phiếu mới ngay tại hồ sơ, điền sẵn NCC này và chi nhánh đang làm việc; Thoát là quay lại hồ sơ;
- **Xem danh sách … của NCC này** — chuyển sang thẻ **Chứng từ** của hồ sơ, đúng loại phiếu (kèm số phiếu, số chưa duyệt);
- **Phiếu nhập**: thêm *Lập phiếu nhập từ đơn …* cho đơn đặt đã duyệt còn hàng chưa giao.
- **Chứng từ khác ▾**: các loại còn lại như ô *+ Thêm chứng từ…* — Đổi hàng NCC, Nhận quà (không HĐ), Xuất quà tặng, Ứng trước NCC, Chi phí mua hàng, Chiết khấu / giảm giá sau mua; mỗi loại *lập mới* hoặc *xem (số phiếu)*.

Thẻ **Chứng từ** của hồ sơ chính là màn *Chứng từ mua hàng (MH03)* đã khoá NCC: đủ các thẻ loại phiếu (Đơn đặt hàng, Nhập mua, Trả / đổi hàng, Ứng trước / trả tiền, Quà tặng, Chi phí / thưởng), lọc trạng thái / ngày / theo đơn – ngoài đơn, **+ Thêm chứng từ…**, Nhập từ Excel, Xuất Excel. Nút **Nhập Excel** ở đầu hồ sơ cũng mở hộp nhập ngay tại đây.
