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
| Muốn biết module / bước nào hỏng nhiều nhất | **Lỗi theo module** (DEV04) |
| Chứng từ không vào sổ, bị từ chối | **Ghi sổ** (DEV05) |
| Module nhận sự kiện không cập nhật | **Sự kiện** (DEV06) |
| Nghi sổ sai | **Toàn vẹn** (DEV07) |
| Có triệu chứng, chưa biết bắt đầu ở đâu | **Kịch bản** (DEV08) |
| Muốn nhờ AI sửa lỗi | **Tra mã** → **Chép cho AI** |
| Bản cài một đơn vị, xem sức khoẻ toàn hệ | **Vận hành** (DEV09) |

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

<!-- [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: hướng dẫn DEV04–DEV08. -->

## Lỗi theo module (DEV04)

Chọn **Lỗi kỹ thuật** hoặc **Từ chối đúng luật** và khoảng (tối đa 7 ngày). Mỗi module một khối: **chỗ hỏng** (bước `step …` module tự chia, `kernel …`, `action …`, hoặc cả yêu cầu khi route không qua action), số trace, mã lỗi, câu CSDL lỗi bên dưới nếu có, trace gần nhất (bấm để mở Tra mã). Đọc 50 trace mới nhất mỗi lần. Module chia bước bằng `ctx.trace.step` thì chỗ hỏng chỉ thẳng tới bước.

## Ghi sổ (DEV05)

- **Định khoản lỗi**: các lần Kernel từ chối định khoản (hôm nay / 7 / 30 ngày) kèm lý do — sổ không đổi.
- **Chờ / lỗi chưa vào sổ**: chứng từ đang chờ hoặc lỗi định khoản, chờ lâu nhất trước.
- Định khoản lại làm ở màn **Định khoản tự động** (ACC14) — có link; Bàn điều tra không có nút ghi.

## Sự kiện (DEV06)

Mỗi nơi nhận sự kiện: module, loại sự kiện nghe, số việc chờ / xong / chết, việc chờ lâu nhất. Có việc chết → sửa subscriber của module, rồi người có quyền cấu hình phát lại cho đúng nơi nhận đó.

## Toàn vẹn (DEV07)

Lượt tự chẩn đoán sổ gần nhất: từng mã kiểm, đạt / lỗi, số đã xét, mẫu (chỉ khoá chứng từ / số bút toán), cách sửa. **Chạy lại** chỉ đọc sổ (lưu thêm một lượt chẩn đoán). Có mã kiểm báo lỗi là sự cố nghiêm trọng: báo Nhóm Lõi, không tự sửa sổ.

## Kịch bản (DEV08)

Các tình huống của Sổ tay điều tra lỗi thành thẻ: triệu chứng, nút mở thẳng màn cần xem với bộ lọc điền sẵn, phần Bàn điều tra chưa trả lời được (số đo toàn hệ — người vận hành xem trên Grafana), và toàn văn các bước khi bấm **Xem đủ**. Tra mã nhận ra tình huống thì có link **Làm gì tiếp** tới đúng thẻ.

<!-- [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W5: hướng dẫn Chép cho AI, Vận hành (DEV09). -->

## Chép cho AI (ở Tra mã)

Nút **Chép cho AI** dưới khối "Chuyện gì đã xảy ra" chép một khối văn bản để dán vào công cụ AI viết mã (Claude Code, Cursor…): tóm tắt, cây span rút gọn, chỗ tìm mã trong repo theo tên bước, việc phải làm (viết test tái hiện trước, không sửa Kernel). Khối này **chỉ có mã và tên bước** — không số tiền, tên khách, mã đơn vị. Đừng dán thêm ảnh màn có dữ liệu hay nội dung phiếu cho AI. Luật đầy đủ: mục "Sửa lỗi bằng AI từ Bàn điều tra" trong `AGENTS.md`.

## Vận hành (DEV09)

Chỉ mở với **chủ đơn vị** ở bản cài có **đúng một đơn vị** đã bật `DEVTOOLS_OPS=true`; người khác thấy lý do chưa mở. Có: mười số đo sức khoẻ toàn hệ (API, lỗi 5xx, độ chậm, CSDL, pool kết nối, tự chẩn đoán sổ, đối soát, ghi sổ, sự kiện) theo đúng ngưỡng cảnh báo, các cảnh báo đang bật kèm mục RUNBOOK-CANH-BAO, link 9 bảng Grafana. "Không có dữ liệu" khác 0 — thường là chưa có lưu lượng hoặc bộ thu chưa chạy. Ở chế độ này Tra mã có thêm nút **Mở trong Grafana** và thấy thông điệp / ngăn xếp lỗi trong log.

## Giới hạn

- Tối đa 30 lần tra mỗi phút mỗi người (Tổng quan, Tra mã, Nhật ký, Lỗi theo module; Ghi sổ, Sự kiện, Toàn vẹn đọc cơ sở dữ liệu, không tính).
- Không có ô gõ truy vấn tự do; không thấy thông điệp / ngăn xếp lỗi chi tiết (có thể chứa dữ liệu) — cần thì gửi mã cho người vận hành.
- Bộ giám sát (Tempo, Loki) chưa bật: màn báo "chưa bật"; phần đọc từ cơ sở dữ liệu vẫn chạy.

Hướng dẫn chi tiết theo tình huống: `docs/ops/SO-TAY-DIEU-TRA-LOI.md` (Sổ tay điều tra lỗi).
