# PHASE-034 — HT10 thành bảng hoàn thiện của Core: Nền móng chạy được · Cổng & bộ kiểm · Bộ máy (engine) · Nhà phát triển
<!-- [2026-11-09 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — W0: đề bài chủ dự án 2026-11-09 — thẻ Nền móng báo NOT_FOUND; đưa cổng / validator, engine, công cụ nhà phát triển về HT10 cùng một cách đo mức đạt. Số phase tạm (PHASE-033 đã dùng cho Sẵn sàng khoá kỳ); ai merge trước lấy số trước -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Việc lộ trình:** — (mở rộng PHASE-026 S026-15 SC-PILLAR-1 và PHASE-029 S029-18 engine bảng điểm, S029-30 thẻ Nền móng)
> **Checklist công bố:** —
> **Trạng thái:** ✅ **Xong 2026-11-11** — B1 · B2 · B3a · B3b (D034-11) · B4 · B5a · B5b (D034-12) · B6 · In cả năm thẻ đã merge. Còn một việc chờ: S034-11 (kết quả CI vào ảnh phát hành, sau Q034-1 — CI GitHub đang khoá). Tuỳ chọn khi S018-21 nhả `apps/web/src/phan-he/dev/**`: tách `*Body` để bỏ tiêu đề lồng ở "Chạy ở đây". Xem [40](40-MASTER-CHECKLIST.md).
> **Tệp:** [00 — Kế hoạch & thiết kế](00-MASTER-PLAN.md) · [40 — Checklist](40-MASTER-CHECKLIST.md)

## Đề bài (chủ dự án, 2026-11-09)

Màn **HT10 Trụ cột & mức đạt** đã theo dõi được độ hoàn thiện theo trụ cột. Còn thiếu:

1. Thẻ **Nền móng** chưa chạy. Bản cài báo *"Không tìm thấy bản đồ nền móng (docs/standard/nen-mong.json không có trong bản cài)"*.
2. **Bộ cổng và validator** nên thành một thẻ riêng, đặt sau Nền móng.
3. **Các engine** (Inventory Engine, Document Engine, …) cũng nên có mặt trên màn này.
4. Thêm thẻ **Nhà phát triển**: gom mọi màn trong phân hệ Nhà phát triển (Toàn vẹn, Sự kiện, Ghi sổ, …) về đây. Thẻ này vừa theo dõi tiến độ hoàn thiện của từng công cụ, vừa chạy được công cụ ngay trên đó.

## Trả lời ngắn

| Câu hỏi | Trả lời | Ở đâu |
|---|---|---|
| Vì sao thẻ Nền móng lỗi? | `docker/api.Dockerfile` chép `tru-cot.json` và `bizcity-standard.json` vào ảnh, **không chép `nen-mong.json`**. `version.ts` đọc tệp lúc chạy; không có tệp thì trả `null`, rồi API báo NOT_FOUND. Chạy bằng `npm run dev` thì đúng, vào Docker thì hỏng. Không có phép kiểm nào bắt lỗi này | [00 §2](00-MASTER-PLAN.md#2-nền-móng-sửa-lỗi-và-chặn-tái-phát), D034-1 |
| Sửa một dòng có đủ không? | Không. Phải sửa **loại lỗi** chứ không chỉ một tệp: phép kiểm **SC-REL-3** bắt *mọi tệp `docs/**` mà mã đọc lúc chạy phải có `COPY` trong Dockerfile*. Thẻ Cổng / Bộ máy / Nhà phát triển sẽ thêm tệp mới, và đúng lỗi này sẽ lặp lại | D034-1, S034-2 |
| Cổng & bộ kiểm lấy dữ liệu ở đâu? | **Từ chính sổ đăng ký trong mã**, không gõ tay: registry chẩn đoán (`listDiagnostics()`, 42 mã), `INTAKE_CATALOG` / `FINDINGS_LIBRARY`, bộ kiểm CI (85 `SC-*`, 47 `DG-*`). Phần chỉ có ở CI được một script sinh ra thành `cong-kiem.json`. Mỗi mã kiểm có cổng, lớp, lúc chạy, trụ cột nó giữ, có `remedy` không, có test không | [00 §3](00-MASTER-PLAN.md#3-thẻ-cổng--bộ-kiểm), D034-3 / D034-4 |
| Có lập thêm một sổ phép kiểm mới không? | **Không.** Thẻ này là *mặt xem* của sổ đăng ký phép kiểm mà PHASE-032 · 60 và PHASE-033 (PC-001..023) đã dùng. Một mã kiểm chỉ khai một chỗ | D034-4 |
| Engine theo dõi thế nào? | Sổ `bo-may.json` (`bizcity_engines@1`) ghi 13 bộ máy (Ghi sổ, Inventory, Document SDK, Workflow, Phân quyền, Policy Registry, Kiểm chuẩn, …). Mỗi bộ máy có hợp đồng, đường dẫn mã, cổng nó phát mã, test, và **mốc** trỏ vào mã việc `S0xx-*`. % hoàn thiện **tính từ `bang-viec.json`**, không ai gõ | [00 §4](00-MASTER-PLAN.md#4-thẻ-bộ-máy-engine), D034-5 |
| Thẻ Nhà phát triển "chạy trên đó" nghĩa là gì? | Mỗi công cụ DEV01..09 là một **thẻ con nhúng đúng màn đang có** (dùng lại component, không viết lại). Phía trên là dòng mức hoàn thiện của công cụ: có API, có test, có hướng dẫn, nguồn dữ liệu đã bật. Ai không có quyền `devtools:read` thì chỉ thấy bảng tiến độ | [00 §5](00-MASTER-PLAN.md#5-thẻ-nhà-phát-triển), D034-6 / D034-7 |
| Có cho tích "đạt" trên giao diện không? | **Không** (R-CONT-7). Cả năm thẻ chỉ đọc. Mức đạt đi theo tín hiệu chạy được, và mỗi sổ có phép kiểm `SC-*` chặn ghi "đạt" khi còn tín hiệu "chưa có", giống SC-CORE-1 | D034-8 |
| Làm theo thứ tự nào? | **Bước thắng nhỏ** (SMALLWIN), mỗi bước một PR: B1 sửa Nền móng → B2 khuôn chung → B3 Cổng → B4 Bộ máy → B5 Nhà phát triển → B6 dòng tổng ở đầu màn | [00 §7](00-MASTER-PLAN.md#7-bước-thắng-nhỏ), [40](40-MASTER-CHECKLIST.md) |

## Hiện trạng đọc mã (`origin/main` `c0ccd842`, 2026-11-09)

| Phần | Có | Thiếu |
|---|---|---|
| HT10 | `apps/web/src/features/system/PillarsPage.tsx`: 2 thẻ (`?xem=` rỗng · `nen-mong`). Thẻ Tiêu chí đọc `GET /api/v1/system/pillars` ← `tru-cot.json` (`bizcity_pillars@1`, 9 khối: 3 nền móng + 6 trụ cột). Thẻ Nền móng ở `FoundationsBoard.tsx` có 5 góc nhìn, đọc `GET /api/v1/system/foundations` ← `nen-mong.json` (`bizcity_foundations@1`) | `nen-mong.json` **không có trong ảnh Docker**; SC-PILLAR-1 (S026-15) chưa có tệp kiểm; mức của `tru-cot.json` còn ghi tay (`scripts/tru-cot-md.mjs` chỉ sinh .md) |
| Nạp tệp lúc chạy | `packages/platform/src/core/version.ts` có `readJson('docs/standard/…')` cho STANDARD, PILLARS, FOUNDATIONS | Không có danh sách "tệp `docs/` mã đọc lúc chạy", nên không có gì đối chiếu với Dockerfile |
| Chẩn đoán trong app | 42 mã `DiagCheck`, ba lớp L1 / L3 / L5 (`packages/platform/src/system/diagnostics.ts` + `*.diagnostics.ts` ở Kernel). Chạy ở `health/ready`, `GET /system/diagnostics`, trước khoá kỳ (R-DIAG-4), lịch đêm `core.conformance-nightly`. Kết quả lưu ở `diagnostic_runs` | Không có trường *trụ cột nó giữ*; không có màn xem theo cổng; mã chỉ thấy ở DEV07 dưới dạng một danh sách phẳng |
| Cổng A | `POST /api/v1/{products,partners,accounts}/validate`, mã ACC-* / PART-* / ITEM-* (`packages/contracts/src/catalog-hint.ts`) | không có |
| Cổng B | `packages/kernel/src/modules/intake/preflight.ts` gồm L1 hình dạng, L2 số học, L3 danh mục, L4 / L4b nghiệp vụ và chính sách; L5 hạch toán thử (`trial-posting.ts`). 37 mã `IN-*` | không có |
| Commit Guard | `intake/guard.ts` (IN-GUARD-001, băm cả `policyRefs` từ PHASE-031) | không có |
| Cổng C | ADR-0021 / ADR-0033 chốt họ mã `CT-*` | **0 mã trong mã nguồn**; PHASE-032 S032-12..20 sẽ làm |
| Bộ kiểm CI | 85 `SC-*` (`tests/conformance/checks/**`), 47 `DG-*` (`tests/conformance/diagnostics/**`), `baseline.json` ratchet, `lib/scoreboard.mjs` (`bizcity_scoreboard@1`) | Kết quả CI không vào được bản cài, nên HT10 không biết check nào xanh |
| Trigger CSDL | Chỉ thêm (`*_no_update` / `*_no_truncate`); `ledger_lines_balanced`, `audit_logs_chain`, `items_guard`, `posting_policy_versions_guard`, … Có check L1 `LEDGER_TRIGGERS` | Không có danh sách máy đọc được |
| Engine | Mã có: Ghi sổ (`kernel/posting`), Giá vốn (`kernel/inventory/costing.service.ts`), Document SDK (`platform/core/documents.ts`), Đánh số (`kernel/documents/numbering.ts`), Workflow (`platform/core/workflow.ts`), Phân quyền (`platform/core/authz/engine.ts`), Policy Registry (`platform/core/policies.ts`), Thư viện (`platform/core/libraries`), Kiểm chuẩn (`packages/vn-rulepacks/engine.mjs`), Truy vết (`kernel/lineage`), Kết chuyển (`kernel/closing`) | Không có sổ engine; không có bộ máy Thuế, Báo cáo; Inventory Engine (lô, lớp giá, `costing_runs`) mới ở tài liệu PHASE-032; engine bảng điểm S029-18 chưa có |
| Nhà phát triển | `apps/web/src/phan-he/dev/menu.ts` có DEV01..09, quyền `devtools:read`, API ở `apps/api/src/modules/system/devtools.routes.ts`, `events.routes.ts`, `system.routes.ts`, `document.routes.ts`. SC-DEV-1 có | **Không có dữ liệu mức hoàn thiện của công cụ.** DEV08 Kịch bản đọc tài liệu lúc dựng, không có API |

## Liên quan

- [PHASE-026](../PHASE-026-MASTER-DATA-GOVERNANCE/README.md): HT10, `tru-cot.json`, S026-15 SC-PILLAR-1.
- [PHASE-029](../PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/README.md): `nen-mong.json`, SC-CORE-1, S029-18 engine bảng điểm, S029-30 thẻ Nền móng.
- [PHASE-019](../PHASE-019-BAN-DIEU-TRA-NHA-PHAT-TRIEN/README.md): Bàn điều tra, DEV01..09.
- [PHASE-031](../PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/README.md): cổng L4b, họ mã `POL-*`.
- [PHASE-032](../PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/README.md): Inventory Engine, Cổng C `CT-*`, [60 — Scoreboard kế toán](../PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/60-SCOREBOARD-KE-TOAN.md) (Bảng A / B, PC-001..023).
- Luật: R-CONT-7 (không tích tay), R-ECP-SCORE, R-FLOW, R-DIAG-4.
