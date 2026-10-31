// @bizcity-layer D modules/thue
// [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7): đọc sổ qua khung nhìn bizcity_read.* thay bảng ledger_* (SC-KERNEL-7)
/**
 * Tờ khai quyết toán thuế thu nhập doanh nghiệp (mẫu 03/TNDN, Thông tư 80/2021/TT-BTC) — phần chỉ tiêu chính.
 *
 * Lấy số:
 *   [A1]  Tổng lợi nhuận kế toán trước thuế = chỉ tiêu 50 của báo cáo kết quả kinh doanh cả năm
 *   [E]   Thuế TNDN đã tạm nộp trong năm: ngầm định = phát sinh Nợ 3334 trong năm trên sổ kế toán
 * Kế toán nhập tay: điều chỉnh tăng [B2]–[B7], điều chỉnh giảm [B9]–[B11], thu nhập từ chuyển nhượng bất động sản
 * [B14], thu nhập miễn thuế [C2], lỗ chuyển [C3a] [C3b], quỹ khoa học công nghệ [C5], thuế suất, miễn giảm
 * [C11]–[C14], thuế từ chuyển nhượng bất động sản [D2], và có thể sửa [E].
 * Công thức:
 *   [B1] = [B2]+…+[B7];  [B8] = [B9]+[B10]+[B11];  [B12] = [A1]+[B1]−[B8];  [B13] = [B12]−[B14]
 *   [C1] = [B13];  [C3] = [C3a]+[C3b];  [C4] = max([C1]−[C2]−[C3], 0);  [C6] = max([C4]−[C5], 0)
 *   [C10] = [C6] × thuế suất;  [C15] = max([C10]−[C11]−[C12]−[C13]−[C14], 0)
 *   [D] = [C15]+[D2];  [G] = [D]−[E] (dương: còn phải nộp; âm: nộp thừa)
 * Tạm nộp 4 quý phải đạt ít nhất 80% số thuế quyết toán (Nghị định 126/2020/NĐ-CP, Điều 8, sửa đổi bởi
 * Nghị định 91/2022/NĐ-CP): phần thiếu tính tiền chậm nộp từ sau hạn nộp quý 4.
 */
import { sql } from 'kysely';
import { db, toNumber } from '../../../db/client.js';
import { Errors } from '../../../core/errors.js';
import { writeAudit } from '../../../core/audit.js';
import type { AuthContext } from '../../../core/auth.js';
import { incomeStatement } from '../../../modules/reports/income-statement.js';

export const CIT_MANUAL_KEYS = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B9', 'B10', 'B11', 'B14', 'C2', 'C3a', 'C3b', 'C5', 'rate', 'C11', 'C12', 'C13', 'C14', 'D2', 'E'] as const;
export type CitManualKey = (typeof CIT_MANUAL_KEYS)[number];

export const CIT_FORM: { code: string; name: string; bold?: boolean; manual?: boolean; percent?: boolean }[] = [
  { code: 'A', name: 'Kết quả kinh doanh ghi nhận theo báo cáo tài chính', bold: true },
  { code: 'A1', name: 'Tổng lợi nhuận kế toán trước thuế thu nhập doanh nghiệp' },
  { code: 'B', name: 'Xác định thu nhập chịu thuế theo Luật thuế thu nhập doanh nghiệp', bold: true },
  { code: 'B1', name: 'Điều chỉnh tăng tổng lợi nhuận trước thuế ([B1] = [B2]+…+[B7])', bold: true },
  { code: 'B2', name: 'Các khoản điều chỉnh tăng doanh thu', manual: true },
  { code: 'B3', name: 'Chi phí của phần doanh thu điều chỉnh giảm', manual: true },
  { code: 'B4', name: 'Chi phí không được trừ khi xác định thu nhập chịu thuế', manual: true },
  { code: 'B5', name: 'Thuế thu nhập đã nộp cho phần thu nhập nhận được ở nước ngoài', manual: true },
  { code: 'B6', name: 'Điều chỉnh tăng lợi nhuận do xác định giá thị trường đối với giao dịch liên kết', manual: true },
  { code: 'B7', name: 'Các khoản điều chỉnh làm tăng lợi nhuận trước thuế khác', manual: true },
  { code: 'B8', name: 'Điều chỉnh giảm tổng lợi nhuận trước thuế ([B8] = [B9]+[B10]+[B11])', bold: true },
  { code: 'B9', name: 'Giảm trừ các khoản doanh thu đã tính thuế năm trước', manual: true },
  { code: 'B10', name: 'Chi phí của phần doanh thu điều chỉnh tăng', manual: true },
  { code: 'B11', name: 'Các khoản điều chỉnh làm giảm lợi nhuận trước thuế khác', manual: true },
  { code: 'B12', name: 'Tổng thu nhập chịu thuế ([B12] = [A1]+[B1]−[B8])', bold: true },
  { code: 'B13', name: 'Thu nhập chịu thuế từ hoạt động sản xuất kinh doanh ([B13] = [B12]−[B14])' },
  { code: 'B14', name: 'Thu nhập chịu thuế từ hoạt động chuyển nhượng bất động sản', manual: true },
  { code: 'C', name: 'Xác định thuế thu nhập doanh nghiệp phải nộp từ hoạt động sản xuất kinh doanh', bold: true },
  { code: 'C1', name: 'Thu nhập chịu thuế ([C1] = [B13])' },
  { code: 'C2', name: 'Thu nhập miễn thuế', manual: true },
  { code: 'C3', name: 'Chuyển lỗ và bù trừ lãi, lỗ ([C3] = [C3a]+[C3b])' },
  { code: 'C3a', name: 'Lỗ từ hoạt động sản xuất kinh doanh được chuyển trong kỳ', manual: true },
  { code: 'C3b', name: 'Lỗ từ chuyển nhượng bất động sản được bù trừ với lãi của hoạt động sản xuất kinh doanh', manual: true },
  { code: 'C4', name: 'Thu nhập tính thuế ([C4] = [C1]−[C2]−[C3])', bold: true },
  { code: 'C5', name: 'Trích lập quỹ khoa học và công nghệ (nếu có)', manual: true },
  { code: 'C6', name: 'Thu nhập tính thuế sau khi đã trích lập quỹ khoa học và công nghệ ([C6] = [C4]−[C5])', bold: true },
  { code: 'rate', name: 'Thuế suất thuế thu nhập doanh nghiệp (%)', manual: true, percent: true },
  { code: 'C10', name: 'Thuế thu nhập doanh nghiệp từ hoạt động sản xuất kinh doanh tính theo thuế suất ([C10] = [C6] × thuế suất)' },
  { code: 'C11', name: 'Thuế thu nhập doanh nghiệp chênh lệch do áp dụng thuế suất ưu đãi', manual: true },
  { code: 'C12', name: 'Thuế thu nhập doanh nghiệp được miễn, giảm', manual: true },
  { code: 'C13', name: 'Số thuế được miễn, giảm theo Hiệp định tránh đánh thuế hai lần', manual: true },
  { code: 'C14', name: 'Số thuế thu nhập đã nộp ở nước ngoài được trừ trong kỳ tính thuế', manual: true },
  { code: 'C15', name: 'Thuế thu nhập doanh nghiệp của hoạt động sản xuất kinh doanh ([C15] = [C10]−[C11]−[C12]−[C13]−[C14])', bold: true },
  { code: 'D', name: 'Tổng số thuế thu nhập doanh nghiệp phải nộp ([D] = [C15]+[D2])', bold: true },
  { code: 'D2', name: 'Thuế thu nhập doanh nghiệp từ hoạt động chuyển nhượng bất động sản', manual: true },
  { code: 'E', name: 'Số thuế thu nhập doanh nghiệp đã tạm nộp trong năm', manual: true },
  { code: 'G', name: 'Tổng số thuế thu nhập doanh nghiệp còn phải nộp ([G] = [D]−[E]; âm là nộp thừa)', bold: true },
];

/** Thuế suất gợi ý theo tổng doanh thu năm (Luật Thuế TNDN 67/2025/QH15): ≤ 3 tỷ: 15%; ≤ 50 tỷ: 17%; còn lại 20%. */
export function suggestedRate(revenue: number): number {
  return revenue <= 3_000_000_000 ? 15 : revenue <= 50_000_000_000 ? 17 : 20;
}

export function computeCit(auto: Record<string, number>, manual: Partial<Record<CitManualKey, number>>): Record<string, number> {
  const v: Record<string, number> = { ...auto };
  for (const k of CIT_MANUAL_KEYS) if (manual[k] !== undefined && manual[k] !== null) v[k] = Number(manual[k]);
  const g = (k: string) => v[k] ?? 0;
  for (const k of CIT_MANUAL_KEYS) v[k] = g(k);
  if (manual.rate === undefined || manual.rate === null) v.rate = auto.rate ?? 20;
  if (manual.E === undefined || manual.E === null) v.E = auto.E ?? 0;
  v.B1 = g('B2') + g('B3') + g('B4') + g('B5') + g('B6') + g('B7');
  v.B8 = g('B9') + g('B10') + g('B11');
  v.B12 = g('A1') + g('B1') - g('B8');
  v.B13 = g('B12') - g('B14');
  v.C1 = g('B13');
  v.C3 = g('C3a') + g('C3b');
  v.C4 = Math.max(g('C1') - g('C2') - g('C3'), 0);
  v.C6 = Math.max(g('C4') - g('C5'), 0);
  v.C10 = Math.round((g('C6') * g('rate')) / 100);
  v.C15 = Math.max(g('C10') - g('C11') - g('C12') - g('C13') - g('C14'), 0);
  v.D = g('C15') + g('D2');
  v.G = g('D') - g('E');
  for (const k of Object.keys(v)) if (k !== 'rate') v[k] = Math.round(v[k] ?? 0);
  return v;
}

export const citReturnService = {
  form: () => CIT_FORM,

  async build(auth: AuthContext, q: { year: number }) {
    const from = `${q.year}-01-01`;
    const to = `${q.year}-12-31`;
    const is = await incomeStatement({ tenantId: auth.tenantId, from, to, branchIds: null });
    const line = (code: string) => is.rows.find((r) => r.code === code)?.current ?? 0;
    // Tổng doanh thu để gợi ý thuế suất: doanh thu thuần + doanh thu tài chính + thu nhập khác.
    const revenue = line('10') + line('22') + line('31');
    const paid = await sql<{ v: string | null }>`
      SELECT SUM(l.debit) AS v FROM bizcity_read.ledger_lines l JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
       WHERE l.tenant_id = ${auth.tenantId} AND l.account_code LIKE '3334%'
         AND l.posting_date BETWEEN ${from}::date AND ${to}::date AND e.doc_type <> 'closing'`.execute(db);
    const auto: Record<string, number> = { A1: Math.round(line('50')), rate: suggestedRate(revenue), E: Math.round(toNumber(paid.rows[0]?.v ?? 0)) };
    const saved = await db.selectFrom('cit_returns').selectAll().where('tenant_id', '=', auth.tenantId).where('year', '=', q.year).executeTakeFirst();
    const manual = (saved?.manual ?? {}) as Partial<Record<CitManualKey, number>>;
    const values = computeCit(auto, manual);
    const minPrepaid = Math.round(values.D! * 0.8);
    return {
      year: q.year, from, to, auto, manual, values, revenue: Math.round(revenue),
      accounting: { tax: line('51'), profitAfterTax: line('60') },
      prepaidCheck: { minPrepaid, shortfall: Math.max(minPrepaid - values.E!, 0), q4Deadline: `${q.year + 1}-01-30` },
      deadline: `${q.year + 1}-03-31`,
      saved: saved ? { status: saved.status, values: saved.values, updatedBy: saved.updated_by, updatedAt: saved.updated_at } : null,
    };
  },

  async save(auth: AuthContext, q: { year: number; manual: Partial<Record<CitManualKey, number>>; status: 'draft' | 'final' }) {
    const built = await this.build(auth, q);
    const values = computeCit(built.auto, q.manual);
    await db.transaction().execute(async (trx) => {
      const row = { values: JSON.stringify(values), manual: JSON.stringify(q.manual), status: q.status, updated_by: auth.actor, updated_at: new Date() };
      await trx.insertInto('cit_returns').values({ tenant_id: auth.tenantId, year: q.year, ...row }).onConflict((oc) => oc.columns(['tenant_id', 'year']).doUpdateSet(row)).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'cit_return.save', objectType: 'cit_return', objectId: String(q.year), after: { values, manual: q.manual, status: q.status } });
    });
    return { values, status: q.status };
  },
};

/** Thông tin người nộp thuế in trên tờ khai. */
export const TAXPAYER_FIELDS = ['name', 'taxCode', 'address', 'ward', 'province', 'phone', 'email', 'taxOffice', 'agentName', 'agentTaxCode', 'agentContract', 'signer', 'preparer'] as const;
export type TaxpayerProfile = Partial<Record<(typeof TAXPAYER_FIELDS)[number], string>>;

export const taxpayerService = {
  async get(auth: AuthContext): Promise<TaxpayerProfile & { updatedBy?: string; updatedAt?: Date }> {
    const row = await db.selectFrom('taxpayer_profiles').selectAll().where('tenant_id', '=', auth.tenantId).executeTakeFirst();
    if (row) return { ...(row.data as TaxpayerProfile), updatedBy: row.updated_by, updatedAt: row.updated_at };
    // Chưa khai: lấy tên đơn vị làm gợi ý.
    const t = await db.selectFrom('tenants').select('name').where('id', '=', auth.tenantId).executeTakeFirst();
    return { name: t?.name ?? '' };
  },

  async save(auth: AuthContext, data: TaxpayerProfile) {
    const clean: TaxpayerProfile = {};
    for (const k of TAXPAYER_FIELDS) if (data[k]?.trim()) clean[k] = data[k]!.trim();
    if (clean.taxCode && !/^(\d{10}(-\d{3})?|\d{12})$/.test(clean.taxCode)) throw Errors.validation('Mã số thuế phải gồm 10 số, 10 số – 3 số, hoặc 12 số');
    await db.transaction().execute(async (trx) => {
      const row = { data: JSON.stringify(clean), updated_by: auth.actor, updated_at: new Date() };
      await trx.insertInto('taxpayer_profiles').values({ tenant_id: auth.tenantId, ...row }).onConflict((oc) => oc.column('tenant_id').doUpdateSet(row)).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'taxpayer.save', objectType: 'taxpayer_profile', objectId: auth.tenantId, after: clean });
    });
    return clean;
  },
};
