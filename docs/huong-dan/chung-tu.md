# Định khoản tự động (ACC14) — trạm điều khiển chứng từ

Phiếu mua, bán, trả lại, chuyển kho, điều chỉnh kho lập ở **hệ thống bán hàng** (multisite, cửa hàng WooCommerce…), không lập ở phần mềm kế toán. Màn này **kéo** các phiếu đang chờ đẩy sang qua các **kết nối** (hoặc nhận khi hệ thống bán hàng tự đẩy vào cổng chờ), lưu thành chứng từ ở trạng thái **Chờ định khoản**. Chứng từ chỉ vào **sổ nhật ký chung** khi kế toán định khoản ở màn này. Màn luôn hiện nội dung mới nhất của từng chứng từ.

## Kết nối và kéo chứng từ

- Nút **Kết nối**: khai các hệ thống nguồn — mã (cũng là **Nguồn** của chứng từ), tên, kiểu (**Đầu chuẩn** của hệ thống bán hàng, hoặc **WooCommerce**), đường dẫn, khoá. Nút **Thử** kiểm tra kết nối. Sửa kết nối cần quyền kế toán trưởng.
- Nút **Kéo chứng từ**: chọn khoảng ngày và các kết nối, bấm Kéo. Kết quả báo số chứng từ đọc được, mới / phiên bản mới, không đổi, lỗi (kèm lý do).
- **Tự kéo khi mở màn** (mặc định bật): mở màn là kéo các kết nối đang bật theo khoảng ngày đang lọc. Bỏ tích để tắt.
- Chứng từ kéo về **luôn chờ định khoản**. Kéo lại cùng phiên bản thì bỏ qua; phiên bản mới thì chờ định khoản lại.
- Lọc **Nguồn** để xem riêng từng hệ thống; cột **Phiếu nguồn** cho biết loại phiếu ở hệ thống bán hàng, bấm để mở phiếu gốc.

## Các thẻ

| Thẻ | Nội dung | Việc cần làm |
|---|---|---|
| **Chờ định khoản** | Chứng từ chưa vào sổ, hoặc đã vào sổ nhưng nơi phát sinh vừa gửi phiên bản mới (ghi "chờ định khoản lại") | Tích **Chọn** rồi **Định khoản**, hoặc **Định khoản tất cả đang hiện** |
| **Lỗi định khoản** | Chứng từ không định khoản được (thiếu tài khoản, lý do, loại thuế, kỳ đã khoá…), cột Lỗi ghi rõ | Sửa cấu hình rồi định khoản lại |
| **Đã định khoản** | Chứng từ đã vào sổ | Tích chọn rồi **Định khoản lại** khi vừa sửa cấu hình hạch toán |
| **Tất cả** | Mọi chứng từ và trạng thái | Bấm dòng để xem chứng từ, bút toán, nhật ký |
| **Nhật ký định khoản** | Mỗi lần nhận, định khoản, định khoản lại, lỗi, huỷ của từng chứng từ: thời gian, phiên bản, bút toán ghi, số bút toán đảo, tổng tiền, người làm | Lọc theo loại chứng từ, ngày, hành động để tra |

Số trên thẻ là số chứng từ chờ / lỗi theo bộ lọc đang chọn.

## Định khoản theo lô

1. Lọc: khoảng ngày, chi nhánh, loại chứng từ, ô tìm (số chứng từ, số hoá đơn, tên khách).
2. Tích các chứng từ cần định khoản (ô **Chọn** ở đầu cột chọn cả trang).
3. Bấm **Định khoản** (hoặc **Định khoản tất cả đang hiện**). Phần mềm chạy từng lô 50 chứng từ, hiện tiến độ; xong báo số chứng từ đã ghi sổ, bỏ qua và lỗi (kèm lý do).

Định khoản cần quyền ghi chứng từ.

## Phiếu bán, phiếu thu tách bạch trên sổ

Một phiếu bán từ hệ thống bán hàng sinh **các bút toán riêng**:

| Bút toán | Loại chứng từ trên sổ | Số chứng từ |
|---|---|---|
| Bán hàng (doanh thu, thuế, giá vốn) | Hoá đơn bán hàng | mã phiếu bán |
| Mỗi phiếu thu tiền của đơn — **chứng từ riêng**, ghi theo **ngày thu** | **Thanh toán khách hàng** | mã phiếu thu |

Phiếu thu ghi trả cho phiếu bán nào thì công nợ tự đối trừ đúng phiếu đó (phiếu thu về trước thì khi phiếu bán định khoản sẽ tự ghép). Tương tự: hàng bán trả lại + phiếu chi trả tiền khách (Thanh toán khách hàng, chiều chi); nhập mua / trả hàng NCC + tiền trả ngay (**Thanh toán nhà cung cấp**). Lọc Sổ nhật ký chung theo loại chứng từ tách được phiếu bán và phiếu thu. Thu thêm tiền, đổi hình thức thanh toán chỉ đụng tới bút toán thanh toán (xem Định khoản lại).

**Đổi trả** (khách trả hàng rồi mua đơn mới, tiền hàng trả lại trừ vào đơn): phiếu hoàn ghi giảm doanh thu và Có 131 của khách; đơn mới ghi Nợ 131; phần đối trừ **không sinh bút toán tiền** — công nợ của khách giữa phiếu hoàn và đơn mới được đối trừ với nhau. Khách trả thêm phần chênh bằng phiếu thu thật (Thanh toán khách hàng); đơn mới nhỏ hơn thì phần thừa trả khách bằng phiếu chi.

## Định khoản lại

- Chứng từ **đã định khoản** không sửa bút toán trực tiếp. Muốn đi theo cấu hình mới: tích chọn ở thẻ Đã định khoản → **Định khoản lại**.
- Định khoản lại **chỉ phần thay đổi**: phần mềm dựng lại các bút toán theo nội dung mới và cấu hình hiện tại, so với bút toán đang có. Bút toán **không đổi thì giữ nguyên**; bút toán đổi thì được **ghi số âm** (đảo, có liên kết với bút toán gốc) rồi ghi bút toán mới. Ví dụ shop thu thêm tiền hoặc đổi hình thức thanh toán: bút toán bán hàng giữ nguyên, chỉ bút toán thu tiền được đảo và ghi lại. Không xoá gì; tổng sổ không bị ghi trùng. Nhật ký định khoản ghi rõ giữ mấy, đảo mấy, ghi mấy bút toán.
- Nơi phát sinh gửi **phiên bản mới** của chứng từ đã định khoản: chứng từ về thẻ Chờ định khoản (ghi "chờ định khoản lại"), **sổ vẫn giữ bút toán của phiên bản cũ** cho tới khi kế toán định khoản lại.
- Gửi lại đúng phiên bản đang có thì không đổi gì.

## Chế độ định khoản

Nút **Chế độ định khoản** (góc trên): áp dụng cho chứng từ hệ thống bán hàng **đẩy** vào cổng chờ; chứng từ kéo về luôn chờ. Chọn cho từng loại chứng từ (hoá đơn bán, hàng bán trả lại, nhập mua, trả hàng nhà cung cấp, chuyển kho, điều chỉnh kho, chuyển tiền, thu tiền khách, trả tiền nhà cung cấp):

- **Chờ định khoản** (mặc định): chứng từ tới chỉ lưu, chờ kế toán định khoản ở màn này.
- **Định khoản ngay**: chứng từ tới là vào sổ ngay. Chỉ bật khi đã kiểm cấu hình hạch toán ổn định.

Phiếu thu, phiếu chi, báo nợ, báo có, phiếu kế toán do kế toán tự lập ghi sổ khi bấm Ghi ở phiếu.

## Xem trước rồi mới định khoản

Bấm một dòng để mở chứng từ (chỉ xem). Chứng từ chờ / lỗi tự hiện khối **Xem trước định khoản**: các bút toán sẽ ghi (tài khoản, đối tượng, mặt hàng, Nợ / Có), số bút toán đang có sẽ bị đảo, có lên sổ hoá đơn không, hàng vào / ra kho — chạy thử theo cấu hình hiện tại, **chưa ghi gì**. Lỗi cấu hình thì báo ngay ở đây. Thấy đúng thì bấm **Định khoản**. Chứng từ đã định khoản có nút **Xem trước định khoản lại**.

Ngoài ra có: nội dung mới nhất, trạng thái ("sổ theo phiên bản …"), nút **Định khoản** / **Định khoản lại** riêng chứng từ đó, bút toán (kể cả bút toán đã đảo) và **Nhật ký định khoản** của chứng từ. Chứng từ sai thì sửa ở hệ thống bán hàng (lên phiên bản mới), rồi định khoản lại.

## Chứng từ lỗi

Chứng từ lỗi khi không định khoản được, ví dụ:

- loại thuế, hình thức thanh toán, chi nhánh chưa khai báo;
- tài khoản trong cấu hình đã ngừng dùng hoặc là tài khoản tổng hợp;
- ngày chứng từ rơi vào kỳ đã khoá.

Cách xử lý: đọc dòng lỗi → sửa cấu hình tương ứng → tích chứng từ ở thẻ Lỗi định khoản → **Định khoản**.

## Huỷ chứng từ

Huỷ phiếu bán, phiếu trả hàng làm ở **hệ thống bán hàng** (xoá phiếu bên đó); lệnh huỷ gửi sang thì bút toán được đảo, chứng từ hiện "Đã huỷ". Ở màn này, **Huỷ chứng từ** dùng cho chứng từ đã chọn khi cần (bút toán đảo bằng ghi số âm, có nhật ký).

## Căn cứ pháp lý

Luật Kế toán 88/2015/QH13, Điều 27: không tẩy xoá; huỷ hoặc sửa chứng từ được ghi bằng bút toán số âm. Nhật ký định khoản chỉ ghi thêm, không sửa, không xoá.
