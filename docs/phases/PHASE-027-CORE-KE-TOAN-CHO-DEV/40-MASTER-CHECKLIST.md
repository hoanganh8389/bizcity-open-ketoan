# PHASE-027 · 40 — Checklist
<!-- [2026-11-03 10:14 PM Johnny Chu - Chu Hoàng Anh] PHASE-027 — việc con S027-*, nối với dòng giữ chỗ CK-1 / CK-2 / CK-3 ở CLAIMS.md -->

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S027-1 | Tài liệu W0: README, 00, checklist; ADR-0023; dòng phase ở `docs/phases/README.md` | W0 | P0 | — | 🟡 2026-11-03: PR tài liệu, chờ merge |
| S027-2 | **CK-1** công cụ kiểm (§6 của 00): `event check`, `flow check [--to]`, `explain`, `module accounting-check` (AC-1..6), `skills install`; bộ skill cho AI; ví dụ POS mini; API `GET /api/v1/inventory/reconcile` + mã tự chẩn đoán `INVENTORY_LEDGER_MISMATCH` + ca F22 (D027-4); hướng dẫn `docs/core/` viết theo khung 0–VIII (D027-1); README các gói | CK-1 | P0 | có | ☐ chờ S027-1 merge; mã đã viết ngoài `main`, cắt lại theo phạm vi dòng CK-1 |
| S027-3 | **CK-2** SC-DOC-4 (đường dẫn), SC-DOC-5 (route), SC-DOC-6 (mục menu có hướng dẫn, nợ cũ vào baseline) — thiết kế ở [RULE-QUALITY-GATE](../../rules/RULE-QUALITY-GATE.md) | CK-2 | P1 | có | 🟡 2026-11-04: `tests/conformance/checks/docs/doc-drift.check.mjs` — SC-DOC-4 và SC-DOC-5 chặn (repo thật 0 phát hiện), SC-DOC-6 bánh cóc (194 nợ cũ vào baseline, màn mới thiếu hướng dẫn thì đỏ); ca tự kiểm `fixtures/repo-bad` <!-- [2026-11-04 12:14 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — S027-3 có mã --> |
| S027-4 | **CK-3** SC-SEC-5; bỏ mật khẩu mặc định của công cụ dữ liệu mẫu (`PURCHASE_SEED_PASSWORD`) | CK-3 | P0 | có | ☐ chờ PR chốt thiết kế merge |
| S027-5 | Q027-5 `SEED_ADMIN_PASSWORD` | — | P1 | — | ⛔ chủ dự án quyết |
| S027-6 | Q027-1 giải thích theo vai + SC-ERR-2 | — | P1 | — | ☐ đề xuất |
| S027-7 | Q027-2 sổ tay theo action `bizcity_sotay@1` + SC-SOTAY-1..5, làm thử `mua-hang` | — | P1 | — | ☐ đề xuất |
| S027-8 | Q027-3 quy tắc cho skill | — | P2 | — | ☐ đề xuất |
| S027-9 | Q027-4 cổng phát hành (CI xanh, bảo vệ `main`, SBOM) | — | P1 | — | ☐ đề xuất, thuộc PHASE-001 0.2 |

Liên quan, không thuộc phase này: SC-ITEM-1..3 là S024-16 ([PHASE-024](../PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md)).

## Ca bằng chứng

| Ca | Đạt khi |
|---|---|
| T027-1 | `event check` một chứng từ bán mẫu: L1–L5 PASS với máy chủ; không máy chủ thì SKIP có lý do, mã thoát 2 |
| T027-2 | `module accounting-check` trên module mẫu nguyên bản PASS; thêm ba lỗi (tự tính giá vốn, số tài khoản, UPDATE sổ) → FAIL đúng dòng |
| T027-3 | đối chiếu kho ↔ sổ cái: chưa tính giá vốn → `uncosted`; tính xong → khớp; phiếu kho không gắn mặt hàng → `no_product` |
| T027-4 | gặp loại chứng từ sản xuất → SKIP "cổng chưa mở" (ADR-0023) |

## Log

- 2026-11-03: mở phase (W0). Nguồn: tài liệu làm việc "Kiện toàn framework v2"; đối chiếu với `main` 22:00. Chủ dự án quyết D027-1 (một khung trụ cột 0–VIII), D027-2 (giá vốn mặc định), D027-3 (ADR-0023), D027-4 (API đối chiếu).
