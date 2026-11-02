// @bizcity-layer K kernel/review
// [2026-11-02 10:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4: action Bàn đánh giá — core.review.board (checklist theo vai), core.review.recheck (kiểm lại một mã); quyền review:read, chỉ đọc.
/**
 * Bàn đánh giá (HT08, PHASE-022):
 *   GET /api/v1/system/review-board?persona=chief_accountant|auditor|tax_inspector   core.review.board
 *   GET /api/v1/system/review-board/recheck?code=X                                    core.review.recheck — chạy lại đúng một mã (READ ONLY)
 * Không có action nào ghi sổ, tắt kiểm hay bỏ qua (R-FIX-2, T022-10).
 */
import { z } from 'zod';
import { defineAction, type AnyActionDef } from '@bizcity/platform/core/actions';
import { Errors } from '@bizcity/platform/core/errors';
import { PERSONAS, recheck, reviewBoard, type Persona } from './review.service.js';

const tags = ['Bàn đánh giá'];
const screen = z.object({ code: z.string(), path: z.string(), label: z.string() });
const remedy = z.object({
  steps: z.array(z.object({ text: z.string(), screen: screen.optional(), role: z.string().optional() })), owner: z.string(),
  verify: z.object({ code: z.string().optional(), screen: screen.optional() }), stopTheLine: z.boolean().optional(), forbid: z.array(z.string()).optional(),
});
const status = z.enum(['ok', 'warn', 'error', 'block_ok', 'untested', 'elsewhere']);
const persona = z.enum(Object.keys(PERSONAS) as [Persona, ...Persona[]]);

export const reviewActions: AnyActionDef[] = [
  defineAction({
    id: 'core.review.board', title: 'Bàn đánh giá theo vai', tags,
    description: 'Checklist giả định lỗi (danh mục F22) theo vai: kế toán trưởng, kiểm soát / ban kiểm soát, thanh tra thuế (tự rà trước — không phải kết luận của cơ quan thuế). '
      + 'Mỗi ca: trạng thái từ tự chẩn đoán của đơn vị (chỉ đọc), mẫu (không số tiền), phương án khắc phục từng bước, mã kiểm lại. Kèm các lần xác nhận cảnh báo gần đây.',
    permission: 'review:read', effect: 'read', idempotency: 'none',
    input: z.object({ persona: persona.optional() }),
    output: z.object({
      persona, label: z.string(), intro: z.string(), onlyTodo: z.boolean(), generatedAt: z.string(), counts: z.record(z.number()),
      groups: z.array(z.object({ key: z.string(), label: z.string(), cases: z.array(z.object({
        id: z.string(), title: z.string(), level: z.string(), status, primary: z.boolean(), detectors: z.array(z.string()), count: z.number(), sample: z.array(z.string()),
        consequence: z.string(), remedy: remedy.nullable(), remedyText: z.string(), verifyCode: z.string().nullable(), note: z.string().nullable(),
      })) })),
      acknowledgements: z.array(z.object({ at: z.string(), actor: z.string(), context: z.string(), codes: z.array(z.string()), note: z.string().nullable() })),
      disclaimer: z.string(),
    }),
    expose: { http: { method: 'GET', path: '/api/v1/system/review-board' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => reviewBoard(ctx.data.tx, ctx.tenant.id, input.persona ?? 'chief_accountant'),
  }),
  defineAction({
    id: 'core.review.recheck', title: 'Kiểm lại một mã', tags,
    description: 'Chạy lại đúng một mã tự chẩn đoán cho đơn vị (giao dịch READ ONLY), trả kết quả mới: mức, số sai, mẫu, phương án. Không chạy cả bộ, không ghi gì.',
    permission: 'review:read', effect: 'read', idempotency: 'none',
    input: z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]+$/, 'Mã kiểm dạng CHỮ_HOA') }),
    output: z.object({ code: z.string(), level: z.string(), title: z.string(), fix: z.string(), remedy: remedy.optional(), examined: z.number(), count: z.number(), sample: z.array(z.string()) }),
    expose: { http: { method: 'GET', path: '/api/v1/system/review-board/recheck' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => {
      const r = await recheck(ctx.tenant.id, input.code);
      if (!r) throw Errors.notFound(`mã kiểm ${input.code}`);
      return r;
    },
  }),
];
