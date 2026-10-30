# Bộ kiểm chuẩn Bizcity Core (`tests/conformance/`)

> **Một chuẩn, một chỗ, một bảng điểm.** Mọi kiểm hợp đồng, luật và chuẩn module viết ở đây, theo khuôn `bizcity_check@1`. Không viết test hợp đồng rải rác nơi khác.
> Không cần `npm install` (Node ≥ 22, không gói ngoài). Không sửa code ứng dụng: bộ kiểm chỉ **đọc**.
> Luật: [docs/standard/CONFORMANCE.md](../../docs/standard/CONFORMANCE.md) · Quyết định: [ADR-0006](../../docs/adr/ADR-0006-bo-kiem-chuan-mot-cho.md)

## 1. Chạy

```bash
node tests/conformance/selfcheck.mjs                    # cả repo: lane selfcheck + diagnostics (nếu có CSDL)
node tests/conformance/selfcheck.mjs --module modules/x # kiểm một module trước khi cài → modules/x/.bizcity/check-report.json
node tests/conformance/selfcheck.mjs --self-test        # bộ kiểm tự kiểm trên fixtures (chạy khi sửa bộ kiểm)
node tests/conformance/selfcheck.mjs --list             # danh sách check
node tests/conformance/selfcheck.mjs --only SC-KERNEL   # chạy một phần (không ghi latest/)
node tests/conformance/selfcheck.mjs --help
```

Mã thoát: `0` ĐẠT · `1` KHÔNG ĐẠT · `2` lỗi dùng lệnh / lỗi bộ kiểm.

## 2. Hai lane chạy song song

```text
                    ┌─ lane SELFCHECK (worker_threads, tĩnh) ── checks/**/*.check.mjs ──┐
selfcheck.mjs ──────┤                                                                   ├──► judge (baseline) ──► scoreboard ──► output/
                    └─ lane DIAGNOSTICS (CSDL thật, READ ONLY) ── diagnostics/*.diag.mjs ┘
```

| Lane | Mã | Đọc gì | Khi nào chạy |
|---|---|---|---|
| **selfcheck** | `SC-*` | mã nguồn, migration, tài liệu, hợp đồng, manifest | mọi máy dev, mọi PR (CI job `conformance`) |
| **diagnostics** | `DG-*` | CSDL PostgreSQL, giao dịch `READ ONLY` | khi có CSDL: CI sau test, sau triển khai (R-QG-10), máy dev |

Lane diagnostics dùng **cùng mã kiểm** với `GET /api/v1/system/diagnostics` ([DIAGNOSTICS.md §2](../../docs/ops/DIAGNOSTICS.md)). Khi endpoint có (Phase 2), hai nơi phải ra cùng kết quả.

## 3. Đầu ra (`output/`, không đưa lên git)

```text
tests/conformance/output/
├── latest/                 lần chạy đầy đủ gần nhất (đè)
│   ├── SCOREBOARD.md       bảng điểm cho người đọc, dán được vào PR
│   ├── scoreboard.html     cùng nội dung, mở bằng trình duyệt
│   ├── scoreboard.json     bizcity_scoreboard@1 — máy đọc, CI so xu hướng
│   ├── selfcheck.json      từng phát hiện lane selfcheck (bizcity_check_result@1)
│   ├── diagnostics.json    từng phát hiện lane diagnostics
│   └── evidence.txt        khối BẰNG CHỨNG dán vào PR (DIAGNOSTICS.md §4)
├── runs/<runId>/           20 lần gần nhất; chạy một phần: runs/<runId>-mot-phan/
└── history.jsonl           một dòng mỗi lần chạy đầy đủ: điểm theo thời gian
```

`--module` ghi vào `<module>/.bizcity/` cùng cấu trúc, thêm `check-report.json` gắn `sourceHash` (CONFORMANCE §3).

## 4. Chỉ CSDL cho lane diagnostics

Không tự dò. Chọn một:

```bash
# Docker compose của dự án (không cần cài psql trên máy)
BIZCITY_PSQL="docker exec -i ketoan-db-1 psql -U ketoan -d ketoan" node tests/conformance/selfcheck.mjs
# hoặc
node tests/conformance/selfcheck.mjs --psql "docker exec -i ketoan-db-1 psql -U ketoan -d ketoan"
# hoặc DATABASE_URL + gói pg đã cài (npm install)
DATABASE_URL=postgres://ketoan:ketoan@localhost:5432/ketoan node tests/conformance/selfcheck.mjs
```

Trên Git Bash (Windows) thêm `MSYS_NO_PATHCONV=1` trước lệnh. Mọi truy vấn chạy với `default_transaction_read_only = on`. CSDL trống thì check ghi "đạt rỗng": đạt nhưng chưa chứng minh gì.

## 5. Bảng điểm: ba điểm, không cộng lẫn

| Điểm | Đo | Cách tính |
|---|---|---|
| **Tuân chuẩn** | code hiện tại tuân các check đang thực thi | trung bình có trọng số (`weight`) điểm từng check; điểm check = % đơn vị (tệp, bảng, cột, bút toán) không có phát hiện |
| **Sẵn sàng Standard v1** | Core đã có bao nhiêu thứ Standard v1 hứa | trung bình của: % năng lực `available` trong `bizcity-standard.json`; % năng lực ca chuẩn Hợp đồng cần đã có; độ sẵn sàng các check `planned` |
| **Độ phủ luật** | bao nhiêu luật có kiểm tự động | luật R-* (cột "Kiểm bằng" là test / CSDL / CI, hoặc có check ở đây) + STD-* (có CONF đã cài) + CONF-* (đã có check) |

**Lộ trình theo Phase.** Lần chạy đầy đủ còn tính [docs/standard/roadmap.json](../../docs/standard/roadmap.json): mỗi việc của PHASES có tín hiệu "xong" đo được (check đạt, hết một phát hiện, năng lực `available`, tệp có mặt, độ phủ, việc tay có `doneAt`). Bảng điểm in tiến độ từng Phase, ma trận mảng × Phase, việc kế tiếp, cảnh báo làm trái thứ tự; `history.jsonl` giữ `roadmap` để xem xu hướng.

Hạng: A ≥ 95 · B ≥ 85 · C ≥ 70 · D ≥ 50 · F. Bảng điểm chia thêm **theo hợp đồng**, **theo cổng** (KERNEL, CONF-MAN, CONF-STATIC, CONF-MIG, CONF-RUN, DOCS) và **theo phân hệ / add-in**; mỗi điểm có cột so với lần chạy đầy đủ trước.

Kết luận ĐẠT / KHÔNG ĐẠT **không** dựa vào điểm: chỉ cần một check `fail` hoặc `error` là KHÔNG ĐẠT. Điểm để theo dõi tiến độ, cổng để chặn.

## 6. Trạng thái check và bánh cóc (baseline)

| Trạng thái | Nghĩa | Làm đỏ? |
|---|---|---|
| ✔ `pass` | không phát hiện | — |
| ◐ `debt` | chỉ có phát hiện đã ghi trong [baseline.json](baseline.json) (nợ đã biết) | không |
| ▲ `warn` | check `enforce: info` có phát hiện | không |
| ✘ `fail` | có phát hiện **mới**, hoặc check `block` có phát hiện | **có** |
| ! `error` | check tự lỗi, quá giờ | **có** |
| ○ `planned` | năng lực Core chưa có; chỉ đo độ sẵn sàng | không |
| · `skip` | lane diagnostics chưa có CSDL | không |

`baseline.json` thay các biến `DEBT_*` của `scripts/kiem-chuan.sh`. Mỗi mục là dấu vân tay `check|tệp|khoá` **không chứa số dòng**, nên thêm dòng phía trên không làm đỏ. Quy tắc:

- Sửa xong nợ → bộ kiểm báo "↳ N mục nợ đã hết" → chạy `--update-baseline` để bánh cóc chặt lại (CI `--strict` đòi việc này).
- **Thêm** nợ mới vào baseline cần người duyệt nhóm Lõi (CODEOWNERS) và `ref` (ADR, mã audit). Check `block` không có nợ: mọi phát hiện đều đỏ.
- `locks/migrations.lock.json`: băm các migration đã phát hành (R-DB-1). Cập nhật bằng `--update-lock` **chỉ** khi phát hành.

## 7. Viết check mới (`bizcity_check@1`)

1. Chọn lane: tĩnh → `checks/<nhóm>/*.check.mjs`; cần CSDL → `diagnostics/*.diag.mjs` (dùng `sqlCheck` cho kiểm SQL thuần).
2. Xuất `default` (một check) hoặc `checks` (mảng). Meta theo [schema/check.schema.json](schema/check.schema.json):

```js
export default {
  id: 'SC-DOC-9',                    // SC-* tĩnh, DG-* CSDL; không trùng
  title: 'Một câu tiếng Việt nói check đòi gì',
  gate: 'CONF-STATIC',               // KERNEL | CONF-MAN | CONF-STATIC | CONF-MIG | CONF-RUN | DOCS
  contract: 'bizcity_action',        // hợp đồng chấm điểm
  rules: ['STD-ACT-5'], conf: ['CONF-STATIC-9'],   // luật được kiểm → tính độ phủ
  tier: 1, enforce: 'ratchet', weight: 3,          // enforce: block | ratchet | info | planned (+ phase)
  targets: ['repo', 'module'], scope: 'module',    // chạy được với --module; chấm điểm theo phân hệ
  run(ctx) {
    const hits = ctx.repo.grep(/reply\.status\(5\d\d\)/, { under: ['apps/api/src'], ext: ['.ts'] });
    return { examined: ctx.repo.files({ under: ['apps/api/src'], ext: ['.ts'] }).length,
             findings: hits.map((h) => ctx.finding(h.file, h.line, h.text, 'reply.status')) };
  },
};
```

3. `ctx` chỉ đọc: `ctx.repo` (gốc đang kiểm), `ctx.core` (chuẩn, schema), `ctx.migrations()`, `ctx.standard()`, `ctx.validate(schema, data)`, `ctx.db.query(sql)` (diagnostics). `key` của phát hiện phải ổn định (không chứa số dòng, thời gian).
4. **Thêm ca tự kiểm**: cài một vi phạm vào `fixtures/repo-bad/` hoặc `fixtures/module-bad/` và một dòng trong [fixtures/expect.json](fixtures/expect.json). Check chưa có ca tự kiểm thì chưa được tin.
5. Chạy `--self-test`, rồi chạy đầy đủ; check `ratchet` phát hiện nợ cũ thì ghi baseline kèm `ref`.

## 8. Danh sách check hiện có

`node tests/conformance/selfcheck.mjs --list`. Tóm tắt:

| Nhóm | Check | Thay / bổ sung cho |
|---|---|---|
| Kernel | SC-KERNEL-1..5, SC-QG-1 | `scripts/kiem-chuan.sh` (cùng luật, nợ chuyển vào baseline) |
| Data (CONF-MIG) | SC-DATA-1..7 | kiểm số migration CI; thêm khoá băm, COMMENT, kiểu tiền, tenant_id, RLS; `db/types.ts` ↔ migration |
| Module (CONF-STATIC, CONF-MAN) | SC-MOD-1..3, SC-CON-2 | `phan-he-ranh-gioi.test.ts` (giữ nguyên); thêm ghi bảng lõi, manifest |
| Lớp (CONF-STATIC) | SC-LAYER-1 (nhãn `@bizcity-layer`), SC-LAYER-2 (chiều import giữa lớp, ratchet) | dependency-cruiser ở PHASES 1.4; bảng lớp [`lib/layers.mjs`](lib/layers.mjs), đồ thị [`lib/depgraph.mjs`](lib/depgraph.mjs), mốc `scripts/do-thi-phu-thuoc.mjs` |
| Action / API / Event / Evidence | SC-API-1..3, SC-ACT-1, SC-EVT-1, SC-EVD-1..2 | grep tay trong review |
| Bảo mật, phát hành | SC-SEC-1..4, SC-REL-1..2 | review tay theo RULE-SECURITY, RULE-RELEASE |
| Gói định khoản | SC-TPL-1 (`--module <thư mục gói>` kiểm một gói) | mới — [bizcity_posting_template@1](../../docs/contracts/BIZCITY-POSTING-TEMPLATE-v1.md) |
| Hợp đồng, tài liệu, lộ trình | SC-CON-1..7, SC-DOC-1..2, SC-RMP-1, SC-DIAG-1 (mã chẩn đoán app ↔ lane) | kiểm schema tay bằng ajv; kiểm liên kết tay; PHASES.md ↔ roadmap.json |
| Diagnostics (CONF-RUN) | DG-LEDGER-1..4, DG-EVENT-1..4, DG-DB-1..4, DG-SET-1, DG-SEC-1..2, DG-PLAN-1..6 | `GET /system/diagnostics` (Phase 2) |

Test vitest có sẵn (`api-examples.test.ts`, `phan-he-ranh-gioi.test.ts`, `db-rules.test.ts`…) **giữ nguyên**: chúng chạy code thật. Bộ này kiểm phần tĩnh và toàn vẹn CSDL. Phần chạy thật trên Core (CONF-RUN-1..17, CONF-UPG) vào đây ở Phase 4 dưới dạng lane thứ ba `runtime`.
