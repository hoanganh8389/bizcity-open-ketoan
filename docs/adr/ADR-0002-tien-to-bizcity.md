# ADR-0002 · Tiền tố `bizcity_` ở hợp đồng và bề mặt ngoài, không đổi tên bảng

- Trạng thái: Chấp nhận
- Ngày: 2026-10-28
- Liên quan: [../framework/04-DAT-TEN-BIZCITY.md](../framework/04-DAT-TEN-BIZCITY.md)

## Bối cảnh

Yêu cầu: framework có tên nhận diện chuẩn `bizcity_`. Mã hiện mang tên `ketoan` / `tgs`. CSDL đang chạy thật có ~90 bảng, trigger, view, khoá ngoại ghép; bản thuế và bản test chạy song song.

## Quyết định

Đặt tiền tố `bizcity` ở **mọi thứ bên ngoài nhìn thấy hoặc cùng tồn tại với hệ khác**: mã hợp đồng (`bizcity_ledger_intake@1`), gói (`@bizcity/*`, `bizcity/*`), biến môi trường mới (`BIZCITY_*`), header (`X-Bizcity-*`), khoá cấu hình (`bizcity.<miền>.<khoá>`), mã sự kiện log, plugin WP (`bizcity-*`, `BizCity_*`, `bizcity_*` hook). **Không** đổi tên bảng đang có; bảng mới theo tiền tố miền; tách tầng bằng schema PostgreSQL ở Giai đoạn 3 nếu cần.

## Hệ quả

- Được: nhận diện ngay ở chỗ va chạm thật (npm, WordPress hook, biến môi trường dùng chung máy), không rủi ro dữ liệu.
- Mất: tên bảng không mang `bizcity_` — chấp nhận vì CSDL đã riêng của framework.
- Việc: bí danh gói, đọc biến cũ làm dự phòng, đổi tên plugin WP khi có bản lớn.

## Phương án đã cân nhắc

- *Đổi tên mọi bảng sang `bizcity_*`*: một migration lớn đụng trigger, view, mọi truy vấn Kysely, script vận hành, bản thuế đang chạy; lợi ích gần như không — loại.
- *Schema `bizcity` ngay bây giờ*: đúng hướng nhưng chi phí cao khi chưa có nhu cầu phân quyền CSDL theo tầng — hoãn sang Giai đoạn 3.
