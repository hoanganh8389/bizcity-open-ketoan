# `@bizcity/module-sdk` — API (v0.1)
<!-- [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk. -->
<!-- [2026-10-30 11:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — runtime action defineAction, idempotency, dry-run (PHASES 2.5). -->
<!-- [2026-10-31 08:27 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7) có: ctx.ledger.query, khung nhìn bizcity_read.* -->
<!-- [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ctx.actions.call có (action đọc); báo cáo về phan-he/ke-toan/reports; câu hỏi mở 3 chốt cách hai -->
<!-- [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — ctx.documents có (2.7): nextNumber, saveVersion, versions, link, links, attach, attachments -->
<!-- [2026-11-01 04:13 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi (PHASE-018 W5): span ở khớp nối Platform + cổng Kernel, lọc thuộc tính, traceparent qua outbox -->
<!-- [2026-11-02 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — v0.1 có code (packages/module-sdk/src): defineModule, xuất lại chọn lọc, ctx.ledger.submit, ctx.settings.get; core.document.submit -->

> **Trạng thái: v0.2 có code (2026-11-02, PHASES 3.1, ADR-0011 D6)** — `packages/module-sdk/src/index.ts`. Có: `defineModule`, `defineAction`, `defineSubscriber`, kiểu `ActionContext` / `SubscriberDef` / `EventEnvelope`, `Errors`, `z`, tiền (`toCents`, `fromCents`, `sumMoney`…), `docRef`; trong `ctx`: `ledger.submit`, `ledger.cancel`, `ledger.get`, `ledger.query`, `settings.get`, `data.module` (vai trò `mod_<key>_rw`, 3.10), `documents.*`, `events.emit`, `actions.call`, `evidence.note`, `trace.step`; quyền module (`permissions[]`, 3.3); nạp theo registry (3.13). **Hợp đồng v1 (ADR-0015, chủ duyệt 2026-11-02):** §6 đã chốt, chữ ký §3 ổn định. Có từ 2026-11-02 (v1.0.0): `ctx.ledger.allocateDebt` (3.16), `seed[]` (3.17), `@bizcity/module-sdk/web` — `defineWebModule` (3.18). Năng lực còn `planned` có kiểu nhưng runtime ném `CAPABILITY_MISSING`: `ledger.manual-journal` (3.15 — chờ đặc tả định khoản được kế toán trưởng ký, [50-DAC-TA-MANUAL-JOURNAL](../../docs/phases/PHASE-011-MODULE-SDK/50-DAC-TA-MANUAL-JOURNAL.md)). **Chưa:** `data.masterdata`, `data.describe`, `module.*`, `defineHook`. Kết quả PHASES 1.5 (bản nháp) giữ ở §2–§6 để đối chiếu. <!-- [2026-11-02 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — v0.2: ledger.cancel / get, data.module, quyền module -->
> Nguồn: đếm import thực tế ngày 2026-10-30 trên `apps/api/src/phan-he/**` và `apps/api/src/addins/**`, kèm REUSE-MAP §3.4. Tên API theo 7 hợp đồng `docs/contracts/BIZCITY-*-v1.md`. Trạng thái năng lực theo [bizcity-standard.json](../../docs/standard/bizcity-standard.json).
> Gói workspace `@bizcity/module-sdk` (chỉ phụ thuộc `@bizcity/platform`, `@ketoan/contracts`, `zod`; không phụ thuộc Kernel). Ví dụ module viết chỉ bằng SDK: `apps/api/test/module-sdk.test.ts`.

## 1. Nguyên tắc

1. **SDK là thứ duy nhất module được import** từ Bizcity (LAYOUT-2, CONF-STATIC-1). Ngoài SDK, module chỉ dùng `@bizcity/ui-kit` (giao diện), `zod`, `react` và một số `node:*` được phép.
2. **Mỗi API mở ra phải trỏ được tới một năng lực** trong `bizcity-standard.json`. Năng lực còn `planned` thì kiểu đã có nhưng runtime ném `CAPABILITY_MISSING`. Bộ kiểm dò lời gọi `ctx.*` để so với `requires.capabilities` (STD-MOD-5).
3. **Không có cửa sau.** SDK không mở các thứ sau:
   - `db` / Kysely gốc, kiểu bảng Kernel (`ledger_*`, `accounting_events*`…), `ledgerService`, `postDocumentIn`;
   - `writeAudit`, `requirePermission`, `reply`, `document_sequences`.

   Runtime của action làm thay (ACTION §4).
4. **Không có số tài khoản.** Module nộp `docType` + `reasonCode` + mã danh mục; `AccountResolver` của Kernel tra tài khoản (bốn câu không thương lượng, câu 4).
5. **Ổn định theo semver của Standard.** SDK `1.x` khớp Standard `v1`. Đổi chữ ký là bản lớn, thêm trường tuỳ chọn là bản nhỏ ([VERSIONING.md](../../docs/standard/VERSIONING.md)).

## 2. Bề mặt đang dùng: lõi mà module import hôm nay

Đếm theo số tệp import, trên 54 tệp của phân hệ / add-in (kể cả tệp lắp route).

| Đang import (`apps/api/src/…`) | Số tệp | Tên dùng (số lần) | Thay bằng SDK | Năng lực |
|---|---|---|---|---|
| `db/client` | 24 | `toNumber` 17, `db` 14, `Db` 15; `db.transaction(` 32 lần | `ctx.data.tx` (runtime mở giao dịch), `money.*` | `data.tenant-tx` ⏳ |
| `core/errors` | 19 | `Errors` 19 (`validation` 68, `conflict` 35, `notFound` 30, `forbidden` 7, `posting` 2), `AppError` 1 | `Errors` (giữ nguyên tên, mã ACTION §7) | có |
| `core/auth` | 18 | `authOf` 10, `requirePermission` 10, `AuthContext` 9; đọc `auth.tenantId` 190, `auth.actorName` 35, `auth.actor` 29, `auth.permissions` 6 | `defineAction({ permission })`; `ctx.actor`, `ctx.tenant` | `permissions.module` ⏳ |
| `core/http` | 9 | `ok` 9, `idParamSchema` 6 | runtime sinh phản hồi `{ ok, data, meta }` và kiểm `input` | `actions.runtime` ⏳ |
| `core/audit` | 7 | `writeAudit` 7 | tự động (Evidence); bổ sung bằng `ctx.evidence.note` | `evidence.receipt` ⏳ |
| `modules/documents/document.service` | 5 | `postDocumentIn` 3, `documentService.cancel` 3 | `ctx.ledger.submit`, `ctx.ledger.cancel` | `ledger.submit`, `ledger.cancel` ✅ |
| `modules/vouchers/voucher.service` | 3 | `voucherService.createIn` 2, `createOpening` 1 | `ctx.ledger.submit({ docType: 'manual' })` | **thiếu**, xem §6 câu 1 |
| `core/addins` | 3 | `defineAddIn` 3 | `defineModule` (add-in và phân hệ chung một cơ chế, A-25) | có (đổi tên) |
| `modules/reports/*` → `phan-he/ke-toan/reports` (2026-10-31) | 9 → 1 | `reportService.*` 14 hàm (cân đối, sổ cái, nhật ký, KQKD…), `incomeStatement`, `termRuleFor`, `TERM_MAP`. Còn `addins/excel-export` | `ctx.ledger.query(...)`; báo cáo SQL đọc `bizcity_read.*`; module khác gọi `ctx.actions.call('accounting.report.*')` (Thuế: `income-statement`, `term-rules`) | `ledger.query` ✅, `ctx.actions.call` ✅ đọc (2026-10-31) |
| `modules/{sales,inventory,closing,assets,vouchers}/*.routes`, `reports/goods-reports`, `debt-confirmation`, `dimension-reports` | 11 | gắn route lõi vào menu phân hệ (`closingRoutes`, `inventoryRoutes`…) | không qua SDK: lắp ráp ở `apps/server` theo manifest `includes` (R-BOUND-4) | — |
| `modules/warehouses/*` | 3 | `warehouseService.create`, `warehouseScope`, `resolveWarehouse` | `ctx.actions.call('core.warehouse.upsert')`, `ctx.data.masterdata.warehouses` | `masterdata.*` ✅ (HTTP) |
| `modules/partners/partner.repository` | 1 | `partnerRepository.upsert` | `ctx.actions.call('core.partner.upsert')` | `masterdata.write` ✅ |
| `modules/debts/debt.service` | 1 | `allocate` (đối trừ công nợ) | `ctx.ledger.allocateDebt()` | **thiếu**, xem §6 câu 2 |
| `modules/inventory/inventory-report.service` | 1 | `valuedMovements` | `ctx.ledger.query({ kind: 'stock-movements' })` | `ledger.query` ✅ số dư theo mã; `kind: 'stock-movements'` chưa có (đề xuất) |
| `modules/assets/asset.service` | 1 | `assetService.register` | không mở: tài sản là module `tai-san`; gọi `ctx.actions.call('tai-san.asset.register')` | `actions.runtime` ⏳ |
| `modules/system/schema-catalog` | 1 | `SCHEMA_TABLES`, `COLUMN_NOTES`, `TRIGGER_NOTES` | `ctx.data.describe()` | `data.read-views` ⏳ |
| `db/paths` | 1 | `SEEDS_DIR` | `ctx.module.assetPath('seeds/…')` (tệp trong thư mục module) | — |

✅ có sẵn · ⏳ `planned`.

**Quyền module đang dùng.** Chỉ các quyền chung: `documents:write` 15, `reports:read` 17, `catalog:write` 13, `catalog:read` 4, `documents:read` 4, `settings:write` 3, `payments:approve` 2. Không module nào có quyền riêng, vì danh sách quyền đang đóng (A-23).

**Bảng module tự đọc / ghi qua `db` (không qua service lõi).**
- *Bảng của chính module* (`purchase_documents`, `vat_returns`, `cash_plans`…): sau này là `ctx.data.tx` trên schema `mod_<key>`.
- *Bảng danh mục / cấu hình lõi*:
  - ghi: `insertInto('products' | 'branches' | 'partners' | 'item_classes' | 'product_units' | 'tax_codes')`, ở `mua-hang/demo.ts`;
  - đọc: `selectFrom('accounts' | 'accounting_events' | 'tenants')`.

  Đây là nợ A-17 / SC-MOD-2. Thay bằng `ctx.actions.call('core.*')` và view `bizcity_read.*`.

## 3. API đề xuất

### 3.1 Khai báo (điểm vào của module)

```ts
import { defineModule, defineAction, defineSubscriber, defineHook, z, Errors, money } from '@bizcity/module-sdk';

// modules/<key>/api/index.ts — manifest bizcity.module.json là nguồn; defineModule nối code vào manifest.
export default defineModule({
  manifest,                                   // import manifest from '../bizcity.module.json' (kiểm theo BIZCITY-MODULE-v1.schema.json)
  actions: [recordPayment, listInstallments], // defineAction(...)
  subscribers: [onEntryPosted, dailyRemind],  // defineSubscriber(...)
  hooks: [referenceCheck],                    // defineHook(...) — chỉ hook có trong extensionPoints.hooks
  migrations: './migrations',                 // migration riêng schema mod_<key> (năng lực data.migrations.module ⏳)
});
```

| Hàm | Chữ ký rút gọn | Hợp đồng | Năng lực |
|---|---|---|---|
| `defineModule(def)` | `{ manifest, actions, subscribers?, hooks?, migrations? } → ModuleDef` | MODULE §3 | thay `ApiModule` (`phan-he/types.ts`) + `defineAddIn` |
| `defineAction(def)` | `{ id, title, input, output, permission, effect, idempotency, dryRun?, expose, errors, handler(ctx, input) }` | ACTION §3 | `actions.runtime` ⏳ |
| `defineSubscriber(def)` | `{ id, on: EventType \| EventType[], handler(ctx, event) }`; idempotent theo `(consumer, event_id)` | EVENT §5 | `events.subscribe` ⏳ |
| `defineHook(def)` | `{ id: 'masterdata.referenceCheck' \| 'document.beforeTransition' \| 'ledger.previewSource', handler }`, có `timeoutMs` từ registry | EXTENSION §4 | — ⏳ |
| `defineWebModule(def)` | `{ routes, menu, slots }` (gói con `@bizcity/module-sdk/web`) | EXTENSION §3 | `ui.menu` ✅, `ui.slots` ⏳ |

### 3.2 `ctx`: ngữ cảnh handler

Runtime dựng `ctx` cho mỗi lần gọi action / subscriber / hook. Mọi thứ trong `ctx` đã nằm trong **một** giao dịch của đơn vị (ACTION §4 bước 6).

```ts
interface ActionContext {
  readonly actor: Actor;            // thay AuthContext: { id: 'user:12' | 'apikey:3' | 'cell:…', name, kind: 'user'|'apikey'|'ai', via?: 'module:<id>' }
  readonly tenant: { id: string };  // thay auth.tenantId (190 chỗ)
  readonly requestId: string;
  readonly dryRun: boolean;         // true → runtime rollback cuối action (mẫu: tro-ly /simulate)

  data: {
    tx: ModuleTransaction;          // Kysely chỉ thấy bảng mod_<key>.* + view bizcity_read.* (kiểu sinh theo module)
    module<T>(fn: (tx) => Promise<T>): Promise<T>;  // ✅ 2026-11-02 (3.10): chạy fn bằng vai trò mod_<key>_rw — PostgreSQL chặn bảng Kernel; gọi ctx.ledger / documents NGOÀI fn
    masterdata: MasterdataReader;   // partners / products / branches / warehouses / units / taxCodes: get(code), list(filter)
    describe(): SchemaDescription;  // thay schema-catalog
  };
  ledger: {
    submit(doc: LedgerIntakeDoc): Promise<IngestResult>;           // ✅ v0.1: bizcity_ledger_intake@1; docKey `<module>:…`, sourceSystem = module; chỉ action ghi; cùng giao dịch (lỗi → huỷ cả action)
    cancel(docKey: string, reason: string): Promise<{ requested; reversed; cancelled? }>;  // ✅ v0.2: chỉ docKey `<module>:…`, chỉ action ghi; chế độ ghi ngay → đảo + huỷ, chế độ chờ → Chờ huỷ (ACC14)
    get(docKey: string): Promise<{ docKey; version; status; postedVersion; cancelRequested; errorMessage } | null>;  // ✅ v0.2: chỉ chứng từ của module, không trả nội dung
    allocateDebt(i: { partnerCode; from: docKey; to: docKey; amount }): Promise<{ allocated: number }>;  // ✅ v1.0 (3.16): đúng một cặp Nợ / Có cùng đối tượng + tài khoản giữa hai chứng từ của module; chỉ action ghi
    get(docKey: string): Promise<LedgerDocStatus | null>;          // trạng thái + số chứng từ sổ, không trả dòng ledger_*
    query(q: LedgerQuery): Promise<LedgerQueryRow[]>;              // ✅ 3.7: đầu kỳ / phát sinh / cuối kỳ theo mã, chiều, mã hàng (@ketoan/contracts ledgerQuerySchema)
  };
  documents: {                      // ✅ 2.7 (2026-11-01, core/documents.ts) trừ transition — xem DOCUMENT §7.1
    nextNumber(series: string, opts?: { date?: string; width?: number }): Promise<string>;   // HD-2026-0001
    transition(docRef: DocRef, action: string, opts?: { reason?: string }): Promise<void>;     // ⏳ hiện qua documents.workflow trong action
    saveVersion(docRef: DocRef, snapshot: unknown): Promise<number>;
    link(from: DocRef, to: DocRef, role: 'source'|'reverses'|'replaces'|'settles'|'attachesTo'|'ledger'): Promise<void>;
    attach(docRef: DocRef, file: FileInput, meta?: { kind?: string; note?: string }): Promise<AttachmentRef>;
    sign(docRef: DocRef, role: string): Promise<DocumentSignature>;  signatures(docRef: DocRef): Promise<DocumentSignature[]>;  unsign(docRef: DocRef, role: string): Promise<void>;  // ✅ 0047
    versions(docRef: DocRef): Promise<DocumentVersion[]>;  links(docRef: DocRef): Promise<DocumentLink[]>;  attachments(docRef: DocRef): Promise<AttachmentRef[]>;
  };
  events: { emit(type: string, data: unknown, opts?: { subject?: DocRef }): Promise<void> };  // ⏳ outbox, cùng giao dịch
  settings: { get<T>(key: `bizcity.${string}`): Promise<T> };                                    // ✅ v0.1: theo registry, chỉ khoá module sở hữu, phạm vi đơn vị
  evidence: { note(key: string, value: unknown): void };                                         // ⏳ ghi vào changes.notes
  actions: { call<I, O>(id: string, input: I, opts?: { idempotencyKey?: string }): Promise<O> }; // ✅ action đọc (2026-10-31, core/actions.ts); ghi ⏳ cần khoá idempotency
  trace: { step<T>(name: string, fn: () => Promise<T>): Promise<T> };  // ✅ 2026-11-01 (ADR-0010): span `step <module>.<tên>`; module KHÔNG import @opentelemetry/* (R-OBS-7)
  module: { id: string; version: string; assetPath(rel: string): string };
}
```

### 3.3 Tiện ích thuần

| Tên | Thay cho | Ghi chú |
|---|---|---|
| `Errors` | `core/errors` | `validation`, `notFound`, `conflict`, `forbidden`, `posting`, … mã chuẩn ACTION §7. Module không tự đặt HTTP status |
| `z` | `zod` | Re-export để module và runtime cùng một bản zod (kiểm `input`, sinh OpenAPI / MCP) |
| `sql` <!-- [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W1 --> | `kysely` | Câu SQL có tham số cho bảng của chính module (`mod_<key>.*`) trong `ctx.data.module(tx => sql`…`.execute(tx))` — kiểu `Database` của Core không biết bảng module. `${giá trị}` luôn thành tham số, không ghép chuỗi (R-SEC) |
| `money.toCents`, `money.fromCents`, `money.toNumber` | `db/client.toNumber`, `@ketoan/contracts` money | Tiền `numeric(18,2)`, cộng trừ bằng xu |
| `docRef(type, id)` | — | Khoá chứng từ `<key>.<loại>:<id>` dùng cho `docKey`, sự kiện, liên kết |

## 4. Không có trong SDK (cố ý)

| Hiện đang dùng | Vì sao không mở | Thay bằng |
|---|---|---|
| `db`, `Db`, `db.transaction()` | Module thấy và ghi được mọi bảng; tự mở giao dịch thì runtime không gắn được bằng chứng, idempotency, outbox | `ctx.data.tx` |
| `requirePermission`, `authOf` | Kiểm quyền là bước 3 của runtime; module khai `permission` | `defineAction({ permission })` |
| `writeAudit` | Bằng chứng do runtime ghi, module không tắt được (STD-EVD-3) | tự động + `ctx.evidence.note` |
| `ok`, `reply.status` | Khuôn phản hồi do runtime | giá trị trả về của `handler` |
| `@opentelemetry/*`, `core/tracing` | Span của module tự đặt tên / thuộc tính thì không đồng đều và có thể lộ số tiền, MST. Runtime đã có span cho action, cổng Kernel, CSDL, sự kiện, gọi ra ngoài, mang sẵn `bizcity.module` (ADR-0010) | tự động + `ctx.trace.step(name, fn)` |
| `postDocumentIn`, `documentService`, `ledgerService`, `voucherService` | Câu 3: chỉ một cửa vào sổ | `ctx.ledger.*` |
| `reportService.*`, SQL trên `ledger_*` | Module không thấy bảng sổ (DATA §7) | `ctx.ledger.query` |
| route lõi (`closingRoutes`, `inventoryRoutes`…) | Lắp ráp, không phải API | manifest `includes` |

## 5. Cầu nối khi chuyển dần (Phase 2 → 3)

Phân hệ hiện có không viết lại một lần. Theo thứ tự:

1. **Phase 2 (2.5) — đã làm:** `defineAction` + runtime ở `apps/api/src/core/actions.ts`; mẫu `phan-he/quy/payment-requests`.
   - `ctx` hiện có: `actor`, `tenant`, `requestId`, `dryRun`, `can()`, `data.tx`, `evidence.note`.
   - Cầu nối nội bộ `ctx.legacyAuth` (không đưa vào SDK) cho service cũ cần `AuthContext`, vd `voucherService.createIn`; hết khi có `ctx.ledger.submit` dạng phiếu tay (§6 câu 1).
   - Phân hệ đổi từng route sang `defineAction`. Handler cũ vẫn chạy nhờ `ctx.data.tx = trx`.
2. **Phase 3 (3.1):** tách `@bizcity/module-sdk` thành gói thật, chỉ `export` các tên ở §3.
   - `ctx.data.tx` chuyển sang kiểu chỉ thấy `mod_<key>.*` + `bizcity_read.*`.
   - Module nào còn đọc bảng lõi thì lỗi biên dịch: đó chính là danh sách việc A-17.
3. **Đo tiến độ:**
   - SC-MOD-1 (import), SC-MOD-2 (ghi bảng lõi), SC-LAYER-2 (chiều lớp: cạnh `D → D`, còn `excel-export → ke-toan/reports`, `ke-toan/reports → modules/assets`) trên [bảng điểm](../../tests/conformance/README.md);
   - mốc đồ thị [docs/audits/deps-2026-10-30.md](../../docs/audits/deps-2026-10-30.md).

## 6. Câu hỏi mở — đã chốt (ADR-0015, 2026-11-02)
<!-- [2026-11-02 05:55 PM Johnny Chu - Chu Hoàng Anh] ADR-0015 — chủ chốt câu 1, 2, 4, 5 theo đề xuất + nguyên tắc mọi thứ chạm sổ qua bể sự kiện -->

> **Nguyên tắc chủ dự án:** "mọi thứ phải vào bể sự kiện — accounting event qua thì mới vào được" (R-EVENT-14).

1. ✅ **Chốt 2026-11-02 — `docType: manual_journal`, `reasonCode` bắt buộc, chỉ `ke-toan` tự chọn tài khoản, qua bể sự kiện (3.15).** **Phiếu kế toán nhập tay từ module** (`voucherService.createIn` ×2, `createOpening` ×1, ở `ke-toan` và `quy`). `bizcity_ledger_intake@1` chưa có `docType: 'manual'`. Khuyên thêm `docType` `manual_journal` có `reasonCode` bắt buộc, đề xuất theo [VERSIONING §5](../../docs/standard/VERSIONING.md). Trái với câu 4 nếu module tự ghi tài khoản: dòng phiếu phải là mã lý do / đối tượng, không là số tài khoản. Nếu cần tự do tài khoản thì chỉ module `ke-toan` (lõi) được dùng. **✅ Có 2026-11-02** (năng lực `ledger.manual-journal` available): `ctx.ledger.submit({ docType: 'manual_journal', lines: [{ lineKey, reasonCode, amount, partnerCode? }], totals: { total } })` — lý do loại `journal` do kế toán khai cặp Nợ / Có; dòng có số tài khoản / thuế bị từ chối ([BIZCITY-LEDGER-INTAKE §4](../../docs/contracts/BIZCITY-LEDGER-INTAKE-v1.md)). <!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.15 có mã --> 
2. ✅ **Chốt 2026-11-02 — `ctx.ledger.allocateDebt` (cùng đối tượng, cùng tài khoản); khác tài khoản = chứng từ qua `submit` (3.16).** **Đối trừ công nợ** (`debt.service.allocate`, 1 chỗ ở `quy`). Khuyên năng lực mới `ledger.allocate-debt`: `ctx.ledger.allocateDebt({ partnerCode, from: docKey, to: docKey, amount })`, Kernel kiểm số dư.
3. ✅ **Chốt 2026-10-31 — cách hai** (`accounting.report.income-statement`, `accounting.report.term-rules` qua `callAction` / `ctx.actions.call`). **Báo cáo tài chính trong phân hệ Thuế** (`incomeStatement`, `termRuleFor`, `TERM_MAP` ở `thue/statements`). Hoặc `ledger.query` có báo cáo dựng sẵn (`kind: 'income-statement'`), hoặc Thuế gọi action đọc `ke-toan.report.*` qua `ctx.actions.call`. Khuyên cách hai: báo cáo là module ([REUSE-MAP §3.2](../../docs/standard/REUSE-MAP.md)).
4. ✅ **Chốt 2026-11-02 — `seed[]` trong manifest gọi `core.*.upsert` (3.17).** **Tạo danh mục khi dựng dữ liệu mẫu** (`mua-hang/demo.ts`). Khuyên `seed` trong manifest gọi `core.*.upsert`, không ghi bảng.
5. ✅ **Chốt 2026-11-02 — `@bizcity/module-sdk/web` (3.18).** **Tên gói con giao diện:** `@bizcity/module-sdk/web` hay để `defineWebModule` ở `@bizcity/ui-kit`. Khuyên `module-sdk/web`: một gói danh tính, ui-kit chỉ là thành phần.

## Phần giao diện và nạp module <!-- [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W1–W3 -->

- **Nạp:** `modules/<key>/` có `bizcity.module.json` + `api/index.ts` (`export default defineModule(...)`) → API nạp như phân hệ (registry, hash, bật / tắt theo đơn vị), route sinh từ action dưới `/api/v1/m/<key>/`. `web/index.tsx` (`export default defineWebModule(...)`) → web gom lúc dựng: mục Tổng quan (biểu tượng / màu / thứ tự ở manifest `ui`), nhóm menu `mod-<key>`, route dưới `/app/<key>` (trang chủ) hoặc `/app/<key>/…`.
- **`@bizcity/module-sdk/web`:** `defineWebModule`, `webModuleParts` (khung giao diện dùng), `WEB_SLOTS`. Xuất thẳng mã nguồn (không phụ thuộc gì) — bộ đóng gói của web dùng, không cần dựng SDK.
- **`@bizcity/ui-kit`:** thành phần + `useApi` / `useCan` / `useQuery` cho màn của module; bản thật do `apps/web` cung cấp (`provideUiKit`). Màn của module không import `apps/web/src/*`.
- **Slot** (W4): `partner.detail.tab` (props `{ code, name }`, thẻ trong hồ sơ khách đã lưu) và `dashboard.widget` (ô trên Tổng quan) vẽ được; `label` của slot là nhãn thẻ. Ba slot còn lại khai được nhưng chưa vẽ.

## Đợt W4 — năng lực cho ca chuẩn <!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 -->

| Cần | Dùng |
|---|---|
| Trạng thái duyệt chứng từ của module | `loadWorkflow(new URL('./x.workflow.yaml', import.meta.url))` + `wf.plan(verb, { status, createdBy, levelsRequired }, { id: ctx.actor.id, can: ctx.can })`; quyền trong YAML được là `<key>:<việc>` |
| Cấu hình của module | khai khoá ở `settings` (manifest) **và** chi tiết ở `modules/<key>/settings.registry.json` (cùng khuôn registry Core, `owner` = key, `storage: tenants.settings.*`, `scopes: [tenant]`); đọc `ctx.settings.get(key)` |
| Core hỏi "khách này còn dùng không" | `defineHook({ id: '<key>.…', module: '<key>', hook: 'masterdata.referenceCheck', handle: async (ctx, { kind, code }) => câu | null })`, khai ở `defineModule({ hooks })` và `extensions.hooks` |
| Thông báo | `ctx.notify.send({ to: { permission: '<key>:…' }, title, link, dedupeKey })` (action, subscriber) |
| Subscriber đọc / ghi bảng module | `ctx.module(tx => …)` (vai trò `mod_<key>_rw`), `ctx.settings.get`, `ctx.notify` |
