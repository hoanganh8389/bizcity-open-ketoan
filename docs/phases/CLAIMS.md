# Việc đang có người nhận (giữ chỗ)
<!-- [2026-11-03 09:55 PM Johnny Chu - Chu Hoàng Anh] FLOW — bảng giữ chỗ theo R-FLOW-1: dòng phải vào main trước khi có commit code của đợt -->

Luật: [R-FLOW](../rules/RULE-FLOW.md). **Đọc bản trên `origin/main`** (`git fetch` rồi `git show origin/main:docs/phases/CLAIMS.md`), không đọc bản trong nhánh của mình — bản trong nhánh có thể chưa phải bản cuối.

## Cách lấy một dòng

1. `git fetch --all --prune`, đọc bảng dưới trên `origin/main`.
2. Phạm vi của bạn **không được chồng** lên dòng "đang làm" nào (R-FLOW-3). Chồng thì dừng, báo người dùng.
3. Mở PR **chỉ tài liệu** thêm một dòng vào bảng; chờ merge vào `main`.
4. Chỉ sau đó mới tạo nhánh code. Đụng thứ dùng chung ([RULE-FLOW §3](../rules/RULE-FLOW.md)) thì thêm một PR tài liệu chốt thiết kế, cũng vào `main` trước.
5. PR cuối của đợt **xoá dòng** (lịch sử còn trong git) và ghi nhật ký vào checklist của phase (R-FLOW-6).

## Cột

| Cột | Ghi gì |
|---|---|
| Đợt | Mã phase và đợt, vd `PHASE-014 · W6 đợt 8` |
| Phạm vi | Đường dẫn thư mục / tệp sẽ sửa, cách nhau dấu `;`; dùng `/**` cho cả thư mục |
| Người nhận | Tài khoản GitHub và tên phiên, vd `hoanganh8389 (phiên Claude, tên-đề-tài)` — hai phiên cùng một tài khoản vẫn phải khác dòng |
| Nhánh | Tên nhánh code (nhánh có thể chưa tạo: ghi tên sẽ dùng) |
| Trạng thái | `đang làm` · `chờ merge` |
| Từ ngày | `YYYY-MM-DD`; quá 3 ngày không có commit thì coi là nhả (R-FLOW-6) |

## Đang có

| Đợt | Phạm vi | Người nhận | Nhánh | Trạng thái | Từ ngày |
|---|---|---|---|---|---|
| PHASE-014 · W6 đợt 4 — `ctx.meta` + route đối tượng (PR #50) | `packages/platform/src/core/actions.ts`; `apps/api/src/modules/partners/**`; `docs/contracts/BIZCITY-ACTION-v1.md`; `apps/api/test/action-meta.test.ts` | hoanganh8389 (phiên W6-meta) | `feat/phase-014-w6-meta` | chờ merge — đang xung đột `main`, phiên chủ dự án đang gộp | 2026-11-03 |
| PHASE-014 · FLOW-1 — script `nhan-viec.mjs` và phép kiểm SC-FLOW-1 / SC-FLOW-2 | `scripts/nhan-viec.mjs`; `tests/conformance/checks/flow/**`; `tests/conformance/lib/layers.mjs` | hoanganh8389 (phiên Claude, R-FLOW) | `feat/flow-nhan-viec` (tạo sau khi PR tài liệu này merge) | đang làm | 2026-11-03 |
