/**
 * Chứng từ kế toán nhập tay (phiếu thu, phiếu chi, phiếu kế toán).
 *   POST /api/v1/vouchers        lập phiếu và ghi sổ
 *   PUT  /api/v1/vouchers/:id    sửa phiếu (đảo bút toán cũ, ghi bút toán mới)
 *
 * Xem danh sách, chi tiết, huỷ phiếu dùng chung đường dẫn chứng từ:
 *   GET  /api/v1/documents?docType=receipt|payment|manual
 *   GET  /api/v1/documents/:id
 *   POST /api/v1/documents/cancel
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { openingInputSchema, voucherInputSchema } from '@ketoan/contracts';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok, idParamSchema } from '../../core/http.js';
import { voucherService } from './voucher.service.js';

const tags = ['Chứng từ nhập tay'];

export async function voucherRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const pre = requirePermission('documents:write');

  r.post('/api/v1/vouchers', {
    preHandler: pre,
    schema: { tags, summary: 'Lập phiếu thu / phiếu chi / phiếu kế toán', body: voucherInputSchema },
    handler: async (req, reply) => reply.status(201).send(ok(await voucherService.create(authOf(req), req.body))),
  });

  r.put('/api/v1/vouchers/:id', {
    preHandler: pre,
    schema: { tags, summary: 'Sửa phiếu nhập tay', params: idParamSchema, body: voucherInputSchema },
    handler: async (req) => ok(await voucherService.update(authOf(req), req.params.id, req.body)),
  });

  // Số dư tài khoản đầu kỳ: danh sách và huỷ dùng chung /api/v1/documents (docType=opening).
  r.post('/api/v1/opening-balances', {
    preHandler: pre,
    schema: { tags, summary: 'Nhập số dư tài khoản đầu kỳ', body: openingInputSchema },
    handler: async (req, reply) => reply.status(201).send(ok(await voucherService.createOpening(authOf(req), req.body))),
  });

  r.put('/api/v1/opening-balances/:id', {
    preHandler: pre,
    schema: { tags, summary: 'Sửa số dư tài khoản đầu kỳ', params: idParamSchema, body: openingInputSchema },
    handler: async (req) => ok(await voucherService.updateOpening(authOf(req), req.params.id, req.body)),
  });
}
