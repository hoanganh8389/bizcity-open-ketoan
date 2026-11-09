# Thư viện `core.khoan-muc` — Khoản mục chi phí
<!-- [2026-11-09 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-52: hướng dẫn thư viện khoản mục -->

Khuôn: [`bizcity_library@1`](../../docs/contracts/BIZCITY-LIBRARY-v1.md) · Loại: `code-list` · Người duyệt nội dung: kế toán trưởng.

## Dùng làm gì

Cây khoản mục chi phí chuẩn (cha – con). Mỗi mục là **một khoản mục**: mã (`CPBT01`), tên, `group` = khoản mục gốc của nhánh (`CPBT`), `payload.parentCode` (null ở gốc) và `payload.level` (gốc = 1). Dùng để chọn khoản mục khi lập chứng từ chi phí và để kiểm mã khoản mục nhập từ ngoài (POS, ERP, plugin): mã lạ → `LIB-UNKNOWN-001`.

```http
GET  /api/v1/libraries/core.khoan-muc/items?group=CPBT          các khoản mục con của CPBT
POST /api/v1/libraries/core.khoan-muc/validate  { "input": "CPBT01" }
```

Thư viện **không** thay danh mục khoản mục của đơn vị (đơn vị thêm khoản mục riêng ở danh mục ACC24) và **không** mang số tài khoản.

## Trạng thái

**Chưa duyệt.** Nguồn là danh mục mẫu của công ty cung cấp (`db/seeds/khoan-muc.jsonl`, chép vào `sources/`); mọi mục `verified: false` cho tới khi kế toán trưởng đối chiếu. Tên một số mục còn lỗi chính tả của nguồn — sửa ở nguồn rồi sinh lại, không sửa tay `library.json`.

## Cập nhật

1. Sửa `sources/khoan-muc.jsonl` (giữ dòng tiêu đề `_bang`, `_cot`).
2. `node libraries/core.khoan-muc/build.mjs`. Không sửa tay `library.json`.
3. Khoản mục ngừng dùng: không xoá dòng; đặt `is_active: false` (thành `deprecated`). Khoản mục cha phải có trong nguồn.
4. `npx bizcity library diff core.khoan-muc` và `node tests/conformance/selfcheck.mjs --only SC-LIB` phải ĐẠT.
