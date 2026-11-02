# PHASE-022 · 00 — Kế hoạch tổng: Bộ giả định lỗi và Bàn đánh giá theo vai
<!-- [2026-11-02 07:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — kế hoạch tổng: ba vai, R-FIX-1 (cảnh báo kèm phương án khắc phục), phạm vi, D022-1..6, Q022-1..5, đợt W0–W4, cổng nghiệm thu. -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Đọc kèm: [README](README.md) · [10-DANH-MUC-GIA-DINH](10-DANH-MUC-GIA-DINH.md) · [20-KIEN-TRUC](20-KIEN-TRUC.md) · [30-UI-UX](30-UI-UX.md) · [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md)

## 1. Vì sao

Hệ thống đã có nhiều kiểm, nhưng ba khoảng trống làm người dùng khó tự xử lý:

1. **Cảnh báo chưa nói "làm gì tiếp".** Câu `fix` của mỗi kiểm là một đoạn chữ. Không có bước đánh số, không có nút mở đúng màn, không nói ai có quyền làm, không nói xong thì kiểm lại thế nào. Người mới đọc "Chứng từ chưa vào sổ thì báo cáo thiếu số" không biết phải bấm đâu.
2. **Không ai chứng minh được hệ thống bắt đủ lỗi.** Test hiện có kiểm từng tính năng. Chưa có một danh sách "những gì có thể sai" để chạy hết và thấy dòng nào phát hiện được, dòng nào chưa.
3. **Ba người đọc khác nhau, một màn hình.** Kế toán trưởng cần biết việc gì còn tồn trước khi khoá kỳ. Ban kiểm soát cần biết sổ có bị can thiệp, bằng chứng có liền mạch. Thanh tra thuế nhìn hoá đơn, thuế suất, giá vốn, quỹ tiền mặt âm. Màn Kiểm chuẩn (PHASE-020) tổ chức theo lớp kỹ thuật, chưa theo người đọc.

## 2. Ba vai

| Vai | Câu hỏi chính | Nhóm quan tâm nhất | Quyết định họ đưa ra |
|---|---|---|---|
| **Kế toán trưởng (KTT)** | Kỳ này còn việc gì chưa xong, lỗi gì phải sửa trước khi khoá sổ, nộp tờ khai? | Chứng từ, kho và giá vốn, cuối kỳ, công nợ, tiền | sửa, giao việc, khoá kỳ (ghi lý do nếu còn cảnh báo) |
| **Kiểm soát / ban kiểm soát / kiểm toán nội bộ (KS)** | Sổ có toàn vẹn không, có ai sửa ngoài luồng, bằng chứng có liền mạch, phân quyền có đúng? | Lệch sổ, môi trường, phân quyền và bằng chứng, cuối kỳ | ghi nhận, yêu cầu giải trình, đề nghị xử lý |
| **Thanh tra thuế (TT)** — vai mô phỏng | Hoá đơn có đủ, thuế suất đúng thời điểm, khấu trừ đủ điều kiện, giá vốn và chi phí có cơ sở, quỹ có âm? | Thuế và hoá đơn, kho và giá vốn, tiền | (mô phỏng) danh sách điểm sẽ bị hỏi khi thanh tra, để đơn vị tự rà trước |

Vai là **lăng kính** trên cùng một danh mục ca: chọn ca nào hiện, thứ tự, lời mở đầu. Không có ba bộ luật riêng. Vai "Thanh tra thuế" là **tự rà trước**, không phải ý kiến của cơ quan thuế (nhãn trên màn ghi rõ).

## 3. Nguyên tắc

| Mã | Nguyên tắc |
|---|---|
| **R-FIX-1** | Mọi kiểm mức `warn` / `error` (tự chẩn đoán, tiền kiểm `IN-*`, ca kiểm chuẩn) khai **phương án khắc phục có cấu trúc**: các bước đánh số, màn thao tác (đường dẫn + mã màn), quyền cần có, cách kiểm lại. Thiếu thì check SC-FIX-1 chặn merge. |
| **R-FIX-2** | Phương án **không bao giờ** là sửa thẳng sổ, tắt kiểm, hay "bỏ qua". Lỗi toàn vẹn sổ (Tier 0) có phương án "dừng ghi sổ, báo nhóm Lõi kèm mã tra cứu, không tự sửa" — đó là phương án cụ thể. |
| **R-FIX-3** | Phương án nói **ai** làm: người lập, kế toán viên, kế toán trưởng, chủ đơn vị, vận hành. Bước cần quyền mà người đang xem không có thì hiện "nhờ <vai>", không ẩn bước. |
| **R-FIX-4** | Mỗi ca có **kiểm lại**: chạy lại đúng mã kiểm đó (không chạy cả bộ), hoặc mở màn có số liệu đã đổi. Người dùng thấy dòng chuyển từ ⚠ sang ✔. |
| **R-FIX-5** | Mỗi ca trong danh mục có **công thức gây lỗi** chạy được trên đơn vị test (đồng hồ cố định, qua cổng công khai). Ca Kernel chặn cứng thì công thức chứng minh **bị chặn** và mã lỗi đúng. |
| giữ nguyên | Cảnh báo không chặn (R-VNC-10); không số tiền trong thông báo (R-DIAG-6); người dùng chỉ thấy đơn vị mình (R-TEN); không điểm tuân thủ % (ADR-0012 T5). |

## 4. Phạm vi

| Có | Không |
|---|---|
| Danh mục giả định lỗi 10 nhóm, mỗi ca có phương án khắc phục | Luật kế toán / thuế mới trong Core (số liệu luật ở rulepack, R-VNC-10) |
| Trường `remedy` có cấu trúc cho `DiagCheck`, mã `IN-*`, ca rulepack; check SC-FIX-1 | Tự sửa dữ liệu, "nút sửa nhanh" ghi sổ thay người |
| Kiểm chỉ đọc mới cho khoảng trống: quỹ tiền mặt âm, khấu hao / phân bổ chưa chạy, công nợ ≠ sổ, tài khoản trung gian ≠ 0, số dư sai bên | Đối chiếu sao kê ngân hàng (chưa có dữ liệu sao kê — hoãn như Q020-6) |
| Bộ chạy giả định lỗi (lane `scenario`), bảng điểm checklist theo ca | Ý kiến pháp lý; nhãn "đạt thanh tra" |
| Màn Hệ thống → Bàn đánh giá (HT08), ba vai, biên bản in | Thay màn Kiểm chuẩn (HT06) — HT08 đọc cùng dữ liệu, tổ chức theo vai |

## 5. Quyết định cần chủ duyệt

| Mã | Quyết định đề xuất | Lý do |
|---|---|---|
| D022-1 | Mã ca giả định lỗi dạng `F22-<NHÓM>-NN` (vd `F22-STK-03`), tách khỏi mã kiểm (`INVENTORY_NEGATIVE`) và mã tiền kiểm (`IN-*`). Một ca trỏ tới một hoặc nhiều mã kiểm | ca là "tình huống", mã kiểm là "công cụ phát hiện"; một tình huống có thể bị nhiều kiểm bắt |
| D022-2 | `remedy` là **trường có cấu trúc của chính kiểm** (`DiagCheck.remedy`, mục danh mục `IN-*`, `scenario.remedy` của ca rulepack), không phải một bảng tra riêng | một chỗ sửa; kiểm mới không quên phương án (SC-FIX-1) |
| D022-3 | Bàn đánh giá (HT08) là **màn đọc**: dựng từ lượt tự chẩn đoán + lượt kiểm chuẩn gần nhất + bảng kiểm trước khoá kỳ; nút "Kiểm lại" chạy đúng một mã (chỉ đọc) | không thêm bộ chạy thứ hai (ADR-0012 T1) |
| D022-4 | Bộ chạy giả định lỗi là **một tệp vitest đọc danh mục JSON** (`apps/api/test/fault-scenarios.test.ts` + `tests/conformance/scenarios/*.json`), kết quả ghi `scenario-board.json` để bảng điểm CI đọc | dùng lại helpers, đơn vị test, đồng hồ cố định đã có |
| D022-5 | Vai "Thanh tra thuế" ghi rõ "tự rà trước — không phải kết luận của cơ quan thuế"; mọi ngưỡng luật lấy từ rulepack (đã duyệt tại đơn vị hay chưa thì hiện) | không mượn uy tín cơ quan nhà nước |
| D022-6 | Biên bản in cho ban kiểm soát / thanh tra: PDF từ HT08, có danh sách ca, trạng thái, phương án, người đã xác nhận / lý do — **không** số tiền chi tiết, chỉ mã chứng từ | R-DIAG-6; biên bản là tài liệu trao tay |

## 6. Câu hỏi mở

| Mã | Câu hỏi | Đề xuất |
|---|---|---|
| Q022-1 | Ai được xem vai "Kiểm soát"? Ban kiểm soát thường không phải nhân viên kế toán | Quyền mới `review:read` cấp cho chủ đơn vị, kế toán trưởng, và vai trò mới `auditor` (chỉ xem + Bàn đánh giá), như `developer` của PHASE-019 |
| Q022-2 | Ngưỡng nội bộ (3 ngày sự việc treo, 30 ngày hoá đơn chờ, 30 ngày sau cuối tháng) có cho đơn vị đổi không? | Có, qua tham số ca của rulepack + duyệt tại đơn vị (ADR-0015); thay đổi là một lượt duyệt có bằng chứng |
| Q022-3 | Quỹ tiền mặt âm: cảnh báo theo ngày hay theo thời điểm từng phiếu trong ngày? | Theo cuối ngày (cùng cách với tồn kho âm); thời điểm trong ngày không có trong dữ liệu chứng từ |
| Q022-4 | Có đưa ca của phân hệ ngoài (app, add-in) vào danh mục không? | Có: app khai `remedy` cho mã của mình (manifest), Bàn đánh giá hiện theo nhóm "Phân hệ"; W5 sau phase này |
| Q022-5 | Biên bản in có chữ ký số không? | Chưa: in + ký tay; chữ ký số đi theo năng lực ký chứng từ chung |

## 7. Đợt việc

| Đợt | Việc | Cổng |
|---|---|---|
| **W0 (tài liệu)** | danh mục 10 nhóm, kiến trúc, UI / UX, bản mẫu tĩnh | chủ duyệt D022-1..6, bố cục bản mẫu |
| W1 | hợp đồng `remedy` (`bizcity_remedy@1`), thêm `remedy` cho mọi kiểm hiện có, check SC-FIX-1 + tự kiểm | SC-FIX-1 xanh; không kiểm nào thiếu phương án |
| W2 | kiểm mới cho khoảng trống: `CASH_NEGATIVE`, `DEPRECIATION_OPEN`, `DEBT_MATCH_LEDGER`, `TRANSIT_NONZERO`, `ACCOUNT_WRONG_SIDE` (lane + app) | mỗi kiểm có công thức gây lỗi + test |
| W3 | bộ chạy giả định lỗi: danh mục JSON + `fault-scenarios.test.ts` + `scenario-board.json`; chạy hết 92 ca | mọi ca ✔ / ⚠ / ⛔ đúng kỳ vọng hoặc ○ có lý do |
| W4 | màn HT08 Bàn đánh giá + API `core.review.board` + "Kiểm lại" một mã + biên bản in | chủ duyệt màn; T022-* xanh |

## 8. Cổng nghiệm thu

- Mọi ca trong danh mục có trạng thái: có kiểm + công thức gây lỗi chạy xanh, **hoặc** ghi rõ "chưa kiểm được" kèm lý do và ticket.
- Không kiểm `warn` / `error` nào thiếu `remedy` (SC-FIX-1 block).
- Ba vai trên HT08 hiện đúng nhóm, đúng thứ tự; bấm một ca thấy đủ bốn khối: Hiện tượng · Vì sao · Cách khắc phục · Kiểm lại.
- Không có nút nào ghi sổ, tắt kiểm, bỏ qua; mọi "tiếp tục khi còn cảnh báo" đi qua xác nhận có bằng chứng sẵn có (PHASE-020 T3).
