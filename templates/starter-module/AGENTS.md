# AGENTS.md — module `mau-module` (Module mẫu)

Bạn đang làm trong **một module** của Bizcity Core. Phạm vi sửa: **chỉ thư mục này** (`modules/mau-module/`). Không sửa Kernel,
`packages/*`, `apps/*`, module khác. Thiếu năng lực Core thì dừng phần đó, nói với người dùng, soạn đề xuất
([docs/standard/VERSIONING.md §5](../../docs/standard/VERSIONING.md)) — không tự vá Core.

## Đọc trước, theo thứ tự

1. [docs/standard/README.md](../../docs/standard/README.md) — 3 nguyên tắc, 7 hợp đồng.
2. [docs/standard/GOLDEN-CASE-HOP-DONG.md](../../docs/standard/GOLDEN-CASE-HOP-DONG.md) — một module mẫu đầy đủ: yêu cầu → quyết định → tệp.
3. Hợp đồng cần cho việc đang làm: `docs/contracts/BIZCITY-{MODULE,DATA,DOCUMENT,ACTION,EVENT,EVIDENCE,EXTENSION}-v1.md`.
4. Năng lực Core: [docs/standard/bizcity-standard.json](../../docs/standard/bizcity-standard.json) (`planned` = chưa dùng được). Năng lực dùng đến phải khai ở `requires.capabilities`.
5. SDK: [packages/module-sdk/API.md](../../packages/module-sdk/API.md). Giao diện: `@bizcity/ui-kit` (chú thích đầu `packages/ui-kit/src/index.tsx`).

## Tệp của module

| Tệp | Việc |
|---|---|
| `bizcity.module.json` | Manifest — viết / sửa **trước** code. `key` = tên thư mục; mọi action, quyền, bảng, sự kiện, docType phải khai ở đây |
| `migrations/NNNN_*.sql` | Bảng trong schema `mod_mau_module`; mỗi bảng có `tenant_id`, RLS (`ENABLE` + `FORCE` + policy `bizcity_tenant_visible`), `COMMENT ON` mọi cột. Không chạm bảng Core |
| `api/actions/*.ts` | Một action một tệp (`defineAction`): id `mau-module.<thực thể>.<động từ>`, quyền `mau-module:<việc>`, action ghi có `idempotency: 'required'` |
| `api/documents/<loại>.workflow.yaml` | Trạng thái duyệt của chứng từ module: `loadWorkflow(new URL('./documents/x.workflow.yaml', import.meta.url))`, `wf.plan(verb, { status, createdBy, levelsRequired }, { id: ctx.actor.id, can: ctx.can })`; quyền trong YAML là `mau-module:<việc>`. `npm run build` tự chép YAML sang `dist/` |
| `settings.registry.json` | Khoá cấu hình của module (khai cả ở `settings` của manifest): `owner` = mã module, `storage: tenants.settings.…`, `scopes: [tenant]`; đọc `ctx.settings.get` |
| `api/hooks/*.ts` | `defineHook` — vd `masterdata.referenceCheck`: Core hỏi trước khi xoá khách / mặt hàng |
| `api/subscribers/*.ts` | `defineSubscriber`: id `mau-module.<việc>`, `module: 'mau-module'`; lịch chạy = nghe `bizcity.clock.daily`, không `setInterval` |
| `api/index.ts` | `export default defineModule({ manifest, actions, subscribers })` |
| `web/index.tsx` | `export default defineWebModule({ key, label, menu, routes })` — đường dẫn dưới `/app/mau-module/` |
| `web/screens/*.tsx` | Màn — chỉ import `@bizcity/ui-kit`, `react`. Gọi API `/api/v1/m/mau-module/…` bằng `useApi()` |
| `README.md` | Nghiệp vụ, luồng, sự kiện (STD-MOD-7) |

## Không làm

- Không tạo bảng khách hàng / mặt hàng / chi nhánh: đọc danh mục chuẩn (`data.reads` + `bizcity_read.*`), tạo mới qua `ctx.actions.call('core.partner.upsert')`.
- Không ghi bảng sổ / số tài khoản: tiền vào sổ là `ctx.ledger.submit({ docType, docKey: 'mau-module:…', … })` với docType có sẵn.
- Không tự đếm số chứng từ (`ctx.documents.nextNumber`), không bảng đính kèm riêng (`ctx.documents.attach`), không ghi log ra tệp, không `writeAudit`.
- Không viết số tài khoản, không tự điền giá vốn, không chạm bảng `ledger_*` / `inventory_*`: `npx bizcity module accounting-check mau-module` báo FAIL (trụ cột I, V trong `docs/standard/tru-cot.json` của open-ketoan).
- Không import `apps/*`, `packages/*/src`, module khác. Chỉ `@bizcity/module-sdk`, `@bizcity/module-sdk/web`, `@bizcity/ui-kit`, `react`.

## Lệnh

```bash
npx bizcity module check mau-module     # manifest + luật (selfcheck --module) + kiểm kế toán tĩnh + typecheck + test hợp đồng module trên CSDL test — phải ĐẠT
npx bizcity module accounting-check mau-module   # riêng phần kế toán: không đụng bảng sổ, không số tài khoản, docType / docKey đúng hợp đồng; kèm BIZCITY_SERVER + BIZCITY_API_KEY thì chạy cả chứng từ mẫu examples/*.json
npm run module -w @ketoan/api -- migrate mau-module   # chạy migration của module (vai trò mod_mau_module_owner)
npm run build -w @bizcity-module/mau-module           # dựng api/ ra dist/ (API bản thật nạp dist)
```

Xong việc khi `npx bizcity module check mau-module` **ĐẠT** và README mô tả đúng nghiệp vụ.
