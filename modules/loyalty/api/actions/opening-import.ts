// [2026-11-16 10:35 AM Võ Hoàng] LOYALTY — NT-BH-020 bước 3: nạp số dư điểm cũ từ website (đóng góp)
/**
 * POST /api/v1/m/loyalty/opening — website (Cổng kế toán, khoá API, quyền catalog:write) nạp một lần số dư điểm cũ theo khách
 * (mã = SĐT): lô tích = tổng đã tích (hạn `expiresInDays` tính từ ngày chốt; 0 = không hạn) + dòng đổi = tổng đã tích − số dư, trừ vào
 * lô đó → đúng số dư và hạng. Mỗi khách một lần (ref manual `opening:<mã>`): gửi lại không ghi thêm (đặt trạng thái, không cần
 * Idempotency-Key). Dòng lỗi trả lý do, các dòng khác vẫn nạp. Tối đa 1.000 khách mỗi lần gửi.
 */
import { randomUUID } from 'node:crypto';
import { defineAction, z } from '@bizcity/module-sdk';
import { planOpening } from '../domain/opening.js';
import { entryByRef, insertEntry, lockCustomer } from '../store.js';

export default defineAction({
  id: 'loyalty.opening.import', title: 'Nạp số dư điểm cũ từ website', tags: ['Điểm thành viên'],
  permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày chốt dạng YYYY-MM-DD'),
    expiresInDays: z.number().int().min(0).max(3650).default(365),
    branchCode: z.string().trim().max(32).optional(),
    rows: z.array(z.object({ customerCode: z.string().trim().min(1).max(64), totalEarned: z.number(), balance: z.number() })).min(1).max(1000),
  }),
  output: z.object({ created: z.number(), skipped: z.number(), errors: z.array(z.object({ customerCode: z.string(), message: z.string() })) }),
  expose: { http: { method: 'POST', path: '/opening' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'loyalty.opening', objectId: (i) => i.asOf },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    // Ngày chốt theo giờ Việt Nam đầu ngày.
    const at = new Date(`${i.asOf}T00:00:00+07:00`).toISOString();
    let created = 0;
    let skipped = 0;
    const errors: { customerCode: string; message: string }[] = [];
    for (const row of i.rows) {
      const plan = planOpening(row, at, i.expiresInDays);
      if ('problem' in plan) { errors.push({ customerCode: row.customerCode, message: plan.problem }); continue; }
      await lockCustomer(tx, row.customerCode);
      if (await entryByRef(tx, 'manual', `opening:${row.customerCode}`, 'earn')) { skipped += 1; continue; }
      if (plan.earn <= 0) { skipped += 1; continue; }
      const lot = randomUUID();
      const ref = { type: 'manual' as const, id: `opening:${row.customerCode}`, code: `Số dư ${i.asOf}` };
      const meta = { opening: true, asOf: i.asOf, totalEarned: plan.earn, balance: plan.earn - plan.redeem };
      await insertEntry(tx, ctx.tenant.id, {
        id: lot, partnerCode: row.customerCode, kind: 'earn', points: plan.earn, at, expiresAt: plan.expiresAt, ref, meta,
        ...(i.branchCode ? { branchCode: i.branchCode } : {}), note: 'Số dư cũ từ website (tổng đã tích)',
      });
      if (plan.redeem > 0) {
        await insertEntry(tx, ctx.tenant.id, {
          id: randomUUID(), partnerCode: row.customerCode, kind: 'redeem', points: -plan.redeem, at, allocations: [{ lotId: lot, points: plan.redeem }], ref, meta,
          ...(i.branchCode ? { branchCode: i.branchCode } : {}), note: 'Số dư cũ từ website (phần đã dùng)',
        });
      }
      created += 1;
    }
    return { created, skipped, errors };
  }),
});
