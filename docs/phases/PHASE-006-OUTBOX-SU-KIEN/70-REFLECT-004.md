# PHASE-006 · 70 — Phản tư PHASE-004 và nợ chuyển sang

> Nguồn: [PHASE-004 · 40-MASTER-CHECKLIST](../PHASE-004-MOT-CUA-GHI-SO/40-MASTER-CHECKLIST.md).

## 1. PHASE-004 đã làm gì (2026-10-30)

| Mảng | Kết quả | Bằng chứng |
|---|---|---|
| Một cửa ghi | `eventStore` cho phiếu tay, kết chuyển, khấu hao, giá vốn; 0 lời gọi `ledgerService` ngoài Kernel cửa nạp | SC-KERNEL-3 block |
| Sổ không đổi | cùng 11 tệp test trên code cũ / mới: 194 ô sổ cái trùng | [T004-1](../PHASE-004-MOT-CUA-GHI-SO/evidence/T004-1-2026-10-30.md) |
| Phiên bản | kết chuyển, giá vốn có `posted_version` + `posting_log`; `0038` điền dữ liệu cũ | DG-EVENT-4 100 |

## 2. Điều rút ra

| # | Điều | Áp dụng ở 006 |
|---|---|---|
| R1 | Một cửa ghi làm điểm phát sự kiện thành **một chỗ**: `markPosted` / `cancel` của `eventStore` + cửa nạp | sự kiện `bizcity.ledger.*` chỉ cần gắn ở 2 tệp Kernel |
| R2 | So "trước / sau" bằng cùng kịch bản trên hai CSDL sạch bắt được thay đổi ngầm | 006 không đổi sổ (chỉ thêm outbox); kiểm bằng vitest đầy đủ + bất biến sau mỗi tệp |
| R3 | Test dùng CSDL chung tích dữ liệu qua nhiều lần chạy: truy vấn "toàn CSDL" trong test làm test chậm và sai (lô đầu bị việc cũ chiếm) | dispatcher / đồng hồ có tuỳ chọn lọc theo đơn vị, test chỉ đụng đơn vị của mình |
| R4 | Chú thích trong ca tự kiểm có thể làm check "đạt nhầm" (fixture ghi chữ "Idempotency-Key" trong chú thích) | check đọc thân hàm — viết fixture không nhắc từ khoá đang kiểm |

## 3. Nợ chuyển sang

| # | Nợ | Tới |
|---|---|---|
| N004-1 | `posting.policy-version` (C-9) — nay ghi được ở một chỗ (`eventStore.markPosted` + cửa nạp) | PHASE-005 |
| N004-2 | Công cụ MCP ghi đi `eventStore` / cửa nạp | PHASE-009 |
| N006-1…5 | Giới hạn của chính 006 | [00-MASTER-PLAN §2](00-MASTER-PLAN.md) |
