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
 *   POST /api/v1/partners/exists      mã nào chưa có (kiểm hàng loạt cho trình nhập Excel)
 *   POST /api/v1/partners/import      nhập Excel (dryRun kiểm từng dòng; ghi chỉ dòng đúng; mode create / update / both) — partner-import.ts
 *   GET /api/v1/partners/:code/balances?asOf=&branchCode=  số dư công nợ của một đối tượng theo từng tài khoản
 *   GET /api/v1/partner-groups        nhóm đối tượng
 *   PUT /api/v1/partner-groups/:code  thêm hoặc sửa nhóm
 *   POST /api/v1/partners/validate   khung Vì sao: nhắc / cảnh báo mềm cho một bản khai báo (chỉ đọc); POST / PUT :code trả meta.findings,
 *                                     nhận warnAck { reason, codes } để ghi nhận cảnh báo mềm (D023-6)
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
import { writeAudit } from '../../core/audit.js';
import { Errors } from '../../core/errors.js';
import type { PartnerInput } from '@ketoan/contracts';
import { partnerRepository, toPartnerDto, type PartnerAccountingInfo } from './partner.repository.js';
import { suggestPartnerCode } from './partner-code.js';
import { importPartners, PARTNER_IMPORT_KEYS } from './partner-import.js';
// [2026-11-03 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-LAYER-2): adapter tra MST qua cổng
import { corePort } from '@bizcity/platform/core/ports';
import { partnerHints } from './partner.hints.js';
import { recordWarnAck } from '@bizcity/platform/core/catalog-warn';
import { WARN_ACK_MIN_REASON } from '@ketoan/contracts';
import { defineAction, mountActions, type AnyActionDef, sameTx } from '@bizcity/platform/core/actions';

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
  mountActions(app, partnerWriteActions);
}

// [2026-11-03 05:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 gộp main (cổng danh mục): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const partnerWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.partner.validate', title: 'Khung Vì sao: kiểm thử một bản khai báo đối tượng (chỉ đọc)', tags,
    permission: 'catalog:read', effect: 'read', idempotency: 'none',
    input: z.object({ code: z.string().trim().min(1).max(64), name: z.string().trim().max(255).optional(), kind: z.enum(KINDS).optional(), alsoKinds: z.array(z.enum(['customer', 'supplier'])).max(2).optional(), taxCode: z.string().trim().max(32).nullish() }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/partners/validate' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      return { findings: await partnerHints(trx, ctx.legacyAuth.tenantId, input) };
    },
  }),
  defineAction({
    id: 'core.partner.create', title: 'Tạo mới đối tượng (mã đã có thì báo trùng, không ghi đè)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: partnerFormBody.extend({ code: z.string().trim().min(1).max(64) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/partners', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'partner' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const { code, warnAck: ack, ...body } = input;
      const { info, rest } = split(body);
      let findings: Awaited<ReturnType<typeof partnerHints>> = [];
      await sameTx(trx, async (trx) => {
        // Hai người tạo cùng mã một lúc: người sau phải thấy mã đã có (upsert bên dưới không được ghi đè).
        await sql`SELECT pg_advisory_xact_lock(hashtext(${`partner:${auth.tenantId}:${code}`}))`.execute(trx);
        const existing = await partnerRepository.findByCode(trx, auth.tenantId, code);
        if (existing) throw Errors.conflict(`Mã ${code} đã có: ${existing.name || '(chưa có tên)'} (${KIND_TEXT[existing.kind] ?? existing.kind}). Bấm "Lấy mã mới" hoặc nhập mã khác.`);
        await assertGroups(trx, auth.tenantId, [info.groupCode]);
        await assertTaxCodeFree(trx, auth.tenantId, code, rest.taxCode);
        await partnerRepository.upsert(trx, auth.tenantId, { ...rest, code } as PartnerInput, info.kind);
        await partnerRepository.updateAccountingInfo(trx, auth.tenantId, code, info);
        await trx.updateTable('partners').set({ created_by: auth.actorName }).where('tenant_id', '=', auth.tenantId).where('code', '=', code).execute();
        findings = await partnerHints(trx, auth.tenantId, { code, name: rest.name, kind: info.kind, alsoKinds: info.alsoKinds, taxCode: rest.taxCode });
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'partner.create', objectType: 'partner', objectId: code, after: input });
        await recordWarnAck(trx, auth, 'partner', code, findings, ack);
      });
      return (Object.assign(ctx.meta, { findings }), toPartnerDto((await partnerRepository.findByCode(trx, auth.tenantId, code))!));
    },
  }),
  defineAction({
    id: 'core.partner.save', title: 'Tạo hoặc cập nhật đối tượng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (partnerFormBody).merge(z.object({ code: z.string().trim().min(1).max(64) })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/partners/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'partner', objectId: (i) => String(i.code) },
    handler: async (ctx, input) => {
      const { code: _code, ...reqBody } = input;
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const { warnAck: ack, ...body } = reqBody;
      const { info, rest } = split(body);
      let findings: Awaited<ReturnType<typeof partnerHints>> = [];
      await sameTx(trx, async (trx) => {
        await assertGroups(trx, auth.tenantId, [info.groupCode]);
        const before = await partnerRepository.findByCode(trx, auth.tenantId, input.code);
        const isNew = !before;
        await assertTaxCodeFree(trx, auth.tenantId, input.code, rest.taxCode, before?.tax_code);
        await partnerRepository.upsert(trx, auth.tenantId, { ...rest, code: input.code } as PartnerInput, info.kind);
        await partnerRepository.updateAccountingInfo(trx, auth.tenantId, input.code, info);
        if (isNew) await trx.updateTable('partners').set({ created_by: auth.actorName }).where('tenant_id', '=', auth.tenantId).where('code', '=', input.code).execute();
        findings = await partnerHints(trx, auth.tenantId, { code: input.code, name: rest.name, kind: info.kind, alsoKinds: info.alsoKinds, taxCode: rest.taxCode });
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'partner.upsert', objectType: 'partner', objectId: input.code, after: reqBody });
        await recordWarnAck(trx, auth, 'partner', input.code, findings, ack);
      });
      return (Object.assign(ctx.meta, { findings }), toPartnerDto((await partnerRepository.findByCode(trx, auth.tenantId, input.code))!));
    },
  }),
  defineAction({
    id: 'core.partner.sync', title: 'Đồng bộ danh mục đối tượng từ hệ thống bán hàng / mua hàng', tags,
    description: 'Tạo mới hoặc cập nhật theo mã. Trường để trống không xoá thông tin cũ. Khoá, hạn thanh toán, hạn mức nợ chỉ cập nhật khi được gửi.',
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ partners: z.array(partnerBody.extend({ code: z.string().trim().min(1).max(64) })).min(1).max(1000) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/partners' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'partner' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      await sameTx(trx, async (trx) => {
        await assertGroups(trx, auth.tenantId, input.partners.map((p) => p.groupCode));
        for (const p of input.partners) {
          const { info, rest } = split(p);
          await partnerRepository.upsert(trx, auth.tenantId, rest as PartnerInput, info.kind);
          await partnerRepository.updateAccountingInfo(trx, auth.tenantId, p.code, info);
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'partner.sync', objectType: 'partner', objectId: `${input.partners.length} đối tượng`, after: { codes: input.partners.map((p) => p.code).slice(0, 50) } });
      });
      return { count: input.partners.length };
    },
  }),
  // [2026-11-11 Nguyễn Văn Thủy] trình nhập Excel (số dư, chứng từ) kiểm mã đối tượng hàng loạt (đóng góp)
  defineAction({
    id: 'core.partner.exists', title: 'Kiểm danh sách mã đối tượng: trả mã chưa có và tên của mã đã có (chỉ đọc)', tags,
    permission: 'catalog:read', effect: 'read', idempotency: 'none',
    input: z.object({ codes: z.array(z.string().trim().max(64)).max(20000) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/partners/exists' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => {
      const codes = [...new Set(input.codes.filter(Boolean))];
      if (!codes.length) return { missing: [], names: {} };
      const rows = await ctx.data.tx.selectFrom('partners').select(['code', 'name']).where('tenant_id', '=', ctx.legacyAuth.tenantId).where('code', 'in', codes).execute();
      const names = Object.fromEntries(rows.map((r) => [r.code, r.name]));
      return { missing: codes.filter((c) => !(c in names)), names };
    },
  }),
  // [2026-11-11 Nguyễn Văn Thủy] nhập Excel đối tượng cho trình nhập dùng chung (đóng góp)
  defineAction({
    id: 'core.partner.import', title: 'Nhập Excel đối tượng: dryRun kiểm tra từng dòng (không ghi); không dryRun thì ghi các dòng đúng, bỏ qua dòng lỗi', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({
      dryRun: z.boolean().default(true),
      mode: z.enum(['create', 'update', 'both']).default('both'),
      rows: z.array(z.object({ row: z.number().int(), ...Object.fromEntries(PARTNER_IMPORT_KEYS.map((k) => [k, z.string().max(1000).optional()])) })).min(1).max(5000),
    }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/partners/import' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'partner' },
    handler: async (ctx, input) => {
      const auth = ctx.legacyAuth;
      return await importPartners(ctx.data.tx, auth.tenantId, auth.actor, auth.actorName, input.rows as never, input.dryRun, input.mode);
    },
  }),
  defineAction({
    id: 'core.partner.delete', title: 'Xoá đối tượng chưa có trên sổ, chứng từ', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string() }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/partners/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'partner', objectId: (i) => String(i.code) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      await sameTx(trx, async (trx) => {
        const before = await partnerRepository.findByCode(trx, auth.tenantId, input.code);
        if (!before) throw Errors.notFound(`đối tượng ${input.code}`);
        const used = await trx.selectFrom('bizcity_read.ledger_lines').select('id').where('tenant_id', '=', auth.tenantId).where('partner_id', '=', before.id).limit(1).executeTakeFirst();
        if (used) throw Errors.conflict(`Đối tượng ${before.code} đã có trên sổ: bỏ tích "Theo dõi" để khoá`);
        // [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G3): module còn dùng đối tượng (masterdata.referenceCheck) → không xoá
        const refs = await referenceChecks(trx, auth.tenantId, { kind: 'partner', code: before.code });
        if (refs.length) throw Errors.conflict(`Đối tượng ${before.code} đang dùng ở ${refs.join('; ')}: bỏ tích "Theo dõi" để khoá`);
        // Còn chứng từ, công nợ, hợp đồng… trỏ tới thì khoá ngoại chặn (báo trùng / đang dùng).
        await trx.deleteFrom('partners').where('id', '=', before.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'partner.delete', objectType: 'partner', objectId: before.code, before });
      });
      return { code: input.code };
    },
  }),
  defineAction({
    id: 'core.partner-group.delete', title: 'Xoá nhóm đối tượng chưa dùng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string() }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/partner-groups/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'partner_group', objectId: (i) => String(i.code) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const code = input.code;
      await sameTx(trx, async (trx) => {
        const before = await trx.selectFrom('partner_groups').selectAll().where('tenant_id', '=', auth.tenantId).where('code', '=', code).executeTakeFirst();
        if (!before) throw Errors.notFound(`nhóm ${code}`);
        const used = await trx.selectFrom('partners').select('code').where('tenant_id', '=', auth.tenantId).where('group_code', '=', code).limit(1).executeTakeFirst()
          ?? await trx.selectFrom('partner_groups').select('code').where('tenant_id', '=', auth.tenantId).where('parent_code', '=', code).limit(1).executeTakeFirst();
        if (used) throw Errors.conflict(`Nhóm ${code} đang dùng (${used.code}): bỏ tích "Đang dùng" để ngừng`);
        await trx.deleteFrom('partner_groups').where('id', '=', before.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'partner_group.delete', objectType: 'partner_group', objectId: code, before });
      });
      return { code };
    },
  }),
  defineAction({
    id: 'core.partner-group.upsert', title: 'Thêm hoặc sửa nhóm đối tượng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (z.object({
        name: z.string().trim().min(1).max(255),
        parentCode: z.string().trim().max(64).optional(),
        kind: z.enum([...KINDS, 'any']).default('any'),
        note: z.string().trim().max(500).default(''),
        isActive: z.boolean().default(true),
      })).merge(z.object({ code: z.string().trim().min(1).max(64) })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/partner-groups/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'partner_group', objectId: (i) => String(i.code) },
    handler: async (ctx, input) => {
      const { code: _code, ...reqBody } = input;
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const { code } = input;
      const b = reqBody;
      if (b.parentCode === code) throw Errors.validation('Nhóm cha không được là chính nó');
      if (b.parentCode) await assertGroups(trx, auth.tenantId, [b.parentCode]);
      const values = { name: b.name, parent_code: b.parentCode || null, kind: b.kind, note: b.note, is_active: b.isActive };
      await sameTx(trx, async (trx) => {
        await trx.insertInto('partner_groups').values({ tenant_id: auth.tenantId, code, ...values }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(values)).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'partner_group.save', objectType: 'partner_group', objectId: code, after: b });
      });
      return { code };
    },
  }),
];
