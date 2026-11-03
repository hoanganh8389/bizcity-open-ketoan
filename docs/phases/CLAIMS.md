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
<!-- [2026-11-03 10:06 PM Johnny Chu - Chu Hoàng Anh] FLOW — giữ chỗ PHASE-027 CK-1 / CK-2 / CK-3 và S024-16 (phiên core-ke-toan); `tests/conformance/fixtures/expect.json` và `baseline.json` dùng chung với FLOW-1 — mỗi PR chỉ thêm dòng của check mình -->

| Đợt | Phạm vi | Người nhận | Nhánh | Trạng thái | Từ ngày |
|---|---|---|---|---|---|
| PHASE-014 · W6 đợt 4 — `ctx.meta` + route đối tượng (PR #50) | `packages/platform/src/core/actions.ts`; `apps/api/src/modules/partners/**`; `docs/contracts/BIZCITY-ACTION-v1.md`; `apps/api/test/action-meta.test.ts` | hoanganh8389 (phiên W6-meta) | `feat/phase-014-w6-meta` | chờ merge — đang xung đột `main`, phiên chủ dự án đang gộp | 2026-11-03 |
| PHASE-014 · FLOW-1 — script `nhan-viec.mjs` và phép kiểm SC-FLOW-1 / SC-FLOW-2 | `scripts/nhan-viec.mjs`; `tests/conformance/checks/flow/**`; `tests/conformance/lib/layers.mjs` | hoanganh8389 (phiên Claude, R-FLOW) | `feat/flow-nhan-viec` (tạo sau khi PR tài liệu này merge) | đang làm | 2026-11-03 |
| PHASE-027 · CK-1 — công cụ kiểm cho dev: `bizcity event check / flow check / explain / module accounting-check / skills install`, API đối chiếu kho ↔ sổ cái, tự chẩn đoán `INVENTORY_LEDGER_MISMATCH`, ca F22-STK-11 | `packages/cli/**`; `skills/**`; `examples/pos-mini/**`; `scripts/do-bang-chung-core.mjs`; `scripts/uoc-tinh-tiet-kiem.mjs`; `apps/api/src/modules/inventory/inventory-report.*`; `packages/kernel/src/modules/inventory/inventory.diagnostics.ts`; `packages/kernel/src/modules/review/fault-catalog.ts`; `tests/conformance/scenarios/f22-evidence.json`; `tests/conformance/diagnostics/balance.diag.mjs`; `templates/starter-module/.bizcity/**`; `tests/conformance/lib/render.mjs`; `.github/workflows/ci.yml`; `.github/workflows/conformance.yml` | hoanganh8389 (phiên Claude, core-ke-toan) | `feat/core-ke-toan-ck1` (tạo sau khi PR giữ chỗ này và PR chốt thiết kế merge) | đang làm | 2026-11-03 |
| PHASE-027 · CK-2 — phép kiểm tài liệu ↔ mã SC-DOC-4 (đường dẫn), SC-DOC-5 (route), SC-DOC-6 (mục menu có hướng dẫn, nợ cũ vào baseline) | `tests/conformance/checks/docs/doc-drift.check.mjs`; `tests/conformance/fixtures/repo-bad/docs/**`; `tests/conformance/fixtures/repo-bad/apps/web/src/phan-he/demo/menu.ts` | hoanganh8389 (phiên Claude, core-ke-toan) | `feat/core-ke-toan-ck2` (tạo sau khi PR giữ chỗ này và PR chốt thiết kế merge) | đang làm | 2026-11-03 |
| PHASE-027 · CK-3 — SC-SEC-5 (bí mật không có giá trị mặc định trong mã); bỏ mật khẩu mặc định của công cụ dữ liệu mẫu | `tests/conformance/checks/security/security.check.mjs`; `packages/platform/src/core/security/tool-password.ts`; `apps/api/src/modules/catalog/catalog.routes.ts`; `apps/api/src/phan-he/mua-hang/demo.ts`; `apps/api/vitest.config.ts`; `.env.example` | hoanganh8389 (phiên Claude, core-ke-toan) | `feat/core-ke-toan-ck3` (tạo sau khi PR giữ chỗ này và PR chốt thiết kế merge) | đang làm | 2026-11-03 |
| PHASE-024 · S024-16 — SC-ITEM-1..3 (sổ khoá theo `item_id`, không theo mã; luật định khoản không đọc `skuInfo`) | `tests/conformance/checks/item/**`; `tests/conformance/fixtures/repo-bad/db/migrations/0005_khoa_theo_ma.sql`; `tests/conformance/fixtures/repo-bad/packages/kernel/src/modules/posting/**` | hoanganh8389 (phiên Claude, core-ke-toan) | `feat/phase-024-s024-16-sc-item` (tạo sau khi PR giữ chỗ này và PR chốt thiết kế merge) | đang làm | 2026-11-03 |
