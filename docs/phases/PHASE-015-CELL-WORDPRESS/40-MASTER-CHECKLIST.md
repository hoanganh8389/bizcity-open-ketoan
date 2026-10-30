# PHASE-015 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S015-1 | `adapters/cell`: khoá 1API, bốn bước, PKCE | 5.3 · G1-12 | chưa | ☐ |
| S015-2 | Cầu MCP `/api/v1/cell/mcp`, web chat, `core.notify.send` | 5.3 | chưa | ☐ |
| S015-3 | Đề xuất H-1..H-6 cho Hub / Cell | 5.3b | chưa | ⛔ nhóm plugin |
| S015-4 | `adapters/wordpress` + `ledger-php-sdk` | 5.4 | chưa | ☐ |
| S015-5 | Dịch vụ AI qua Cell: đọc hoá đơn, gợi ý lý do | G3-04 | chưa | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
