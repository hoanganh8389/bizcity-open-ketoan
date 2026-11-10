# PHASE-021 — Trạm tiền kiểm đầu vào (bể chờ, chẩn đoán, chấm điểm)
<!-- [2026-11-02 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — mở phase thi hành ADR-0014: bể chờ intake_inbox, tiền kiểm 5 lớp, màn Trạm kiểm tra đầu vào, bảng điểm đầu vào; lộ trình 2.17–2.21 -->

> **Trạng thái:** 🟡 W0 kế hoạch + kiến trúc 2026-11-02 · ADR-0014 chủ duyệt 2026-11-02 (Q1–Q4) · W1 sẵn sàng làm
> **Giai đoạn:** Phase 2 của [PHASES](../../standard/PHASES.md) (Document) · **Code:** chưa · **Mức Kernel:** K1 (bọc cửa nạp; không đổi luật định khoản, không đổi sổ)
> **Mục tiêu:** Không chứng từ nào bị từ chối mà mất dấu. Người lập, kể cả thực tập sinh, thấy **hết** lỗi trong một lần, hiểu **vì sao** kế toán cần, sửa ở nguồn hoặc tại bể, thử lại và thấy tác động. Kế toán trưởng chấm điểm, kiểm soát được chất lượng đầu vào. Kernel vẫn chặn nguyên vẹn.
> **Việc lộ trình:** 2.17, 2.18, 2.19, 2.20, 2.21
> **Phân hệ:** chung-tu <!-- [2026-11-11 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — B1: dòng Phân hệ (R-FLOW-10) cho HT11 -->
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** C-1 (chứng từ hợp lệ), C-8 (kiểm toán) · AP-1 · R-INTAKE-1..13, R-EVENT-1, -2, -7, -11 · bốn câu không thương lượng
> **Phụ thuộc phase:** 004 (một cửa ghi sổ), 006 (outbox), 007 (RLS), 011 (`core.document.submit`, app ngoài tiến trình — PR-2, PR-2b) · **Liên quan:** 019 (mã tra cứu, Bàn điều tra), 020 (kiểm chuẩn pháp lý VN góp mã `IN-*`)
> **Nguồn yêu cầu:** chủ dự án 2026-11-02 — "cơ chế theo dõi được danh sách các chứng từ để chặn, kiểu một bể buffer… người dùng chủ động xem và sửa lại… thay vì chặn cứng… đứng góc độ kế toán trưởng, kiểm soát, audit… chấm điểm đầu vào… nhân viên thực tập cũng hiểu và chỉnh sửa lại cho đúng".

| Tài liệu | Một câu |
|---|---|
| [ADR-0014](../../adr/ADR-0014-tram-tien-kiem-be-cho-dau-vao.md) | quyết định: bể chờ riêng (không ghi vào `accounting_events`), năm lớp tiền kiểm, hai đường sửa, chấm điểm; Q1–Q4 đã duyệt |
| [RULE-INTAKE](../../rules/RULE-INTAKE.md) | 13 luật R-INTAKE, kiểm bằng theo từng PR của phase này |
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | vì sao, quyết định D021-*, sáu đợt W0–W5, cổng nghiệm thu, rủi ro, ước lượng |
| [10-HIEN-TRANG](10-HIEN-TRANG.md) | đọc mã: chứng từ bị từ chối đang đi đâu (kèm `tệp:dòng`) |
| [20-KIEN-TRUC](20-KIEN-TRUC.md) | bảng `intake_inbox`, danh mục mã `IN-*`, bộ tiền kiểm, API, vòng đời, màn hình, chấm điểm, bảo mật, test |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con `S021-*` + ca bằng chứng `T021-*` + log |

## Trả lời ngắn yêu cầu của chủ dự án

- **Không chặn cứng ở trải nghiệm, vẫn chặn cứng ở sổ.** Chứng từ bị từ chối vào **bể chờ**, có nguyên văn, chẩn đoán, điểm. Không có đường nào vào sổ ngoài cửa nạp; lỗi mức chặn chỉ hết khi dữ liệu đúng.
- **Hiểu bản chất nguyên nhân.** Mỗi lỗi nói: trường nào, đã gửi gì, đúng phải là gì, **vì sao kế toán cần**, sửa ở nguồn thế nào, kèm trang bài học.
- **Học kiểu A/B.** Nút Kiểm thử chạy đủ năm lớp mà không ghi gì; màn so lần trước / lần này: lỗi nào hết, lỗi nào mới, điểm tăng hay giảm.
- **Góc nhìn kế toán trưởng.** Một màn cho cả chứng từ bị từ chối (bể chờ) lẫn chứng từ chờ / lỗi định khoản (ACC14 hôm nay). Bảng điểm theo nguồn, người lập, loại chứng từ, mã lỗi — mọi kế toán xem để cùng học (Q3).
- **`accounting_events` giữ sự thật sạch.** Sự kiện đã đạt khuôn vào `accounting_events` như hôm nay; đầu vào chưa đạt khuôn ở bể chờ. Lý do ở [ADR-0014 §Phản biện](../../adr/ADR-0014-tram-tien-kiem-be-cho-dau-vao.md).

## Hiện trạng đọc mã

Chi tiết ở [10-HIEN-TRANG](10-HIEN-TRANG.md). Tóm tắt:

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Sai khuôn → `VALIDATION_ERROR`, **không lưu gì**, chi tiết là `zod.flatten()` thô | `packages/kernel/src/modules/documents/document.service.ts:481-482` |
| F2 | Kiểm tổng dừng ở lỗi đầu tiên | `document.service.ts:71-80` (`assertTotals`) |
| F3 | Lỗi khuôn / xung đột phiên bản bị ném ra, không ghi; lỗi định khoản mới được lưu `status = 'error'` | `document.service.ts:418-426, 435` |
| F4 | Nạp lô trả lỗi theo dòng, không lưu dòng lỗi | `document.service.ts:487-499` |
| F5 | ACC14 chỉ thấy sự việc đã nhận (chờ / lỗi định khoản) | `apps/web/src/features/documents/DocumentsPage.tsx:8` |
| F6 | Danh mục lỗi có `message` + `hint` theo **mã HTTP**, không theo trường / nghiệp vụ | `packages/contracts/src/errors.ts:22` |

## Xong khi

Phase xong khi 2.17–2.21 **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)): năm năng lực `intake.*` chuyển `available`, ca bằng chứng T021-1…T021-18 đạt, cổng nghiệm thu từng đợt ở [00-MASTER-PLAN §5](00-MASTER-PLAN.md) có biên bản trong `evidence/`. Trạng thái hôm nay: 2.17 ☐ · 2.18 ☐ · 2.19 ☐ · 2.20 ☐ · 2.21 ☐.
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — trạng thái sau W1 -->
Trạng thái 2026-11-02 (sau W1): 2.17 ✅ · 2.18 ☐ · 2.19 ☐ · 2.20 ☐ · 2.21 ☐.
