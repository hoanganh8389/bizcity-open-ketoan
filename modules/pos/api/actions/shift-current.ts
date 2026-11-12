/**
 * GET /api/v1/m/pos/shifts/current?branch= — ca đang mở của chi nhánh + số liệu tới lúc này (màn Chốt ca, phiếu NT-BH-007).
 * Không có ca mở → data null (không 404: đường GET không tham số phải trả 200 — hợp đồng module C-4).
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { resolveBranch } from '../read.js';
import { currentShift } from '../shifts.js';

export default defineAction({
  id: 'pos.shift.current', title: 'Ca bán đang mở của chi nhánh', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ branch: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()).nullable(),
  expose: { http: { method: 'GET', path: '/shifts/current' }, mcp: false, ai: 'read' },
  handler: async (ctx, { branch }) => ctx.data.module(async (tx) => currentShift(tx, (await resolveBranch(tx, branch || undefined)).code)),
});
