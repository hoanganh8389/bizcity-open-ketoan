# PHASE-009 — MCP ghi: lập nháp, ghi sổ, đảo bút toán có xem trước + duyệt
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->
<!-- [2026-10-30 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — MCP ghi: lập nháp, đề xuất huỷ, luôn chờ duyệt; ADR-0009 đề xuất. -->

<!-- [2026-10-30 10:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — đủ 3/3 công cụ ghi: journal.post (phiếu nhập tay nháp chờ duyệt). -->
> **Trạng thái:** ✅ 3/3 công cụ ghi có (2026-10-30): `create_draft`, `journal.post`, `entry.reverse`; còn S009-5 khoá `mcp_…` (⛔ Q009-2, cùng PHASE-015)
> **Giai đoạn:** Phase 2 của [PHASES](../../standard/PHASES.md) · **Code:** có (3/3) · **Tiến độ tín hiệu (2026-10-30):** 100% (việc 2.16; G2-04 có)
> **Mục tiêu:** AI lập được chứng từ nháp và đề xuất ghi / đảo qua MCP; luôn xem trước, `confirm_token`, người duyệt; AI không tự duyệt, không vượt khoá kỳ.
> **Việc lộ trình:** 2.16
> **Checklist công bố:** G2-04
> **Tuân thủ / nguyên tắc:** C-8 · AP-1, AP-2
> **Phụ thuộc phase:** 004 (công cụ ghi đi một cửa)

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | thiết kế D009-1…9, Q009-1 đã chốt (a) |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã (trước khi code)

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Khung `confirm_token` (900 s, băm tham số, khoá idempotency `mcp:<token>`) đã chạy | `modules/system/mcp.routes.ts`, migration `0037` |
| F2 | 4 công cụ đọc; chưa có công cụ ghi | `modules/reports/report.actions.ts` |
| F3 | Khoá `mcp_…` có phạm vi riêng chưa có (đang dùng phiên đăng nhập / khoá API chung) | ghi chú việc 2.11 |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 2.16 ☑, G2-04 **có**.
