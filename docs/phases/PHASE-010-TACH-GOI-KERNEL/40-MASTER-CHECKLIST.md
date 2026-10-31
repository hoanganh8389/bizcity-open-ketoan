# PHASE-010 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->
<!-- [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng. -->

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S010-1a | W1: cổng `apps/api/src/kernel/public.ts` + SC-KERNEL-6 (block, ca tự kiểm), chuyển 21 tệp / 36 import | 2.3 | có | ✅ |
| S010-1b | W2: workspace `packages/kernel` (sau S010-4) | 2.3 | chưa | ☐ |
| S010-2 | `packages/documents`: số, phiên bản, liên kết, đính kèm chung, chữ ký | 2.7 | chưa | ☐ |
| S010-3 | Tách `packages/contracts/src/mua-hang` về phân hệ | 2.8 | chưa | ☐ |
| S010-4 | Tách Platform (`core/*`: errors, http, auth, audit, actions, events, request-context…) thành gói — điều kiện của S010-1b | 2.3 | chưa | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
| 2026-10-30 | Claude Code | Chủ "tiếp theo" ⇒ đo phụ thuộc (36 import vào Kernel; Kernel dùng `core/*` ~70 chỗ) → chia W1 / W2 (00 §2). Code W1: `kernel/public.ts`, SC-KERNEL-6, chuyển 21 tệp; baseline SC-LAYER-2 đổi khoá 3 nợ cũ (204 → 204). |
| 2026-10-30 | Claude Code | vitest đầy đủ: 728 + `debt-reports` chạy riêng 7/7 (worker tinypool sập giữa chừng) ⇒ 735 xanh, 1 bỏ qua; không lỗi vòng import do barrel `public.ts`. |
