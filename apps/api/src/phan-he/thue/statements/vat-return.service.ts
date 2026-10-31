// @bizcity-layer D modules/thue
// [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7): đọc sổ qua khung nhìn bizcity_read.* thay bảng ledger_* (SC-KERNEL-7)
/**
 * Tờ khai thuế GTGT theo phương pháp khấu trừ (mẫu 01/GTGT; từ 01/7/2026 theo Thông tư 89/2026/TT-BTC, trước đó
 * Thông tư 80/2021/TT-BTC — các chỉ tiêu dưới đây giữ mã số chung của hai mẫu, thêm [32b], [34a] của mẫu mới).
 *
 * Lấy số từ sổ hoá đơn (tax_invoices + tax_invoice_lines, bỏ hoá đơn đã huỷ; hàng trả lại / điều chỉnh giảm ghi âm):
 *   [23] [24]  giá trị và thuế GTGT hàng hoá, dịch vụ mua vào (mọi hoá đơn đầu vào)
 *   [25]       thuế GTGT được khấu trừ = [24] trừ thuế của hoá đơn đã đánh dấu không đủ điều kiện khấu trừ
 *              (màn Bổ sung thông tin thuế); kế toán vẫn sửa tay được
 * Hoá đơn xếp vào kỳ theo kỳ kê khai (nếu kế toán chọn ở màn Bổ sung thông tin thuế), không thì theo ngày hoá đơn.
 *   [26]       bán ra không chịu thuế (KCT)
 *   [29]       bán ra thuế suất 0%;  [30] [31] 5%;  [32] [33] 10% — gồm cả hàng giảm thuế còn 8% (doanh thu và
 *              thuế 8% kê ở dòng 10%, kèm phụ lục giảm thuế theo Nghị định 174/2025/NĐ-CP)
 *   [32a]      hàng hoá, dịch vụ không phải kê khai, tính nộp thuế GTGT (nhóm báo cáo khác các nhóm trên)
 *   [27] = [29]+[30]+[32]+[32a]−[32b];  [28] = [31]+[33];  [34] = [26]+[27]+[34a];  [35] = [28];  [36] = [35]−[25]
 *   [40a] = max([36]−[22]+[37]−[38]−[39a], 0);  [40] = [40a]−[40b];  [41] = max(−([36]−[22]+[37]−[38]−[39a]), 0);  [43] = [41]−[42]
 * Kế toán nhập tay: [21], [22] (ngầm định = [43] của tờ khai kỳ trước đã lưu), [23a] [24a] (nhập khẩu), [32b], [34a],
 * [37], [38], [39a], [40b], [42], và có thể sửa [25].
 * Kèm theo: phụ lục hàng giảm thuế 8%, danh sách hoá đơn mua vào từ 5 triệu đồng cần kiểm tra chứng từ thanh toán
 * không dùng tiền mặt, đối chiếu với sổ cái (1331, 33311).
 */
import { sql } from 'kysely';
import { db, toNumber } from '../../../db/client.js';
import { Errors } from '../../../core/errors.js';
import { writeAudit } from '../../../core/audit.js';
import type { AuthContext } from '../../../core/auth.js';

export type PeriodKind = 'month' | 'quarter';
export const MANUAL_KEYS = ['21', '22', '23a', '24a', '25', '32b', '34a', '37', '38', '39a', '40b', '42'] as const;
export type ManualKey = (typeof MANUAL_KEYS)[number];

/** Dòng in trên tờ khai: chỉ tiêu, mã giá trị, mã thuế (theo bố cục mẫu 01/GTGT). */
export const VAT_FORM: { stt: string; name: string; value?: string; tax?: string; bold?: boolean }[] = [
  { stt: 'A', name: 'Không phát sinh hoạt động mua, bán trong kỳ (đánh dấu "X")', value: '21', bold: true },
  { stt: 'B', name: 'Thuế GTGT còn được khấu trừ kỳ trước chuyển sang', tax: '22', bold: true },
  { stt: 'C', name: 'Kê khai thuế GTGT phải nộp Ngân sách nhà nước', bold: true },
  { stt: 'I', name: 'Hàng hoá, dịch vụ mua vào trong kỳ', bold: true },
  { stt: '1', name: 'Giá trị và thuế GTGT của hàng hoá, dịch vụ mua vào', value: '23', tax: '24' },
  { stt: '', name: 'Trong đó: hàng hoá, dịch vụ nhập khẩu', value: '23a', tax: '24a' },
  { stt: '2', name: 'Thuế GTGT của hàng hoá, dịch vụ mua vào được khấu trừ kỳ này', tax: '25' },
  { stt: 'II', name: 'Hàng hoá, dịch vụ bán ra trong kỳ', bold: true },
  { stt: '1', name: 'Hàng hoá, dịch vụ bán ra không chịu thuế GTGT', value: '26' },
  { stt: '2', name: 'Hàng hoá, dịch vụ bán ra chịu thuế GTGT ([27] = [29]+[30]+[32]+[32a]−[32b]; [28] = [31]+[33])', value: '27', tax: '28' },
  { stt: 'a', name: 'Hàng hoá, dịch vụ bán ra chịu thuế suất 0%', value: '29' },
  { stt: 'b', name: 'Hàng hoá, dịch vụ bán ra chịu thuế suất 5%', value: '30', tax: '31' },
  { stt: 'c', name: 'Hàng hoá, dịch vụ bán ra chịu thuế suất 10% (gồm hàng giảm thuế còn 8%)', value: '32', tax: '33' },
  { stt: 'd', name: 'Hàng hoá, dịch vụ bán ra không phải kê khai, tính nộp thuế GTGT', value: '32a' },
  { stt: 'đ', name: 'Hàng hoá, dịch vụ bán ra không tính vào giá tính thuế GTGT', value: '32b' },
  { stt: '3', name: 'Hàng hoá, dịch vụ bán ra không thuộc phạm vi điều chỉnh của pháp luật thuế GTGT', value: '34a' },
  { stt: '4', name: 'Tổng doanh thu và thuế GTGT của hàng hoá, dịch vụ bán ra ([34] = [26]+[27]+[34a]; [35] = [28])', value: '34', tax: '35' },
  { stt: 'III', name: 'Thuế GTGT phát sinh trong kỳ ([36] = [35] − [25])', tax: '36', bold: true },
  { stt: 'IV', name: 'Điều chỉnh tăng, giảm thuế GTGT còn được khấu trừ của các kỳ trước', bold: true },
  { stt: '1', name: 'Điều chỉnh giảm', tax: '37' },
  { stt: '2', name: 'Điều chỉnh tăng', tax: '38' },
  { stt: 'V', name: 'Thuế GTGT nhận bàn giao được khấu trừ trong kỳ', tax: '39a', bold: true },
  { stt: 'VI', name: 'Xác định nghĩa vụ thuế GTGT phải nộp trong kỳ', bold: true },
  { stt: '1', name: 'Thuế GTGT phải nộp của hoạt động sản xuất kinh doanh trong kỳ ([40a] = [36]−[22]+[37]−[38]−[39a] ≥ 0)', tax: '40a' },
  { stt: '2', name: 'Thuế GTGT mua vào của dự án đầu tư được bù trừ với thuế GTGT phải nộp', tax: '40b' },
  { stt: '3', name: 'Thuế GTGT còn phải nộp trong kỳ ([40] = [40a] − [40b])', tax: '40', bold: true },
  { stt: '4', name: 'Thuế GTGT chưa khấu trừ hết kỳ này (nếu [36]−[22]+[37]−[38]−[39a] < 0)', tax: '41' },
  { stt: '4.1', name: 'Thuế GTGT đề nghị hoàn', tax: '42' },
  { stt: '4.2', name: 'Thuế GTGT còn được khấu trừ chuyển kỳ sau ([43] = [41] − [42])', tax: '43', bold: true },
];

export function periodRange(kind: PeriodKind, year: number, period: number) {
  if (kind === 'quarter' && (period < 1 || period > 4)) throw Errors.validation('Quý từ 1 đến 4');
  const startMonth = kind === 'month' ? period : (period - 1) * 3 + 1;
  const endMonth = kind === 'month' ? period : startMonth + 2;
  const from = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const to = new Date(Date.UTC(year, endMonth, 0)).toISOString().slice(0, 10);
  return { from, to, label: kind === 'month' ? `Tháng ${String(period).padStart(2, '0')}/${year}` : `Quý ${period}/${year}` };
}

/**
 * Hạn nộp tờ khai, tiền thuế: khai tháng — ngày 20 tháng sau; khai quý — ngày cuối của tháng đầu quý sau
 * (Luật Quản lý thuế 38/2019/QH14, Điều 44). Hạn rơi vào thứ bảy, chủ nhật thì lùi sang thứ hai
 * (ngày nghỉ lễ chưa tính: kế toán tự kiểm tra).
 */
export function filingDeadline(kind: PeriodKind, year: number, period: number): string {
  const d = new Date(kind === 'month' ? Date.UTC(year, period, 20) : Date.UTC(year, period * 3 + 1, 0));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Tỷ lệ tiền chậm nộp mỗi ngày (Luật Quản lý thuế, Điều 59): 0,03%. */
export const LATE_RATE = 0.0003;

/**
 * Số ngày chậm nộp: từ ngày kế tiếp hạn nộp đến ngày liền trước ngày nộp tiền.
 * Ví dụ hạn 20/10, nộp 25/10 → chậm từ 21/10 đến 24/10 = 4 ngày.
 */
export function lateDays(deadline: string, payDate: string): number {
  return Math.max(0, Math.round((Date.parse(payDate) - Date.parse(deadline)) / 86_400_000) - 1);
}

/** Các chỉ tiêu số tiền của tờ khai (theo thứ tự in). */
const FORM_CODES = VAT_FORM.flatMap((l) => [l.value, l.tax]).filter((k): k is string => Boolean(k) && k !== '21');

/** Bản giải trình khai bổ sung (01/KHBS): so số đã khai với số khai lại. */
export function buildSupplement(a: { kind: PeriodKind; year: number; period: number; declared: Record<string, number>; adjusted: Record<string, number>; payDate: string }) {
  const name = (k: string) => VAT_FORM.find((l) => l.value === k || l.tax === k)?.name ?? '';
  const rows = FORM_CODES.map((code) => {
    const declared = Math.round(a.declared[code] ?? 0);
    const adjusted = Math.round(a.adjusted[code] ?? 0);
    return { code, name: name(code), declared, adjusted, diff: adjusted - declared };
  }).filter((r) => r.diff !== 0);
  const payableDiff = Math.round((a.adjusted['40'] ?? 0) - (a.declared['40'] ?? 0));
  const carriedDiff = Math.round((a.adjusted['43'] ?? 0) - (a.declared['43'] ?? 0));
  const deadline = filingDeadline(a.kind, a.year, a.period);
  const days = payableDiff > 0 ? lateDays(deadline, a.payDate) : 0;
  return {
    rows,
    payableIncrease: Math.max(payableDiff, 0),
    payableDecrease: Math.max(-payableDiff, 0),
    carriedDiff,
    deadline,
    payDate: a.payDate,
    lateDays: days,
    lateRate: LATE_RATE,
    lateInterest: Math.round(Math.max(payableDiff, 0) * LATE_RATE * days),
  };
}

const prevPeriod = (kind: PeriodKind, year: number, period: number) =>
  period > 1 ? { year, period: period - 1 } : { year: year - 1, period: kind === 'month' ? 12 : 4 };

/** Tính các chỉ tiêu (đồng, đã làm tròn) từ số liệu hoá đơn và phần nhập tay. */
export function computeForm(auto: Record<string, number>, manual: Partial<Record<ManualKey, number>>): Record<string, number> {
  const v: Record<string, number> = { ...auto };
  for (const k of MANUAL_KEYS) if (manual[k] !== undefined && manual[k] !== null) v[k] = Number(manual[k]);
  for (const k of ['21', '22', '23a', '24a', '32b', '34a', '37', '38', '39a', '40b', '42']) v[k] = v[k] ?? 0;
  if (manual['25'] === undefined || manual['25'] === null) v['25'] = auto['25'] ?? v['24'] ?? 0;
  const g = (k: string) => v[k] ?? 0;
  v['27'] = g('29') + g('30') + g('32') + g('32a') - g('32b');
  v['28'] = g('31') + g('33');
  v['34'] = g('26') + g('27') + g('34a');
  v['35'] = g('28');
  v['36'] = g('35') - g('25');
  const x = g('36') - g('22') + g('37') - g('38') - g('39a');
  v['40a'] = Math.max(x, 0);
  v['40'] = g('40a') - g('40b');
  v['41'] = Math.max(-x, 0);
  v['43'] = g('41') - g('42');
  for (const k of Object.keys(v)) v[k] = Math.round(v[k] ?? 0);
  return v;
}

async function branchIdsOf(auth: AuthContext, codes?: string[]) {
  if (!codes?.length) return null;
  const rows = await db.selectFrom('branches').select('id').where('tenant_id', '=', auth.tenantId).where('code', 'in', codes).execute();
  if (!rows.length) throw Errors.validation('Chi nhánh không tồn tại');
  return rows.map((r) => r.id);
}

export const vatReturnService = {
  form: () => VAT_FORM,

  async build(auth: AuthContext, q: { periodKind: PeriodKind; year: number; period: number; branchCodes?: string[] }) {
    const { from, to, label } = periodRange(q.periodKind, q.year, q.period);
    const scope = (q.branchCodes ?? []).slice().sort().join(',');
    const branchIds = await branchIdsOf(auth, q.branchCodes);
    const branchFilter = branchIds ? sql`AND i.branch_id = ANY(${branchIds}::bigint[])` : sql``;

    const groups = await sql<{ direction: string; report_group: string; rate: string; amount: string; tax: string; invoices: string; blocked: string }>`
      SELECT i.direction, l.report_group, l.tax_rate AS rate,
             SUM(l.amount_before_tax * i.sign) AS amount, SUM(l.tax_amount * i.sign) AS tax, COUNT(DISTINCT i.id) AS invoices,
             SUM(CASE WHEN i.deductible THEN 0 ELSE l.tax_amount * i.sign END) AS blocked
        FROM tax_invoices i JOIN tax_invoice_lines l ON l.tax_invoice_id = i.id
       WHERE i.tenant_id = ${auth.tenantId} AND i.status <> 'cancelled' AND i.period_date BETWEEN ${from}::date AND ${to}::date ${branchFilter}
       GROUP BY i.direction, l.report_group, l.tax_rate`.execute(db);

    const auto: Record<string, number> = { '23': 0, '24': 0, '25': 0, '26': 0, '29': 0, '30': 0, '31': 0, '32': 0, '33': 0, '32a': 0 };
    const add = (k: string, n: number) => { auto[k] = (auto[k] ?? 0) + n; };
    const breakdown: { direction: string; group: string; rate: number; amount: number; tax: number; invoices: number; line: string }[] = [];
    for (const r of groups.rows) {
      const amount = toNumber(r.amount);
      const tax = toNumber(r.tax);
      const rate = toNumber(r.rate);
      let line = '';
      if (r.direction === 'input') { add('23', amount); add('24', tax); add('25', tax - toNumber(r.blocked)); line = '[23] [24]'; }
      else if (r.report_group === 'KCT') { add('26', amount); line = '[26]'; }
      else if (r.report_group === '0' || (rate === 0 && /^\d+$/.test(r.report_group))) { add('29', amount); line = '[29]'; }
      else if (rate === 5) { add('30', amount); add('31', tax); line = '[30] [31]'; }
      else if (rate === 8 || rate === 10) { add('32', amount); add('33', tax); line = '[32] [33]'; }
      else { add('32a', amount); line = '[32a]'; }
      breakdown.push({ direction: r.direction, group: r.report_group, rate, amount, tax, invoices: Number(r.invoices), line });
    }
    for (const k of Object.keys(auto)) auto[k] = Math.round(auto[k] ?? 0);

    // Phụ lục hàng giảm thuế 8% (bán ra): giá trị chưa thuế, thuế 8%, số thuế được giảm = 2% giá trị.
    const reduced = await sql<{ name: string; amount: string; tax: string }>`
      SELECT COALESCE(NULLIF(l.name, ''), NULLIF(l.sku, ''), '(không tên)') AS name, SUM(l.amount_before_tax * i.sign) AS amount, SUM(l.tax_amount * i.sign) AS tax
        FROM tax_invoices i JOIN tax_invoice_lines l ON l.tax_invoice_id = i.id
       WHERE i.tenant_id = ${auth.tenantId} AND i.status <> 'cancelled' AND i.direction = 'output' AND l.tax_rate = 8
         AND i.period_date BETWEEN ${from}::date AND ${to}::date ${branchFilter}
       GROUP BY 1 ORDER BY 2 DESC`.execute(db);
    const reducedRows = reduced.rows.map((r) => {
      const amount = Math.round(toNumber(r.amount));
      return { name: r.name, amount, rateBefore: 10, rateAfter: 8, tax: Math.round(toNumber(r.tax)), reducedTax: Math.round(amount * 0.02) };
    });

    // Hoá đơn mua vào từ 5 triệu đồng (đã có thuế): khấu trừ cần chứng từ thanh toán không dùng tiền mặt.
    const big = await sql<{ event_id: string; invoice_no: string; invoice_serial: string; invoice_date: string; buyer_name: string; buyer_tax_code: string; doc_no: string; total: string; tax: string; branch_code: string; deductible: boolean; payment_ref: string }>`
      SELECT i.event_id, i.invoice_no, i.invoice_serial, i.invoice_date::text, i.buyer_name, i.buyer_tax_code, i.doc_no, (i.total_before_tax + i.total_tax) AS total, i.total_tax AS tax, b.code AS branch_code,
             i.deductible, i.payment_ref
        FROM tax_invoices i JOIN branches b ON b.id = i.branch_id
       WHERE i.tenant_id = ${auth.tenantId} AND i.status <> 'cancelled' AND i.direction = 'input' AND i.sign > 0
         AND i.period_date BETWEEN ${from}::date AND ${to}::date ${branchFilter}
         AND (i.total_before_tax + i.total_tax) >= 5000000
       ORDER BY i.invoice_date, i.invoice_no`.execute(db);

    // Đối chiếu sổ cái: phát sinh Nợ 133 và phát sinh Có 33311 trong kỳ.
    const glFilter = branchIds ? sql`AND g.branch_id = ANY(${branchIds}::bigint[])` : sql``;
    const gl = await sql<{ input: string; output: string; carried: string }>`
      SELECT COALESCE(SUM(CASE WHEN g.account_code LIKE '133%' AND g.posting_date >= ${from}::date THEN g.debit - g.credit END), 0) AS input,
             COALESCE(SUM(CASE WHEN g.account_code LIKE '33311%' AND g.posting_date >= ${from}::date THEN g.credit - g.debit END), 0) AS output,
             COALESCE(SUM(CASE WHEN g.account_code LIKE '133%' AND g.posting_date < ${from}::date THEN g.debit - g.credit END), 0) AS carried
        FROM bizcity_read.ledger_balances_daily g
       WHERE g.tenant_id = ${auth.tenantId} AND g.posting_date <= ${to}::date ${glFilter}`.execute(db);
    const ledger = { input: Math.round(toNumber(gl.rows[0]?.input)), output: Math.round(toNumber(gl.rows[0]?.output)), carried: Math.max(Math.round(toNumber(gl.rows[0]?.carried)), 0) };

    // Mỗi kỳ có thể có tờ khai lần đầu và các lần bổ sung: dùng lần mới nhất.
    const revisions = await db.selectFrom('vat_returns').selectAll().where('tenant_id', '=', auth.tenantId).where('period_kind', '=', q.periodKind).where('year', '=', q.year).where('period', '=', q.period).where('scope', '=', scope).orderBy('revision', 'desc').execute();
    const saved = revisions[0];
    const prev = prevPeriod(q.periodKind, q.year, q.period);
    const prevSaved = await db.selectFrom('vat_returns').select(['values', 'status']).where('tenant_id', '=', auth.tenantId).where('period_kind', '=', q.periodKind).where('year', '=', prev.year).where('period', '=', prev.period).where('scope', '=', scope).orderBy('revision', 'desc').executeTakeFirst();

    const manual: Partial<Record<ManualKey, number>> = { ...(saved?.manual ?? {}) };
    const suggested22 = prevSaved ? Number(prevSaved.values['43'] ?? 0) : null;
    if (manual['22'] === undefined) manual['22'] = suggested22 ?? 0;
    const values = computeForm(auto, manual);
    return {
      periodKind: q.periodKind, year: q.year, period: q.period, label, from, to, scope,
      values, auto, manual,
      saved: saved ? { status: saved.status, revision: saved.revision, values: saved.values, updatedBy: saved.updated_by, updatedAt: saved.updated_at } : null,
      revisions: revisions.map((r) => ({ revision: r.revision, status: r.status, values: r.values, supplement: r.supplement, updatedBy: r.updated_by, updatedAt: r.updated_at })),
      deadline: filingDeadline(q.periodKind, q.year, q.period),
      previous: prevSaved ? { status: prevSaved.status, carried43: suggested22 } : null,
      breakdown,
      reduced: { rows: reducedRows, totals: { amount: reducedRows.reduce((s, r) => s + r.amount, 0), tax: reducedRows.reduce((s, r) => s + r.tax, 0), reducedTax: reducedRows.reduce((s, r) => s + r.reducedTax, 0) } },
      bigPurchases: big.rows.map((r) => ({ eventId: r.event_id, deductible: r.deductible, paymentRef: r.payment_ref, invoiceNo: r.invoice_no, serial: r.invoice_serial, date: r.invoice_date, seller: r.buyer_name, taxCode: r.buyer_tax_code, docNo: r.doc_no, branchCode: r.branch_code, total: toNumber(r.total), tax: toNumber(r.tax) })),
      ledger: { ...ledger, inputDiff: (values['24'] ?? 0) - ledger.input, outputDiff: (values['28'] ?? 0) - ledger.output },
    };
  },

  async save(auth: AuthContext, q: { periodKind: PeriodKind; year: number; period: number; branchCodes?: string[]; manual: Partial<Record<ManualKey, number>>; status: 'draft' | 'final' }) {
    const built = await this.build(auth, { ...q });
    const values = computeForm(built.auto, q.manual);
    const scope = built.scope;
    return db.transaction().execute(async (trx) => {
      const cur = await trx.selectFrom('vat_returns').select(['id', 'status', 'revision']).where('tenant_id', '=', auth.tenantId).where('period_kind', '=', q.periodKind).where('year', '=', q.year).where('period', '=', q.period).where('scope', '=', scope).orderBy('revision', 'desc').executeTakeFirst();
      const row = { values: JSON.stringify(values), manual: JSON.stringify(q.manual), status: q.status, updated_by: auth.actor, updated_at: new Date() };
      if (cur) await trx.updateTable('vat_returns').set(row).where('id', '=', cur.id).execute();
      else await trx.insertInto('vat_returns').values({ tenant_id: auth.tenantId, period_kind: q.periodKind, year: q.year, period: q.period, scope, ...row }).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'vat_return.save', objectType: 'vat_return', objectId: `${q.periodKind}:${q.year}:${q.period}:${scope}`, after: { values, manual: q.manual, status: q.status } });
      return { values, status: q.status };
    });
  },

  /**
   * Lập tờ khai bổ sung (lần n) cho kỳ đã có tờ khai chính thức: số khai lại tính từ sổ hoá đơn hiện tại cùng phần
   * nhập tay, kèm bản giải trình 01/KHBS và tiền chậm nộp đến ngày nộp dự kiến. dryRun: chỉ tính, không lưu.
   */
  async supplement(auth: AuthContext, q: { periodKind: PeriodKind; year: number; period: number; branchCodes?: string[]; manual: Partial<Record<ManualKey, number>>; payDate: string; dryRun: boolean }) {
    const built = await this.build(auth, { ...q });
    const latest = built.saved;
    if (!latest || latest.status !== 'final') throw Errors.conflict('Kỳ này chưa có tờ khai lưu chính thức: lập và lưu tờ khai lần đầu trước');
    const values = computeForm(built.auto, q.manual);
    const khbs = buildSupplement({ kind: q.periodKind, year: q.year, period: q.period, declared: latest.values, adjusted: values, payDate: q.payDate });
    const revision = latest.revision + 1;
    if (q.dryRun) return { revision, values, supplement: khbs, saved: false };
    if (!khbs.rows.length) throw Errors.conflict('Số khai lại không khác tờ khai đã nộp: không cần khai bổ sung');
    await db.transaction().execute(async (trx) => {
      await trx.insertInto('vat_returns').values({
        tenant_id: auth.tenantId, period_kind: q.periodKind, year: q.year, period: q.period, scope: built.scope, revision, status: 'final',
        values: JSON.stringify(values), manual: JSON.stringify(q.manual), supplement: JSON.stringify(khbs), updated_by: auth.actor, updated_at: new Date(),
      }).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'vat_return.supplement', objectType: 'vat_return', objectId: `${q.periodKind}:${q.year}:${q.period}:${built.scope}:${revision}`, after: { values, supplement: khbs } });
    });
    return { revision, values, supplement: khbs, saved: true };
  },

  async list(auth: AuthContext) {
    const rows = await db.selectFrom('vat_returns').selectAll().where('tenant_id', '=', auth.tenantId).orderBy('year', 'desc').orderBy('period', 'desc').orderBy('revision', 'desc').execute();
    return rows.map((r) => ({
      periodKind: r.period_kind, year: r.year, period: r.period, label: periodRange(r.period_kind as PeriodKind, r.year, r.period).label, scope: r.scope, status: r.status,
      revision: r.revision, lateInterest: Number((r.supplement as { lateInterest?: number } | null)?.lateInterest ?? 0),
      payable: Number(r.values['40'] ?? 0), carried: Number(r.values['43'] ?? 0), outputTax: Number(r.values['35'] ?? 0), deductible: Number(r.values['25'] ?? 0), updatedBy: r.updated_by, updatedAt: r.updated_at,
    }));
  },
};

