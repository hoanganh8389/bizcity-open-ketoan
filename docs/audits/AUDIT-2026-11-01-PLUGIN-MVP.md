# Đánh giá 2026-11-01: Accounting Kernel ổn định + hệ sinh thái Drop-in Plugin — đạt bao nhiêu %, chuẩn hoá thế nào
<!-- [2026-11-01 09:52 PM Johnny Chu - Chu Hoàng Anh] AUDIT — đánh giá Kernel + plugin runtime so với mục tiêu "drop-in plugin kiểu WordPress", phản biện yêu cầu, lộ trình PR nhỏ theo phase. -->
<!-- [2026-11-01 10:16 PM Johnny Chu - Chu Hoàng Anh] ADR-0011 — chủ duyệt: §6.2 D1–D6 chốt ở ADR-0011 (D3 ba mức tin cậy, D4 chặn bằng vai trò CSDL), §7 thêm PR-2b app ngoài tiến trình, §9 đã quyết -->

> Theo yêu cầu của chủ dự án (Johnny Chu – Chu Hoàng Anh): *"Mô hình kiến trúc hiện tại đã đạt bao nhiêu % so với yêu cầu tiến tới Accounting Kernel ổn định + hệ sinh thái Drop-in Plugin giống trải nghiệm WordPress, nhưng tuân thủ bất biến kế toán và an toàn multi-tenant; phản biện yêu cầu; chuẩn hoá từ kiến trúc đến phase việc cụ thể."*
> Đo ngày 2026-11-01 trên nhánh `feat/phase-0-tiep` **sau khi gộp `main` tới `62e44cd`** (PHASE-018 W5 OpenTelemetry, PHASE-019 W0), CSDL `ketoan_test` đủ migration 0001–0048. Mọi con số là kết quả chạy hôm nay, không lấy lại số lịch sử (xem §5). Bằng chứng mã ghi `tệp:dòng`; đường dẫn Kernel / Platform là gói mới `packages/kernel/src`, `packages/platform/src` (PHASES 2.3 xong 2026-11-01).
> Biên bản trước: [AUDIT-2026-10-30-KIEN-TRUC](AUDIT-2026-10-30-KIEN-TRUC.md) (50%). Thư mục phase: [docs/phases/](../phases/README.md).

## Trả lời ngắn

**Khoảng 55% mục tiêu** — chia hai nửa rất lệch:

| Nửa | Đạt | Một câu |
|---|---|---|
| **Accounting Kernel ổn định** (nhiệm vụ 2, P0) | **~85%** | Một cửa ghi sổ, chính sách có phiên bản + ngày hiệu lực, outbox + retry + consumer idempotent, RLS 84 bảng, Kernel đã là gói riêng `@bizcity/kernel`. Còn 3 lỗ ở tầng CSDL / ngữ cảnh (P0-1..P0-3 §4). |
| **Drop-in Plugin runtime** (nhiệm vụ 3–4) | **~15%** | Có *hợp đồng* (schema manifest, API.md của SDK, bộ kiểm `--module`) nhưng **chưa có runtime nào đọc manifest**; module lắp tĩnh theo mảng import, bật / tắt theo biến môi trường của **tiến trình**, không theo đơn vị; `@bizcity/module-sdk` chưa có mã; không có schema riêng, migration riêng, quyền riêng, `settings.get` cho module. |

Số máy đo cùng ngày: lộ trình Phase 0–5 **50%** (P2 88 · P3 46 · P4 17 · P5 0), năng lực Standard v1 **28/42 available**, ma trận tuân thủ C-1..C-9 **6 đạt · 3 một phần · 0 thiếu** (lane diagnostics), tuân chuẩn 97,9 (A), vitest §5.

Nói cách khác: **sổ đã đúng và đã thành gói; nhưng "cắm plugin vào là chạy" chưa tồn tại — mới có bản vẽ.** Phần còn lại không phải viết lại gì, mà là **nối những thứ đã có** (manifest ↔ registry ↔ `defineAction` / `defineSubscriber` ↔ migration ↔ menu) thành một vòng đời.

## 1. Phản biện yêu cầu

Yêu cầu đúng ở hướng (một Kernel ổn định, cộng đồng tự do ở vòng ngoài — đúng Tuyên bố tối thượng). Bốn chỗ cần nói lại cho rõ trước khi đổi thành việc:

| # | Yêu cầu | Phản biện | Chốt |
|---|---|---|---|
| R1 | "Giống trải nghiệm WordPress: chép plugin vào thư mục là chạy" | WordPress chạy **mọi tệp PHP trong `wp-content/plugins`** — đó là lý do nó là nền tảng bị tấn công nhiều nhất. Yêu cầu của chủ cũng tự mâu thuẫn ở nhiệm vụ 3: "plugin **không được** tự thực thi mã chỉ vì được chép vào thư mục". | Giữ **trải nghiệm** (tìm → cài → bật → nâng cấp → tắt, không sửa Core), **không giữ cơ chế**. Drop-in = **gói có manifest, đã kiểm, đăng ký qua registry**; thư mục chỉ là nơi chứa, registry CSDL mới là nguồn sự thật "đang bật". |
| R2 | "Bộ nền tảng chung: Users, Usermeta, Options, Posts, Postmeta, Taxonomies, Roles, Hooks" | 5/8 đã có tương đương và **mạnh hơn** WP (bảng §6.1). Hai thứ **không nên** chép: *Postmeta* (EAV tự do → không kiểm được, không báo cáo được; WP tự hối hận với `wp_postmeta`) và *Options* dạng túi key-value không khai báo (đã có registry khoá có kiểm DG-SET-1). | Cung cấp **Documents** (chứng từ có phiên bản, liên kết, đính kèm, chữ ký — đã có) thay Posts/Postmeta; **Settings registry** (khai báo khoá trong manifest) thay Options; **Dimensions / taxonomies** đã có ở danh mục chuẩn. |
| R3 | "Developer không cần quan tâm nội bộ" | Đúng với mọi thứ **trừ sự thật kế toán**: plugin **phải** quan tâm đến `reasonCode`, `docType`, kỳ khoá, idempotency — đó là hợp đồng, không phải nội bộ. Giấu đi là tạo plugin ghi sai sổ. | SDK giấu **cách ghi** (tài khoản, bút toán, bảng) nhưng bắt khai **ý định** (`ctx.ledger.submit({docType, reasonCode, lines})`). |
| R4 | "Mockup thêm plugin trên dashboard" | Màn hình hiện tại (ảnh 2) đã là launcher theo module: 10 ô, mỗi ô là một `WebModule` tĩnh. Thêm ô "＋ Thêm phân hệ" mà phía sau chưa có registry đơn vị thì ô đó chỉ là ảnh. | Mockup làm **sau** PR-1 (registry đơn vị, §7); mockup đi kèm API thật `GET /system/modules?tenant`. Bản vẽ ở §6.3. |

Hai nguyên tắc chủ đặt ra mà hiện trạng **đã tuân**: không Prisma (SQL là nguồn sự thật, R-DB-14), không có Plugin SDK / Registry song song (chỉ có một bản nháp `packages/module-sdk/API.md`, chưa mã; một registry action `packages/platform/src/core/actions.ts:141`). Lộ trình §7 **không tạo thêm lớp trừu tượng**: dùng `defineAction`, `defineSubscriber`, `event_outbox`, `tenants.settings`, `bizcity.module.json` đang có.

## 2. Bảng hiện trạng (đọc mã, không đọc README)

Ký hiệu: ✅ có · ◐ một phần · ✘ chưa có · ⚠ sai chuẩn so với hợp đồng / CANON.

### 2.1 Nhiệm vụ 2 — nền tảng P0

| Yêu cầu | TT | Bằng chứng | Còn thiếu |
|---|---|---|---|
| Một cửa ghi sổ | ✅ | `ledgerService.post` chỉ 3 nơi gọi, đều trong Kernel: `packages/kernel/src/modules/posting/posting.service.ts:168`, `modules/documents/event-store.ts:84`, `modules/ledger/ledger.service.ts:207` (đảo). Ngoài Kernel không có INSERT `ledger_*` / `accounting_events` (SC-KERNEL-1..3 đạt). Cổng duy nhất `packages/kernel/src/index.ts` (SC-KERNEL-6). | `eventStore` ở cổng công khai còn `apps/api/src/modules/assets/asset.service.ts:692-735` gọi trực tiếp (hợp lệ theo câu 3 AGENTS — "sự việc Kernel tự lập", nhưng tài sản là module D; xem P1-4). |
| Chính sách định khoản có version + ngày hiệu lực | ◐ | `posting_policy_versions` (`db/migrations/0040_chinh_sach_phien_ban.sql:14-26`, chỉ thêm `:29-35`); chọn theo ngày chứng từ `packages/kernel/src/modules/posting-config/policy.ts:83-93`; `policy_version` ghi vào `ledger_entries` / `posting_log` (`ledger.service.ts:133`, `document.service.ts:285`). C-9 đạt. | Mã luật `posting/rules/*.ts` (`posting.service.ts:33`) **không có version / hash** — đổi code luật là đổi chính sách mà không có dấu; `config_packs` có SemVer nhưng không có `effective_from` (`0042:11-25`). P1-1. |
| Outbox + retry + subscriber idempotent | ✅ | `event_outbox` / `event_deliveries` / `event_consumptions` (`0039_su_kien_mien.sql:12-60`); `emitEvent` trong giao dịch người gọi (`packages/platform/src/core/events.ts:131-152`); `deliverOne` SKIP LOCKED + `event_consumptions` ON CONFLICT → phát lại = `duplicate` (`:203-225`); backoff 8 lần rồi `dead` (`:232-241`); vòng giao 1 s `main.ts:29`; test phát lại chạy handler đúng một lần `apps/api/test/events.test.ts:96-107`. | Subscriber chạy **không gắn đơn vị**: `withRequestContext({requestId, correlationId})` ở `events.ts:221` không có `tenantId` → GUC `bizcity.tenant_id` rỗng → RLS **mở** trong giao dịch của subscriber (`0041:13-16` trả TRUE khi rỗng). **P0-2.** |
| Tenant isolation + bảo vệ bảng lõi | ◐ | RLS ENABLE + FORCE + policy trên 84 bảng (`0041_co_lap_don_vi_rls.sql`), GUC đặt mỗi lần lấy kết nối (`packages/platform/src/db/client.ts:38-58`); vai trò `ketoan_app` NOSUPERUSER NOBYPASSRLS (`0032:22-35`); trigger chỉ thêm `ledger_lines`, `ledger_links`, `posting_log` (`0006:646-682`); test chéo đơn vị `apps/api/test/tenant-isolation.test.ts`. | **`ledger_entries` chỉ có trigger chặn TRUNCATE, không chặn UPDATE / DELETE** — xác nhận trên CSDL thật hôm nay (`pg_trigger`: chỉ `ledger_entries_no_truncate`). Lý do lịch sử: `posting.service.ts:160` sửa tại chỗ header (SC-KERNEL-1 whitelist `:36`). `accounting_events` / `accounting_event_versions` không có trigger. **P0-1.** Docker mặc định vẫn nối bằng `ketoan` (owner, bypass RLS): `docker-compose.yml:25,79` `DB_APP_USER:-ketoan`. **P0-3.** |
| Tách gói Kernel + Module SDK | ◐ | `packages/kernel` (60 tệp), `packages/platform` (22 + tracing), build / Docker / bộ kiểm theo gói — commit `25ceee6`, `8a1c804`, `9bd71cc`. | `packages/module-sdk` chỉ có `API.md:9` ("bản nháp, chưa có code"), không `package.json`. |

### 2.2 Nhiệm vụ 3 — Drop-in plugin runtime

| Yêu cầu | TT | Bằng chứng | Còn thiếu |
|---|---|---|---|
| Manifest `bizcity.module.json` | ◐ | Schema đầy đủ `docs/contracts/BIZCITY-MODULE-v1.schema.json` (id, kind, version, requires, permissions, data `mod_*`, documents, actions, events, ledger.submits, settings, extensions.menu, waivers; `additionalProperties:false`). SC-CON-2 kiểm schema. | **0/9 phân hệ, 0/3 add-in có manifest**; chỉ 2 fixture test. **Không có mã runtime nào đọc manifest** (grep `apps/`, `packages/`: 0). |
| Discovery, validation, registry, dependency | ✘ | Lắp tĩnh: `apps/api/src/phan-he/index.ts:14-27` `API_MODULES = [...]`; `enabledModules()` lọc theo env `ENABLED_MODULES` (`:30-39`), có `includes` (vd `ke-toan/index.ts:14`). Web: `apps/web/src/phan-he/index.ts:6-23`. | Không readdir / dynamic import; không kiểm version / capability lúc chạy; không bảng registry. |
| Install / activate / deactivate / upgrade | ✘ | `Errors.moduleDisabled` có định nghĩa (`packages/platform/src/core/errors.ts:42`) nhưng **không nơi nào gọi**. `GET /api/v1/system/modules` trả danh sách của tiến trình (`system.routes.ts:250-253`). | Không bảng `tenant_modules`; không trạng thái theo đơn vị; không vòng đời. |
| Namespace / schema riêng | ✘ | Chỉ có `CREATE SCHEMA bizcity_read` (`0043:15`, view chỉ đọc). Bảng module nằm chung `public` trong migration lõi (`0010_mua_hang.sql`…). | Schema `mod_<key>` theo manifest chưa có; `ctx.data.tx` là Kysely thô toàn CSDL (`actions.ts:51-95`) — module đọc / ghi được mọi bảng trong quyền RLS của đơn vị (chỉ SC-MOD-2 tĩnh chặn, chưa chặn ở CSDL; roadmap 3.10). |
| Migration có kiểm, qua cơ chế tin cậy | ✘ | Runner một thư mục phẳng `db/migrations`, một bảng `schema_migrations` (`packages/platform/src/db/migrate.ts:77-88`). Năng lực `data.migrations.module` **planned**. | Migration của plugin, thứ tự, rollback, kiểm "không chạm bảng Kernel". |
| Không tự thực thi mã khi chép vào thư mục; MVP chỉ gói đã kiểm / cách ly | ◐ (vô tình) | Vì không có discovery nên hiện **không gì tự chạy** — nhưng đó là do thiếu, không phải do thiết kế. Add-in cũng tĩnh: `apps/api/src/addins/index.ts:9-13`, `AddInContext{db, log}` CSDL thô (`core/addins.ts:34-37`). | Cơ chế "gói đã kiểm": chữ ký / checksum, registry nguồn, cách ly. |

### 2.3 Nhiệm vụ 4 — Developer experience

| Yêu cầu | TT | Bằng chứng | Còn thiếu |
|---|---|---|---|
| `@bizcity/module-sdk` | ✘ | `packages/module-sdk/API.md` (bản nháp). Mặt tiền thật đang nằm ở Platform: `defineAction` (`actions.ts:144-153`), `defineSubscriber` (`events.ts:76-99`), `ActionContext` có `data.tx`, `evidence`, `events.emit`, `ledger.query`, `actions.call`, `trace.step`, `documents.*` (`actions.ts:51-95`). | `ctx.ledger.submit` / `cancel`, `ctx.settings`, `ctx.module`, `defineModule` — mới trong API.md:66-122. Quyền là danh sách đóng `auth.ts:30`; `permissions.module` planned. |
| Starter CLI, ví dụ POS | ✘ | Roadmap 4.1 / 4.2 (0%); ca chuẩn Hợp đồng `docs/standard/GOLDEN-CASE-HOP-DONG.md` là mô tả. | `packages/cli`, `templates/starter-module`, `modules/pos-mini`. |
| Công khai API, capability, events, lỗi, receipt | ✅ | `/api/v1/system/capabilities` (test `diagnostics.test.ts`), OpenAPI từ action (`mountActions` `actions.ts:393-433`), `bizcity_errors@1`, biên nhận `meta.receipt` (`actions.ts:338-341`), MCP sinh từ action. | Receipt chỉ ở route `defineAction` (9 tệp); cửa nạp `POST /api/v1/documents` là route thường (`packages/kernel/src/modules/documents/document.routes.ts:70-79`) → không `Idempotency-Key`, không receipt (idempotent theo docKey + version). P1-2. |
| Hướng dẫn cho Claude Code / Cursor | ◐ | AGENTS.md mục "Tạo module mới", 7 hợp đồng, `GOLDEN-CASE`. | Hướng dẫn trỏ vào SDK chưa tồn tại; 4.4 `modules/<key>/AGENTS.md` từ template. |
| CI kiểm tương thích plugin | ◐ | `tests/conformance/selfcheck.mjs --module <dir>` + CI `conformance.yml`. | Chưa có lane *runtime* (CONF-RUN: cài → bật → gửi → receipt) — roadmap 4.3. |

### 2.4 Đối chiếu biên bản 30/10 → hôm nay

| Mục 30/10 | 30/10 | 01/11 | Ghi chú |
|---|---|---|---|
| Kernel: sổ đúng | cao | cao | A-01 hết (eventStore); C-1, C-2, C-3 đạt trên lane diagnostics |
| Kernel: chính sách | thấp (C-9 0%) | ◐ (C-9 100%) | 0040 + policy.ts; còn version mã luật |
| Kernel: cấu trúc | thấp (chưa tách gói) | ✅ | `packages/kernel`, `packages/platform` |
| Platform: sự kiện | không có | ✅ | 0039, events.ts |
| Data: cô lập đơn vị | trung bình | ◐ | RLS có; còn P0-2, P0-3 |
| Module / SDK | thấp | thấp | **không đổi** — đây là nửa 15% |
| Lộ trình Phase 0–5 | 33% | 50% | P2 84→88 (sau khi sửa 7 tín hiệu trỏ sai, §5) |
| Năng lực available | 11/41 | 28/42 | |

**⚠ Sai chuẩn tự phát hiện khi rà:** 7 tín hiệu máy của `compliance-matrix.json` / `roadmap.json` (C-4 ×2, C-8 ×2, C-9, 2.10, 2.13, 2.14) còn trỏ `apps/api/src/...` sau tách gói → báo ✘ **giả** (C-4, C-8, C-9 hiện 33–50% trong bảng điểm cũ). Đã trỏ sang `packages/*` trong cùng PR; C-4 / C-8 / C-9 về 100%. Bài học → luật dò: tín hiệu `fileContains.file` phải tồn tại (thêm vào SC-RMP-1, việc §7 PR-0).

## 3. Lỗi ranh giới Kernel, quyền ghi sổ, versioning, event runtime (nhiệm vụ 1.4)

| Trục | Kết quả | Dẫn |
|---|---|---|
| Ranh giới Kernel | Đạt tĩnh: SC-KERNEL-1..7, SC-LAYER-2 (12 cạnh nợ cũ, không tăng), SC-MOD-1 đạt. Kernel không import ngoài Kernel / Platform. | `tests/conformance/output/latest/SCOREBOARD.md` |
| Quyền ghi sổ ở tầng CSDL | **Chưa đủ**: `ledger_entries` không có trigger UPDATE/DELETE; API dev nối bằng owner. | P0-1, P0-3 |
| Versioning | Hợp đồng đều `-draft`, Standard `1.0.0-draft`; SC-REL-1/2, SC-CON-2/4 kiểm nhất quán; **chưa có** check "đổi hợp đồng phải tăng version" (SC-VER-*). | `bizcity-standard.json:3`; roadmap 4.6 |
| Event runtime | Đạt: giao, thử lại, chết, phát lại, trace link (`trace_parent` 0047). Lỗ: tenant context (P0-2); `defineSubscriber` không có cờ `idempotent` — mọi subscriber được khử trùng bằng `event_consumptions`, chấp nhận được (mạnh hơn cờ). | `events.ts:95-99` |

## 4. Phát hiện xếp P0 / P1 / P2

**P0 — chặn "Kernel ổn định" (sửa trước khi mở cho plugin ngoài):**

| # | Phát hiện | Bằng chứng | Cách sửa (nhỏ, không viết lại) | Phase |
|---|---|---|---|---|
| P0-1 ✅ | `ledger_entries` sửa / xoá được ở tầng CSDL (chỉ chặn TRUNCATE); `accounting_events`, `accounting_event_versions` không trigger | `0006_goc_so_cai.sql:640`; `pg_trigger` trên `ketoan_test` hôm nay | Migration `0049`: trigger BEFORE UPDATE/DELETE trên `ledger_entries` **chỉ cho phép** cột header mà `posting.service.ts:160` đang sửa (liệt kê rõ) và nhánh `cost_overwrite` như `ledger_lines`; `accounting_event_versions` chỉ thêm; `accounting_events` chặn DELETE. DG-DB-2 thêm 3 dòng. | 004 (W-bổ sung) |
| P0-2 ✅ | Subscriber (sẽ là mã plugin) chạy với GUC đơn vị rỗng → RLS mở, plugin đọc được dữ liệu đơn vị khác nếu quên lọc | `events.ts:221`; `0041:13-16` | `withRequestContext({..., tenantId: evt.tenantId})`; test: subscriber của A `select` không thấy dòng của B. | 006 (W-bổ sung) |
| P0-3 ✅ | Bản cài mặc định nối CSDL bằng owner `ketoan` → bypass RLS, tắt được trigger | `docker-compose.yml:25,79`; `tenant-isolation.test.ts:86` chỉ chạy khi `DB_SET_ROLE` | `DB_APP_USER` mặc định `ketoan_app` trong compose + `cai-nhanh.sh`; CI đặt `DB_SET_ROLE=ketoan_app` để test pool chạy. | 001 S001-? (việc tay chủ đã ghi 30/10, A-6) |

<!-- [2026-11-01 10:55 PM Johnny Chu - Chu Hoàng Anh] AUDIT — PR-P0 xong trên feat/phase-0-tiep: 0049 trigger, subscriber gắn đơn vị, ketoan_app mặc định -->
> **PR-P0 xong 2026-11-01** (nhánh `feat/phase-0-tiep`): P0-1 migration `0049_khoa_dau_but_toan.sql` + 3 ca `db-rules.test.ts`; P0-2 `deliverOne` chạy trong ngữ cảnh đơn vị (`packages/platform/src/core/events.ts`) + ca `events.test.ts` — **kiểm ngược: bỏ bản vá thì subscriber thấy 33.896 sự việc của đơn vị khác, có bản vá thấy 0**; P0-3 compose mặc định `ketoan_app`, CI chạy test dưới `DB_SET_ROLE=ketoan_app` (ca RLS của pool hết bị bỏ qua).

**P1 — chặn "plugin đúng sổ, có bằng chứng":**

| # | Phát hiện | Bằng chứng | Cách sửa | Phase |
|---|---|---|---|---|
| P1-1 | Mã luật định khoản không có version / hash → đổi code là đổi chính sách không dấu | `posting.service.ts:33`; `posting_log` không cột rule version | Hash nội dung `rules/*.ts` lúc build vào `policy_version` snapshot (`policy.ts` kind `publish`), ghi `rule_hash` vào `posting_log`; SC-* so hash với snapshot đầu. | 005 |
| P1-2 | Cửa nạp `POST /api/v1/documents` ngoài `runAction`: không `Idempotency-Key`, không receipt — plugin POS không "truy xuất biên nhận" được | `document.routes.ts:70-79`; receipt chỉ ở `defineAction` | Bọc ingest thành action `core.document.submit` (`defineAction`, effect write, idempotency `optional`) giữ route cũ làm alias; receipt = `audit_logs` hash. **Đây chính là `ctx.ledger.submit`.** | 011 |
| P1-3 | Module có toàn bộ CSDL qua `ctx.data.tx`; chặn chỉ bằng grep (SC-MOD-2, còn nợ A-17) | `actions.ts:51-95` | Roadmap 3.10 role `mod_<key>_rw` + schema `mod_<key>`; trước mắt: `ctx.data.tx` giữ nguyên, nhưng manifest `data.tables` + SC-MOD-2 **block** cho module có manifest. | 011 |
| P1-4 | `eventStore.overwriteCostPairs`, `eventStore.*` lộ ở cổng cho mọi module (**chủ quyết 01/11:** tài sản giữ `eventStore`; việc còn lại là không xuất lại `eventStore` trong `@bizcity/module-sdk`, SC-* chặn module mức 1 import nó) | `packages/kernel/src/index.ts:35`; `asset.service.ts:692-735` | Tách `eventStore` thành cổng **nội bộ Core** (`@bizcity/kernel/internal`, chỉ `modules/` của apps/api được import — SC-KERNEL-6 mở rộng), plugin chỉ có `submit`. | 010 |
| P1-5 | `tenants.settings` jsonb đọc rải rác 6+ chỗ; không `settings.get` theo registry | `date-rules.ts:59`, `posting-modes.ts:30`, `system.routes.ts:55…` | `settingsService.get(trx, tenantId, key)` kiểm key theo registry + manifest `settings[]`; DG-SET-1 đã kiểm key lạ. | 011 (3.6) |

**P2 — chất lượng / DX:**

| # | Phát hiện | Cách sửa | Phase |
|---|---|---|---|
| P2-1 | 15 GitHub Action chưa ghim SHA (SC-SEC-4 cảnh báo, từ 30/10 là 14) | ghim | 001 |
| P2-2 | Add-in `tro-ly` lưu dữ liệu ở tệp `<DATA_DIR>/tro-ly/<tenant>.jsonl` ngoài CSDL, ngoài RLS, ngoài sao lưu PITR | chuyển vào bảng `mod_tro_ly.*` khi có migration module | 011 |
| P2-3 | Hợp đồng đều `-draft`, chưa có luật "đổi hợp đồng phải tăng version" | SC-VER-1 | 014 (4.6) |
| P2-4 | `AddInContext{db, log}` và `AddInManifest` là bộ thứ hai song song với module — vi phạm "không SDK song song" | gộp add-in = `kind: "addin"` của manifest (schema đã có `:174-178`) | 011 |

## 5. Bằng chứng kiểm thử hôm nay (nhiệm vụ 1.5–1.6)

Chạy trên nhánh sau gộp `main` `62e44cd` (OTel), Node 24, PostgreSQL 16 trong Docker `ketoan-db-1`, CSDL `ketoan_test`.

```
npm run typecheck                                   # 5 gói: contracts, platform, kernel, api, web — sạch
node tests/conformance/selfcheck.mjs --self-test    # ĐẠT
MSYS_NO_PATHCONV=1 BIZCITY_PSQL="docker exec -i ketoan-db-1 psql -U ketoan -d ketoan_test" \
  node tests/conformance/selfcheck.mjs --strict     # ĐẠT: 58 đạt · 10 nợ cũ · 4 cảnh báo · 0 không đạt · 0 lỗi
                                                    # Tuân chuẩn 97,9 A · Diagnostics 96,7 A · Sẵn sàng Standard 55,8 D · Độ phủ luật 41 F
bash scripts/kiem-chuan.sh                          # ĐẠT
node scripts/gan-nhan-lop.mjs                       # 230/230 tệp có nhãn
cd apps/api && DATABASE_URL=postgres://ketoan:ketoan@localhost:5434/ketoan_test npx vitest run
                                                    # 111 tệp, 855 ca: 843 qua · 0 đỏ · 1 bỏ qua (RLS pool, cần DB_SET_ROLE)
                                                    # 11 ca truy-vet.test.ts "pending" trong lượt gộp (worker tinypool không báo về);
                                                    # chạy riêng tệp: 11/11 qua, 4,9 s
```

Kiểm tay bổ sung: `pg_trigger` trên `ledger_entries` / `accounting_events` (P0-1); đọc `events.ts:215-226` (P0-2); `document.routes.ts:68-80` (P1-2).

## 6. Kiến trúc chuẩn hoá

### 6.1 Bộ nền tảng chung — tương đương WordPress, nhưng có kiểm

| WordPress | Bizcity đã có | Cho plugin dùng qua | Ghi chú |
|---|---|---|---|
| Users | `users`, `tenant_users`, API key, JWT, SSO WP | `ctx.actor`, `ctx.tenant` | đa đơn vị từ gốc (WP không có) |
| Usermeta | — | *không cung cấp* | dữ liệu người dùng của plugin → bảng `mod_<key>.*` có cột `user_id` |
| Options | `tenants.settings` + `bizcity-settings.registry.json` | `ctx.settings.get(key)` (P1-5) | khoá **khai báo trong manifest**, có kiểu, có mặc định; không túi key-value |
| Posts | `document_versions` / `document_links` / `document_attachments` / `document_signatures` (0045–0048) | `ctx.documents.*` (đã có 10 hàm) | mọi "bài viết" của ERP là chứng từ có phiên bản |
| Postmeta | — | *không cung cấp* | cột thật trong bảng module; cần linh hoạt thì `jsonb` **trong** bảng module |
| Taxonomies | `dimensions` (0044 view), danh mục chuẩn (partners, products, branches, warehouses, units, tax codes) | `bizcity_read.*`, `core.partner.upsert`… | plugin **không** tạo danh mục riêng (AGENTS "Tạo module mới" §5) |
| Roles / Capabilities | `PERMISSIONS` đóng (`auth.ts:30`), `requirePermission` | manifest `permissions[]` → registry mở (3.3) | `key:verb`, `risk`, `roles` mặc định |
| Hooks (actions / filters) | `event_outbox` + `defineSubscriber` (sau commit, idempotent) ; `extensions.slots` (ui, planned); `registerIncomingPreparer`… (hook Kernel nội bộ) | `defineSubscriber`, slot UI | **không có filter đồng bộ chạm sổ** — đó là nơi WP cho plugin sửa sự thật; ở đây sự thật chỉ đổi bằng chứng từ |
| Plugin API (`register_activation_hook`…) | ✘ | manifest + `defineModule({ onInstall, onActivate, onUpgrade, onDeactivate })` | §6.2 |

### 6.2 Vòng đời plugin (MVP: gói đã kiểm, không tự chạy)

```text
 thư mục modules/<key>/           registry CSDL                 tiến trình API
 ┌─────────────────────┐   bizcity module install   ┌──────────────────────┐   khởi động / bật   ┌────────────────────┐
 │ bizcity.module.json │ ────────────────────────▶ │ module_registry      │ ─────────────────▶ │ routes, actions,   │
 │ migrations/*.sql    │  kiểm schema (SC-CON-2)   │ (id, version, hash,  │  chỉ nạp gói có   │ subscribers, menu  │
 │ src/index.ts        │  kiểm requires/capability │  status, installed_at)│  status=active     │ của module ACTIVE  │
 │ (defineModule)      │  kiểm migration không     │ tenant_modules       │                    │ cho đơn vị bật     │
 └─────────────────────┘  chạm bảng Kernel         │ (tenant, module, on) │                    └────────────────────┘
                          ghi hash gói             └──────────────────────┘
```

> **Đã chốt 2026-11-01 ở [ADR-0011](../adr/ADR-0011-plugin-ba-muc-tin-cay.md)** (chủ duyệt; Core hướng tới developer tự host). Bảng dưới là bản đề nghị ban đầu, giữ để đối chiếu; hai chỗ đã đổi: **D3** thành ba mức tin cậy — module trong mã nguồn bản cài (repo gốc, fork hoặc monorepo của người tự host) · app ngoài tiến trình (khoá có phạm vi, webhook từ outbox, **iframe**) · gói ký chỉ từ Phase 5; **D4** chặn migration module bằng vai trò `mod_<key>_owner` của PostgreSQL, phân tích SQL chỉ còn là lint.

Bản đề nghị ban đầu:

| # | Quyết | Vì |
|---|---|---|
| D1 | **Hai mức bật:** `module_registry.status` (cài ở máy chủ, do quản trị hệ thống) × `tenant_modules.enabled` (bật cho đơn vị, do chủ đơn vị). | WP multisite cũng tách network-activate / site-activate; đa đơn vị bắt buộc. |
| D2 | **Nạp mã chỉ khi `status = active`** và hash gói khớp hash lúc cài. Chép tệp vào thư mục không làm gì cả. | nhiệm vụ 3 "không tự thực thi"; chống thay tệp sau kiểm. |
| D3 | MVP chỉ nhận gói **trong repo** (`modules/<key>/`, qua PR + bộ kiểm) hoặc gói có **chữ ký của registry** (TEMPLATE-MARKETPLACE §chữ ký). Không tải gói lạ. Cách ly tiến trình (worker riêng) là Phase 5. | "gói đã kiểm duyệt hoặc chạy cách ly". |
| D4 | Migration của plugin: thư mục `modules/<key>/migrations/NNNN_*.sql`, bảng `schema_migrations` thêm cột `module`; runner **từ chối** câu lệnh chạm bảng Kernel / `public` ngoài schema `mod_<key>` (parse tên bảng, danh sách Kernel từ `kernel.check.mjs`). Chạy **chỉ** qua `bizcity module install/upgrade`, không lúc API khởi động. | "có kiểm, qua cơ chế tin cậy". |
| D5 | Plugin ghi sổ **duy nhất** qua `ctx.ledger.submit({docType, docKey, reasonCode, lines})` = action `core.document.submit` (P1-2). Trả `{status, eventId, receipt}`. | Bốn câu không thương lượng 3–4. |
| D6 | `defineModule` là **tệp duy nhất** của SDK mà runtime cần (`manifest`, `actions[]`, `subscribers[]`, `routes?`, lifecycle hooks). Không đổi `defineAction` / `defineSubscriber`. | "không SDK song song": SDK = re-export Platform + `defineModule`. |

### 6.3 Giao diện: menu + launcher + "Thêm phân hệ"

Launcher hiện tại (ảnh 2) giữ nguyên. Chuẩn hoá ba điểm, **tất cả đọc từ API thật, không hard-code**:

1. **Ô phân hệ** = `GET /api/v1/system/modules` trả cho **đơn vị hiện tại** (sau D1): `{key, label, icon, color, order, description, functionCount, source: builtin|installed, enabled}`. Ô tắt thì mờ, có nút "Bật" cho chủ đơn vị.
2. **Ô cuối "＋ Thêm phân hệ"** (chỉ hiện với `tenant:owner`) mở trang **Phân hệ** (`/he-thong/phan-he`): hai tab — *Đã cài trên máy chủ* (từ `module_registry`, bật / tắt cho đơn vị) và *Có thể cài* (danh sách gói ký, Phase 5; MVP: hướng dẫn "đưa gói vào `modules/` và chạy `bizcity module install`"). Thay trang Add-in hiện có (`AddInsPage.tsx`, P2-4).
3. **Thanh menu trên** sinh từ manifest `extensions.menu` + `menuParent` (đã có `mergeAddInMenu` `layout/menu.ts:78` — tái dùng, không viết mới).

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Kế toán │ Quỹ │ Mua hàng │ Bán hàng │ Kho │ Danh mục │ Tài sản │ Thuế │ POS* │ ⚙ │
├──────────────────────────────────────────────────────────────────────────────┤
│  Xin chào, Quản trị — Công ty Demo                                            │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌ ─ ─ ─ ┐  │
│  │Kế toán │ │  Quỹ   │ │Mua hàng│ │Bán hàng│ │  Kho   │ │ POS *  │   ＋      │
│  │130 cn  │ │ 11 cn  │ │ 38 cn  │ │ 17 cn  │ │ 11 cn  │ │ 6 cn   │  Thêm    │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │phân hệ│  │
│  * = module cài thêm (source: installed, có dấu ✓ đã kiểm, phiên bản 0.1.0)   └ ─ ─ ─ ┘  │
└──────────────────────────────────────────────────────────────────────────────┘
  Trang Phân hệ: [Đã cài trên máy chủ]  [Có thể cài]
   POS mini  v0.1.0  bizcity.pos-mini  ✓ đã kiểm (hash …a1f3)  requires ledger.intake, documents.numbering   [Bật cho CN01]
   CRM       v0.2.0  acme.crm          ✓                        requires actions.call, events.outbox             [Đang bật] [Tắt]
```

## 7. Lộ trình: PR nhỏ theo phase (không PR nào đổi toàn bộ kiến trúc)

Thứ tự bắt buộc: PR-0 → PR-1 → PR-2 → PR-2b → PR-3 → PR-4 → PR-5 (PR-2b đi ngay sau PR-2 vì dùng chung `core.document.submit` và receipt); PR-P0 độc lập, làm ngay. Mỗi PR có bộ kiểm riêng, baseline không tăng.

| PR | Phase | Việc | Xong khi (tín hiệu máy) | Ước |
|---|---|---|---|---|
| **PR-P0** | 004 / 006 / 001 | P0-1 trigger `ledger_entries` + `accounting_event*`; P0-2 tenant context cho subscriber; P0-3 `DB_APP_USER=ketoan_app` mặc định, CI chạy test pool | DG-DB-2 +3 dòng; test `events.test.ts` "subscriber A không thấy B"; `tenant-isolation.test.ts:86` chạy trong CI | 1–2 ngày |
| **PR-0** | 001 | Luật dò: SC-RMP-1 kiểm `fileContains.file` tồn tại; ghim SHA Action (P2-1) | SC-RMP-1, SC-SEC-4 | ½ ngày |
| **PR-1** ✅ | 011 (3.2) | **Manifest cho 9 phân hệ + 3 add-in** (sinh từ `ApiModule` / `WebModule` / `AddInManifest` hiện có, `waivers` có hạn cho A-17); `GET /system/modules` đọc từ manifest | SC-MOD-3 `enforce: block`, 12/12 manifest; SC-CON-2 đạt | 2 ngày |
| **PR-2b** ✅ <!-- [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — PR-2b xong; còn CSP frame-src, slot iframe --> | 011 (3.14) | **App ngoài tiến trình** (xong 2026-11-02, `apps.test.ts`; còn CSP `frame-src` theo app, slot iframe chờ 3.8) (ADR-0011 mức 2): phạm vi khoá theo module, subscriber `core.webhook` ký HMAC, vé iframe + giao thức `postMessage`, slot iframe | năng lực `apps.external`; test: app chỉ gọi được action trong phạm vi, webhook phát lại không trùng | 3–4 ngày |
| **PR-2** ✅ v0.1 | 011 (3.1) | **`@bizcity/module-sdk` v0.1**: `defineModule`, re-export `defineAction` / `defineSubscriber` / kiểu ctx; **`ctx.ledger.submit`** = action `core.document.submit` (P1-2, receipt); `ctx.settings.get` (P1-5) | `packages/module-sdk/package.json`; `actions.test.ts` receipt cho ingest; `mua-hang` chuyển sang `ctx.ledger.submit` làm mẫu | 3–4 ngày |
| **PR-3** | 011 (3.13) | **Registry + vòng đời**: migration `module_registry`, `tenant_modules`; `bizcity module install / activate / deactivate / upgrade` (lệnh trong `scripts/` trước, `packages/cli` ở PR-5); nạp theo `status=active` + hash (D2); `Errors.moduleDisabled` **được gọi** ở `requirePermission` khi module tắt cho đơn vị | test: cài → bật → tắt → gọi route trả MODULE_DISABLED → bật lại; nâng cấp version ghi lịch sử | 4–5 ngày |
| **PR-4** | 011 (3.10) | **Migration theo module** (`data.migrations.module` available): thư mục `modules/<key>/migrations`, cột `module` trong `schema_migrations`, runner từ chối chạm Kernel (D4); schema `mod_<key>`; role `mod_<key>_rw` | DG-DB-5 (migration module không chạm Kernel); `tro-ly` chuyển vào CSDL (P2-2) | 4–5 ngày |
| **PR-5** | 014 (4.1, 4.2, 4.3) | `templates/starter-module` + **`modules/pos-mini`** (một chứng từ bán lẻ, `ctx.ledger.submit`, một subscriber, một slot menu); `packages/cli` (`doctor`, `module new/check/install`); lane `runtime` CONF-RUN trong CI | GOLDEN-CASE §8 đạt với pos-mini; CI job `plugin-compat` xanh | 5–6 ngày |
| **PR-6** | 013 | UI: ô "＋ Thêm phân hệ", trang Phân hệ, launcher đọc `tenant_modules` (§6.3) | e2e: chủ đơn vị bật POS, ô hiện; người thường không thấy nút ＋ | 2–3 ngày |
| PR-7 | 005 | P1-1 hash mã luật vào `policy_version` | SC-* so hash | 1–2 ngày |
| PR-8 | 010 | P1-4 `eventStore` về cổng nội bộ | SC-KERNEL-6 mở rộng | 1 ngày |

Việc **không làm** trong lộ trình này (trả lời "không tạo trừu tượng khi chưa cần"): worker cách ly cho plugin lạ, marketplace tải gói, NATS, microservice — Phase 5 sau khi 2 developer ngoài viết được module (5.7).

## 8. Acceptance tests (nhiệm vụ 5) ↔ việc

| Điều kiện chấp nhận | Đã có | Thiếu → PR |
|---|---|---|
| Cài, kích hoạt, nâng cấp, vô hiệu hoá đúng vòng đời | ✘ | PR-3 |
| Module từ repo độc lập chạy không sửa Kernel | ◐ (bộ kiểm `--module`, nhưng không cắm được) | PR-2, PR-3, PR-5 |
| Plugin không ghi sổ trực tiếp, không đọc đơn vị khác | ◐ (SC-KERNEL-1..3, RLS; lỗ P0-2) | PR-P0, PR-4 |
| Gửi cùng sự việc nhiều lần không trùng bút toán | ✅ docKey + version UNIQUE (`0005:546`), `document.service.ts:307-316`; CONF-RUN-4 | receipt → PR-2 |
| Phát lại sự kiện sau commit không tác dụng phụ trùng | ✅ `events.test.ts:96-107` | — |
| POS mẫu tạo chứng từ, gửi hạch toán, truy xuất biên nhận | ✘ | PR-2, PR-5 |
| CI, conformance, typecheck, integration đạt | ✅ hôm nay | lane runtime → PR-5 |

## 9. Chủ dự án cần quyết

<!-- [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] AUDIT — §9 đủ: PR-P0 làm trên feat/phase-0-tiep; mockup tĩnh trước; tài sản giữ eventStore (P1-4 thu hẹp) -->
> **Đã quyết đủ 2026-11-01:** (1) → [ADR-0011](../adr/ADR-0011-plugin-ba-muc-tin-cay.md); (2) PR-P0 làm trên nhánh `feat/phase-0-tiep`; (3) vẽ bản mẫu tĩnh trước để định hướng checklist code → [mockups/phan-he.html](../phases/PHASE-011-MODULE-SDK/mockups/phan-he.html), checklist CK-1…CK-20 ở [README](../phases/PHASE-011-MODULE-SDK/mockups/README.md); (4) **tài sản tiếp tục dùng `eventStore`** — tài sản cố định coi là Core (khấu hao là sự việc Kernel tự lập, câu không thương lượng 3), P1-4 thu hẹp: chỉ không để `eventStore` lọt vào `@bizcity/module-sdk`.


1. D1–D6 §6.2 (đặc biệt D3: MVP chỉ gói trong repo / gói ký — không tải gói lạ).
2. PR-P0 làm ngay trên nhánh này hay nhánh riêng (chạm Kernel mức K2 — migration trigger).
3. Thứ tự PR-6 (UI) sau PR-3: mockup chỉ vẽ khi có API đơn vị thật; nếu chủ cần hình để trình bày sớm thì vẽ tĩnh từ §6.3, ghi rõ "mockup".
4. `eventStore` cho `assets` (P1-4): giữ ở cổng công khai (tài sản coi là Core) hay chuyển tài sản gọi `submit`.

## 10. Rủi ro còn lại sau lộ trình

- Plugin cộng đồng vẫn chạy **cùng tiến trình** với Kernel (MVP): lỗi runtime của plugin (vòng lặp, rò bộ nhớ) kéo API. Giảm: `ctx.trace.step` + số đo theo `bizcity.module` (đã có từ ADR-0010), giới hạn thời gian action; cách ly tiến trình là Phase 5.
- RLS + chuỗi băm chưa đo trên 30.000 chứng từ / ngày (rủi ro ghi ở PHASES Phase 2).
- Hợp đồng còn `-draft`: plugin viết hôm nay có thể phải sửa khi lên 1.0.0 (4.6).
