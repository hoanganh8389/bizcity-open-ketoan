# Tiêu chí review Core — 12 trục, thang 0–4, trục cổng
<!-- [2026-11-08 12:40 PM Johnny Chu - Chu Hoàng Anh] REVIEW — tiêu chí v1.0: 12 trục chấm Core theo hai mặt "chặt bên trong kernel, mềm phía ngoài", trục cổng A2 · A7 · A12, luật kết luận, ánh xạ trụ cột 0–VIII -->

> **Phiên bản tiêu chí:** 1.0 · 2026-11-08 · Chủ dự án đặt đề bài 2026-11-08: *"bên trong accounting kernel thì chặt chẽ, minh bạch, xuyên suốt, quản trị được doanh nghiệp theo rule; phía ngoài trước khi vào accounting event thì linh hoạt, dễ dùng, cảnh báo nhanh"* và *"lạt mềm buộc chặt: kernel cảnh báo được module thi hành hiểu việc chưa thực hiện được sai ở đâu, mã lỗi nào, hướng xử lý, trace được chứng từ gốc"*.
> Đổi trục, đổi thang hay đổi trục cổng = tăng phiên bản tiêu chí và ghi ở nhật ký cuối tệp; điểm của các review cũ **không chấm lại**.

## 1. Thang điểm (áp cho mọi trục)

| Điểm | Nghĩa | Bằng chứng tối thiểu |
|---|---|---|
| **0** | Chưa có | — |
| **1** | Chỉ tài liệu / ADR / mockup | tệp tài liệu |
| **2** | Có mã nhưng chưa đủ: thiếu test, hoặc còn lỗ hổng đã chỉ ra, hoặc chỉ một phân hệ dùng | `tệp:dòng` + khoảng cách ghi rõ |
| **3** | Mã + test (unit / golden / check `SC-*`) bảo vệ hành vi đã hứa | test hoặc check có thật, chạy ĐẠT |
| **4** | Mã + test + **bằng chứng chạy thật**: lane diagnostics `DG-*` trên CSDL có dữ liệu, hoặc biên bản vận hành, hoặc người dùng thật đã đi hết luồng | biên bản / kết quả lane / `evidence` |

Nguyên tắc chấm: **không chấm từ tài liệu** (cùng ý R-ECP-SCORE: không "đạt" nếu không có check / test chạy được). Một trục có nhiều ý thì điểm trục = điểm của ý **yếu nhất trong các ý bắt buộc** (ghi rõ ý nào kéo xuống). Suy luận phải ghi là suy luận.

## 2. Mười hai trục

Hai cột cuối nói trục đó đo mặt **trong** (kernel chặt) hay mặt **ngoài** (mềm, dễ dùng) của triết lý, và trục cột 0–VIII nào nó tựa vào.

| Trục | Tên | Câu hỏi nó trả lời | Ý bắt buộc để đạt ≥ 3 | Mặt | Trụ cột | Cổng |
|---|---|---|---|---|---|---|
| **A1** | Nền tảng lõi & hợp đồng | Hợp đồng `bizcity_*@1` có mã thực thi, có test không; gói Kernel / Platform / SDK tách đúng biên? | mọi hợp đồng Standard có mã + test; cổng Kernel là lối duy nhất ngoài Kernel import | trong | I · IV · VIII | — |
| **A2** | Bảo toàn số & một cửa ghi sổ | Nợ = Có, sổ chỉ thêm, khoá kỳ, tròn đồng có bị vòng qua được không? Mọi bút toán có đi qua một cửa không? | trigger CSDL không có cờ thoát mà vai trò ứng dụng tự bật được; không `INSERT` sổ ngoài Kernel; mỗi bút toán có sự việc gốc | trong | I · V | **cổng** |
| **A3** | Liên tục & truy vết chứng từ gốc | Từ báo cáo lần ngược về bút toán, về phiên bản chứng từ, về nguồn gửi được không, và ngược lại? | API + màn truy vết hai chiều; `correlation_id` xuyên suốt; giá vốn / tồn có lineage | trong | III · VI | — |
| **A4** | Cross-module & sự kiện | Module nói chuyện qua outbox / hợp đồng sự kiện, không gọi chéo, không ghi bảng nhau? | outbox cùng giao dịch; `causation` khi phát tiếp; subscriber idempotent; không import chéo | trong | VIII · III | — |
| **A5** | Minh bạch & nhật ký vận hành | Người vận hành thấy từng sự kiện vào, lỗi gì, ở đâu, sửa / phát lại được không? Bằng chứng có chuỗi băm? | nhật ký chuỗi băm; API + màn liệt kê sự kiện có `last_error`, lọc, replay; dead không bị xoá lặng | ngoài + trong | VI | — |
| **A6** | Cổng kiểm & thư viện lỗi | Sự kiện ngoài vào có được tiền kiểm nhiều tầng, giữ nguyên văn ở bể chờ, cảnh báo nhanh, có mã + bước sửa không? | L1–L5 có test; mỗi mã có `remedy`; bể chờ sửa – nộp lại; không chặn cứng cái có thể cảnh báo | ngoài | IV | — |
| **A7** | Kernel báo lỗi cho module | Khi Kernel từ chối, module nhận đúng **mã**, đủ **ngữ cảnh** (docKey, sự việc, kỳ), **hướng xử lý**, trace về chứng từ gốc không? | lỗi CSDL ánh xạ đúng mã hợp đồng; `details` có docKey / eventId / kỳ; có remedy; test dùng SQLSTATE thật | trong → ngoài | IV · VI | **cổng** |
| **A8** | Chứng từ: phiên bản · workflow · transition · quyền | Document có version và trace theo version? Mọi bút toán gắn document gốc? Workflow YAML theo transition? Mỗi transition ghi user và quyền? | 4 ý đều ≥ 3; lịch sử transition có bảng / sự kiện riêng; SoD ở luồng ghi sổ | trong | III · VII | — |
| **A9** | Policy Registry: chặt trong, mềm ngoài | Chính sách có phiên bản, ngày hiệu lực, căn cứ; kiểm **đúng chính sách** (evaluate) chứ không chỉ "có tham chiếu"; module tuỳ biến mà không phá bảo toàn số? | Registry + Rule Contract + evaluate; API cho plugin; chính sách ngừng không còn qua kiểm; một cơ chế phiên bản | trong + ngoài | V · 0 | — |
| **A10** | Cấu hình UI/UX & tài liệu dev | Màn cấu hình có mockup → mã → hướng dẫn; dev mới tiếp tục build được không; ui-kit đủ không? | mockup đủ 4 trạng thái; ui-kit có grid / lọc / sheet / GateResult; template module có màn cấu hình mẫu; tài liệu không trái ADR | ngoài | 0 · V · VII | — |
| **A11** | Module thi hành | Mỗi phân hệ có flow, cảnh báo, quyền, workflow, dashboard vào – ra, lọc / phân loại, chính sách tại module, quản lý sự kiện vào — **như mua hàng**? | ≥ 3 phân hệ đạt mẫu mua hàng; đã ở `modules/` theo SDK | ngoài | VIII | — |
| **A12** | Lean & vận hành cộng đồng | `main` xanh; tài liệu khớp mã; R-FLOW được giữ; độ phủ luật; Core không phình (R-REV-15) | `selfcheck --strict` ĐẠT trên `main`; checklist / README phase khớp mã; độ phủ luật ≥ C; không hai nguồn sự thật | ngoài | VIII | **cổng** |

## 3. Luật kết luận

| Mã | Luật |
|---|---|
| **RV-1** | Điểm review = tổng 12 trục trên 48. Ghi cả % và từng trục; không làm tròn lên. |
| **RV-2** | Trục cổng (A2, A7, A12) dưới **2** ⇒ **KHÔNG ĐẠT**, tổng cao cũng không bù. Lý do: A2 là sự thật kế toán; A7 là lời hứa "lạt mềm buộc chặt" với module; A12 là điều kiện để cộng đồng làm tiếp mà không phân mảnh. |
| **RV-3** | Mọi trục cổng ≥ 2 và không trục nào = 0 ⇒ **ĐẠT có điều kiện** khi còn phát hiện mức chặn; **ĐẠT** khi không còn phát hiện chặn và mọi trục ≥ 3. |
| **RV-4** | Phát hiện có bốn mức: **chặn** (phá sự thật kế toán, sai hợp đồng đã hứa, `main` đỏ) · **nặng** (lỗi trong mã, hứa trong tài liệu mà mã không làm) · **vừa** (kẽ hở thiết kế, thiếu test) · **nhẹ** (tài liệu, đặt tên, nợ đã biết). Chặn ⇒ không đóng phiên bản. |
| **RV-5** | Mỗi phát hiện ghi: mã `RV-R<n>-nn`, mức, trục, bằng chứng `tệp:dòng`, luật / hợp đồng gốc, phase sở hữu, việc `S###-n` hoặc câu hỏi `Q###-n` (có sẵn hoặc đề xuất), và **tệp mẫu làm đúng** nếu có (R-REV-16). Không dẫn được về luật nào thì là "gợi ý", không chặn. |
| **RV-6** | Review không đổi trạng thái việc. Trạng thái đổi bằng PR sửa checklist phase (R-FLOW-8) rồi `node scripts/bang-viec.mjs --write`. |
| **RV-7** | Nhịp: 3 phase mở mới ⇒ 1 review, trước khi mở phase thứ tư và trước khi đóng phiên bản chứa các phase đó. Review nền móng (R1) quét toàn bộ; review sau chấm lại trục bị động chạm, trục khác ghi "không đổi" kèm điểm cũ. |

## 4. Ánh xạ trục ↔ trụ cột ↔ ma trận tuân thủ

| Trục | Trụ cột 0–VIII (`tru-cot.json`) | Nền móng 01–17 (`nen-mong.json`) | Ma trận tuân thủ C-1…C-9 |
|---|---|---|---|
| A1 | I, IV, VIII | 08, 09, 16 | — |
| A2 | I, V | 09, 13 | C-2, C-3, C-4, C-7 |
| A3 | III, VI | 10, 11 | C-1, C-6 |
| A4 | VIII, III | 08, 11 | C-5 |
| A5 | VI | 17 | C-8 |
| A6 | IV | 12 | C-1 |
| A7 | IV, VI | 09, 12 | — |
| A8 | III, VII | 06, 07 | C-1, C-3, C-6 |
| A9 | V, 0 | 02, 05 | C-9 |
| A10 | 0, V, VII | 02, 04 | — |
| A11 | VIII | 15, 16 | — |
| A12 | VIII | 12, 16 | — |

Trụ cột và nền móng có bảng điểm riêng (mức đạt từng tiêu chí, nguồn `docs/standard/tru-cot.json`, `docs/standard/nen-mong.json`). Review **không chép** mức đó sang đây; nó chấm theo trục, rồi ở [BANG-DIEM.md](BANG-DIEM.md) đặt cạnh nhau để thấy chỗ hai bảng **nói khác nhau** (ví dụ trụ cột ghi "đạt" nhưng review tìm được cờ thoát).

## Nhật ký tiêu chí

- **1.0 · 2026-11-08** — khởi tạo 12 trục, thang 0–4, trục cổng A2 · A7 · A12, luật RV-1…RV-7, ánh xạ trụ cột.
