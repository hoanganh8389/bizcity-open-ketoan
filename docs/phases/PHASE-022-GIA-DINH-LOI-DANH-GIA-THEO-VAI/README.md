# PHASE-022 — Bộ giả định lỗi và Bàn đánh giá theo vai (kế toán trưởng · kiểm soát · thanh tra thuế)
<!-- [2026-11-02 07:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — mở phase: danh mục giả định lỗi (môi trường, chứng từ, thuế, kho / giá vốn, cuối kỳ, lệch sổ, công nợ, tiền, tài sản, phân quyền), mỗi cảnh báo kèm phương án khắc phục; bộ chạy giả định lỗi; Bàn đánh giá theo ba vai dạng checklist. -->

> **Trạng thái:** 🟡 W0 tài liệu 2026-11-02 · chờ chủ duyệt D022-1..6 · **Code:** chưa
> **Giai đoạn:** Phase 2 của [PHASES](../../standard/PHASES.md) · **Mức Kernel:** K0 cho W0 (chỉ tài liệu); W1–W4 tối đa K1 (thêm trường `remedy` cho kiểm, thêm kiểm chỉ đọc, thêm một màn) — không đổi luật định khoản, không đổi sổ
> **Mục tiêu:** Liệt kê **toàn bộ** tình huống sai mà một bản cài kế toán có thể gặp, chạy được từng tình huống để chứng minh hệ thống phát hiện đúng, và cho ba vai đọc kết quả dưới dạng checklist. **Mọi cảnh báo phải kèm phương án khắc phục cụ thể**: bước làm, màn nào, ai có quyền, kiểm lại bằng gì.
> **Việc lộ trình:** —
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** R-VNC-10 (phân tích để người dùng quyết định, không chặn ngoài bất biến Tier 0) · R-DIAG-1..9 · ADR-0012 T3–T5 · bốn câu không thương lượng
> **Phụ thuộc phase:** 020 (Conformance Engine, kiểm L3 / L5, cảnh báo, duyệt tại đơn vị) · 021 (Trạm tiền kiểm, mã `IN-*`) · **Liên quan:** 019 (Bàn điều tra)
> **Nguồn yêu cầu:** chủ dự án 2026-11-02 — "duy trì 2 phương án, cảnh báo và phương án xử lý, hướng dẫn cách khắc phục cụ thể cho từng case… chạy 1 loạt các giả định lỗi và mã lỗi của môi trường, chứng từ, giá vốn, kết chuyển, lệch sổ, âm… hệ thống đánh giá đóng vai kế toán trưởng, audit – ban kiểm soát, thanh tra thuế… scoreboard checklist validate từng case. Nguyên tắc là warning lỗi phải kèm phương án khắc phục cụ thể."

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | vì sao, ba vai, nguyên tắc R-FIX, phạm vi, quyết định D022-*, câu hỏi Q022-*, năm đợt W0–W4, cổng nghiệm thu |
| [10-DANH-MUC-GIA-DINH](10-DANH-MUC-GIA-DINH.md) | **danh mục giả định lỗi**: 10 nhóm, mỗi ca có cách phát hiện, mức, vai, hậu quả, **phương án khắc phục từng bước**, cách kiểm lại, trạng thái |
| [20-KIEN-TRUC](20-KIEN-TRUC.md) | trường `remedy` có cấu trúc cho mọi kiểm, check SC-FIX-1, bộ chạy giả định lỗi (lane `scenario`), API Bàn đánh giá, liên kết với 020 / 021 |
| [30-UI-UX](30-UI-UX.md) | màn **Hệ thống → Bàn đánh giá** (HT08): ba vai, checklist theo nhóm, khung "Hiện tượng · Vì sao · Cách khắc phục · Kiểm lại", biên bản in |
| [mockups/ban-danh-gia.html](mockups/ban-danh-gia.html) | bản mẫu tĩnh mở được bằng trình duyệt, bấm thử chuyển vai, mở từng ca |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con `S022-*`, ca bằng chứng `T022-*`, log |

## Trả lời ngắn yêu cầu của chủ dự án

- **Hai phương án cùng chạy, một nguồn luật.** Cảnh báo ngay lúc nhập (Trạm tiền kiểm PHASE-021, mức `warn`) cho lỗi nằm trong một chứng từ; lượt định kỳ / theo yêu cầu (Conformance Engine PHASE-020) cho lỗi theo thời gian và lỗi giữa nhiều chứng từ. Cả hai gọi cùng hàm kiểm, cùng tham số rulepack.
- **Cảnh báo nào cũng có phương án khắc phục.** Luật mới **R-FIX-1**: mỗi kiểm mức `warn` / `error` khai `remedy` có cấu trúc (bước, màn, quyền, kiểm lại). Check **SC-FIX-1** chặn merge nếu thiếu. Kiểm lỗi toàn vẹn sổ thì phương án là "dừng, báo nhóm Lõi, không tự sửa sổ" — vẫn là một phương án cụ thể.
- **Toàn bộ giả định lỗi được liệt kê và chạy được.** [10-DANH-MUC-GIA-DINH](10-DANH-MUC-GIA-DINH.md) có 92 ca trong 10 nhóm. Mỗi ca có công thức gây lỗi trên đơn vị test và mã phải bắt được. Ca Kernel đã chặn cứng (Nợ ≠ Có, sửa sổ, kỳ khoá…) được chạy để chứng minh **bị chặn**.
- **Ba vai, một danh mục.** Kế toán trưởng (vận hành, cuối kỳ), Kiểm soát / ban kiểm soát (toàn vẹn, bằng chứng, phân quyền), Thanh tra thuế (hoá đơn, thuế, giá vốn, quỹ). Mỗi vai là một lăng kính lọc và sắp xếp cùng danh mục, không phải ba bộ luật.
- **Checklist, không phải điểm pháp lý.** Mỗi ca một dòng: ✔ đạt · ⚠ cảnh báo · ✘ lỗi · ⛔ bị chặn đúng thiết kế · ○ chưa kiểm được. Không công bố "điểm tuân thủ %" (ADR-0012 T5).

## Hiện trạng (đọc mã, 2026-11-02)

| Có sẵn | Ở đâu |
|---|---|
| Các mã tự chẩn đoán L1 / L3 / L5, mỗi mã có câu `fix` (chữ, chưa có cấu trúc) | [DIAGNOSTICS §2](../../ops/DIAGNOSTICS.md), `packages/kernel/src/modules/*/*.diagnostics.ts` |
| Bảng kiểm trước khoá kỳ (11 mục: chứng từ lỗi, lệch bút toán, chưa tính giá vốn, chưa kết chuyển, kết chuyển lỗi thời, còn số dư…) | `packages/kernel/src/modules/periods/period.routes.ts` (`GET /api/v1/periods/check`) |
| Mã tiền kiểm `IN-*` (31 mã, thiết kế) | [PHASE-021 20-KIEN-TRUC §2](../PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/20-KIEN-TRUC.md) |
| Màn Kiểm chuẩn ba lớp, cảnh báo ở phiếu / ACC14 / khoá kỳ | PHASE-020 S020-20, S020-21 |
| **Chưa có** | phương án khắc phục **có cấu trúc** (hôm nay chỉ là một câu chữ); danh mục giả định lỗi đầy đủ; bộ chạy giả định lỗi; góc nhìn theo vai; kiểm cho quỹ âm, khấu hao chưa chạy, công nợ ≠ sổ, tài khoản trung gian ≠ 0 |
