# PHASE-013 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S013-1 | `@bizcity/ui-kit` + slot `partner.detail.tab`, `dashboard.widget` | 3.8 | có | ✅ 2026-11-03: `packages/ui-kit` và năng lực `ui.kit`, `ui.slots` (`available`) làm ở PHASE-014 W2 / W4 <!-- [2026-11-03 11:20 PM Johnny Chu - Chu Hoàng Anh] DANH-GIA --> |
| S013-2 | Chuyển `phan-he/*` → `modules/*`; SC-MOD-2 hết nợ | 3.9 | một phần | 🟡 2026-11-03: SC-MOD-1 đạt; SC-MOD-2, SC-LAYER-2 về 0 nợ (PHASE-014 W5). Thư mục `modules/` mới có `mua-hang/domain`; mã 9 phân hệ còn ở `apps/api/src/phan-he/*` — tiêu chí lộ trình 3.9 đạt bằng phép kiểm, chưa bằng việc chuyển thư mục <!-- [2026-11-03 11:20 PM Johnny Chu - Chu Hoàng Anh] DANH-GIA --> |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
| 2026-11-03 | Claude Code (theo chỉ đạo chủ dự án) | Đồng bộ với `main` theo [DANH-GIA-DAP-UNG-2026-11-03](../../audits/DANH-GIA-DAP-UNG-2026-11-03.md): S013-1 ✅ (ui-kit và slot có từ PHASE-014); S013-2 giữ 🟡 vì thư mục chưa chuyển. Bảng điểm lộ trình 3.8 và 3.9 đều 100% (tín hiệu `ui.kit`, `ui.slots`, SC-MOD-1/2) <!-- [2026-11-03 11:20 PM Johnny Chu - Chu Hoàng Anh] DANH-GIA --> |
