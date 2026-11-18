/**
 * GET /api/v1/m/pos/reports/missing-codes?date&branch — "Số bill bị thiếu" của cửa hàng × ngày (phiếu NT-BH-027 Q2): số máy đã xin trước
 * (POST /sequences/reserve, ngày bán = date) mà không đơn / phiếu hoàn nào dùng, kèm lý do (máy … xin chưa dùng / dải hết hạn). Đơn huỷ giữ
 * số nên không thành số thiếu. Số máy chủ cấp lúc nhận đơn (không xin trước) cùng giao dịch với đơn nên không hở.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027: báo cáo số bill bị thiếu theo cửa hàng × ngày (đóng góp)
import { defineAction, sql, z } from '@bizcity/module-sdk';
import { missingCodes, missingRanges, type Reservation } from '../domain/codes.js';
import { resolveBranch, todayVn } from '../read.js';

const itemSchema = z.object({ code: z.string(), kind: z.enum(['sale', 'return']), reasonCode: z.string(), reason: z.string(), deviceId: z.string().nullable(), reservedAt: z.string(), expiresAt: z.string() });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

export default defineAction({
  id: 'pos.report.missing-codes', title: 'Số bill bị thiếu của cửa hàng theo ngày', tags: ['Quản trị bán lẻ'],
  permission: 'pos:report', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ date: day.optional(), branch: z.string().trim().max(32).optional() }),
  output: z.object({
    branch: z.string(), date: z.string(), total: z.number(),
    items: z.array(itemSchema),
    ranges: z.array(z.object({ kind: z.enum(['sale', 'return']), from: z.string(), to: z.string(), count: z.number(), reason: z.string() })),
  }),
  expose: { http: { method: 'GET', path: '/reports/missing-codes' }, mcp: false, ai: 'read' },
  handler: async (ctx, input) => ctx.data.module(async (tx) => {
    const branch = (await resolveBranch(tx, input.branch || undefined)).code;
    const date = input.date ?? todayVn();
    const rows = (await sql<{ kind: 'sale' | 'return'; codes: string[]; device_id: string | null; reserved_by: string; reserved_by_name: string | null; reserved_at: Date; expires_at: Date }>`
      SELECT kind, codes, device_id, reserved_by, reserved_by_name, reserved_at, expires_at FROM mod_pos.code_reservations
       WHERE branch_code = ${branch} AND business_date = ${date} ORDER BY reserved_at, id`.execute(tx)).rows;
    const items: z.infer<typeof itemSchema>[] = [];
    const ranges: { kind: 'sale' | 'return'; from: string; to: string; count: number; reason: string }[] = [];
    for (const kind of ['sale', 'return'] as const) {
      const rs: Reservation[] = rows.filter((r) => r.kind === kind).map((r) => ({
        codes: r.codes, deviceId: r.device_id, reservedBy: r.reserved_by, reservedByName: r.reserved_by_name,
        reservedAt: new Date(r.reserved_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString(),
      }));
      const all = [...new Set(rs.flatMap((r) => r.codes))];
      if (!all.length) continue;
      // Mã đã dùng ở cửa hàng (mọi ngày — đơn mất mạng gửi bù hôm sau vẫn tính là đã dùng; đơn huỷ giữ số).
      const used = new Set((kind === 'sale'
        ? await sql<{ code: string }>`SELECT code FROM mod_pos.orders WHERE branch_code = ${branch} AND code IN (${sql.join(all)})`.execute(tx)
        : await sql<{ code: string }>`SELECT code FROM mod_pos.returns WHERE branch_code = ${branch} AND code IN (${sql.join(all)})`.execute(tx)).rows.map((r) => r.code));
      const miss = missingCodes(rs, used, new Date());
      items.push(...miss.map((m) => ({ ...m, kind })));
      ranges.push(...missingRanges(miss).map((r) => ({ ...r, kind })));
    }
    return { branch, date, total: items.length, items, ranges };
  }),
});
