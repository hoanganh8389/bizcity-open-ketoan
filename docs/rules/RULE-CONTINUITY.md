# RULE · Liên tục kế toán — Accounting Continuity (R-CONT)
<!-- [2026-11-03 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — luật R-CONT theo ADR-0021: chuỗi vòng đời mua → kho → bán → giá vốn → lãi lỗ liền mạch, lineage giá vốn, kiểm chuẩn vòng đời (Gate C) -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Cấp:** Tier 0 cho R-CONT-0; Tier 1 cho R-CONT-1…9 · **Trạng thái:** đề xuất ([ADR-0021](../adr/ADR-0021-accounting-continuity-lien-tuc-ke-toan.md)) · **Thi hành:** [PHASE-025](../phases/PHASE-025-ACCOUNTING-CONTINUITY/README.md).
> Nền: [R-ITEM](RULE-ITEM.md) (định danh bất biến, mã có phiên bản), [R-GATE](RULE-GATE.md) (cổng, thư viện mã), [R-POST](RULE-POSTING.md) (giá vốn sau ghi sổ), [R-LEDGER](RULE-LEDGER.md) (sổ cái chỉ thêm).

## Nguyên tắc một câu

**Mọi con số trên sổ phải đi ngược được về nghiệp vụ kinh tế đã sinh ra nó — qua mọi lần đổi mã, đổi phần mềm, đổi kỳ và đổi chế độ — và Core tự kiểm chuỗi đó, không chờ người dùng tự đánh dấu.**

## Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| R-CONT-0 | **Không đứt chuỗi.** Mọi dòng kho, dòng giá vốn và dòng sổ phát sinh từ hàng hoá mang đủ khoá để đi ngược về nghiệp vụ gốc: `item_id`, `economic_event_id` (accounting_events), `document_line_id`, và với giá vốn `cost_allocation_id` → `valuation_layer_id`. Một con số không đi ngược được là lỗi Tier 0 | `CT-LIN-*` (Gate C); test chuỗi mua → bán → giá vốn |
| R-CONT-1 | **Định danh xuyên suốt.** Liên kết kế toán dùng `item_id` (không dùng mã hiển thị); mã hàng đổi thì chuỗi không đổi (R-ITEM-0). Báo cáo theo mã ở một ngày đọc mã có hiệu lực ngày đó | `CT-MD-*`; SC-ITEM-2 |
| R-CONT-2 | **Lineage là sổ thứ hai.** Lớp giá vốn (`valuation_layers`) và phân bổ (`cost_allocations`) **chỉ thêm**, có phiên bản: tính lại = bản phân bổ mới thay bản cũ (`superseded_by`), không ghi đè. Tổng phân bổ của một dòng xuất = giá vốn đã ghi sổ của dòng đó | trigger chỉ thêm; `CT-COST-003` |
| R-CONT-3 | **Phương pháp tính giá là chính sách có phiên bản, mặc định bình quân gia quyền tháng cho mọi đơn vị** <!-- [2026-11-03 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — chủ duyệt D025-2 (mặc định FIFO) + hướng D025-6 (khoá kỳ) --> <!-- [2026-11-03 09:48 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — chủ chốt lại D025-2: tính giá mặc định bình quân gia quyền tháng; FIFO / FEFO theo lô là quy tắc xuất kho, tách khỏi giá vốn (thay quyết định 07:30 PM) -->; quy tắc xuất lô (FEFO / FIFO theo lô) là vận hành kho, không đổi giá vốn. Nhập trước – xuất trước, bình quân gia quyền (kỳ / liên hoàn), thực tế đích danh là lựa chọn của đơn vị trong `posting_policy_versions`, áp dụng nhất quán, đổi từ đầu năm tài chính, không viết lại kỳ đã khoá. Một mô hình lớp + phân bổ cho mọi phương pháp | `CT-COST-*`; test đổi phương pháp |
| R-CONT-4 | **Nghiệp vụ ngược tham chiếu gốc.** Trả hàng bán, trả nhà cung cấp, huỷ, điều chỉnh mang khoá tới dòng gốc (`original_line_id`) và hoàn **đúng lớp giá vốn** của lần gốc (không lấy giá hiện tại) trừ khi chính sách ghi khác | `CT-REV-*` |
| R-CONT-5 | **Sổ chi tiết = sổ cái.** Tại mọi thời điểm khoá: tổng giá trị tồn theo lớp (từng nhóm tính giá, từng tài khoản tồn kho) = số dư tài khoản hàng tồn kho; tổng giá vốn phân bổ của kỳ = phát sinh Nợ tài khoản giá vốn từ xuất kho | `CT-REC-*`; STOCK_LEDGER_MATCH |
| R-CONT-6 | **Khoá kỳ đòi chuỗi lành.** Khoá kỳ đọc Gate C qua **cơ chế khoá kỳ hiện có** (R-DIAG-4, danh sách điều kiện): mã toàn vẹn chuỗi (`CT-LIN-*`, `CT-REC-*`) **chặn trừ khi người có quyền ghi lý do chấp nhận** (bằng chứng, hiện ở nhật ký khoá kỳ); các mã còn lại mặc định cảnh báo (R-GATE-9), đơn vị tự nâng lên chặn. Chấp nhận không xoá lỗi — chỉ ghi nhận quyết định <!-- [2026-11-03 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — chủ duyệt D025-2 (mặc định FIFO) + hướng D025-6 (khoá kỳ) -->. Bảng sẵn sàng khoá kỳ hiện từng điều kiện | `CT-PER-*`; kiểm khoá kỳ |
| R-CONT-7 | **Kết quả do engine tính.** Trạng thái đạt / không đạt của mỗi mã `CT-*` tính từ dữ liệu và luật (rule pack); không có nút "đánh dấu đạt". Người dùng sửa dữ liệu (hoặc chấp nhận có lý do với mã mức cảnh báo, theo phân quyền) rồi engine chạy lại | SC-CONT-1 (không có API ghi trạng thái đạt) |
| R-CONT-8 | **Vận hành ≠ kế toán.** Mỗi sự kiện trên dòng thời gian của một đối tượng ghi rõ loại: **kế toán** (có bút toán hoặc đổi giá trị tồn) hay **vận hành** (đặt hàng, đổi mã hiển thị, chuyển kho cùng nhóm tính giá, cập nhật danh mục không đổi bản chất) | hợp đồng `bizcity_lineage@1` (`effect`) |
| R-CONT-9 | **Đổi chế độ không làm lại dữ liệu.** Đổi mã hàng (phiên bản mã), đổi hệ thống tài khoản (phiên bản + ánh xạ, ADR-0018), đổi phương pháp tính giá / luật định khoản (`policy_version_id`) đều có ngày hiệu lực; báo cáo nhiều kỳ đọc qua phiên bản, không sửa dòng đã ghi | test báo cáo xuyên phiên bản |

## Thể hiện khi làm việc

| Ai | Thấy gì |
|---|---|
| Kế toán | **Hành trình mặt hàng**: một `item_id`, các phiên bản mã, mọi phiếu nhập (lớp giá vốn), mọi lần xuất (phân bổ về lớp nào), bút toán, trả / huỷ, lãi lỗ theo kỳ — và chỗ đứt chuỗi (mã `CT-*` kèm cách sửa) |
| Kế toán trưởng / người có quyền khoá kỳ | **Sẵn sàng khoá kỳ**: từng điều kiện R-CONT-6 với số còn thiếu, đi thẳng tới chỗ sửa |
| Dev / plugin | phản hồi cửa nạp và API lineage cùng khuôn mã; mỗi dòng chứng từ có `lineKey` ổn định để làm `document_line_id` |
| CEO | một màn: kỳ này bao nhiêu sự kiện, bao nhiêu đạt, giá vốn giải thích được bao nhiêu % |
