# Kiểm chuẩn (HT06)
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — hướng dẫn màn HT06 (trước đây nút Hướng dẫn hiện "Chưa có hướng dẫn"); viết theo apps/web/src/features/system/ConformancePage.tsx -->

Màn trả lời: **đơn vị đáp ứng tới đâu theo bộ quy định đang có hiệu lực**. Đây là phân tích để bạn quyết định, **không chặn ghi sổ** và **không có điểm tuân thủ %**.

Trước lần đầu, nên khai [Hồ sơ kế toán](ho-so-ke-toan.md) (HT07). Chưa khai thì các ca lớp Cấu hình và Doanh nghiệp ở trạng thái **Chờ duyệt**, vì màn không đoán chế độ kế toán của bạn.

## Chạy kiểm

- **Lịch đêm** chạy lúc 01:00 giờ Việt Nam.
- Nút **Chạy kiểm chuẩn** (cần quyền chạy kiểm chuẩn) chạy ngay. Lượt kiểm **chỉ đọc sổ** và lưu thêm một ảnh chụp kết quả; không sửa gì.
- Chưa có lượt nào thì màn báo **Chưa có lượt kiểm chuẩn nào**.

Đầu màn ghi: kết quả chung, nhãn, lúc chạy (lịch đêm hay chạy tay), ngày đánh giá, phiên bản kho rulepack, số rulepack đã duyệt, và hồ sơ kế toán đang áp.

## Ba lớp

Bấm một thẻ để xem ca của lớp đó.

| Lớp | Câu hỏi |
|---|---|
| **Module** | Mã đang chạy có giữ đúng bất biến sổ và ranh giới module không? |
| **Cấu hình** | Cấu hình của đơn vị có đúng bộ quy định đang có hiệu lực với nó không? |
| **Doanh nghiệp** | Tình trạng sổ sách thực tế theo kỳ có việc gì còn tồn không? |

Mỗi thẻ hiện số ca theo từng trạng thái và **"Có bằng chứng: x/y ca áp dụng"**. Đó là độ phủ bằng chứng, không phải điểm.

## Ma trận ca

Mỗi dòng một ca kiểm, xếp theo trạng thái (ca cần xử lý lên trước).

| Cột | Nghĩa |
|---|---|
| **Ca kiểm** | Tên và mã ca `id@phiên bản · mức ưu tiên` |
| **Căn cứ (điều khoản)** | Văn bản, điều khoản; nhãn **đã rà** / **chưa rà** |
| **Trạng thái** | Một trong sáu trạng thái bên dưới; nhãn **duyệt tại đơn vị** nếu ca dựa trên duyệt của đơn vị |
| **Vì sao** | Bấm để xem kết luận, bằng chứng, rulepack và phiên bản |
| **Việc cần làm** | Liên kết sang màn thao tác (vd Hồ sơ kế toán, Tính giá vốn, Kết chuyển, Khoá kỳ, Nhập xuất tồn) |

| Trạng thái | Nghĩa |
|---|---|
| **Không đạt** | Bằng chứng cho thấy có chỗ sai |
| **Lỗi khi kiểm** | Kiểm không chạy được |
| **Chờ duyệt** | Chưa đủ căn cứ đã rà, hoặc chuyên gia chưa duyệt. **Không phải đạt** |
| **Chưa kiểm được** | Không có bằng chứng chạy được trên bản cài. **Không phải đạt** |
| **Đạt** | Có bằng chứng và rulepack đã duyệt |
| **Không áp dụng** | Quy định không áp cho hồ sơ của đơn vị |

Màn **không có** nút sửa sổ, tắt kiểm hay bỏ qua. Sửa bằng cách mở màn ở cột **Việc cần làm**, rồi chạy kiểm lại. Ngưỡng số ngày trong ca là quy chế nội bộ, không phải luật.

## Xu hướng

Khi có từ hai lượt, bảng **Xu hướng** hiện kết quả từng lớp của các lượt gần đây: lúc chạy, ngày đánh giá, ai chạy.

## Rulepack và duyệt tại đơn vị

Bảng liệt kê từng rulepack: miền, lớp, số ca, trạng thái duyệt, người duyệt.

- **Đã duyệt ở thượng nguồn**: bộ quy định đã được duyệt chung, không cần làm gì.
- **Chưa duyệt**: bản cài tự chủ có thể **tự duyệt** (cần quyền duyệt kiểm chuẩn, thường là chủ đơn vị hoặc kế toán trưởng). Bấm **Duyệt**, ghi người duyệt kế toán, người duyệt thuế (bắt buộc với một số miền), phạm vi đã rà (ít nhất 10 ký tự), và tick xác nhận trách nhiệm.
- Kết quả dựa trên duyệt này mang nhãn **"Đạt theo duyệt của đơn vị"**, không phải chứng nhận của Bizcity hay cơ quan nhà nước.
- **Lệch nội dung, cần duyệt lại**: gói rulepack đã cập nhật sau lần duyệt. Duyệt áp đúng phiên bản và nội dung đã nạp.
- **Thu hồi** (ghi lý do ít nhất 10 ký tự): lần kiểm sau, ca của rulepack đó trở lại **Chờ duyệt**.

## Lưu ý

- Cuối màn có mục **Ngoài phạm vi lượt này** (phần chưa kiểm, kèm lý do) và câu miễn trừ. Đọc cả hai trước khi dùng kết quả để báo cáo.
- Ma trận C-1..C-9 ở màn Kiến trúc đo năng lực của phần mềm; màn này đo **đơn vị của bạn**.
- Muốn xem từng lỗi kèm cách khắc phục theo vai, dùng [Bàn đánh giá](ban-danh-gia.md) (HT08).
