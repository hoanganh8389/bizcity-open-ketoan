# PHASE-025 — Accounting Continuity: liên tục kế toán, lineage giá vốn, kiểm chuẩn vòng đời (Gate C)
<!-- [2026-11-03 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — mở phase theo chỉ đạo chủ dự án: Accounting Continuity là trụ cột Core; lineage mua → kho → bán → giá vốn → lãi lỗ; conformance theo vòng đời -->

> **Trạng thái:** 🟡 W0 tài liệu + bản mẫu 2026-11-03 · chờ chủ duyệt D025-1..8 · **Code:** chưa
> **Mức Kernel:** K0 cho W0; W1 K1 (lineage chỉ đọc trên dữ liệu có sẵn); W2–W3 **K2** (bảng lớp / phân bổ, engine tính giá chung); W4 K2 (Gate C, khoá kỳ)
> **Mục tiêu:** Mọi con số trên sổ đi ngược được về nghiệp vụ kinh tế đã sinh ra nó, qua mọi lần đổi mã, đổi phần mềm, đổi kỳ, đổi chế độ; Core tự kiểm chuỗi đó và cho người dùng **thấy** nó.
> **Việc lộ trình:** — (đề xuất thêm vào PHASES khi chủ duyệt D025-1)
> **Phân hệ:** tong-hop · kho <!-- [2026-11-11 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — B1: dòng Phân hệ (R-FLOW-10) cho HT11 -->
> **Checklist công bố:** —
> **Quyết định:** [ADR-0021](../../adr/ADR-0021-accounting-continuity-lien-tuc-ke-toan.md) (đề xuất) · **Luật:** [R-CONT](../../rules/RULE-CONTINUITY.md) · **Tôn chỉ:** [ADR-0020](../../adr/ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md)
> **Phụ thuộc:** PHASE-024 B2 (`items`, mã có phiên bản) cho khoá `item_id`; W1 chạy được trước, khoá tạm theo mã hàng · **Liên quan:** 005 (chính sách có phiên bản), 021 / 024 (Gate A / B), 022 (Bàn đánh giá)
> **Nguồn yêu cầu:** chủ dự án 2026-11-03 — *"Open Kế Toán không chỉ là một thư viện định khoản. Nó phải trở thành một framework bảo đảm Accounting Continuity — tính liên tục, truy xuất được và kiểm chứng được của dữ liệu kế toán xuyên suốt vòng đời kinh tế, qua nhiều phiên bản mã, nhiều phần mềm tích hợp và nhiều kỳ áp dụng chế độ kế toán."*

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | trụ cột, quyết định D025-1..8, đợt W0–W5, việc đang có / cần thêm |
| [10-MO-HINH-DU-LIEU](10-MO-HINH-DU-LIEU.md) | mười một định danh: cái gì đã có, cái gì thêm; `valuation_layers`, `cost_allocations`; truy vấn lineage xuôi / ngược |
| [20-KIEM-CHUAN-VONG-DOI](20-KIEM-CHUAN-VONG-DOI.md) | Gate C: kiểm theo **sự kiện** và theo **vòng đời**; họ mã `CT-*`; checklist xuất bán; điều kiện khoá kỳ |
| [30-UI-UX](30-UI-UX.md) | **Hành trình mặt hàng**, dòng sự kiện vận hành / kế toán, checklist sự kiện, **sẵn sàng khoá kỳ**; thiết kế "small win" |
| [mockups/continuity.html](mockups/continuity.html) | bản mẫu tĩnh: bốn màn, bấm thử |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | việc con `S025-*`, ca bằng chứng `T025-*`, log |

## Trả lời ngắn

- **Có phải FIFO?** Không cứng hoá: phương pháp tính giá là chính sách có phiên bản của đơn vị (R-CONT-3). Mô hình lớp + phân bổ dùng chung; FIFO là một lựa chọn, bình quân (đang chạy) là lựa chọn khác — cả hai đều có lineage.
- **Thể hiện cho người dùng thế nào?** Màn **Hành trình mặt hàng** (một `item_id`, mọi phiên bản mã, mọi lớp giá vốn, mọi lần xuất, bút toán, trả / huỷ, lãi lỗ), và **Sẵn sàng khoá kỳ** — mỗi điều kiện là một thanh tiến độ đi lên, mỗi chỗ đứt là một mã có nút "sửa ở đâu".
- **Ai đánh dấu "đạt"?** Engine. Không có nút đánh dấu (R-CONT-7).
- **Đổi thông tư có phải làm lại dữ liệu?** Không: mã, hệ thống tài khoản, phương pháp tính giá, luật định khoản đều có phiên bản + ngày hiệu lực (R-CONT-9).
