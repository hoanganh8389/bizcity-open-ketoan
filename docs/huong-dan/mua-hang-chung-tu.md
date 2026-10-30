# Tổng hợp mua hàng (MH11)

Màn làm việc chính của mua hàng (gộp màn *Chứng từ mua hàng* cũ): **bộ lọc bên trái** (nhà cung cấp, từ ngày – đến ngày, chi nhánh → mã kho, trạng thái — bấm **Tìm kiếm** để áp; danh sách chi nhánh và mã kho tự chia chỗ, tự cuộn bên trong để các ô khác luôn hiện), **bên phải là các thẻ loại chứng từ** (Tất cả, Đơn đặt hàng, Nhập mua, Trả / đổi hàng, Ứng trước / trả tiền, Quà tặng, Chi phí / thưởng). Lập, sửa, duyệt, in, nhập Excel phiếu đều làm ở đây. **Nhập từ Excel** (tạo nhiều đơn đặt / phiếu nhập): cột **Mã kho** không bắt buộc — trống = kho mặc định của chi nhánh; có thì mỗi kho một phiếu (đơn đặt: kho giao), kho không thuộc chi nhánh của dòng báo lỗi ngay ở bước xem trước. Mở màn mặc định kỳ từ đầu tháng đến hôm nay (mở bằng liên kết có lọc sẵn thì không giới hạn kỳ).

Xem **từng dòng hàng** của phiếu: **Báo cáo mua hàng (MH23)**.

> Số liệu là **số liệu thật** của đơn vị: phiếu mua **duyệt là ghi sổ** (bút toán, công nợ, kho). Ở bản thử muốn có sẵn 25 tình huống để tập: màn **Tổng quan mua hàng (MH00)** → **Nạp dữ liệu mẫu** (xoá được bằng **Xoá dữ liệu mẫu**).

## Quy trình mua hàng (đi đúng thứ tự)

1. **Khai NCC + mặt hàng + giá mua** — hồ sơ NCC (MH01): điều khoản thanh toán, thẻ *Mặt hàng & giá mua* (giá chưa thuế / gồm thuế tự quy đổi).
2. **Đơn đặt hàng** — từ hồ sơ NCC bấm **Đơn đặt hàng** → *Điền mặt hàng của NCC*: mã, ĐVT, giá tự lấy từ bước 1; chiết khấu thoả thuận cho đơn ghi ở đơn. **Duyệt đơn** (giữ hạn mức công nợ; vượt hạn mức thì chờ duyệt ngoại lệ).
3. **Nhập mua theo đơn** — mở đơn đã duyệt → **Lập phiếu nhập**: phiếu chép phần còn lại của đơn (CK, hạn trả, CKTT theo đơn); chỉ nhập số / ngày hoá đơn, lô, hạn dùng → duyệt = ghi sổ, công nợ, kho. Phần mềm đối chiếu đơn ↔ phiếu ↔ hoá đơn ("Nhận đủ đơn …" hoặc cảnh báo lệch SL / giá).
4. **Trả tiền NCC** — trừ vào phiếu nhập; trả đúng hạn thì tính CKTT.

Phiếu nhập theo đơn **chưa duyệt** (nháp / chờ duyệt) luôn bị chặn duyệt — duyệt đơn trước.

### Nhập ngoài đơn (ngoại lệ được phép)

Phiếu nhập **không theo đơn đặt nào** vẫn lập được (NCC giao bổ sung, mua gấp, hàng mẫu, nhập lại chứng từ cũ…) nhưng được **đánh dấu để xử lý riêng**:
1. Ở ô *Theo đơn đặt hàng* chọn **— không theo đơn (nhập ngoài đơn) —** → hiện ô **Lý do nhập ngoài đơn (\*)** (gõ hoặc chọn lý do gợi ý). Chưa ghi lý do thì **không duyệt được**.
2. Đầu phiếu có nhãn vàng **Nhập ngoài đơn**; có lý do thì cảnh báo vàng, duyệt được bình thường. Đơn vị bật *Phiếu nhập mua phải lập từ đơn đặt* (MH12) thì phải người có quyền bấm **Duyệt ngoại lệ** (ghi lý do).
3. Lúc duyệt phần mềm **đóng dấu** lý do + người duyệt + thời điểm lên phiếu (giữ mãi) và ghi **Nhật ký mua hàng (MH10)**.
4. **Rà soát riêng:** trang *Quy trình mua hàng* có việc **"Phiếu nhập ngoài đơn chưa rà soát"**; danh sách có ô lọc **Chỉ phiếu nhập ngoài đơn / Ngoài đơn — chờ rà soát**, cột **Theo đơn / phiếu** ghi *Ngoài đơn*, cột *Cần xử lý* ghi *Nhập ngoài đơn — chờ rà soát*. Kế toán mở phiếu, kiểm (biên bản giao hàng, hoá đơn…) rồi bấm **Đã rà soát nhập ngoài đơn** (ghi chú tuỳ chọn) → nhãn thành *đã rà soát ✓*.

Một danh sách cho mọi chứng từ phía mua:

| Loại | Dùng khi |
|---|---|
| Đơn đặt hàng | Đặt hàng, giữ hạn mức (chưa ghi nợ) |
| Nhập mua | Nhận hàng + hoá đơn |
| Trả hàng NCC | Trả một phần / toàn bộ (lỗi, cận date, sai quy cách) |
| Đổi hàng NCC | Dòng **trả đi** và **nhận về**; chênh lệch: bù trừ công nợ / thanh toán bổ sung / NCC hoàn tiền |
| Nhận quà (không HĐ) | Quà NCC tặng ngoài hợp đồng / theo chương trình, không hoá đơn — nhập **giá trị hợp lý** / ĐVT |
| Xuất quà tặng | Xuất quà tặng khách theo chương trình |
| Ứng trước NCC | Trả trước theo đơn đặt — phiếu nhập theo đơn tự đối trừ khi duyệt |
| Trả tiền NCC | Trả nợ: chọn phiếu nhập muốn trả trước (không chọn = trừ khoản hạn sớm trước); phiếu nhập có CKTT thì bấm **Tính …%** để ghi chiết khấu thanh toán (chỉ được khi trả trong hạn, trả đủ) |
| Chi phí mua hàng | Vận chuyển, bốc xếp… phân bổ vào phiếu nhập (MH07) |

## Danh sách

- **Lọc**: thẻ loại, nhà cung cấp, trạng thái, ô tìm.
- **Người tạo / Ngày giờ tạo / Người duyệt / Ngày giờ duyệt**: ghi "email đăng nhập (Họ tên)" và giờ phút giây (cột *Sửa lần cuối* bật ở nút Cột). Phiếu duyệt trước 28/10/2026 chỉ có tên người duyệt.
- **Cột Cần xử lý** (phiếu chưa duyệt): ghi bằng chữ việc cần xử lý đầu tiên — đỏ **"Chặn duyệt: …"** (vượt hạn mức, trùng hoá đơn, thiếu số lô…, phải xử lý mới duyệt được), vàng **"Lưu ý: …"** (lệch giá, thiếu / thừa quà, cận date… — vẫn duyệt được), kèm "+N việc khác"; xanh **"Ổn"**. Rê chuột lên ô để xem đủ danh sách. Phiếu đã duyệt để trống (duyệt ngoại lệ thì ghi "Duyệt ngoại lệ").
- **Thêm / mở phiếu**: ô **+ Thêm chứng từ…** chọn loại; bấm đúp dòng để mở.

## Phiếu

**Phần mềm điền sẵn cho bạn** (sửa được hết):
- Phiếu mới: ngày hôm nay, chi nhánh và nhà cung cấp lần trước.
- **Thêm hàng:** thanh thao tác ngay trên bảng hàng:
  - **+ Thêm hàng (F3)** mở danh mục mặt hàng: gõ tên không dấu / mã, lọc theo nhãn (nhãn NCC đang bán xếp đầu), **bấm vào dòng là thêm** (bấm lại = cộng 1), ↑ ↓ Enter cũng được; quét mã vạch + Enter là thêm đúng mã đó và ô tìm trống lại để quét tiếp;
  - **Điền mặt hàng của NCC** (tích chọn, điền số lượng theo gợi ý), **Chép từ phiếu …** (phiếu gần nhất cùng NCC);
  - **+ Quà ngoài chương trình** cho quà NCC tặng thêm — quà theo chương trình phần mềm tự thêm;
  - **Nhập Excel**: cột Mã hàng (*) · Tên hàng (chỉ để đọc) · ĐVT · Số lượng (*) · Đơn giá · CK % · Hàng tặng · Số lô · NSX · Hạn dùng · Phân kho (không bắt buộc, chỉ tham khảo — mọi dòng vào **Phân kho ở đầu phiếu**; kho trong tệp khác đầu phiếu thì xem trước ghi rõ). Có hướng dẫn cột, file mẫu, xem trước — mã chưa có trong danh mục, ĐVT chưa khai của mã báo đỏ và bị bỏ qua. ĐVT trống = ĐVT mua mặc định, đơn giá trống = giá mua của NCC;
  - **Xuất Excel**: đúng bộ cột của mẫu nhập (kèm thành tiền, chương trình, phân kho) — sửa xong nhập lại được.
- Bảng hàng nhiều cột thì chỉ bảng cuộn ngang; khối đầu phiếu và thanh thao tác đứng yên.
- **Tên hàng, ĐVT (chọn trong ĐVT đã khai), thuế suất, nhãn** lấy theo danh mục mặt hàng — không gõ tay trên phiếu. Sai tên thì sửa ở Danh mục mặt hàng.
- Chọn NCC: nút **Chép hàng từ phiếu …** chép mã hàng, số lượng, đơn giá, thuế suất của phiếu gần nhất cùng NCC.
- Gõ mã hàng: tên, ĐVT, **thuế suất**, nhãn hàng lấy từ danh mục mặt hàng; có giá mua cố định thì tự điền đơn giá.
- Để trống **CK %**: tự áp theo chính sách (bậc số lượng…).
- Phiếu **Trả tiền NCC**: nút gợi ý **Trả hết** / **Phần đến hạn** / **Theo phiếu đã chọn** theo nợ thật trên sổ.
  - Hộp **Chọn phiếu nhập** có cột **Đã trả** và **Còn nợ** theo sổ: trả nhiều lần thì thấy ngay phần còn lại trước khi chọn; phiếu trả xong ghi *Đã trả hết*, phiếu chưa duyệt ghi *chưa ghi sổ*.
  - **Tài khoản ngân hàng** (chuyển khoản, 112*) / **Quỹ tiền mặt** (111*): trống = tài khoản mặc định theo cài đặt; chọn tài khoản khác (vd ngân hàng khác) thì bút toán ở thẻ Hạch toán ghi Có đúng tài khoản đó. Đổi hình thức thì ô này tự xoá.

**Cột của dòng hàng:** Đơn giá · CK % · **Thuế suất** (0%, 5%, 8%, 10%, không chịu thuế) · Thành tiền chưa thuế · Tiền thuế · Giá vốn / ĐVT · Số lô · NSX · Hạn dùng. Ô **Tổng tiền** bên phải tách tiền thuế theo từng thuế suất khi phiếu có nhiều mức thuế.

**Chặn sai:** chiết khấu trên đơn lớn hơn tiền hàng (số phải trả âm), đơn giá âm, CK % ngoài 0–100 — không ghi, không duyệt được.

**Đầu phiếu:**
- NCC (hiện MST, nhóm, địa chỉ), chi nhánh; **Nhãn hàng (theo mặt hàng)** chỉ để xem — phiếu nhiều nhãn hiện tỉ trọng từng nhãn;
- *Theo đơn đặt hàng* (nhập mua) / *Phiếu gốc* (trả, đổi);
- **Đơn giá nhập vào là**: *giá chưa thuế* (như trên hoá đơn GTGT — mặc định) hoặc *giá đã gồm thuế*; tên cột đơn giá đổi theo lựa chọn. Phần mềm nhớ lựa chọn lần trước;
- **Chiết khấu trên đơn**: *Theo chính sách* (tự lấy CK của NCC) · % · bằng tiền · không.

**Các thẻ:**

| Thẻ | Nội dung |
|---|---|
| Hàng hoá | Loại dòng (Hàng mua / KM người bán — chia giá / KM người tiêu dùng — quà), mã, SL, đơn giá, CK % (trống = theo bậc số lượng), số lô, hạn dùng; cột **Giá vốn TT** = giá vốn đơn vị thực tế (trước thuế, sau CK, đã chia quà người bán). Dải **Khuyến mại** ngay trên bảng (đã tự áp · cần xem · gợi ý) |
| Hạn trả tiền | Ba câu hỏi: **① Khi nào phải trả tiền?** (hạn trả theo hợp đồng với NCC, hoặc đặt hạn riêng cho phiếu; NCC chưa khai thì có nút mở hồ sơ NCC để khai) · **② Trả đúng hạn có được giảm tiền không?** (có thì ghi rõ được giảm bao nhiêu; gõ ngày dự kiến trả để kiểm kịp hạn; ghi % riêng nếu phiếu có thoả thuận khác) · **③ Trả một lần hay nhiều lần?** (Chia 3 đợt rồi sửa). *Đơn đặt hàng không có thẻ này* |
| Hoá đơn & đối soát | Số, ký hiệu, ngày, **tổng tiền trên hoá đơn**; bảng đối soát (tổng, trùng số, ứng trước); đối chiếu 3 bên với đơn đặt |
| Hạch toán | Bút toán Nợ / Có sinh khi duyệt |
| Giá vốn thực tế | Đơn giá gốc → CK dòng → CK đơn phân bổ → giá vốn / ĐVT |

## Trợ lý mua hàng (cột phải)

Máy chủ kiểm tra lại sau mỗi lần sửa phiếu, bằng **số liệu thật** (nợ theo sổ, lần nhập thật):
1. **Kiểm tra**: bấm một cảnh báo của dòng để nhảy tới dòng đó.
   - ⛔ chặn duyệt: thiếu lô, hết hạn, trùng hoá đơn, vượt hạn mức.
   - ⚠ cảnh báo: lệch giá, cận date, thiếu / thừa quà, lệch tổng HĐ, lệch đơn đặt.
   **Nhãn hàng** không chọn trên phiếu: mỗi dòng mang nhãn của mặt hàng (danh mục Ngành → Nhãn → Nhóm). Hạn mức toàn nhãn, chỉ tiêu, thưởng theo nhãn tính theo phần của từng nhãn trong phiếu.

**Khuyến mại tự áp (như màn khuyến mại ở quầy bán hàng):**
- Mỗi khi thêm / sửa / bỏ dòng hàng (hoặc đổi NCC, ngày, chi nhánh), phần mềm tự áp:
  - chiết khấu theo bảng mã, bậc số lượng, CK trên đơn, CKTT (ô CK % để trống);
  - quà mua X tặng Y: **tự thêm dòng quà** (có chữ "tự"), tăng / giảm hàng mua thì số quà tự chạy theo, không còn đủ điều kiện thì tự bỏ.
- NCC giao thiếu / thừa quà: sửa số lượng dòng quà → phần mềm giữ nguyên số đã sửa và báo **cần xem**; bấm **Sửa về N** để quay lại đúng số chương trình.
- Khung **Khuyến mại & chiết khấu** (Trợ lý bên phải) và nút **Xem bảng khuyến mại** liệt kê 3 nhóm:
  - **Đã tự áp** — chương trình nào, ra bao nhiêu;
  - **Cần xem** — thiếu / thừa quà, CK ghi tay khác chính sách (nút **Dùng theo chính sách**);
  - **Mua thêm để được** — ví dụ "mua thêm 5 để được tặng thêm 1", "đủ 50 để được CK 3%" (nút **Lên N**).
- Quà ngoài chương trình (NCC tặng thêm): nút **+ Quà ngoài chương trình…**.
- **Bỏ / áp lại từng chương trình trên phiếu (cột Áp):** tự động nhưng linh hoạt — NCC hết quà, lần này NCC không cho CK… thì **bỏ tích** chương trình đó ở bảng khuyến mại (hoặc khung bên phải): CK / bậc / CKTT của nó về 0, quà tự thêm của nó tự gỡ; dòng chuyển sang nhóm **Đã bỏ trên phiếu** (gạch ngang). **Tích lại** là áp lại. Chỉ ảnh hưởng phiếu đang mở; lúc duyệt phần mềm chốt đúng như lựa chọn.
- **CK trên đơn bằng số tiền cố định** (vd giảm 2 triệu / đơn) chỉ tự áp khi tiền hàng **lớn hơn** số CK, hoặc đủ mức **"Áp khi tổng đơn từ"** khai ở chính sách; chưa đủ thì không áp (không bao giờ làm số phải trả âm) mà hiện gợi ý "tổng đơn từ … mới được CK — mua thêm …". Mỗi khoản CK chỉ hiện **một dòng** (mã chính sách + số tiền), CK ghi tay hiện "ghi trên phiếu".
2. **Giá mua** của dòng đang chọn: giá cố định (của NCC, không có thì giá chung; khai theo ĐVT khác thì quy đổi theo tỉ lệ) + 5 lần nhập gần nhất (* = giá chưa VAT). Cột **ĐVT** chọn trong ĐVT của mặt hàng; đổi ĐVT thì đơn giá quy đổi theo. Mặt hàng mới có một ĐVT thì bấm nút **+ĐVT** cạnh ô để khai thêm Lốc, Thùng… và tỉ lệ ngay trên phiếu, khỏi phải rời phiếu.
   Phiếu đã ghi mở ở chế độ xem: bấm **Sửa** (hoặc **F2**, hoặc bấm đúp) để sửa. **Gửi duyệt** / **Duyệt** vẫn bấm được khi đang xem.
3. **Chính sách tự áp**.
4. **Công nợ & hạn mức**: nợ đã ghi · đang chờ · phiếu này / hạn mức (NCC và nhãn tại chi nhánh).
5. **Tổng tiền**, hạn thanh toán, CKTT dự kiến, tiền ứng trước được trừ.

## Nút

| Nút | Việc |
|---|---|
| Ghi | Lưu nháp |
| Gửi duyệt | Chuyển *Chờ duyệt*; ghi cảnh báo vào nhật ký. Phiếu chờ duyệt tính vào "đang chờ" của hạn mức |
| Duyệt (ghi sổ) | Ghi bút toán, công nợ, kho. Khoá khi còn cảnh báo chặn. Xong thì tab Hạch toán hiện số chứng từ kế toán (xem ở ACC14) |
| Duyệt ngoại lệ | Chỉ hiện khi chặn duy nhất vì **vượt hạn mức**; bắt buộc nhập lý do, lưu người / giờ / lý do (MH10) |
| Bỏ duyệt | Huỷ các chứng từ kế toán của phiếu (đảo bút toán bằng số âm, gỡ kho, gỡ đối trừ), phiếu về nháp để sửa |
| Huỷ phiếu | Phiếu chưa duyệt; không xoá |

## Các trường hợp thường gặp

| Muốn làm | Cách làm |
|---|---|
| NCC giảm giá / chiết khấu thêm **sau khi đã nhập** | **+ Thêm chứng từ → Chiết khấu / giảm giá sau mua**: chọn NCC, tích các phiếu nhập được giảm, nhập số tiền; có hoá đơn điều chỉnh thì chọn VAT và số hoá đơn. Duyệt: giảm công nợ, giảm giá vốn từng mã |
| Chi phí vận chuyển, bốc xếp cho **nhiều phiếu nhập** | **Chi phí mua hàng**: chọn loại chi phí, tích các phiếu nhập, chọn phân bổ theo giá trị hoặc số lượng |
| TGS **tự mua quà** để tặng khách | Phiếu **Nhập mua**, nhập các mã quà (theo quy tắc mã hàng, quà khuyến mại có mã bắt đầu bằng **Q**) — phiếu toàn mã quà phần mềm tự hiểu là mua quà để tặng, vào sổ quà tặng (MH09), không phải đánh dấu; nhập chương trình; có số hoá đơn thì tính là quà có VAT |
| Xuất quà tặng khách | **Xuất quà tặng**: nhập chương trình trên từng dòng. Xuất quá số quà còn tồn của chương trình tại chi nhánh thì không duyệt được |
| Ngày sản xuất của lô | Cột **NSX** trên dòng hàng (nếu có) |
| Trả hàng | Chọn phiếu nhập gốc; trả quá số đã nhận (trừ phần đã trả trước đó) thì không duyệt được |
| NCC còn nợ quá hạn | Khi lập phiếu nhập / đơn đặt, Trợ lý báo "NCC đang có X khoản nợ quá hạn" để cân nhắc thanh toán trước |

## Đơn giá và thành tiền trên dòng hàng

- **Đơn giá được có số lẻ** (tới 4 chữ số sau dấu phẩy), gõ như trên hoá đơn: dấu chấm ngăn hàng nghìn, **dấu phẩy** trước phần lẻ, ví dụ `506.018,52`. Dán từ Excel dạng `506018.52` cũng nhận đúng. CK % cũng được có số lẻ (`2,5`). Rời ô thì số tự định dạng lại.
- **Thành tiền và tiền thuế luôn tròn đồng**: thành tiền = SL × đơn giá (giữ nguyên số lẻ khi nhân) rồi mới làm tròn. Ví dụ 72 × 506.018,52 = 36.433.333,44 → **36.433.333**; thuế 8% → **2.914.667**. Công nợ, bút toán, báo cáo tiền đều là số đồng tròn.
- Áp dụng cho đơn đặt hàng, phiếu nhập, trả / đổi hàng NCC, hoá đơn NCC, giá mua của NCC và giá mua riêng của mặt hàng. Giá quy đổi tự động (gồm ↔ chưa thuế, đổi ĐVT) cũng giữ số lẻ, không ép về đồng.

- Dưới ô **đơn giá**, phần mềm so với **giá đã thoả thuận với NCC** (khai ở Hồ sơ NCC → Mặt hàng & giá mua; không có thì giá mua chung của mặt hàng, rồi tới lần nhập trước):
  - xanh **"✓ đúng giá NCC"**;
  - cam / đỏ **"cao hơn giá NCC 3,2% (431.000)"** — hoá đơn ghi sai giá hoặc NCC tăng giá; bấm vào để đưa về giá đã thoả thuận; mức lệch cho phép khai **một lần** ở Cài đặt mua hàng (MH12), mặc định 2%, lệch quá gấp đôi thì báo đỏ; lệch quá mức cho phép thì Trợ lý báo cảnh báo trước khi duyệt;
  - chưa nhập giá: nút **"Dùng giá NCC …"**.
- Cột **Thành tiền (gồm thuế)** cuối mỗi dòng = thành tiền chưa thuế (sau chiết khấu) + tiền thuế; dòng cộng có tổng.
- **Bảng khuyến mại**: hai cột **SL quà được tặng / SL quà trên phiếu** chỉ hiện khi phiếu có quà mua X tặng Y (lệch thì số trên phiếu tô đỏ); chiết khấu ghi tay trên phiếu hiện "ghi trên phiếu" ở cột Chương trình.

## Giá gồm / chưa VAT — một loại giá trên cả phiếu

- Ô **Đơn giá nhập vào là** chọn một lần cho phiếu: **Giá đã gồm thuế GTGT** (mặc định — như giá thanh toán) hoặc **Giá chưa thuế** (như trên hoá đơn GTGT).
- Mọi giá phần mềm đưa ra trên phiếu đều **quy về đúng loại giá này và đúng ĐVT của dòng**: gợi ý dưới ô đơn giá, khung **Giá mua** của Trợ lý (giá đã thoả thuận, 5 lần nhập gần nhất), nút "Dùng giá lần gần nhất", cảnh báo lệch giá. Giá NCC khai theo loại nào (gồm / chưa VAT, Thùng / Hộp) phần mềm tự quy đổi, dòng nhỏ ghi giá khai gốc để đối chiếu.

## Đơn đặt hàng gửi NCC

- **Lập từ Phân tích đặt hàng (MH02)**: tích mã → *Lập đơn đặt* — dòng mang sẵn quy cách, ghi chú mặt hàng NCC, số liệu tồn (cột **Phân tích tồn**: cần nhập, tồn kho, chưa về, bán 1 tuần, max kho / shop).
- Ô đầu phiếu: **Ngày giao hàng**, **Giao tại kho**, **Ngân sách mua** (hiện *Còn / Vượt* so với tổng sau CK chưa thuế — chỉ để ước lượng, không chặn).
- Mỗi dòng có **Ghi chú** (in trên đơn gửi NCC). Đặt theo thùng / lốc thì chọn ĐVT đó ở cột **ĐVT** (khai ĐVT nhiều cấp ở mặt hàng, vd Thùng = 48 Hộp) — không còn cột Quy cách riêng.
- **+ Hàng mới chưa có mã**: hàng NCC mới chào — ghi tên theo NCC, mã bên NCC, ĐVT, quy cách; đơn lưu và gửi NCC bình thường. Hàng về: lập phiếu nhập từ đơn → dòng *Hàng mới — gắn mã* → chọn mã vừa tạo ở Danh mục mặt hàng (bắt buộc trước khi duyệt) → lưu phiếu nhập thì mã ghi ngược vào đơn đặt.
- **Xem mẫu đơn gửi NCC** / **Xuất Excel mẫu NCC**: đúng mẫu NCC nhận (ĐƠN ĐẶT HÀNG, khối NPP, ngày giao, kho nhận, 17 cột, SL cần nhập nền cam, Tồn kho nền vàng, phân tích thông minh, tổng trị giá) — khổ ngang, Times New Roman.

## Bảng hàng của đơn đặt

- Cột **Phân tích tồn** đứng ngay sau **SL**: bảng *Phân tích thông minh* (SL cần nhập, tồn kho, chưa nhập kho, BH tháng liền kề, doanh số 1 tuần, max kho, đi đường, max shop, tồn shop + họ mã) — chụp lúc thêm hàng, lưu cùng đơn.
- Bảng hàng **tự cuộn trong khung**: tiêu đề cột đứng yên, thanh cuộn ngang luôn thấy ở đáy khung, phần đầu phiếu không bị cuộn mất.
- Thuế suất **KCT (không chịu thuế)** cho hàng không chịu thuế GTGT (tiền thuế 0); **Không kê khai** cho quà / hàng không hoá đơn.

## Tệp đính kèm và Tệp của NCC

- Thẻ **Tệp đính kèm**: tệp của riêng phiếu (hoá đơn, biên bản giao hàng…).
- Thẻ **Tệp của NCC** (đơn đặt, phiếu nhập): hợp đồng, phụ lục, báo giá, CO / CQ… của nhà cung cấp — dùng chung mọi phiếu của NCC, cũng là thẻ *Tệp đính kèm* ở hồ sơ NCC. Gắn thêm tệp ở đây là gắn vào hồ sơ NCC.
- Bấm tên tệp để **xem ngay trên web, đúng như khi tải về**: Excel giữ màu nền, màu chữ, đậm / nghiêng, viền, gộp ô, độ rộng cột, từng sheet (màu thẻ sheet); Word (.docx) dàn trang như Word; PDF xem bằng trình xem PDF; ảnh đúng màu, bấm để xem cỡ thật. Word .doc đời cũ thì bấm Tải về.
- Xem / tải tệp được cả khi phiếu đang ở chế độ xem hay đã duyệt.

## Số liệu phân tích tồn lưu theo lúc lưu đơn

Đơn đặt còn **nháp**: mỗi lần bấm **Ghi** (hoặc Gửi duyệt / Duyệt) phần mềm chụp lại *Phân tích tồn* của **đúng lúc đó** cho mọi dòng và lưu cùng đơn. Đơn đã gửi duyệt / đã duyệt giữ nguyên số lúc lưu cuối — mở lại, xem mẫu / xuất Excel gửi NCC đều là số đó.

## Phân kho

Hàng của chi nhánh nằm ở các **phân kho** (kho hàng, kho quà, kho khuyến mại, kho luân chuyển…, khai ở DM12 Danh mục kho). Mỗi phân kho có công dụng riêng.

- **Phiếu có hàng ra / vào kho** (nhập mua, trả NCC, đổi hàng, nhận / xuất quà) có ô **Phân kho (\*)** ngay cạnh Chi nhánh:
  - mặc định là kho mặc định của chi nhánh;
  - đổi chi nhánh thì phân kho tự về kho mặc định của chi nhánh mới;
  - **mọi dòng hàng đi theo phân kho này**, cột "Phân kho" ở bảng hàng chỉ để xem, không chọn riêng từng dòng.
- Phiếu nhập lập từ đơn đặt lấy kho theo **"Giao tại kho"** của đơn. Đơn đặt không có phân kho vì là số tổng theo công thức đặt hàng.
- Muốn đưa hàng sang phân kho khác (kể cả trong cùng chi nhánh) thì lập **phiếu chuyển kho**. Không sửa phân kho trên phiếu đã duyệt.
- Chứng từ không ghi kho (phiếu bán từ hệ thống bán hàng, phiếu cũ) được tính vào **kho mặc định** của chi nhánh. Chi nhánh chưa khai kho thì khai ở DM12.
- **Lọc danh sách:** ô "Mọi chi nhánh, mọi kho" trên thanh lọc → tích chi nhánh → các phân kho của chi nhánh hiện ngay bên dưới để tích tiếp. Không tích kho nào nghĩa là mọi kho của chi nhánh đã tích.

## Kiểu xem: Danh sách phiếu / Gom theo NCC, chi nhánh, mã…

- **Danh sách phiếu** (mặc định): mỗi phiếu một dòng, cột tiền và công nợ như bảng dưới. Bấm đôi để mở phiếu.
- **Gom theo NCC / chi nhánh / mã / nhóm…**: thay các thẻ loại phiếu bằng các thẻ *Theo mã hàng, nhóm hàng, ngành hàng, nhãn hàng, nhà cung cấp, chi nhánh*.

Các phiếu **đã duyệt** (đã vào sổ) trong kỳ (Từ ngày – Đến ngày bên trái), gom theo một trong các tiêu chí:

| Thẻ | Dùng để |
|---|---|
| Theo mã hàng | Giá vốn thực tế / ĐVT từng mã; so giá giữa các lần nhập |
| Theo nhóm hàng, ngành hàng | Tổng hợp theo cây danh mục hàng |
| Theo nhãn hàng | Doanh số nhập của nhãn (đối chiếu chỉ tiêu, thưởng) |
| Theo nhà cung cấp | Giá trị mua, chiết khấu được hưởng, hàng trả, còn nợ từng NCC |
| Theo chi nhánh | Giá trị nhập từng chi nhánh |

**Các cột** (tiền trước thuế):
- **SL mua / SL tặng / SL trả**: số lượng hàng mua, hàng khuyến mại nhận, hàng trả lại.
- **Tiền hàng trước CK**, **Chiết khấu**, **Giá trị nhập**: giá trị nhập = tiền hàng − chiết khấu.
- **Thuế GTGT**, **Hàng trả lại**.
- **+ Chi phí phân bổ**: vận chuyển, bốc xếp… đã phân bổ vào mã.
- **− Thưởng / CK sau mua**: thưởng cuối kỳ, chiết khấu bổ sung đã phân bổ vào mã.
- **Giá trị thuần** = giá trị nhập − hàng trả + chi phí − thưởng.
- **Giá vốn TT / ĐVT** (chỉ thẻ mã hàng) = giá trị thuần / (SL mua + SL tặng chia giá − SL trả).
- **Còn nợ NCC**: phần chưa trả của phiếu nhập, chia theo giá trị từng dòng — biết mã / nhóm / ngành nào còn nợ bao nhiêu.

Kiểu này chỉ lọc theo kỳ (bộ lọc NCC, chi nhánh, trạng thái không áp). Bấm **Xuất Excel** hoặc **In** để lấy file.

- Chi tiết từng dòng hàng và cộng dồn theo mã hàng (số lượng quy ĐVT nhỏ nhất, tiền trước CK − chiết khấu = sau CK, thuế, tổng thanh toán): xem **Báo cáo mua hàng (MH23)**.

### Cột tiền và công nợ ở kiểu "Danh sách phiếu"

| Cột | Ý nghĩa |
|---|---|
| Ký hiệu HĐ / Số HĐ / Ngày HĐ | hoá đơn của NCC ghi trên phiếu |
| Tiền hàng trước CK (chưa thuế) | Σ SL × đơn giá các dòng hàng mua, chưa trừ chiết khấu (phiếu giá gồm thuế được quy về chưa thuế) — chỉ đơn đặt, nhập mua, trả NCC |
| Chiết khấu (chưa thuế) | trước CK − sau CK (CK dòng + CK trên đơn) |
| Tiền hàng sau CK (chưa thuế) | tiền hàng ghi sổ |
| Tiền thuế GTGT | |
| Tổng thanh toán (gồm thuế) | sau CK + thuế |
| Công nợ phát sinh | số ghi vào công nợ NCC (TK 331) khi duyệt: phải trả NCC, hoặc NCC nợ lại mình (ứng trước, trả hàng, thưởng) |
| Đã trả / đã đối trừ | phiếu trả tiền, ứng trước, trả hàng… đã đối trừ vào phiếu này |
| Còn lại | công nợ phát sinh − đã trả |
| Tình trạng công nợ | Chưa trả · Trả một phần · Đã trả đủ (thêm "quá hạn" khi qua hạn TT); phiếu NCC nợ lại mình: Chưa đối trừ · Đối trừ một phần · Đã đối trừ hết; phiếu chưa duyệt để trống (chưa ghi sổ) |

Báo cáo mua hàng (MH23) — kiểu "Chi tiết dòng hàng" — cũng có Ký hiệu HĐ / Ngày HĐ và cột "Công nợ của phiếu" (tình trạng của cả phiếu chứa dòng, không chia theo dòng).
