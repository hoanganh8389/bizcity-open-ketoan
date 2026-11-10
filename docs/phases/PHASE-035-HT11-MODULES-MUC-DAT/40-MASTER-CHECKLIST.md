# PHASE-035 · 40 — Checklist: HT11 Modules & mức đạt
<!-- [2026-11-11 03:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — W0: việc S035-1..8 theo bước B1..B6; người rà Thuy2k -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Phân hệ:** he-thong · kho · mua-hang · danh-muc · ban-hang · quy · chung-tu · cong-no · tong-hop · thue · tai-san · bao-cao
> Ký hiệu ô cuối theo RULE-FLOW §4: ☐ chưa làm · 🟡 có mã + test · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ · ⏸ hoãn.

| Mã | Việc | Đợt | Ưu tiên | Test | Trạng thái |
|---|---|---|---|---|---|
| S035-1 | README (hiện trạng đọc mã), [00](00-MASTER-PLAN.md), checklist, bản mẫu [mockups/modules-muc-dat.html](mockups/modules-muc-dat.html) + ảnh `evidence/mockup-ht11-*.png` | W0 | P0 | không | ✅ 2026-11-11 |
| S035-2 | Chủ dự án duyệt D035-1..8, trả Q035-1..3; giao Thuy2k người rà (issue GitHub) | W0 | P0 | không | ⛔ chờ chủ |
| S035-3 | B1 — `docs/standard/modules.json` (`bizcity_modules@1`, 12 × 8, ô liệt kê việc hiện có); R-FLOW-10 vào RULE-FLOW; dòng `**Phân hệ:**` cho 34 README phase; `bang-viec.mjs` + `board.lib.mjs` phát `modules[]` (ghi đè `{key}` ở dòng việc); luật từ khoá → mặt | W1 | P0 | có (`tests/conformance/checks/flow/*` bản test của board) | ☐ |
| S035-4 | B2 — `apps/api/src/modules/system/modules.routes.ts`: `GET /api/v1/system/modules` (sổ + mức ô D035-2 + việc kèm cột + người giữ từ CLAIMS); `COPY docs/standard/modules.json` ở `docker/api.Dockerfile` (SC-REL-3); test `apps/api/test/system-modules.test.ts` | W1 | P0 | có | ☐ |
| S035-5 | B3 — `apps/web/src/features/system/ModulesPage.tsx` (HT11, `?xem=<key>`, lọc chưa đạt / người làm / ưu tiên, dùng `ScoreBar`); menu Hệ thống → *Modules & mức đạt*; mã màn HT11 trong SCREENS; tile *Phân hệ* ở `Ht10Summary` trỏ HT11 | W2 | P0 | có (ảnh evidence) | ☐ |
| S035-6 | B4 — SC-MODS-1 (chặn: phủ 100 % `phan-he/*` và mã màn `menu.ts`), SC-MODS-2 (việc có `modules[]`; baseline phase ≤ 034), SC-MODS-3 (tasks / tests / checks / docs / screens trong sổ tồn tại); fixture `repo-bad/` | W2 | P0 | có | ☐ |
| S035-7 | B6 — `docs/huong-dan/modules-muc-dat.md`; nếp rà hằng tuần (00 §5) vào `AGENTS.md` + RULE-FLOW; in HT11 cùng HT10 | W3 | P1 | không | ☐ |
| S035-8 | B5 — thẻ *Việc <phân hệ> hôm nay* (kho, mua hàng, bán hàng, quỹ, công nợ, thuế, tài sản, danh mục): component chung đọc `GET /system/diagnostics` lọc theo PC của phân hệ + `remedy.owner`; đặt ở trang chủ từng phân hệ | W3 | P1 | có | ☐ |

## Nhật ký

| Thời điểm | Ai | Việc |
|---|---|---|
| 2026-11-11 03:00 | Claude Code (phiên PHASE-032 → PHASE-035) | W0: đề bài chủ dự án (màn Modules & mức đạt giống HT10 cho mọi phân hệ, tự map tiến độ, Thuy2k rà). README, 00 (D035-1..8, Q035-1..3, 12 phân hệ × 8 mặt, R-FLOW-10, B1..B6), checklist, bản mẫu `mockups/modules-muc-dat.html` (96 ô đọc từ mã main df6149ab) + ảnh ba góc nhìn. |
