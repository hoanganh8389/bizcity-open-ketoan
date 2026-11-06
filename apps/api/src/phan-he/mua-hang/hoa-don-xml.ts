// @bizcity-layer D modules/mua-hang
// [2026-11-06 10:20 PM Nguyễn Văn Thủy] MH22 — nhận hoá đơn điện tử XML kèm PDF / gói tải về, tự tìm hoặc tạo NCC theo MST, chặn hoá đơn bị thay thế / huỷ (đóng góp)
/**
 * NHẬN HOÁ ĐƠN ĐIỆN TỬ XML: một tệp XML (tải tay trên màn MH22 hoặc cầu nối gửi lên) thành một hoá đơn NCC, kèm mọi tệp gốc để mở xem lại.
 *   Kiểm     đúng khuôn, đúng người mua (cùng MST gốc với đơn vị)
 *   NCC      tìm theo MST người bán; chưa có thì tự tạo, mã = MST
 *   Trạng thái cơ quan thuế: bị thay thế / bị huỷ không nhập, tránh tính tiền hai lần
 *   Trùng    không tạo lại, chỉ đính thêm tệp mới (PDF thường có sau XML)
 * Dòng nhận được mã nhưng chưa rõ ĐVT bên mình thì để chưa nhận diện, không đoán ĐVT: kế toán chọn ở MH22.
 */
import { sql } from 'kysely';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { invoiceLabel, normalizeParsed, readGdtInvoice, sameTaxRoot, type GdtInvoice, type XmlNode } from '@bizcity/mua-hang-domain';
import type { Db } from '../../db/client.js';
import { writeAudit } from '../../core/audit.js';
import { Errors } from '../../core/errors.js';
import { partnerRepository } from '../../modules/partners/partner.repository.js';
import { findDuplicate, invoiceInputSchema, matchLines, matchSources, saveInvoice } from './hoa-don.js';
import { logEvents } from './log.js';
import { addAttachment } from './ncc.js';

const GIOI_HAN_XML = 5 * 1024 * 1024;

export const ingestXmlSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  xmlBase64: z.string().min(1).describe('Nội dung tệp XML gốc, mã hoá base64'),
  gdt: z.object({
    tthai: z.coerce.number().int().optional().describe('Tình trạng hoá đơn trên cổng thuế: 1 gốc, 2 thay thế, 3 điều chỉnh, 4 bị thay thế, 5 bị điều chỉnh, 6 bị huỷ'),
    ttxly: z.coerce.number().int().optional().describe('Tình trạng xử lý trên cổng thuế'),
  }).default({}),
  files: z.array(z.object({
    fileName: z.string().trim().min(1).max(200),
    mime: z.string().max(120).default('application/octet-stream'),
    kind: z.enum(['hoa_don', 'hoa_don_xml', 'khac']).default('khac'),
    dataBase64: z.string().min(1),
    note: z.string().max(500).optional(),
  })).max(5).default([]),
});
export type IngestXmlInput = z.infer<typeof ingestXmlSchema>;

export type IngestStatus = 'saved' | 'duplicate' | 'replaced_or_cancelled' | 'previously_cancelled' | 'wrong_buyer' | 'partner_ambiguous';
export interface IngestResult {
  status: IngestStatus; message: string; label: string; invoiceId?: string; partnerCode?: string; partnerCreated?: boolean;
  lines?: number; unmatched?: number; attached: number; warnings: string[];
}

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true, isArray: (name) => name === 'HHDVu' });

/** XML gốc → cây. Từ chối DOCTYPE (mở rộng thực thể) và bảng mã khác UTF-8: hoá đơn điện tử không dùng tới. */
function parseXml(data: Buffer): GdtInvoice {
  if (!data.length) throw Errors.validation('Tệp XML rỗng');
  if (data.length > GIOI_HAN_XML) throw Errors.validation('Tệp XML quá 5 MB');
  const raw = data.toString('utf8').replace(/^﻿/, '');
  if (/<!DOCTYPE/i.test(raw)) throw Errors.validation('Tệp XML có khai báo DOCTYPE, không nhận');
  const enc = /^<\?xml[^>]*encoding=["']([^"']+)["']/i.exec(raw)?.[1];
  if (enc && !/^utf-?8$/i.test(enc)) throw Errors.validation(`Tệp XML dùng bảng mã ${enc}, chỉ nhận UTF-8`);
  let tree: XmlNode;
  try { tree = parser.parse(raw, true) as XmlNode; } catch (e) { throw Errors.validation(`Tệp XML hỏng: ${(e as Error).message}`); }
  try { return readGdtInvoice(tree); } catch (e) { throw Errors.validation((e as Error).message); }
}

/** NCC theo MST người bán; chưa có thì tạo (mã = MST). Hai đối tượng cùng MST mà không rõ NCC nào thì không đoán. */
async function resolvePartner(trx: Db, tenantId: string, actor: string, inv: GdtInvoice): Promise<{ code: string; created: boolean } | { ambiguous: string[] }> {
  const mst = inv.parsed.sellerTaxCode;
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`partner-tax:${tenantId}:${mst}`}))`.execute(trx);
  const rows = await trx.selectFrom('partners').select(['code', 'kind', 'tax_code']).where('tenant_id', '=', tenantId).where('tax_code', 'in', [mst, mst.replace('-', '')]).orderBy('code').execute();
  const exact = rows.filter((r) => r.tax_code === mst);
  const pool = exact.length ? exact : rows;
  const suppliers = pool.filter((r) => r.kind === 'supplier');
  const pick = suppliers.length === 1 ? suppliers : pool.length === 1 ? pool : [];
  if (pick.length) return { code: pick[0]!.code, created: false };
  if (pool.length) return { ambiguous: pool.map((r) => r.code) };
  const taken = await partnerRepository.findByCode(trx, tenantId, mst);
  if (taken) return { ambiguous: [taken.code] };
  await partnerRepository.upsert(trx, tenantId, { code: mst, name: inv.parsed.sellerName || mst, taxCode: mst, address: inv.sellerAddress.slice(0, 500) || undefined }, 'supplier');
  await writeAudit(trx, { tenantId, actor, action: 'partner.create', objectType: 'partner', objectId: mst, after: { source: 'hoa-don-xml', name: inv.parsed.sellerName, taxCode: mst } });
  return { code: mst, created: true };
}

/** Đính XML gốc đúng từng byte và các tệp gửi kèm. Cùng nội dung đã đính thì không đính lại. Trả về số tệp mới. */
async function attachFiles(trx: Db, tenantId: string, actor: string, invoiceId: string, input: IngestXmlInput): Promise<number> {
  const before = await countAttachments(trx, tenantId, invoiceId);
  await addAttachment(trx, tenantId, actor, { ownerType: 'invoice', ownerId: invoiceId, kind: 'hoa_don_xml', fileName: input.fileName, mime: 'application/xml', dataBase64: input.xmlBase64 });
  for (const f of input.files) await addAttachment(trx, tenantId, actor, { ownerType: 'invoice', ownerId: invoiceId, kind: f.kind, fileName: f.fileName, mime: f.mime, dataBase64: f.dataBase64, note: f.note });
  return (await countAttachments(trx, tenantId, invoiceId)) - before;
}
const countAttachments = async (trx: Db, tenantId: string, invoiceId: string) => Number((await trx.selectFrom('document_attachments').select(sql<string>`COUNT(*)`.as('n')).where('tenant_id', '=', tenantId)
  .where('doc_ref', '=', `mua-hang.invoice:${invoiceId}`).where('archived_at', 'is', null).executeTakeFirstOrThrow()).n);

const NOTE_REPLACED = 'Cổng thuế báo hoá đơn này đã bị thay thế';
const NOTE_CANCELLED = 'Cổng thuế báo hoá đơn này đã bị huỷ';

export async function ingestInvoiceXml(trx: Db, tenantId: string, actor: string, actorName: string, input: IngestXmlInput): Promise<IngestResult> {
  const inv = parseXml(Buffer.from(input.xmlBase64, 'base64'));
  const p = inv.parsed;
  const label = invoiceLabel({ series: p.series ?? '', no: p.no });
  const tthai = input.gdt.tthai;
  const base = { label, attached: 0, warnings: inv.warnings };

  const tenant = await trx.selectFrom('tenants').select(['tax_code']).where('id', '=', tenantId).executeTakeFirst();
  if (tenant?.tax_code && p.buyerTaxCode && !sameTaxRoot(tenant.tax_code, p.buyerTaxCode)) {
    return { ...base, status: 'wrong_buyer', message: `Người mua trên hoá đơn có MST ${p.buyerTaxCode}, khác đơn vị (${tenant.tax_code})` };
  }

  const partner = await resolvePartner(trx, tenantId, actor, inv);
  if ('ambiguous' in partner) return { ...base, status: 'partner_ambiguous', message: `MST ${p.sellerTaxCode} trùng với đối tượng ${partner.ambiguous.join(', ')}: chưa biết dùng NCC nào` };
  const partnerCode = partner.code;

  // Hai lượt gửi cùng một hoá đơn một lúc: lượt sau phải thấy bản của lượt trước.
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`invoice-xml:${tenantId}:${partnerCode}:${(p.series ?? '').toLowerCase()}:${p.no.replace(/^0+/, '')}`}))`.execute(trx);
  const gone = tthai === 4 || tthai === 6;
  const goneNote = tthai === 4 ? NOTE_REPLACED : NOTE_CANCELLED;

  const dup = await findDuplicate(trx, tenantId, partnerCode, p.series ?? '', p.no);
  if (dup) {
    const invoiceId = String(dup.id);
    const attached = await attachFiles(trx, tenantId, actor, invoiceId, input);
    const cur = await trx.selectFrom('supplier_invoices').select(['note', 'data']).where('id', '=', invoiceId).executeTakeFirstOrThrow();
    const data = (typeof cur.data === 'string' ? JSON.parse(cur.data) : cur.data) as Record<string, unknown>;
    const note = gone && !cur.note.includes(goneNote) ? [cur.note, goneNote].filter(Boolean).join('. ').slice(0, 1000) : cur.note;
    await trx.updateTable('supplier_invoices').set({ note, data: JSON.stringify({ ...data, gdt: { ...(data.gdt as object | undefined), ...input.gdt } }), updated_at: new Date(), updated_by: actorName }).where('id', '=', invoiceId).execute();
    if (gone) return { ...base, status: 'replaced_or_cancelled', message: `${goneNote}; bản đã nhập trước đó vẫn còn, cần kế toán xem lại`, invoiceId, partnerCode, attached };
    return { ...base, status: 'duplicate', message: attached ? `Đã có hoá đơn này, đính thêm ${attached} tệp` : 'Đã có hoá đơn này', invoiceId, partnerCode, attached };
  }
  if (gone) return { ...base, status: 'replaced_or_cancelled', message: `${goneNote}: không nhập`, partnerCode };

  // Kế toán đã huỷ hoá đơn này thì không để lượt gửi tự động nhập lại; cần nhập lại thì gõ tay ở MH22.
  const cancelled = await trx.selectFrom('supplier_invoices').select('id').where('tenant_id', '=', tenantId).where('partner_code', '=', partnerCode).where('status', '=', 'cancelled')
    .where(sql<boolean>`ltrim(invoice_no, '0') = ltrim(${p.no}, '0')`).where(sql<boolean>`lower(invoice_series) = lower(${p.series ?? ''})`).executeTakeFirst();
  if (cancelled) return { ...base, status: 'previously_cancelled', message: 'Hoá đơn này đã bị huỷ trên phần mềm trước đó: không tự nhập lại', invoiceId: String(cancelled.id), partnerCode };

  const n = normalizeParsed(p);
  const matched = await matchLines(trx, tenantId, await matchSources(trx, tenantId, partnerCode), n.lines, { suggest: false });
  const related = inv.related?.no ? `${inv.related.series}-${inv.related.no}` : '';
  const notes = [
    'Nhập từ hoá đơn điện tử',
    tthai === 2 ? `Hoá đơn thay thế${related ? ` cho ${related}` : ''}` : '',
    tthai === 3 ? `Hoá đơn điều chỉnh${related ? ` cho ${related}` : ''}: kiểm tra lại số tiền` : '',
    tthai === 5 ? 'Hoá đơn này đã bị điều chỉnh bởi hoá đơn khác' : '',
    inv.currency.toUpperCase() !== 'VND' ? `Ngoại tệ ${inv.currency}: số tiền giữ nguyên theo hoá đơn` : '',
    ...inv.notices,
    ...inv.warnings,
  ].filter(Boolean);
  const parsedInput = invoiceInputSchema.safeParse({
    ...n, partnerCode, source: 'api', note: notes.join('. ').slice(0, 1000),
    data: { fileName: input.fileName, gdt: input.gdt, mccqt: inv.mccqt, currency: inv.currency, sellerAddress: inv.sellerAddress, buyerName: inv.buyerName, related: inv.related, discountLines: inv.discountLines, noteLines: inv.noteLines },
    // Có mã nhưng chưa rõ ĐVT bên mình: để chưa nhận diện, không đoán.
    lines: matched.map((l) => (l.sku && l.unit ? l : { ...l, sku: null, unit: null, matchSource: 'none' as const })),
  });
  if (!parsedInput.success) throw Errors.validation(`Hoá đơn ${label}: ${parsedInput.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  const saved = await saveInvoice(trx, tenantId, actorName, parsedInput.data);
  const attached = await attachFiles(trx, tenantId, actor, saved.id!, input);
  if (partner.created) await logEvents(tenantId, [{ event: 'partner_created_from_invoice', docNo: label, user: actorName, data: { partnerCode, name: p.sellerName } }]);
  return { ...base, status: 'saved', message: partner.created ? `Đã nhập, tạo mới NCC ${partnerCode}` : 'Đã nhập', invoiceId: saved.id!, partnerCode, partnerCreated: partner.created, lines: saved.lines.length, unmatched: saved.lines.filter((l) => !l.sku).length, attached };
}
