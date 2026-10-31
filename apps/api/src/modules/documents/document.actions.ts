// @bizcity-layer K kernel/intake
// [2026-10-30 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — MCP ghi: lập nháp, đề xuất huỷ, luôn chờ duyệt; ADR-0009 đề xuất.
// [2026-10-30 10:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — mở activeLines / entryLine cho accounting.journal.post; công cụ ghi thứ ba ở voucher.actions.ts.
/**
 * Công cụ GHI `accounting.*` cho trợ lý AI (bizcity_mcp@1 §5.2, CONG-BO-KIEN-TRUC §2.1; PHASE-009, PHASES 2.16). Chỉ ĐỀ XUẤT:
 * kết quả luôn chờ người có quyền duyệt ở ACC14 (STD-MCP-6) — không công cụ nào ghi thẳng sổ, duyệt, khoá kỳ hay xoá.
 *   accounting.document.create_draft — chứng từ theo bizcity_ledger_intake@1 (bán, mua, thu, chi…) → `pending` dù chế độ "Tự động"
 *   accounting.entry.reverse         — đề xuất huỷ chứng từ đã ghi → "Chờ huỷ", sổ giữ nguyên tới khi kế toán duyệt
 *   accounting.journal.post          — phiếu nhập tay nháp chờ duyệt: modules/vouchers/voucher.actions.ts (S009-2)
 * Qua MCP: lần gọi đầu chạy thử (dryRun) → bản xem trước gồm BÚT TOÁN dựng thử bằng luật định khoản thật rồi huỷ (STD-MCP-4),
 * kèm confirm_token; người dùng đồng ý → gọi lại với token → runtime action ghi, bằng chứng actor_kind = ai (STD-MCP-9).
 * Không số tài khoản trong tham số: tài khoản do luật định khoản + cấu hình của đơn vị quyết.
 */
import { z } from 'zod';
import { sql } from 'kysely';
import { ingestDocumentSchema } from '@ketoan/contracts';
import { defineAction, type AnyActionDef } from '../../core/actions.js';
import { Errors } from '../../core/errors.js';
import type { Db } from '../../db/client.js';
import { draftDocumentIn, requestCancelIn } from './document.service.js';

const tags = ['Chứng từ (AI)'];
/** Sự việc do Kernel tự lập: huỷ ở màn của chúng, không qua đề xuất huỷ. */
const NOT_BY_REQUEST = ['closing', 'cogs', 'depreciation', 'opening'];

export const entryLine = z.object({
  entryNo: z.string(),
  accountCode: z.string(),
  accountName: z.string(),
  debit: z.number(),
  credit: z.number(),
  partnerCode: z.string().nullable(),
  description: z.string(),
});

/** Dòng bút toán còn hiệu lực của chứng từ (trong giao dịch đang mở — bản xem trước thấy cả bút toán dựng thử). */
export async function activeLines(trx: Db, tenantId: string, docKey: string): Promise<z.infer<typeof entryLine>[]> {
  const r = await sql<{ entry_no: string; account_code: string; account_name: string | null; debit: string; credit: string; partner_code: string | null; description: string }>`
    SELECT e.entry_no, l.account_code, a.name AS account_name, l.debit, l.credit, p.code AS partner_code, l.description
      FROM accounting_events d
      JOIN ledger_entries e ON e.event_id = d.id AND e.status = 'posted' AND NOT e.is_reversal
      JOIN ledger_lines l ON l.entry_id = e.id
      LEFT JOIN accounts a ON a.tenant_id = d.tenant_id AND a.code = l.account_code
      LEFT JOIN partners p ON p.id = l.partner_id
     WHERE d.tenant_id = ${tenantId} AND d.doc_key = ${docKey}
     ORDER BY e.id, l.line_no`.execute(trx);
  return r.rows.map((x) => ({
    entryNo: x.entry_no, accountCode: x.account_code, accountName: x.account_name ?? '', debit: Number(x.debit), credit: Number(x.credit),
    partnerCode: x.partner_code, description: x.description,
  }));
}

export const documentActions: AnyActionDef[] = [
  defineAction({
    id: 'accounting.document.create-draft', title: 'Lập chứng từ nháp chờ kế toán duyệt', tags,
    description: 'Lập một chứng từ theo khuôn nạp sổ (bán hàng, trả hàng, mua hàng, chuyển kho, điều chỉnh kho, chuyển tiền, thu tiền khách, trả tiền nhà cung cấp). '
      + 'Chứng từ luôn vào hàng "Chờ định khoản" (ACC14), kế toán duyệt mới vào sổ. Bản xem trước cho biết bút toán sẽ ghi theo cấu hình hạch toán của đơn vị. '
      + 'Dùng mã chi nhánh, mã đối tượng, mã hàng, mã lý do có sẵn; không truyền số tài khoản.',
    permission: 'documents:write', effect: 'write', idempotency: 'required', sideEffects: ['documents'], dryRun: true,
    input: z.object({ document: ingestDocumentSchema.describe('Chứng từ theo bizcity_ledger_intake@1; docType quyết định khuôn') }),
    output: z.object({
      docKey: z.string(), version: z.number(),
      status: z.enum(['pending', 'unchanged', 'preview']).describe('pending = đã vào hàng chờ duyệt; preview = bản xem trước (chưa lưu)'),
      entries: z.array(entryLine).describe('Bút toán xem trước (chỉ có ở bản xem trước)'),
    }),
    expose: { mcp: true, ai: 'propose' },
    evidence: { objectType: 'source_document', objectId: (input) => input.document.docKey },
    handler: async (ctx, { document }) => {
      const auth = ctx.legacyAuth;
      if (ctx.dryRun) {
        const r = await draftDocumentIn(ctx.data.tx, auth, document, { preview: true });
        return { docKey: r.docKey, version: r.version, status: 'preview' as const, entries: await activeLines(ctx.data.tx, auth.tenantId, r.docKey) };
      }
      const r = await draftDocumentIn(ctx.data.tx, auth, document);
      return { docKey: r.docKey, version: r.version, status: r.status === 'unchanged' ? 'unchanged' as const : 'pending' as const, entries: [] };
    },
  }),

  defineAction({
    id: 'accounting.entry.reverse', title: 'Đề xuất huỷ chứng từ đã ghi sổ', tags,
    description: 'Đề xuất huỷ một chứng từ (đảo bút toán bằng ghi số âm). Chứng từ vào hàng "Chờ huỷ" ở ACC14; sổ giữ nguyên tới khi kế toán duyệt huỷ. '
      + 'Bản xem trước liệt kê bút toán sẽ bị đảo. Bắt buộc ghi lý do. Không dùng cho kết chuyển, giá vốn, khấu hao, số dư đầu kỳ (huỷ ở màn của chúng).',
    permission: 'documents:write', effect: 'write', idempotency: 'required', sideEffects: ['documents'], dryRun: true,
    input: z.object({
      docKey: z.string().min(1).describe('Mã chứng từ (docKey), lấy từ accounting.documents.search'),
      reason: z.string().trim().min(5, 'Lý do ít nhất 5 ký tự').max(500).describe('Lý do huỷ, ghi vào nhật ký định khoản'),
    }),
    output: z.object({
      docKey: z.string(),
      requested: z.boolean().describe('false = chứng từ đã huỷ hoặc đã có đề xuất huỷ trước đó'),
      willReverse: z.array(entryLine).describe('Bút toán sẽ bị đảo khi kế toán duyệt huỷ'),
    }),
    expose: { mcp: true, ai: 'propose', destructive: true },
    evidence: { objectType: 'source_document', objectId: (input) => input.docKey },
    handler: async (ctx, input) => {
      const auth = ctx.legacyAuth;
      const row = await ctx.data.tx.selectFrom('accounting_events').select(['doc_type', 'doc_no']).where('tenant_id', '=', auth.tenantId).where('doc_key', '=', input.docKey).executeTakeFirst();
      if (!row) throw Errors.notFound(`chứng từ ${input.docKey}`);
      if (NOT_BY_REQUEST.includes(row.doc_type)) throw Errors.validation(`${row.doc_no}: chứng từ hệ thống tự lập (${row.doc_type}) — huỷ / tính lại ở màn của nó, không qua đề xuất huỷ`);
      const willReverse = await activeLines(ctx.data.tx, auth.tenantId, input.docKey);
      const r = await requestCancelIn(ctx.data.tx, auth, input.docKey, input.reason, { hold: true });
      return { docKey: input.docKey, requested: r.requested, willReverse };
    },
  }),
];
