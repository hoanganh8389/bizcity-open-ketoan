/** GET /api/v1/m/phieu-ban/docs?docType&from&to&branchCodes&status&search&page&pageSize — danh sách phiếu (mới nhất trước), meta.total. */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: action phiếu bán / trả nhập tay (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { KINDS } from '../domain/doc.js';
import { listDocs, toTradeDoc } from '../store.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'phieu-ban.doc.list', title: 'Danh sách phiếu bán / trả nhập tay', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:read', effect: 'read', idempotency: 'none',
  input: z.object({
    docType: z.enum(KINDS).default('sale'), from: day.optional().or(z.literal('').transform(() => undefined)), to: day.optional().or(z.literal('').transform(() => undefined)),
    branchCodes: z.string().trim().max(2000).optional(), status: z.enum(['draft', 'approved']).optional().or(z.literal('').transform(() => undefined)),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(50),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/docs' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const branches = (i.branchCodes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const r = await listDocs(tx, { kind: i.docType, from: i.from, to: i.to, branches, status: i.status, search: i.search, page: i.page, pageSize: i.pageSize });
    ctx.meta('total', r.total);
    ctx.meta('page', i.page);
    ctx.meta('pageSize', i.pageSize);
    return r.rows.map(toTradeDoc);
  }),
});
