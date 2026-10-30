# PHASE-001 — Chốt chuẩn: bộ chuẩn, CI, bộ kiểm, migration sạch

> **Trạng thái:** 🟡 code xong; còn 3 việc tay của chủ (merge, bật GitHub, bản cài thật)
> **Giai đoạn:** Phase 0 của [PHASES](../../standard/PHASES.md) · **Code:** có · **Tiến độ tín hiệu (2026-10-30):** 73%
> **Mục tiêu:** Bộ chuẩn (CANON, hợp đồng, Standard v1), CI, bộ kiểm chuẩn một chỗ, migration sạch: nền để mọi phase sau đo được bằng máy.
> **Việc lộ trình:** 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7
> **Checklist công bố:** G1-01, G1-02, G1-03, G1-11, G1-13, G2-10
> **Tuân thủ / nguyên tắc:** C-2, C-3, C-4 (nền bất biến) · AP-3, AP-7
> **Phụ thuộc phase:** —

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Bộ kiểm `tests/conformance/`: lane selfcheck + diagnostics, baseline bánh cóc 210 nợ, tự kiểm đạt | `tests/conformance/selfcheck.mjs`, `baseline.json` |
| F2 | Migration 0001–0037; khoá checksum (SC-DATA-2); kiểm cài sạch + nâng cấp từ bản trước | `scripts/kiem-nang-cap.sh`, job `migrate-upgrade` trong `.github/workflows/ci.yml` |
| F3 | Sổ cái chỉ thêm, trigger bảo vệ; DG-LEDGER-1..4 đạt trên `ketoan_test` (9.725 bút toán) | migration `0005`, `modules/ledger/ledger.diagnostics.ts` |
| F4 | CSDL dev `ketoan` trong Docker mới ở `0029`: thiếu 0030–0037 nên lane diagnostics **KHÔNG ĐẠT** khi trỏ vào dev | `docker compose up -d --build` để áp |
| F5 | Mọi commit trước `ccfc341`, kể cả `main`, không cài sạch được (code dùng cột chưa có migration) | `scripts/kiem-nang-cap.sh` — phát hiện 2026-10-30 |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 0.1 ☐ · 0.2 🟡 · 0.3 ✅ · 0.4 ✅ · 0.5 ✅ · 0.6 🟡 · 0.7 🟡.
