# PHASE-010 — Tách gói: `packages/kernel`, documents, actions, audit; dọn contracts
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->
<!-- [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng. -->

> **Trạng thái:** 🟡 W1 xong 2026-10-30: cổng `apps/api/src/kernel/public.ts` + SC-KERNEL-6 (block), 21 tệp chuyển. W2 (dời thư mục sang `packages/kernel`) chờ tách Platform thành gói
> **Giai đoạn:** Phase 2 của [PHASES](../../standard/PHASES.md) · **Code:** có (W1) · **Tiến độ tín hiệu (2026-10-30):** 0%
> **Mục tiêu:** `apps/api` chỉ import Kernel qua `@bizcity/kernel` công khai; Core khởi động không cần phân hệ nào.
> **Việc lộ trình:** 2.3, 2.7, 2.8
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** C-7
> **Phụ thuộc phase:** 004

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | vì sao chia W1 / W2, bề mặt công khai, thứ tự tách gói |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã (trước khi code)

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Kernel nằm trong `apps/api/src/modules/{documents,posting,posting-config,ledger,periods,accounts,debts,inventory,…}` | ADR-0008 (một gói `packages/kernel`) |
| F2 | `packages/` mới có `contracts` và bản nháp `module-sdk/API.md` | `packages/` |
| F3 | `packages/contracts/src/mua-hang` thuộc phân hệ (A-06) | `packages/contracts/src/mua-hang/` |
| F4 | Runtime action và bằng chứng còn ở `apps/api/src/core/` | `core/actions.ts`, `core/audit.ts` |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 2.3 ☐ · 2.7 ☐ · 2.8 ☐.
