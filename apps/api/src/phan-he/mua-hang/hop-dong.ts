// @bizcity-layer D modules/mua-hang
// [2026-11-18 Nguyễn Văn Thủy] Hợp đồng mua hàng xuyên suốt (0163) (đóng góp)
/**
 * HỢP ĐỒNG MUA HÀNG — một dòng trong Danh mục hợp đồng (dimensions kind 'contract', loại goods_supplier), mã = số hợp đồng.
 * Hợp đồng là cái VỎ gom, không khai lại giá / %:
 *   bảng giá mua thuộc hợp đồng     supplier_products.contract_code
 *   chính sách thuộc hợp đồng       purchase_policies.scope.contractCode
 *   chứng từ mua thuộc hợp đồng     purchase_documents.data.contractCode (đơn đặt chọn / gợi ý, phiếu lập từ đơn kế thừa)
 *   công nợ theo hợp đồng           dòng sổ cái TK 331* có dims.contract (bút toán của chứng từ thuộc hợp đồng tự mang mã)
 * Hợp đồng cũng vào Sổ chứng từ (HT18) với mã hop-dong.contract:<mã>: phiên bản (sửa = phụ lục), đính kèm bản scan.
 * Trạng thái: draft Nháp · active Đang hiệu lực · liquidated Đã thanh lý (hết ngày "Đến" thì hiện "Hết hạn", vẫn là active).
 */
import { sql } from 'kysely';
import { z } from 'zod';
import { toNumber, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { listSupplierProducts } from './gia-mua.js';
import type { Policy, SupplierProduct } from '@bizcity/mua-hang-domain';
import type { StoredDoc } from './store.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
export const CONTRACT_STATUS = ['draft', 'active', 'liquidated'] as const;
export const contractInput = z.object({
  name: z.string().trim().max(255).default(''),
  partnerCode: z.string().trim().min(1, 'Chọn nhà cung cấp').max(64),
  signedDate: day.nullish(),
  startDate: day.nullish(),
  endDate: day.nullish(),
  status: z.enum(CONTRACT_STATUS).default('active'),
  branchCodes: z.array(z.string().trim().min(1).max(64)).max(500).default([]),
  brandCodes: z.array(z.string().trim().min(1).max(64)).max(500).default([]),
  skus: z.array(z.string().trim().min(1).max(64)).max(5000).default([]),
  value: z.number().min(0).nullish(),
  paymentTermDays: z.number().int().min(0).max(3650).nullish(),
  note: z.string().trim().max(1000).default(''),
  // [2026-11-18 Nguyễn Văn Thủy] điều khoản hợp đồng mua bán hàng hoá (Luật Thương mại 2005) — ghi nhận để đối chiếu (đóng góp)
  /** Người ký bên bán / bên mua (họ tên, chức vụ). */
  signerSeller: z.string().trim().max(200).default(''),
  signerBuyer: z.string().trim().max(200).default(''),
  /** Địa điểm giao hàng; bên chịu chi phí vận chuyển. */
  deliveryPlace: z.string().trim().max(300).default(''),
  freightBy: z.enum(['', 'seller', 'buyer']).default(''),
  /** Điều kiện đổi trả (hàng lỗi, cận date…). */
  returnTerms: z.string().trim().max(500).default(''),
  /** Phạt vi phạm: tối đa 8% giá trị phần nghĩa vụ bị vi phạm (Điều 301 Luật Thương mại 2005). */
  penaltyPct: z.number().min(0).max(8, 'Phạt vi phạm tối đa 8% giá trị phần nghĩa vụ bị vi phạm (Điều 301 Luật Thương mại)').nullish(),
  /** Lãi chậm thanh toán (%/năm). */
  lateInterestPct: z.number().min(0).max(100).nullish(),
  /** Thanh lý: ngày, ghi chú. */
  liquidatedDate: day.nullish(),
  liquidationNote: z.string().trim().max(1000).default(''),
}).refine((x) => !x.startDate || !x.endDate || x.endDate >= x.startDate, { message: 'Ngày "Hiệu lực đến" phải từ ngày "Hiệu lực từ" trở đi', path: ['endDate'] });
export type ContractInput = z.infer<typeof contractInput>;

export interface ContractRow {
  code: string; name: string; partnerCode: string; partnerName: string; signedDate: string | null; startDate: string | null; endDate: string | null;
  status: (typeof CONTRACT_STATUS)[number]; statusText: string; branchCodes: string[]; brandCodes: string[]; skus: string[];
  value: number | null; paymentTermDays: number | null; note: string; createdBy: string;
  /** Thời gian tạo / sửa lần cuối, người sửa lần cuối (ghi trong extra của hợp đồng; nhật ký đầy đủ ở JSONL mua hàng). */
  createdAt: string | null; updatedAt: string | null; updatedBy: string;
  signerSeller: string; signerBuyer: string; deliveryPlace: string; freightBy: string; returnTerms: string;
  penaltyPct: number | null; lateInterestPct: number | null; liquidatedDate: string | null; liquidationNote: string;
  prices: number; policies: number; documents: number; debt: number; purchased: number;
  /** Số mã (trong danh sách mã của hợp đồng) đã có giá mua thuộc hợp đồng; hợp đồng không ghi mã thì = số mã có giá. */
  pricedItems: number;
}

const iso = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
export function statusText(status: string, endDate: string | null, asOf: string): string {
  if (status === 'draft') return 'Nháp';
  if (status === 'liquidated') return 'Đã thanh lý';
  if (endDate && endDate < asOf) return 'Hết hạn';
  return 'Đang hiệu lực';
}

/** Hợp đồng mua (loại goods_supplier) — tuỳ chọn lọc NCC / một mã; kèm số giá, chính sách, chứng từ, nợ còn lại, đã mua. */
export async function listContracts(trx: Db, tenantId: string, f: { partnerCode?: string; code?: string; asOf: string; docs: StoredDoc[]; policies: Policy[] }): Promise<ContractRow[]> {
  let q = trx.selectFrom('dimensions').select(['code', 'name', 'note', 'is_active', 'extra']).where('tenant_id', '=', tenantId).where('kind', '=', 'contract')
    .where(sql<boolean>`extra->>'type' = 'goods_supplier'`);
  if (f.partnerCode) q = q.where(sql<boolean>`extra->>'partnerCode' = ${f.partnerCode}`);
  if (f.code) q = q.where('code', '=', f.code);
  const rows = await q.orderBy('code').execute();
  if (!rows.length) return [];
  const codes = rows.map((r) => r.code);
  const partnerCodes = [...new Set(rows.map((r) => String((r.extra as Record<string, unknown>).partnerCode ?? '')).filter(Boolean))];
  const [partners, prices, debts] = await Promise.all([
    partnerCodes.length ? trx.selectFrom('partners').select(['code', 'name', 'company_name']).where('tenant_id', '=', tenantId).where('code', 'in', partnerCodes).execute() : [],
    trx.selectFrom('supplier_products').select(['contract_code', 'sku', 'price']).where('tenant_id', '=', tenantId).where('contract_code', 'in', codes).where('is_active', '=', true).execute(),
    sql<{ contract: string; debt: string }>`
      SELECT l.dims->>'contract' AS contract, SUM(l.credit - l.debit) AS debt
        FROM bizcity_read.ledger_lines l
       WHERE l.tenant_id = ${tenantId} AND l.account_code LIKE '331%' AND l.dims->>'contract' = ANY(${codes}::text[])
       GROUP BY 1`.execute(trx).then((r) => r.rows),
  ]);
  const pName = new Map(partners.map((p) => [p.code, p.company_name || p.name]));
  const skusOf = new Map<string, Set<string>>();
  for (const p of prices.filter((x) => x.price !== null)) { if (!skusOf.has(p.contract_code)) skusOf.set(p.contract_code, new Set()); skusOf.get(p.contract_code)!.add(p.sku); }
  const debtOf = new Map(debts.map((d) => [d.contract, toNumber(d.debt)]));
  return rows.map((r) => {
    const x = r.extra as Record<string, unknown>;
    const status = (CONTRACT_STATUS as readonly string[]).includes(String(x.status)) ? (x.status as ContractRow['status']) : r.is_active ? 'active' : 'liquidated';
    const endDate = iso(x.endDate);
    const docs = f.docs.filter((d) => d.contractCode === r.code && d.status !== 'cancelled');
    return {
      code: r.code, name: r.name, partnerCode: String(x.partnerCode ?? ''), partnerName: pName.get(String(x.partnerCode ?? '')) ?? '',
      signedDate: iso(x.signedDate), startDate: iso(x.startDate), endDate, status, statusText: statusText(status, endDate, f.asOf),
      branchCodes: arr(x.branchCodes), brandCodes: arr(x.brandCodes), skus: arr(x.skus),
      value: typeof x.value === 'number' ? x.value : null, paymentTermDays: typeof x.paymentTermDays === 'number' ? x.paymentTermDays : null,
      note: r.note ?? '', createdBy: String(x.createdBy ?? ''), createdAt: typeof x.createdAt === 'string' ? x.createdAt : null, updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : null, updatedBy: String(x.updatedBy ?? x.createdBy ?? ''),
      signerSeller: String(x.signerSeller ?? ''), signerBuyer: String(x.signerBuyer ?? ''), deliveryPlace: String(x.deliveryPlace ?? ''), freightBy: String(x.freightBy ?? ''),
      returnTerms: String(x.returnTerms ?? ''), penaltyPct: typeof x.penaltyPct === 'number' ? x.penaltyPct : null, lateInterestPct: typeof x.lateInterestPct === 'number' ? x.lateInterestPct : null,
      liquidatedDate: iso(x.liquidatedDate), liquidationNote: String(x.liquidationNote ?? ''),
      prices: prices.filter((p) => p.contract_code === r.code).length,
      pricedItems: (() => { const got = skusOf.get(r.code) ?? new Set<string>(); const list = arr(x.skus); return list.length ? list.filter((s) => got.has(s)).length : got.size; })(), policies: f.policies.filter((p) => p.scope.contractCode === r.code).length, documents: docs.length,
      debt: Math.round(debtOf.get(r.code) ?? 0),
      purchased: Math.round(docs.filter((d) => d.kind === 'receipt' && d.status === 'approved').reduce((s, d) => s + d.totals.beforeTax, 0)
        - docs.filter((d) => d.kind === 'return' && d.status === 'approved').reduce((s, d) => s + d.totals.beforeTax, 0)),
    };
  });
}

/** Một hợp đồng + mọi thứ thuộc nó: bảng giá mua, chính sách, chứng từ. */
export async function contractDetail(trx: Db, tenantId: string, code: string, ctx: { asOf: string; docs: StoredDoc[]; policies: Policy[] }) {
  const [c] = await listContracts(trx, tenantId, { code, ...ctx });
  if (!c) throw Errors.notFound(`hợp đồng mua ${code}`);
  const prices: SupplierProduct[] = await listSupplierProducts(trx, tenantId, { contractCode: code, all: true });
  const skus = [...new Set([...prices.map((p) => p.sku), ...c.skus])];
  const names = skus.length ? new Map((await trx.selectFrom('products').select(['sku', 'name', 'brand_code']).where('tenant_id', '=', tenantId).where('sku', 'in', skus).execute()).map((p) => [p.sku, p])) : new Map();
  return {
    contract: c,
    items: c.skus.map((s) => ({ sku: s, name: names.get(s)?.name ?? '', brandCode: names.get(s)?.brand_code ?? '' })),
    prices: prices.map((p) => ({ ...p, name: names.get(p.sku)?.name ?? '' })),
    policies: ctx.policies.filter((p) => p.scope.contractCode === code),
    documents: ctx.docs.filter((d) => d.contractCode === code),
  };
}

/** Chứng từ mua mang hợp đồng: phải là hợp đồng mua của đúng NCC; hợp đồng đã thanh lý thì không lập phiếu mới theo nó (phiếu cũ giữ nguyên). */
export async function checkContract(trx: Db, tenantId: string, code: string, partnerCode: string, unchanged = false) {
  const c = await trx.selectFrom('dimensions').select(['extra']).where('tenant_id', '=', tenantId).where('kind', '=', 'contract').where('code', '=', code).executeTakeFirst();
  const x = (c?.extra ?? {}) as Record<string, unknown>;
  if (!c || x.type !== 'goods_supplier') throw Errors.validation(`Hợp đồng ${code} không có trong danh sách hợp đồng mua`);
  if (x.partnerCode && x.partnerCode !== partnerCode) throw Errors.validation(`Hợp đồng ${code} là của nhà cung cấp ${String(x.partnerCode)}, không phải ${partnerCode}`);
  if (!unchanged && x.status === 'liquidated') throw Errors.validation(`Hợp đồng ${code} đã thanh lý — không lập chứng từ mới theo hợp đồng này`);
}

/** Ghi hợp đồng mua vào Danh mục hợp đồng (thêm mới: mã chưa có; sửa: giữ người tạo, loại). */
export async function saveContract(trx: Db, tenantId: string, actorName: string, code: string, isNew: boolean, b: ContractInput) {
  const cur = await trx.selectFrom('dimensions').select(['extra', 'name', 'note']).where('tenant_id', '=', tenantId).where('kind', '=', 'contract').where('code', '=', code).executeTakeFirst();
  if (isNew && cur) throw Errors.conflict(`Số hợp đồng ${code} đã có trong Danh mục hợp đồng — chọn số khác hoặc mở hợp đồng đó để sửa`);
  if (!isNew && !cur) throw Errors.notFound(`hợp đồng ${code}`);
  if (/\s/.test(code)) throw Errors.validation('Số hợp đồng không được có dấu cách (dùng - hoặc /)');
  const old = (cur?.extra ?? {}) as Record<string, unknown>;
  if (cur && old.type && old.type !== 'goods_supplier') throw Errors.conflict(`Mã ${code} là hợp đồng loại khác (không phải hợp đồng mua hàng)`);
  const partner = await trx.selectFrom('partners').select(['code', 'name']).where('tenant_id', '=', tenantId).where('code', '=', b.partnerCode).executeTakeFirst();
  if (!partner) throw Errors.validation(`Nhà cung cấp ${b.partnerCode} không có trong danh mục`);
  // [2026-11-19 Nguyễn Văn Thủy] hợp đồng ghi nhãn: mặt hàng phải thuộc một trong các nhãn đó (đóng góp)
  if (b.brandCodes.length && b.skus.length) {
    const rows = await trx.selectFrom('products').select(['sku', 'brand_code']).where('tenant_id', '=', tenantId).where('sku', 'in', b.skus).execute();
    const bad = b.skus.filter((s) => !b.brandCodes.includes(rows.find((r) => r.sku === s)?.brand_code ?? ''));
    if (bad.length) throw Errors.validation(`Mặt hàng không thuộc nhãn của hợp đồng (${b.brandCodes.join(', ')}): ${bad.slice(0, 10).join(', ')}${bad.length > 10 ? '…' : ''}`);
  }
  const extra = Object.fromEntries(Object.entries({
    ...old, type: 'goods_supplier', partnerCode: b.partnerCode, signedDate: b.signedDate ?? undefined, startDate: b.startDate ?? undefined, endDate: b.endDate ?? undefined,
    status: b.status, branchCodes: b.branchCodes, brandCodes: b.brandCodes, skus: [...new Set(b.skus)], value: b.value ?? undefined, paymentTermDays: b.paymentTermDays ?? undefined,
    signerSeller: b.signerSeller, signerBuyer: b.signerBuyer, deliveryPlace: b.deliveryPlace, freightBy: b.freightBy, returnTerms: b.returnTerms,
    penaltyPct: b.penaltyPct ?? undefined, lateInterestPct: b.lateInterestPct ?? undefined,
    liquidatedDate: b.status === 'liquidated' ? (b.liquidatedDate ?? undefined) : undefined, liquidationNote: b.status === 'liquidated' ? b.liquidationNote : undefined,
    createdBy: (old.createdBy as string | undefined) ?? actorName,
    // [2026-11-19 Nguyễn Văn Thủy] thời gian tạo / sửa, người sửa lần cuối (đóng góp)
    createdAt: (old.createdAt as string | undefined) ?? (cur ? undefined : new Date().toISOString()), updatedAt: new Date().toISOString(), updatedBy: actorName,
  }).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const name = b.name || cur?.name || `Hợp đồng mua ${partner.name}`;
  const values = { name, note: b.note, is_active: b.status !== 'liquidated', extra: JSON.stringify(extra) };
  await trx.insertInto('dimensions').values({ tenant_id: tenantId, kind: 'contract', code, ...values })
    .onConflict((oc) => oc.columns(['tenant_id', 'kind', 'code']).doUpdateSet(values)).execute();
  return { code, before: cur ? { name: cur.name, note: cur.note, extra: old } : undefined, after: { name, extra }, changes: cur ? contractChanges({ ...old, name: cur.name, note: cur.note }, { ...extra, name, note: b.note }) : [] };
}

const LABEL: Record<string, string> = {
  name: 'Tên', note: 'Ghi chú', partnerCode: 'NCC', signedDate: 'Ngày ký', startDate: 'Hiệu lực từ', endDate: 'Hiệu lực đến', status: 'Trạng thái', branchCodes: 'Chi nhánh', brandCodes: 'Nhãn hàng',
  skus: 'Mặt hàng', value: 'Giá trị', signerSeller: 'Người ký bên bán', signerBuyer: 'Người ký bên mua', deliveryPlace: 'Địa điểm giao', freightBy: 'Chi phí vận chuyển', returnTerms: 'Đổi trả',
  penaltyPct: 'Phạt vi phạm %', lateInterestPct: 'Lãi chậm trả %', liquidatedDate: 'Ngày thanh lý', liquidationNote: 'Ghi chú thanh lý',
};
const text = (k: string, v: unknown) => (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) ? '—'
  : k === 'status' ? statusText(v as ContractRow['status'], null, '9999-12-31') : k === 'freightBy' ? (v === 'seller' ? 'Bên bán chịu' : v === 'buyer' ? 'Bên mua chịu' : String(v))
  : /Date$/.test(k) ? String(v).slice(0, 10).split('-').reverse().join('/') : Array.isArray(v) ? v.join(', ') : String(v));
/** Đổi gì của một lần ghi hợp đồng: "Hiệu lực đến: — → 31/12/2027", "Mặt hàng: thêm 100021001; bỏ 100046002". */
export function contractChanges(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of Object.keys(LABEL)) {
    const a = before[k], b = after[k];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (text(k, a) === text(k, b))) continue;
    if (k === 'skus' || k === 'brandCodes' || k === 'branchCodes') {
      const x = (Array.isArray(a) ? a : []) as string[], y = (Array.isArray(b) ? b : []) as string[];
      const them = y.filter((s) => !x.includes(s)), bo = x.filter((s) => !y.includes(s));
      out.push(`${LABEL[k]}: ${[them.length && `thêm ${them.slice(0, 20).join(', ')}${them.length > 20 ? '…' : ''}`, bo.length && `bỏ ${bo.slice(0, 20).join(', ')}${bo.length > 20 ? '…' : ''}`].filter(Boolean).join('; ')}`);
    } else out.push(`${LABEL[k]}: ${text(k, a)} → ${text(k, b)}`);
  }
  return out;
}

/**
 * Công nợ phải trả theo hợp đồng (sổ TK 331*, dòng có dims.contract): tổng hợp = mỗi hợp đồng một dòng (đầu kỳ, phát sinh nợ / có,
 * cuối kỳ — dương = còn phải trả); chi tiết = từng bút toán trong kỳ, số dư luỹ kế theo hợp đồng.
 */
export async function contractDebts(trx: Db, tenantId: string, a: { from: string; to: string; partnerCode?: string; contractCode?: string; detail: boolean }) {
  const cs = await trx.selectFrom('dimensions').select(['code', 'name', 'extra']).where('tenant_id', '=', tenantId).where('kind', '=', 'contract')
    .where(sql<boolean>`extra->>'type' = 'goods_supplier'`)
    .$if(Boolean(a.partnerCode), (q) => q.where(sql<boolean>`extra->>'partnerCode' = ${a.partnerCode!}`))
    .$if(Boolean(a.contractCode), (q) => q.where('code', '=', a.contractCode!)).execute();
  const codes = cs.map((c) => c.code);
  const info = new Map(cs.map((c) => [c.code, c]));
  const pc = [...new Set(cs.map((c) => String((c.extra as Record<string, unknown>).partnerCode ?? '')).filter(Boolean))];
  const pName = new Map((pc.length ? await trx.selectFrom('partners').select(['code', 'name', 'company_name']).where('tenant_id', '=', tenantId).where('code', 'in', pc).execute() : []).map((p) => [p.code, p.company_name || p.name]));
  const head = (code: string) => { const x = (info.get(code)?.extra ?? {}) as Record<string, unknown>; const p = String(x.partnerCode ?? ''); return { contractCode: code, contractName: info.get(code)?.name ?? '', partnerCode: p, partnerName: pName.get(p) ?? '' }; };
  if (!codes.length) return { rows: [], lines: [] };
  const sums = (await sql<{ contract: string; open: string; debit: string; credit: string }>`
    SELECT l.dims->>'contract' AS contract,
           SUM(CASE WHEN l.posting_date < ${a.from}::date THEN l.credit - l.debit ELSE 0 END) AS open,
           SUM(CASE WHEN l.posting_date >= ${a.from}::date THEN l.debit ELSE 0 END) AS debit,
           SUM(CASE WHEN l.posting_date >= ${a.from}::date THEN l.credit ELSE 0 END) AS credit
      FROM bizcity_read.ledger_lines l
     WHERE l.tenant_id = ${tenantId} AND l.account_code LIKE '331%' AND l.posting_date <= ${a.to}::date AND l.dims->>'contract' = ANY(${codes}::text[])
     GROUP BY 1`.execute(trx)).rows;
  const by = new Map(sums.map((s) => [s.contract, s]));
  const rows = codes.map((c) => {
    const s = by.get(c);
    const open = toNumber(s?.open ?? 0), debit = toNumber(s?.debit ?? 0), credit = toNumber(s?.credit ?? 0);
    return { ...head(c), openDebit: open < 0 ? -open : 0, openCredit: open > 0 ? open : 0, debit, credit, closeDebit: open + credit - debit < 0 ? -(open + credit - debit) : 0, closeCredit: open + credit - debit > 0 ? open + credit - debit : 0 };
  }).filter((r) => a.contractCode || r.openDebit || r.openCredit || r.debit || r.credit);
  if (!a.detail) return { rows, lines: [] };
  const raw = (await sql<{ contract: string; posting_date: string; doc_no: string; doc_type: string; description: string; account_code: string; debit: string; credit: string }>`
    SELECT l.dims->>'contract' AS contract, l.posting_date::text AS posting_date, e.doc_no, e.doc_type, COALESCE(NULLIF(l.description, ''), e.description, '') AS description,
           l.account_code, l.debit, l.credit
      FROM bizcity_read.ledger_lines l JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${tenantId} AND l.account_code LIKE '331%' AND l.posting_date BETWEEN ${a.from}::date AND ${a.to}::date
       AND l.dims->>'contract' = ANY(${codes}::text[])
     ORDER BY 1, 2, e.doc_no, l.line_no`.execute(trx)).rows;
  const run = new Map(rows.map((r) => [r.contractCode, r.openCredit - r.openDebit]));
  const lines = raw.map((l) => {
    const debit = toNumber(l.debit), credit = toNumber(l.credit);
    const bal = (run.get(l.contract) ?? 0) + credit - debit; run.set(l.contract, bal);
    return { ...head(l.contract), date: l.posting_date, docNo: l.doc_no, docType: l.doc_type, description: l.description, account: l.account_code, debit, credit, balance: Math.round(bal) };
  });
  return { rows, lines };
}
