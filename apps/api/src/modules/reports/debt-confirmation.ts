// @bizcity-layer D modules/ke-toan
/**
 * Biên bản đối chiếu công nợ (CN07, KT-18).
 *   GET /api/v1/reports/debt-confirmation?from=&to=&account=&partnerCodes=&detail=
 *
 * Mỗi đối tác: thông tin (tên, MST, địa chỉ, điện thoại, người đại diện), từng tài khoản công nợ có số liệu
 * (dư đầu kỳ, phát sinh Nợ, phát sinh Có, dư cuối kỳ — dương = đối tác nợ mình), số còn nợ cuối kỳ (cộng mọi tài khoản),
 * và (detail=true) chi tiết chứng từ phát sinh trong kỳ theo từng tài khoản. Số lấy từ sổ tổng hợp / sổ chi tiết công nợ.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { fromCents, toCents } from '@ketoan/contracts';
import { db } from '../../db/client.js';
import { authOf, requirePermission, type AuthContext } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { reportService } from './report.service.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const queryBool = z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])]).transform((v) => v === true || v === 'true' || v === '1').default(false);

interface AccountPart { accountCode: string; accountName: string; opening: number; debit: number; credit: number; closing: number; lines?: { date: string; docNo: string; invoiceNo: string; description: string; debit: number; credit: number }[] }

export async function debtConfirmation(auth: AuthContext, q: { from: string; to: string; account: string; partnerCodes?: string[]; detail: boolean }) {
  const bal = await reportService.partnerBalances(auth, { account: q.account, from: q.from, to: q.to });
  const wanted = q.partnerCodes?.length ? new Set(q.partnerCodes) : null;
  const rows = bal.rows.filter((r) => r.partnerCode && (!wanted || wanted.has(r.partnerCode)));
  const codes = [...new Set(rows.map((r) => r.partnerCode))];
  if (q.detail && codes.length > 200) throw Errors.validation('In chi tiết tối đa 200 đối tác một lần; chọn bớt đối tác');
  const [partners, accounts, tenant] = await Promise.all([
    codes.length ? db.selectFrom('partners').select(['code', 'name', 'tax_code', 'address', 'phone', 'contact_name']).where('tenant_id', '=', auth.tenantId).where('code', 'in', codes).execute() : [],
    db.selectFrom('accounts').select(['code', 'name']).where('tenant_id', '=', auth.tenantId).execute(),
    db.selectFrom('tenants').select(['name', 'tax_code', 'address', 'phone']).where('id', '=', auth.tenantId).executeTakeFirstOrThrow(),
  ]);
  const accName = new Map(accounts.map((a) => [a.code, a.name]));
  const out = [];
  for (const p of partners.sort((a, b) => a.code.localeCompare(b.code))) {
    const parts: AccountPart[] = [];
    for (const r of rows.filter((x) => x.partnerCode === p.code)) {
      const part: AccountPart = {
        accountCode: r.accountCode, accountName: accName.get(r.accountCode) ?? '',
        opening: fromCents(toCents(r.openingDebit) - toCents(r.openingCredit)), debit: r.debit, credit: r.credit,
        closing: fromCents(toCents(r.closingDebit) - toCents(r.closingCredit)),
      };
      if (q.detail && (r.debit || r.credit)) {
        const led = await reportService.accountLedger(auth, { account: r.accountCode, from: q.from, to: q.to, partnerCode: p.code, kind: 'partner' });
        part.lines = led.rows.map((l) => ({ date: l.postingDate, docNo: l.docNo, invoiceNo: l.invoiceNo ?? '', description: l.description ?? '', debit: l.debit, credit: l.credit }));
      }
      parts.push(part);
    }
    const sum = (k: 'opening' | 'debit' | 'credit' | 'closing') => fromCents(parts.reduce((s, x) => s + toCents(x[k]), 0));
    out.push({
      partner: { code: p.code, name: p.name, taxCode: p.tax_code ?? '', address: p.address ?? '', phone: p.phone ?? '', contactName: p.contact_name ?? '' },
      accounts: parts, opening: sum('opening'), debit: sum('debit'), credit: sum('credit'), closing: sum('closing'),
    });
  }
  return { company: { name: tenant.name, taxCode: tenant.tax_code ?? '', address: tenant.address ?? '', phone: tenant.phone ?? '' }, from: q.from, to: q.to, partners: out };
}

export async function debtConfirmationRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/reports/debt-confirmation', {
    preHandler: requirePermission('reports:read'),
    schema: {
      tags: ['Báo cáo'],
      summary: 'Biên bản đối chiếu công nợ theo đối tác',
      querystring: z.object({
        from: day, to: day,
        account: z.string().default('*').transform((s) => (s.trim() === '*' ? '' : s.trim())).describe('Đầu số tài khoản (131, 331…); * = mọi tài khoản theo dõi đối tượng'),
        partnerCodes: z.string().optional().transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined)).describe('Mã đối tác cách nhau dấu phẩy; trống = mọi đối tác có số liệu'),
        detail: queryBool.describe('Kèm chi tiết chứng từ phát sinh trong kỳ'),
      }),
    },
    handler: async (req) => ok(await debtConfirmation(authOf(req), req.query)),
  });
}
