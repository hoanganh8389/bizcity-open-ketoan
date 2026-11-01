// @bizcity-layer K+D kernel/intake
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 10:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — phiếu kế toán nháp chờ duyệt (Q009-1 a): draftIn lưu sự việc pending không bút toán, approve ghi qua eventStore; accounting.journal.post.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/vouchers/voucher.routes.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
/**
 * Chứng từ kế toán nhập tay (phiếu thu, phiếu chi, phiếu kế toán).
 *   POST /api/v1/vouchers        lập phiếu và ghi sổ
 *   PUT  /api/v1/vouchers/:id    sửa phiếu (đảo bút toán cũ, ghi bút toán mới; phiếu nháp: sửa rồi ghi sổ)
 *   POST /api/v1/vouchers/:id/approve  duyệt phiếu nháp trợ lý AI đề xuất (accounting.journal.post) → ghi sổ
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
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { ok, idParamSchema } from '@bizcity/platform/core/http';
import { voucherService } from './voucher.service.js';
import { mountActions } from '@bizcity/platform/core/actions';
import { voucherActions } from './voucher.actions.js';

const tags = ['Chứng từ nhập tay'];

export async function voucherRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const pre = requirePermission('documents:write');
  mountActions(app, voucherActions);

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
