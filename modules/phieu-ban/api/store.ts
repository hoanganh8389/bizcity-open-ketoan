/**
 * Đọc / ghi CSDL của module phieu-ban (một tệp): bảng mod_phieu_ban.docs, bộ đếm số, và đọc danh mục chuẩn qua bizcity_read.*.
 * Chạy trong ctx.data.module (RLS lọc theo đơn vị). Không chạm bảng của Core.
 */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: kho dữ liệu phiếu bán / trả nhập tay (đóng góp)
import { Errors, roundMoney, sql, type ActionContext } from '@bizcity/module-sdk';
import { DEFAULT_CHANNEL, formatNo, periodOf, type Body, type CatalogItem, type Kind } from './domain/doc.js';

export type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

export type DocRow = {
  doc_id: string; kind: Kind; branch_code: string; warehouse_code: string | null; doc_no: string; doc_date: string; status: 'draft' | 'approved';
  partner_code: string | null; original_doc_id: string | null; body: Body; total: string; ledger_version: number; ledger_status: string | null;
  created_by: string; created_at: Date; updated_by: string; updated_at: Date; approved_by: string | null; approved_at: Date | null;
};

const COLS = sql`doc_id::text, kind, branch_code, warehouse_code, doc_no, doc_date::text, status, partner_code, original_doc_id::text, body, total,
  ledger_version, ledger_status, created_by, created_at, updated_by, updated_at, approved_by, approved_at`;

/** Khuôn TradeDoc trả cho màn (docs/api/13-phieu-nhap-tay.md). */
export function toTradeDoc(r: DocRow) {
  return {
    id: r.doc_id, docType: r.kind, status: r.status, docNo: r.doc_no, docDate: r.doc_date, branchCode: r.branch_code,
    ...r.body, warehouseCode: r.warehouse_code ?? undefined,
    ledgerStatus: r.ledger_status, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
    ...(r.approved_at ? { approvedAt: r.approved_at.toISOString(), approvedBy: r.approved_by } : {}),
  };
}

export async function getDoc(tx: Tx, id: string, lock = false): Promise<DocRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Errors.notFound(`phiếu ${id}`);
  const r = (await sql<DocRow>`SELECT ${COLS} FROM mod_phieu_ban.docs WHERE doc_id = ${id}::uuid ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx)).rows[0];
  if (!r) throw Errors.notFound(`phiếu ${id}`);
  return r;
}

export type ListFilter = { kind: Kind; from?: string; to?: string; branches: string[]; status?: string; search?: string; page: number; pageSize: number; channel?: string };
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: mã kênh của phiếu (phiếu không chọn kênh = kênh mặc định) (đóng góp)
const channelOf = (body: string) => sql`coalesce(nullif(${sql.ref(body)}->>'saleChannel', ''), ${DEFAULT_CHANNEL})`;
export async function listDocs(tx: Tx, f: ListFilter): Promise<{ rows: DocRow[]; total: number }> {
  const q = f.search?.trim();
  const where = sql`kind = ${f.kind}
    ${f.from ? sql`AND doc_date >= ${f.from}::date` : sql``} ${f.to ? sql`AND doc_date <= ${f.to}::date` : sql``}
    ${f.branches.length ? sql`AND branch_code IN (${sql.join(f.branches)})` : sql``}
    ${f.status ? sql`AND status = ${f.status}` : sql``}
    ${f.channel ? sql`AND ${channelOf('body')} = ${f.channel.trim().toUpperCase()}` : sql``}
    ${q ? sql`AND (doc_no ILIKE ${`%${q}%`} OR coalesce(partner_code, '') ILIKE ${`%${q}%`} OR body->'partner'->>'name' ILIKE ${`%${q}%`}
              OR body->'invoice'->>'no' ILIKE ${`%${q}%`} OR coalesce(body->>'note', '') ILIKE ${`%${q}%`})` : sql``}`;
  const total = Number((await sql<{ n: string }>`SELECT count(*) AS n FROM mod_phieu_ban.docs WHERE ${where}`.execute(tx)).rows[0]!.n);
  const rows = (await sql<DocRow>`SELECT ${COLS} FROM mod_phieu_ban.docs WHERE ${where}
    ORDER BY doc_date DESC, created_at DESC LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`.execute(tx)).rows;
  return { rows, total };
}

/** Cấp số kế tiếp của cửa hàng × loại × tháng (khoá dòng bộ đếm trong giao dịch — hai người Ghi cùng lúc không trùng). */
export async function takeNo(tx: Tx, tenantId: string, branch: string, kind: Kind, docDate: string): Promise<string> {
  const period = periodOf(docDate);
  const n = (await sql<{ last_no: number }>`
    INSERT INTO mod_phieu_ban.code_counters (tenant_id, branch_code, kind, period, last_no) VALUES (${tenantId}, ${branch}, ${kind}, ${period}, 1)
    ON CONFLICT (tenant_id, branch_code, kind, period) DO UPDATE SET last_no = mod_phieu_ban.code_counters.last_no + 1, updated_at = now()
    RETURNING last_no`.execute(tx)).rows[0]!.last_no;
  return formatNo(kind, period, n);
}

export async function noTaken(tx: Tx, branch: string, kind: Kind, docNo: string, exceptId?: string): Promise<boolean> {
  return (await sql<{ n: number }>`SELECT 1 AS n FROM mod_phieu_ban.docs WHERE branch_code = ${branch} AND kind = ${kind} AND doc_no = ${docNo}
    ${exceptId ? sql`AND doc_id <> ${exceptId}::uuid` : sql``} LIMIT 1`.execute(tx)).rows.length > 0;
}

export async function saveDoc(tx: Tx, d: {
  docId: string; tenantId: string; kind: Kind; branchCode: string; warehouseCode: string | null; docNo: string; docDate: string; partnerCode: string | null;
  originalDocId: string | null; body: Body; actor: string; insert: boolean;
}): Promise<void> {
  if (d.insert) {
    await sql`INSERT INTO mod_phieu_ban.docs (doc_id, tenant_id, kind, branch_code, warehouse_code, doc_no, doc_date, status, partner_code, original_doc_id, body, total, created_by, updated_by)
      VALUES (${d.docId}::uuid, ${d.tenantId}, ${d.kind}, ${d.branchCode}, ${d.warehouseCode}, ${d.docNo}, ${d.docDate}::date, 'draft', ${d.partnerCode},
              ${d.originalDocId}::uuid, ${JSON.stringify(d.body)}::jsonb, ${d.body.totals.total}, ${d.actor}, ${d.actor})`.execute(tx);
  } else {
    await sql`UPDATE mod_phieu_ban.docs SET branch_code = ${d.branchCode}, warehouse_code = ${d.warehouseCode}, doc_no = ${d.docNo}, doc_date = ${d.docDate}::date,
      partner_code = ${d.partnerCode}, original_doc_id = ${d.originalDocId}::uuid, body = ${JSON.stringify(d.body)}::jsonb, total = ${d.body.totals.total},
      updated_by = ${d.actor}, updated_at = now() WHERE doc_id = ${d.docId}::uuid`.execute(tx);
  }
}

export async function setStatus(tx: Tx, id: string, s: { status: 'draft' | 'approved'; ledgerVersion?: number; ledgerStatus: string | null; actor: string }): Promise<void> {
  await sql`UPDATE mod_phieu_ban.docs SET status = ${s.status}, ledger_status = ${s.ledgerStatus},
      ${s.ledgerVersion !== undefined ? sql`ledger_version = ${s.ledgerVersion},` : sql``}
      approved_by = ${s.status === 'approved' ? s.actor : null}, approved_at = ${s.status === 'approved' ? sql`now()` : null},
      updated_by = ${s.actor}, updated_at = now() WHERE doc_id = ${id}::uuid`.execute(tx);
}

export async function deleteDoc(tx: Tx, id: string): Promise<void> {
  await sql`DELETE FROM mod_phieu_ban.docs WHERE doc_id = ${id}::uuid AND status = 'draft'`.execute(tx);
}

/** Phiếu bán của module theo số (cùng cửa hàng) — để nối phiếu trả với phiếu gốc. */
export async function saleByNo(tx: Tx, branch: string, docNo: string): Promise<DocRow | null> {
  return (await sql<DocRow>`SELECT ${COLS} FROM mod_phieu_ban.docs WHERE branch_code = ${branch} AND kind = 'sale' AND doc_no = ${docNo}`.execute(tx)).rows[0] ?? null;
}

/** Các phiếu trả ĐÃ DUYỆT nối phiếu bán gốc (trừ phiếu đang xét). */
export async function approvedReturnsOf(tx: Tx, originalId: string, exceptId?: string): Promise<DocRow[]> {
  return (await sql<DocRow>`SELECT ${COLS} FROM mod_phieu_ban.docs WHERE original_doc_id = ${originalId}::uuid AND kind = 'sale_return' AND status = 'approved'
    ${exceptId ? sql`AND doc_id <> ${exceptId}::uuid` : sql``}`.execute(tx)).rows;
}

// ------------------------------------------------------------------ danh mục chuẩn (chỉ đọc)

export async function branchExists(tx: Tx, code: string): Promise<boolean> {
  return (await sql`SELECT 1 FROM bizcity_read.branches WHERE code = ${code} AND is_active IS NOT FALSE`.execute(tx)).rows.length > 0;
}

/** Mặt hàng bán được theo mã: tên, ĐVT, mã thuế đầu ra, định danh. Mã ngừng / không bán → không có trong kết quả. */
export async function catalogFor(tx: Tx, skus: readonly string[]): Promise<Map<string, CatalogItem>> {
  const list = [...new Set(skus)];
  if (!list.length) return new Map();
  const rows = (await sql<{ sku: string; name: string; unit: string | null; tax_out_code: string | null; item_id: string | null }>`
    SELECT sku, name, unit, tax_out_code, item_id FROM bizcity_read.products
     WHERE sku IN (${sql.join(list)}) AND is_active IS NOT FALSE AND no_sale IS NOT TRUE`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.sku, { sku: r.sku, name: r.name, unit: r.unit ?? '', taxCode: r.tax_out_code, itemId: r.item_id }]));
}

// [2026-11-16 06:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-021 chặn bán quá tồn ở phiếu bán nhập tay (đóng góp)
/**
 * Khoá chi nhánh × mã (cùng khoá với máy bán: hai nguồn bán một mã chạy nối tiếp) rồi đọc tồn hiện tại theo mã ở kho trên phiếu
 * (không ghi kho = cả chi nhánh). Tồn tại ngày phiếu cần bảng tồn theo ngày ở phần lõi — tạm dùng tồn hiện tại (Q7).
 */
export async function lockedStock(tx: Tx, branchCode: string, warehouseCode: string | null, skus: readonly string[]): Promise<Map<string, number>> {
  const list = [...new Set(skus)].sort();
  if (!list.length) return new Map();
  for (const sku of list) await sql`SELECT pg_advisory_xact_lock(hashtext(${`pos:stock:${branchCode}:${sku}`}))`.execute(tx);
  const rows = (await sql<{ sku: string; qty: string }>`
    SELECT sku, SUM(qty)::text AS qty FROM bizcity_read.stock_on_hand
     WHERE branch_code = ${branchCode} AND sku IN (${sql.join(list)}) ${warehouseCode ? sql`AND warehouse_code = ${warehouseCode}` : sql``}
     GROUP BY sku`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.sku, Number(r.qty)]));
}

/** Thuế suất các mã thuế đầu ra đang dùng. */
export async function taxRates(tx: Tx): Promise<Map<string, number>> {
  const rows = (await sql<{ code: string; rate: string | number }>`
    SELECT code, rate FROM bizcity_read.tax_codes WHERE is_active IS NOT FALSE AND direction IS DISTINCT FROM 'input'`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.code, Number(r.rate)]));
}

export async function activeMethods(tx: Tx): Promise<Set<string>> {
  return new Set((await sql<{ code: string }>`SELECT code FROM bizcity_read.payment_methods WHERE is_active IS NOT FALSE`.execute(tx)).rows.map((r) => r.code));
}

export async function partnerByCode(tx: Tx, code: string): Promise<{ code: string; name: string; taxCode: string | null } | null> {
  const r = (await sql<{ code: string; name: string; tax_code: string | null }>`
    SELECT code, name, tax_code FROM bizcity_read.partners WHERE code = ${code} LIMIT 1`.execute(tx)).rows[0];
  return r ? { code: r.code, name: r.name, taxCode: r.tax_code } : null;
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: khoá theo mã voucher, mã đang nằm ở phiếu bán khác đã duyệt (đóng góp)
/** Khoá theo mã voucher trong giao dịch — cùng khoá máy bán (module pos) và module voucher dùng: hashtext('voucher:'||mã). */
export async function lockVoucher(tx: Tx, code: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`voucher:${code}`}))`.execute(tx);
}

/** Mã voucher đã áp ở phiếu bán KHÁC đang duyệt (body.vouchers) — gồm phiếu module voucher chưa nhận sự kiện. */
export async function voucherHeldByOther(tx: Tx, codes: readonly string[], exceptId: string): Promise<{ code: string; docNo: string; docDate: string }[]> {
  if (!codes.length) return [];
  return (await sql<{ code: string; doc_no: string; doc_date: string }>`
    SELECT v->>'code' AS code, d.doc_no, d.doc_date::text AS doc_date
      FROM mod_phieu_ban.docs d, jsonb_array_elements(COALESCE(d.body->'vouchers', '[]'::jsonb)) v
     WHERE d.kind = 'sale' AND d.status = 'approved' AND d.doc_id <> ${exceptId}::uuid AND v->>'code' IN (${sql.join([...codes])})`.execute(tx)).rows
    .map((r) => ({ code: r.code, docNo: r.doc_no, docDate: r.doc_date }));
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: số liệu phiếu bán / trả đã duyệt theo kênh × cửa hàng cho báo cáo bán theo kênh của module pos (đóng góp)
export type ChannelFact = { channel: string; branchCode: string; orders: number; revenue: number; discount: number; returns: number };
/**
 * Phiếu ĐÃ DUYỆT trong khoảng ngày: phiếu bán → 1 phiếu, doanh thu = tổng thanh toán, khuyến mại = tiền giảm dòng mang chương trình + voucher TGS
 * (quy gồm thuế theo tỉ lệ thuế của dòng); phiếu trả → trả hàng = tổng phiếu, kênh theo phiếu bán gốc (nối) / chính phiếu / mặc định.
 */
export async function channelFacts(tx: Tx, f: { from: string; to: string; branches: string[] }): Promise<ChannelFact[]> {
  const rows = (await sql<{ kind: Kind; branch_code: string; channel: string; total: string; body: Body }>`
    SELECT d.kind, d.branch_code, coalesce(nullif(o.body->>'saleChannel', ''), nullif(d.body->>'saleChannel', ''), ${DEFAULT_CHANNEL}) AS channel, d.total, d.body
      FROM mod_phieu_ban.docs d LEFT JOIN mod_phieu_ban.docs o ON o.doc_id = d.original_doc_id
     WHERE d.status = 'approved' AND d.doc_date BETWEEN ${f.from}::date AND ${f.to}::date
       ${f.branches.length ? sql`AND d.branch_code IN (${sql.join(f.branches)})` : sql``}`.execute(tx)).rows;
  return rows.map((r) => {
    if (r.kind === 'sale_return') return { channel: r.channel, branchCode: r.branch_code, orders: 0, revenue: 0, discount: 0, returns: Number(r.total) };
    const discount = r.body.lines.reduce((s, l) => {
      const v = (l as { voucherDiscount?: number }).voucherDiscount ?? 0;
      const part = (l.policyRef ? l.discount - v : 0) + v;
      const rate = l.amountBeforeTax > 0 ? l.taxAmount / l.amountBeforeTax : 0;
      return s + part * (1 + rate);
    }, 0);
    return { channel: r.channel, branchCode: r.branch_code, orders: 1, revenue: Number(r.total), discount: roundMoney(discount), returns: 0 };
  });
}
