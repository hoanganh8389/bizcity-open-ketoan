# Tài sản cố định, công cụ dụng cụ, chi phí trả trước

Theo dõi từng tài sản trên **thẻ** và để phần mềm **tự trích khấu hao / phân bổ** mỗi tháng.

| Màn | Mã | Dùng để |
|---|---|---|
| Tài sản cố định | ACC28, ACC30 | Thêm thẻ (ghi tăng), sửa, ghi giảm, nhập từ Excel |
| Công cụ dụng cụ | ACC22 | Thẻ công cụ dụng cụ đã xuất dùng, phân bổ dần |
| Chi phí trả trước | ACC23 | Khoản trả trước (thuê nhà, bảo hiểm, phần mềm…) phân bổ dần |
| Đánh giá lại tài sản | ACC32 | Đổi nguyên giá, luỹ kế, thời gian sử dụng còn lại |
| Điều chuyển tài sản | ACC33 | Chuyển tài sản sang chi nhánh khác; khác đơn vị hạch toán thì lập phiếu ghi sổ ở cả hai bên |
| Kiểm kê tài sản | ACC35 | Ghi kết quả kiểm kê từng tài sản |
| Tính khấu hao, phân bổ | ACC31 | Trích một tháng, ghi sổ; sửa tay số trích; dồn các tháng chưa trích |
| Loại tài sản | ACC37 | Tài khoản, số tháng ngầm định của từng nhóm; loại cha (ví dụ "TSCĐ hữu hình") gom các loại con và khai tài khoản tổng hợp; chỉ xoá được loại chưa có loại con và chưa dùng trên thẻ |
| Nhóm công cụ dụng cụ | ACC19 | Phân nhóm thẻ công cụ dụng cụ, chi phí trả trước (có sẵn PB001 Nhóm công cụ dụng cụ, PB002 Nhóm chi phí); chọn ở ô "Nhóm công cụ dụng cụ" trên thẻ |
| Mục đích sử dụng | ACC21 | Mục đích dùng tài sản, công cụ (bán hàng, quản lý…); chọn ở ô "Mục đích sử dụng" trên thẻ |
| Sổ tài sản, báo cáo tài sản, báo cáo phân bổ | ACC29, ACC42, ACC85, ACC27 | Nguyên giá, luỹ kế, trích trong kỳ, còn lại |
| Kế hoạch khấu hao, phân bổ | TS01 | Số trích từng tháng của mọi thẻ: tháng đã ghi sổ và kế hoạch các tháng tới |

## Quy trình

1. **Khai thẻ**, gồm:
   - nguyên giá, giá trị tính khấu hao (trống = nguyên giá);
   - ngày bắt đầu trích, số tháng;
   - tài khoản hao mòn (2141, 2143) hoặc tài khoản chờ phân bổ (24218, 24228…);
   - tài khoản chi phí (6424, 6414, 64231…);
   - chi nhánh, khoản mục, bộ phận;
   - **thông số kỹ thuật** (kích thước, điện năng tiêu thụ, model, số khung…; mỗi dòng một tên – giá trị) và **ảnh tài sản** (chọn ảnh là lưu luôn, ảnh tự thu nhỏ). Khi nhập từ Excel, ba cột *Kích thước*, *Điện năng tiêu thụ*, *Thông số khác* (dạng `Tên: giá trị; Tên: giá trị`) điền vào phần thông số; để trống cả ba thì giữ thông số đã có.

   Chọn **loại tài sản** thì các tài khoản và số tháng được điền sẵn.
2. **Hạch toán ghi tăng**: mở thẻ, bấm **Hạch toán ghi tăng** (xem mục dưới). Nếu đã ghi tăng bằng chứng từ khác (phiếu mua hàng có nhập thẳng 211, phiếu xuất công cụ Nợ 242 / Có 153…) thì bỏ qua bước này.
3. **Cuối tháng**, mở màn **Tính khấu hao, phân bổ (ACC31)** và bấm **Tính tháng …**. Mỗi chi nhánh nhận một chứng từ "Khấu hao, phân bổ" ghi ngày cuối tháng:
   **Nợ TK chi phí / Có TK hao mòn hoặc chờ phân bổ.**
4. **Ghi giảm, thanh lý, nhượng bán**: tính khấu hao đến tháng trước tháng ghi giảm, rồi mở thẻ bấm **Ghi giảm / thanh lý** (xem mục dưới). Thẻ chuyển sang **Đã ghi giảm**, phần mềm chỉ trích tới hết ngày trước ngày ghi giảm.

Thứ tự cuối tháng: **tính giá vốn → tính khấu hao, phân bổ → kết chuyển lãi lỗ → khoá sổ**.

## Hạch toán ghi tăng, ghi giảm, thanh lý

Ở thẻ tài sản bấm **Hạch toán ghi tăng** hoặc **Ghi giảm / thanh lý**. Phần mềm gợi ý định khoản, sửa được từng dòng (tài khoản, số tiền, đối tượng, diễn giải), rồi **Ghi sổ phiếu kế toán**. Phiếu sinh ra là phiếu kế toán bình thường (sửa / huỷ ở màn Phiếu kế toán), hiện ở mục Lịch sử của thẻ.

| Nghiệp vụ | Gợi ý |
|---|---|
| Ghi tăng TSCĐ | Nợ TK nguyên giá (211x) / Có TK đối ứng (chọn 331, 112, 241…) = nguyên giá |
| Ghi tăng CCDC, chi phí trả trước | Nợ TK chờ phân bổ (242x) / Có TK đối ứng = giá trị phân bổ |
| Ghi giảm TSCĐ | Nợ TK hao mòn / Có TK nguyên giá = hao mòn luỹ kế; Nợ 8111 / Có TK nguyên giá = giá trị còn lại |
| Ghi giảm CCDC, chi phí trả trước | Nợ TK chi phí của thẻ / Có TK chờ phân bổ = phần chưa phân bổ |
| Thanh lý, nhượng bán (thêm dòng) | **Giá bán thanh lý**: Nợ 1311 / Có 7111, mã thuế R10 (thuế GTGT đầu ra tự ghi Có 33311 và vào sổ hoá đơn); **Chi phí thanh lý**: Nợ 8111 / Có 1111 |

Phần mềm cảnh báo khi thẻ chưa trích tới tháng trước tháng ghi giảm (luỹ kế chưa đủ) và khi thẻ đã được hạch toán ghi tăng / ghi giảm trước đó. Hao mòn luỹ kế lấy theo sổ kế toán.

## Kế hoạch khấu hao, phân bổ

- Ở thẻ, nút **Lịch khấu hao / phân bổ**: cả vòng đời của thẻ theo từng tháng, mỗi tháng ghi **Đã ghi sổ**, **Chưa trích** (tháng đã qua chưa tính) hoặc **Kế hoạch**, kèm luỹ kế và còn lại.
- Màn **Kế hoạch khấu hao, phân bổ (TS01)**: chọn từ tháng, số tháng (3 – 36), nhóm; mỗi dòng một thẻ, mỗi cột một tháng, dòng cộng theo tháng. Số đen đã ghi sổ, số xám là kế hoạch, số đỏ là tháng đã qua chưa trích. Xuất Excel được.

Kế hoạch tính theo thẻ hiện tại (đánh giá lại, sửa tay số trích, ghi giảm đều được tính); thẻ thay đổi thì kế hoạch đổi theo.

## Chuyển năm tài chính

Không có bước chuyển năm hay kết chuyển số dư tài sản sang năm mới: nguyên giá, luỹ kế, giá trị còn lại tính liên tục từ thẻ và số đã trích qua các năm, đầu năm mới cứ tính khấu hao tháng 1 như mọi tháng. Muốn chốt năm cũ thì khoá kỳ các tháng của năm đó (loại chứng từ "Khấu hao, phân bổ") ở màn Đóng / mở kỳ (ACC2).

## Cách tính (đường thẳng)

- **Mức tháng** = giá trị tính khấu hao ÷ số tháng. Nếu thẻ có ghi **Mức trích mỗi tháng** thì dùng mức đó; mức này được ghi số lẻ, mỗi tháng làm tròn đồng.
- **Tháng đầu** tính theo số ngày dùng. Ví dụ bắt đầu ngày 15/01: mức tháng × 17/31.
- **Tháng ghi giảm** trích tới hết ngày trước ngày ghi giảm. Từ tháng sau không trích nữa.
- **Tháng cuối** trích nốt phần còn lại, để tổng trích đúng bằng giá trị tính khấu hao. Phần lẻ do làm tròn dồn vào tháng này.
- Thẻ **Tạm ngừng trích** thì không trích.
- Không bao giờ trích vượt phần còn lại.

## Chia chi phí cho nhiều nơi

Một tài sản dùng chung (ví dụ biển hiệu cho hai cửa hàng) được chia số trích theo tỷ lệ. Ở phần **Phân bổ chi phí cho nhiều nơi** trên thẻ, mỗi dòng gồm:
- tỷ lệ %;
- **chi nhánh chịu chi phí** (trống = chi nhánh đang dùng tài sản);
- tài khoản chi phí, khoản mục, bộ phận.

Tổng tỷ lệ phải bằng 100%. Bút toán của mỗi phần ghi vào chứng từ khấu hao của đúng chi nhánh chịu chi phí.

## Đánh giá lại, điều chuyển, kiểm kê

Thao tác ở màn riêng (ACC32, ACC33, ACC35) hoặc ngay trên thẻ, phần **Lịch sử**. Đánh giá lại, kiểm kê **không tự ghi sổ cái**; bút toán (nếu có) lập bằng phiếu kế toán.
- **Đánh giá lại**: ghi chênh lệch nguyên giá, chênh lệch luỹ kế, số tháng còn phải trích. Mức tháng mới = phần còn lại ÷ số tháng còn lại, hoặc ghi thẳng mức mới. Có hiệu lực từ tháng đánh giá lại.
- **Điều chuyển**: chọn chi nhánh nhận. Tháng điều chuyển, số trích được **chia theo số ngày** dùng ở mỗi nơi. Từ tháng sau, toàn bộ tính cho nơi mới. Chỉ xoá được lần điều chuyển gần nhất; xoá thì tài sản trở về chi nhánh cũ.
  - Hai chi nhánh **cùng đơn vị hạch toán**: không ghi sổ, tài sản chỉ đổi nơi dùng.
  - **Khác đơn vị hạch toán** (mỗi bên tự ghi sổ, khai ở ô *Đơn vị hạch toán* của chi nhánh): ở màn ACC33 bấm **Hạch toán…** trên dòng điều chuyển. Phần mềm gợi ý theo số luỹ kế đến hết tháng trước tháng điều chuyển và lập **hai phiếu kế toán**:
    - bên giao: Nợ TK hao mòn / Có TK nguyên giá = hao mòn luỹ kế; Nợ 13681 (đối tượng chi nhánh nhận) / Có TK nguyên giá = giá trị còn lại;
    - bên nhận: Nợ TK nguyên giá / Có TK hao mòn = hao mòn luỹ kế; Nợ TK nguyên giá / Có 33681 (đối tượng chi nhánh giao) = giá trị còn lại;
    - công cụ dụng cụ, chi phí trả trước: bên giao Nợ 13681 / Có TK chờ phân bổ, bên nhận Nợ TK chờ phân bổ / Có 33681 = phần chưa phân bổ.

    Tài khoản 13681 / 33681 lấy theo **Tài khoản ngầm định** (phải thu, phải trả nội bộ). Thẻ chưa trích đủ tới tháng trước thì có cảnh báo: nên tính khấu hao trước. Một lần điều chuyển chỉ hạch toán một lần; đã hạch toán thì phải huỷ hai phiếu trước khi xoá lần điều chuyển.
- **Kiểm kê**: kết quả (còn tốt, hỏng, không dùng, thiếu), số lượng thực tế. Tài sản thiếu, hỏng thì xử lý bằng ghi giảm hoặc tạm ngừng.

## Sửa tay số trích của một tháng

Ở màn ACC31, bấm vào dòng tài sản, rồi ghi số trích tháng này và **lý do** (bắt buộc). Sau đó bấm **Tính tháng** lại để áp dụng. Muốn quay về số máy tính thì bấm **Bỏ sửa tay**.

## Chuyển tài sản từ sổ cũ sang (nhập từ Excel)

1. Ở màn **Tài sản cố định**, bấm **Nhập từ Excel** rồi **Tải tệp mẫu** để có đủ cột (sheet "Huong dan" giải thích từng cột).
2. Mỗi tài sản một dòng. Với tài sản đã trích một phần ở sổ cũ, ghi:
   - **Luỹ kế đã khấu hao** và **Luỹ kế tính tới ngày**: số đã trích tới hết ngày đó;
   - **Số tháng còn lại** sau ngày đó;
   - **Mức khấu hao tháng** như sổ cũ.

   Phần mềm trích tiếp từ tháng sau ngày đó; hết số tháng còn lại thì trích nốt phần còn lại.
3. Chọn tệp, bấm **Kiểm tra** (chưa ghi gì). Có lỗi thì sửa tệp rồi chọn lại. Hết lỗi thì bấm **Nhập**.
4. Đánh dấu **Chi nhánh chưa có thì tự tạo** nếu tệp có mã chi nhánh chưa khai.

Phần mềm **nhận đúng số trong tệp**, kể cả số bất thường, để khớp với số dư tài khoản 214. Những trường hợp đáng xem lại được liệt kê ở mục **Cần xem lại**:
- **Luỹ kế vượt giá trị tính khấu hao** (sổ cũ trích lố): phần mềm không trích thêm. Kế toán kiểm tra rồi điều chỉnh bằng Đánh giá lại (giảm luỹ kế) kèm phiếu kế toán.
- **Hết số tháng nhưng còn giá trị**: tháng đầu tiên sẽ trích nốt toàn bộ phần còn lại.

**Tài sản chưa được trích tới ngày chốt** (chi nhánh chạy khấu hao chậm ở sổ cũ): mốc luỹ kế là tháng cuối cùng thực sự đã trích. Ở màn ACC31, phần mềm báo **tháng thiếu**. Có hai cách, **chỉ chọn một**:
- chạy nốt các tháng đó ở sổ cũ, rồi xuất và nhập lại thẻ (thẻ chưa trích tháng nào ở phần mềm mới thì được cập nhật);
- hoặc ở phần mềm mới, đánh dấu **Dồn các tháng chưa trích vào tháng này** rồi tính. Phần mềm tính lần lượt từng tháng thiếu theo đúng công thức và ghi dồn vào tháng đang tính, với dòng riêng diễn giải "trích bổ sung các tháng trước chưa trích".

## Ngắn hạn, dài hạn của chi phí chờ phân bổ

Trên Báo cáo tình hình tài chính:
- 2421x lên chỉ tiêu 161 (ngắn hạn), 2422x lên chỉ tiêu 271 (dài hạn).
- Với các khoản có thẻ, phần mềm tách lại theo lịch phân bổ: phần sẽ phân bổ trong **12 tháng tới** là ngắn hạn, phần sau đó là dài hạn.

## Lưu ý

- Thẻ đã trích tháng nào thì không xoá được. Thay vào đó hãy ghi giảm hoặc tạm ngừng.
- Số tháng khấu hao tài sản cố định phải nằm trong khung của Phụ lục I Thông tư 45/2013/TT-BTC.
- Tính lại một tháng bao nhiêu lần cũng được: bút toán cũ tự ghi số âm.

## Căn cứ pháp lý

Thông tư 45/2013/TT-BTC về quản lý, sử dụng và trích khấu hao tài sản cố định (sửa đổi bởi Thông tư 147/2016, 28/2017, 30/2025; Bộ Tài chính công bố tiếp tục có hiệu lực theo Quyết định 1760/QĐ-BTC ngày 01/7/2026). Thông tư 99/2025/TT-BTC, hướng dẫn tài khoản 211, 213, 214, 242. Xem thêm màn **Căn cứ pháp lý** (TI11).
