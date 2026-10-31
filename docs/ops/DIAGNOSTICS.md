# Chẩn đoán, nhật ký, bằng chứng kiểm thử
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-29 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — luật phát hành, thay đổi Kernel, bảo mật, tự chẩn đoán. -->
<!-- [2026-10-30 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-001 — migration đúng chuẩn, vai trò CSDL thường cho API, bộ test xanh. -->
<!-- [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10). -->
<!-- [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6). -->
<!-- [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn. -->
<!-- [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id. -->
<!-- [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009). -->
<!-- [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS. -->

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
| `EVENT_PENDING_AGE` | L3 | Sự việc `pending` / `error` quá 3 ngày | warn | có | DG-EVENT-3 |
| `INTERNAL_EVENT_VERSION` | L3 | Kết chuyển, giá vốn, khấu hao có `posted_version = version` (ghi qua `eventStore`; lệch = có đường ghi vòng qua cửa) | warn | có | DG-EVENT-4 |
| `MIGRATIONS_PENDING` | L1 | Còn migration chưa áp | error | có | DG-DB-1 |
| `LEDGER_TRIGGERS` | L1 | Trigger khai trong migration còn đủ và đang bật | error | có | DG-DB-2 |
| `DB_WRITABLE` | L1 | CSDL là bản chính, ghi được | error | có | DG-DB-4 |
| `TENANT_ISOLATION` | L1 | Mọi bảng có `tenant_id` bật RLS + FORCE + có chính sách (migration 0041, STD-DATA-1). Vai trò kết nối không vượt RLS: DG-SEC-1 / -2 | error | có | DG-PLAN-5 |
| `POLICY_VERSION` | L3 | Bút toán định khoản theo luật (chứng từ nhận từ nguồn) ghi đúng phiên bản chính sách kế toán áp cho ngày hạch toán (ADR-0009, C-9) | warn | có | DG-POL-1 |
| `EVENT_DEAD` | L3 | Không có việc giao sự kiện hết lượt thử (dead) nằm im (bizcity_event@1, R-OUTBOX-3); xem `GET /api/v1/system/events`, sửa nguyên nhân rồi phát lại | warn | có | DG-EVT-1 |
| `EVIDENCE_CHAIN` | L3 | Chuỗi băm `audit_logs` của đơn vị liền mạch: băm tính lại khớp, nối đúng dòng trước, không hở số (bizcity_evidence@1) | error | có | DG-EVD-1 |
| `SETTINGS_UNKNOWN` | — | Khoá trong `tenants.settings` không có trong registry | warn | Phase 3 (`settings.registry`) | DG-SET-1 |
| `DEBT_MATCH_LEDGER` | L3 | Σ `debt_items` mở = số dư tài khoản công nợ theo đối tượng | error | chưa | DG-PLAN-1 (giữ chỗ) |
| `TAX_BOOK_MATCH` | L3 | Sổ hoá đơn = phát sinh 33311 / 1331 theo kỳ | warn | chưa | DG-PLAN-2 |
| `COST_FILL_OPEN` | L3 | Dòng `cost_fill` còn 0 ở tháng đã qua | warn | chưa | DG-PLAN-3 |
| `TRANSIT_NONZERO` | L3 | Số dư 1579 / 11319 khác 0 quá N ngày | warn | chưa | DG-PLAN-4 |

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
