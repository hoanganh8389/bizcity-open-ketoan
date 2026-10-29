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

const tags = ['Kết nối hệ thống khác'];
const codeParam = z.object({ code: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,31}$/) });

export async function connectionRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/connections', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Danh sách kết nối hệ thống khác' },
    handler: async (req) => ok(await connectionService.list(authOf(req))),
  });

  r.put('/api/v1/connections', {
    preHandler: requirePermission('settings:write'),
    schema: { tags, summary: 'Ghi cấu hình kết nối', body: connectionsInputSchema },
    handler: async (req) => ok(await connectionService.save(authOf(req), req.body.connections)),
  });

  r.post('/api/v1/connections/:code/test', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Thử kết nối', params: codeParam },
    handler: async (req) => ok(await connectionService.test(authOf(req), req.params.code)),
  });

  r.post('/api/v1/connections/:code/pull', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Kéo chứng từ của kết nối trong khoảng ngày về trạm ACC14 (chờ định khoản)', params: codeParam, body: pullInputSchema },
    handler: async (req) => ok(await connectionService.pull(authOf(req), req.params.code, req.body)),
  });
}
