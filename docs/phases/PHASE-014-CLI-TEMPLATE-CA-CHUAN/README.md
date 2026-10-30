# PHASE-014 — CLI, starter template, bộ kiểm runtime, ca chuẩn Hợp đồng, Standard 1.0.0, preset
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->

> **Trạng thái:** 🟡 AGENTS.md + 1 preset có; CLI, template, ca chuẩn chưa
> **Giai đoạn:** Phase 4 của [PHASES](../../standard/PHASES.md) · **Code:** một phần · **Tiến độ tín hiệu (2026-10-30):** 17%
> **Mục tiêu:** Claude (hoặc người mới) tạo được module Hợp đồng đạt bộ kiểm 3/3 lần chỉ bằng CLI + template + tài liệu.
> **Việc lộ trình:** 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
> **Checklist công bố:** G3-02
> **Tuân thủ / nguyên tắc:** AP-3, AP-7
> **Phụ thuộc phase:** 006 (3.4 trước 4.2), 011

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Lệnh đang là script rời: `cai-preset.mjs`, `gan-nhan-lop.mjs`, `do-thi-phu-thuoc.mjs`, `kiem-*.sh` | `scripts/` |
| F2 | AGENTS.md có mục "Tạo module mới"; chưa có `templates/` | `AGENTS.md` |
| F3 | 1/3 preset (`thuong-mai-ban-le`) | `presets/` |
| F4 | Standard đang `1.0.0-draft` | `docs/standard/bizcity-standard.json` |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 4.1 ☐ · 4.2 ☐ · 4.3 ☐ · 4.4 🟡 · 4.5 ☐ · 4.6 ☐ · 4.7 🟡.
