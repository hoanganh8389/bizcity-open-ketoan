# PHASE-009 — MCP ghi: lập nháp, ghi sổ, đảo bút toán có xem trước + duyệt

> **Trạng thái:** 🟡 khung xác nhận có; chưa có công cụ ghi
> **Giai đoạn:** Phase 2 của [PHASES](../../standard/PHASES.md) · **Code:** một phần · **Tiến độ tín hiệu (2026-10-30):** 0%
> **Mục tiêu:** AI lập được chứng từ nháp và đề xuất ghi / đảo qua MCP; luôn xem trước, `confirm_token`, người duyệt; AI không tự duyệt, không vượt khoá kỳ.
> **Việc lộ trình:** 2.16
> **Checklist công bố:** G2-04
> **Tuân thủ / nguyên tắc:** C-8 · AP-1, AP-2
> **Phụ thuộc phase:** 004 (công cụ ghi đi một cửa)

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Khung `confirm_token` (900 s, băm tham số, khoá idempotency `mcp:<token>`) đã chạy | `modules/system/mcp.routes.ts`, migration `0037` |
| F2 | 4 công cụ đọc; chưa có công cụ ghi | `modules/reports/report.actions.ts` |
| F3 | Khoá `mcp_…` có phạm vi riêng chưa có (đang dùng phiên đăng nhập / khoá API chung) | ghi chú việc 2.11 |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 2.16 ☐.
