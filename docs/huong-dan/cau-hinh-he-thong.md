# Cấu hình hệ thống (HT13)
<!-- [2026-11-06 02:41 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-39: hướng dẫn màn HT13 (bản chỉ đọc) -->

**Màn này trả lời một câu:** đơn vị của bạn đang cấu hình những gì, khoá nào ảnh hưởng sổ, ai đổi lần cuối và vì sao. Chỉ **xem** — đổi cấu hình vẫn ở màn của từng khoá.

## Đọc thế nào

- **Bốn ô đầu trang** (bấm để lọc):
  - *Khoá chưa khai căn cứ* — căn cứ là văn bản, điều, khoản của quy định mà khoá dựa vào. Hôm nay **10 khoá loại A** có căn cứ mặc định là quy tắc nội bộ của phần mềm (ví dụ khoá kỳ dựa vào R-LEDGER-9); các khoá còn lại chưa khai. Căn cứ **pháp lý** (luật, thông tư) sẽ do kế toán trưởng xác nhận và khai sau (S030-35), không tự điền.
  - *Khoá đã đổi trong 30 ngày qua* — chỉ tính khoá đã có bảng phiên bản. Khoá chưa có bảng phiên bản vẫn có nhật ký thao tác nhưng chưa đếm ở đây.
  - *Khoá có bản sắp hiệu lực* — đã đặt ngày hiệu lực trong tương lai.
  - *Ngày chưa niêm phong bằng chứng* — ngày đã đóng quá 2 ngày mà tệp niêm phong chưa có; xem Kiểm chuẩn để biết ngày nào.
- **Bảng giữa**: mỗi dòng một khoá, theo bốn nhóm. *Loại* cho biết mức ảnh hưởng:
  - **A** ảnh hưởng sổ (mã thuế, chế độ định khoản, khoá kỳ…);
  - **B** vận hành (hạn mức duyệt, kết nối…);
  - **C** hiển thị (giao diện, thời hạn giữ bể chờ…).
- **Thẻ bên phải** (bấm một dòng): *Giá trị & hiệu lực* (nguồn của giá trị, phạm vi, nơi lưu, quyền sửa, **nơi dùng** — cổng nào đọc khoá này), *Căn cứ* (văn bản, điều, khoản; cho biết căn cứ khai ở phiên bản đang áp hay là căn cứ mặc định của khoá), *Lịch sử* (từng phiên bản: ai, khi nào, lý do, căn cứ).

## Cần biết

- **Khoá bí mật** (khoá kết nối…) chỉ hiện trạng thái, không bao giờ hiện giá trị.
- **"Chưa có phiên bản"** nghĩa là khoá lưu theo đường cũ: có giá trị hiệu lực nhưng chưa có bảng phiên bản và ngày hiệu lực. Màn này không đoán giá trị của các khoá đó; xem ở màn của chính khoá.
- **Một người có quyền đổi thẳng, chỉ ghi nhật ký** (quyết định D030-12): không có bước duyệt thứ hai. Muốn chặt hơn, chỉ cấp quyền cấu hình cho kế toán trưởng ở màn Người dùng.

## Với kế toán trưởng

Mở màn này trước khi khoá kỳ để xem khoá loại A nào mới đổi, và khoá nào sắp có hiệu lực trong kỳ tới.
