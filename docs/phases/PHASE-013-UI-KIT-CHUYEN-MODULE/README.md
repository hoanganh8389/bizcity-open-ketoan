# PHASE-013 — `@bizcity/ui-kit`, slot, chuyển `phan-he/*` thành `modules/*`

> **Trạng thái:** 🟡 SC-MOD-1 đạt; 14 nợ SC-MOD-2 còn
> **Giai đoạn:** Phase 3 của [PHASES](../../standard/PHASES.md) · **Code:** một phần · **Tiến độ tín hiệu (2026-10-30):** 25%
> **Mục tiêu:** Giao diện module chỉ import ui-kit; phân hệ thành module thật, hết chỗ ghi bảng lõi (A-17).
> **Việc lộ trình:** 3.8, 3.9
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** C-7
> **Phụ thuộc phase:** 011

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | 14 chỗ module ghi bảng lõi (SC-MOD-2) | `baseline.json` |
| F2 | Thành phần giao diện dùng chung nằm trong `apps/web/src/components`, `layout`, `lib` | `apps/web/src/` |
| F3 | `ui.menu` available; `ui.kit`, `ui.slots` planned | `bizcity-standard.json` |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 3.8 ☐ · 3.9 🟡.
