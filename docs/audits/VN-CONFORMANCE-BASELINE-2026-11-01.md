# Audit nền bộ kiểm chuẩn pháp lý Việt Nam — 2026-11-01 (VNCONF-001)
<!-- [2026-11-01 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — audit nền theo đặc tả OKT-SPEC-VNCONF-001 §1: inventory, toolchain, baseline selfcheck / diagnostics / vitest @ 91b8c92, ánh xạ đặc tả → repo, khoảng trống, PR đầu tiên VNCONF-001/002. -->

> **Yêu cầu:** đặc tả OKT-SPEC-VNCONF-001 v1.0-draft §1 "Repo reality check (bắt buộc)" và §14: audit tại commit SHA cụ thể, không giả định cấu trúc minh hoạ đã tồn tại, không triển khai lại thành phần đã có, mapping `existing path / interface / owner / gap / change / acceptance`, chụp baseline, PR đầu tiên chỉ cho VNCONF-001/002.
> **Commit:** `main` @ **`91b8c929dc36e620bd338a20357df4c1e71dcbae`** (Merge PR #16, 2026-11-01). Chưa có tag `v*`.
> **Máy đo:** Windows 11, Node **v24.15.0** (engines đòi ≥ 22.12; CI dùng 22), npm 11.12.1, Docker Desktop: `ketoan-db-1` PostgreSQL 16-alpine (cổng 5434), CSDL `ketoan_test` đủ 48 migration.
> **Phase:** [PHASE-020](../phases/PHASE-020-KIEM-CHUAN-PHAP-LY-VN/README.md) · **Luật mới:** [R-VNC](../rules/RULE-VN-CONFORMANCE.md) · Biên bản trước gần nhất: [AUDIT-2026-11-01-PLUGIN-MVP](AUDIT-2026-11-01-PLUGIN-MVP.md).

## Trả lời ngắn

Repo **đã có phần lớn hạ tầng** đặc tả đòi, dưới tên khác: bộ kiểm chuẩn hai lane có bảng điểm + baseline (ADR-0006), kiểm toàn vẹn sổ trên CSDL thật, chính sách kế toán có phiên bản theo ngày hạch toán (ADR-0009 / C-9), idempotency tại CSDL, RLS, outbox, cổng Kernel, kho căn cứ cho người đọc, ma trận pháp lý. **Thiếu đúng ba khối** đặc tả gọi là Legal Registry · Versioned Rulepacks · Evidence Reporter — theo nghĩa *máy đọc, có trạng thái rà soát, fail-closed*. PR này (W0) bổ ba khối đó bằng **dữ liệu + check tĩnh** trong `tests/conformance/`, không viết lại cái đã có, không đụng Kernel (K0).

Baseline @ `91b8c92`:

| Lane | Kết quả | Chi tiết |
|---|---|---|
| `selfcheck` (tĩnh, `--lane selfcheck`) | **ĐẠT** · Tuân chuẩn 97.9 (A) | 41 đạt · 10 nợ cũ (baseline) · 1 cảnh báo (SC-SEC-4) · 0 không đạt · 1 312 ms |
| `diagnostics` (`ketoan_test`, READ ONLY) | **ĐẠT** · 96.7 (A) | 17 đạt · 3 cảnh báo: DG-EVT-1 (36 sự kiện dead), DG-SEC-2 (chạy bằng superuser), DG-TAX-1 (102 dòng thuế đầu vào chờ hoá đơn) · 4 planned · 2 283 ms. DG-LEDGER-1 xét 46 564 bút toán, DG-EVD-1 xét 40 095 dòng bằng chứng |
| `vitest` (`npm test`, CSDL `ketoan_test`) | **1 lỗi** / 112 tệp | 110 tệp đạt · 1 tệp lỗi · 856 test đạt · 1 lỗi · 1 skipped · 624 s. Lỗi: `test/tro-ly.test.ts` "phiếu bán: doanh thu, thuế đầu ra, giá vốn minh hoạ" — `expected 36901 to be 36900` (làm tròn trong **mô phỏng** của trợ lý, không ghi sổ). Thêm 1 unhandled error `Worker exited unexpectedly` (tinypool) cuối phiên |
| `scripts/kiem-chuan.sh` | ĐẠT | grep ranh giới (CI job `guard`) |

Lỗi `tro-ly.test.ts` **không chạm sổ cái** (trợ lý chỉ mô phỏng định khoản) nhưng là lỗi trên `main`: ghi việc cho người giữ `phan-he/tro-ly` (không sửa trong PR này — R-REV-5). Không coi lỗi cũ trong các audit trước là chưa sửa: A-01, A-03, A-17 đã hết theo baseline hiện tại.

## 1. Inventory (§1.1–1.2)

| Mục | Thực tế |
|---|---|
| Workspace | npm workspaces `packages/*` (`@ketoan/contracts`, `@bizcity/platform`, `@bizcity/kernel`, `module-sdk` chỉ tài liệu) + `apps/*` (`@ketoan/api` Fastify + Kysely, `@ketoan/web` Vite). `package-lock.json`, `npm ci` |
| Test runner | **vitest 2.1.5** (`apps/api`), PostgreSQL thật qua `DATABASE_URL`, mỗi tệp test một đơn vị riêng (`setupTenant()`), `setup.ts` + `helpers.ts` (`assertLedgerInvariants`). 112 tệp |
| Typecheck / build | `npm run typecheck --workspaces`; `@ketoan/contracts` build `dist/` trước |
| CSDL | PostgreSQL 16, **Kysely + SQL migrations** `db/migrations/0001…0048` (hở số 0015 — nợ SC-DATA-1 trong baseline), `db/seeds/`, gói nền `db/packs/vn-tt99-nen.posting-pack.json`. **Không Prisma** (R-DB-14) — khớp đặc tả |
| Docker | `docker-compose.yml`: `db`, `db-migrate`, `api`, `web`; bộ giám sát riêng (`infrastructure/monitoring`) |
| CI | `.github/workflows/ci.yml` (guard · typecheck · test PG16 · migrate-upgrade từ tag) + `conformance.yml` (selfcheck `--self-test` + `--strict` · monitoring · diagnostics sau test). Artifact JSON test + `tests/conformance/output/` 30 ngày |
| Bộ kiểm chuẩn | `tests/conformance/`: `selfcheck.mjs`, `checks/<nhóm>/*.check.mjs` (SC-*), `diagnostics/*.diag.mjs` (DG-*), `lib/` (jsonschema 2020-12 rút gọn, repo, sql, scoreboard, baseline bánh cóc), `fixtures/{repo-bad,module-bad,module-good,pack-bad}` + `expect.json` (`--self-test`), `locks/migrations.lock.json`, `schema/check.schema.json`. **Không có** `technical/` như đặc tả giả định |
| Căn cứ pháp lý | `docs/can-cu/00…06` (7 trang, rà 13/10/2026, cho người đọc); `docs/contracts/BIZCITY-COMPLIANCE-v1.md` §3 ma trận pháp lý; `docs/standard/compliance-matrix.json` C-1..C-9 (máy đọc, tín hiệu check) |
| Audit đã có | `docs/audits/`: BASELINE 10-28, KIEN-TRUC 10-30, CHU-KY 10-30, PITR 10-30, REVIEW-THUY 10-31, PLUGIN-MVP 11-01, deps 10-30 |
| Quy ước bắt buộc | AGENTS.md: bốn câu không thương lượng; R-SIG dấu `[ngày giờ Johnny Chu - Chu Hoàng Anh] MÃ — mô tả` trên mọi tệp framework (SC-SIG-1/2 block); thư mục phase có README + 40-MASTER-CHECKLIST (SC-PHASE-1); mã luật khai một lần, liên tục (SC-CON-5); liên kết .md không gãy (SC-DOC-1) |

## 2. Ánh xạ đặc tả → repo (§1.3)

Owner: **Lõi** = Nhóm Lõi / chủ dự án (CODEOWNERS `*`, `/tests/conformance/`, `/docs/**`); **KT** = người duyệt kế toán; **Thuế** = người duyệt thuế.

| Đặc tả | Đường dẫn / hợp đồng đang có | Owner | Khoảng trống | Việc (PR này = W0; còn lại ticket) | Ca nghiệm thu |
|---|---|---|---|---|---|
| §2 Legal Source Registry | `docs/can-cu/01-danh-muc-van-ban.md` (người đọc); `BIZCITY-COMPLIANCE-v1.md` §3 | Lõi, KT | không máy đọc; không trạng thái rà / điều khoản / băm | **W0:** `tests/conformance/vietnam/registry/legal-sources.json` + schema `bizcity_vn_legal_registry@1`; 16 văn bản, tất cả `pending` | SC-VNC-1 (schema), SC-VNC-2 (`source-url`, `source-snapshot`, `dup-source`, `dates`, `agent-name`) |
| §2 Expert-Approved Rulepacks (immutable) | `db/packs/*.posting-pack.json` là gói **định khoản** (dữ liệu cấu hình), có `regime`, trust `publisher.trust`; không phải rulepack kiểm | Lõi, KT, Thuế | không có khái niệm rulepack kiểm có người duyệt | **W0:** `rulepack.schema.json`, `case.schema.json`; 3 rulepack nháp C01 / C02 / C08 (19 ca) trỏ `verified_by` tới check / test đang có; `catalog.json` C01–C08 | SC-VNC-2 (`approved-*`, `golden-mismatch`, `dup`, `verified`, `case-*`, `catalog-*`) |
| §2 Conformance Runner | lane `selfcheck` + `diagnostics`; vitest qua cửa thật; `--module` cho module; lộ trình 4.3 hứa lane `runtime` (CONF-RUN-1..17) | Lõi | chưa có lane `runtime`; chưa chọn rulepack 4 bước | **VNCONF-003** (W1): lane `runtime` đọc rulepack, chạy `kind: runtime` qua cổng công khai, 2 đơn vị, đồng hồ cố định | T020-2, T020-3 |
| §2 Evidence Reporter | `output/latest/{scoreboard.json,selfcheck.json,evidence.txt}` (`bizcity_scoreboard@1`, `bizcity_check_result@1`); CI upload artifact; `audit_logs` chuỗi băm | Lõi | không có báo cáo theo **ca pháp lý** với 6 trạng thái, SHA, rulepack hash | **W0:** `report.schema.json` (`bizcity_vn_conformance_report@1`) + báo cáo mẫu; **VNCONF-008**: junit + CI gate | SC-VNC-1 (`report:*`), SC-VNC-2 (`report-result`, `report-label`, `report-reason`, `report-rulepack`, `report-claim`) |
| §3 C01 accounting-integrity | DG-LEDGER-1..4, DG-DB-2, DG-POL-1, DG-EVT-1; SC-KERNEL-1/3, SC-EVT-1/2; `db-rules`, `ledger-flow`, `ledger-links`, `period-locks`, `events`, `policy`, `event-store`, `actions` | Lõi | C01.4 (cùng docKey hai đơn vị) chưa test; khoá idempotency không có `source` (G4) | **W0:** 8 ca nháp; **VNCONF-004** | T020-4 |
| §3 C02 accounting-regimes-vn | `posting-config/policy.ts` (`selectPolicy` theo ngày), `pack.ts` (`regime` enum), migration 0040, `policy.test.ts`, `posting-pack.test.ts`, hệ thống TK TT99 `db/seeds/tai-khoan.csv` | Lõi, KT | **G1** đơn vị không có năm tài chính / chế độ; `fiscal_periods` theo tháng dương lịch (`0004:22`); **G2** hệ thống TK ngoài bản chụp; **G5** TT133 chỉ enum | **W0:** 5 ca nháp; **VNCONF-006** + đề xuất năng lực Core (Q020-2) | T020-6 |
| §3 C03 vat-vn | `tax_codes` (R00/R05/R08/R10/V*/KCT), `modules/tax-codes`, `tax-info`, `tax_invoices`, DG-TAX-1, `tax-returns.test.ts`, `docs/can-cu/05` | Lõi, Thuế | chưa có rulepack; chưa có kiểm điều kiện khấu trừ / làm tròn theo mốc hiệu lực; NQ 204 hết 31/12/2026 | **VNCONF-007** (planned trong catalog) | T020-7 |
| §3 C04 einvoice-vn | `tax_invoices` trạng thái `valid / replaced / adjusted / cancelled`, `hoa-don-ncc.test.ts`, `authority-invoices.test.ts`; phần mềm **không phát hành** hoá đơn | Lõi, Thuế | chưa có rulepack; chưa có mock nhà cung cấp | **VNCONF-007** | T020-7 |
| §3 C05–C07 (P1) | báo cáo B01/B02/B03/B09 TT99 (`phan-he/ke-toan/reports`, `thue/statements`), `costing.service.ts`, `asset-postings.test.ts`, VAS 02 trong `docs/can-cu/04` | — | planned | sau W4 | — |
| §3 C08 plugin-boundary-security | SC-KERNEL-1/3/6/7, SC-MOD-1/2, SC-CON-2, SC-DATA-2; DG-SEC-1, DG-DB-2, DG-PLAN-5; `tenant-isolation`, `access`, `app-role`, `edit-permission`, `events`; ADR-0011 | Lõi | **G3** `modules.lifecycle`, vai trò `mod_<key>_owner` planned | **W0:** 6 ca nháp; **VNCONF-005** | T020-5 |
| §4 Schema rulepack / case (YAML/JSON, CI validate) | `lib/jsonschema.mjs` (2020-12 rút gọn, không gói ngoài); SC-CON-1 lint `docs/contracts/*.schema.json` | Lõi | — | **W0:** JSON (không YAML — bộ kiểm không có parser YAML và không thêm phụ thuộc); SC-VNC-1 lint 4 schema | `--self-test` |
| §6 Chọn rulepack 4 bước | bước 2 có cơ chế: `selectPolicy(asOf)` (ADR-0009); bước 1 thiếu năm tài chính (G1); bước 3 chưa có | Lõi | runner chưa có | R-VNC-4; **VNCONF-003** | T020-2 |
| §7 API adapter | `POST /api/v1/documents` (`bizcity_ledger_intake@1`), `ctx.ledger.submit`, `GET /evidence/:id`, `ledgerQuery`, API kỳ kế toán, `defineAction`, `core.events.replay`, `@bizcity/kernel` gốc gói (SC-KERNEL-6) | Lõi | tên hàm đặc tả là minh hoạ | runner map lên cổng thật; không tạo adapter trừu tượng mới ở W0 | SC-KERNEL-6 |
| §8 CI gate | `conformance.yml` `--strict`; `ci.yml` test | Lõi | chưa có bước VN | **VNCONF-008** | T020-8 |
| §9 Cấu trúc thư mục | `tests/conformance/{checks,diagnostics,lib,fixtures,schema,locks}` | Lõi | — | **W0:** thêm `vietnam/{registry,schemas,rulepacks,fixtures,reviewer-approvals}`, `checks/vietnam/`; **không** `packages/vn-conformance` (D020-1); `reports/` = `output/` đã gitignore; `docs/compliance/` mới | SC-DOC-1 |
| §10 Quy trình 8 bước | RULE-REVIEW (R-REV), RULE-RELEASE, CODEOWNERS | Lõi, KT, Thuế | chưa có quy trình riêng cho pháp luật | **W0:** `docs/compliance/RULEPACK-GOVERNANCE.md`, R-VNC-9 | duyệt PR |
| §0 "không plugin ghi trực tiếp Ledger" | bốn câu không thương lượng; SC-KERNEL-1/3 block; trigger; `ketoan_app` | Lõi | — | không việc | DG-SEC-1 |
| §0 "AI không tự phê duyệt" | R-SIG-4 (không tên agent trong dấu), MCP ghi chỉ nháp (PHASE-009) | Lõi | — | **W0:** SC-VNC-2 `agent-name:*` cho `reviewed_by` / `*_reviewer` | `--self-test` |

## 3. Khoảng trống Core (không vá trong phase — VERSIONING §5)

| # | Khoảng trống | Bằng chứng | Chặn ca | Đường đi |
|---|---|---|---|---|
| G1 | Đơn vị không có **năm tài chính** / **chế độ kế toán**; kỳ theo tháng dương lịch | `db/migrations/0004_goc_ky_ke_toan.sql:22` (`EXTRACT(year FROM start_date) = EXTRACT(year FROM end_date)`), `tenants.settings` không khoá liên quan trong `bizcity-settings.registry.json` | C02.1, C02.2 | đề xuất năng lực `tenant.fiscal-year` + `tenant.accounting-regime` (ADR) — Q020-2 |
| G2 | Hệ thống tài khoản không trong bản chụp chính sách | ADR-0009 §2 "Không chụp hệ thống tài khoản" | C02.5 (chuyển TT133 → TT99) | ADR bổ sung ADR-0009 hoặc ADR mới |
| G3 | `modules.lifecycle`, `apps.external` planned; vai trò `mod_<key>_owner` chưa code | ADR-0011, `bizcity-standard.json`, lộ trình 3.13 / 3.14 | C08.4, C08.6 | PHASE-011 / ADR-0011 W1+ |
| G4 | Idempotency sự việc = (tenant_id, doc_key) + version, không `source` | `db/migrations/0005_goc_chung_tu.sql` UNIQUE (tenant_id, doc_key) | C01.3 (định nghĩa), C01.4 (test) | Q020-3: quy ước docKey có tiền tố nguồn trong `bizcity_ledger_intake@1` |
| G5 | TT133: chỉ enum, không hệ thống TK, không gói | `packages/kernel/src/modules/posting-config/pack.ts:40` | C02 cho SME | nguồn pháp lý rà + gói `vn-tt133-*` (PHASE-012) |

## 4. Đối chiếu nguồn pháp lý đặc tả §3.1 với `docs/can-cu` (§1.5)

| Văn bản | Đặc tả | docs/can-cu (13/10/2026) | Ghi vào registry |
|---|---|---|---|
| Luật Kế toán 88/2015/QH13 | có | có; sửa bởi 56/2024, 108/2025; hợp nhất 41/VBHN-VPQH | `pending`; Điều 26, 27 ghi; điều về chứng từ `REVIEW_REQUIRED` |
| TT 99/2025/TT-BTC | có; link Công báo; áp theo năm tài chính | có; thay TT200 từ năm tài chính 2026 | `pending`; `fiscal_year_start_from: 2026-01-01`; điều khoản chuyển tiếp `REVIEW_REQUIRED` |
| TT 133/2016/TT-BTC | có | **không** | `pending`, `unverified`; không link |
| Luật Thuế GTGT 48/2024/QH15 | có | có; **sửa bởi Luật 149/2025/QH15** (đặc tả không nhắc) | cả hai `pending` |
| NĐ 123/2020 + NĐ 70/2025 | có; link chinhphu.vn | có; thêm **TT 32/2025** | ba mục `pending` |
| Luật Quản lý thuế 108/2025/QH15 | có; link; ngoại lệ hiệu lực sớm | có; một số điều hộ kinh doanh từ 01/01/2026 | `pending_effect`; provision hiệu lực sớm `REVIEW_REQUIRED` |
| NQ 204/2025 + NĐ 174/2025 (giảm 2%) | **không** | có; hết 31/12/2026 | `pending`; `effective_to: 2026-12-31` |
| NĐ 181/2025, TT 69/2025, Luật TNDN 67/2025, TT 89/2026, NĐ 132/2026, TT 45/2013 | không | có | 181/2025 vào registry `pending`; còn lại chờ C05–C07 |

Không mục nào được đặt `reviewed`: người viết tài liệu đã rà `docs/can-cu` nhưng chưa ai rà **cho bộ kiểm** theo định nghĩa LEGAL-SOURCE-REGISTRY §2 (văn bản gốc + ảnh chụp + băm + điều khoản).

## 5. Việc làm trong PR này (VNCONF-001 + 002)

| Tệp | Loại | Ghi chú |
|---|---|---|
| `docs/audits/VN-CONFORMANCE-BASELINE-2026-11-01.md` | audit | tệp này |
| `tests/conformance/vietnam/schemas/{legal-source,rulepack,case,report}.schema.json` + `examples/report.example.json` | schema | 4 hợp đồng `bizcity_vn_*@1`; chỉ từ khoá `lib/jsonschema.mjs` hỗ trợ; không `$ref` ngoài tệp |
| `tests/conformance/vietnam/registry/legal-sources.json` | dữ liệu | 16 văn bản, `pending` |
| `tests/conformance/vietnam/catalog.json`, `rulepacks/{accounting-integrity,accounting-regimes-vn,plugin-boundary-security}/` | dữ liệu | 3 rulepack `draft`, 19 ca |
| `tests/conformance/checks/vietnam/vn-conformance.check.mjs` | check | SC-VNC-1 (block, tier 1), SC-VNC-2 (block, tier 0) |
| `tests/conformance/fixtures/repo-bad/tests/conformance/vietnam/**`, `fixtures/expect.json` | tự kiểm | 4 + 28 phát hiện mẫu, 26 khoá kiểm |
| `docs/rules/RULE-VN-CONFORMANCE.md`, `docs/00-CANON.md` (§3 dòng R-VNC, §6 v1.2) | luật | R-VNC-1..9 |
| `docs/compliance/{README,RULEPACK-GOVERNANCE,LEGAL-SOURCE-REGISTRY}.md` | quy trình | 8 bước; định nghĩa "đã rà" |
| `docs/phases/PHASE-020-KIEM-CHUAN-PHAP-LY-VN/{README,00-MASTER-PLAN,40-MASTER-CHECKLIST}.md`, `docs/phases/README.md` | phase | D020-1..6, Q020-1..5, S020-1..15, T020-1..8 |
| `tests/conformance/README.md` §8, `tests/conformance/vietnam/README.md`, `CHANGELOG.md` | tài liệu | |

**Không đổi:** mã chạy (`apps/`, `packages/`), migration, hợp đồng đã có, baseline.json, lock migration. Mức Kernel **K0**.

## 6. Bằng chứng sau thay đổi (cùng máy, cùng SHA gốc + PR)

- `node tests/conformance/selfcheck.mjs --self-test` → **ĐẠT** (SC-VNC-1: 4 phát hiện mẫu; SC-VNC-2: 28).
- `node tests/conformance/selfcheck.mjs --only SC-VNC` trên repo → SC-VNC-1 ✔ 100, SC-VNC-2 ✔ 100 (16 nguồn, 3 rulepack, 19 ca).
- `node tests/conformance/selfcheck.mjs --lane selfcheck --strict` → xem §7 (cập nhật sau khi chạy lần cuối).
- `bash scripts/kiem-chuan.sh` → xem §7.
- `npm test` **không chạy lại** sau PR: PR không đổi mã chạy; baseline ở "Trả lời ngắn".

## 7. Kết quả lần chạy cuối trước khi mở PR

| Lệnh | Kết quả |
|---|---|
| `node tests/conformance/selfcheck.mjs --self-test` | ĐẠT — SC-VNC-1: 4 phát hiện mẫu, SC-VNC-2: 28 phát hiện mẫu (26 khoá kiểm) |
| `node tests/conformance/selfcheck.mjs --lane selfcheck --strict` | **ĐẠT** — 43 đạt · 10 nợ cũ · 1 cảnh báo (SC-SEC-4) · 0 không đạt · 0 lỗi · 1 114 ms · Tuân chuẩn 98 (A); hai check mới SC-VNC-1 / SC-VNC-2 ✔ 100 |
| `bash scripts/kiem-chuan.sh` | ĐẠT |
| `npm run typecheck` | ĐẠT — 0 lỗi TS (PR không đổi mã TS) |
| `npm test` | không chạy lại (không đổi mã chạy); baseline ở "Trả lời ngắn" |

## 8. Danh sách PR nhỏ đề xuất (§1 deliverable)

| PR | Ticket | Nội dung | Phụ thuộc |
|---|---|---|---|
| **#A (PR này)** | VNCONF-001, 002 | audit + registry + schema + rulepack nháp + SC-VNC-1/2 + luật + quy trình | — |
| #B | VNCONF-003 | lane `runtime`: runner + báo cáo JSON / JUnit, C01 / C08 `kind: runtime` | #A |
| #C | VNCONF-004 | test C01.4; chốt G4 (Q020-3) | #B |
| #D | VNCONF-005 | C08 runtime; ghi rõ C08.4 / C08.6 chờ ADR-0011 | #B |
| #E | — | đề xuất năng lực `tenant.fiscal-year` / `tenant.accounting-regime` (ADR) — G1, G2 | Q020-2 |
| #F | VNCONF-006 | C02 fixture vàng + người duyệt KT | #E, Q020-4 |
| #G | VNCONF-007 | C03 / C04 phạm vi hẹp, mock | Thuế |
| #H | VNCONF-008 | CI gate + evidence + RELEASE-CHECKLIST | #B–#G |
| #I, #J | VNCONF-009, 010 | SDK / POS mẫu, HTML, trang chứng nhận | #H |

Ngoài phạm vi VNCONF nhưng phát hiện trong audit: lỗi `tro-ly.test.ts` trên `main` (giao người giữ phân hệ `tro-ly`); 36 sự kiện dead trong `ketoan_test` (DG-EVT-1, dữ liệu test cũ — không phải lỗi mã).
