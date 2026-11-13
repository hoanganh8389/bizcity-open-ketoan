// @bizcity-layer U ui-kit/print
// [2026-11-11 Nguyễn Văn Thủy] Hồ sơ in (HT16): thông tin đơn vị trên bản in, hiện / ẩn, ngày ký, người ký (đóng góp)
/**
 * Hồ sơ in (bảng print_profiles, hợp đồng packages/contracts/src/print-profile.ts).
 *   GET    /api/v1/print-profile?branchCode=   hồ sơ áp khi in tại chi nhánh: effective (mặc định ← cả đơn vị ← chi nhánh cha
 *                                              ← chi nhánh) + các lớp đã lưu (màn thiết lập hiện "đang theo cả đơn vị")
 *   PUT    /api/v1/print-profile               ghi lớp cả đơn vị (branchCode '') hoặc một chi nhánh; chỉ lưu phần khác mặc định
 *   DELETE /api/v1/print-profile?branchCode=   bỏ hồ sơ riêng của chi nhánh (về theo cả đơn vị)
 * Đọc: mọi người đã đăng nhập (in cần). Ghi: settings:write.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { mergePrintProfile, printProfileSchema, type PrintProfileInput } from '@ketoan/contracts';
import { db } from '../../db/client.js';
import { authOf, requireAuthenticated, requirePermission } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { ok } from '../../core/http.js';
import { writeAudit } from '../../core/audit.js';

const tags = ['Mẫu in'];
const branchQ = z.object({ branchCode: z.string().trim().max(64).default('') });

/** Bỏ chuỗi rỗng / mảng rỗng để chỉ lưu phần có giá trị. */
function compact(p: PrintProfileInput): PrintProfileInput {
  const out: PrintProfileInput = {};
  const company = Object.fromEntries(Object.entries(p.company ?? {}).filter(([, v]) => v));
  if (Object.keys(company).length) out.company = company;
  if (p.show && Object.keys(p.show).length) out.show = p.show;
  if (p.signDate && Object.keys(p.signDate).length) out.signDate = p.signDate;
  const signers = (p.signers ?? []).filter((s) => s.title || s.name);
  if (signers.length) out.signers = signers;
  return out;
}

export async function printProfileRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/print-profile', {
    preHandler: requireAuthenticated(),
    schema: { tags, summary: 'Hồ sơ in áp tại một chi nhánh (thông tin đơn vị trên bản in, người ký) và các lớp đã lưu', querystring: branchQ },
    handler: async (req) => {
      const auth = authOf(req);
      // Chuỗi chi nhánh: cha trước, chi nhánh đang in sau (lớp sau thắng).
      const chain: string[] = [];
      if (req.query.branchCode) {
        const b = await db.selectFrom('branches as b').leftJoin('branches as p', 'p.id', 'b.parent_id').select(['b.code', 'p.code as parent'])
          .where('b.tenant_id', '=', auth.tenantId).where('b.code', '=', req.query.branchCode).executeTakeFirst();
        if (b) chain.push(...(b.parent ? [b.parent] : []), b.code);
      }
      const rows = await db.selectFrom('print_profiles').select(['branch_code', 'profile', 'updated_by', 'updated_at'])
        .where('tenant_id', '=', auth.tenantId).where('branch_code', 'in', ['', ...chain]).execute();
      const layer = (code: string) => rows.find((x) => x.branch_code === code)?.profile as PrintProfileInput | undefined;
      const effective = mergePrintProfile(layer(''), ...chain.map(layer));
      const own = rows.find((x) => x.branch_code === req.query.branchCode);
      return ok({
        effective,
        tenant: layer('') ?? {},
        branch: req.query.branchCode ? (layer(req.query.branchCode) ?? null) : null,
        updatedBy: own?.updated_by ?? null,
        updatedAt: own ? new Date(own.updated_at).toISOString() : null,
      });
    },
  });

  r.put('/api/v1/print-profile', {
    preHandler: requirePermission('settings:write'),
    schema: { tags, summary: 'Ghi hồ sơ in của cả đơn vị hoặc một chi nhánh', body: z.object({ branchCode: z.string().trim().max(64).default(''), profile: printProfileSchema }) },
    handler: async (req) => {
      const auth = authOf(req);
      const { branchCode } = req.body;
      if (branchCode) {
        const br = await db.selectFrom('branches').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', branchCode).executeTakeFirst();
        if (!br) throw Errors.validation(`Không có chi nhánh ${branchCode}`);
      }
      const profile = compact(req.body.profile);
      await db.transaction().execute(async (trx) => {
        await trx.insertInto('print_profiles').values({ tenant_id: auth.tenantId, branch_code: branchCode, profile: JSON.stringify(profile), updated_by: auth.actorName })
          .onConflict((oc) => oc.columns(['tenant_id', 'branch_code']).doUpdateSet({ profile: JSON.stringify(profile), updated_by: auth.actorName, updated_at: new Date() }))
          .execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'print_profile.update', objectType: 'print_profile', objectId: branchCode || 'tenant', after: profile });
      });
      return ok({ branchCode, profile });
    },
  });

  r.delete('/api/v1/print-profile', {
    preHandler: requirePermission('settings:write'),
    schema: { tags, summary: 'Bỏ hồ sơ in riêng của một chi nhánh (về theo cả đơn vị)', querystring: branchQ },
    handler: async (req) => {
      const auth = authOf(req);
      if (!req.query.branchCode) throw Errors.validation('Chỉ bỏ được hồ sơ riêng của chi nhánh');
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom('print_profiles').where('tenant_id', '=', auth.tenantId).where('branch_code', '=', req.query.branchCode).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'print_profile.delete', objectType: 'print_profile', objectId: req.query.branchCode });
      });
      return ok({ branchCode: req.query.branchCode });
    },
  });
}
