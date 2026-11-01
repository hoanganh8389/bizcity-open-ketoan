# PHASE-019 · Bản mẫu Bàn điều tra
<!-- [2026-11-01 07:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — Bàn điều tra cho nhà phát triển: sổ tay điều tra lỗi theo tình huống + thiết kế UI/UX dev trên Prometheus, Loki, Tempo, Grafana, Alertmanager -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

[ban-dieu-tra.html](ban-dieu-tra.html) là **bản mẫu tĩnh** của phân hệ Nhà phát triển ([20-KIEN-TRUC §4](../20-KIEN-TRUC.md)), để duyệt bố cục và cách nói **trước khi** code W1–W5. Mở thẳng bằng trình duyệt, không cần máy chủ, không tải thư viện ngoài.

- **Số liệu giả lập**, không phải dữ liệu thật. Trace lỗi module `vat` là ví dụ dựng tay cho tình huống TH-11.
- Nút **Đơn vị / Vận hành** ở góc trên đổi chế độ để xem cả hai (D019-2). Nút ◐ đổi sáng / tối.
- Mở thẳng một màn: `ban-dieu-tra.html#tra-ma`, `#tong-quan`, `#nhat-ky`, `#loi-module`, `#ghi-so`, `#su-kien`, `#toan-ven`, `#kich-ban`, `#thong-bao`, `#van-hanh`.
- Dưới mỗi khối ghi nguồn (action của API trung gian hoặc API sẵn có), để lúc code chuyển thẳng.

| Màn | Mã | Điều cần duyệt |
|---|---|---|
| Tổng quan | DV01 | dòng kết luận đầu trang (U1); sáu ô, ô nào cũng dẫn sang màn chi tiết |
| Tra mã | DV02 | khối "Chuyện gì đã xảy ra" trước cây span (N3); dòng Kernel (U3); chi tiết span không có thông điệp lỗi ở chế độ Đơn vị (D019-7) |
| Nhật ký | DV03 | bộ lọc ít, không ô truy vấn tự do (D019-4) |
| Lỗi theo module | DV04 | tách hai màu từ chối đúng luật / lỗi kỹ thuật (U2) |
| Ghi sổ · Sự kiện · Toàn vẹn | DV05–07 | dùng lại API sẵn có; không nút ghi (U8) |
| Kịch bản | DV08 | 14 thẻ từ Sổ tay, mỗi thẻ mở một màn |
| Thông báo lỗi | W1 | Mã tra cứu + Chép + Báo lỗi + Mở trong Bàn điều tra — áp cho mọi màn của app |
| Vận hành | DV09 | khoá khi chưa bật; khi bật: dải vàng, sức khoẻ toàn hệ, cảnh báo, link Grafana (không iframe) |

Khi W3 xong: chụp màn thật với dữ liệu demo, đặt cạnh bản mẫu trong `evidence/W3-<ngày>.md` (ca T019-4).
