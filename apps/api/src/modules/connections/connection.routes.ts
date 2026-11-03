// @bizcity-layer A adapters/wordpress
/**
 * Kết nối hệ thống khác (trạm ACC14):
 *   GET  /api/v1/connections                 danh sách kết nối (khoá bí mật dạng che) + lần kéo gần nhất
 *   PUT  /api/v1/connections                 ghi cả danh sách kết nối
 *   POST /api/v1/connections/:code/test      thử kết nối (đọc trang đầu của hôm nay, không lưu)
 *   POST /api/v1/connections/:code/pull      kéo chứng từ trong khoảng ngày về, chờ định khoản
 * Đầu chuẩn hệ thống nguồn phải dựng: docs/cong-ket-noi.md.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { connectionsInputSchema, pullInputSchema } from '@ketoan/contracts';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { connectionService } from './connection.service.js';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';

const tags = ['Kết nối hệ thống khác'];
const codeParam = z.object({ code: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,31}$/) });

export async function connectionRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/connections', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Danh sách kết nối hệ thống khác' },
    handler: async (req) => ok(await connectionService.list(authOf(req))),
  });


  // @bizcity-route: báo "đã nhận" cho hệ thống nguồn sau mỗi trang — gom một giao dịch thì lô huỷ mà nguồn tưởng đã giao (mất chứng từ)
  r.post('/api/v1/connections/:code/pull', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Kéo chứng từ của kết nối trong khoảng ngày về trạm ACC14 (chờ định khoản)', params: codeParam, body: pullInputSchema },
    handler: async (req) => ok(await connectionService.pull(authOf(req), req.params.code, req.body)),
  });
  mountActions(app, connectionWriteActions);
}

// [2026-11-03 08:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 5 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const connectionWriteActions: AnyActionDef[] = [
  // [2026-11-03 12:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 7: thử kết nối = action đọc (gọi ra hệ thống nguồn, không lưu gì)
  defineAction({
    id: 'core.connection.test', title: 'Thử kết nối', tags,
    permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: codeParam, output: z.object({ ok: z.boolean(), message: z.string(), sample: z.number() }),
    expose: { http: { method: 'POST', path: '/api/v1/connections/:code/test' }, mcp: false, ai: 'read' },
    handler: (ctx, input) => connectionService.test(ctx.legacyAuth, input.code),
  }),
  defineAction({
    id: 'core.connection.save', title: 'Ghi cấu hình kết nối', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    // Schema có superRefine (ZodEffects): khuôn ngoài làm input, kiểm chéo chạy lại trong handler (ZodError → VALIDATION_ERROR như cũ)
    input: connectionsInputSchema.innerType(), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/connections' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'connection' },
    handler: (ctx, input) => connectionService.saveIn(ctx.data.tx, ctx.legacyAuth, connectionsInputSchema.parse(input).connections),
  }),
];
