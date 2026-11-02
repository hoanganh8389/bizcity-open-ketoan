# PHASE-020 · 40 — Master checklist
<!-- [2026-11-01 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — checklist việc con S020-* theo ticket VNCONF-001…010, ca bằng chứng T020-*, log. -->

> Nguồn trạng thái **việc con** duy nhất của phase. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

| ID | Việc | Đợt / Ticket | Ưu tiên | Code | Trạng thái |
|---|---|---|---|---|---|
| S020-1 | Audit nền: inventory, toolchain, baseline selfcheck / diagnostics / vitest @ SHA, ánh xạ đặc tả → repo, khoảng trống G1–G5 ([audit](../../audits/VN-CONFORMANCE-BASELINE-2026-11-01.md)) | W0 / VNCONF-001 | P0 | — | ✅ 2026-11-01 |
| S020-2 | 4 schema `bizcity_vn_{legal_registry,rulepack,case,conformance_report}@1` theo bộ kiểm JSON Schema rút gọn; báo cáo mẫu | W0 / VNCONF-002 | P0 | có | ✅ 2026-11-01 — SC-VNC-1 lint + validate |
| S020-3 | Kho nguồn pháp lý `registry/legal-sources.json`: 16 văn bản từ docs/can-cu + đặc tả §3.1, tất cả `pending` | W0 / VNCONF-002 | P0 | có | ✅ 2026-11-01 — chờ người duyệt rà đợt đầu (⛔ Q020-4) |
| S020-4 | Catalog C01–C08 + 3 rulepack nháp (C01 8 ca, C02 5 ca, C08 6 ca) ánh xạ `verified_by` / `gap` | W0 / VNCONF-002 | P0 | có | ✅ 2026-11-01 — tất cả `draft` |
| S020-5 | Check SC-VNC-1 (schema) + SC-VNC-2 (cổng phê duyệt fail-closed) + fixture `repo-bad/packages/vn-rulepacks/` + `expect.json` — ca T020-1 | W0 / VNCONF-002 | P0 | có | ✅ 2026-11-01 — `--self-test` ĐẠT (SC-VNC-1: 4, SC-VNC-2: 28 phát hiện mẫu) |
| S020-6 | Luật R-VNC-1..9 + CANON §3; quy trình `docs/compliance/` (governance 8 bước, registry) | W0 / VNCONF-002 | P0 | — | ✅ 2026-11-01 |
| S020-16 | Kiến trúc Conformance Engine (ba lớp, bốn thành phần, ba cổng, hiệu lực cấp điều khoản, ma trận BizCity, menu Hệ thống) + ADR-0012 đề xuất + registry TT152 / chuyển tiếp TT200 | W1 / — | P0 | — | ✅ 2026-11-02 — chủ duyệt ADR-0012 + T1–T8, D020-7..10 cùng ngày |
| S020-17 | `selfcheck.mjs --certify`: một lệnh ba cổng + tuân thủ VN (lib/certify.mjs, lib/runtime.mjs, profile.schema.json, profiles/) — ca T020-9 | W1a / VNCONF-003 | P0 | có | 🟡 2026-11-02 chạy được: module-good → COMPATIBLE, module-bad → FAIL, hồ sơ fy-offset chạy; SC-VNC-1 kiểm profile; ca tự kiểm T020-9 trong --self-test chưa viết |
| S020-18 | Module Kernel `conformance` + `conformance_runs` + action run / status / report (lớp 1 + 2 trên bản cài) | W2 | P0 | có | ✅ 2026-11-02 — `packages/vn-rulepacks` (+ engine.mjs, diag-codes.json), migration 0052, L5 `PROFILE_*`, quyền `conformance:read/run`, action run / latest, `conformance-engine.test.ts` 6 test |
| S020-19 | Ca lớp 3 Doanh nghiệp (Q020-6 chốt 4 ca) với oracle rõ | W3 | P0 | có | ✅ 2026-11-02 — kiểm L3 mới `INVENTORY_NEGATIVE` (DG-INV-1), `PERIOD_CLOSE_OPEN` (DG-CLOSE-1); Engine chạy ba lớp, báo cáo có `layer_results`; `enterprise-layer.test.ts` 6 test <!-- [2026-11-02 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-19 --> |
| S020-22 | Năng lực hồ sơ kế toán của đơn vị (G1, Q020-2): [ADR-0013](../../adr/ADR-0013-ho-so-ke-toan-co-phien-ban.md), migration 0051 `accounting_profiles`, action `accounting.profile.get / publish`, `accounting-profile.test.ts` | W2 | P0 | có | ✅ 2026-11-02 — 7 test đạt; màn khai hồ sơ làm cùng S020-20 |
| S020-20 | Màn Hệ thống → Kiểm chuẩn (ma trận, Vì sao, Việc cần làm, xu hướng); MCP `conformance.status` | W4 | P1 | có | ✅ 2026-11-02 — HT06 `ConformancePage`, HT07 `AccountingProfilePage`; `core.conformance.list`; MCP trạng thái = `core.conformance.latest` (đã có, không thêm tên mới); `conformance-gate.test.ts` <!-- [2026-11-02 03:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-20 / S020-21 / lịch đêm --> |
| S020-21 | Posting Gate advisory (chỉ thông tin) ở màn lập / duyệt chứng từ và trước khoá kỳ | W5 | P1 | có | ✅ 2026-11-02 — `core.conformance.advisories` + `core.conformance.acknowledge` (T3, T4); gắn ở khung phiếu dùng chung (phiếu kế toán, thu chi), `VoucherForm`, màn khoá kỳ (lưới + Khoá chung); ACC14 định khoản hàng loạt (`useBatchGate`, ngữ cảnh `documents`: một dòng bằng chứng cho cả lô), phiếu hàng (dải cảnh báo ở form; duyệt trên nguồn API ⇒ bằng chứng) <!-- [2026-11-02 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-21b --> |
| S020-23 | Lịch đêm Kiểm chuẩn (R-DIAG-3) | W4 | P1 | có | ✅ 2026-11-02 — subscriber `core.conformance-nightly` (bizcity.clock.daily 01:00 giờ VN), actor `system:nightly` |
| S020-7 | Lane `runtime`: runner đọc rulepack / ca, chọn rulepack 4 bước (R-VNC-4), chạy ca `kind: runtime` qua cổng công khai trên PostgreSQL test (2 đơn vị A / B, đồng hồ cố định), ra `conformance-report.json` (+ `junit.xml`) — ca T020-2, T020-3 | W1 / VNCONF-003 | P0 | chưa | ☐ |
| S020-8 | C01 golden: test C01.4 (cùng docKey hai đơn vị); chốt G4 (Q020-3); mọi ca C01 có bằng chứng — ca T020-4 | W1 / VNCONF-004 | P0 | chưa | ☐ |
| S020-9 | C08: ca runtime cho vai trò module / RBAC; C08.4, C08.6 chờ ADR-0011 (G3) — ca T020-5 | W1 / VNCONF-005 | P0 | chưa | ☐ |
| S020-10 | C02: fixture vàng TT99 (hệ thống tài khoản, chuyển chế độ); đề xuất năng lực năm tài chính / chế độ kế toán của đơn vị (G1, G2, G5) theo VERSIONING §5 — ca T020-6 | W2 / VNCONF-006 | P0 | chưa | ☐ ⛔ Q020-2 |
| S020-11 | C03 `vat-vn` + C04 `einvoice-vn` phạm vi hẹp: registry rà đến điều-khoản-điểm; mock nhà cung cấp hoá đơn; `known_exclusions` rõ — ca T020-7 | W3 / VNCONF-007 | P0 | chưa | ☐ ⛔ `tax_reviewer` |
| S020-12 | CI gate: bước VN trong `conformance.yml`; FAIL / ERROR P0 chặn; `evidence/`; `docs/compliance/RELEASE-CHECKLIST.md` — ca T020-8 | W4 / VNCONF-008 | P0 | chưa | ☐ |
| S020-13 | Adapter POS mẫu + tài liệu dev cộng đồng (xét `packages/vn-conformance` — D020-1) | W5 / VNCONF-009 | P1 | chưa | ☐ |
| S020-14 | `report.html` + trang chứng nhận plugin (nhãn D020-6) | W5 / VNCONF-010 | P1 | chưa | ☐ |
| S020-15 | Người duyệt kế toán / thuế rà registry đợt đầu (LEGAL-SOURCE-REGISTRY §3); ký ADR-0009 cùng lúc | W1–W3 | P0 | — | ⛔ chủ chỉ định (Q020-4) |

## Ca bằng chứng

| Ca | Chứng minh | Lưu ở |
|---|---|---|
| T020-1 | validator từ chối rulepack `approved` có căn cứ pending / thiếu người duyệt / golden null / float / verified_by không có thật; registry reviewed không link | `node tests/conformance/selfcheck.mjs --self-test` — ✅ 2026-11-01 (28 phát hiện mẫu, 26 khoá kiểm) |
| T020-2 | runner chạy C01 / C08 trên CSDL test, báo cáo có SHA, phiên bản, rules_hash; ca rulepack `draft` ra `REVIEW_REQUIRED` | `evidence/W1-<ngày>.md` — chưa |
| T020-3 | dữ liệu đơn vị A không rò sang B qua runner (ca chéo đơn vị) | `evidence/W1-<ngày>.md` — chưa |
| T020-4 | cùng docKey ở hai đơn vị đều `posted`; gửi lặp một đơn vị không ghi trùng | `evidence/W1-<ngày>.md` — chưa |
| T020-5 | plugin / module với quyền hạn chế không ghi được `ledger_*`, không đổi `tenant_id` | `evidence/W1-<ngày>.md` — chưa |
| T020-6 | năm tài chính 01/7/2025–30/6/2026 không tự chuyển TT99 ngày 01/01/2026 (sau khi có năng lực G1) | `evidence/W2-<ngày>.md` — chưa |
| T020-7 | ca VAT thiếu thông tin ⇒ `REVIEW_REQUIRED`, không đoán; mock hoá đơn ghi rõ không là bằng chứng cơ quan thuế | `evidence/W3-<ngày>.md` — chưa |
| T020-9 | `--certify` trên module mẫu `fixtures/module-good/hop-dong-mini` ra COMPATIBLE (cổng 1 đạt, VN REVIEW_REQUIRED), trên `module-bad/xau` ra FAIL; hồ sơ `fy-offset-2025-07` không chọn TT99 cho năm tài chính 01/7 | chạy tay 2026-11-02 ✅ (good → COMPATIBLE, bad → FAIL); đưa vào `--self-test`: chưa |
| T020-8 | PR có ca P0 FAIL bị CI chặn; báo cáo REVIEW_REQUIRED không được nhãn Passed | `evidence/W4-<ngày>.md` — chưa |

## Log

| Ngày | Ai | Việc |
|---|---|---|
| 2026-11-01 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | mở phase theo đặc tả OKT-SPEC-VNCONF-001; W0: S020-1..6. Nhánh `feat/phase-020-vn-conformance`. Baseline @ `91b8c92`: selfcheck ĐẠT (41 đạt · 10 nợ cũ · 1 cảnh báo), diagnostics `ketoan_test` ĐẠT (17 đạt · 3 cảnh báo), vitest 112 tệp: 110 đạt, 1 lỗi (`tro-ly.test.ts`, 36901 ≠ 36900 — làm tròn mô phỏng, không chạm sổ) |
| 2026-11-01 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | W0 nghiệm thu trước PR: `selfcheck --lane selfcheck --strict` ĐẠT (43 đạt · 10 nợ cũ · 1 cảnh báo · Tuân chuẩn 98 A); `--self-test` ĐẠT (SC-VNC-1: 4, SC-VNC-2: 28); `kiem-chuan.sh` ĐẠT; `npm run typecheck` ĐẠT (0 lỗi TS); `npm test` không chạy lại (không đổi mã chạy) |
| 2026-11-02 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | chỉ đạo mở rộng: Conformance Engine là trụ cột Kernel trong Core (ba lớp, ba cổng, ma trận BizCity, người dùng quyết định ghi sổ) → S020-16 tài liệu + ADR-0012; S020-17 mã `--certify` đang dở |
| 2026-11-02 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | duyệt ADR-0012 + T1–T8, D020-1 (sửa), D020-7..10; chốt Q020-2, Q020-6, Q020-7; nguyên tắc "Core đơn giản, lean, chặt chẽ — phân tích để người dùng quyết định" → R-VNC-10; schema thêm `layer`, miền `internal`; rulepack nháp C09 |
| 2026-11-02 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | "ok, code nhé" → S020-22 xong: ADR-0013, migration 0049, hai action, 7 test; C02.1 / C02.2 có bằng chứng chạy thật; typecheck + 5 tệp test liên quan đạt |
| 2026-11-02 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | "tiếp tục" → gộp main (PR #18, #19), đổi migration hồ sơ 0049 → 0050; S020-18 xong: Engine trên bản cài, migration 0051, quyền mới, sideEffect analysis; 7 tệp test liên quan 56 đạt; `--strict` ĐẠT |
| 2026-11-02 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | "tiếp tục S020-20, S020-21, lịch đêm" → gộp main (PR #20), đổi migration 0051 / 0052; màn HT06 + HT07, Posting Gate chỉ thông tin + xác nhận là bằng chứng, lịch đêm |
