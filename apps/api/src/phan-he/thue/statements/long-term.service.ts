// @bizcity-layer D modules/thue
/**
 * Phân loại dài hạn: phần số dư phải thu, phải trả, vay… có thời hạn còn lại trên 12 tháng tại ngày lập
 * Báo cáo tình hình tài chính. Kế toán khai theo (ngày, tài khoản, đối tượng); báo cáo chuyển số này
 * từ chỉ tiêu ngắn hạn sang chỉ tiêu dài hạn tương ứng (xem TERM_MAP ở balance-sheet.ts).
 * Lưu kiểu "thay cả danh sách của một ngày": gửi lại toàn bộ dòng của ngày đó.
 */
import { fromCents, toCents } from '@ketoan/contracts';
import { sql } from 'kysely';
import { db, toNumber } from '../../../db/client.js';
import { Errors } from '../../../core/errors.js';
import { writeAudit } from '../../../core/audit.js';
import type { AuthContext } from '../../../core/auth.js';
import { TERM_MAP, termRuleFor } from '../../../modules/reports/balance-sheet.js';

export interface LongTermLine { accountCode: string; partnerCode?: string | null; amount: number; note?: string }

export const longTermService = {
  rules: () => TERM_MAP.map((r) => ({ prefix: r.prefix, label: r.label, asset: r.asset ?? null, liability: r.liability ?? null })),

  /** Dòng đã khai tại một ngày, kèm số dư thực tế của tài khoản / đối tượng tại ngày đó để đối chiếu. */
  async list(auth: AuthContext, q: { asOf: string }) {
    const res = await sql<{ account_code: string; partner_code: string | null; partner_name: string | null; amount: string; note: string; account_name: string | null; balance: string }>`
      SELECT l.account_code, p.code AS partner_code, p.name AS partner_name, l.amount, l.note, ac.name AS account_name,
             COALESCE((SELECT SUM(g.debit - g.credit) FROM ledger_balances_daily g
                        WHERE g.tenant_id = l.tenant_id AND g.posting_date <= l.as_of
                          AND g.account_code LIKE l.account_code || '%'
                          AND (l.partner_id IS NULL OR g.partner_id = l.partner_id)), 0) AS balance
        FROM long_term_balances l
        LEFT JOIN partners p ON p.id = l.partner_id
        LEFT JOIN accounts ac ON ac.tenant_id = l.tenant_id AND ac.code = l.account_code
       WHERE l.tenant_id = ${auth.tenantId} AND l.as_of = ${q.asOf}::date
       ORDER BY l.account_code, p.code NULLS FIRST`.execute(db);
    const dates = await sql<{ as_of: string; n: string }>`
      SELECT as_of::text, COUNT(*) AS n FROM long_term_balances WHERE tenant_id = ${auth.tenantId} GROUP BY as_of ORDER BY as_of DESC LIMIT 24`.execute(db);
    return {
      asOf: q.asOf,
      rows: res.rows.map((r) => {
        const rule = termRuleFor(r.account_code);
        const net = toNumber(r.balance);
        return {
          accountCode: r.account_code, accountName: r.account_name ?? '', partnerCode: r.partner_code, partnerName: r.partner_name, amount: toNumber(r.amount), note: r.note,
          balance: fromCents(toCents(Math.abs(net))), balanceSide: net >= 0 ? 'Nợ' : 'Có', rule: rule?.label ?? '',
        };
      }),
      savedDates: dates.rows.map((d) => ({ asOf: d.as_of, lines: Number(d.n) })),
    };
  },

  async save(auth: AuthContext, q: { asOf: string; lines: LongTermLine[] }) {
    return db.transaction().execute(async (trx) => {
      const problems: string[] = [];
      const partnerCodes = [...new Set(q.lines.map((l) => l.partnerCode).filter((c): c is string => Boolean(c)))];
      const partners = partnerCodes.length ? await trx.selectFrom('partners').select(['id', 'code']).where('tenant_id', '=', auth.tenantId).where('code', 'in', partnerCodes).execute() : [];
      const pmap = new Map(partners.map((p) => [p.code, p.id]));
      const seen = new Set<string>();
      const rows = q.lines.map((l, i) => {
        const n = i + 1;
        if (!termRuleFor(l.accountCode)) problems.push(`Dòng ${n}: tài khoản ${l.accountCode} không thuộc nhóm có phần dài hạn trên B01`);
        if (l.accountCode.startsWith('34112')) problems.push(`Dòng ${n}: 34112 (vay dài hạn) đã tự lên chỉ tiêu dài hạn, không cần khai`);
        if (l.partnerCode && !pmap.has(l.partnerCode)) problems.push(`Dòng ${n}: đối tượng ${l.partnerCode} không có trong danh mục`);
        if (!(l.amount > 0)) problems.push(`Dòng ${n}: số tiền dài hạn phải lớn hơn 0`);
        const key = `${l.accountCode}|${l.partnerCode ?? ''}`;
        if (seen.has(key)) problems.push(`Dòng ${n}: trùng tài khoản và đối tượng với dòng khác`);
        seen.add(key);
        return { tenant_id: auth.tenantId, as_of: q.asOf, account_code: l.accountCode, partner_id: l.partnerCode ? pmap.get(l.partnerCode) ?? null : null, amount: l.amount, note: l.note ?? '' };
      });
      if (problems.length) throw Errors.validation('Phân loại dài hạn chưa đúng', problems);
      await trx.deleteFrom('long_term_balances').where('tenant_id', '=', auth.tenantId).where('as_of', '=', q.asOf).execute();
      if (rows.length) await trx.insertInto('long_term_balances').values(rows).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'long_term.save', objectType: 'long_term_balances', objectId: q.asOf, after: q.lines });
      return { asOf: q.asOf, lines: rows.length };
    });
  },
};
