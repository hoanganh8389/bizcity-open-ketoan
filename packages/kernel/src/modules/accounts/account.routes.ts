// @bizcity-layer K kernel/accounts
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/accounts/account.routes.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-14 / 15: POST /api/v1/accounts/validate; lưu trả meta.findings
/**
 * Danh mục tài khoản.
 *   GET   /api/v1/accounts          danh sách (lọc search, postingOnly)
 *   GET   /api/v1/accounts/:code    chi tiết
 *   POST  /api/v1/accounts          thêm
 *   PATCH /api/v1/accounts/:code    sửa (không đổi số tài khoản)
 *   DELETE /api/v1/accounts/:code   xoá (chưa có tài khoản con, chưa có phát sinh, chưa dùng ở danh mục khác)
 *   POST  /api/v1/accounts/validate khung Vì sao: nhắc / hướng dẫn / cảnh báo mềm / chặn cho một bản khai báo (chỉ đọc)
 * Thêm / sửa trả `meta.findings` (bizcity_catalog_hint@1); body nhận `warnAck: { reason, codes }` để ghi nhận cảnh báo mềm (D023-6).
 * Ghi: action core.account.{create,update,delete} (W6, SC-ACT-1).
 *   POST  /api/v1/accounts/validate khung Vì sao: nhắc / hướng dẫn / cảnh báo mềm / chặn cho một bản khai báo (chỉ đọc)
 * Thêm / sửa nhận `warnAck: { reason, codes }` để ghi nhận cảnh báo mềm (D023-6: catalog.warn.ack / catalog.warn.unacked). Phát hiện xem trước
 * ở /validate; phản hồi của action ghi không mang `findings` (runtime action chưa có meta tuỳ biến).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { ok } from '@bizcity/platform/core/http';
import { accountCreateSchema, accountListQuerySchema, accountUpdateSchema, accountValidateSchema, type AccountDto } from './account.schemas.js';
import { accountService } from './account.service.js';
import { toAccountDto } from './account.repository.js';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';
import { recordWarnAck } from '@bizcity/platform/core/catalog-warn';
import { accountHints } from './account.hints.js';

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
  // [2026-11-03 06:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 gộp main: "Khung Vì sao" kiểm thử khai báo tài khoản = action đọc (không ghi gì)
  defineAction({
    id: 'core.account.validate', title: 'Khung Vì sao: kiểm thử một bản khai báo tài khoản (chỉ đọc)', tags,
    permission: 'catalog:read', effect: 'read', idempotency: 'none',
    input: accountValidateSchema, output: z.object({ findings: z.array(z.unknown()) }),
    expose: { http: { method: 'POST', path: '/api/v1/accounts/validate' }, mcp: false, ai: 'read' },
    handler: async (ctx, { mode, ...draft }) => ({ findings: await accountService.validate(ctx.legacyAuth, draft, mode) }),
  }),
  defineAction({
    id: 'core.account.create', title: 'Thêm tài khoản', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: accountCreateSchema, output: accountDto,
    expose: { http: { method: 'POST', path: '/api/v1/accounts', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'account', objectId: (i) => i.code },
    // [2026-11-03 10:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-14 / 15 (gộp main W6): khung Vì sao — chặn (ACC-BLOCK-*) đã có lỗi riêng ở createIn; chỉ nhắc / hướng dẫn / cảnh báo mềm được ghi nhận
    handler: async (ctx, { warnAck, ...input }) => {
      const findings = (await accountHints(ctx.data.tx, ctx.tenant.id, input, 'create')).filter((f) => f.level !== 'block');
      const dto = await accountService.createIn(ctx.data.tx, ctx.tenant.id, input);
      await recordWarnAck(ctx.data.tx, ctx.legacyAuth, 'account', input.code, findings, warnAck);
      return dto;
    },
  }),
  defineAction({
    id: 'core.account.update', title: 'Sửa tài khoản', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: accountUpdateSchema.extend({ code: z.string() }), output: accountDto,
    expose: { http: { method: 'PATCH', path: '/api/v1/accounts/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'account', objectId: (i) => i.code },
    handler: async (ctx, { code, warnAck, ...input }) => {
      const r = await accountService.updateIn(ctx.data.tx, ctx.tenant.id, code, input);
      if (r.changed) {
        const findings = await accountHints(ctx.data.tx, ctx.tenant.id, { code, normalSide: input.normalSide, trackPartner: input.trackPartner, isDebt: input.isDebt, isActive: input.isActive }, 'update');
        await recordWarnAck(ctx.data.tx, ctx.legacyAuth, 'account', code, findings, warnAck);
      }
      return toAccountDto(r.after);
    },
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
