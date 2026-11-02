// @bizcity-layer K kernel/accounts
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/accounts/account.routes.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
/**
 * Danh mục tài khoản.
 *   GET   /api/v1/accounts          danh sách (lọc search, postingOnly)
 *   GET   /api/v1/accounts/:code    chi tiết
 *   POST  /api/v1/accounts          thêm
 *   PATCH /api/v1/accounts/:code    sửa (không đổi số tài khoản)
 *   DELETE /api/v1/accounts/:code   xoá (chưa có tài khoản con, chưa có phát sinh, chưa dùng ở danh mục khác)
 * Ghi: action core.account.{create,update,delete} (W6, SC-ACT-1).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { ok } from '@bizcity/platform/core/http';
import { accountCreateSchema, accountListQuerySchema, accountUpdateSchema, type AccountDto } from './account.schemas.js';
import { accountService } from './account.service.js';
import { toAccountDto } from './account.repository.js';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';

const tags = ['Danh mục: Tài khoản'];
const codeParam = z.object({ code: z.string() });

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/accounts', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Danh sách tài khoản', querystring: accountListQuerySchema },
    handler: async (req) => ok(await accountService.list(authOf(req), req.query)),
  });

  r.get('/api/v1/accounts/:code', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Chi tiết tài khoản', params: codeParam },
    handler: async (req) => ok(await accountService.get(authOf(req), req.params.code)),
  });

  mountActions(app, accountActions);
}

// [2026-11-03 01:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 (SC-ACT-1): ghi tài khoản qua defineAction (service *In trong giao dịch của runtime, bằng chứng do runtime); đường dẫn / mã 201 như cũ
const accountDto = z.custom<AccountDto>((v) => typeof v === 'object' && v !== null && typeof (v as { code?: unknown }).code === 'string');

export const accountActions: AnyActionDef[] = [
  defineAction({
    id: 'core.account.create', title: 'Thêm tài khoản', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: accountCreateSchema, output: accountDto,
    expose: { http: { method: 'POST', path: '/api/v1/accounts', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'account', objectId: (i) => i.code },
    handler: async (ctx, input) => accountService.createIn(ctx.data.tx, ctx.tenant.id, input),
  }),
  defineAction({
    id: 'core.account.update', title: 'Sửa tài khoản', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: accountUpdateSchema.extend({ code: z.string() }), output: accountDto,
    expose: { http: { method: 'PATCH', path: '/api/v1/accounts/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'account', objectId: (i) => i.code },
    handler: async (ctx, { code, ...input }) => toAccountDto((await accountService.updateIn(ctx.data.tx, ctx.tenant.id, code, input)).after),
  }),
  defineAction({
    id: 'core.account.delete', title: 'Xoá tài khoản', tags,
    description: 'Chỉ xoá được tài khoản chưa có tài khoản con, chưa có phát sinh; không thì ngừng sử dụng.',
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: codeParam, output: z.object({ code: z.string() }),
    expose: { http: { method: 'DELETE', path: '/api/v1/accounts/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'account', objectId: (i) => i.code },
    handler: async (ctx, { code }) => { await accountService.removeIn(ctx.data.tx, ctx.tenant.id, code); return { code }; },
  }),
];
