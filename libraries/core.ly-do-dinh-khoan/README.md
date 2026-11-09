# Thư viện `core.ly-do-dinh-khoan` — Lý do nghiệp vụ (định khoản)
<!-- [2026-11-09 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-52: hướng dẫn thư viện lý do định khoản -->

Khuôn: [`bizcity_library@1`](../../docs/contracts/BIZCITY-LIBRARY-v1.md) · Loại: `code-list` · Người duyệt nội dung: kế toán trưởng.

## Dùng làm gì

Mỗi mục là **một lý do nghiệp vụ** của chứng từ thu, chi, nhập, xuất (`reasonCode`): mã, tên, `group` = loại (Thu / Chi / Nhập / Xuất), `payload.kind` (`receipt` / `payment` / `in` / `out`), `payload.cashflowCode` (mã dòng tiền, null nếu không gắn) và `payload.flags` (cờ như `postToLedger`, `default`). Dùng để chọn và kiểm `reasonCode` mà module / app gửi kèm chứng từ ([POSTING-TEMPLATE §7](../../docs/contracts/BIZCITY-POSTING-TEMPLATE-v1.md)): mã lạ → `LIB-UNKNOWN-001`.

```http
GET  /api/v1/libraries/core.ly-do-dinh-khoan/items?group=Chi
POST /api/v1/libraries/core.ly-do-dinh-khoan/validate  { "input": "CMH" }
```

**Không có số tài khoản.** Tài khoản đối ứng, doanh thu, chi phí của lý do do chính sách hạch toán và gói định khoản quyết qua `AccountResolver` (bốn câu không thương lượng, câu 4); thư viện không sinh bút toán.

## Trạng thái

**Chưa duyệt.** Nguồn là danh mục mẫu của công ty (`db/seeds/ly-do.jsonl`, chép vào `sources/`; ba cột tài khoản bị bỏ). Mọi mục `verified: false`.

## Cập nhật

1. Sửa `sources/ly-do.jsonl` (giữ dòng tiêu đề).
2. `node libraries/core.ly-do-dinh-khoan/build.mjs`. Không sửa tay `library.json`.
3. Lý do hết dùng: không xoá dòng; đặt `is_active: false`.
4. `npx bizcity library diff core.ly-do-dinh-khoan` và `node tests/conformance/selfcheck.mjs --only SC-LIB` phải ĐẠT.
