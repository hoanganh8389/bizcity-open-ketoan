# `@bizcity/module-sdk` — bản nháp API (v0)

> **Trạng thái: bản nháp, chưa có code.** Kết quả PHASES 1.5. Gói thật dựng ở Phase 3 (3.1), sau khi có `packages/actions` (2.5) và `packages/audit` (2.6).
> Nguồn: đếm import thực tế ngày 2026-10-30 trên `apps/api/src/phan-he/**` và `apps/api/src/addins/**`, kèm REUSE-MAP §3.4. Tên API theo 7 hợp đồng `docs/contracts/BIZCITY-*-v1.md`. Trạng thái năng lực theo [bizcity-standard.json](../../docs/standard/bizcity-standard.json).
> Thư mục này chỉ có tệp này: chưa có `package.json`, nên chưa là workspace.

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
| `modules/reports/*` (`report.service`, `income-statement`, `balance-sheet`, `extra-reports`) | 9 | `reportService.*` 14 hàm (cân đối, sổ cái, nhật ký, KQKD…), `incomeStatement`, `termRuleFor`, `TERM_MAP` | `ctx.ledger.query(...)` | `ledger.query` ⏳ (Phase 3) |
| `modules/{sales,inventory,closing,assets,vouchers}/*.routes`, `reports/goods-reports`, `debt-confirmation`, `dimension-reports` | 11 | gắn route lõi vào menu phân hệ (`closingRoutes`, `inventoryRoutes`…) | không qua SDK: lắp ráp ở `apps/server` theo manifest `includes` (R-BOUND-4) | — |
| `modules/warehouses/*` | 3 | `warehouseService.create`, `warehouseScope`, `resolveWarehouse` | `ctx.actions.call('core.warehouse.upsert')`, `ctx.data.masterdata.warehouses` | `masterdata.*` ✅ (HTTP) |
| `modules/partners/partner.repository` | 1 | `partnerRepository.upsert` | `ctx.actions.call('core.partner.upsert')` | `masterdata.write` ✅ |
| `modules/debts/debt.service` | 1 | `allocate` (đối trừ công nợ) | `ctx.ledger.allocateDebt()` | **thiếu**, xem §6 câu 2 |
| `modules/inventory/inventory-report.service` | 1 | `valuedMovements` | `ctx.ledger.query({ kind: 'stock-movements' })` | `ledger.query` ⏳ |
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
    masterdata: MasterdataReader;   // partners / products / branches / warehouses / units / taxCodes: get(code), list(filter)
    describe(): SchemaDescription;  // thay schema-catalog
  };
  ledger: {
    submit(doc: LedgerIntakeDoc): Promise<IngestResult>;           // bizcity_ledger_intake@1; reasonCode, không tài khoản
    cancel(docKey: string, reason: string): Promise<IngestResult>;
    get(docKey: string): Promise<LedgerDocStatus | null>;          // trạng thái + số chứng từ sổ, không trả dòng ledger_*
    query(q: LedgerQuery): Promise<LedgerQueryResult>;             // ⏳ Phase 3: số dư, phát sinh, công nợ theo mã / chiều
  };
  documents: {                      // ⏳ 2.7
    nextNumber(series: string): Promise<string>;
    transition(docRef: DocRef, action: string, opts?: { reason?: string }): Promise<void>;
    saveVersion(docRef: DocRef, snapshot: unknown): Promise<number>;
    link(from: DocRef, to: DocRef, role: 'source'|'reverses'|'replaces'|'settles'|'attachesTo'|'ledger'): Promise<void>;
    attach(docRef: DocRef, file: FileInput, meta: { kind: string }): Promise<AttachmentRef>;
  };
  events: { emit(type: string, data: unknown, opts?: { subject?: DocRef }): Promise<void> };  // ⏳ outbox, cùng giao dịch
  settings: { get<T>(key: `bizcity.${string}`, scope?: SettingScope): T };                     // ⏳ registry
  evidence: { note(key: string, value: unknown): void };                                         // ⏳ ghi vào changes.notes
  actions: { call<I, O>(id: string, input: I, opts?: { idempotencyKey?: string }): Promise<O> }; // qua quyền + bằng chứng như gọi ngoài
  module: { id: string; version: string; assetPath(rel: string): string };
}
```

### 3.3 Tiện ích thuần

| Tên | Thay cho | Ghi chú |
|---|---|---|
| `Errors` | `core/errors` | `validation`, `notFound`, `conflict`, `forbidden`, `posting`, … mã chuẩn ACTION §7. Module không tự đặt HTTP status |
| `z` | `zod` | Re-export để module và runtime cùng một bản zod (kiểm `input`, sinh OpenAPI / MCP) |
| `money.toCents`, `money.fromCents`, `money.toNumber` | `db/client.toNumber`, `@ketoan/contracts` money | Tiền `numeric(18,2)`, cộng trừ bằng xu |
| `docRef(type, id)` | — | Khoá chứng từ `<key>.<loại>:<id>` dùng cho `docKey`, sự kiện, liên kết |

## 4. Không có trong SDK (cố ý)

| Hiện đang dùng | Vì sao không mở | Thay bằng |
|---|---|---|
| `db`, `Db`, `db.transaction()` | Module thấy và ghi được mọi bảng; tự mở giao dịch thì runtime không gắn được bằng chứng, idempotency, outbox | `ctx.data.tx` |
| `requirePermission`, `authOf` | Kiểm quyền là bước 3 của runtime; module khai `permission` | `defineAction({ permission })` |
| `writeAudit` | Bằng chứng do runtime ghi, module không tắt được (STD-EVD-3) | tự động + `ctx.evidence.note` |
| `ok`, `reply.status` | Khuôn phản hồi do runtime | giá trị trả về của `handler` |
| `postDocumentIn`, `documentService`, `ledgerService`, `voucherService` | Câu 3: chỉ một cửa vào sổ | `ctx.ledger.*` |
| `reportService.*`, SQL trên `ledger_*` | Module không thấy bảng sổ (DATA §7) | `ctx.ledger.query` |
| route lõi (`closingRoutes`, `inventoryRoutes`…) | Lắp ráp, không phải API | manifest `includes` |

## 5. Cầu nối khi chuyển dần (Phase 2 → 3)

Phân hệ hiện có không viết lại một lần. Theo thứ tự:

1. **Phase 2 (2.5):** `packages/actions` có `defineAction` + runtime.
   - Thêm `legacyContext(auth, trx)` **nội bộ** ở `apps/api` (không đưa vào SDK): dựng `ctx` từ `AuthContext` + giao dịch Kysely.
   - Phân hệ đổi từng route sang `defineAction`. Handler cũ vẫn chạy nhờ `ctx.data.tx = trx`.
2. **Phase 3 (3.1):** tách `@bizcity/module-sdk` thành gói thật, chỉ `export` các tên ở §3.
   - `ctx.data.tx` chuyển sang kiểu chỉ thấy `mod_<key>.*` + `bizcity_read.*`.
   - Module nào còn đọc bảng lõi thì lỗi biên dịch: đó chính là danh sách việc A-17.
3. **Đo tiến độ:**
   - SC-MOD-1 (import), SC-MOD-2 (ghi bảng lõi), SC-LAYER-2 (chiều lớp: cạnh `D → D` qua `modules/reports`) trên [bảng điểm](../../tests/conformance/README.md);
   - mốc đồ thị [docs/audits/deps-2026-10-30.md](../../docs/audits/deps-2026-10-30.md).

## 6. Câu hỏi mở (cần chốt trước 3.1)

1. **Phiếu kế toán nhập tay từ module** (`voucherService.createIn` ×2, `createOpening` ×1, ở `ke-toan` và `quy`). `bizcity_ledger_intake@1` chưa có `docType: 'manual'`. Khuyên thêm `docType` `manual_journal` có `reasonCode` bắt buộc, đề xuất theo [VERSIONING §5](../../docs/standard/VERSIONING.md). Trái với câu 4 nếu module tự ghi tài khoản: dòng phiếu phải là mã lý do / đối tượng, không là số tài khoản. Nếu cần tự do tài khoản thì chỉ module `ke-toan` (lõi) được dùng.
2. **Đối trừ công nợ** (`debt.service.allocate`, 1 chỗ ở `quy`). Khuyên năng lực mới `ledger.allocate-debt`: `ctx.ledger.allocateDebt({ partnerCode, from: docKey, to: docKey, amount })`, Kernel kiểm số dư.
3. **Báo cáo tài chính trong phân hệ Thuế** (`incomeStatement`, `termRuleFor`, `TERM_MAP` ở `thue/statements`). Hoặc `ledger.query` có báo cáo dựng sẵn (`kind: 'income-statement'`), hoặc Thuế gọi action đọc `ke-toan.report.*` qua `ctx.actions.call`. Khuyên cách hai: báo cáo là module ([REUSE-MAP §3.2](../../docs/standard/REUSE-MAP.md)).
4. **Tạo danh mục khi dựng dữ liệu mẫu** (`mua-hang/demo.ts`). Khuyên `seed` trong manifest gọi `core.*.upsert`, không ghi bảng.
5. **Tên gói con giao diện:** `@bizcity/module-sdk/web` hay để `defineWebModule` ở `@bizcity/ui-kit`. Khuyên `module-sdk/web`: một gói danh tính, ui-kit chỉ là thành phần.
