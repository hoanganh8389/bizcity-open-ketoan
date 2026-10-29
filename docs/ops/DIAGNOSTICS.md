# Chẩn đoán, nhật ký, bằng chứng kiểm thử

> **Luật tự chẩn đoán** (năm tầng L0–L4, chỉ đọc, lịch chạy, chặn khoá kỳ, cảnh báo, gói hỗ trợ): [../rules/RULE-SELF-DIAGNOSTICS.md](../rules/RULE-SELF-DIAGNOSTICS.md). Tệp này giữ danh sách mã kiểm và khuôn kết quả.
> Kiểm bản cài đã có trong bộ kiểm: `LEDGER_TRIGGERS` (DG-DB-2: trigger bảo vệ sổ còn và đang bật), `DB_ROLE_PRIVILEGE` (DG-SEC-1), `DB_SETTINGS` (DG-DB-3: phiên bản PostgreSQL, múi giờ, UTF8).

## 1. Điểm kiểm đang có

| Điểm | Trả gì | Ai dùng |
|---|---|---|
| `GET /api/v1/system/health` (công khai) | `{ status: "up", time, bookMode, envLabel }` sau khi `select 1` | Docker healthcheck, proxy, CLI |
| `GET /api/v1/system/modules` · `/system/addins` | Phân hệ, add-in đang bật | Vận hành |
| `GET /api/v1/system/schema` | Cấu trúc CSDL kèm chú thích | Dev, kiểm R-DB-5 |
| `GET /api/v1/reports/document-checks?from&to` | Kiểm toàn vẹn chứng từ (phiếu trả không nối được phiếu gốc…) — màn ACC93 | Kế toán, vận hành |
| `GET /api/v1/posting-log` · `GET /api/v1/documents/:id/posting-log` (ACC14) | Nhật ký nhận / định khoản / lỗi / huỷ | Kế toán |
| `audit_logs` | Ai đổi gì | Kiểm toán |

## 2. Đích: `GET /api/v1/system/diagnostics` (Giai đoạn 1)

Quyền `settings:write` hoặc khoá `reports:read`. Chạy các kiểm sau cho đơn vị của người gọi (tuỳ chọn `from`, `to`), mỗi kiểm một dòng kết quả:

| Mã kiểm | Kiểm | Mức khi sai |
|---|---|---|
| `LEDGER_BALANCED` | Mỗi bút toán: Σ Nợ = Σ Có | error |
| `LEDGER_BALANCES_DAILY` | `ledger_balances_daily` = Σ `ledger_lines` theo (chi nhánh, tài khoản, ngày, đối tượng) | error |
| `LEDGER_REVERSED_ONCE` | Bút toán `reversed` có đúng một bút toán đảo; bút toán đảo trỏ về bút toán `reversed` | error |
| `LEDGER_ORPHAN` | Mọi `ledger_entries.event_id` tồn tại | error |
| `EVENT_POSTED_VERSION` | `status = posted` ⇒ `posted_version = version` và có bút toán hiệu lực | error |
| `EVENT_PENDING_AGE` | Sự việc `pending` / `error` quá N ngày | warn |
| `COST_FILL_OPEN` | Dòng `cost_fill` còn 0 ở tháng đã qua | warn |
| `TRANSIT_NONZERO` | Số dư 1579 / 11319 khác 0 quá N ngày | warn |
| `DEBT_MATCH_LEDGER` | Σ `debt_items` mở = số dư tài khoản công nợ theo đối tượng | error |
| `TAX_BOOK_MATCH` | Sổ hoá đơn = phát sinh 33311 / 1331 theo kỳ | warn |
| `MIGRATIONS_PENDING` | Còn migration chưa áp | error |
| `SETTINGS_UNKNOWN` | Khoá trong `tenants.settings` không có trong registry | warn |

Phản hồi:

```json
{ "ok": true, "data": { "tenant": "tgs", "at": "2026-10-28T09:00:00+07:00", "summary": { "pass": 10, "warn": 2, "error": 0 },
  "checks": [ { "code": "LEDGER_BALANCED", "level": "pass", "count": 0, "sample": [] },
              { "code": "EVENT_PENDING_AGE", "level": "warn", "count": 14, "sample": ["btsoft:95:sale:3058"] } ] } }
```

Mỗi kiểm cũng là một hàm trong `@bizcity/test-kit` (`assertLedgerInvariants`) để test gọi ở `afterAll` (R-QG-5).

**Đã chạy được ngay (trước khi có endpoint):** lane diagnostics của bộ kiểm chuẩn, [tests/conformance/diagnostics/](../../tests/conformance/README.md). Cùng mã kiểm, chạy trên CSDL thật trong giao dịch `READ ONLY`:

```bash
BIZCITY_PSQL="docker exec -i ketoan-db-1 psql -U ketoan -d ketoan" node tests/conformance/selfcheck.mjs --lane diagnostics
```

| Mã ở bảng trên | Check | Trạng thái |
|---|---|---|
| `LEDGER_BALANCED`, `LEDGER_BALANCES_DAILY`, `LEDGER_REVERSED_ONCE`, `LEDGER_ORPHAN` | DG-LEDGER-1..4 | có |
| `EVENT_POSTED_VERSION`, `EVENT_PENDING_AGE` (+ `EVENT_HAS_ENTRY`) | DG-EVENT-1..3 | có |
| `MIGRATIONS_PENDING`, `SETTINGS_UNKNOWN` | DG-DB-1, DG-SET-1 | có |
| `DEBT_MATCH_LEDGER`, `TAX_BOOK_MATCH`, `COST_FILL_OPEN`, `TRANSIT_NONZERO` | DG-PLAN-1..4 | giữ chỗ (cần AccountResolver) |

Khi làm endpoint (Phase 2), dùng lại SQL trong `ledger.diag.mjs` để hai nơi ra cùng kết quả.

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
