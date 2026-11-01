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
| S020-5 | Check SC-VNC-1 (schema) + SC-VNC-2 (cổng phê duyệt fail-closed) + fixture `repo-bad/tests/conformance/vietnam/` + `expect.json` — ca T020-1 | W0 / VNCONF-002 | P0 | có | ✅ 2026-11-01 — `--self-test` ĐẠT (SC-VNC-1: 4, SC-VNC-2: 28 phát hiện mẫu) |
| S020-6 | Luật R-VNC-1..9 + CANON §3; quy trình `docs/compliance/` (governance 8 bước, registry) | W0 / VNCONF-002 | P0 | — | ✅ 2026-11-01 |
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
| T020-8 | PR có ca P0 FAIL bị CI chặn; báo cáo REVIEW_REQUIRED không được nhãn Passed | `evidence/W4-<ngày>.md` — chưa |

## Log

| Ngày | Ai | Việc |
|---|---|---|
| 2026-11-01 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | mở phase theo đặc tả OKT-SPEC-VNCONF-001; W0: S020-1..6. Nhánh `feat/phase-020-vn-conformance`. Baseline @ `91b8c92`: selfcheck ĐẠT (41 đạt · 10 nợ cũ · 1 cảnh báo), diagnostics `ketoan_test` ĐẠT (17 đạt · 3 cảnh báo), vitest 112 tệp: 110 đạt, 1 lỗi (`tro-ly.test.ts`, 36901 ≠ 36900 — làm tròn mô phỏng, không chạm sổ) |
| 2026-11-01 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | W0 nghiệm thu trước PR: `selfcheck --lane selfcheck --strict` ĐẠT (43 đạt · 10 nợ cũ · 1 cảnh báo · Tuân chuẩn 98 A); `--self-test` ĐẠT (SC-VNC-1: 4, SC-VNC-2: 28); `kiem-chuan.sh` ĐẠT; `npm run typecheck` ĐẠT (0 lỗi TS); `npm test` không chạy lại (không đổi mã chạy) |
