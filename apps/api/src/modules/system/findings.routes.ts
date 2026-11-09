// @bizcity-layer P diagnostics
// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032 D-LIB-5): cổng L — mã LIB-* và mã luật riêng của thư viện (libraryRuleFindings) cùng tra ở đây
// [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-27 / 31 (ADR-0019, R-GATE-5): tra mã của hai cổng kiểm chuẩn — người, dev và AI đọc đúng một nguồn, không đoán
/**
 * Thư viện phát hiện (bizcity_findings@1):
 *   GET /api/v1/findings?gate=A|B|L&level=&q= core.findings.list — mọi mã của Gate A (danh mục), Gate B (trạm tiền kiểm), cổng L (thư viện)
 *   GET /api/v1/findings/:code                core.findings.explain — một mã: vì sao, cách sửa, luật gốc, trang học
 * Cả hai mở cho MCP (`ai: 'read'`): trợ lý AI của dev gọi `core.findings.explain("IN-ITEM-001")` khi gặp mã trong phản hồi.
 * Nội dung không phụ thuộc đơn vị (danh mục tĩnh của bản dựng).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FINDINGS_LIBRARY, explainFinding } from '@ketoan/contracts';
import { Errors } from '../../core/errors.js';
import { defineAction, mountActions } from '../../core/actions.js';
import { libraryRuleFindings } from '@bizcity/platform/core/libraries/index';

const entry = z.object({
  code: z.string(), gate: z.enum(['A', 'B', 'L']), level: z.enum(['block', 'warn', 'info']), step: z.string(),
  title: z.string(), why: z.string(), fix: z.string(), rule: z.string(), learn: z.string().nullable(),
  status: z.enum(['draft', 'approved']), source: z.string(),
});
const tags = ['Thư viện mã'];

const listFindings = defineAction({
  id: 'core.findings.list', title: 'Danh sách mã phát hiện của hai cổng kiểm chuẩn', tags,
  description: 'Mọi mã của Gate A (khai báo danh mục: ACC-*, PART-*) và Gate B (trạm tiền kiểm trước khi ghi sổ: IN-*), cùng một khuôn: mức, bước, vì sao, cách sửa, luật gốc. '
    + 'Cổng L: mã chung LIB-* của thư viện dùng chung và mã luật riêng của từng thư viện. Lọc theo cổng, mức, hoặc chữ trong mã / tiêu đề.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({ gate: z.enum(['A', 'B', 'L']).optional(), level: z.enum(['block', 'warn', 'info']).optional(), q: z.string().trim().max(64).optional() }),
  output: z.object({ items: z.array(entry), total: z.number() }),
  expose: { http: { method: 'GET', path: '/api/v1/findings' }, mcp: true, ai: 'read' },
  handler: async (_ctx, input) => {
    const q = input.q?.toLowerCase();
    const items = [...FINDINGS_LIBRARY, ...libraryRuleFindings()].filter((f) => (!input.gate || f.gate === input.gate) && (!input.level || f.level === input.level)
      && (!q || f.code.toLowerCase().includes(q) || f.title.toLowerCase().includes(q)));
    return { items: [...items], total: items.length };
  },
});

const explain = defineAction({
  id: 'core.findings.explain', title: 'Giải thích một mã phát hiện', tags,
  description: 'Khi phản hồi của cửa nạp / danh mục có mã (vd IN-MD-001, ACC-HINT-003): trả vì sao kế toán cần, cách sửa, luật gốc, trang học. '
    + 'Dùng thay cho đoán nghĩa mã.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({ code: z.string().trim().min(3).max(32) }),
  output: entry,
  expose: { http: { method: 'GET', path: '/api/v1/findings/:code' }, mcp: true, ai: 'read' },
  handler: async (_ctx, input) => {
    const f = explainFinding(input.code) ?? libraryRuleFindings().find((x) => x.code === input.code.trim().toUpperCase());
    if (!f) throw Errors.notFound(`mã phát hiện ${input.code} (xem GET /api/v1/findings)`);
    return f;
  },
});

export const FINDINGS_ACTIONS = [listFindings, explain];

export async function findingsRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, FINDINGS_ACTIONS);
}
