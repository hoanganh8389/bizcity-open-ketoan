// @bizcity-layer K kernel/config
// [2026-11-02 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — action hồ sơ kế toán: accounting.profile.get (đọc, cho AI đọc) và accounting.profile.publish (ghi, người có quyền cấu hình; AI không dùng) (ADR-0013).
/**
 * Hồ sơ kế toán của đơn vị (ADR-0013) — action:
 *   GET  /api/v1/accounting/profile          accounting.profile.get      — hồ sơ áp cho ngày asOf (mặc định hôm nay) + năm tài chính + lịch sử
 *   POST /api/v1/accounting/profile/publish  accounting.profile.publish  — phát hành bản mới, hiệu lực từ đầu một năm tài chính
 * Phát hành là việc của người có quyền cấu hình, có bằng chứng tự động; không phơi cho AI (STD-MCP-6).
 */
import { z } from 'zod';
import { defineAction, type AnyActionDef } from '@bizcity/platform/core/actions';
import { ENTITY_TYPES, REGIMES, fiscalYearOf, listProfiles, profileAt, publishProfile, ymd, type ProfileRow } from './profile.js';

const tags = ['Cấu hình hạch toán'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const profileSchema = z.object({
  version: z.number(),
  effectiveFrom: z.string().describe('Ngày hiệu lực = đầu năm tài chính, YYYY-MM-DD'),
  fiscalYearStartMonth: z.number().describe('Tháng bắt đầu năm tài chính (1 = năm dương lịch)'),
  regime: z.enum(REGIMES).describe('Chế độ kế toán'),
  entityType: z.enum(ENTITY_TYPES).describe('Loại pháp nhân'),
  note: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
});
const view = (p: ProfileRow) => ({
  version: p.version, effectiveFrom: ymd(p.effective_from), fiscalYearStartMonth: Number(p.fiscal_year_start_month), regime: p.regime,
  entityType: p.entity_type, note: p.note, createdBy: p.created_by, createdAt: new Date(p.created_at).toISOString(),
});
const today = () => { const d = new Date(); return ymd(d); };

export const profileActions: AnyActionDef[] = [
  defineAction({
    id: 'accounting.profile.get', title: 'Hồ sơ kế toán của đơn vị', tags,
    description: 'Năm tài chính, chế độ kế toán, loại pháp nhân áp cho một ngày (mặc định hôm nay), năm tài chính chứa ngày đó, và lịch sử phiên bản. '
      + 'current = null nghĩa là đơn vị chưa khai hồ sơ cho ngày đó: không suy đoán chế độ.',
    permission: 'ledger:read', effect: 'read', idempotency: 'none',
    input: z.object({ asOf: date.optional() }),
    output: z.object({
      asOf: z.string(),
      current: profileSchema.nullable(),
      fiscalYear: z.object({ start: z.string(), end: z.string() }).nullable(),
      history: z.array(profileSchema),
    }),
    expose: { http: { method: 'GET', path: '/api/v1/accounting/profile' }, mcp: true, ai: 'read' },
    handler: async (ctx, input) => {
      const asOf = input.asOf ?? today();
      const cur = await profileAt(ctx.data.tx, ctx.tenant.id, asOf);
      return {
        asOf,
        current: cur ? view(cur) : null,
        fiscalYear: cur ? fiscalYearOf(Number(cur.fiscal_year_start_month), asOf) : null,
        history: (await listProfiles(ctx.data.tx, ctx.tenant.id)).map(view),
      };
    },
  }),
  defineAction({
    id: 'accounting.profile.publish', title: 'Phát hành hồ sơ kế toán', tags,
    description: 'Khai năm tài chính, chế độ kế toán, loại pháp nhân của đơn vị, hiệu lực từ ngày đầu một năm tài chính. '
      + 'Hồ sơ cũ giữ nguyên cho các năm trước. Không phát hành vào năm đã có kỳ khoá. Chỉ thêm, có bằng chứng.',
    permission: 'settings:write', effect: 'write', idempotency: 'required', sideEffects: ['settings'], dryRun: true,
    input: z.object({
      effectiveFrom: date,
      fiscalYearStartMonth: z.number().int().min(1).max(12),
      regime: z.enum(REGIMES),
      entityType: z.enum(ENTITY_TYPES),
      note: z.string().trim().min(5, 'Ghi rõ căn cứ / lý do (ít nhất 5 ký tự)').max(500),
    }),
    output: profileSchema,
    expose: { http: { method: 'POST', path: '/api/v1/accounting/profile/publish', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'accounting_profile', objectId: (_i, o) => String(o.version) },
    handler: async (ctx, input) => view(await publishProfile(ctx.data.tx, ctx.tenant.id, { ...input, actor: ctx.actor.id })),
  }),
];
