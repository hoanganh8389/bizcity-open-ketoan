# Bàn làm việc kế toán (HT08)
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — hướng dẫn màn HT08 (trước đây nút Hướng dẫn hiện "Chưa có hướng dẫn"); viết theo apps/web/src/features/system/ReviewBoardPage.tsx -->

<!-- [2026-11-09 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B1: Khoá thử hôm nay, HT08 đổi tên Bàn làm việc kế toán -->
Bàn làm việc kế toán (trước đây là *Bàn đánh giá*) có hai thẻ:

| Thẻ | Dùng khi |
|---|---|
| **Khoá thử hôm nay** (mở sẵn) | Muốn biết **hôm nay khoá sổ được chưa**, còn vướng gì, mà không phải khoá thật |
| **Rà theo vai** | Rà định kỳ theo vai kế toán trưởng, kiểm soát, thanh tra thuế |

Cả hai thẻ **chỉ đọc**: không ghi gì vào sổ, không khoá kỳ.

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
