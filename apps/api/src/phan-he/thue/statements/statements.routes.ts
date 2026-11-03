// @bizcity-layer D modules/thue
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — /long-term-balances/rules lấy bảng qua callAction theo quyền người gọi
/**
 * Báo cáo tài chính bổ sung và thuế.
 *   GET  /api/v1/long-term-balances?asOf=     phần dài hạn đã khai tại một ngày (kèm số dư thực tế)
 *   PUT  /api/v1/long-term-balances                  lưu (thay toàn bộ dòng của ngày đó)
 *   GET  /api/v1/long-term-balances/rules            nhóm tài khoản có phần dài hạn và cặp chỉ tiêu B01
 *   GET  /api/v1/vat-returns                         các tờ khai thuế GTGT đã lưu
 *   GET  /api/v1/vat-returns/build                   lập tờ khai một kỳ (số liệu từ sổ hoá đơn + phần đã lưu)
 *   PUT  /api/v1/vat-returns                         lưu tờ khai (nháp / chính thức)
 *   PUT  /api/v1/vat-returns/supplement              lập tờ khai bổ sung (01/KHBS, tiền chậm nộp)
 *   GET  /api/v1/cit-returns/build?year=             lập tờ khai quyết toán thuế TNDN (03/TNDN)
 *   PUT  /api/v1/cit-returns                         lưu tờ khai quyết toán TNDN
 *   GET  /api/v1/taxpayer, PUT /api/v1/taxpayer      thông tin người nộp thuế in trên tờ khai
 *   GET  /api/v1/reports/notes                       thuyết minh báo cáo tài chính (B09-DN) — phần số liệu
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../../core/auth.js';
import { ok } from '../../../core/http.js';
import { longTermService } from './long-term.service.js';
import { notesService } from './notes.service.js';
import { MANUAL_KEYS, vatReturnService } from './vat-return.service.js';
import { CIT_MANUAL_KEYS, TAXPAYER_FIELDS, citReturnService, taxpayerService } from './cit-return.service.js';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const branchCodes = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));
const periodQuery = {
  periodKind: z.enum(['month', 'quarter']).default('month'),
  year: z.coerce.number().int().min(2000).max(2100),
  period: z.coerce.number().int().min(1).max(12),
};

export async function statementRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/long-term-balances/rules', {
    preHandler: requirePermission('reports:read'),
    schema: { tags: ['Báo cáo tài chính'], summary: 'Nhóm tài khoản có phần dài hạn và cặp chỉ tiêu B01 tương ứng' },
    handler: async (req) => ok(await longTermService.rules(authOf(req))),
  });
  r.get('/api/v1/long-term-balances', {
    preHandler: requirePermission('reports:read'),
    schema: { tags: ['Báo cáo tài chính'], summary: 'Phần dài hạn đã khai tại một ngày', querystring: z.object({ asOf: date }) },
    handler: async (req) => ok(await longTermService.list(authOf(req), req.query)),
  });

  r.get('/api/v1/vat-returns', {
    preHandler: requirePermission('reports:read'),
    schema: { tags: ['Thuế'], summary: 'Các tờ khai thuế GTGT đã lưu' },
    handler: async (req) => ok(await vatReturnService.list(authOf(req))),
  });
  r.get('/api/v1/vat-returns/build', {
    preHandler: requirePermission('reports:read'),
    schema: { tags: ['Thuế'], summary: 'Lập tờ khai thuế GTGT (mẫu 01/GTGT) cho một kỳ', querystring: z.object({ ...periodQuery, branchCodes }) },
    handler: async (req) => ok({ form: vatReturnService.form(), ...(await vatReturnService.build(authOf(req), req.query)) }),
  });

  r.get('/api/v1/cit-returns/build', {
    preHandler: requirePermission('reports:read'),
    schema: { tags: ['Thuế'], summary: 'Lập tờ khai quyết toán thuế TNDN (mẫu 03/TNDN) cho một năm', querystring: z.object({ year: z.coerce.number().int().min(2000).max(2100) }) },
    handler: async (req) => ok({ form: citReturnService.form(), ...(await citReturnService.build(authOf(req), req.query)) }),
  });

  r.get('/api/v1/taxpayer', {
    preHandler: requirePermission('reports:read'),
    schema: { tags: ['Thuế'], summary: 'Thông tin người nộp thuế' },
    handler: async (req) => ok(await taxpayerService.get(authOf(req))),
  });

  r.get('/api/v1/reports/notes', {
    preHandler: requirePermission('reports:read'),
    schema: { tags: ['Báo cáo tài chính'], summary: 'Thuyết minh báo cáo tài chính (B09-DN) — phần số liệu', querystring: z.object({ from: date, to: date }) },
    handler: async (req) => ok(await notesService.build(authOf(req), req.query)),
  });
  mountActions(app, statementsWriteActions);
  mountActions(app, statementsMoreWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const statementsWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'thue.long-term-balance.update', title: 'Lưu phần dài hạn của một ngày (thay toàn bộ)', tags: ['Báo cáo tài chính'],
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ asOf: date, lines: z.array(z.object({ accountCode: z.string().trim().min(1), partnerCode: z.string().trim().nullish(), amount: z.coerce.number(), note: z.string().optional() })) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/long-term-balances' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'long_term_balance' },
    handler: (ctx, input) => longTermService.saveIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'thue.taxpayer.update', title: 'Lưu thông tin người nộp thuế', tags: ['Thuế'],
    permission: 'catalog:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object(Object.fromEntries(TAXPAYER_FIELDS.map((k) => [k, z.string().max(500).optional()]))), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/taxpayer' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'taxpayer' },
    handler: (ctx, input) => taxpayerService.saveIn(ctx.data.tx, ctx.legacyAuth, input as Record<string, string>),
  }),
];

// [2026-11-03 08:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 5 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.


export const statementsMoreWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'thue.vat-return.save', title: 'Lưu tờ khai thuế GTGT (nháp hoặc chính thức)', tags: ['Thuế'],
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({
        ...periodQuery,
        branchCodes: z.array(z.string()).optional(),
        status: z.enum(['draft', 'final']).default('draft'),
        manual: z.object(Object.fromEntries(MANUAL_KEYS.map((k) => [k, z.coerce.number().nullish()]))).partial(),
      }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/vat-returns' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'vat_return' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const manual = Object.fromEntries(Object.entries(input.manual).filter(([, v]) => v !== null && v !== undefined)) as Record<string, number>;
      return await vatReturnService.saveIn(trx, ctx.legacyAuth, { ...input, manual });
    },
  }),
  defineAction({
    id: 'thue.vat-return.supplement', title: 'Lập tờ khai bổ sung (kèm giải trình 01/KHBS, tiền chậm nộp); dryRun = chỉ tính', tags: ['Thuế'],
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({
        ...periodQuery,
        branchCodes: z.array(z.string()).optional(),
        manual: z.object(Object.fromEntries(MANUAL_KEYS.map((k) => [k, z.coerce.number().nullish()]))).partial(),
        payDate: date.describe('Ngày dự kiến nộp tiền thuế tăng thêm (tính tiền chậm nộp)'),
        dryRun: z.boolean().default(false),
      }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/vat-returns/supplement' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'vat_return' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const manual = Object.fromEntries(Object.entries(input.manual).filter(([, v]) => v !== null && v !== undefined)) as Record<string, number>;
      return await vatReturnService.supplementIn(trx, ctx.legacyAuth, { ...input, manual });
    },
  }),
  defineAction({
    id: 'thue.cit-return.save', title: 'Lưu tờ khai quyết toán thuế TNDN (nháp hoặc chính thức)', tags: ['Thuế'],
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({
        year: z.number().int().min(2000).max(2100),
        status: z.enum(['draft', 'final']).default('draft'),
        manual: z.object(Object.fromEntries(CIT_MANUAL_KEYS.map((k) => [k, z.coerce.number().nullish()]))).partial(),
      }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/cit-returns' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'cit_return' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const manual = Object.fromEntries(Object.entries(input.manual).filter(([, v]) => v !== null && v !== undefined)) as Record<string, number>;
      return await citReturnService.saveIn(trx, ctx.legacyAuth, { ...input, manual });
    },
  }),
];
