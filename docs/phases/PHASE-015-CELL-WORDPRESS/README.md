# PHASE-015 — Adapter Bizcity Cell (1API, cầu MCP) và WordPress
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->

> **Trạng thái:** ☐ chưa code · cần Hub / Cell phía bizcity-twin-ai
> **Giai đoạn:** Phase 5 của [PHASES](../../standard/PHASES.md) · **Code:** chưa · **Tiến độ tín hiệu (2026-10-30):** 0%
> **Mục tiêu:** Cell hỏi công nợ, lập phiếu nháp qua Zalo có xác nhận; plugin WordPress chạy qua hợp đồng; CI "no-cell" vẫn xanh.
> **Việc lộ trình:** 5.3, 5.3b, 5.4
> **Checklist công bố:** G1-12, G3-04
> **Tuân thủ / nguyên tắc:** AP-2
> **Phụ thuộc phase:** 009

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Thiết kế có: kết nối bốn bước, cầu MCP, cổng kênh | `docs/standard/CELL-CONNECT.md`, `CELL-MCP.md`, `CHANNEL-GATEWAY-PORT.md` |
| F2 | Cổng kết nối WordPress hiện có (`bizcity_connector@1` ổn định) | `docs/cong-ket-noi.md` |
| F3 | `mcp.cell-bridge`, `cell.connect`, `ai.ocr-invoice` đang planned | `bizcity-standard.json` |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 5.3 ☐ · 5.3b ☐ · 5.4 ☐.
