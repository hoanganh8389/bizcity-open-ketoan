// @bizcity-layer M data/masterdata
// [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28: mặt hàng NHÁP (Gate A, ADR-0019) — validate, lưu nháp khi còn lỗi chặn, tự kích hoạt + bể chờ kiểm lại; ô chọn (status=active) không hiện nháp
/**
 * Danh mục mặt hàng và phân loại hàng hoá.
 *   GET /api/v1/products?search=&brand=&industry=&group=&type=&postingGroup=&status=&page=&pageSize=
 *   PUT /api/v1/products/:sku            kế toán sửa một mặt hàng (phân loại, nhóm hạch toán, loại thuế, ghi chú, khoá)
 *   DELETE /api/v1/products/:sku         xoá mặt hàng chưa có nhập xuất
 *   DELETE /api/v1/item-classes/:kind/:code   xoá mã phân loại chưa gắn mặt hàng, chưa có mã con
 *   PUT /api/v1/products                 đồng bộ danh mục từ hệ thống bán hàng / mua hàng (tối đa 2000 mặt hàng)
 *   GET /api/v1/product-accounts?group=&search=   mặt hàng – tài khoản (ACC17): bộ tài khoản theo nhóm hạch toán, loại thuế, ghi chú, TTĐB
 *   PUT /api/v1/product-accounts                  sửa hàng loạt (tối đa 5000); đổi tài khoản → gán sang nhóm hạch toán có đúng bộ tài khoản (chưa có thì tự tạo)
 *   GET /api/v1/item-classes/:kind       nhãn hàng / ngành hàng / nhóm hàng / loại hàng
 *   PUT /api/v1/item-classes/:kind/:code thêm hoặc sửa
 *   GET /api/v1/products/skus-by-group?groups=a,b   mã hàng thuộc các nhóm hàng (gồm mọi nhóm con) — ô "Chọn nhóm" của báo cáo
 *   POST /api/v1/products/validate       khung Vì sao: nhắc / cảnh báo mềm / chặn cho một bản khai báo mặt hàng (chỉ đọc)
 *
 * Mặt hàng NHÁP (0061): lưu khi còn lỗi chặn (ITEM-BLOCK-*) — chưa dùng được trên chứng từ (cửa nạp: IN-ITEM-009), không có ở
 * ô chọn của phiếu (status=active loại nháp). Hết lỗi chặn → tự kích hoạt, mục bể chờ có mã đó được tiền kiểm lại.
 *   GET  /api/v1/products/auto-created?days=7   mặt hàng hệ thống bán hàng tự thêm từ chứng từ trong N ngày (thiếu ĐVT / nhóm, còn nháp)
 *   POST /api/v1/products/activate       core.product.activate-drafts — kích hoạt hàng loạt mặt hàng nháp (điền ĐVT / nhóm còn trống)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql } from 'kysely';
import { z } from 'zod';
import { db, type Db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { ok, pageMeta, pageQuerySchema, queryBool } from '../../core/http.js';
import { writeAudit } from '../../core/audit.js';
// [2026-11-03 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-LAYER-2): chỉ đọc danh sách tài khoản để đối chiếu — đọc bảng, không import Kernel
import { recordWarnAck } from '@bizcity/platform/core/catalog-warn';
import { WARN_ACK_MIN_REASON } from '@ketoan/contracts';
import { applyItemGate, applyItemGateBulk, itemHints } from './item.hints.js';

const warnAck = z.object({ reason: z.string().trim().min(WARN_ACK_MIN_REASON, `Lý do ít nhất ${WARN_ACK_MIN_REASON} ký tự`).max(500), codes: z.array(z.string().max(32)).max(50).default([]) });
import { deleteProduct } from '../catalog/catalog.service.js';
import { defineAction, mountActions, type AnyActionDef, sameTx } from '@bizcity/platform/core/actions';

const tags = ['Danh mục: Mặt hàng'];
export const ITEM_CLASS_KINDS = ['brand', 'industry', 'group', 'type'] as const;
type ClassKind = (typeof ITEM_CLASS_KINDS)[number];
const COLUMN: Record<ClassKind, 'brand_code' | 'industry_code' | 'group_code' | 'type_code'> = { brand: 'brand_code', industry: 'industry_code', group: 'group_code', type: 'type_code' };
const LABEL: Record<ClassKind, string> = { brand: 'Nhãn hàng', industry: 'Ngành hàng', group: 'Nhóm hàng', type: 'Loại hàng' };
const code = z.string().trim().max(64);

/** Thêm mã phân loại chưa có (tên = tên gửi kèm hoặc mã). Có tên thì cập nhật tên. */
async function ensureClasses(trx: Db, tenantId: string, items: { kind: ClassKind; code: string; name?: string }[]) {
  for (const it of items) {
    if (!it.code) continue;
    await trx
      .insertInto('item_classes')
      .values({ tenant_id: tenantId, kind: it.kind, code: it.code, name: it.name || it.code })
      .onConflict((oc) => oc.columns(['tenant_id', 'kind', 'code']).doUpdateSet(it.name ? { name: it.name } : { code: it.code }))
      .execute();
  }
}

const syncItem = z.object({
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().max(500).default(''),
  unit: z.string().trim().max(32).default(''),
  postingGroupCode: code.optional(),
  brandCode: code.optional(), brandName: z.string().trim().max(255).optional(),
  industryCode: code.optional(), industryName: z.string().trim().max(255).optional(),
  groupCode: code.optional(), groupName: z.string().trim().max(255).optional(),
  typeCode: code.optional(), typeName: z.string().trim().max(255).optional(),
  isActive: z.boolean().optional(),
});

const ACC_FIELDS = ['inventoryAccount', 'cogsAccount', 'revenueAccount', 'discountAccount', 'salesReturnAccount'] as const;
type AccField = (typeof ACC_FIELDS)[number];
const GROUP_COL: Record<AccField, 'inventory_account' | 'cogs_account' | 'revenue_account' | 'discount_account' | 'sales_return_account'> = {
  inventoryAccount: 'inventory_account', cogsAccount: 'cogs_account', revenueAccount: 'revenue_account', discountAccount: 'discount_account', salesReturnAccount: 'sales_return_account',
};
const ACC_LABEL: Record<AccField, string> = { inventoryAccount: 'TK kho', cogsAccount: 'TK giá vốn', revenueAccount: 'TK doanh thu', discountAccount: 'TK chiết khấu', salesReturnAccount: 'TK hàng bán trả lại' };
const productAccountItem = z.object({
  sku: z.string().trim().min(1).max(64),
  note: z.string().max(500).optional(),
  exciseRate: z.coerce.number().min(0).max(100).nullish(),
  taxOutCode: code.nullish(),
  taxInCode: code.nullish(),
  inventoryAccount: code.optional(), cogsAccount: code.optional(), revenueAccount: code.optional(), discountAccount: code.nullish(), salesReturnAccount: code.optional(),
});

/** Bỏ dấu tiếng Việt + chữ thường (phía máy chủ JS và phía SQL giống nhau) — tìm mặt hàng không phân biệt dấu. */
const VI_FROM = 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ';
const VI_TO = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';
export const plainVi = (s: string) => [...s.toLowerCase()].map((c) => { const k = VI_FROM.indexOf(c); return k >= 0 ? VI_TO[k] : c; }).join('').trim();
// [2026-11-05 04:30 PM Nguyễn Văn Thủy] PHASE-026 — S026-14: cùng biểu thức với chỉ mục products_search (0071) (đóng góp)
const SEARCH_TEXT = sql`bizcity_item_search_text(sku, name, note)`;
/** Danh mục lớn: đếm tới mức này là dừng, tránh quét cả bảng mỗi lần mở trang. */
const COUNT_CAP = 100_000;

export async function productRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/product-accounts', {
    preHandler: requirePermission('catalog:read'),
    schema: {
      tags,
      summary: 'Mặt hàng – tài khoản (ACC17)',
      querystring: z.object({
        group: z.string().optional().describe('Mã nhóm hàng (gồm cả nhóm con); trống = mọi mặt hàng'),
        search: z.string().trim().optional(),
        limit: z.coerce.number().int().min(1).max(1_000_000).default(1_000_000),
      }),
    },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const f = req.query;
      const groupFilter = f.group
        ? sql`AND p.group_code IN (WITH RECURSIVE t AS (SELECT code FROM item_classes WHERE tenant_id = ${tenantId} AND kind = 'group' AND code = ${f.group}
              UNION SELECT c.code FROM item_classes c JOIN t ON c.parent_code = t.code WHERE c.tenant_id = ${tenantId} AND c.kind = 'group') SELECT code FROM t)`
        : sql``;
      const s = f.search ? `%${f.search.toLowerCase()}%` : null;
      const searchFilter = s ? sql`AND (lower(p.sku) LIKE ${s} OR lower(p.name) LIKE ${s} OR lower(p.note) LIKE ${s})` : sql``;
      const base = sql`FROM products p
        LEFT JOIN product_posting_groups g ON g.tenant_id = p.tenant_id AND g.code = COALESCE(p.posting_group_code, (SELECT code FROM product_posting_groups WHERE tenant_id = ${tenantId} AND is_default LIMIT 1))
        WHERE p.tenant_id = ${tenantId} ${groupFilter} ${searchFilter}`;
      const [rows, total] = await Promise.all([
        sql<Record<string, string | null>>`SELECT p.sku, p.name, p.unit, p.note, p.excise_rate, p.posting_group_code, p.tax_out_code, p.tax_in_code, p.group_code, p.is_active,
            g.code AS g_code, g.inventory_account, g.cogs_account, g.revenue_account, g.discount_account, g.sales_return_account ${base} ORDER BY p.sku LIMIT ${f.limit}`.execute(db),
        sql<{ n: string }>`SELECT COUNT(*) AS n ${base}`.execute(db),
      ]);
      return ok(rows.rows.map((p) => ({
        sku: p.sku, name: p.name, unit: p.unit, note: p.note ?? '', exciseRate: p.excise_rate === null ? null : Number(p.excise_rate),
        postingGroupCode: p.posting_group_code, effectiveGroup: p.g_code, taxOutCode: p.tax_out_code, taxInCode: p.tax_in_code, groupCode: p.group_code, isActive: Boolean(p.is_active),
        inventoryAccount: p.inventory_account, cogsAccount: p.cogs_account, revenueAccount: p.revenue_account, discountAccount: p.discount_account, salesReturnAccount: p.sales_return_account,
      })), { total: Number(total.rows[0]?.n ?? 0), limit: f.limit });
    },
  });

  r.get('/api/v1/products', {
    preHandler: requirePermission('catalog:read'),
    schema: {
      tags,
      summary: 'Danh sách mặt hàng',
      querystring: pageQuerySchema.extend({
        search: z.string().trim().optional(),
        brand: z.string().optional(), industry: z.string().optional(), group: z.string().optional(), type: z.string().optional(),
        postingGroup: z.string().optional().describe('Mã nhóm hạch toán; "-" = chưa gán'),
        status: z.enum(['all', 'active', 'inactive', 'draft']).default('all').describe('active = đang dùng, KHÔNG gồm nháp (ô chọn của phiếu); draft = chỉ nháp'),
        parent: z.string().trim().max(64).optional().describe('Mã hàng cha: liệt kê các mã con của mã này'),
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const f = req.query;
      let q = db.selectFrom('products').where('tenant_id', '=', auth.tenantId);
      if (f.search) {
        // Không phân biệt dấu, nhiều từ: "sua tuoi 110" khớp "Sữa tươi TH 110ml" (mỗi từ phải có trong mã / tên / ghi chú).
        for (const w of plainVi(f.search).split(/\s+/).filter(Boolean).slice(0, 6)) {
          const s = `%${w}%`;
          q = q.where(sql<boolean>`${SEARCH_TEXT} LIKE ${s}`);
        }
      }
      for (const k of ITEM_CLASS_KINDS) {
        const v = f[k];
        if (!v) continue;
        if (v === '-') q = q.where(COLUMN[k], 'is', null);
        // Nhóm hàng là cây: chọn một nhóm thì lấy cả mặt hàng của các nhóm con.
        else if (k === 'group') q = q.where('group_code', 'in', sql<string>`(WITH RECURSIVE t AS (SELECT code FROM item_classes WHERE tenant_id = ${auth.tenantId} AND kind = 'group' AND code = ${v}
              UNION SELECT c.code FROM item_classes c JOIN t ON c.parent_code = t.code WHERE c.tenant_id = ${auth.tenantId} AND c.kind = 'group') SELECT code FROM t)`);
        else q = q.where(COLUMN[k], '=', v);
      }
      if (f.postingGroup) q = f.postingGroup === '-' ? q.where('posting_group_code', 'is', null) : q.where('posting_group_code', '=', f.postingGroup);
      if (f.status === 'draft') q = q.where('is_draft', '=', true);
      else if (f.status === 'active') q = q.where('is_active', '=', true).where('is_draft', '=', false);
      else if (f.status === 'inactive') q = q.where('is_active', '=', false);
      if (f.parent) q = q.where('parent_sku', '=', f.parent);
      const [rows, total] = await Promise.all([
        q.selectAll().orderBy('sku').limit(f.pageSize).offset((f.page - 1) * f.pageSize).execute(),
        db.selectFrom(q.select(sql`1`.as('x')).limit(COUNT_CAP + 1).as('c')).select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirst(),
      ]);
      return ok(rows.map((p) => ({
        sku: p.sku, name: p.name, unit: p.unit, postingGroupCode: p.posting_group_code, brandCode: p.brand_code, industryCode: p.industry_code,
        groupCode: p.group_code, typeCode: p.type_code, isActive: p.is_active, isDraft: p.is_draft, draftCodes: p.draft_codes, sourceSystem: p.source_system,
        note: p.note, exciseRate: p.excise_rate === null ? null : Number(p.excise_rate), taxOutCode: p.tax_out_code, taxInCode: p.tax_in_code, updatedAt: p.updated_at, parentSku: p.parent_sku,
      })), pageMeta(f, Number(total?.n ?? 0)));
    },
  });

  r.get('/api/v1/item-classes/:kind', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Nhãn hàng / ngành hàng / nhóm hàng / loại hàng', params: z.object({ kind: z.enum(ITEM_CLASS_KINDS) }) },
    handler: async (req) => {
      const auth = authOf(req);
      const kind = req.params.kind;
      const counts = await db.selectFrom('products').select([COLUMN[kind], (eb) => eb.fn.countAll<string>().as('n')]).where('tenant_id', '=', auth.tenantId).where(COLUMN[kind], 'is not', null).groupBy(COLUMN[kind]).execute();
      const n = new Map(counts.map((c) => [(c as Record<string, unknown>)[COLUMN[kind]] as string, Number(c.n)]));
      const rows = await db.selectFrom('item_classes').selectAll().where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).orderBy('code').execute();
      return ok(rows.map((c) => ({ code: c.code, name: c.name, parentCode: c.parent_code, isActive: c.is_active, skuCode: c.sku_code, products: n.get(c.code) ?? 0 })));
    },
  });

  // [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — báo cáo theo mã hàng lọc "Chọn nhóm": tích nhóm cha = cả nhánh con bên dưới (đóng góp)
  r.get('/api/v1/products/skus-by-group', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Mã hàng thuộc các nhóm hàng đã chọn (gồm mọi nhóm con)', querystring: z.object({ groups: z.string().max(20000).default('') }) },
    handler: async (req) => {
      const auth = authOf(req);
      const groups = [...new Set(req.query.groups.split(',').map((g) => g.trim()).filter(Boolean))];
      if (!groups.length) return ok({ skus: [] as string[] });
      const res = await sql<{ sku: string }>`
        WITH RECURSIVE g(code) AS (
          SELECT code FROM item_classes WHERE tenant_id = ${auth.tenantId} AND kind = 'group' AND code IN (${sql.join(groups)})
          UNION
          SELECT c.code FROM item_classes c JOIN g ON c.parent_code = g.code WHERE c.tenant_id = ${auth.tenantId} AND c.kind = 'group'
        )
        SELECT p.sku FROM products p WHERE p.tenant_id = ${auth.tenantId} AND p.group_code IN (SELECT code FROM g)`.execute(db);
      return ok({ skus: res.rows.map((r) => r.sku) });
    },
  });
  // [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — D024-3: trước khi tắt tự thêm mặt hàng, kế toán thấy hệ thống bán hàng đã tự thêm những gì (giai đoạn cảnh báo)
  r.get('/api/v1/products/auto-created', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Mặt hàng tự thêm từ chứng từ trong N ngày: số lượng, thiếu đơn vị tính / nhóm hạch toán, còn nháp', querystring: z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }) },
    handler: async (req) => {
      const auth = authOf(req);
      const since = new Date(Date.now() - req.query.days * 86_400_000);
      return db.transaction().execute(async (trx) => {
        const base = trx.selectFrom('products').where('tenant_id', '=', auth.tenantId).where('source_system', '=', 'document').where('created_at', '>=', since);
        const [sum, items] = await Promise.all([
          base.select([
            sql<number>`count(*)::int`.as('count'),
            sql<number>`count(*) FILTER (WHERE unit = '')::int`.as('noUnit'),
            sql<number>`count(*) FILTER (WHERE posting_group_code IS NULL)::int`.as('noGroup'),
            sql<number>`count(*) FILTER (WHERE is_draft)::int`.as('drafts'),
          ]).executeTakeFirstOrThrow(),
          base.select(['sku', 'name', 'unit', 'posting_group_code', 'is_draft', 'draft_codes', 'created_at']).orderBy('created_at', 'desc').limit(100).execute(),
        ]);
        return ok({
          days: req.query.days, ...sum,
          items: items.map((i) => ({ sku: i.sku, name: i.name, unit: i.unit, postingGroupCode: i.posting_group_code, isDraft: i.is_draft, draftCodes: i.draft_codes, createdAt: i.created_at })),
        });
      });
    },
  });

  mountActions(app, [activateDrafts]);

  mountActions(app, productWriteActions);
}

// [2026-11-03 05:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 gộp main (cổng danh mục): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const productWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.product-account.save', title: 'Sửa mặt hàng – tài khoản hàng loạt', tags,
    description: 'Trường không gửi = giữ nguyên. Đổi tài khoản: mặt hàng được gán sang nhóm hạch toán có đúng bộ năm tài khoản; chưa có nhóm như vậy thì tự tạo (mã NHT-Txxx).',
    permission: 'settings:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ items: z.array(productAccountItem).min(1).max(5000) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/product-accounts' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'product_account' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const items = input.items;
      const out = await sameTx(trx, async (trx) => {
        const errors: string[] = [];
        const created: string[] = [];
        const groups = await trx.selectFrom('product_posting_groups').selectAll().where('tenant_id', '=', auth.tenantId).orderBy('code').execute();
        const keyOf = (a: Record<AccField, string | null>) => ACC_FIELDS.map((k) => a[k] ?? '').join('|');
        const accOf = (g: (typeof groups)[number]): Record<AccField, string | null> => Object.fromEntries(ACC_FIELDS.map((k) => [k, g[GROUP_COL[k]]])) as Record<AccField, string | null>;
        const byKey = new Map<string, string>();
        for (const g of groups) if (!byKey.has(keyOf(accOf(g)))) byKey.set(keyOf(accOf(g)), g.code);
        const byCode = new Map(groups.map((g) => [g.code, g]));
        const def = groups.find((g) => g.is_default);
        const accounts = new Map((await trx.selectFrom('accounts').selectAll().where('tenant_id', '=', auth.tenantId).execute()).map((a) => [a.code, a]));
        const taxes = new Map((await trx.selectFrom('tax_codes').select(['code', 'direction']).where('tenant_id', '=', auth.tenantId).execute()).map((t) => [t.code, t.direction]));
        const products = new Map((await trx.selectFrom('products').select(['sku', 'posting_group_code', 'tax_out_code', 'tax_in_code', 'note', 'excise_rate']).where('tenant_id', '=', auth.tenantId).where('sku', 'in', items.map((i) => i.sku)).execute()).map((p) => [p.sku, p]));
        let seq = groups.filter((g) => /^NHT-T\d+$/.test(g.code)).reduce((m, g) => Math.max(m, Number(g.code.slice(5))), 0);
        let updated = 0;
        const touched: string[] = [];
        for (const it of items) {
          const p = products.get(it.sku);
          if (!p) { errors.push(`${it.sku}: mặt hàng chưa có trong danh mục`); continue; }
          const problems: string[] = [];
          for (const k of ACC_FIELDS) {
            const v = it[k];
            if (!v) continue;
            const a = accounts.get(v);
            if (!a) problems.push(`${ACC_LABEL[k]} ${v} không có`);
            else if (!a.is_posting) problems.push(`${ACC_LABEL[k]} ${v} là tài khoản tổng hợp`);
          }
          if (it.taxOutCode && taxes.get(it.taxOutCode) !== 'output') problems.push(`Mã VAT ra ${it.taxOutCode} không có (loại thuế đầu ra)`);
          if (it.taxInCode && taxes.get(it.taxInCode) !== 'input') problems.push(`Mã VAT vào ${it.taxInCode} không có (loại thuế đầu vào)`);
          if (problems.length) { errors.push(`${it.sku}: ${problems.join('; ')}`); continue; }
          const patch: Record<string, unknown> = {};
          if (ACC_FIELDS.some((k) => it[k] !== undefined)) {
            const cur = byCode.get(p.posting_group_code ?? '') ?? def;
            if (!cur) { errors.push(`${it.sku}: chưa có nhóm hạch toán mặc định`); continue; }
            const want = { ...accOf(cur) };
            for (const k of ACC_FIELDS) if (it[k] !== undefined) want[k] = it[k] || null;
            if (!want.inventoryAccount || !want.cogsAccount || !want.revenueAccount || !want.salesReturnAccount) { errors.push(`${it.sku}: TK kho, giá vốn, doanh thu, hàng bán trả lại không được trống`); continue; }
            const key = keyOf(want);
            let code = keyOf(accOf(cur)) === key ? cur.code : byKey.get(key);
            if (!code) {
              code = `NHT-T${String(++seq).padStart(3, '0')}`;
              const row = await trx.insertInto('product_posting_groups').values({
                tenant_id: auth.tenantId, code, name: `Tự tạo theo mặt hàng (${want.inventoryAccount}/${want.cogsAccount}/${want.revenueAccount})`,
                inventory_account: want.inventoryAccount, cogs_account: want.cogsAccount, revenue_account: want.revenueAccount, discount_account: want.discountAccount, sales_return_account: want.salesReturnAccount,
              }).returningAll().executeTakeFirstOrThrow();
              byKey.set(key, code); byCode.set(code, row); created.push(code);
            }
            if (code !== p.posting_group_code) patch.posting_group_code = code;
          }
          if (it.taxOutCode !== undefined && (it.taxOutCode || null) !== p.tax_out_code) patch.tax_out_code = it.taxOutCode || null;
          if (it.taxInCode !== undefined && (it.taxInCode || null) !== p.tax_in_code) patch.tax_in_code = it.taxInCode || null;
          if (it.note !== undefined && it.note !== p.note) patch.note = it.note;
          if (it.exciseRate !== undefined && (it.exciseRate ?? null) !== (p.excise_rate === null ? null : Number(p.excise_rate))) patch.excise_rate = it.exciseRate ?? null;
          if (!Object.keys(patch).length) continue;
          await trx.updateTable('products').set({ ...patch, updated_at: new Date() }).where('tenant_id', '=', auth.tenantId).where('sku', '=', it.sku).execute();
          updated++;
          if (patch.posting_group_code) touched.push(it.sku);
        }
        // Gate A ([2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28): gán nhóm hạch toán có thể kích hoạt mặt hàng nháp.
        await applyItemGateBulk(trx, auth, touched);
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'product.accounts', objectType: 'product', objectId: `${items.length} mặt hàng`, after: { updated, created, skus: items.map((i) => i.sku).slice(0, 50) } });
        return { updated, skipped: items.length - updated - errors.length, createdGroups: created, errors };
      });
      return out;
    },
  }),
  defineAction({
    id: 'core.product.validate', title: 'Khung Vì sao: kiểm thử một bản khai báo mặt hàng (chỉ đọc)', tags,
    permission: 'catalog:read', effect: 'read', idempotency: 'none',
    input: z.object({ sku: z.string().trim().min(1).max(64), unit: z.string().trim().max(32).nullish(), postingGroupCode: code.nullish() }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/products/validate' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      // [2026-11-04 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-3: so với ĐVT đang lưu để khung Vì sao nhắc ITEM-HINT-003 ngay khi gõ
      const cur = await trx.selectFrom('products').select('unit').where('tenant_id', '=', ctx.legacyAuth.tenantId).where('sku', '=', input.sku).executeTakeFirst();
      return { findings: await itemHints(trx, ctx.legacyAuth.tenantId, { ...input, previousUnit: cur?.unit }) };
    },
  }),
  defineAction({
    id: 'core.product.save', title: 'Sửa một mặt hàng (phân loại, nhóm hạch toán, khoá)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (z.object({
        name: z.string().trim().max(500).optional(), unit: z.string().trim().max(32).optional(),
        postingGroupCode: code.nullish(), brandCode: code.nullish(), industryCode: code.nullish(), groupCode: code.nullish(), typeCode: code.nullish(),
        isActive: z.boolean().optional(),
        note: z.string().max(500).optional(), taxOutCode: code.nullish(), taxInCode: code.nullish(), exciseRate: z.coerce.number().min(0).max(100).nullish(),
        warnAck: warnAck.optional().describe('Ghi nhận cảnh báo mềm khi lưu (D023-6)'),
      })).merge(z.object({ sku: z.string().trim().min(1).max(64) })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/products/:sku' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'product', objectId: (i) => String(i.sku) },
    handler: async (ctx, input) => {
      const { sku: _sku, ...reqBody } = input;
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const b = reqBody;
      let findings: Awaited<ReturnType<typeof itemHints>> = [];
      let isDraft = false;
      let recheck = { checked: 0, cleared: 0 };
      await sameTx(trx, async (trx) => {
        for (const k of ITEM_CLASS_KINDS) {
          const v = b[`${k}Code` as const];
          if (v) {
            const found = await trx.selectFrom('item_classes').select('code').where('tenant_id', '=', auth.tenantId).where('kind', '=', k).where('code', '=', v).executeTakeFirst();
            if (!found) throw Errors.validation(`${LABEL[k]} ${v} chưa có trong danh mục`);
          }
        }
        if (b.postingGroupCode) {
          const g = await trx.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', auth.tenantId).where('code', '=', b.postingGroupCode).executeTakeFirst();
          if (!g) throw Errors.validation(`Nhóm hạch toán ${b.postingGroupCode} chưa có`);
        }
        const patch: Record<string, unknown> = { updated_at: new Date() };
        if (b.name !== undefined) patch.name = b.name;
        if (b.unit !== undefined) patch.unit = b.unit;
        if (b.postingGroupCode !== undefined) patch.posting_group_code = b.postingGroupCode || null;
        for (const k of ITEM_CLASS_KINDS) { const v = b[`${k}Code` as const]; if (v !== undefined) patch[COLUMN[k]] = v || null; }
        if (b.isActive !== undefined) patch.is_active = b.isActive;
        if (b.note !== undefined) patch.note = b.note;
        if (b.exciseRate !== undefined) patch.excise_rate = b.exciseRate ?? null;
        for (const [key, col, dir] of [['taxOutCode', 'tax_out_code', 'output'], ['taxInCode', 'tax_in_code', 'input']] as const) {
          const v = b[key];
          if (v === undefined) continue;
          if (v) {
            const t = await trx.selectFrom('tax_codes').select('direction').where('tenant_id', '=', auth.tenantId).where('code', '=', v).executeTakeFirst();
            if (!t || t.direction !== dir) throw Errors.validation(`Loại thuế ${v} không có (cần loại thuế ${dir === 'output' ? 'đầu ra' : 'đầu vào'})`);
          }
          patch[col] = v || null;
        }
        // [2026-11-04 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-3: nhớ ĐVT gốc trước khi sửa để Gate A nhắc ITEM-HINT-003 (biến thể khác = mặt hàng mới)
        const before = await trx.selectFrom('products').select('unit').where('tenant_id', '=', auth.tenantId).where('sku', '=', input.sku).executeTakeFirst();
        await trx
          .insertInto('products')
          .values({ tenant_id: auth.tenantId, sku: input.sku, name: b.name ?? '', unit: b.unit ?? '', source_system: 'manual' })
          .onConflict((oc) => oc.columns(['tenant_id', 'sku']).doNothing())
          .execute();
        await trx.updateTable('products').set(patch).where('tenant_id', '=', auth.tenantId).where('sku', '=', input.sku).execute();
        // Gate A: còn lỗi chặn → NHÁP (không mất bản khai, chưa dùng được trên chứng từ); vừa kích hoạt → bể chờ kiểm lại (R-GATE-6).
        const gate = await applyItemGate(trx, auth, input.sku, { previousUnit: before?.unit });
        findings = gate.findings;
        isDraft = gate.isDraft;
        recheck = gate.recheck;
        const { warnAck: ack, ...after } = b;
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: isDraft ? 'product.draft' : gate.wasDraft ? 'product.activate' : 'product.update', objectType: 'product', objectId: input.sku, after });
        await recordWarnAck(trx, auth, 'product', input.sku, findings, ack);
      });
      return (Object.assign(ctx.meta, { gate: 'A', findings, ...(isDraft ? { held: { kind: 'draft', id: input.sku } } : {}), ...(recheck.checked ? { inboxRechecked: recheck } : {}) }), { sku: input.sku, isDraft });
    },
  }),
  defineAction({
    id: 'core.product.sync', title: 'Đồng bộ danh mục mặt hàng từ hệ thống bán hàng / mua hàng', tags,
    description: 'Tạo mới hoặc cập nhật theo mã hàng. Trường để trống không xoá thông tin cũ. Mã phân loại chưa có thì tự thêm (tên = tên gửi kèm hoặc mã).',
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ source: z.string().trim().max(32).default('external'), products: z.array(syncItem).min(1).max(2000) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/products' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'product' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const { source, products } = input;
      let drafts: string[] = [];
      await sameTx(trx, async (trx) => {
        await ensureClasses(trx, auth.tenantId, products.flatMap((p) => ITEM_CLASS_KINDS.map((k) => ({ kind: k, code: p[`${k}Code` as const] ?? '', name: p[`${k}Name` as const] }))));
        const groups = new Set((await trx.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', auth.tenantId).execute()).map((g) => g.code));
        const badGroups = [...new Set(products.map((p) => p.postingGroupCode).filter((g): g is string => Boolean(g) && !groups.has(g!)))];
        if (badGroups.length) throw Errors.validation(`Nhóm hạch toán chưa có: ${badGroups.join(', ')}`);
        for (const p of products) {
          await trx
            .insertInto('products')
            .values({
              tenant_id: auth.tenantId, sku: p.sku, name: p.name, unit: p.unit, posting_group_code: p.postingGroupCode ?? null,
              brand_code: p.brandCode || null, industry_code: p.industryCode || null, group_code: p.groupCode || null, type_code: p.typeCode || null,
              is_active: p.isActive ?? true, source_system: source,
            })
            .onConflict((oc) => oc.columns(['tenant_id', 'sku']).doUpdateSet({
              name: sql<string>`COALESCE(NULLIF(excluded.name, ''), products.name)`,
              unit: sql<string>`COALESCE(NULLIF(excluded.unit, ''), products.unit)`,
              posting_group_code: sql<string>`COALESCE(excluded.posting_group_code, products.posting_group_code)`,
              brand_code: sql<string>`COALESCE(excluded.brand_code, products.brand_code)`,
              industry_code: sql<string>`COALESCE(excluded.industry_code, products.industry_code)`,
              group_code: sql<string>`COALESCE(excluded.group_code, products.group_code)`,
              type_code: sql<string>`COALESCE(excluded.type_code, products.type_code)`,
              ...(p.isActive !== undefined ? { is_active: p.isActive } : {}),
              source_system: source,
              updated_at: new Date(),
            }))
            .execute();
        }
        // Gate A cho đồng bộ: mặt hàng còn lỗi chặn (thiếu ĐVT gốc, thiếu nhóm khi không có nhóm mặc định) → nháp; vừa đủ → kích hoạt.
        drafts = (await applyItemGateBulk(trx, auth, products.map((p) => p.sku))).drafts;
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'product.sync', objectType: 'product', objectId: `${products.length} mặt hàng`, after: { source, skus: products.map((p) => p.sku).slice(0, 50) } });
      });
      return (Object.assign(ctx.meta, drafts.length ? { gate: 'A', held: { kind: 'draft', ids: drafts } } : undefined), { count: products.length, drafts });
    },
  }),
  defineAction({
    id: 'core.product.delete', title: 'Xoá mặt hàng chưa có nhập xuất', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ sku: z.string() }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/products/:sku' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'product', objectId: (i) => String(i.sku) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const { sku } = input;
      // Xoá kèm đơn vị tính, giá và báo hệ thống bán hàng xoá theo (catalog_tombstones).
      await sameTx(trx, (trx) => deleteProduct(trx, auth.tenantId, auth.actor, sku));
      return { sku };
    },
  }),
  defineAction({
    id: 'core.item-class.delete', title: 'Xoá mã phân loại chưa dùng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ kind: z.enum(ITEM_CLASS_KINDS), code: z.string() }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/item-classes/:kind/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'item_class', objectId: (i) => String(i.kind) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const { kind, code: c } = input;
      await sameTx(trx, async (trx) => {
        const before = await trx.selectFrom('item_classes').selectAll().where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('code', '=', c).executeTakeFirst();
        if (!before) throw Errors.notFound(`${LABEL[kind]} ${c}`);
        const child = await trx.selectFrom('item_classes').select('code').where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('parent_code', '=', c).limit(1).executeTakeFirst();
        if (child) throw Errors.conflict(`${LABEL[kind]} ${c} có mã con (${child.code}): xoá mã con trước`);
        const used = await trx.selectFrom('products').select('sku').where('tenant_id', '=', auth.tenantId).where(COLUMN[kind], '=', c).limit(1).executeTakeFirst();
        if (used) throw Errors.conflict(`${LABEL[kind]} ${c} đang gắn cho mặt hàng ${used.sku}: bỏ tích "Đang dùng" để ngừng`);
        await trx.deleteFrom('item_classes').where('id', '=', before.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'item_class.delete', objectType: `item_class:${kind}`, objectId: c, before });
      });
      return { code: c };
    },
  }),
  defineAction({
    id: 'core.item-class.upsert', title: 'Thêm hoặc sửa nhãn / ngành / nhóm / loại hàng (?new=1: thêm mới, báo trùng mã)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (z.object({ name: z.string().trim().min(1).max(255), parentCode: code.optional(), isActive: z.boolean().default(true), skuCode: z.string().trim().max(20).regex(/^[0-9A-Za-z]*$/, 'Mã SKU chỉ gồm chữ và số').optional() })).merge(z.object({ new: queryBool })).merge(z.object({ kind: z.enum(ITEM_CLASS_KINDS), code: z.string().trim().min(1).max(64) })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/item-classes/:kind/:code', query: z.object({ new: queryBool }) }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'item_class', objectId: (i) => String(i.kind) },
    handler: async (ctx, input) => {
      const { kind: _kind, code: _code, new: _new, ...reqBody } = input;
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const { kind, code: c } = input;
      const b = reqBody;
      if (b.parentCode === c) throw Errors.validation(`${LABEL[kind]} cha không được là chính nó`);
      // Thêm mới mà trùng mã: báo lỗi — không ghi đè (đổi tên, đổi cha) mã đang dùng.
      if (input.new) {
        const dup = await trx.selectFrom('item_classes').select(['name', 'parent_code']).where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('code', '=', c).executeTakeFirst();
        if (dup) throw Errors.conflict(`Mã ${LABEL[kind].toLowerCase()} ${c} đã có: "${dup.name}"${dup.parent_code ? ` (thuộc ${dup.parent_code})` : ''} — chọn mã khác`);
      }
      if (b.parentCode) {
        const p = await trx.selectFrom('item_classes').select('code').where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('code', '=', b.parentCode).executeTakeFirst();
        if (!p) throw Errors.validation(`${LABEL[kind]} cha ${b.parentCode} chưa có`);
        // [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — chặn chuyển nhóm vào nhánh con của chính nó; chặn trùng mã ngắn giữa các nhóm cùng cha (đóng góp)
        const all = await trx.selectFrom('item_classes').select(['code', 'parent_code']).where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).execute();
        const up = new Map(all.map((x) => [x.code, x.parent_code]));
        for (let x: string | null | undefined = b.parentCode, n = 0; x && n < 50; x = up.get(x), n++) if (x === c) throw Errors.validation(`${LABEL[kind]} ${c} không chuyển vào nhóm con của chính nó (${b.parentCode})`);
      }
      if (kind === 'group' && b.skuCode) {
        const before = await trx.selectFrom('item_classes').select('sku_code').where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('code', '=', c).executeTakeFirst();
        if (before?.sku_code !== b.skuCode) {
          let dupQ = trx.selectFrom('item_classes').select(['code', 'name']).where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('sku_code', '=', b.skuCode).where('code', '<>', c);
          dupQ = b.parentCode ? dupQ.where('parent_code', '=', b.parentCode) : dupQ.where('parent_code', 'is', null);
          const dup = await dupQ.executeTakeFirst();
          if (dup) throw Errors.conflict(`Mã ngắn ${b.skuCode} đã dùng cho nhóm "${dup.name}" (${dup.code}) cùng cấp — chọn mã ngắn khác`);
        }
      }
      const values = { name: b.name, parent_code: b.parentCode || null, is_active: b.isActive, updated_at: new Date(), ...(b.skuCode !== undefined ? { sku_code: b.skuCode } : {}) };
      await sameTx(trx, async (trx) => {
        await trx.insertInto('item_classes').values({ tenant_id: auth.tenantId, kind, code: c, ...values }).onConflict((oc) => oc.columns(['tenant_id', 'kind', 'code']).doUpdateSet(values)).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'item_class.save', objectType: `item_class:${kind}`, objectId: c, after: b });
      });
      return { code: c };
    },
  }),
];

// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — D024-3: kích hoạt hàng loạt mặt hàng nháp — kế toán điền một lần đơn vị tính / nhóm hạch toán còn trống cho cả lô, rồi cổng danh mục
// quyết định từng mặt hàng (còn lỗi chặn thì vẫn nháp). Kích hoạt xong → bể chờ kiểm lại chứng từ đang chờ vì các mặt hàng đó.
const activateDrafts = defineAction({
  id: 'core.product.activate-drafts', title: 'Kích hoạt hàng loạt mặt hàng nháp', tags,
  description: 'Điền đơn vị tính / nhóm hạch toán cho mặt hàng nháp còn trống (không ghi đè ô đã có), rồi áp cổng danh mục: hết lỗi chặn → đang dùng. '
    + 'Còn cảnh báo mềm (vd dùng nhóm mặc định) thì ghi lý do (warnAck) — không có lý do thì nhật ký catalog.warn.unacked.',
  permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
  input: z.object({
    skus: z.array(code.min(1)).min(1).max(500),
    unit: z.string().trim().max(32).optional(),
    postingGroupCode: z.string().trim().max(64).optional(),
    warnAck: warnAck.optional(),
  }),
  output: z.object({
    activated: z.array(z.string()),
    stillDraft: z.array(z.object({ sku: z.string(), codes: z.array(z.string()) })),
    inboxRechecked: z.object({ checked: z.number(), cleared: z.number() }),
  }),
  expose: { http: { method: 'POST', path: '/api/v1/products/activate' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'product', objectId: (i) => (i.skus.length === 1 ? i.skus[0]! : `${i.skus.length} mặt hàng`) },
  handler: async (ctx, input) => {
    const tx = ctx.data.tx;
    const auth = ctx.legacyAuth;
    const drafts = (await tx.selectFrom('products').select('sku').where('tenant_id', '=', auth.tenantId).where('sku', 'in', [...new Set(input.skus)]).where('is_draft', '=', true).execute()).map((r) => r.sku);
    if (!drafts.length) return { activated: [], stillDraft: [], inboxRechecked: { checked: 0, cleared: 0 } };
    if (input.postingGroupCode) {
      const g = await tx.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', auth.tenantId).where('code', '=', input.postingGroupCode).executeTakeFirst();
      if (!g) throw Errors.validation(`Nhóm hạch toán ${input.postingGroupCode} chưa có`);
      await tx.updateTable('products').set({ posting_group_code: input.postingGroupCode }).where('tenant_id', '=', auth.tenantId).where('sku', 'in', drafts).where('posting_group_code', 'is', null).execute();
    }
    if (input.unit) await tx.updateTable('products').set({ unit: input.unit }).where('tenant_id', '=', auth.tenantId).where('sku', 'in', drafts).where('unit', '=', '').execute();
    const res = await applyItemGateBulk(tx, auth, drafts);
    for (const sku of res.activated) {
      const row = await tx.selectFrom('products').select(['unit', 'posting_group_code']).where('tenant_id', '=', auth.tenantId).where('sku', '=', sku).executeTakeFirstOrThrow();
      const findings = await itemHints(tx, auth.tenantId, { sku, unit: row.unit, postingGroupCode: row.posting_group_code });
      await recordWarnAck(tx, auth, 'product', sku, findings, input.warnAck);
      await writeAudit(tx, { tenantId: auth.tenantId, actor: auth.actor, action: 'product.activate', objectType: 'product', objectId: sku, after: { via: 'activate-drafts', unit: row.unit, postingGroupCode: row.posting_group_code } });
    }
    const left = res.drafts.length
      ? await tx.selectFrom('products').select(['sku', 'draft_codes']).where('tenant_id', '=', auth.tenantId).where('sku', 'in', res.drafts).execute()
      : [];
    return { activated: res.activated, stillDraft: left.map((r) => ({ sku: r.sku, codes: r.draft_codes ?? [] })), inboxRechecked: res.recheck };
  },
});
