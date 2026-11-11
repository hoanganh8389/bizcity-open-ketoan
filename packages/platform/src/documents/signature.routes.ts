// @bizcity-layer P documents/signatures
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/signatures/signature.routes.ts sang packages/platform (@bizcity/platform, D010-7 chặng 2); import tương đối viết lại theo chỗ mới
/**
 * Ký xác nhận trên phiếu (KT-27).
 *   GET    /api/v1/documents/:id/signatures          các chữ ký của phiếu (kèm còn hiệu lực hay đã cũ)
 *   POST   /api/v1/signatures                         ký một hoặc nhiều phiếu với một vai { ids, role }
 *   DELETE /api/v1/documents/:id/signatures/:role     huỷ chữ ký của vai ở phiên bản hiện tại
 *
 * Ai ký được vai nào:
 *   - Người lập phiếu (preparer): người đã lập phiếu, hoặc người có quyền sửa phiếu của người khác.
 *   - Thủ quỹ (cashier): người có quyền ghi chứng từ.
 *   - Kế toán trưởng (chief_accountant): người có quyền khoá kỳ (periods:lock — kế toán trưởng, chủ đơn vị).
 *   - Giám đốc (director): người có quyền duyệt cấp 2 (payments:approve-final — chủ đơn vị).
 * Kiểm theo QUYỀN, không theo tên vai trò: vai trò của đơn vị cấp / Cấm được (PHASE-028 S028-15). Hai quyền trên là ánh xạ tạm,
 * giữ đúng người ký như trước, tới khi có quyền ký riêng (D-AUTH-13 bước 2).
 * Chữ ký gắn phiên bản phiếu; sửa phiếu thì chữ ký cũ hết hiệu lực (vẫn lưu để tra). Phiếu đã huỷ không ký được.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db, type Db } from '../db/client.js';
import { authOf, requirePermission, type AuthContext } from '../core/auth.js';
import { ok, idParamSchema } from '../core/http.js';
import { Errors } from '../core/errors.js';
import { writeAudit } from '../core/audit.js';
import { defineAction, mountActions, type AnyActionDef, sameTx } from '@bizcity/platform/core/actions';

const tags = ['Ký phiếu'];
export const SIGN_ROLES = ['preparer', 'cashier', 'chief_accountant', 'director'] as const;
export type SignRole = (typeof SIGN_ROLES)[number];
const ROLE_LABEL: Record<SignRole, string> = { preparer: 'người lập phiếu', cashier: 'thủ quỹ', chief_accountant: 'kế toán trưởng', director: 'giám đốc' };

/** Lý do không ký được (null = ký được). */
export function signProblem(auth: Pick<AuthContext, 'kind' | 'role' | 'actor' | 'permissions'>, role: SignRole, doc: { created_by: string | null }): string | null {
  if (auth.kind !== 'user') return 'Chỉ người dùng đăng nhập mới ký được phiếu';
  switch (role) {
    case 'preparer': return doc.created_by === auth.actor || auth.permissions.has('documents:edit-all') ? null : 'Chỉ người lập phiếu (hoặc kế toán trưởng) ký ô người lập phiếu';
    case 'cashier': return auth.permissions.has('documents:write') ? null : 'Bạn không có quyền ký ô thủ quỹ';
    // [2026-11-09 01:55 PM kiennt] PHASE-028 — S028-15 (80 F4): ô kế toán trưởng / giám đốc kiểm theo quyền thay vì tên vai trò
    case 'chief_accountant': return auth.permissions.has('periods:lock') ? null : 'Chỉ kế toán trưởng hoặc chủ đơn vị ký ô kế toán trưởng';
    case 'director': return auth.permissions.has('payments:approve-final') ? null : 'Chỉ chủ đơn vị (giám đốc) ký ô giám đốc';
  }
}

export async function listSignatures(trx: Db, tenantId: string, eventId: string, currentVersion: number) {
  const rows = await trx.selectFrom('document_signatures').selectAll().where('tenant_id', '=', tenantId).where('event_id', '=', eventId).where('revoked_at', 'is', null)
    .orderBy('signed_at', 'desc').execute();
  return rows.map((s) => ({ role: s.role as SignRole, signerName: s.signer_name, signedAt: s.signed_at, version: s.version, valid: s.version === currentVersion }));
}

export async function signatureRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/documents/:id/signatures', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Chữ ký trên phiếu', params: idParamSchema },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const doc = await db.selectFrom('accounting_events').select(['id', 'version']).where('tenant_id', '=', tenantId).where('id', '=', req.params.id).executeTakeFirst();
      if (!doc) throw Errors.notFound('phiếu');
      return ok(await listSignatures(db, tenantId, doc.id, doc.version));
    },
  });
  mountActions(app, signatureWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const signatureWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.signature.create', title: 'Ký một hoặc nhiều phiếu với một vai', tags,
    // [2026-11-09 01:55 PM kiennt] PHASE-028 — S028-14 (80 F3): action ghi gác bằng quyền ghi (trước là documents:read); vai nào ký được vẫn do signProblem
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ ids: z.array(z.string().regex(/^\d+$/)).min(1).max(500), role: z.enum(SIGN_ROLES) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/signatures' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'signature' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const { ids, role } = input;
      const res = await sameTx(trx, async (trx) => {
        const docs = await trx.selectFrom('accounting_events').select(['id', 'doc_no', 'version', 'status', 'created_by']).where('tenant_id', '=', auth.tenantId).where('id', 'in', ids).execute();
        if (docs.length !== new Set(ids).size) throw Errors.notFound('phiếu');
        let signed = 0;
        const skipped: string[] = [];
        for (const d of docs) {
          if (d.status === 'cancelled') { skipped.push(`${d.doc_no}: đã huỷ`); continue; }
          const p = signProblem(auth, role, d);
          if (p) { skipped.push(`${d.doc_no}: ${p}`); continue; }
          const exists = await trx.selectFrom('document_signatures').select('id').where('event_id', '=', d.id).where('role', '=', role).where('version', '=', d.version).where('revoked_at', 'is', null).executeTakeFirst();
          if (exists) { skipped.push(`${d.doc_no}: đã có chữ ký ${ROLE_LABEL[role]}`); continue; }
          await trx.insertInto('document_signatures').values({ tenant_id: auth.tenantId, event_id: d.id, version: d.version, role, signer: auth.actor, signer_name: auth.actorName }).execute();
          await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'document.sign', objectType: 'source_document', objectId: d.id, after: { role, version: d.version } });
          signed++;
        }
        if (!signed && skipped.length && docs.length === 1) throw Errors.forbidden(skipped[0]!.replace(/^[^:]*: /, ''));
        return { signed, skipped };
      });
      return res;
    },
  }),
  defineAction({
    id: 'core.document.signature-delete', title: 'Huỷ chữ ký của một vai', tags,
    // [2026-11-09 01:55 PM kiennt] PHASE-028 — S028-14 (80 F3): action ghi gác bằng quyền ghi (trước là documents:read)
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema.extend({ role: z.enum(SIGN_ROLES) }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/documents/:id/signatures/:role' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'document', objectId: (i) => String(i.id) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      await sameTx(trx, async (trx) => {
        const doc = await trx.selectFrom('accounting_events').select(['id', 'version']).where('tenant_id', '=', auth.tenantId).where('id', '=', input.id).executeTakeFirst();
        if (!doc) throw Errors.notFound('phiếu');
        const sig = await trx.selectFrom('document_signatures').selectAll().where('event_id', '=', doc.id).where('role', '=', input.role).where('version', '=', doc.version).where('revoked_at', 'is', null).executeTakeFirst();
        if (!sig) throw Errors.notFound('chữ ký');
        // [2026-11-09 01:55 PM kiennt] PHASE-028 — S028-15 (80 F4): huỷ chữ ký người khác kiểm theo quyền (payments:approve-final — chủ đơn vị) thay vì tên vai trò
        if (sig.signer !== auth.actor && !auth.permissions.has('payments:approve-final')) throw Errors.forbidden('Chỉ người đã ký hoặc chủ đơn vị huỷ được chữ ký');
        await trx.updateTable('document_signatures').set({ revoked_at: new Date(), revoked_by: auth.actor }).where('id', '=', sig.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'document.unsign', objectType: 'source_document', objectId: doc.id, before: { role: sig.role, signer: sig.signer_name, version: sig.version } });
      });
      return { revoked: true };
    },
  }),
];
