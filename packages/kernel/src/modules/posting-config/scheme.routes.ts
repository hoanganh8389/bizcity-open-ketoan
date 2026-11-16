// @bizcity-layer K kernel/config
// [2026-11-15 Nguyễn Văn Thủy] API Quy tắc hạch toán: đọc khung + tài khoản, đổi tài khoản trong phạm vi, mục đích xuất, xem thử bút toán (đóng góp)
/**
 * QUY TẮC HẠCH TOÁN (màn ACC41, docs/nghiep-vu/24-quy-tac-hach-toan.md, docs/api/17-quy-tac-hach-toan.md)
 *   GET  /api/v1/posting/scheme                 khung Nợ / Có từng nghiệp vụ + tài khoản đang dùng của mọi nguồn
 *   PUT  /api/v1/posting/scheme/accounts/:key   đổi tài khoản của quy tắc (chỉ tài khoản chi tiết, trong phạm vi)
 *   GET  /api/v1/posting/purposes               mục đích xuất
 *   PUT  /api/v1/posting/purposes/:code         thêm / sửa mục đích xuất (ngừng dùng bằng isActive=false, không xoá)
 *   POST /api/v1/posting/scheme/preview         xem thử bút toán của một chứng từ (không lưu gì)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ingestDocumentSchema } from '@ketoan/contracts';
import { db, type Db } from '@bizcity/platform/db/client';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { ok } from '@bizcity/platform/core/http';
import { Errors } from '@bizcity/platform/core/errors';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';
import { PURPOSE_RANGE, RULE_KEYS, SCHEME, inRange } from './scheme.js';
import { documentService } from '../documents/document.service.js';

const tags = ['Quy tắc hạch toán'];

/**
 * Mục đích xuất gốc — nạp mã còn thiếu khi mở màn (mã đã có, kể cả đã ngừng, giữ nguyên); tài khoản lấy ứng viên chi tiết đầu tiên có trong hệ thống tài khoản.
 * [2026-11-15 Nguyễn Văn Thủy] thêm NQUA / XQUA (quà NCC không hoá đơn, xuất quà tặng khách — phân hệ Mua hàng) để kế toán cài trước khi có phiếu quà (đóng góp)
 */
const SEED_PURPOSES: { code: string; name: string; direction: 'increase' | 'decrease' | 'both'; account: string | string[] }[] = [
  { code: 'NQUA', name: 'Nhận quà NCC (Mua hàng)', direction: 'increase', account: ['71153', '7118'] },
  { code: 'XQUA', name: 'Xuất quà tặng khách (Mua hàng)', direction: 'decrease', account: ['64184', '64188'] },
  { code: 'HUY', name: 'Hủy hàng hỏng, hết hạn', direction: 'decrease', account: '6328' },
  { code: 'MAT', name: 'Mất, thất thoát hàng', direction: 'decrease', account: '8115' },
  { code: 'TANG-KH', name: 'Tặng khách dùng thử, marketing', direction: 'decrease', account: '64184' },
  { code: 'DUNG-BH', name: 'Dùng cho bộ phận bán hàng', direction: 'decrease', account: '64128' },
  { code: 'DUNG-QL', name: 'Dùng cho bộ phận quản lý', direction: 'decrease', account: '64232' },
  { code: 'DAO-TAO', name: 'Đào tạo bộ phận bán hàng', direction: 'decrease', account: '64185' },
  { code: 'THUONG-NV', name: 'Thưởng, tặng nhân viên bằng hàng', direction: 'decrease', account: '64118' },
  { code: 'NGOAI-GIAO', name: 'Ngoại giao, biếu tặng', direction: 'decrease', account: '64282' },
  { code: 'THUA-TN', name: 'Hàng thừa ghi thu nhập khác', direction: 'increase', account: '7118' },
];

async function ensurePurposes(trx: Db, tenantId: string): Promise<void> {
  const have = new Set((await trx.selectFrom('stock_purposes').select('code').where('tenant_id', '=', tenantId).execute()).map((r) => r.code));
  const missing = SEED_PURPOSES.filter((p) => !have.has(p.code));
  if (!missing.length) return;
  const cands = (p: (typeof SEED_PURPOSES)[number]) => (Array.isArray(p.account) ? p.account : [p.account]);
  const posting = new Set((await trx.selectFrom('accounts').select('code').where('tenant_id', '=', tenantId).where('is_posting', '=', true).where('is_active', '=', true)
    .where('code', 'in', missing.flatMap(cands)).execute()).map((a) => a.code));
  const rows = missing.flatMap((p) => { const acc = cands(p).find((c) => posting.has(c)); return acc ? [{ tenant_id: tenantId, code: p.code, name: p.name, direction: p.direction, account_code: acc, sort_order: SEED_PURPOSES.indexOf(p) + 1, updated_by: 'system' }] : []; });
  if (rows.length) await trx.insertInto('stock_purposes').values(rows).onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing()).execute();
}

/** Tài khoản phải có, đang dùng, là tài khoản chi tiết và trong phạm vi. */
async function assertAccount(trx: Db, tenantId: string, code: string, range: string[], label: string): Promise<void> {
  const a = await trx.selectFrom('accounts').select(['code', 'is_active', 'is_posting']).where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!a || !a.is_active) throw Errors.validation(`${label}: tài khoản ${code} không có hoặc đã ngừng dùng`);
  if (!a.is_posting) throw Errors.validation(`${label}: ${code} là tài khoản tổng hợp — chọn tài khoản chi tiết`);
  if (!inRange(code, range)) throw Errors.validation(`${label}: ${code} ngoài phạm vi được chọn (${range.join(', ')})`);
}

const purposeBody = z.object({
  name: z.string().trim().min(1).max(200),
  direction: z.enum(['increase', 'decrease', 'both']).default('decrease'),
  accountCode: z.string().trim().regex(/^[0-9]{3,20}$/),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const schemeActions: AnyActionDef[] = [
  defineAction({
    id: 'core.posting-scheme.set-account', title: 'Đổi tài khoản của quy tắc hạch toán', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ key: z.string(), accountCode: z.string().trim().regex(/^[0-9]{3,20}$/) }),
    output: z.object({ key: z.string(), accountCode: z.string(), before: z.string().nullable() }),
    expose: { http: { method: 'PUT', path: '/api/v1/posting/scheme/accounts/:key' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_defaults', objectId: (i) => i.key },
    handler: async (ctx, b) => {
      const spec = RULE_KEYS[b.key];
      if (!spec) throw Errors.validation(`Khoá ${b.key} không có trong Quy tắc hạch toán`);
      const trx = ctx.data.tx;
      await assertAccount(trx, ctx.tenant.id, b.accountCode, spec.range, spec.label);
      const before = await trx.selectFrom('posting_defaults').select('account_code').where('tenant_id', '=', ctx.tenant.id).where('key', '=', b.key).executeTakeFirst();
      await trx.insertInto('posting_defaults').values({ tenant_id: ctx.tenant.id, key: b.key, account_code: b.accountCode })
        .onConflict((oc) => oc.columns(['tenant_id', 'key']).doUpdateSet({ account_code: b.accountCode })).execute();
      return { key: b.key, accountCode: b.accountCode, before: before?.account_code ?? null };
    },
  }),
  defineAction({
    id: 'core.stock-purpose.upsert', title: 'Thêm / sửa mục đích xuất', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: purposeBody.extend({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,31}$/) }),
    output: z.object({ code: z.string() }),
    expose: { http: { method: 'PUT', path: '/api/v1/posting/purposes/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_purpose', objectId: (i) => i.code },
    handler: async (ctx, b) => {
      const trx = ctx.data.tx;
      await assertAccount(trx, ctx.tenant.id, b.accountCode, PURPOSE_RANGE, `Mục đích ${b.code}`);
      const values = { name: b.name, direction: b.direction, account_code: b.accountCode, is_active: b.isActive, updated_by: ctx.actor.id, updated_at: new Date(), ...(b.sortOrder !== undefined ? { sort_order: b.sortOrder } : {}) };
      await trx.insertInto('stock_purposes').values({ tenant_id: ctx.tenant.id, code: b.code, ...values })
        .onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(values)).execute();
      return { code: b.code };
    },
  }),
];

export async function schemeRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, schemeActions);
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('catalog:read');

  r.get('/api/v1/posting/scheme', {
    preHandler: read,
    schema: { tags, summary: 'Quy tắc hạch toán: khung Nợ / Có từng nghiệp vụ và tài khoản của mọi nguồn' },
    handler: async (req) => {
      const tenantId = authOf(req).tenantId;
      await db.transaction().execute((trx) => ensurePurposes(trx, tenantId));
      const [defaults, accounts, methods, whTypes, taxes, purposes] = await Promise.all([
        db.selectFrom('posting_defaults').select(['key', 'account_code']).where('tenant_id', '=', tenantId).execute(),
        db.selectFrom('accounts').select(['code', 'name', 'is_posting', 'is_active']).where('tenant_id', '=', tenantId).execute(),
        db.selectFrom('payment_methods').select(['code', 'name', 'account_code', 'bank_account_code', 'is_receivable', 'partner_code']).where('tenant_id', '=', tenantId).where('is_active', '=', true).orderBy('sort_order').orderBy('code').execute(),
        db.selectFrom('warehouse_types').select(['code', 'name', 'account_prefix', 'owned', 'can_sell']).where('tenant_id', '=', tenantId).where('deleted_at', 'is', null).where('is_active', '=', true).orderBy('sort_order').execute(),
        db.selectFrom('tax_codes').select(['code', 'name', 'rate', 'direction', 'account_code']).where('tenant_id', '=', tenantId).where('is_active', '=', true).orderBy('code').execute(),
        db.selectFrom('stock_purposes').selectAll().where('tenant_id', '=', tenantId).orderBy('sort_order').orderBy('code').execute(),
      ]);
      const acc = new Map(accounts.map((a) => [a.code, a]));
      const name = (c: string | null | undefined) => (c ? acc.get(c)?.name ?? null : null);
      const status = (c: string | null | undefined) => (!c ? 'missing' : !acc.get(c) || !acc.get(c)!.is_active ? 'unknown' : !acc.get(c)!.is_posting ? 'summary' : 'ok');
      const def = new Map(defaults.map((d) => [d.key, d.account_code]));
      return ok({
        businesses: SCHEME,
        keys: Object.entries(RULE_KEYS).map(([key, k]) => ({ key, label: k.label, range: k.range, help: k.help, suggest: k.suggest, accountCode: def.get(key) ?? null, accountName: name(def.get(key)), status: status(def.get(key)) })),
        sources: {
          paymentMethods: methods.map((m) => ({ code: m.code, name: m.name, accountCode: m.account_code, accountName: name(m.account_code), bankAccountCode: m.bank_account_code, isReceivable: m.is_receivable, partnerCode: m.partner_code, status: status(m.account_code) })),
          warehouseTypes: whTypes.map((w) => ({ code: w.code, name: w.name, accountCode: w.account_prefix || null, accountName: name(w.account_prefix), owned: w.owned, canSell: w.can_sell, status: w.account_prefix ? status(w.account_prefix) : 'fallback' })),
          taxCodes: taxes.map((t) => ({ code: t.code, name: t.name, rate: Number(t.rate), direction: t.direction, accountCode: t.account_code, accountName: name(t.account_code), status: t.account_code ? status(t.account_code) : 'fallback' })),
          purposes: purposes.map((p) => ({ code: p.code, name: p.name, direction: p.direction, accountCode: p.account_code, accountName: name(p.account_code), isActive: p.is_active, sortOrder: p.sort_order, status: status(p.account_code) })),
        },
        purposeRange: PURPOSE_RANGE,
      });
    },
  });

  r.get('/api/v1/posting/purposes', {
    preHandler: read,
    schema: { tags, summary: 'Mục đích xuất (phiếu xuất kho không bán / điều chỉnh kho)' },
    handler: async (req) => {
      const tenantId = authOf(req).tenantId;
      await db.transaction().execute((trx) => ensurePurposes(trx, tenantId));
      const rows = await db.selectFrom('stock_purposes').selectAll().where('tenant_id', '=', tenantId).orderBy('sort_order').orderBy('code').execute();
      return ok(rows.map((p) => ({ code: p.code, name: p.name, direction: p.direction, accountCode: p.account_code, isActive: p.is_active })));
    },
  });

  r.post('/api/v1/posting/scheme/preview', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Xem thử bút toán của một chứng từ theo quy tắc hiện tại (không lưu gì)', body: z.object({ document: ingestDocumentSchema }) },
    handler: async (req) => ok(await documentService.previewIngest(authOf(req), req.body.document)),
  });
}
