# PHASE-010 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->
<!-- [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng. -->

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->
<!-- [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — S010-2: documents.* có (trừ chuyển purchase_attachments, chữ ký) -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S010-1a | W1: cổng `apps/api/src/kernel/public.ts` + SC-KERNEL-6 (block, ca tự kiểm), chuyển 21 tệp / 36 import | 2.3 | có | ✅ |
| S010-1b | W2: workspace `packages/kernel` (sau S010-4) | 2.3 | có | ✅ 2026-11-01 (D010-9): 60 tệp Kernel → `packages/kernel/src` (cấu trúc thư mục giữ nguyên, import Platform qua `@bizcity/platform/…`), `kernel/public.ts` → `src/index.ts`; tệp chuyển tiếp `apps/api/src/kernel/public.ts`, `db/seed.ts`; test dùng `@bizcity/kernel/<đường>`; build / Docker / bộ kiểm cập nhật |
| S010-2 | `packages/documents`: số, phiên bản, liên kết, đính kèm chung, chữ ký | 2.7 | có | ✅ 2026-11-01: năng lực `documents.numbering`, `documents.versions`, `documents.links`, `documents.attachments` (D010-4); HTTP `/api/v1/document-versions`, `/document-links`, `/document-attachments` (6 action `core.document-*` + tải tệp kiểm sha256); `test/documents-common.test.ts` 6 ca; hết 2 nợ SC-MOD-2 (`quy`, `mua-hang` ghi `document_sequences`). ✅ chuyển `purchase_attachments` sang đính kèm chung (0046, D010-6; `test/mua-hang-dinh-kem.test.ts` 4 ca), ✅ `documents.signatures` (0047; `documents-common.test.ts` +3 ca) |
| S010-3 | Tách `packages/contracts/src/mua-hang` về phân hệ | 2.8 | chưa | ☐ |
| S010-4 | Tách Platform (`core/*`: errors, http, auth, audit, actions, events, request-context…) thành gói — điều kiện của S010-1b | 2.3 | có | ✅ 2026-11-01 (D010-8): gói đệm `packages/platform` cho 22 tệp Kernel cần; phần còn lại của `core/*` ở `apps/api` chờ chia `packages/{data,permissions,audit,events,actions,documents,observability}` |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
| 2026-10-30 | Claude Code | Chủ "tiếp theo" ⇒ đo phụ thuộc (36 import vào Kernel; Kernel dùng `core/*` ~70 chỗ) → chia W1 / W2 (00 §2). Code W1: `kernel/public.ts`, SC-KERNEL-6, chuyển 21 tệp; baseline SC-LAYER-2 đổi khoá 3 nợ cũ (204 → 204). |
| 2026-10-30 | Claude Code | vitest đầy đủ: 728 + `debt-reports` chạy riêng 7/7 (worker tinypool sập giữa chừng) ⇒ 735 xanh, 1 bỏ qua; không lỗi vòng import do barrel `public.ts`. |
| 2026-11-01 00:16 | Claude Code | Chủ "ok tiếp" ⇒ 2.7 (S010-2, D010-4). 2.7 ☑ trên bảng điểm (ba năng lực lộ trình). |
| 2026-11-01 00:47 | Claude Code | Chủ "tiếp nhé" ⇒ D010-6: đính kèm Mua hàng chạy trên đính kèm chung (0046). Sửa kèm lỗi sẵn: bảng cũ không nhận owner_type invoice nên đính tệp vào hoá đơn NCC lỗi. |
| 2026-11-01 15:13 | Claude Code | Chủ chọn "làm signatures trước" (2.3 chờ báo người đóng góp, vì tách Platform đổi import 34 tệp phân hệ) ⇒ documents.signatures (0047). S010-2 đủ. |
| 2026-11-01 15:40 | Claude Code | Chủ "tách gói kernel nhé" ⇒ D010-7 chặng 1: Kernel không còn import adapter kết nối / báo cáo kho (hết 2 nợ SC-LAYER-2, baseline 190 → 188). |
| 2026-11-01 16:20 | Claude Code | D010-8 chặng 2: `packages/platform` (22 tệp, tệp chuyển tiếp ở đường cũ), build / Docker / bộ kiểm cập nhật; baseline 188 → 186 (khai `HOST`, `JWT_TTL_HOURS`). |
| 2026-11-01 16:39 | Claude Code | D010-9 chặng 3: `packages/kernel` (`@bizcity/kernel`). 2.3 ☑. Sửa kèm `voucherInfo` dùng `queryBool` (SC-API-2); 1 nợ đổi đường dẫn có why / ref (SC-KERNEL-5 `157`, phân loại tài khoản tồn kho); baseline 186 → 185. |
