// @bizcity-layer U ui-kit/print
/**
 * Cấu hình mẫu in (màn Hệ thống → Mẫu in, HT05). Bố cục mẫu nằm trong code giao diện; bảng print_template_settings chỉ lưu phần
 * khác mặc định: bật / tắt mẫu, mẫu mặc định, chỉnh nội dung (tiêu đề, số liên, khổ, chữ ký, dòng căn cứ, ghi chú cuối).
 *   GET    /api/v1/print-templates/effective?branchCode=   các dòng áp cho người đang dùng ở chi nhánh này (người dùng, chi nhánh
 *                                                          và chi nhánh cha, cả đơn vị) — giao diện tự xếp ưu tiên
 *   GET    /api/v1/print-templates/settings?scope=&scopeRef=&screen=   danh sách cấu hình (màn quản lý)
 *   PUT    /api/v1/print-templates/settings              thêm / sửa một dòng (theo mã mẫu + phạm vi); đặt mặc định thì bỏ mặc định
 *                                                          của các mẫu khác cùng màn, cùng phạm vi
 *   DELETE /api/v1/print-templates/settings?templateCode=&scope=&scopeRef=   bỏ cấu hình (về như mặc định)
 * Quyền: phạm vi người dùng của chính mình — mọi người đã đăng nhập; phạm vi đơn vị / chi nhánh / người khác — settings:write.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PRINT_SCOPES, printScreenOf, printSettingInputSchema, printTemplateCode, type PrintSetting } from '@ketoan/contracts';
import { db } from '../../db/client.js';
import { authOf, type AuthContext } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { ok } from '../../core/http.js';
import { writeAudit } from '../../core/audit.js';

const tags = ['Mẫu in'];
const selfId = (auth: AuthContext) => (auth.kind === 'user' ? auth.actor.replace(/^user:/, '') : '');

/** Phạm vi đơn vị / chi nhánh / người khác cần quyền cấu hình; người dùng tự đặt cho mình thì được. */
function checkWrite(auth: AuthContext, scope: string, scopeRef: string) {
  if (scope === 'user' && scopeRef && scopeRef === selfId(auth)) return;
  if (!auth.permissions.has('settings:write')) throw Errors.forbidden('Cần quyền cấu hình hệ thống để đặt mẫu in cho cả đơn vị, chi nhánh hoặc người khác.');
}

function checkScope(scope: string, scopeRef: string) {
  if (scope === 'tenant' && scopeRef) throw Errors.validation('Phạm vi cả đơn vị không có mã chi nhánh / người dùng');
  if (scope !== 'tenant' && !scopeRef) throw Errors.validation(scope === 'branch' ? 'Chưa chọn chi nhánh' : 'Chưa chọn người dùng');
}

type Row = { id: string; template_code: string; scope: string; scope_ref: string; is_enabled: boolean; is_default: boolean; overrides: unknown; updated_by: string; updated_at: Date };
const dto = (r: Row): PrintSetting => ({
  id: r.id, templateCode: r.template_code, scope: r.scope as PrintSetting['scope'], scopeRef: r.scope_ref, isEnabled: r.is_enabled, isDefault: r.is_default,
  overrides: (r.overrides ?? {}) as PrintSetting['overrides'], updatedBy: r.updated_by, updatedAt: new Date(r.updated_at).toISOString(),
});
const COLS = ['id', 'template_code', 'scope', 'scope_ref', 'is_enabled', 'is_default', 'overrides', 'updated_by', 'updated_at'] as const;
const scopeKey = z.object({ templateCode: printTemplateCode, scope: z.enum(PRINT_SCOPES), scopeRef: z.string().trim().max(64).default('') });

export async function printTemplateRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/print-templates/effective', {
    schema: { tags, summary: 'Cấu hình mẫu in áp cho người đang dùng tại một chi nhánh (đơn vị, chi nhánh cha, chi nhánh, người dùng)', querystring: z.object({ branchCode: z.string().trim().max(64).default('') }) },
    handler: async (req) => {
      const auth = authOf(req);
      const branches: string[] = [];
      if (req.query.branchCode) {
        const b = await db.selectFrom('branches as b').leftJoin('branches as p', 'p.id', 'b.parent_id').select(['b.code', 'p.code as parent'])
          .where('b.tenant_id', '=', auth.tenantId).where('b.code', '=', req.query.branchCode).executeTakeFirst();
        if (b) branches.push(b.code, ...(b.parent ? [b.parent] : []));
      }
      const me = selfId(auth);
      const rows = await db.selectFrom('print_template_settings').select(COLS).where('tenant_id', '=', auth.tenantId)
        .where((eb) => eb.or([
          eb('scope', '=', 'tenant'),
          ...(branches.length ? [eb.and([eb('scope', '=', 'branch'), eb('scope_ref', 'in', branches)])] : []),
          ...(me ? [eb.and([eb('scope', '=', 'user'), eb('scope_ref', '=', me)])] : []),
        ]))
        .orderBy('template_code').execute();
      // Thứ tự chi nhánh để giao diện xếp ưu tiên: shop trước, chi nhánh cha sau.
      return ok({ userId: me, branches, settings: rows.map(dto) });
    },
  });

  r.get('/api/v1/print-templates/settings', {
    schema: {
      tags, summary: 'Danh sách cấu hình mẫu in (lọc theo phạm vi, mã màn)',
      querystring: z.object({ scope: z.enum(PRINT_SCOPES).optional(), scopeRef: z.string().trim().max(64).optional(), screen: z.string().trim().max(32).optional() }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const q = req.query;
      let sel = db.selectFrom('print_template_settings').select(COLS).where('tenant_id', '=', auth.tenantId);
      if (q.scope) sel = sel.where('scope', '=', q.scope);
      if (q.scopeRef !== undefined) sel = sel.where('scope_ref', '=', q.scopeRef);
      if (q.screen) sel = sel.where('template_code', 'like', `${q.screen}:%`);
      // Người không có quyền cấu hình chỉ xem được cấu hình chung và của chính mình.
      if (!auth.permissions.has('settings:write')) sel = sel.where((eb) => eb.or([eb('scope', '!=', 'user'), eb('scope_ref', '=', selfId(auth))]));
      const rows = await sel.orderBy('template_code').orderBy('scope').orderBy('scope_ref').limit(20000).execute();
      return ok(rows.map(dto));
    },
  });

  r.put('/api/v1/print-templates/settings', {
    schema: { tags, summary: 'Thêm / sửa cấu hình một mẫu in theo phạm vi', body: printSettingInputSchema },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      checkScope(b.scope, b.scopeRef);
      checkWrite(auth, b.scope, b.scopeRef);
      if (b.scope === 'branch') {
        const br = await db.selectFrom('branches').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', b.scopeRef).executeTakeFirst();
        if (!br) throw Errors.validation(`Không có chi nhánh ${b.scopeRef}`);
      }
      if (b.scope === 'user') {
        const u = await db.selectFrom('users').select('id').where('tenant_id', '=', auth.tenantId).where('id', '=', b.scopeRef).executeTakeFirst().catch(() => undefined);
        if (!u) throw Errors.validation(`Không có người dùng ${b.scopeRef}`);
      }
      if (b.isDefault && !b.isEnabled) throw Errors.validation('Mẫu đã tắt thì không đặt làm mặc định được');
      const saved = await db.transaction().execute(async (trx) => {
        const before = await trx.selectFrom('print_template_settings').select(COLS).where('tenant_id', '=', auth.tenantId)
          .where('template_code', '=', b.templateCode).where('scope', '=', b.scope).where('scope_ref', '=', b.scopeRef).executeTakeFirst();
        if (b.isDefault) {
          // Mỗi màn một mẫu mặc định trong cùng phạm vi.
          await trx.updateTable('print_template_settings').set({ is_default: false, updated_by: auth.actorName, updated_at: new Date() })
            .where('tenant_id', '=', auth.tenantId).where('scope', '=', b.scope).where('scope_ref', '=', b.scopeRef)
            .where('template_code', 'like', `${printScreenOf(b.templateCode)}:%`).where('template_code', '!=', b.templateCode).where('is_default', '=', true).execute();
        }
        const row = await trx.insertInto('print_template_settings')
          .values({ tenant_id: auth.tenantId, template_code: b.templateCode, scope: b.scope, scope_ref: b.scopeRef, is_enabled: b.isEnabled, is_default: b.isDefault, overrides: JSON.stringify(b.overrides), updated_by: auth.actorName })
          .onConflict((oc) => oc.constraint('print_template_settings_uniq').doUpdateSet({ is_enabled: b.isEnabled, is_default: b.isDefault, overrides: JSON.stringify(b.overrides), updated_by: auth.actorName, updated_at: new Date() }))
          .returning(COLS).executeTakeFirstOrThrow();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'settings.print-template', objectType: 'print_template', objectId: `${b.templateCode}@${b.scope}:${b.scopeRef}`, before: before ? dto(before) : null, after: b });
        return row;
      });
      return ok(dto(saved));
    },
  });

  r.delete('/api/v1/print-templates/settings', {
    schema: { tags, summary: 'Bỏ cấu hình một mẫu in ở một phạm vi (về như mặc định)', querystring: scopeKey },
    handler: async (req) => {
      const auth = authOf(req);
      const q = req.query;
      checkScope(q.scope, q.scopeRef);
      checkWrite(auth, q.scope, q.scopeRef);
      const removed = await db.transaction().execute(async (trx) => {
        const row = await trx.deleteFrom('print_template_settings').where('tenant_id', '=', auth.tenantId).where('template_code', '=', q.templateCode)
          .where('scope', '=', q.scope).where('scope_ref', '=', q.scopeRef).returning(COLS).executeTakeFirst();
        if (row) await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'settings.print-template.reset', objectType: 'print_template', objectId: `${q.templateCode}@${q.scope}:${q.scopeRef}`, before: dto(row), after: null });
        return Boolean(row);
      });
      return ok({ removed });
    },
  });
}
