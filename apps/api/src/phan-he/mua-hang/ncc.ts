// @bizcity-layer D modules/mua-hang
/**
 * NHÀ CUNG CẤP — mọi việc mua hàng đi từ NCC:
 *   supplierList     mỗi NCC một dòng: nợ (331 theo sổ), quá hạn / sắp đến hạn, hạn mức đã dùng, điều khoản, số chính sách,
 *                    hợp đồng còn hiệu lực đến ngày, lần nhập gần nhất, mua tháng này, số chứng từ, số tệp đính kèm
 *   supplierProfile  hồ sơ một NCC: thông tin danh mục + các con số trên + mua theo tháng + nhật ký thay đổi của NCC
 *   attachments      tệp đính kèm (hợp đồng, CO, CQ, báo giá, chứng từ…) — nội dung lưu trên ổ dữ liệu ERP
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import { creditStatus, orderProgress, termFromRule, termText } from '@ketoan/contracts/mua-hang';
import { unitsForOrders } from './gia-mua.js';
import { toNumber, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { openDueOf, type Ctx } from './analysis.js';
import { readLog } from './log.js';

const today = () => new Date().toISOString().slice(0, 10);
const plus = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export interface SupplierRow {
  code: string; name: string; taxCode: string | null; groupCode: string | null; phone: string | null; address: string | null; isActive: boolean;
  /** Người tạo, ngày giờ tạo NCC. */
  createdBy: string; createdAt: string | null;
  /** advance: tiền đã ứng / trả trước NCC chưa đối trừ vào hoá đơn (bên Nợ 331 còn lại) — đã trừ trong debt, KHÔNG trừ trong overdue. */
  debt: number; overdue: number; dueSoon: number; advance: number; creditLimit: number | null; creditUsed: number; creditPolicy?: string;
  term: string; policies: number; items: number; contractTo?: string; contractNo?: string; lastReceipt?: string; monthPurchase: number; documents: number; attachments: number; openOrders: number;
}

/** scope = 'active': NCC có chính sách / chứng từ / công nợ 331; 'all': mọi đối tượng loại nhà cung cấp. */
export async function supplierList(trx: Db, tenantId: string, ctx: Ctx, scope: 'active' | 'all' = 'active', asOf = today()): Promise<SupplierRow[]> {
  const debts = await trx.selectFrom('debt_items as i').innerJoin('partners as p', 'p.id', 'i.partner_id')
    .select(['p.code',
      sql<string>`SUM(CASE WHEN i.side = 'credit' THEN i.amount - i.settled_amount ELSE -(i.amount - i.settled_amount) END)`.as('debt'),
      sql<string>`SUM(CASE WHEN i.side = 'debit' THEN i.amount - i.settled_amount ELSE 0 END)`.as('advance')])
    .where('i.tenant_id', '=', tenantId).where('i.account_code', 'like', '331%').groupBy('p.code').execute();
  const debtOf = new Map(debts.map((d) => [d.code, d]));
  // Quá hạn / sắp đến hạn theo hạn thật (lịch trả từng đợt, công nợ cố định không có hạn) — như Công nợ đến hạn (MH05).
  const soonTo = plus(asOf, ctx.settings.warnDays ?? 3);
  const dueBy = new Map<string, { overdue: number; dueSoon: number }>();
  for (const x of await openDueOf(trx, tenantId, ctx.docs, asOf)) {
    const cur = dueBy.get(x.partnerCode) ?? { overdue: 0, dueSoon: 0 };
    if (x.dueDate && x.dueDate < asOf) cur.overdue += x.remaining;
    else if (x.dueDate && x.dueDate <= soonTo) cur.dueSoon += x.remaining;
    dueBy.set(x.partnerCode, cur);
  }
  const itemRows = await trx.selectFrom('supplier_products').select(['partner_code', sql<string>`COUNT(DISTINCT sku)`.as('n')]).where('tenant_id', '=', tenantId).where('is_active', '=', true).where('partner_code', 'is not', null).groupBy('partner_code').execute();
  const itemsOf = new Map(itemRows.map((r) => [r.partner_code!, toNumber(r.n)]));
  const atts = await trx.selectFrom('purchase_attachments').select(['owner_id', sql<string>`COUNT(*)`.as('n')]).where('tenant_id', '=', tenantId).where('owner_type', '=', 'partner').groupBy('owner_id').execute();
  const attOf = new Map(atts.map((a) => [a.owner_id, toNumber(a.n)]));
  const active = new Set<string>([...ctx.policies.map((p) => p.scope.partnerCode ?? ''), ...ctx.docs.map((d) => d.partnerCode), ...debts.filter((d) => Math.abs(toNumber(d.debt)) > 0.5).map((d) => d.code), ...attOf.keys(), ...itemsOf.keys()].filter(Boolean));
  let q = trx.selectFrom('partners').select(['code', 'name', 'company_name', 'tax_code', 'group_code', 'phone', 'address', 'company_address', 'is_active', 'credit_limit', 'payment_term_days', 'kind', 'created_by', 'created_at']).where('tenant_id', '=', tenantId);
  q = scope === 'all' ? q.where((eb) => eb.or([eb('kind', '=', 'supplier'), sql<boolean>`'supplier' = ANY(also_kinds)`, eb('code', 'in', [...active, ''])])) : q.where('code', 'in', [...active, '']);
  const partners = await q.orderBy('code').execute();
  const orderUnits = await unitsForOrders(trx, tenantId, ctx.docs);
  const month = asOf.slice(0, 7);
  return partners.map((p) => {
    const pols = ctx.policies.filter((x) => x.scope.partnerCode === p.code && x.isActive);
    const docs = ctx.docs.filter((d) => d.partnerCode === p.code && d.status !== 'cancelled');
    const d = debtOf.get(p.code);
    const debt = toNumber(d?.debt ?? 0);
    const lim = pols.find((x) => x.kind === 'credit_limit' && !x.scope.brandCode);
    const limit = lim ? (Number(lim.rule.limit) || 0) : p.credit_limit ? toNumber(p.credit_limit) : null;
    const openOrders = docs.filter((x) => x.kind === 'order' && x.status === 'approved' && !orderProgress(x, ctx.docs, undefined, orderUnits).done);
    const pending = docs.filter((x) => x.status === 'pending_approval' && (x.kind === 'receipt' || x.kind === 'order')).reduce((s, x) => s + x.totals.total, 0)
      + openOrders.reduce((s, x) => { const pr = orderProgress(x, ctx.docs, undefined, orderUnits); return s + (pr.ordered ? (x.totals.total * pr.remaining) / pr.ordered : 0); }, 0);
    const termPol = pols.find((x) => x.kind === 'payment_term');
    const contract = pols.filter((x) => x.kind === 'contract').sort((a, b) => (b.validTo ?? '9999').localeCompare(a.validTo ?? '9999'))[0];
    const receipts = docs.filter((x) => x.kind === 'receipt' && x.status === 'approved');
    return {
      // NCC là doanh nghiệp: tên / địa chỉ chính thức (trên hoá đơn) = khối công ty, chưa có thì lấy tên / địa chỉ chung.
      code: p.code, name: p.company_name || p.name, taxCode: p.tax_code, groupCode: p.group_code, phone: p.phone, address: p.company_address || p.address, isActive: p.is_active,
      createdBy: p.created_by ?? '', createdAt: p.created_at ? new Date(p.created_at as unknown as string).toISOString() : null,
      debt, advance: Math.round(toNumber(debtOf.get(p.code)?.advance ?? 0)), overdue: dueBy.get(p.code)?.overdue ?? 0, dueSoon: dueBy.get(p.code)?.dueSoon ?? 0, creditLimit: limit, creditUsed: Math.round(debt + pending), creditPolicy: lim?.code,
      term: termPol ? termText(termFromRule(termPol.rule)) : p.payment_term_days ? `${p.payment_term_days} ngày (danh mục đối tượng)` : '',
      policies: pols.length, items: Math.max(itemsOf.get(p.code) ?? 0, new Set(docs.flatMap((x) => (x.kind === 'receipt' || x.kind === 'order' ? x.lines.map((l) => l.sku) : []))).size), contractTo: contract?.validTo, contractNo: contract ? String(contract.rule.no ?? '') : undefined,
      lastReceipt: receipts.map((x) => x.docDate).sort().pop(), monthPurchase: receipts.filter((x) => x.docDate.startsWith(month)).reduce((s, x) => s + x.totals.beforeTax, 0),
      documents: docs.length, attachments: attOf.get(p.code) ?? 0, openOrders: openOrders.length,
    };
  });
}

export async function supplierProfile(trx: Db, tenantId: string, ctx: Ctx, code: string) {
  const row = (await supplierList(trx, tenantId, { ...ctx }, 'all')).find((r) => r.code === code);
  const p = await trx.selectFrom('partners').selectAll().where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!p) throw Errors.notFound('nhà cung cấp');
  const lim = ctx.policies.find((x) => x.kind === 'credit_limit' && x.isActive && x.scope.partnerCode === code && !x.scope.brandCode);
  const credit = row?.creditLimit ? creditStatus(lim ?? { id: 'dm13', code: 'DM13', kind: 'credit_limit', name: 'Hạn mức ở danh mục', scope: { partnerCode: code }, isActive: true, rule: { limit: row.creditLimit, warnPct: 90 } }, row.debt, row.creditUsed - row.debt, 0) : undefined;
  // Mua theo tháng (12 tháng gần nhất) từ phiếu nhập đã duyệt.
  const byMonth = new Map<string, number>();
  for (const d of ctx.docs.filter((x) => x.partnerCode === code && x.kind === 'receipt' && x.status === 'approved')) byMonth.set(d.docDate.slice(0, 7), (byMonth.get(d.docDate.slice(0, 7)) ?? 0) + d.totals.beforeTax);
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([month, amount]) => ({ month, amount }));
  const policyCodes = new Set(ctx.policies.filter((x) => x.scope.partnerCode === code).map((x) => x.code));
  const docNos = new Set(ctx.docs.filter((x) => x.partnerCode === code).map((x) => x.docNo));
  const logs = (await readLog(tenantId, {})).filter((l) => (l.data as { partnerCode?: string })?.partnerCode === code || policyCodes.has(l.docNo) || docNos.has(l.docNo)).slice(0, 300);
  return {
    partner: { code: p.code, name: p.name, taxCode: p.tax_code, address: p.address, phone: p.phone, email: p.email, contactName: p.contact_name, bankAccount: p.bank_account_no, bankName: p.bank_name, groupCode: p.group_code, kind: p.kind, isActive: p.is_active },
    summary: row, credit, months, logs,
  };
}

/* ------------------------------------------------------------------ nhãn hàng NCC bán */

/**
 * Các nhãn hàng của NCC — suy từ mặt hàng NCC bán (mặt hàng & giá mua) và đã nhập (phiếu mua), nhãn lấy theo danh mục mặt
 * hàng. Không khai riêng ở NCC: dùng để gợi ý nhãn khi lập chính sách và hiện ở hồ sơ NCC.
 */
export async function supplierBrandList(trx: Db, tenantId: string, code: string): Promise<{ brandCode: string; name: string; skus: number }[]> {
  const r = await sql<{ brand: string; name: string; n: string }>`
    SELECT p.brand_code AS brand, max(c.name) AS name, count(DISTINCT p.sku) AS n FROM products p
    JOIN item_classes c ON c.tenant_id = p.tenant_id AND c.kind = 'brand' AND c.code = p.brand_code
    WHERE p.tenant_id = ${tenantId} AND p.brand_code IS NOT NULL AND p.sku IN (
      SELECT sku FROM supplier_products WHERE tenant_id = ${tenantId} AND partner_code = ${code}
      UNION SELECT l->>'sku' FROM purchase_documents d, jsonb_array_elements(d.data->'lines') l WHERE d.tenant_id = ${tenantId} AND d.partner_code = ${code} AND d.status <> 'cancelled')
    GROUP BY p.brand_code ORDER BY n DESC, brand`.execute(trx);
  return r.rows.map((x) => ({ brandCode: x.brand, name: x.name, skus: Number(x.n) }));
}

/* ------------------------------------------------------------------ tệp đính kèm */

export const ATTACHMENT_KINDS: Record<string, string> = { hop_dong: 'Hợp đồng / phụ lục', co: 'CO (xuất xứ)', cq: 'CQ (chất lượng)', bao_gia: 'Báo giá', hoa_don: 'Hoá đơn (ảnh / PDF)', hoa_don_xml: 'Hoá đơn XML gốc', chung_tu_10: 'Chứng từ số 10', chung_tu_11: 'Chứng từ số 11', bien_ban: 'Biên bản', khac: 'Khác' };
const attDir = (tenantId: string) => path.resolve(process.env.DATA_DIR ?? './data', 'dinh-kem', tenantId);
const MAX = 15 * 1024 * 1024;

export async function listAttachments(trx: Db, tenantId: string, ownerType: string, ownerId: string) {
  const rows = await trx.selectFrom('purchase_attachments').select(['id', 'kind', 'file_name', 'mime', 'size', 'note', 'uploaded_by', 'created_at'])
    .where('tenant_id', '=', tenantId).where('owner_type', '=', ownerType).where('owner_id', '=', ownerId).orderBy('created_at', 'desc').execute();
  return rows.map((r) => ({ id: String(r.id), kind: r.kind, kindLabel: ATTACHMENT_KINDS[r.kind] ?? r.kind, fileName: r.file_name, mime: r.mime, size: toNumber(r.size), note: r.note, uploadedBy: r.uploaded_by, createdAt: new Date(r.created_at as unknown as string).toISOString() }));
}

export async function addAttachment(trx: Db, tenantId: string, actor: string, a: { ownerType: 'partner' | 'document' | 'policy' | 'invoice'; ownerId: string; kind: string; fileName: string; mime: string; dataBase64: string; note?: string }) {
  const buf = Buffer.from(a.dataBase64, 'base64');
  if (!buf.length) throw Errors.validation('Tệp rỗng');
  if (buf.length > MAX) throw Errors.validation('Tệp quá 15 MB');
  const safe = a.fileName.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(-120) || 'tep';
  const rel = path.join(new Date().toISOString().slice(0, 7), `${randomBytes(8).toString('hex')}-${safe}`);
  const full = path.join(attDir(tenantId), rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf);
  const r = await trx.insertInto('purchase_attachments').values({ tenant_id: tenantId, owner_type: a.ownerType, owner_id: a.ownerId, kind: ATTACHMENT_KINDS[a.kind] ? a.kind : 'khac', file_name: a.fileName.slice(0, 200), mime: a.mime || 'application/octet-stream', size: String(buf.length), path: rel, note: a.note ?? '', uploaded_by: actor }).returning('id').executeTakeFirstOrThrow();
  return { id: String(r.id) };
}

export async function readAttachment(trx: Db, tenantId: string, id: string) {
  const r = await trx.selectFrom('purchase_attachments').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
  if (!r) throw Errors.notFound('tệp đính kèm');
  return { fileName: r.file_name, mime: r.mime, data: await readFile(path.join(attDir(tenantId), r.path)) };
}

export async function deleteAttachment(trx: Db, tenantId: string, id: string) {
  const r = await trx.deleteFrom('purchase_attachments').where('tenant_id', '=', tenantId).where('id', '=', id).returning(['path']).executeTakeFirst();
  if (!r) throw Errors.notFound('tệp đính kèm');
  await unlink(path.join(attDir(tenantId), r.path)).catch(() => undefined);
}

