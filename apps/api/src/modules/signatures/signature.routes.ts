// @bizcity-layer P documents/signatures
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Ký xác nhận trên phiếu (KT-27).
 *   GET    /api/v1/documents/:id/signatures          các chữ ký của phiếu (kèm còn hiệu lực hay đã cũ)
 *   POST   /api/v1/signatures                         ký một hoặc nhiều phiếu với một vai { ids, role }
 *   DELETE /api/v1/documents/:id/signatures/:role     huỷ chữ ký của vai ở phiên bản hiện tại
 *
 * Ai ký được vai nào:
 *   - Người lập phiếu (preparer): người đã lập phiếu, hoặc người có quyền sửa phiếu của người khác.
 *   - Thủ quỹ (cashier): người có quyền ghi chứng từ.
 *   - Kế toán trưởng (chief_accountant): vai trò kế toán trưởng hoặc chủ đơn vị.
 *   - Giám đốc (director): chủ đơn vị.
 * Chữ ký gắn phiên bản phiếu; sửa phiếu thì chữ ký cũ hết hiệu lực (vẫn lưu để tra). Phiếu đã huỷ không ký được.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db, type Db } from '../../db/client.js';
import { authOf, requirePermission, type AuthContext } from '../../core/auth.js';
import { ok, idParamSchema } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';

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
    case 'chief_accountant': return auth.role === 'chief_accountant' || auth.role === 'owner' ? null : 'Chỉ kế toán trưởng hoặc chủ đơn vị ký ô kế toán trưởng';
    case 'director': return auth.role === 'owner' ? null : 'Chỉ chủ đơn vị (giám đốc) ký ô giám đốc';
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

  r.post('/api/v1/signatures', {
    preHandler: requirePermission('documents:read'),
    schema: {
      tags, summary: 'Ký một hoặc nhiều phiếu với một vai',
      body: z.object({ ids: z.array(z.string().regex(/^\d+$/)).min(1).max(500), role: z.enum(SIGN_ROLES) }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const { ids, role } = req.body;
      const res = await db.transaction().execute(async (trx) => {
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
      return ok(res);
    },
  });

  r.delete('/api/v1/documents/:id/signatures/:role', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Huỷ chữ ký của một vai', params: idParamSchema.extend({ role: z.enum(SIGN_ROLES) }) },
    handler: async (req) => {
      const auth = authOf(req);
      await db.transaction().execute(async (trx) => {
        const doc = await trx.selectFrom('accounting_events').select(['id', 'version']).where('tenant_id', '=', auth.tenantId).where('id', '=', req.params.id).executeTakeFirst();
        if (!doc) throw Errors.notFound('phiếu');
        const sig = await trx.selectFrom('document_signatures').selectAll().where('event_id', '=', doc.id).where('role', '=', req.params.role).where('version', '=', doc.version).where('revoked_at', 'is', null).executeTakeFirst();
        if (!sig) throw Errors.notFound('chữ ký');
        if (sig.signer !== auth.actor && auth.role !== 'owner') throw Errors.forbidden('Chỉ người đã ký hoặc chủ đơn vị huỷ được chữ ký');
        await trx.updateTable('document_signatures').set({ revoked_at: new Date(), revoked_by: auth.actor }).where('id', '=', sig.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'document.unsign', objectType: 'source_document', objectId: doc.id, before: { role: sig.role, signer: sig.signer_name, version: sig.version } });
      });
      return ok({ revoked: true });
    },
  });
}
