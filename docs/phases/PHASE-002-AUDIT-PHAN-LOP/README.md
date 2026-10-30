# PHASE-002 — Audit, phân loại generic / domain, nhãn lớp, đồ thị phụ thuộc

> **Trạng thái:** 🟡 phần máy xong (1.2, 1.4, 1.5); 1.1 và 1.3 cần người
> **Giai đoạn:** Phase 1 của [PHASES](../../standard/PHASES.md) · **Code:** có · **Tiến độ tín hiệu (2026-10-30):** 60%
> **Mục tiêu:** Biết rõ tệp nào thuộc lớp nào (K / P / M / D / A / U), cạnh phụ thuộc nào ngược chiều, chỗ nào module ghi bảng lõi; có bản nháp API SDK.
> **Việc lộ trình:** 1.1, 1.2, 1.3, 1.4, 1.5
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** C-7 (đo nợ A-17)
> **Phụ thuộc phase:** 001

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | 100% tệp `apps/api/src` có nhãn `@bizcity-layer` (SC-LAYER-1) | `tests/conformance/lib/layers.mjs`, `scripts/gan-nhan-lop.mjs` |
| F2 | 22 cạnh import ngược chiều lớp (SC-LAYER-2, nợ bánh cóc) | `docs/audits/deps-2026-10-30.md` |
| F3 | 14 chỗ module ghi bảng lõi (SC-MOD-2, A-17): `mua-hang` (demo, store, posting, analysis, ton-max), `quy/payment-requests`, `thue/authority-invoices` | `baseline.json` SC-MOD-2 |
| F4 | Bản nháp API `@bizcity/module-sdk`, 5 câu hỏi mở chốt trước PHASE-011 | `packages/module-sdk/API.md` §6 |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 1.1 ☐ · 1.2 ✅ · 1.3 ☐ · 1.4 ✅ · 1.5 ✅.
