// @bizcity-layer K+D kernel/intake
// [2026-10-30 10:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — phiếu kế toán nháp chờ duyệt (Q009-1 a): draftIn lưu sự việc pending không bút toán, approve ghi qua eventStore; accounting.journal.post.
/**
 * Phiếu nhập tay do trợ lý AI đề xuất (bizcity_mcp@1 §5.2, CONG-BO-KIEN-TRUC §2.1; PHASE-009 S009-2, Q009-1 phương án a):
 *   accounting.journal.post     — MCP, `ai: propose`: lập phiếu NHÁP chờ duyệt. Xem trước = bút toán dựng thử rồi huỷ (STD-MCP-4);
 *                                 xác nhận → sự việc `pending`, 0 bút toán, đã giữ số phiếu.
 *   accounting.journal.approve  — HTTP, `ai: deny`: người có quyền duyệt → ghi sổ qua eventStore. AI không tự duyệt (STD-MCP-6).
 * Tài khoản trên dòng phiếu kế toán là ĐỀ XUẤT; kế toán quyết khi duyệt (sửa được trước khi duyệt: PUT /api/v1/vouchers/:id).
 */
import { z } from 'zod';
import { VOUCHER_TYPES, voucherInputSchema } from '@ketoan/contracts';
import { defineAction, type AnyActionDef } from '../../core/actions.js';
import { activeLines, entryLine } from '../documents/document.actions.js';
import { voucherService } from './voucher.service.js';

const tags = ['Chứng từ nhập tay'];

export const voucherActions: AnyActionDef[] = [
  defineAction({
    id: 'accounting.journal.post', title: 'Đề xuất phiếu kế toán chờ kế toán duyệt', tags: ['Chứng từ (AI)'],
    description: 'Lập phiếu nhập tay NHÁP (phiếu kế toán, phiếu thu, phiếu chi, báo có, báo nợ). Phiếu chưa vào sổ: kế toán xem, sửa nếu cần rồi duyệt. '
      + 'Bản xem trước cho biết bút toán sẽ ghi khi duyệt. Tài khoản Nợ / Có trên dòng là đề xuất — kế toán quyết; dùng mã chi nhánh, đối tượng, lý do có sẵn. '
      + `Loại phiếu: ${VOUCHER_TYPES.join(', ')}. Để trống số phiếu để hệ thống tự cấp.`,
    permission: 'documents:write', effect: 'write', idempotency: 'required', sideEffects: ['documents'], dryRun: true,
    input: z.object({ voucher: voucherInputSchema.describe('Phiếu theo khuôn POST /api/v1/vouchers') }),
    output: z.object({
      id: z.string(), docKey: z.string(), docNo: z.string(),
      status: z.enum(['pending', 'preview']).describe('pending = nháp đã lưu, chờ kế toán duyệt; preview = bản xem trước (chưa lưu)'),
      entries: z.array(entryLine).describe('Bút toán sẽ ghi khi duyệt (chỉ có ở bản xem trước)'),
    }),
    expose: { mcp: true, ai: 'propose' },
    evidence: { objectType: 'source_document', objectId: (_i, o) => o.docKey },
    handler: async (ctx, { voucher }) => {
      const auth = ctx.legacyAuth;
      const r = await voucherService.draftIn(ctx.data.tx, auth, voucher, { preview: ctx.dryRun });
      const entries = r.status === 'preview' ? await activeLines(ctx.data.tx, auth.tenantId, r.docKey) : [];
      return { id: r.id, docKey: r.docKey, docNo: r.docNo, status: r.status, entries };
    },
  }),

  defineAction({
    id: 'accounting.journal.approve', title: 'Duyệt phiếu nháp và ghi sổ', tags,
    description: 'Ghi sổ phiếu nháp (trợ lý AI đề xuất) đúng nội dung đang lưu. Duyệt lại phiếu đã ghi sổ → approved = false, không ghi thêm.',
    permission: 'documents:write', effect: 'write', idempotency: 'natural', sideEffects: ['documents', 'ledger'],
    input: z.object({ id: z.string().regex(/^\d+$/).describe('id chứng từ (accounting_events.id)') }),
    output: z.object({ id: z.string(), docKey: z.string(), docNo: z.string(), version: z.number(), approved: z.boolean(), entryIds: z.array(z.string()) }),
    expose: { http: { method: 'POST', path: '/api/v1/vouchers/:id/approve' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'source_document', objectId: (_i, o) => o.docKey },
    handler: (ctx, { id }) => voucherService.approveIn(ctx.data.tx, ctx.legacyAuth, id),
  }),
];
