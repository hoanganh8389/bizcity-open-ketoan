/**
 * GET /api/v1/m/pos/stock/all?branch= — tồn cả cửa hàng (mọi mã có tồn khác 0, ĐVT nhỏ nhất) cho nút "Xuất tồn kho cuối ca" ở màn
 * Chốt ca (NT-BH-011, như "Chốt ca cuối ngày" của POS cũ). Đọc khung nhìn stock_on_hand của chính chi nhánh, lúc bấm.
 */
import { defineAction, sql, z } from '@bizcity/module-sdk';
import { resolveBranch } from '../read.js';

export default defineAction({
  id: 'pos.stock.all', title: 'Tồn cả cửa hàng cho máy POS (xuất cuối ca)', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ branch: z.string().trim().max(32).optional() }),
  output: z.object({ branch: z.object({ code: z.string(), name: z.string() }), rows: z.array(z.object({ sku: z.string(), name: z.string(), unit: z.string(), qty: z.number() })) }),
  expose: { http: { method: 'GET', path: '/stock/all' }, mcp: false, ai: 'read' },
  handler: async (ctx, { branch }) => ctx.data.module(async (tx) => {
    const b = await resolveBranch(tx, branch || undefined);
    const rows = (await sql<{ sku: string; name: string | null; unit: string | null; qty: string }>`
      SELECT s.sku, max(p.name) AS name, max(p.unit) AS unit, sum(s.qty) AS qty
        FROM bizcity_read.stock_on_hand s LEFT JOIN bizcity_read.products p ON p.sku = s.sku
       WHERE s.branch_code = ${b.code} GROUP BY s.sku HAVING sum(s.qty) <> 0 ORDER BY s.sku`.execute(tx)).rows;
    return { branch: { code: b.code, name: b.name }, rows: rows.map((r) => ({ sku: r.sku, name: r.name ?? '', unit: r.unit ?? '', qty: Number(r.qty) })) };
  }),
});
