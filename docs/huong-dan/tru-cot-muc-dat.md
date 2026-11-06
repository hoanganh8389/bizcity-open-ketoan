# Trụ cột & mức đạt (HT10)
<!-- [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — hướng dẫn màn HT10 và thẻ "Trụ cột" ở trang chủ phân hệ -->

**Màn này trả lời hai câu:** Core bảo đảm điều gì cho số liệu của bạn, và hôm nay phần mềm **đã làm được tới đâu** — phần nào còn phải tự kiểm bằng tay.

## Đọc thế nào

- Mỗi ô là một **trụ cột** (ví dụ *Sổ cái bất biến*, *Định danh bất biến, mã có phiên bản*, *Liên tục kế toán*); ô đầu là **nền móng** *Quản trị dữ liệu gốc*. Thanh % là mức đạt gộp của các tiêu chí bên trong (đạt = 1, một phần = ½, mới tài liệu = ¼, chưa = 0). Bấm ô để chỉ xem trụ cột đó.
- Bảng dưới: từng **tiêu chí** — *Mức* (Đạt / Một phần / Mới tài liệu / Chưa), *Bằng chứng* (migration, test, check nào chứng minh), *Khoảng cách* (còn thiếu gì), *Việc tiếp* (mã việc trong kế hoạch phase), *Ưu tiên* (P0 = nền tảng không được sai).
- Tích **chỉ tiêu chí chưa đạt** để thấy nhanh chỗ Core còn phải tự kiểm.

## Với kế toán

Tiêu chí **Đạt** nghĩa là phần mềm tự giữ, bạn không phải kiểm tay (ví dụ: dòng sổ cái không sửa được; đổi mã hàng không làm đứt giá vốn). Tiêu chí **Một phần / Chưa** là chỗ bạn nên có bước kiểm riêng cho tới khi đạt — cột *Khoảng cách* nói rõ phần nào.

## Với người phát triển

Bảng là **kim chỉ nam**: làm tiêu chí P0 chưa đạt trước; mỗi tiêu chí trỏ tới việc `S0xx-*` trong `docs/phases`. Mức đạt chỉ đổi khi có bằng chứng (test / check) — sửa ở `docs/standard/tru-cot.json`, rồi chạy `node scripts/tru-cot-md.mjs` để tài liệu khớp. Không có nút "đánh dấu đạt".

## Thẻ "Trụ cột" ở trang chủ phân hệ

Cạnh thẻ *Quy trình* và *Tất cả chức năng*: cùng bảng, chỉ hiện tiêu chí gắn với phân hệ đang mở — để người mới hiểu luật nào đang bảo vệ số liệu của phân hệ, và dev biết việc kế tiếp của phân hệ đó.

<!-- [2026-11-05 11:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — thẻ Nền móng (S029-30, ADR-0028) -->
## Thẻ "Nền móng"

Bấm **Nền móng** ở đầu màn (hoặc mở `/he-thong/tru-cot?xem=nen-mong`). Thẻ này nhìn Core theo **sáu năng lực lõi** — Định danh & danh mục, Phân quyền & ngữ cảnh, Cấu hình & chính sách, Chứng từ & luồng duyệt, Sự kiện & kế toán, Liên tục & kiểm chuẩn — và **17 trụ cột** chia bốn nhóm nền móng. Có năm góc nhìn:

- **Sáu năng lực lõi**: mỗi năng lực làm gì, dev nhận sẵn gì (không phải tự xây lại), gọi bằng gì, nằm ở thư mục mã nào, còn thiếu gì.
- **Ma trận 17 trụ cột**: mỗi trụ cột thuộc năng lực nào, mức đạt, thanh tín hiệu kiểm; bấm một dòng để xem từng tín hiệu và nguyên tắc ECP nó giữ.
- **ECP × trụ cột**: 13 nguyên tắc bất biến Enterprise Continuity do trụ cột nào thi hành.
- **Tín hiệu kiểm**: mọi check / mã chẩn đoán / test làm bằng chứng — *chạy được*, *ở nhánh* (chưa vào bản chính), *chưa có*.
- **Tinh gọn & SDK**: bảy nguyên tắc Small Core, Strong Contracts.

Mức **Đạt** chỉ có khi không còn tín hiệu *chưa có*; bộ kiểm SC-CORE-1 chặn ghi "đạt" sai và báo khi một tín hiệu đã có mà bảng chưa nâng. Nguồn: `docs/standard/nen-mong.json`.
