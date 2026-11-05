# Chẩn đoán, nhật ký, bằng chứng kiểm thử
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-29 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — luật phát hành, thay đổi Kernel, bảo mật, tự chẩn đoán. -->
<!-- [2026-10-30 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-001 — migration đúng chuẩn, vai trò CSDL thường cho API, bộ test xanh. -->
<!-- [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10). -->
<!-- [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6). -->
<!-- [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn. -->
<!-- [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id. -->
<!-- [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009). -->
<!-- [2026-10-31 05:07 PM Johnny Chu - Chu Hoàng Anh] R-REV — thêm TAX_INPUT_NO_INVOICE / DG-TAX-1 (thuế đầu vào chờ hoá đơn). -->
<!-- [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS. -->
<!-- [2026-11-02 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-19: thêm INVENTORY_NEGATIVE / DG-INV-1, PERIOD_CLOSE_OPEN / DG-CLOSE-1 (lớp Doanh nghiệp); COST_FILL_OPEN không viết nữa. -->

> **Luật tự chẩn đoán** (năm tầng L0–L4, chỉ đọc, lịch chạy, chặn khoá kỳ, cảnh báo, gói hỗ trợ): [../rules/RULE-SELF-DIAGNOSTICS.md](../rules/RULE-SELF-DIAGNOSTICS.md). Tệp này giữ danh sách mã kiểm và khuôn kết quả.
> Kiểm bản cài đã có trong bộ kiểm: `LEDGER_TRIGGERS` (DG-DB-2: trigger bảo vệ sổ còn và đang bật), `DB_APP_ROLE` (DG-SEC-1: vai trò `ketoan_app` đúng chuẩn), `DB_CONNECTION_ROLE` (DG-SEC-2: kết nối đang dùng không superuser), `DB_SETTINGS` (DG-DB-3: phiên bản PostgreSQL, múi giờ, UTF8).

## 1. Điểm kiểm đang có

| Điểm | Trả gì | Ai dùng |
|---|---|---|
| `GET /api/v1/system/health` (công khai) | L0: `{ status: "up", time, bookMode, envLabel, version, kernel, standard }` sau khi `select 1` | Giám sát, CLI |
| `GET /api/v1/system/health/ready` (công khai) | L1: `{ status: "ready", checks: [{ code, level, count }] }`; chưa sẵn sàng → **503 `NOT_READY`** kèm `details.checks`. Chỉ mã + mức, không số liệu | Docker healthcheck (`docker-compose.yml`), bộ cân bằng tải |
| `GET /api/v1/system/diagnostics` (`reports:read`) | L3 toàn vẹn sổ của đơn vị (§2); lưu vào `diagnostic_runs` | Kế toán, vận hành, sau triển khai (R-QG-10) |
| `GET /api/v1/system/diagnostics/runs`, `/runs/:id` (`reports:read`) | Lịch sử các lượt chẩn đoán (R-DIAG-5) | Vận hành |
| `GET /api/v1/system/capabilities` (đăng nhập / khoá) | Bảng năng lực Standard của bản đang chạy, mã lỗi, sự kiện lõi, điểm mở rộng, phân hệ / add-in bật, mã chẩn đoán đã đăng ký | Module, Cell / AI, bộ kiểm |
| `GET /api/v1/periods/check?year&month` | Bảng kiểm trước khi khoá kỳ; mục `integrity` = số lỗi L3 trong kỳ (R-DIAG-4) | Kế toán (màn Kỳ kế toán) |
| `GET /api/v1/system/modules` · `/system/addins` | Phân hệ, add-in đang bật | Vận hành |
| `GET /api/v1/system/schema` | Cấu trúc CSDL kèm chú thích | Dev, kiểm R-DB-5 |
| `GET /api/v1/reports/document-checks?from&to` | Kiểm toàn vẹn chứng từ (phiếu trả không nối được phiếu gốc…) — màn ACC93 | Kế toán, vận hành |
| `GET /api/v1/posting-log` · `GET /api/v1/documents/:id/posting-log` (ACC14) | Nhật ký nhận / định khoản / lỗi / huỷ | Kế toán |
| `audit_logs` | Ai đổi gì | Kiểm toán |

## 2. `GET /api/v1/system/diagnostics` (có từ PHASES 2.10)

Quyền `reports:read`. Tuỳ chọn:
- `from`, `to`: ngày hạch toán (bút toán theo `posting_date`, sự việc theo `doc_date`);
- `branchCode`;
- `layer`: `L3` mặc định, hoặc `L1`.

Chạy từng kiểm trong giao dịch `READ ONLY` (R-DIAG-2), mỗi kiểm một dòng kết quả, rồi lưu lượt chạy vào `diagnostic_runs` (chỉ thêm, migration 0034).

**Ai khai kiểm nào.** Platform (`modules/system/diagnostics.ts`) giữ sổ đăng ký, bộ chạy và các kiểm L1 chung. Kernel (`modules/ledger/ledger.diagnostics.ts`) khai các kiểm sổ, được đăng ký lúc lắp ráp (`app.ts`). Platform không import Kernel (LAYOUT-1).

| Mã kiểm | Tầng | Kiểm | Mức khi sai | Trong app | Lane bộ kiểm |
|---|---|---|---|---|---|
| `LEDGER_BALANCED` | L3 | Mỗi bút toán: Σ Nợ = Σ Có | error | có | DG-LEDGER-1 |
| `LEDGER_BALANCES_DAILY` | L3 | `ledger_balances_daily` = Σ `ledger_lines` theo (chi nhánh, tài khoản, ngày) | error | có | DG-LEDGER-2 |
| `LEDGER_REVERSED_ONCE` | L3 | Bút toán `reversed` có đúng một bút toán đảo; bút toán đảo trỏ về bút toán `reversed` | error | có | DG-LEDGER-3 |
| `LEDGER_ORPHAN` | L3 | Mọi `ledger_entries.event_id` tồn tại | error | có | DG-LEDGER-4 |
| `EVENT_POSTED_VERSION` | L3 | `status = posted` ⇒ `posted_version = version` (trừ sự việc nội bộ) | error | có | DG-EVENT-1 |
| `EVENT_HAS_ENTRY` | L3 | Sự việc `posted` có bút toán hiệu lực | warn | có | DG-EVENT-2 |
| `ENTRY_NO_VERSION` | L3 | Bút toán gắn sự việc có `event_version` (phiên bản chứng từ đã tạo ra nó) <!-- [2026-11-05 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — W1: DOC-01 --> | warn | có | DG-DOC-1 |
| `ENTRY_VERSION_UNKNOWN` | L3 | Phiên bản chứng từ của bút toán còn nội dung lưu <!-- [2026-11-05 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — W1: DOC-03 --> | warn | có | DG-DOC-2 |
| `EVENT_ENTRIES_STALE` | L3 | Bút toán hiệu lực của sự việc đã ghi sổ thuộc đúng `posted_version` <!-- [2026-11-05 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — W1: DOC-04 --> | warn | có | DG-DOC-3 |
| `EVENT_PENDING_AGE` | L3 | Sự việc `pending` / `error` quá 3 ngày | warn | có | DG-EVENT-3 |
| `TAX_INPUT_NO_INVOICE` | L3 | Thuế GTGT đầu vào đã vào sổ (tài khoản của loại thuế đầu vào / ngầm định `tax_input`) mà sự việc chưa có hoá đơn trong sổ hoá đơn quá 30 ngày — bảng kê mua vào thiếu so với sổ | warn | có | DG-TAX-1 |
| `INTERNAL_EVENT_VERSION` | L3 | Kết chuyển, giá vốn, khấu hao có `posted_version = version` (ghi qua `eventStore`; lệch = có đường ghi vòng qua cửa) | warn | có | DG-EVENT-4 |
| `INVENTORY_NEGATIVE` <!-- [2026-11-02 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-19 --> | L3 | Tồn kho âm cuối ngày theo (chi nhánh, kho, mã hàng), số dư luỹ kế từ dòng kho đầu tiên; mẫu `<chi nhánh>:<kho>:<mã>@<ngày âm đầu>` (lớp Doanh nghiệp, C09) | warn | có | DG-INV-1 |
| `PERIOD_CLOSE_OPEN` | L3 | Tháng kết thúc quá 30 ngày (ngưỡng nội bộ) thiếu việc cuối kỳ: `gia-von` (hàng xuất chưa có phiếu giá vốn tháng), `ket-chuyen` (còn số theo bộ quy tắc kết chuyển của đơn vị, chưa lưu bộ riêng thì bộ mặc định), `thu-tu` (giá vốn tính lại sau kết chuyển), `khoa-so`; không chặn khoá kỳ (lớp Doanh nghiệp, C09) | warn | có | DG-CLOSE-1 |
| `VAT_REDUCED_RATE` <!-- [2026-11-02 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-11 --> | L3 | Dòng bán ra dùng loại thuế có thuế suất giảm (8%) ngoài thời gian giảm; thuế suất + khoảng ngày là tham số của ca `vn.vat-vn.rate.reduced_window.001` (rulepack), không viết cứng | warn | có | DG-VAT-1 |
| `VAT_INPUT_NONCASH` | L3 | Hoá đơn mua vào ≥ 5 triệu (gồm thuế), được khấu trừ, chưa ghi chứng từ thanh toán không dùng tiền mặt — dùng lại `taxIssues` / `NON_CASH_THRESHOLD` của ACC78 | warn | có | DG-VAT-2 |
| `INVOICE_FIELDS` | L3 | Hoá đơn trong sổ thiếu ký hiệu, thiếu tên / mã số thuế người bán (mua vào), mã số thuế sai dạng — dùng lại `taxIssues`; mẫu `<số chứng từ>: <điểm thiếu>` | warn | có | DG-EINV-1 |
| `INVOICE_ISSUE_DATE` | L3 | Hoá đơn bán hàng hoá có ngày lập sau ngày chứng từ bán (thời điểm chuyển giao) | warn | có | DG-EINV-2 |
| `CASH_NEGATIVE` <!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W2 --> | L3 | Quỹ tiền mặt âm cuối ngày theo (chi nhánh, tài khoản tiền mặt ngầm định `cash` và tài khoản con); mẫu `<chi nhánh>:<tài khoản>@<ngày âm đầu>` | warn | có | DG-CASH-1 |
| `ACCOUNT_WRONG_SIDE` | L3 | Tài khoản có `normal_side` một bên mà số dư cuối kỳ ở bên ngược lại; mẫu `<tài khoản>:<bên đang dư>` | warn | có | DG-ACC-1 |
| `INTAKE_OPEN_AGE` <!-- [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W4 (S021-19) --> | L3 | Mục bể chờ đầu vào `open` (cửa nạp từ chối, chưa vào sổ) quá `bizcity.intake.open_alert_days` ngày (mặc định 3); mẫu `docKey` (`#<id>` khi khuôn hỏng) | warn | có | DG-INTAKE-1 |
| `COGS_STALE` | L3 | Chứng từ kho của tháng được nhận / sửa (`received_at`) sau lần ghi phiếu giá vốn tháng; mẫu `<chi nhánh>:<YYYY-MM>` | warn | có | DG-STK-1 |
| `STOCK_ADJUST_NO_REASON` | L3 | Phiếu điều chỉnh kho (tăng / giảm) không có lý do | warn | có | DG-STK-2 |
| `INVENTORY_LEDGER_MISMATCH` <!-- [2026-11-03 07:17 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — trụ cột 7: F22-STK-11 --> | L3 | Giá trị tồn theo sổ chi tiết kho ≠ số dư tài khoản hàng tồn kho (tài khoản kho của các nhóm hạch toán) tới cuối phạm vi, theo (chi nhánh, mặt hàng); bỏ qua cặp còn dòng chưa định giá; mẫu `<chi nhánh>:<mã hàng>`, mã rỗng = bút toán kho không gắn mặt hàng. Chi tiết số: `GET /api/v1/inventory/reconcile` | warn | có | DG-STK-3 |
| `DEPRECIATION_OPEN` | L3 | Tháng đã qua 30 ngày (24 tháng gần nhất) có tài sản cần khấu hao / phân bổ mà chưa trích (tính cả khoảng dồn khi trích bù); mẫu `<chi nhánh>:<YYYY-MM>` | warn | có | DG-FA-1 |
| `CONFORMANCE_STALE` | L3 | Lượt Kiểm chuẩn gần nhất quá 2 ngày (lịch đêm không chạy); đơn vị tạo chưa tới 2 ngày thì không báo | warn | có | DG-CONF-1 |
| `MIGRATIONS_PENDING` | L1 | Còn migration chưa áp | error | có | DG-DB-1 |
| `LEDGER_TRIGGERS` | L1 | Trigger khai trong migration còn đủ và đang bật | error | có | DG-DB-2 |
| `DB_WRITABLE` | L1 | CSDL là bản chính, ghi được | error | có | DG-DB-4 |
| `TENANT_ISOLATION` | L1 | Mọi bảng có `tenant_id` bật RLS + FORCE + có chính sách (migration 0041, STD-DATA-1). Vai trò kết nối không vượt RLS: DG-SEC-1 / -2 | error | có | DG-PLAN-5 |
| `PROFILE_DECLARED` <!-- [2026-11-02 03:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — hai kiểm L5 của Conformance Engine. --> | L5 | Đơn vị đã khai hồ sơ kế toán (năm tài chính, chế độ, loại pháp nhân) áp cho ngày xét (ADR-0013) | warn | có | DG-PROFILE-1 |
| `PROFILE_PACK_REGIME` | L5 | Gói định khoản đang cài cùng chế độ kế toán với hồ sơ của đơn vị | warn | có | DG-PROFILE-2 |
| `POLICY_VERSION` | L3 | Bút toán định khoản theo luật (chứng từ nhận từ nguồn) ghi đúng phiên bản chính sách kế toán áp cho ngày hạch toán (ADR-0009, C-9) | warn | có | DG-POL-1 |
| `EVENT_DEAD` | L3 | Không có việc giao sự kiện hết lượt thử (dead) nằm im (bizcity_event@1, R-OUTBOX-3); xem `GET /api/v1/system/events`, sửa nguyên nhân rồi phát lại | warn | có | DG-EVT-1 |
| `MODULE_REGISTRY` <!-- [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — DG-MOD-1 --> | L1 | Module `active` trong `module_registry` được API nạp ở lần khởi động gần nhất: hash thư mục khớp, mã có (ADR-0011 D2). Lệch → API bỏ riêng module đó; sửa: dựng lại + `npm run module -w @ketoan/api -- sync`, hoặc khôi phục mã | error | chưa (lane) | DG-MOD-1 |
| `EVIDENCE_CHAIN` | L3 | Chuỗi băm `audit_logs` của đơn vị liền mạch: băm tính lại khớp, nối đúng dòng trước, không hở số (bizcity_evidence@1) | error | có | DG-EVD-1 |
| `SETTINGS_UNKNOWN` | — | Khoá trong `tenants.settings` không có trong registry | warn | Phase 3 (`settings.registry`) | DG-SET-1 |
| `DEBT_MATCH_LEDGER` <!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W2 --> | L3 | Khoản công nợ còn lại theo (đối tượng, tài khoản) = số dư sổ cái của đối tượng trên tài khoản có khoản công nợ; mẫu `<mã đối tượng>:<tài khoản>` | warn | có | DG-PLAN-1 |
| `TAX_BOOK_MATCH` | L3 | Sổ hoá đơn = phát sinh 33311 / 1331 theo kỳ | warn | chưa | DG-PLAN-2 |
| `COST_FILL_OPEN` | L3 | Dòng `cost_fill` còn 0 ở tháng đã qua | warn | không viết: từ khi có phiếu giá vốn tháng, dòng chờ về 0 là bình thường; việc giá vốn tháng đã qua xem `PERIOD_CLOSE_OPEN` | DG-PLAN-3 (giữ chỗ) |
| `TRANSIT_NONZERO` | L3 | Tài khoản hàng / tiền đang chuyển (tài khoản ngầm định `goods_in_transit`, `cash_in_transit` và tài khoản con) còn số tại ngày cách hôm nay 30 ngày (quy chế nội bộ), toàn đơn vị; mẫu `<tài khoản>@<ngày>` | warn | có | DG-PLAN-4 |

**Một mã, hai nơi.**
- Mỗi mã có trong app phải có check DG-* cùng mã ở lane diagnostics (R-DIAG-9). Check **SC-DIAG-1** chặn nếu thiếu.
- SQL ở app thêm điều kiện đơn vị và phạm vi; lane chạy trên cả CSDL. Đổi SQL một bên thì đổi bên kia.

Phản hồi (mức: `pass` · `empty` (không có gì để xét, R-DIAG-7) · `info` · `warn` · `error`):

```json
{ "ok": true, "data": { "runId": "42", "tenant": "tgs", "layer": "L3", "at": "2026-10-30T09:00:00Z",
  "scope": { "from": "2026-10-01", "to": "2026-10-31" },
  "summary": { "pass": 5, "empty": 0, "info": 0, "warn": 2, "error": 0 },
  "checks": [ { "code": "LEDGER_BALANCED", "level": "pass", "title": "…", "fix": "…", "examined": 1250, "count": 0, "sample": [] },
              { "code": "EVENT_PENDING_AGE", "level": "warn", "title": "…", "fix": "…", "examined": 30, "count": 14, "sample": ["btsoft:95:sale:3058"] } ] } }
```

`sample` chỉ chứa khoá chứng từ hoặc số bút toán, tối đa 20. Không có số tiền, không có tên khách (R-DIAG-6).

**Khoá kỳ (R-DIAG-4).**
- `POST` / `PUT /api/v1/periods/locks` chạy L3 trên tháng đó (và chi nhánh nếu có), lưu lượt chạy với `trigger = period-lock`.
- Có mục `error` thì trả `CONFLICT`, kèm `details.diagnostics = { runId, errors[] }`.
- Muốn vẫn khoá: gửi lại kèm `acceptDiagnostics` (lý do, ít nhất 10 ký tự). Lý do và số lượt chạy vào `period_lock_events.reason` và audit. Màn Kỳ kế toán hiện ô lý do này.

**Trong test:** `assertLedgerInvariants()` (`apps/api/test/helpers.ts`) chạy các kiểm mức `error` của L3 trên các đơn vị mà tệp test tạo ra. Nó nằm ở `afterAll` chung của mọi tệp (`apps/api/test/setup.ts`, PHASES 2.2, R-QG-5): test làm lệch sổ thì cả tệp đỏ.

**Lane bộ kiểm (chạy trên bản sao, cả CSDL):**

```bash
BIZCITY_PSQL="docker exec -i ketoan-db-1 psql -U ketoan -d ketoan" node tests/conformance/selfcheck.mjs --lane diagnostics
```

## 3. Nhật ký có cấu trúc

Fastify ghi JSON (pino) theo `LOG_LEVEL`. Chuẩn cho dòng nghiệp vụ (log ở service, mức `info`):

```json
{ "level": 30, "time": 1761616800000, "reqId": "req-1a2b", "evt": "bizcity.ledger.posted",
  "tenant": "12", "actor": "apikey:3", "docType": "sale", "docKey": "btsoft:95:sale:3058", "version": 2,
  "entries": ["BT26-0001234"], "reversed": 1, "ms": 41 }
```

| `evt` | Khi |
|---|---|
| `bizcity.event.received` | Sự việc lưu `pending` |
| `bizcity.event.unchanged` | Gửi lại cùng phiên bản |
| `bizcity.event.rejected` | Sai khuôn / 409 |
| `bizcity.ledger.posted` | Ghi sổ xong |
| `bizcity.ledger.reversed` | Đảo |
| `bizcity.posting.failed` | Định khoản lỗi (kèm `code`, danh sách chỗ thiếu) |
| `bizcity.connector.pulled` | Một lần kéo (kèm `PullResult`) |

Không ghi `payload`, bí mật, token (R-TEN-8).

## 4. Bằng chứng kiểm thử (dán vào PR / phiếu phát hành)

Chuẩn tối thiểu — copy nguyên khối, không cắt:

```text
== BẰNG CHỨNG ==
commit:      <sha>       nhánh: <branch>      ngày: 2026-10-28 14:05 +07
lệnh:        npm run typecheck && npm test
typecheck:   PASS (contracts, api, web)
vitest:      Test Files  71 passed (71)
             Tests       624 passed (624)
             Duration    3m12s
diagnostics: pass=10 warn=2 error=0   (CSDL test, tenant t1761634000)
selfcheck:   ĐẠT — tuân chuẩn 95.4 (A) · sẵn sàng 12.4 (F) · độ phủ 47 (F)   (tests/conformance/output/latest/evidence.txt)
ghi chú:     <warn nào, vì sao chấp nhận>
```

CI tải lên `test-report.json` (`vitest --reporter=json`) làm artefact; PR đụng nhân phải dẫn link artefact đó.
