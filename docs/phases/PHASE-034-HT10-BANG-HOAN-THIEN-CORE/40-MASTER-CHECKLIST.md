# PHASE-034 · 40 — Checklist
<!-- [2026-11-09 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — việc con S034-*, ca T034-*, log -->

Ký hiệu: ☐ chưa · 🟡 đang · ✅ xong · ⛔ chờ người ngoài nhóm.

## Việc

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S034-1 | README (hiện trạng đọc mã), [00](00-MASTER-PLAN.md), checklist | W0 | P0 | không | ✅ 2026-11-09 |
| S034-2 | Chủ dự án duyệt D034-1..10, trả Q034-1..5 | W0 | P0 | không | ✅ 2026-11-10 (chủ dự án: "tiếp", Q034-1..5 dùng phương án đề nghị) |
| S034-3 | B1 — `COPY docs/standard/nen-mong.json` vào `docker/api.Dockerfile`; SC-REL-3 + luật R-REL-11 + bản xấu `runtime-docs-bad/` | W1 | P0 | có | ✅ 2026-11-10 |
| S034-4 | B2 — `ScoreBar`, `ReadinessItem`; HT10 đọc `?xem=` cho 5 thẻ, thẻ mới hiện "sắp có"; thiếu tệp nguồn thì báo có Cách sửa (dựng lại ảnh) | W1 | P0 | có | ✅ 2026-11-10 |
| S034-5 | B3a — `GET /api/v1/system/gates`: chẩn đoán L1/L3/L5 + `FINDINGS_LIBRARY` + `INTAKE_CATALOG` + lượt gần nhất; thẻ Cổng (A, B, Guard, Chẩn đoán) | W2 | P0 | có | ✅ 2026-11-10 |
| S034-6 | B3b — `docs/standard/cong-kiem.json` (map họ mã → trụ cột, sửa tay) + `scripts/cong-kiem.mjs` sinh test / CI / trigger; SC-GATE-1; cổng Trigger và CI có sổ; mức mã đủ bốn ý (D034-11, [00 §3.2b](00-MASTER-PLAN.md)) | W2 | P1 | có | ✅ 2026-11-11 |
| S034-7 | B4 — `bo-may.json` (`bizcity_engines@1`, 13 dòng), `GET /api/v1/system/engines` (mốc đọc `bang-viec.json`), SC-ENG-1, thẻ Bộ máy | W3 | P1 | có | ✅ 2026-11-10 |
| S034-8 | B5a — `cong-cu-dev.json` (`bizcity_devtools@1`), SC-DEV-2 khớp `menu.ts`, bảng tiến độ T1..T6 | W4 | P1 | có | ✅ 2026-11-11 |
| S034-9 | B5b — tách `*Body` cho DEV01..09; thẻ con "Chạy ở đây" (`?cong-cu=DEVxx`), quyền `devtools:read`, nạp lười | W4 | P1 | có | ☐ sau khi S018-21 nhả `apps/web/src/phan-he/dev/**` |
| S034-10 | B6 — dòng tổng đầu màn (năm con số, bấm mở thẻ), cập nhật `docs/huong-dan/tru-cot-muc-dat.md` | W5 | P2 | có | ✅ 2026-11-11 |
| S034-12 | In cả năm thẻ (phụ lục báo cáo kiểm chuẩn) — tách từ S034-10 | W5 | P2 | có | ☐ |
| S034-11 | Q034-1 — đóng gói `scoreboard.json` của CI vào ảnh phát hành; thẻ Cổng hiện xanh / đỏ của SC-* | W5 | P2 | có | ☐ sau Q034-1 |

## Ca kiểm

| ID | Ca | Bước |
|---|---|---|
| T034-1 | Dựng ảnh Docker sạch, mở `/he-thong/tru-cot?xem=nen-mong`: thấy sáu năng lực lõi, không NOT_FOUND | B1 |
| T034-2 | Bỏ một `COPY` trong bản xấu thì SC-REL-3 đỏ, nêu đúng tệp | B1 |
| T034-3 | Thêm một `DiagCheck` mới không có `pillars` thì SC-GATE-1 báo; thẻ Cổng vẫn hiện mã đó ở nhóm "chưa gắn trụ cột" | B3 |
| T034-4 | Ghi `"status": "dat"` cho một bộ máy còn mốc ☐ thì SC-ENG-1 đỏ (bộ máy không có trường trạng thái tay; `status` suy ra từ mốc) | B4 |
| T034-5 | Thêm mục vào `menu.ts` mà không thêm dòng `cong-cu-dev.json` thì SC-DEV-2 đỏ | B5a |
| T034-6 | Người không có `devtools:read` mở thẻ Nhà phát triển: thấy bảng tiến độ, không thấy nút "Chạy ở đây", API devtools trả 403 | B5b |
| T034-7 | Chạy DEV07 trong HT10 và ở `/dev/toan-ven`: cùng kết quả, cùng một lượt trong `diagnostic_runs` | B5b |

## Nhật ký

- 2026-11-09 — W0: tài liệu, đề xuất D034-1..10, câu hỏi Q034-1..5. Đọc mã `origin/main` `c0ccd842`.
- 2026-11-10 — chủ dự án "tiếp": duyệt D034-1..10, Q034-1..5 theo phương án đề nghị; giữ chỗ B1 (S034-3). D034-2 đổi: bỏ `RUNTIME_DOCS`, SC-REL-3 tự dò từ mã.
- 2026-11-10 — B1 (S034-3): `COPY docs/standard/nen-mong.json` vào ảnh api; SC-REL-3 (`tests/conformance/checks/release/runtime-docs.check.mjs`) + bản xấu `runtime-docs-bad/` (2 phát hiện mong đợi). Trên repo trước khi sửa, SC-REL-3 bắt đúng 1 lỗi: `version.ts:38` đọc `nen-mong.json` mà ảnh không có. Nhả dòng giữ chỗ B1.
- 2026-11-10 — B2 (S034-4): HT10 năm thẻ (`?xem=` tieu-chi · nen-mong · cong-kiem · bo-may · nha-phat-trien), `readiness.tsx` (`ScoreBar`, `ReadinessItem`, `SourceError`, `ComingSoon`); thiếu tệp nguồn thì báo Cách sửa; hướng dẫn `tru-cot-muc-dat.md` thêm mục Năm thẻ. Nhả dòng giữ chỗ B2.
- 2026-11-10 — B3a (S034-5): `GET /api/v1/system/gates` (`gates.routes.ts`, `bizcity_gates@1`): chín nhóm cổng, năm nhóm có sổ chạy được (A, B, Guard, L, chẩn đoán + lượt gần nhất của đơn vị), bốn nhóm giữ chỗ (C, khoá kỳ, trigger, CI); `GatesBoard.tsx`; test `gates.test.ts` 4/4. Trường `pc` của D034-4 đã có sẵn là `DiagCheck.closeRef` (PHASE-032 B2c-2) — B3b chỉ còn `pillars` và test. Nhả dòng giữ chỗ B3a.
- 2026-11-10 — B4 (S034-7): `docs/standard/bo-may.json` (`bizcity_engines@1`, 13 bộ máy, 70 mốc); `GET /api/v1/system/engines` (`engines.routes.ts`, mốc đọc `bang-viec.json`, xong 1 · chờ đủ tín hiệu ½); ảnh api chép hai tệp (SC-REL-3 xanh); SC-ENG-1 + bản xấu `engines-bad/` (10 phát hiện mong đợi); `EnginesBoard.tsx`; test `engines.test.ts` 3/3. E04 Đánh số chưa có mốc nào trong phase — hiện "chưa có mốc". Nhả dòng giữ chỗ B4.
- 2026-11-11 — B5a (S034-8): `docs/standard/cong-cu-dev.json` (`bizcity_devtools@1`), tiêu chí T1..T6 SINH từ repo (`scripts/cong-cu-dev.mjs`, hàm chung `tests/conformance/checks/devtools/devtools.lib.mjs`); SC-DEV-2 + bản xấu `devtools-bad/` (5 phát hiện); `GET /api/v1/system/dev-tools`; `DevToolsBoard.tsx`; test 2/2. Kết quả lần đầu: T4 0/9 (mọi màn dùng chung hướng dẫn ban-dieu-tra), T5 4/9, T3 thiếu ở DEV02 / DEV03 / DEV09, DEV08 không có API, DEV09 chỉ bản cài một đơn vị. Nhả dòng giữ chỗ B5a.
- 2026-11-11 — B6 (S034-10): `Ht10Summary.tsx` — dòng tổng năm con số ở đầu HT10, đọc lại năm API đã có (cùng khoá cache với thẻ), bấm mở thẻ; không API mới. "In cả năm thẻ" tách thành S034-12. Nhả dòng giữ chỗ B6.
- 2026-11-11 — B3b (S034-6, D034-11): `docs/standard/cong-kiem.json` (`map[]` 36 dòng họ mã → trụ cột; `generated` do `scripts/cong-kiem.mjs` sinh: 43 mã chẩn đoán, 61 mã cổng A/B/L, test của mã, 139 check CI (71 có ca tự kiểm), 102 trigger); SC-GATE-1 + bản xấu `gates-bad/` (5 phát hiện); `GET /system/gates` có `pillars`, `tests`, `score`, cổng Trigger và CI có sổ; `GatesBoard` thêm cột Test / Trụ cột; dòng tổng đọc `score`. Test gates 5/5. Nhả dòng giữ chỗ B3b.
