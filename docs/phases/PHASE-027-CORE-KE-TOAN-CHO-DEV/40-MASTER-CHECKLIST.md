# PHASE-027 · 40 — Checklist
<!-- [2026-11-03 10:14 PM Johnny Chu - Chu Hoàng Anh] PHASE-027 — việc con S027-*, nối với dòng giữ chỗ CK-1 / CK-2 / CK-3 ở CLAIMS.md -->

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S027-1 | Tài liệu W0: README, 00, checklist; ADR-0023; dòng phase ở `docs/phases/README.md` | W0 | P0 | — | ✅ 2026-11-03 (tài liệu W0 đã vào `main`) |
| S027-2 | **CK-1** công cụ kiểm (§6 của 00): `event check`, `flow check [--to]`, `explain`, `module accounting-check` (AC-1..6), `skills install`; bộ skill cho AI; ví dụ POS mini; API `GET /api/v1/inventory/reconcile` + mã tự chẩn đoán `INVENTORY_LEDGER_MISMATCH` + ca F22 (D027-4); hướng dẫn `docs/core/` viết theo khung 0–VIII (D027-1); README các gói | CK-1 | P0 | có | ✅ 2026-11-04 (nhánh `feat/core-ke-toan-ck1` đã vào `main`) |
| S027-3 | **CK-2** SC-DOC-4 (đường dẫn), SC-DOC-5 (route), SC-DOC-6 (mục menu có hướng dẫn, nợ cũ vào baseline) — thiết kế ở [RULE-QUALITY-GATE](../../rules/RULE-QUALITY-GATE.md) | CK-2 | P1 | có | ✅ 2026-11-04 (nhánh `feat/core-ke-toan-ck2` đã vào `main`) |
| S027-4 | **CK-3** SC-SEC-5; bỏ mật khẩu mặc định của công cụ dữ liệu mẫu (`PURCHASE_SEED_PASSWORD`) | CK-3 | P0 | có | ✅ 2026-11-07 (SC-SEC-5 chặn; mật khẩu công cụ qua `checkToolPassword`, chưa đặt `PURCHASE_SEED_PASSWORD` thì tắt; T027-SEC-1, 2, 4) |
| S027-5 | Q027-5 `SEED_ADMIN_PASSWORD` | — | P1 | — | ✅ 2026-11-07 đợt 1 (`initialAdminPassword`: bỏ trống thì tự sinh 16 ký tự, in một lần; T027-SEC-3). Đợt 2: `docker-compose.yml`, `scripts/cai-nhanh.sh` bỏ mặc định `Admin@123` khi PHASE-018 W6 nhả |
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
- 2026-11-04: CK-1 vào `main` theo phạm vi dòng giữ chỗ (đã mở rộng ở #77). Hướng dẫn viết lại theo khung 0–VIII (D027-1), bỏ khung bảy trụ cột; trạng thái C2 theo `main` (sổ, sổ kho, giá vốn đã theo `item_id` sau 0066 và G2). Bỏ một dòng CK-3 trùng trong CLAIMS.md (gộp hai lần cùng một dòng làm SC-FLOW-1 trên `main` đỏ). Nhả dòng giữ chỗ CK-1 (R-FLOW-6).
- 2026-11-07: sửa trạng thái cũ (S027-1..3 đã vào `main`). Chủ dự án: "code phase 27" — giữ chỗ CK-3 + Q027-5 làm một PR smallwin: SC-SEC-5, bỏ mật khẩu viết cứng `PURCHASE_SEED_PASSWORD` (công cụ tắt kèm hướng dẫn khi chưa đặt biến), `SEED_ADMIN_PASSWORD` không có giá trị mặc định trong mã (seed tự sinh và in một lần). Cài nhanh bằng docker không đổi trải nghiệm.
- 2026-11-07: CK-3 + Q027-5 đợt 1 xong — SC-SEC-5 (bắt 3 chỗ trên repo thật, sửa xong còn 0; ca mẫu repo-bad bắt 1, không bắt `HOST` và mặc định rỗng); `core/security/tool-password.ts`; seed tự sinh mật khẩu quản trị. T027-SEC-1..4 xanh, phá thử 3 lần (bỏ chặn khi chưa đặt biến, trả lại `Admin@123`, bỏ lọc tên biến) đều bị bắt. Biến khai ở DEPLOY D-10. Nhả dòng giữ chỗ.
