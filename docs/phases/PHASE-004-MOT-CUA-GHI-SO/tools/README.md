# PHASE-004 · tools
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->
<!-- [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn. -->

| Công cụ | Làm gì | Trạng thái |
|---|---|---|
| `so-du-moc.mjs` | Chỉ đọc. Chụp sổ cái theo loại chứng từ × ngày × tài khoản × đảo (tổng Nợ, Có, số dòng) và sự việc theo loại × trạng thái ra JSON; `--diff a.json b.json` so hai mốc. Không gom theo đơn vị vì test tạo đơn vị tên ngẫu nhiên: so **cùng kịch bản** chạy trên hai bản code (T004-1) | ✅ dùng 2026-10-30 |

Quy ước: công cụ phase chỉ đọc CSDL (`default_transaction_read_only = on`), chạy bằng `node` trực tiếp, không cần `npm install`; CSDL chỉ qua lệnh `--psql "<lệnh psql>"` (vd `docker exec -i ketoan-db-1 psql -U ketoan -d ketoan_test`).
