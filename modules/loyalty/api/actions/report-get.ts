// [2026-11-16 10:40 AM Võ Hoàng] LOYALTY — NT-BH-020 bước 3: báo cáo điểm thành viên (đóng góp)
/**
 * GET /api/v1/m/loyalty/report?from=&to= — báo cáo kỳ (ngày theo giờ Việt Nam, mặc định từ đầu tháng tới hôm nay): phát sinh theo
 * cửa hàng × loại (tích, đổi, hết hạn, hoàn, điều chỉnh), số dư cuối kỳ theo hạng, danh sách khách (500 khách số dư lớn nhất).
 */
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { summarize } from '../domain/opening.js';
import { entriesBefore, latestAnyProgram } from '../store.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const vnDay = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const vnStart = (d: string) => new Date(`${d}T00:00:00+07:00`).toISOString();

export default defineAction({
  id: 'loyalty.report.get', title: 'Báo cáo điểm thành viên', tags: ['Điểm thành viên'],
  permission: 'loyalty:read', effect: 'read', idempotency: 'none', errors: ['VALIDATION_ERROR'],
  input: z.object({ from: day.optional(), to: day.optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/report' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const today = vnDay(new Date());
    const from = i.from ?? `${today.slice(0, 7)}-01`;
    const to = i.to ?? today;
    if (from > to) throw Errors.validation('Từ ngày phải trước đến ngày', { field: 'from' });
    // Kỳ [from 00:00, to + 1 ngày 00:00) giờ Việt Nam.
    const end = new Date(Date.parse(vnStart(to)) + 86_400_000).toISOString();
    const program = await latestAnyProgram(tx);
    const r = summarize(await entriesBefore(tx, end), program?.program.tiers ?? [], vnStart(from), end);
    return { ...r, from, to, customers: r.customers.slice(0, 500), customerCount: r.customers.length };
  }),
});
