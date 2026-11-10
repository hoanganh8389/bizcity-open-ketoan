# PHASE-034 · 40 — Checklist
<!-- [2026-11-09 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — việc con S034-*, ca T034-*, log -->

Ký hiệu: ☐ chưa · 🟡 đang · ✅ xong · ⛔ chờ người ngoài nhóm.

## Việc

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S034-1 | README (hiện trạng đọc mã), [00](00-MASTER-PLAN.md), checklist | W0 | P0 | không | ✅ 2026-11-09 |
| S034-2 | Chủ dự án duyệt D034-1..10, trả Q034-1..5 | W0 | P0 | không | ✅ 2026-11-10 (chủ dự án: "tiếp", Q034-1..5 dùng phương án đề nghị) |
| S034-3 | B1 — `COPY docs/standard/nen-mong.json` vào `docker/api.Dockerfile`; SC-REL-3 + luật R-REL-11 + bản xấu `runtime-docs-bad/` | W1 | P0 | có | ✅ 2026-11-10 |
| S034-4 | B2 — `ScoreBar`, `ReadinessItem`; HT10 đọc `?xem=` cho 5 thẻ, thẻ mới hiện "sắp có"; thiếu tệp nguồn thì báo có Cách sửa (dựng lại ảnh) | W1 | P0 | có | ☐ |
| S034-5 | B3a — `GET /api/v1/system/gates`: chẩn đoán L1/L3/L5 + `FINDINGS_LIBRARY` + `INTAKE_CATALOG` + lượt gần nhất; thẻ Cổng (A, B, Guard, Chẩn đoán) | W2 | P0 | có | ☐ |
| S034-6 | B3b — trường `pillars` (và `pc`) cạnh `DiagCheck`, dòng findings, `.check.mjs`; `scripts/cong-kiem-json.mjs` (`--kiem`) sinh `cong-kiem.json` cho SC/DG/trigger/Cổng C giữ chỗ; SC-GATE-1 | W2 | P1 | có | ☐ sau khi hỏi phiên PHASE-033 về trường `pc` |
| S034-7 | B4 — `bo-may.json` (`bizcity_engines@1`, 13 dòng), `GET /api/v1/system/engines` (mốc đọc `bang-viec.json`), SC-ENG-1, thẻ Bộ máy | W3 | P1 | có | ☐ |
| S034-8 | B5a — `cong-cu-dev.json` (`bizcity_devtools@1`), SC-DEV-2 khớp `menu.ts`, bảng tiến độ T1..T6 | W4 | P1 | có | ☐ |
| S034-9 | B5b — tách `*Body` cho DEV01..09; thẻ con "Chạy ở đây" (`?cong-cu=DEVxx`), quyền `devtools:read`, nạp lười | W4 | P1 | có | ☐ sau khi S018-21 nhả `apps/web/src/phan-he/dev/**` |
| S034-10 | B6 — dòng tổng đầu màn, In cả năm thẻ, cập nhật `docs/huong-dan/tru-cot-muc-dat.md` | W5 | P2 | có | ☐ |
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
