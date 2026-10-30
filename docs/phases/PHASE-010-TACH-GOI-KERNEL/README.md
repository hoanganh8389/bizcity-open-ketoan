# PHASE-010 — Tách gói: `packages/kernel`, documents, actions, audit; dọn contracts

> **Trạng thái:** ☐ chưa code · không làm trước PHASE-004 (2.1 trước 2.3)
> **Giai đoạn:** Phase 2 của [PHASES](../../standard/PHASES.md) · **Code:** chưa · **Tiến độ tín hiệu (2026-10-30):** 0%
> **Mục tiêu:** `apps/api` chỉ import Kernel qua `@bizcity/kernel` công khai; Core khởi động không cần phân hệ nào.
> **Việc lộ trình:** 2.3, 2.7, 2.8
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** C-7
> **Phụ thuộc phase:** 004

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Kernel nằm trong `apps/api/src/modules/{documents,posting,posting-config,ledger,periods,accounts,debts,inventory,…}` | ADR-0008 (một gói `packages/kernel`) |
| F2 | `packages/` mới có `contracts` và bản nháp `module-sdk/API.md` | `packages/` |
| F3 | `packages/contracts/src/mua-hang` thuộc phân hệ (A-06) | `packages/contracts/src/mua-hang/` |
| F4 | Runtime action và bằng chứng còn ở `apps/api/src/core/` | `core/actions.ts`, `core/audit.ts` |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 2.3 ☐ · 2.7 ☐ · 2.8 ☐.
