// @bizcity-layer M data/masterdata
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
import { accountRepository } from '../accounts/account.repository.js';
import { deleteProduct } from '../catalog/catalog.service.js';

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
const PLAIN = (col: 'sku' | 'name' | 'note') => sql`translate(lower(${sql.ref(col)}), ${VI_FROM}, ${VI_TO})`;

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

  r.put('/api/v1/product-accounts', {
    preHandler: requirePermission('settings:write'),
    schema: {
      tags,
      summary: 'Sửa mặt hàng – tài khoản hàng loạt',
      description: 'Trường không gửi = giữ nguyên. Đổi tài khoản: mặt hàng được gán sang nhóm hạch toán có đúng bộ năm tài khoản; chưa có nhóm như vậy thì tự tạo (mã NHT-Txxx).',
      body: z.object({ items: z.array(productAccountItem).min(1).max(5000) }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const items = req.body.items;
      const out = await db.transaction().execute(async (trx) => {
        const errors: string[] = [];
        const created: string[] = [];
        const groups = await trx.selectFrom('product_posting_groups').selectAll().where('tenant_id', '=', auth.tenantId).orderBy('code').execute();
        const keyOf = (a: Record<AccField, string | null>) => ACC_FIELDS.map((k) => a[k] ?? '').join('|');
        const accOf = (g: (typeof groups)[number]): Record<AccField, string | null> => Object.fromEntries(ACC_FIELDS.map((k) => [k, g[GROUP_COL[k]]])) as Record<AccField, string | null>;
        const byKey = new Map<string, string>();
        for (const g of groups) if (!byKey.has(keyOf(accOf(g)))) byKey.set(keyOf(accOf(g)), g.code);
        const byCode = new Map(groups.map((g) => [g.code, g]));
        const def = groups.find((g) => g.is_default);
        const accounts = await accountRepository.mapByCode(trx, auth.tenantId);
        const taxes = new Map((await trx.selectFrom('tax_codes').select(['code', 'direction']).where('tenant_id', '=', auth.tenantId).execute()).map((t) => [t.code, t.direction]));
        const products = new Map((await trx.selectFrom('products').select(['sku', 'posting_group_code', 'tax_out_code', 'tax_in_code', 'note', 'excise_rate']).where('tenant_id', '=', auth.tenantId).where('sku', 'in', items.map((i) => i.sku)).execute()).map((p) => [p.sku, p]));
        let seq = groups.filter((g) => /^NHT-T\d+$/.test(g.code)).reduce((m, g) => Math.max(m, Number(g.code.slice(5))), 0);
        let updated = 0;
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
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'product.accounts', objectType: 'product', objectId: `${items.length} mặt hàng`, after: { updated, created, skus: items.map((i) => i.sku).slice(0, 50) } });
        return { updated, skipped: items.length - updated - errors.length, createdGroups: created, errors };
      });
      return ok(out);
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
        status: z.enum(['all', 'active', 'inactive']).default('all'),
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
          q = q.where((eb) => eb.or([eb(sql`${PLAIN('sku')}`, 'like', s), eb(sql`${PLAIN('name')}`, 'like', s), eb(sql`${PLAIN('note')}`, 'like', s)]));
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
      if (f.status !== 'all') q = q.where('is_active', '=', f.status === 'active');
      if (f.parent) q = q.where('parent_sku', '=', f.parent);
      const [rows, total] = await Promise.all([
        q.selectAll().orderBy('sku').limit(f.pageSize).offset((f.page - 1) * f.pageSize).execute(),
        q.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirst(),
      ]);
      return ok(rows.map((p) => ({
        sku: p.sku, name: p.name, unit: p.unit, postingGroupCode: p.posting_group_code, brandCode: p.brand_code, industryCode: p.industry_code,
        groupCode: p.group_code, typeCode: p.type_code, isActive: p.is_active, sourceSystem: p.source_system,
        note: p.note, exciseRate: p.excise_rate === null ? null : Number(p.excise_rate), taxOutCode: p.tax_out_code, taxInCode: p.tax_in_code, updatedAt: p.updated_at, parentSku: p.parent_sku,
      })), pageMeta(f, Number(total?.n ?? 0)));
    },
  });

  r.put('/api/v1/products/:sku', {
    preHandler: requirePermission('catalog:write'),
    schema: {
      tags,
      summary: 'Sửa một mặt hàng (phân loại, nhóm hạch toán, khoá)',
      params: z.object({ sku: z.string().trim().min(1).max(64) }),
      body: z.object({
        name: z.string().trim().max(500).optional(), unit: z.string().trim().max(32).optional(),
        postingGroupCode: code.nullish(), brandCode: code.nullish(), industryCode: code.nullish(), groupCode: code.nullish(), typeCode: code.nullish(),
        isActive: z.boolean().optional(),
        note: z.string().max(500).optional(), taxOutCode: code.nullish(), taxInCode: code.nullish(), exciseRate: z.coerce.number().min(0).max(100).nullish(),
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      await db.transaction().execute(async (trx) => {
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
        await trx
          .insertInto('products')
          .values({ tenant_id: auth.tenantId, sku: req.params.sku, name: b.name ?? '', unit: b.unit ?? '', source_system: 'manual' })
          .onConflict((oc) => oc.columns(['tenant_id', 'sku']).doNothing())
          .execute();
        await trx.updateTable('products').set(patch).where('tenant_id', '=', auth.tenantId).where('sku', '=', req.params.sku).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'product.update', objectType: 'product', objectId: req.params.sku, after: b });
      });
      return ok({ sku: req.params.sku });
    },
  });

  r.put('/api/v1/products', {
    preHandler: requirePermission('catalog:write'),
    schema: {
      tags,
      summary: 'Đồng bộ danh mục mặt hàng từ hệ thống bán hàng / mua hàng',
      description: 'Tạo mới hoặc cập nhật theo mã hàng. Trường để trống không xoá thông tin cũ. Mã phân loại chưa có thì tự thêm (tên = tên gửi kèm hoặc mã).',
      body: z.object({ source: z.string().trim().max(32).default('external'), products: z.array(syncItem).min(1).max(2000) }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const { source, products } = req.body;
      await db.transaction().execute(async (trx) => {
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
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'product.sync', objectType: 'product', objectId: `${products.length} mặt hàng`, after: { source, skus: products.map((p) => p.sku).slice(0, 50) } });
      });
      return ok({ count: products.length });
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

  r.delete('/api/v1/products/:sku', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Xoá mặt hàng chưa có nhập xuất', params: z.object({ sku: z.string() }) },
    handler: async (req) => {
      const auth = authOf(req);
      const { sku } = req.params;
      // Xoá kèm đơn vị tính, giá và báo hệ thống bán hàng xoá theo (catalog_tombstones).
      await db.transaction().execute((trx) => deleteProduct(trx, auth.tenantId, auth.actor, sku));
      return ok({ sku });
    },
  });

  r.delete('/api/v1/item-classes/:kind/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Xoá mã phân loại chưa dùng', params: z.object({ kind: z.enum(ITEM_CLASS_KINDS), code: z.string() }) },
    handler: async (req) => {
      const auth = authOf(req);
      const { kind, code: c } = req.params;
      await db.transaction().execute(async (trx) => {
        const before = await trx.selectFrom('item_classes').selectAll().where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('code', '=', c).executeTakeFirst();
        if (!before) throw Errors.notFound(`${LABEL[kind]} ${c}`);
        const child = await trx.selectFrom('item_classes').select('code').where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('parent_code', '=', c).limit(1).executeTakeFirst();
        if (child) throw Errors.conflict(`${LABEL[kind]} ${c} có mã con (${child.code}): xoá mã con trước`);
        const used = await trx.selectFrom('products').select('sku').where('tenant_id', '=', auth.tenantId).where(COLUMN[kind], '=', c).limit(1).executeTakeFirst();
        if (used) throw Errors.conflict(`${LABEL[kind]} ${c} đang gắn cho mặt hàng ${used.sku}: bỏ tích "Đang dùng" để ngừng`);
        await trx.deleteFrom('item_classes').where('id', '=', before.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'item_class.delete', objectType: `item_class:${kind}`, objectId: c, before });
      });
      return ok({ code: c });
    },
  });

  r.put('/api/v1/item-classes/:kind/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: {
      tags,
      summary: 'Thêm hoặc sửa nhãn / ngành / nhóm / loại hàng (?new=1: thêm mới, báo trùng mã)',
      params: z.object({ kind: z.enum(ITEM_CLASS_KINDS), code: z.string().trim().min(1).max(64) }),
      querystring: z.object({ new: queryBool }),
      body: z.object({ name: z.string().trim().min(1).max(255), parentCode: code.optional(), isActive: z.boolean().default(true), skuCode: z.string().trim().max(20).regex(/^[0-9A-Za-z]*$/, 'Mã SKU chỉ gồm chữ và số').optional() }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const { kind, code: c } = req.params;
      const b = req.body;
      if (b.parentCode === c) throw Errors.validation(`${LABEL[kind]} cha không được là chính nó`);
      // Thêm mới mà trùng mã: báo lỗi — không ghi đè (đổi tên, đổi cha) mã đang dùng.
      if (req.query.new) {
        const dup = await db.selectFrom('item_classes').select(['name', 'parent_code']).where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('code', '=', c).executeTakeFirst();
        if (dup) throw Errors.conflict(`Mã ${LABEL[kind].toLowerCase()} ${c} đã có: "${dup.name}"${dup.parent_code ? ` (thuộc ${dup.parent_code})` : ''} — chọn mã khác`);
      }
      if (b.parentCode) {
        const p = await db.selectFrom('item_classes').select('code').where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('code', '=', b.parentCode).executeTakeFirst();
        if (!p) throw Errors.validation(`${LABEL[kind]} cha ${b.parentCode} chưa có`);
      }
      const values = { name: b.name, parent_code: b.parentCode || null, is_active: b.isActive, updated_at: new Date(), ...(b.skuCode !== undefined ? { sku_code: b.skuCode } : {}) };
      await db.transaction().execute(async (trx) => {
        await trx.insertInto('item_classes').values({ tenant_id: auth.tenantId, kind, code: c, ...values }).onConflict((oc) => oc.columns(['tenant_id', 'kind', 'code']).doUpdateSet(values)).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'item_class.save', objectType: `item_class:${kind}`, objectId: c, after: b });
      });
      return ok({ code: c });
    },
  });
}
