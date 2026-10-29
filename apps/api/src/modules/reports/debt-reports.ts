/**
 * Báo cáo công nợ theo nhân viên và theo mặt hàng.
 *   - debtByEmployee  Công nợ theo nhân viên (ACC48): số dư, phát sinh của tài khoản công nợ gom theo
 *                     nhân viên phụ trách ghi trên dòng sổ (dims.employee) rồi theo đối tượng.
 *   - debtByItem      Công nợ theo mặt hàng (ACC68): phần còn nợ của từng đối tượng chia về các mặt hàng
 *                     đã tạo ra khoản nợ đó.
 */
import { fromCents, toCents } from '@ketoan/contracts';
import { sql } from 'kysely';
import { db, toNumber } from '../../db/client.js';

interface Scope { tenantId: string; from: string; to: string; branchIds: string[] | null }

/** Tách số dư (Nợ − Có, đơn vị đồng × 100) thành hai cột Dư Nợ / Dư Có. */
const sides = (cents: number) => ({ debit: fromCents(Math.max(cents, 0)), credit: fromCents(Math.max(-cents, 0)) });

/**
 * Công nợ theo nhân viên: đầu kỳ, phát sinh Nợ, phát sinh Có, cuối kỳ của các tài khoản bắt đầu bằng
 * `accountPrefix`, gom theo nhân viên rồi theo đối tượng. Dòng sổ không ghi nhân viên gom vào "(chưa gắn nhân viên)".
 */
export async function debtByEmployee(a: Scope & { accountPrefix: string; employee?: string }) {
  const branchFilter = a.branchIds ? sql`AND l.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const employeeFilter = a.employee === undefined ? sql`` : sql`AND COALESCE(l.dims->>'employee', '') = ${a.employee}`;
  const res = await sql<{ employee: string; partner_id: string | null; opening: string; debit: string; credit: string }>`
    SELECT COALESCE(l.dims->>'employee', '') AS employee, l.partner_id,
           SUM(CASE WHEN l.posting_date < ${a.from}::date THEN l.debit - l.credit ELSE 0 END) AS opening,
           SUM(CASE WHEN l.posting_date >= ${a.from}::date THEN l.debit ELSE 0 END) AS debit,
           SUM(CASE WHEN l.posting_date >= ${a.from}::date THEN l.credit ELSE 0 END) AS credit
      FROM ledger_lines l
     WHERE l.tenant_id = ${a.tenantId}
       AND l.account_code LIKE ${a.accountPrefix + '%'}
       AND l.posting_date <= ${a.to}::date
       ${branchFilter} ${employeeFilter}
     GROUP BY 1, 2`.execute(db);

  const partnerIds = [...new Set(res.rows.map((r) => r.partner_id).filter((x): x is string => Boolean(x)))];
  const [partners, employees] = await Promise.all([
    partnerIds.length ? db.selectFrom('partners').select(['id', 'code', 'name']).where('tenant_id', '=', a.tenantId).where('id', 'in', partnerIds).execute() : [],
    db.selectFrom('dimensions').select(['code', 'name']).where('tenant_id', '=', a.tenantId).where('kind', '=', 'employee').execute(),
  ]);
  const pInfo = new Map(partners.map((p) => [p.id, p]));
  const eName = new Map(employees.map((e) => [e.code, e.name]));

  const rows = res.rows
    .map((r) => {
      const opening = toCents(toNumber(r.opening));
      const debit = toCents(toNumber(r.debit));
      const credit = toCents(toNumber(r.credit));
      const closing = opening + debit - credit;
      if (!opening && !debit && !credit) return null;
      const p = r.partner_id ? pInfo.get(r.partner_id) : undefined;
      return {
        employeeCode: r.employee,
        employeeName: r.employee ? eName.get(r.employee) ?? '' : '(chưa gắn nhân viên)',
        partnerCode: p?.code ?? '',
        partnerName: p?.name ?? '(không theo dõi đối tượng)',
        opening, debit, credit, closing,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((x, y) => (x.employeeCode === y.employeeCode ? x.partnerCode.localeCompare(y.partnerCode) : !x.employeeCode ? 1 : !y.employeeCode ? -1 : x.employeeCode.localeCompare(y.employeeCode)));

  type Sum = { opening: number; debit: number; credit: number; closing: number; partners: number };
  const zero = (): Sum => ({ opening: 0, debit: 0, credit: 0, closing: 0, partners: 0 });
  const byEmployee = new Map<string, Sum & { name: string }>();
  const total = zero();
  for (const r of rows) {
    const s = byEmployee.get(r.employeeCode) ?? { ...zero(), name: r.employeeName };
    for (const k of ['opening', 'debit', 'credit', 'closing'] as const) { s[k] += r[k]; total[k] += r[k]; }
    s.partners += 1;
    total.partners += 1;
    byEmployee.set(r.employeeCode, s);
  }
  const out = (s: Sum) => {
    const o = sides(s.opening);
    const c = sides(s.closing);
    return { openingDebit: o.debit, openingCredit: o.credit, debit: fromCents(s.debit), credit: fromCents(s.credit), closingDebit: c.debit, closingCredit: c.credit };
  };
  return {
    rows: rows.map((r) => ({ employeeCode: r.employeeCode, employeeName: r.employeeName, partnerCode: r.partnerCode, partnerName: r.partnerName, ...out({ ...r, partners: 1 }) })),
    employees: [...byEmployee.entries()].map(([code, s]) => ({ employeeCode: code, employeeName: s.name, partners: s.partners, ...out(s) })),
    totals: out(total),
  };
}

/** Chia `cents` theo tỷ trọng `weights` (phần dư chia cho phần lẻ lớn nhất) để tổng các phần đúng bằng `cents`. */
export function splitCents(cents: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!weights.length) return [];
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? cents : 0));
  const raw = weights.map((w) => (cents * w) / sum);
  const parts = raw.map((x) => Math.trunc(x));
  let rest = cents - parts.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => ({ i, frac: Math.abs(x - Math.trunc(x)) })).sort((p, q) => q.frac - p.frac);
  for (let k = 0; rest !== 0 && order.length; k = (k + 1) % order.length) {
    const step = Math.sign(rest);
    parts[order[k]!.i]! += step;
    rest -= step;
  }
  return parts;
}

/** Mã "mặt hàng" cho phần công nợ không gắn được với dòng hàng (số dư đầu, phiếu kế toán, phí…). */
const OTHER = '';
/** Mã cho phần khách trả thừa / trả trước (dư Có chưa trừ vào khoản nợ nào). */
const ADVANCE = '#advance';

/**
 * Công nợ theo mặt hàng.
 *
 * Mỗi chứng từ làm tăng nợ (bán chịu, mua chịu) được chia về các mặt hàng của nó theo tỷ trọng tiền
 * (tiền hàng + thuế của dòng bán; giá trị nhập của dòng mua). Khoản trả nợ trừ vào khoản nợ CŨ NHẤT trước
 * (nhập trước – trả trước, giống báo cáo tuổi nợ), và trừ về từng mặt hàng theo phần còn nợ của mặt hàng đó.
 * Chỉ tính bút toán đang có hiệu lực (bút toán đã sửa thì tính theo bản đúng hiện tại).
 *
 * Tài khoản phải thu (đầu 1): nợ tăng bên Nợ. Tài khoản phải trả (đầu 3): nợ tăng bên Có.
 */
export async function debtByItem(a: Scope & { accountPrefix: string; partnerCode?: string }) {
  const payable = a.accountPrefix.startsWith('3');
  const branchFilter = a.branchIds ? sql`AND l.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const partnerFilter = a.partnerCode ? sql`AND p.code = ${a.partnerCode}` : sql``;
  const res = await sql<{ partner_id: string | null; partner_code: string | null; partner_name: string | null; group_key: string; event_id: string | null; day: string; doc_no: string; net: string }>`
    SELECT l.partner_id, p.code AS partner_code, p.name AS partner_name,
           COALESCE(e.event_id::text, 'entry:' || e.id::text) AS group_key, e.event_id,
           MIN(l.posting_date)::text AS day, MIN(e.doc_no) AS doc_no, SUM(l.debit - l.credit) AS net
      FROM ledger_lines l
      JOIN ledger_entries e ON e.id = l.entry_id
      LEFT JOIN partners p ON p.id = l.partner_id
     WHERE l.tenant_id = ${a.tenantId}
       AND l.account_code LIKE ${a.accountPrefix + '%'}
       AND l.posting_date <= ${a.to}::date
       AND e.status = 'posted' AND e.reverses_entry_id IS NULL
       ${branchFilter} ${partnerFilter}
     GROUP BY l.partner_id, p.code, p.name, 4, e.event_id
    HAVING SUM(l.debit - l.credit) <> 0
     ORDER BY l.partner_id NULLS FIRST, 6, 4`.execute(db);

  // Thành phần mặt hàng của các chứng từ làm tăng nợ.
  const upEvents = [...new Set(res.rows.filter((r) => r.event_id && (payable ? toNumber(r.net) < 0 : toNumber(r.net) > 0)).map((r) => r.event_id!))];
  const items = new Map<string, { name: string; unit: string }>();
  const weights = new Map<string, Map<string, number>>();
  const addWeight = (ev: string, sku: string, w: number) => {
    const m = weights.get(ev) ?? new Map<string, number>();
    m.set(sku, (m.get(sku) ?? 0) + w);
    weights.set(ev, m);
  };
  for (let i = 0; i < upEvents.length; i += 5000) {
    const chunk = upEvents.slice(i, i + 5000);
    const sales = await db
      .selectFrom('sales_lines')
      .select(['event_id', 'sku', 'name', 'unit', 'amount_before_tax', 'tax_amount'])
      .where('tenant_id', '=', a.tenantId)
      .where('event_id', 'in', chunk)
      .execute();
    for (const s of sales) {
      const w = Math.abs(toNumber(s.amount_before_tax) + toNumber(s.tax_amount));
      if (!w) continue;
      addWeight(s.event_id, s.sku, w);
      if (s.sku && !items.has(s.sku)) items.set(s.sku, { name: s.name, unit: s.unit });
    }
    const missing = chunk.filter((ev) => !weights.has(ev));
    if (missing.length) {
      const moves = await db
        .selectFrom('inventory_movements')
        .select(['event_id', 'sku', 'name', 'unit', 'amount'])
        .where('tenant_id', '=', a.tenantId)
        .where('event_id', 'in', missing)
        .execute();
      for (const m of moves) {
        const w = Math.abs(toNumber(m.amount ?? 0));
        if (!w) continue;
        addWeight(m.event_id, m.sku, w);
        if (m.sku && !items.has(m.sku)) items.set(m.sku, { name: m.name, unit: m.unit });
      }
    }
  }

  // Đi theo thời gian từng đối tượng: ghi lại mọi lần tăng / giảm theo mặt hàng.
  type Acc = { opening: number; up: number; down: number };
  const result = new Map<string, Acc & { partnerCode: string; partnerName: string; sku: string }>();
  const record = (pKey: string, pCode: string, pName: string, sku: string, day: string, kind: 'up' | 'down', cents: number) => {
    if (!cents) return;
    const key = `${pKey}\u0000${sku}`;
    const acc = result.get(key) ?? { partnerCode: pCode, partnerName: pName, sku, opening: 0, up: 0, down: 0 };
    if (day < a.from) acc.opening += kind === 'up' ? cents : -cents;
    else acc[kind] += cents;
    result.set(key, acc);
  };

  let i = 0;
  while (i < res.rows.length) {
    const pid = res.rows[i]!.partner_id;
    const pCode = res.rows[i]!.partner_code ?? '';
    const pName = res.rows[i]!.partner_name ?? '(không theo dõi đối tượng)';
    const pKey = pid ?? '';
    const queue: { items: Map<string, number> }[] = [];
    let advance = 0;
    for (; i < res.rows.length && res.rows[i]!.partner_id === pid; i += 1) {
      const r = res.rows[i]!;
      const amount = toCents(toNumber(r.net)) * (payable ? -1 : 1);
      if (amount > 0) {
        // Khoản nợ mới: chia về mặt hàng theo tỷ trọng tiền của chứng từ.
        const w = r.event_id ? weights.get(r.event_id) : undefined;
        const skus = w ? [...w.keys()] : [OTHER];
        const parts = w ? splitCents(amount, [...w.values()]) : [amount];
        const debt = new Map<string, number>();
        skus.forEach((sku, k) => {
          record(pKey, pCode, pName, sku, r.day, 'up', parts[k]!);
          if (parts[k]) debt.set(sku, (debt.get(sku) ?? 0) + parts[k]!);
        });
        // Đã có tiền trả trước: trừ ngay vào khoản nợ này.
        if (advance > 0) {
          const take = Math.min(advance, amount);
          advance -= take;
          record(pKey, pCode, pName, ADVANCE, r.day, 'up', take);
          consume(debt, take, (sku, c) => record(pKey, pCode, pName, sku, r.day, 'down', c));
        }
        if ([...debt.values()].some((c) => c > 0)) queue.push({ items: debt });
      } else {
        // Khoản trả nợ (hoặc giảm nợ): trừ vào khoản nợ cũ nhất trước.
        let rest = -amount;
        while (rest > 0 && queue.length) {
          const debt = queue[0]!;
          const open = [...debt.items.values()].reduce((s, c) => s + c, 0);
          const take = Math.min(rest, open);
          consume(debt.items, take, (sku, c) => record(pKey, pCode, pName, sku, r.day, 'down', c));
          rest -= take;
          if (take >= open) queue.shift();
        }
        if (rest > 0) {
          advance += rest;
          record(pKey, pCode, pName, ADVANCE, r.day, 'down', rest);
        }
      }
    }
  }

  const rows = [...result.values()]
    .map((r) => {
      const closing = r.opening + r.up - r.down;
      if (!r.opening && !r.up && !r.down) return null;
      const info = items.get(r.sku);
      return {
        partnerCode: r.partnerCode,
        partnerName: r.partnerName,
        sku: r.sku === ADVANCE ? '' : r.sku,
        itemName: r.sku === ADVANCE ? (payable ? '(Trả trước cho người bán)' : '(Khách trả trước, trả thừa)') : r.sku === OTHER ? '(Không theo mặt hàng: số dư đầu, phiếu kế toán…)' : info?.name ?? '',
        unit: info?.unit ?? '',
        opening: fromCents(r.opening),
        increase: fromCents(r.up),
        decrease: fromCents(r.down),
        closing: fromCents(closing),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((x, y) => x.partnerCode.localeCompare(y.partnerCode) || x.sku.localeCompare(y.sku));

  const sum = (k: 'opening' | 'increase' | 'decrease' | 'closing') => fromCents(rows.reduce((s, r) => s + toCents(r[k]), 0));
  return { side: payable ? ('credit' as const) : ('debit' as const), rows, totals: { opening: sum('opening'), increase: sum('increase'), decrease: sum('decrease'), closing: sum('closing') } };
}

/** Trừ `cents` khỏi phần còn nợ của các mặt hàng trong một khoản nợ, theo tỷ trọng phần còn nợ. */
function consume(debt: Map<string, number>, cents: number, onTake: (sku: string, c: number) => void) {
  const skus = [...debt.keys()];
  const open = skus.map((s) => debt.get(s)!);
  const total = open.reduce((s, c) => s + c, 0);
  const parts = cents >= total ? open : splitCents(cents, open).map((p, k) => Math.min(p, open[k]!));
  // Phần làm tròn bị cắt (hiếm): trừ nốt vào mặt hàng còn nợ nhiều nhất.
  let gap = Math.min(cents, total) - parts.reduce((s, c) => s + c, 0);
  while (gap > 0) {
    const k = open.reduce((best, c, j) => (c - parts[j]! > open[best]! - parts[best]! ? j : best), 0);
    const add = Math.min(gap, open[k]! - parts[k]!);
    parts[k]! += add;
    gap -= add;
  }
  skus.forEach((sku, k) => {
    if (!parts[k]) return;
    debt.set(sku, open[k]! - parts[k]!);
    onTake(sku, parts[k]!);
  });
}
