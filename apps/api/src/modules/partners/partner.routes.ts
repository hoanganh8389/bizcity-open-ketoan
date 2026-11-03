// @bizcity-layer M data/masterdata
// [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7): đọc sổ qua khung nhìn bizcity_read.* thay bảng ledger_* (SC-KERNEL-7)
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-14 / 15: POST /api/v1/partners/validate; tạo / sửa trả meta.findings, ghi nhận cảnh báo mềm (warnAck)
/**
 * Đối tượng và nhóm đối tượng.
 *   GET /api/v1/partners?search=&groupCode=&kind=&status=&page=&pageSize=
 *   GET /api/v1/partners/next-code?groupCode=&kind=   gợi ý mã mới theo dãy mã của nhóm (như HTsoft)
 *   GET /api/v1/partners/lookup?phone=&taxCode=&exclude=  đối tượng đã dùng số điện thoại / mã số thuế này
 *   GET /api/v1/partners/tax-lookup/:taxCode  tra cứu doanh nghiệp theo MST (doanhnghiep.vn / VietQR) để điền sẵn form — xem tra-mst.ts
 *   POST /api/v1/partners             tạo mới một đối tượng (mã đã có → 409, không ghi đè)
 *   PUT /api/v1/partners/:code        tạo hoặc cập nhật một đối tượng (kèm nhóm, khoá, hạn thanh toán, hạn mức nợ, thông tin công ty, quản lý)
 *   DELETE /api/v1/partners/:code     xoá đối tượng chưa có trên sổ, chứng từ
 *   PUT /api/v1/partners              đồng bộ danh mục từ hệ thống bán hàng / mua hàng (tối đa 1000 đối tượng một lần)
 *   GET /api/v1/partners/:code/balances?asOf=&branchCode=  số dư công nợ của một đối tượng theo từng tài khoản
 *   GET /api/v1/partner-groups        nhóm đối tượng
 *   PUT /api/v1/partner-groups/:code  thêm hoặc sửa nhóm
 *   POST /api/v1/partners/validate   khung Vì sao: nhắc / cảnh báo mềm cho một bản khai báo (chỉ đọc); POST / PUT :code trả meta.findings,
 *                                     nhận warnAck { reason, codes } để ghi nhận cảnh báo mềm (D023-6)
 *
 * Ghi: action core.partner.{validate,create,save,sync,delete}, core.partner-group.{save,delete} (W6, SC-ACT-1).
 *
 * Module nhỏ nên service gộp thẳng vào route (chỉ gọi repository + ghi nhật ký).
 */
import { referenceChecks } from '@bizcity/platform/core/hooks';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { partnerInputSchema } from '@ketoan/contracts';
import { db, type Db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok, pageMeta, pageQuerySchema } from '../../core/http.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';
import { Errors } from '../../core/errors.js';
import type { PartnerInput } from '@ketoan/contracts';
import { partnerRepository, toPartnerDto, type PartnerAccountingInfo } from './partner.repository.js';
import { suggestPartnerCode } from './partner-code.js';
// [2026-11-03 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-LAYER-2): adapter tra MST qua cổng
import { corePort } from '@bizcity/platform/core/ports';
import { partnerHints } from './partner.hints.js';
import { recordWarnAck } from '@bizcity/platform/core/catalog-warn';
import { WARN_ACK_MIN_REASON } from '@ketoan/contracts';

const warnAck = z.object({ reason: z.string().trim().min(WARN_ACK_MIN_REASON, `Lý do ít nhất ${WARN_ACK_MIN_REASON} ký tự`).max(500), codes: z.array(z.string().max(32)).max(50).default([]) });

const tags = ['Danh mục: Đối tượng'];
const KINDS = ['customer', 'supplier', 'employee', 'internal', 'other'] as const;
const KIND_TEXT: Record<string, string> = { customer: 'khách hàng', supplier: 'nhà cung cấp', employee: 'nhân viên', internal: 'nội bộ', other: 'khác' };
const accountingInfo = {
  groupCode: z.string().trim().max(64).nullish().describe('Mã nhóm đối tượng; chuỗi rỗng / null = bỏ nhóm'),
  isActive: z.boolean().optional().describe('false = khoá đối tượng'),
  paymentTermDays: z.number().int().min(0).max(3650).nullish().describe('Hạn thanh toán (số ngày được nợ); null = dùng hạn chung'),
  creditLimit: z.number().min(0).nullish().describe('Hạn mức nợ; null = không giới hạn'),
  note: z.string().trim().max(1000).optional(),
  contactName: z.string().trim().max(255).optional().describe('Người đại diện / liên hệ'),
  bankAccountNo: z.string().trim().max(64).optional().describe('Số tài khoản ngân hàng của đối tượng'),
  bankAccountHolder: z.string().trim().max(255).optional(),
  bankName: z.string().trim().max(255).optional().describe('Ngân hàng, chi nhánh mở tài khoản'),
  maxOpenDocs: z.number().int().min(0).max(100000).nullish().describe('Giới hạn số phiếu còn nợ; null = không giới hạn'),
  mobile: z.string().trim().max(64).optional().describe('Di động'),
  fax: z.string().trim().max(64).optional(),
  website: z.string().trim().max(255).optional(),
  position: z.string().trim().max(255).optional().describe('Chức vụ người đại diện'),
  companyName: z.string().trim().max(500).optional(),
  companyAddress: z.string().trim().max(500).optional(),
  shortName: z.string().trim().max(255).optional().describe('Tên viết tắt'),
  managerCode: z.string().trim().max(64).nullish().describe('Mã nhân viên quản lý'),
  branchCode: z.string().trim().max(64).nullish().describe('Mã chi nhánh quản lý'),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD').nullish().or(z.literal('')).describe('Ngày sinh'),
  gender: z.enum(['', 'male', 'female']).optional().describe('Giới tính'),
  alias: z.string().trim().max(255).optional().describe('Tên gọi khác, dùng khi tìm'),
  isProspect: z.boolean().optional().describe('Khách hàng tiềm năng'),
  customerType: z.enum(['', 'personal', 'business']).optional().describe('Loại khách hàng: cá nhân / doanh nghiệp'),
  alsoKinds: z.array(z.enum(['customer', 'supplier'])).max(2).optional().describe('Vai trò thêm ngoài Thuộc kiểu (vd NCC vừa là khách hàng)'),
};
const INFO_KEYS = ['kind', 'groupCode', 'isActive', 'paymentTermDays', 'creditLimit', 'note', 'contactName', 'bankAccountNo', 'bankAccountHolder', 'bankName', 'maxOpenDocs',
  'mobile', 'fax', 'website', 'position', 'companyName', 'companyAddress', 'shortName', 'managerCode', 'branchCode',
  'birthDate', 'gender', 'alias', 'isProspect', 'customerType', 'alsoKinds'] as const;
/** Tách phần thông tin kế toán bổ sung khỏi phần thông tin đối tượng gửi từ hệ thống nguồn. */
function split<T extends Record<string, unknown>>(b: T) {
  const info: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) ((INFO_KEYS as readonly string[]).includes(k) ? info : rest)[k] = v;
  return { info: info as PartnerAccountingInfo, rest: rest as Omit<PartnerInput, 'code'> & { code?: string } };
}
const partnerBody = partnerInputSchema.omit({ code: true }).extend({ kind: z.enum(KINDS).default('customer'), ...accountingInfo });
/** Tạo / sửa một đối tượng từ màn hình: thêm ghi nhận cảnh báo mềm. Đồng bộ hàng loạt không có trường này. */
const partnerFormBody = partnerBody.extend({ warnAck: warnAck.optional() });

/** Kiểm nhóm có trong danh mục. */
async function assertGroups(trx: Db, tenantId: string, codes: (string | null | undefined)[]) {
  const unique = [...new Set(codes.filter((c): c is string => Boolean(c)))];
  if (!unique.length) return;
  const rows = await trx.selectFrom('partner_groups').select('code').where('tenant_id', '=', tenantId).where('code', 'in', unique).execute();
  const missing = unique.filter((c) => !rows.some((r) => r.code === c));
  if (missing.length) throw Errors.validation(`Nhóm đối tượng chưa có trong danh mục: ${missing.join(', ')}`);
}

/**
 * Mã số thuế là duy nhất: không cho hai đối tượng dùng cùng một MST (người dùng tạo / sửa trên màn hình).
 * Chỉ kiểm khi MST mới hoặc vừa đổi — đối tượng cũ đã trùng MST từ trước (dữ liệu chuyển sang) vẫn sửa được các thông tin khác.
 * Đồng bộ từ hệ thống bán hàng / mua hàng và đối tượng tự tạo theo chứng từ không chặn ở đây.
 */
async function assertTaxCodeFree(trx: Db, tenantId: string, code: string, taxCode: string | null | undefined, current?: string | null) {
  const t = taxCode?.trim();
  if (!t || t === current?.trim()) return;
  // Hai người cùng ghi một MST lúc: người sau phải thấy đối tượng của người trước.
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`partner-tax:${tenantId}:${t}`}))`.execute(trx);
  const dup = await trx.selectFrom('partners').select(['code', 'name', 'kind']).where('tenant_id', '=', tenantId).where('tax_code', '=', t).where('code', '<>', code).executeTakeFirst();
  if (dup) throw Errors.conflict(`Mã số thuế ${t} đã có ở ${KIND_TEXT[dup.kind] ?? dup.kind} ${dup.code} - ${dup.name || '(chưa có tên)'}. Mỗi mã số thuế chỉ dùng cho một đối tượng.`);
}

// [2026-11-03 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 4 (SC-ACT-1): ghi đối tượng / nhóm đối tượng qua defineAction (core.partner.*, core.partner-group.*); findings của Gate A trả qua ctx.meta; kiểm xem (validate) thành action đọc
const partnerOut = z.object({ code: z.string(), name: z.string() }).passthrough().describe('PartnerDto đầy đủ: partner.repository.ts toPartnerDto');
const outDto = (p: Parameters<typeof toPartnerDto>[0]) => toPartnerDto(p) as unknown as z.infer<typeof partnerOut>;
const partnerGroupBody = z.object({
  name: z.string().trim().min(1).max(255),
  parentCode: z.string().trim().max(64).optional(),
  kind: z.enum([...KINDS, 'any']).default('any'),
  note: z.string().trim().max(500).default(''),
  isActive: z.boolean().default(true),
});

export const partnerActions: AnyActionDef[] = [
  defineAction({
    id: 'core.partner.validate', title: 'Kiểm thử một bản khai báo đối tượng (khung Vì sao)', tags,
    description: 'Nhắc / cảnh báo mềm / chặn cho một bản khai báo đối tượng — chỉ đọc, không ghi gì.',
    permission: 'catalog:read', effect: 'read', idempotency: 'none',
    input: z.object({ code: z.string().trim().min(1).max(64), name: z.string().trim().max(255).optional(), kind: z.enum(KINDS).optional(), alsoKinds: z.array(z.enum(['customer', 'supplier'])).max(2).optional(), taxCode: z.string().trim().max(32).nullish() }), output: z.object({ findings: z.array(z.unknown()) }),
    expose: { http: { method: 'POST', path: '/api/v1/partners/validate' }, mcp: false, ai: 'read' },
    handler: async (ctx, b) => ({ findings: await partnerHints(ctx.data.tx, ctx.tenant.id, b) }),
  }),
  defineAction({
    id: 'core.partner.create', title: 'Tạo mới đối tượng (mã đã có thì báo trùng, không ghi đè)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: partnerFormBody.extend({ code: z.string().trim().min(1).max(64) }), output: partnerOut,
    expose: { http: { method: 'POST', path: '/api/v1/partners', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'partner', objectId: (i) => i.code },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const tenantId = ctx.tenant.id;
      const { code, warnAck: ack, ...body } = input;
      const { info, rest } = split(body);
      // Hai người tạo cùng mã một lúc: người sau phải thấy mã đã có (upsert bên dưới không được ghi đè).
      await sql`SELECT pg_advisory_xact_lock(hashtext(${`partner:${tenantId}:${code}`}))`.execute(trx);
      const existing = await partnerRepository.findByCode(trx, tenantId, code);
      if (existing) throw Errors.conflict(`Mã ${code} đã có: ${existing.name || '(chưa có tên)'} (${KIND_TEXT[existing.kind] ?? existing.kind}). Bấm "Lấy mã mới" hoặc nhập mã khác.`);
      await assertGroups(trx, tenantId, [info.groupCode]);
      await assertTaxCodeFree(trx, tenantId, code, rest.taxCode);
      await partnerRepository.upsert(trx, tenantId, { ...rest, code } as PartnerInput, info.kind);
      await partnerRepository.updateAccountingInfo(trx, tenantId, code, info);
      await trx.updateTable('partners').set({ created_by: ctx.actor.name }).where('tenant_id', '=', tenantId).where('code', '=', code).execute();
      const findings = await partnerHints(trx, tenantId, { code, name: rest.name, kind: info.kind, alsoKinds: info.alsoKinds, taxCode: rest.taxCode });
      await recordWarnAck(trx, ctx.legacyAuth, 'partner', code, findings, ack);
      ctx.meta('findings', findings);
      return outDto((await partnerRepository.findByCode(trx, tenantId, code))!);
    },
  }),
  defineAction({
    id: 'core.partner.save', title: 'Tạo hoặc cập nhật đối tượng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: partnerFormBody.extend({ code: z.string().trim().min(1).max(64) }), output: partnerOut,
    expose: { http: { method: 'PUT', path: '/api/v1/partners/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'partner', objectId: (i) => i.code },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const tenantId = ctx.tenant.id;
      const { code, warnAck: ack, ...body } = input;
      const { info, rest } = split(body);
      await assertGroups(trx, tenantId, [info.groupCode]);
      const before = await partnerRepository.findByCode(trx, tenantId, code);
      await assertTaxCodeFree(trx, tenantId, code, rest.taxCode, before?.tax_code);
      await partnerRepository.upsert(trx, tenantId, { ...rest, code } as PartnerInput, info.kind);
      await partnerRepository.updateAccountingInfo(trx, tenantId, code, info);
      if (!before) await trx.updateTable('partners').set({ created_by: ctx.actor.name }).where('tenant_id', '=', tenantId).where('code', '=', code).execute();
      const findings = await partnerHints(trx, tenantId, { code, name: rest.name, kind: info.kind, alsoKinds: info.alsoKinds, taxCode: rest.taxCode });
      await recordWarnAck(trx, ctx.legacyAuth, 'partner', code, findings, ack);
      ctx.meta('findings', findings);
      return outDto((await partnerRepository.findByCode(trx, tenantId, code))!);
    },
  }),
  defineAction({
    id: 'core.partner.sync', title: 'Đồng bộ danh mục đối tượng từ hệ thống bán hàng / mua hàng', tags,
    description: 'Tạo mới hoặc cập nhật theo mã. Trường để trống không xoá thông tin cũ. Khoá, hạn thanh toán, hạn mức nợ chỉ cập nhật khi được gửi.',
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ partners: z.array(partnerBody.extend({ code: z.string().trim().min(1).max(64) })).min(1).max(1000) }), output: z.object({ count: z.number() }),
    expose: { http: { method: 'PUT', path: '/api/v1/partners' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'partner', objectId: (i) => `${i.partners.length} đối tượng` },
    handler: async (ctx, { partners }) => {
      const trx = ctx.data.tx;
      await assertGroups(trx, ctx.tenant.id, partners.map((p) => p.groupCode));
      for (const p of partners) {
        const { info, rest } = split(p);
        await partnerRepository.upsert(trx, ctx.tenant.id, rest as PartnerInput, info.kind);
        await partnerRepository.updateAccountingInfo(trx, ctx.tenant.id, p.code, info);
      }
      ctx.evidence.note('codes', partners.map((p) => p.code).slice(0, 200));
      return { count: partners.length };
    },
  }),
  defineAction({
    id: 'core.partner.delete', title: 'Xoá đối tượng chưa có trên sổ, chứng từ', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string() }), output: z.object({ code: z.string() }),
    expose: { http: { method: 'DELETE', path: '/api/v1/partners/:code' }, mcp: false, ai: 'deny', destructive: true },
    evidence: { objectType: 'partner', objectId: (i) => i.code },
    handler: async (ctx, { code }) => {
      const trx = ctx.data.tx;
      const tenantId = ctx.tenant.id;
      const before = await partnerRepository.findByCode(trx, tenantId, code);
      if (!before) throw Errors.notFound(`đối tượng ${code}`);
      const used = await trx.selectFrom('bizcity_read.ledger_lines').select('id').where('tenant_id', '=', tenantId).where('partner_id', '=', before.id).limit(1).executeTakeFirst();
      if (used) throw Errors.conflict(`Đối tượng ${before.code} đã có trên sổ: bỏ tích "Theo dõi" để khoá`);
      // [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G3): module còn dùng đối tượng (masterdata.referenceCheck) → không xoá
      const refs = await referenceChecks(trx, tenantId, { kind: 'partner', code: before.code });
      if (refs.length) throw Errors.conflict(`Đối tượng ${before.code} đang dùng ở ${refs.join('; ')}: bỏ tích "Theo dõi" để khoá`);
      // Còn chứng từ, công nợ, hợp đồng… trỏ tới thì khoá ngoại chặn (báo trùng / đang dùng).
      await trx.deleteFrom('partners').where('id', '=', before.id).execute();
      return { code };
    },
  }),
  defineAction({
    id: 'core.partner-group.delete', title: 'Xoá nhóm đối tượng chưa dùng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string() }), output: z.object({ code: z.string() }),
    expose: { http: { method: 'DELETE', path: '/api/v1/partner-groups/:code' }, mcp: false, ai: 'deny', destructive: true },
    evidence: { objectType: 'partner_group', objectId: (i) => i.code },
    handler: async (ctx, { code }) => {
      const trx = ctx.data.tx;
      const tenantId = ctx.tenant.id;
      const before = await trx.selectFrom('partner_groups').selectAll().where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
      if (!before) throw Errors.notFound(`nhóm ${code}`);
      const used = await trx.selectFrom('partners').select('code').where('tenant_id', '=', tenantId).where('group_code', '=', code).limit(1).executeTakeFirst()
        ?? await trx.selectFrom('partner_groups').select('code').where('tenant_id', '=', tenantId).where('parent_code', '=', code).limit(1).executeTakeFirst();
      if (used) throw Errors.conflict(`Nhóm ${code} đang dùng (${used.code}): bỏ tích "Đang dùng" để ngừng`);
      await trx.deleteFrom('partner_groups').where('id', '=', before.id).execute();
      return { code };
    },
  }),
  defineAction({
    id: 'core.partner-group.save', title: 'Thêm hoặc sửa nhóm đối tượng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: partnerGroupBody.extend({ code: z.string().trim().min(1).max(64) }), output: z.object({ code: z.string() }),
    expose: { http: { method: 'PUT', path: '/api/v1/partner-groups/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'partner_group', objectId: (i) => i.code },
    handler: async (ctx, b) => {
      const trx = ctx.data.tx;
      const tenantId = ctx.tenant.id;
      if (b.parentCode === b.code) throw Errors.validation('Nhóm cha không được là chính nó');
      if (b.parentCode) await assertGroups(trx, tenantId, [b.parentCode]);
      const values = { name: b.name, parent_code: b.parentCode || null, kind: b.kind, note: b.note, is_active: b.isActive };
      await trx.insertInto('partner_groups').values({ tenant_id: tenantId, code: b.code, ...values }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(values)).execute();
      return { code: b.code };
    },
  }),
];

export async function partnerRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/partners', {
    preHandler: requirePermission('catalog:read'),
    schema: {
      tags,
      summary: 'Danh sách đối tượng',
      querystring: pageQuerySchema.extend({
        search: z.string().trim().optional(),
        groupCode: z.string().trim().optional().describe('Mã nhóm; "-" = chưa có nhóm'),
        kind: z.enum(KINDS).optional(),
        status: z.enum(['all', 'active', 'inactive']).default('all'),
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const { search, groupCode, kind, status, page, pageSize } = req.query;
      const { rows, total } = await partnerRepository.list(db, auth.tenantId, { search, groupCode, kind, status }, page, pageSize);
      return ok(rows, pageMeta(req.query, total));
    },
  });

  r.get('/api/v1/partners/:code/balances', {
    preHandler: requirePermission('ledger:read'),
    schema: {
      tags,
      summary: 'Số dư công nợ của một đối tượng theo từng tài khoản (dùng khi cấn trừ công nợ)',
      params: z.object({ code: z.string() }),
      querystring: z.object({ asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), branchCode: z.string().optional() }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const p = await db.selectFrom('partners').select(['id', 'code', 'name']).where('tenant_id', '=', auth.tenantId).where('code', '=', req.params.code).executeTakeFirst();
      if (!p) throw Errors.notFound(`đối tượng ${req.params.code}`);
      let q = db
        .selectFrom('bizcity_read.ledger_balances_daily as g')
        .leftJoin('accounts as a', (j) => j.onRef('a.tenant_id', '=', 'g.tenant_id').onRef('a.code', '=', 'g.account_code'))
        .select(['g.account_code', 'a.name as account_name', (eb) => eb.fn.sum<string>(eb('g.debit', '-', eb.ref('g.credit'))).as('balance')])
        .where('g.tenant_id', '=', auth.tenantId)
        .where('g.partner_id', '=', p.id)
        .where('g.posting_date', '<=', req.query.asOf)
        .groupBy(['g.account_code', 'a.name'])
        .orderBy('g.account_code');
      if (req.query.branchCode) q = q.where('g.branch_id', '=', (eb) => eb.selectFrom('branches').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', req.query.branchCode!));
      const rows = (await q.execute()).map((r) => ({ accountCode: r.account_code, accountName: r.account_name ?? '', balance: Math.round(Number(r.balance) * 100) / 100 })).filter((r) => r.balance !== 0);
      return ok({ code: p.code, name: p.name, asOf: req.query.asOf, accounts: rows });
    },
  });

  r.get('/api/v1/partners/next-code', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Gợi ý mã đối tượng mới theo nhóm (dãy mã đông nhất của nhóm + 1)', querystring: z.object({ groupCode: z.string().trim().max(64).optional(), kind: z.enum(KINDS).optional() }) },
    handler: async (req) => ok(await suggestPartnerCode(db, authOf(req).tenantId, req.query)),
  });

  r.get('/api/v1/partners/tax-lookup/:taxCode', {
    preHandler: requirePermission('catalog:read'),
    schema: {
      tags, summary: 'Tra cứu doanh nghiệp theo mã số thuế (tên, địa chỉ, tên viết tắt, người đại diện, trạng thái) để điền sẵn form; kèm đối tượng đã dùng MST này',
      params: z.object({ taxCode: z.string().trim().min(1).max(32) }),
    },
    handler: async (req) => ok(await corePort('lookupTaxCode')(authOf(req).tenantId, req.params.taxCode)),
  });
  r.get('/api/v1/partners/lookup', {
    preHandler: requirePermission('catalog:read'),
    schema: {
      tags, summary: 'Đối tượng đã dùng số điện thoại / mã số thuế (kiểm trùng khi tạo mới)',
      querystring: z.object({ phone: z.string().trim().max(64).optional(), taxCode: z.string().trim().max(64).optional(), exclude: z.string().trim().max(64).optional() }),
    },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const { phone, taxCode, exclude } = req.query;
      if (!phone && !taxCode) return ok([]);
      let q = db.selectFrom('partners').selectAll().where('tenant_id', '=', tenantId);
      q = q.where((eb) => eb.or([
        ...(phone ? [eb('mobile', '=', phone), eb('phone', '=', phone)] : []),
        ...(taxCode ? [eb('tax_code', '=', taxCode)] : []),
      ]));
      if (exclude) q = q.where('code', '<>', exclude);
      const rows = await q.orderBy('code').limit(5).execute();
      return ok(rows.map(toPartnerDto));
    },
  });

  r.get('/api/v1/partner-groups', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Nhóm đối tượng' },
    handler: async (req) => {
      const auth = authOf(req);
      const rows = await db
        .selectFrom('partner_groups as g')
        .leftJoin(
          (eb) => eb.selectFrom('partners').select(['group_code', (x) => x.fn.countAll<string>().as('n')]).where('tenant_id', '=', auth.tenantId).groupBy('group_code').as('c'),
          (j) => j.onRef('c.group_code', '=', 'g.code'),
        )
        .select(['g.code', 'g.name', 'g.parent_code', 'g.kind', 'g.note', 'g.is_active', 'c.n'])
        .where('g.tenant_id', '=', auth.tenantId)
        .orderBy('g.code')
        .execute();
      return ok(rows.map((g) => ({ code: g.code, name: g.name, parentCode: g.parent_code, kind: g.kind, note: g.note, isActive: g.is_active, partners: Number(g.n ?? 0) })));
    },
  });

  mountActions(app, partnerActions);
}
