# Bàn làm việc kế toán (HT08)
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — hướng dẫn màn HT08 (trước đây nút Hướng dẫn hiện "Chưa có hướng dẫn"); viết theo apps/web/src/features/system/ReviewBoardPage.tsx -->

<!-- [2026-11-09 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B1: Khoá thử hôm nay, HT08 đổi tên Bàn làm việc kế toán -->
Bàn làm việc kế toán (trước đây là *Bàn đánh giá*) có bốn thẻ:

| Thẻ | Dùng khi |
|---|---|
| **Việc hôm nay** (mở sẵn) <!-- [2026-11-09 11:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2a: thẻ Việc hôm nay --> | Đầu ngày: xem sổ có chỗ nào sai, việc của ai, sửa thế nào |
| **Khoá thử hôm nay** | Muốn biết **hôm nay khoá sổ được chưa**, còn vướng gì, mà không phải khoá thật |
| **Kết quả từng tuần** <!-- [2026-11-11 01:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B4a: thẻ Kết quả từng tuần --> | Cuối tuần, kế toán trưởng xem tuần này so với tuần trước: phép kiểm đạt bao nhiêu, việc nào còn mở, mở từ bao giờ |
| **Rà theo vai** | Rà định kỳ theo vai kế toán trưởng, kiểm soát, thanh tra thuế |

Cả bốn thẻ **chỉ đọc**: không ghi gì vào sổ, không khoá kỳ.

## Việc hôm nay

Phần mềm **tự kiểm toàn bộ sổ lúc 01:00 mỗi đêm** (tự chẩn đoán toàn vẹn sổ). Sáng mở thẻ là thấy ngay kết quả đêm qua, dòng đầu ghi *Phần mềm tự kiểm đêm qua lúc …*. Chưa có lượt đêm nay (máy tắt qua đêm, bản cài mới) thì phần mềm kiểm ngay khi mở thẻ. Bấm **Kiểm lại tất cả** để kiểm lại theo số liệu lúc này.

- Dòng đầu đếm **số việc cần xem hôm nay**. Việc là *lỗi toàn vẹn sổ* thì ghi rõ: chưa sửa thì khi khoá kỳ phải ghi lý do chấp nhận.
- Việc xếp theo **người làm**: kế toán viên, kế toán trưởng, vận hành…
- Mỗi việc có nhãn ✎ **Phải ghi lý do khi khoá**, ⚠ **Nên xử lý** hoặc ℹ **Để biết**, kèm số chỗ bị.
- Bấm **Cách khắc phục** để xem *Chỗ bị*, *Vì sao* và các bước sửa. Sửa xong bấm **Kiểm lại** ở đúng dòng đó: phần mềm kiểm lại riêng việc ấy và báo ngay.
- Dưới mỗi việc có dòng **Điều kiện khoá sổ** <!-- [2026-11-10 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2c-2: phép kiểm trỏ điều kiện khoá sổ -->: việc đó thuộc điều kiện nào (vd *Chuyển kho, hàng đang chuyển*), phải kiểm **hằng ngày, hằng tuần hay cuối tháng**, ở bước nào (trước kết chuyển, sau kết chuyển, lúc khoá), và **khi khoá kỳ** thì *cần giải trình (ghi lý do khi khoá)* hay chỉ *để biết, không chặn*. Việc của phần mềm (cập nhật cơ sở dữ liệu, lịch kiểm chuẩn…) ghi *Việc vận hành phần mềm, không thuộc điều kiện khoá sổ*.
- Mục **Đã kiểm, đạt** liệt kê các phép kiểm không thấy vấn đề.

Phép kiểm *hàng, tiền đang chuyển giữa chi nhánh* không báo hàng đi đường trong 30 ngày: đó là bình thường. Nó chỉ báo khi còn treo quá 30 ngày mà nơi nhận chưa ghi, hoặc khi nơi nhận ghi nhiều hơn nơi xuất.

Chưa có trong bản này: lọc việc theo kỳ kiểm (thẻ *Kết quả từng tuần*), mức *chặn khoá sổ, phải sửa* (đến cùng danh sách trường hợp sai về số học).

## Khoá thử hôm nay

Chọn **Kỳ khoá thử** (mặc định tháng hiện tại). Phần mềm chạy năm bước như khi khoá thật và báo kết quả ngay. Bấm **Khoá thử lại** sau khi sửa chứng từ.

**Kết luận ở đầu thẻ** nói đúng như màn [Đóng / mở kỳ kế toán](ky-ke-toan.md) sẽ làm khi bấm khoá:

| Kết luận | Nghĩa |
|---|---|
| ✔ **Phần mềm cho khoá kỳ này** | Bấm khoá ở màn Đóng / mở kỳ kế toán là khoá được ngay |
| ✎ **Khoá được, nhưng phải ghi lý do** | Sổ còn lỗi toàn vẹn hoặc cảnh báo kiểm chuẩn. Khi khoá, phần mềm đòi lý do chấp nhận (ít nhất 10 ký tự) và lưu vào nhật ký khoá |

Dòng dưới kết luận đếm **việc nên xử lý trước khi khoá**. Phần mềm không chặn các việc này, nhưng số trên báo cáo của kỳ sẽ chưa đúng nếu để nguyên. Dòng tiếp theo đếm các mục **phần mềm chưa tự kiểm được**: kết luận chỉ dựa vào các mục đã kiểm.

**Năm bước:**

1. **Kiểm chứng từ và số liệu**: lỗi toàn vẹn sổ, chứng từ nhận lỗi, chứng từ lệch bút toán, số dư lưu sẵn lệch sổ cái, phiếu trả lại không nối phiếu gốc, đề nghị thanh toán còn treo, cảnh báo kiểm chuẩn của kỳ.
2. **Giá vốn**: chi nhánh có bán hàng mà chưa có chứng từ giá vốn của tháng.
3. **Kết chuyển thử**: lãi (+) / lỗ (−) tạm của từng chi nhánh **nếu kết chuyển ngay bây giờ**, chi nhánh đã kết chuyển chưa, kết chuyển cũ đã lỗi thời chưa, tháng trước còn chưa kết chuyển.
4. **Kiểm sau kết chuyển**: doanh thu, chi phí, 911 còn số dư sau kết chuyển.
5. **Kiểm quyền và phạm vi khoá**: phần mềm chưa tự kiểm được bước này. Màn Đóng / mở kỳ kế toán vẫn kiểm quyền khi khoá thật.

Mỗi mục có một trong bốn nhãn:

| Nhãn | Nghĩa |
|---|---|
| ✎ **Phải ghi lý do khi khoá** | Khoá vẫn được, nhưng phải ghi lý do |
| ⚠ **Nên xử lý trước khi khoá** | Bấm **Mở màn** để sửa, hoặc **Cách khắc phục** để xem các bước |
| ✔ **Đạt** | Không có vấn đề |
| ○ **Phần mềm chưa tự kiểm được** | Bản hiện tại chưa kiểm được mục này. **Không tính là đạt** |

Chưa có trong bản này: giá vốn **tính tạm** và **chốt giá vốn** theo lần tính, danh sách trường hợp **chặn khoá sổ** hẳn. Các phần đó đến ở các bước nâng cấp sau của phần Kho · giá vốn.

## Kết quả từng tuần
<!-- [2026-11-11 01:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B4a: thẻ Kết quả từng tuần -->

Mỗi dòng là **một tuần**, mới nhất trước, xếp theo tháng. Tuần vắt hai tháng (ví dụ 27/10–02/11) tách hai dòng, mỗi tháng một dòng, nên tháng nào cũng có đủ tuần của chính nó. Kết quả của tuần là **lượt tự kiểm cuối tuần** đó (lượt 01:00 mỗi đêm hoặc lần bấm *Kiểm lại tất cả*).

| Cột | Nghĩa | Khi nào có màu |
|---|---|---|
| Phép kiểm đạt | đạt / số phép kiểm có dữ liệu để xét | cam khi dưới 100 %, đỏ khi dưới 90 % |
| Lỗi toàn vẹn còn mở | số lỗi toàn vẹn sổ cuối tuần (khoá kỳ phải ghi lý do) | đỏ khi khác 0 |
| Việc mới / đã đóng | so với cuối tuần trước | cam khi việc mới nhiều hơn việc đã đóng hai tuần liền |
| Việc cũ nhất | việc còn mở lâu nhất, tính từ lượt đầu tiên báo việc đó | cam khi quá 7 ngày, đỏ khi quá 14 ngày |
| Ngày có tự kiểm | số ngày trong tuần có lượt tự kiểm | chữ mờ khi thiếu ngày (máy tắt qua đêm) |

**Không màu là đạt.** Bấm một tuần để xem từng việc còn mở cuối tuần: mức, số chỗ, có từ ngày nào, của ai, thuộc điều kiện khoá sổ nào. Sửa việc ở thẻ *Việc hôm nay*.

Lượt tự kiểm được giữ 90 ngày, nên thẻ xem được khoảng 12 tuần gần nhất. Chưa có trong bản này: bản lưu tuần lâu dài, nút **Đã xem tuần**, nhãn *đổi sau khi đã xem* khi chứng từ ghi lùi.

## Rà theo vai

Thẻ **Rà theo vai** là **checklist các tình huống lỗi thường gặp**, xếp theo vai người rà, mỗi cảnh báo kèm cách khắc phục cụ thể. Nguồn là tự chẩn đoán của đơn vị và danh mục tình huống lỗi F22. Màn **chỉ đọc**: không có nút sửa sổ, tắt kiểm hay bỏ qua.

## Chọn vai

| Vai | Dùng khi |
|---|---|
| **Kế toán trưởng** | Rà định kỳ, trước khi khoá kỳ |
| **Kiểm soát / ban kiểm soát** | Rà độc lập; xem thêm các lần người dùng đã xác nhận cảnh báo |
| **Thanh tra thuế — tự rà trước** | Tự rà trước khi cơ quan thuế làm việc |

Đổi vai thì danh sách ca và ca ưu tiên đổi theo.

## Đọc kết quả

Dải đầu đếm số ca theo trạng thái:

| Trạng thái | Nghĩa |
|---|---|
| ✘ **Lỗi** | Sổ có chỗ sai, cần xử lý |
| ⚠ **Cảnh báo** | Cần xem và quyết định |
| ✔ **Đạt** | Kiểm không thấy vấn đề |
| ⛔ **Chặn đúng** | Phần mềm đã chặn đúng tình huống này |
| ○ **Chưa kiểm được** | Chưa có cách kiểm trên bản cài. **Không tính là đạt** |
| ↗ **Kiểm ở màn khác** | Xem ở màn được chỉ |

Ô **Chỉ hiện việc cần làm** (bật sẵn) chỉ giữ ca Lỗi và Cảnh báo. Bỏ tick để xem cả ca đã đạt. Ca xếp theo nhóm (kho, thuế, cuối kỳ, công nợ, tiền…); nhóm có việc hiện số việc.

## Xử lý một ca

Bấm **Cách khắc phục** ở ca có Lỗi hoặc Cảnh báo. Mở ra bốn khối:

1. **Hiện tượng**: mẫu chỗ bị lỗi (vd chi nhánh, mặt hàng, tháng).
2. **Vì sao**: hậu quả nếu để nguyên.
3. **Cách khắc phục**: các bước, màn cần mở, ai làm. Không bao giờ là sửa thẳng sổ.
4. **Kiểm lại**: bấm **Kiểm lại &lt;mã&gt;** sau khi sửa. Màn chạy lại đúng mã đó và báo ngay kết quả mới. Ca không có mã kiểm thì mở lại màn ở bước cuối để xem.

Nút **Kiểm lại tất cả** ở đầu màn kiểm lại toàn bộ.

## In biên bản

Nút **In biên bản** in **Biên bản tự rà** theo vai đang chọn: tên đơn vị, lúc in, nguồn dữ liệu, bảng mọi ca (mã, nội dung, trạng thái, phương án) và chỗ ký cho người lập, kế toán trưởng, trưởng ban kiểm soát.

## Lưu ý

- Vai **Kiểm soát** có thêm bảng **Các lần xác nhận cảnh báo gần đây**: ai đã chọn tiếp tục khi còn cảnh báo, chứng từ hoặc kỳ nào, mã cảnh báo, lý do. Đây là bằng chứng, không phải lỗi.
- Đọc câu miễn trừ cuối màn: biên bản tự rà không phải kết luận của cơ quan nhà nước.
- Muốn xem đơn vị đáp ứng bộ quy định tới đâu, dùng [Kiểm chuẩn](kiem-chuan.md) (HT06).
