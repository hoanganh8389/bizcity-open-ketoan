# Thư viện `vn.can-cu-phap-ly` — Căn cứ pháp lý
<!-- [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49a (B3a): hướng dẫn thư viện căn cứ pháp lý -->

Khuôn: [`bizcity_library@1`](../../docs/contracts/BIZCITY-LIBRARY-v1.md) · Loại: `code-list` · Người duyệt nội dung: kế toán trưởng.

## Dùng làm gì

Mỗi mục là **một văn bản** (luật, nghị định, thông tư, nghị quyết, quyết định) làm căn cứ cho thư viện, luật kiểm và mã phát hiện, kèm số hiệu, cơ quan ban hành, ngày hiệu lực, văn bản sửa đổi / thay thế, các điều khoản đã trích. Thêm một mục `noi-bo` cho **quy ước phần mềm** (luật kỹ thuật của Core, không trích văn bản nhà nước).

- **Mã** là id của kho căn cứ, vd `vn.law.88-2015-qh13`, `vn.circular.99-2025-tt-btc`.
- **Bí danh**: số hiệu (`88/2015/QH13`) và khoá cũ của `LEGAL_BASES` (`LKT`, `TT99`, `ND123`, `NOI-BO`…). `basis[].key` của mọi thư viện dùng mã hoặc bí danh; bộ kiểm SC-LIB-1 chặn khoá không có ở đây.
- Văn bản bị thay thế ở trạng thái **ngừng dùng**, trỏ `replacedBy` sang văn bản thay (vd Thông tư 200/2014 → Thông tư 99/2025).

## Trạng thái

**Mọi văn bản `verified: false`.** Nguồn là kho `packages/vn-rulepacks/registry/legal-sources.json`, chép từ `docs/can-cu`; chưa người có trách nhiệm nào rà văn bản gốc (sổ ghi `review.status = pending`). Kế toán trưởng xác nhận cho đơn vị mình ở **HT14 → Chi tiết → Căn cứ** (bằng chứng `core.library.attest`) — xác nhận của đơn vị không đổi trạng thái duyệt của thư viện.

## Cập nhật

1. Sửa **sổ nguồn** `packages/vn-rulepacks/registry/legal-sources.json` (thêm văn bản, đổi hiệu lực, `replaces`) — không sửa tay `library.json`.
2. Thêm khoá mới ở `LEGAL_BASES` thì khoá phải khớp được số hiệu một văn bản trong sổ (hoặc khai ở `MANUAL` trong `build.mjs`), nếu không script dừng.
3. `node libraries/vn.can-cu-phap-ly/build.mjs` — nội dung đổi thì tự lên bản.
