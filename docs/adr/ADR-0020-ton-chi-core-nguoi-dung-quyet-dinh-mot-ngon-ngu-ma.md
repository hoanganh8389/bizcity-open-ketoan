# ADR-0020 · Tôn chỉ Core: người dùng quyết định, Core chỉ đúng chỗ — một ngôn ngữ là thư viện mã, có căn cứ
<!-- [2026-11-03 01:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020: tôn chỉ của Core open-ketoan (chủ dự án: "ghi rule này vào kiến trúc nhé, tôn chỉ của core open-ketoan là vậy") -->

- Trạng thái: **Chấp nhận** — chủ dự án 2026-11-03: *"ghi rule này vào kiến trúc nhé, tôn chỉ của core open-ketoan là vậy. Các logic kế toán trưởng hoặc chờ kế toán trưởng xác nhận cũng skip, sau này việc đấy sẽ do hệ thống user phân quyền làm."*
- Nguồn: chủ dự án 2026-11-03: *"chúng ta hiểu rule ở đây là người dùng sẽ chủ động thao tác, vai trò của chúng ta sẽ có các gate, check, hoặc sổ tay module nghiệp vụ, debug, pool buffer, draft… để người dùng hiểu được vấn đề cần phải chuẩn hóa, xử lý ở đâu. Chuẩn hóa việc thông báo lỗi phải bắt đầu đi từ thư viện mã thông báo lỗi, nếu được chuẩn hóa theo chuẩn kế toán thì càng tốt"*; và *"cấu hình tự thêm mặt hàng để mặc định cho thêm, nhưng sẽ nhắc nếu sai, đây là rule chung"*.
- Ngày: 2026-11-03 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức: K0 (tôn chỉ + luật), áp cho mọi phase sau.
- Luật: [R-GATE-9 / 10 / 11](../rules/RULE-GATE.md). Nền: [ADR-0019](ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md) (hai cổng), [ADR-0014](ADR-0014-tram-tien-kiem-be-cho-dau-vao.md) (bể chờ), [BIZCITY-FINDINGS-v1](../contracts/BIZCITY-FINDINGS-v1.md) (thư viện mã), [Căn cứ pháp lý](../can-cu/00-cach-dung.md).

## Tôn chỉ

**Người dùng là người quyết định và thao tác.** Core không tự sửa dữ liệu thay họ, cũng không âm thầm chặn. Việc của Core là làm cho vấn đề **nhìn thấy được và chỉ đúng chỗ sửa**, bằng các công cụ:

| Công cụ | Trả lời câu hỏi |
|---|---|
| Gate A (khung Vì sao, nháp) | Khai báo danh mục này thiếu / sai gì |
| Gate B (trạm tiền kiểm, bể chờ) | Chứng từ này vì sao chưa vào sổ |
| Check / tự chẩn đoán / kiểm chuẩn | Sổ đang lệch ở đâu |
| Sổ tay module nghiệp vụ, trang bài học | Vì sao phải làm vậy, làm thế nào |
| Debug / trace | Lỗi xảy ra ở bước nào |

Mọi công cụ trên phải nói **cùng một ngôn ngữ**, và ngôn ngữ đó là **thư viện mã** (`bizcity_findings@1`). Một vấn đề có một mã. Mã đó mang vì sao, cách sửa, chỗ sửa (màn / bước) và **căn cứ**. Thông báo, dải nhắc, lỗi API, trang bài học đều sinh ra từ mã, không ai viết câu chữ riêng.

## Quyết định

1. **Tôn chỉ trên đứng đầu CANON** ([00-CANON §0](../00-CANON.md)), trên bốn câu không thương lượng. Mọi ADR / phase sau phải nói mình phục vụ tôn chỉ ở công cụ nào.
2. **Mặc định cho phép, nhắc khi sai** (R-GATE-9). Khoá cấu hình làm cổng chặt hơn mặc định cho phép với mọi đơn vị. Đầu vào sai → nhắc (thông báo cho người có quyền sửa, dải nhắc, phát hiện mức warn / hint) kèm cách sửa. Ngoại lệ duy nhất: toàn vẹn dữ liệu / bất biến (mức ✘) chặn ngay.
3. **Một ngôn ngữ — mọi lời Core nói ra bắt đầu từ thư viện mã** (R-GATE-10). Thông báo trong ứng dụng, dải nhắc, lỗi cửa nạp, phát hiện tự chẩn đoán của Core đều mang `code` có trong thư viện và dựng câu chữ từ mã (`notifyFinding`, `catalogFinding`, `intakeFinding`). Không câu chữ tự do trong code Core. Check **SC-FIND-2**.
4. **Có căn cứ** (R-GATE-11). Mỗi mã khai `basis`: một hoặc vài văn bản trong [danh mục văn bản pháp luật](../can-cu/01-danh-muc-van-ban.md) của repo (Luật Kế toán, Thông tư 99/2025, chuẩn mực kế toán, Nghị định hoá đơn, Luật thuế…), hoặc `NOI-BO` = quy ước phần mềm. Không ghi số điều khoản khi chưa đối chiếu văn bản gốc; danh mục căn cứ có ngày rà soát riêng. Check SC-FIND-1 mở rộng: `basis` bắt buộc, khoá có trong sổ căn cứ, tên văn bản có trong trang danh mục.
5. **Core không mã hoá quy trình theo chức danh.** Không có trạng thái "chờ kế toán trưởng xác nhận", nhãn "nháp — chờ kế toán trưởng duyệt", hay luật chỉ chạy khi "kế toán trưởng đã duyệt". **Ai được làm gì là việc của hệ thống phân quyền** (permission): màn HT09 là công cụ cho người có quyền, không phải cổng chờ. Luật nhắc chạy ngay theo nội dung trong thư viện; đơn vị có thể sửa câu chữ / hạ mức nếu có quyền.

## Hệ quả

- Bỏ nhãn "nội dung nháp, chờ kế toán trưởng duyệt" ở khung Vì sao; màn HT09 đổi cách gọi (Mặc định / Đã sửa câu chữ / Đã hạ xuống nhắc), quyền giữ nguyên `conformance:approve` cho sửa luật và `settings:write` cho công tắc.
- Thông báo "mặt hàng tự thêm" chuyển sang mã `ITEM-HINT-002` trong thư viện (sửa câu chữ được ở HT09, tra được bằng `core.findings.explain`).
- `bizcity_findings@1` thêm trường `basis`; trang tra mã, khung Vì sao (dòng "Căn cứ"), trang bài học hiện căn cứ.
- Việc mở trong kế hoạch còn ghi "kế toán trưởng duyệt" (S023-16, Q-70-5…) không còn là điều kiện chặn: nội dung luật dùng ngay, đơn vị chỉnh nếu muốn.

## Phương án đã cân nhắc

- **Để mỗi màn tự viết thông báo**: nhanh lúc đầu, nhưng cùng một vấn đề có ba câu chữ khác nhau, AI và người mới không tra được — trái tôn chỉ "một ngôn ngữ".
- **Ghi căn cứ đến từng điều khoản ngay**: chính xác hơn, nhưng dễ sai khi văn bản đổi nhanh (thuế 2025–2026); chọn mức văn bản, dựa vào danh mục đã rà soát, điều khoản bổ sung khi đối chiếu văn bản gốc.
- **Giữ luồng duyệt của kế toán trưởng trong Core**: bị loại theo chủ dự án — chức danh khác nhau giữa đơn vị; phân quyền là chỗ đúng.
