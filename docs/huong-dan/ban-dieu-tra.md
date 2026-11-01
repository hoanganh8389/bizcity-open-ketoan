# Bàn điều tra (Nhà phát triển)
<!-- [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: hướng dẫn trong app cho phân hệ Nhà phát triển (DEV01–DEV03). -->

Dành cho người viết phân hệ, tích hợp, add-in. Ai thấy: **chủ đơn vị** và vai trò **Nhà phát triển** (chủ đơn vị đổi vai trò ở màn Người dùng). Chỉ thấy dữ liệu **của đơn vị mình**; không có nút nào sửa sổ.

## Bắt đầu từ đâu

| Có gì trong tay | Mở màn |
|---|---|
| Người dùng gửi **mã tra cứu** (khay góc dưới trái khi có lỗi, nút **Chép**) | **Tra mã** (DEV02), dán mã |
| Chính mình vừa gặp lỗi | trên khay Mã tra cứu bấm **Bàn điều tra** |
| Không có mã, chỉ nghe "hôm nay hay lỗi" | **Tổng quan** (DEV01) |
| Muốn xem log theo mã lỗi / route | **Nhật ký** (DEV03) |

## Tra mã (DEV02)

- Dán `traceId` (32 ký tự 0-9 a-f) hoặc `requestId` (`req-…`). Phím tắt `/` đưa con trỏ vào ô.
- Khối **Chuyện gì đã xảy ra** nói trước: kết quả (**từ chối đúng luật** — người dùng sửa được; **lỗi kỹ thuật** — cần dev), dừng ở bước nào, Kernel có được gọi không (sổ có đổi không), bước chậm nhất, tình huống giống trong Sổ tay điều tra lỗi.
- Thẻ **Cây span**: bấm một dòng để xem thuộc tính. **Log cùng trace**, **Bằng chứng**: bản ghi bằng chứng của thao tác ghi (không có dữ liệu trước / sau).
- "Không tìm thấy trace": trace chưa tới Tempo (chờ khoảng 20 giây), đã bị lấy mẫu bỏ, hoặc **không thuộc đơn vị của bạn** — ba trường hợp trả cùng một câu.
- Tra bằng `requestId` mà trace đã bị bỏ: vẫn thấy log của yêu cầu.

## Tổng quan (DEV01)

Câu kết luận ở đầu, rồi sáu ô: lỗi kỹ thuật, từ chối đúng luật (theo mã), yêu cầu chậm hơn 1 giây, sự kiện chết, sự kiện đang chờ, tự chẩn đoán sổ gần nhất. Bảng dưới là các trace có lỗi / bị từ chối gần đây — bấm mã để mở Tra mã.

## Nhật ký (DEV03)

Chọn khoảng (tối đa 24 giờ), mức, và **một** ô lọc: mã lỗi VIẾT_HOA (`PERIOD_LOCKED`), sự việc chữ thường (`bizcity.ledger.posted`) hoặc route bắt đầu bằng `/` (`/api/v1/vouchers`). Mỗi lần 200 dòng mới nhất. Bộ lọc nằm trên địa chỉ trang — chép địa chỉ gửi cho người khác là họ thấy đúng bộ lọc đó (nếu cùng đơn vị).

## Giới hạn

- Tối đa 30 lần tra mỗi phút mỗi người.
- Không có ô gõ truy vấn tự do; không thấy thông điệp / ngăn xếp lỗi chi tiết (có thể chứa dữ liệu) — cần thì gửi mã cho người vận hành.
- Bộ giám sát (Tempo, Loki) chưa bật: màn báo "chưa bật"; phần đọc từ cơ sở dữ liệu vẫn chạy.

Hướng dẫn chi tiết theo tình huống: `docs/ops/SO-TAY-DIEU-TRA-LOI.md` (Sổ tay điều tra lỗi).
