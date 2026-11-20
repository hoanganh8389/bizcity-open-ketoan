// @bizcity-layer M data/masterdata
// [2026-11-19 11:40 AM khanhtd] NT-DM-011 — phiên bản tên / MST / địa chỉ của đối tượng (entity_attributes 0087) + hoá đơn lệch MST: route chỉ đọc, đếm cho cảnh báo PART-HINT-005, phép kiểm HT08 PARTNER_TAX_MISMATCH
/**
 * Lịch sử thuộc tính có hiệu lực của đối tượng (NT-DM-011, PHASE-029 · 36):
 *   GET /api/v1/partners/:code/attributes  các phiên bản (từ ngày, đến ngày, tên, MST, địa chỉ) + số hoá đơn lệch MST của từng bản
 *                                          + danh sách hoá đơn lệch.
 * "Hoá đơn lệch" = hoá đơn trong sổ hoá đơn (tax_invoices, còn hiệu lực) của đối tượng mang MST đối tác khác MST hiệu lực tại NGÀY
 * HOÁ ĐƠN (bizcity_entity_attr_at). So phần chữ số (bỏ dấu gạch, khoảng trắng). Chỉ xét đối tượng ĐÃ TỪNG ĐỔI MST (≥ 2 MST khác nhau
 * trong lịch sử), để dữ liệu cũ chưa từng đổi MST không thành việc phải rà. CHỈ ĐỌC — không sửa hoá đơn, không sửa sổ.
 * SQL phép kiểm chép sang lane diagnostics (tests/conformance/diagnostics/masterdata.diag.mjs, DG-MD-3). Đổi một bên thì đổi bên kia (R-DIAG-9).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql } from 'kysely';
import { z } from 'zod';
import { SCREENS } from '@ketoan/contracts';
import { registerDiagnostics, sqlCounts, type DiagCheck, type DiagScope } from '@bizcity/platform/system/diagnostics';
import { db, type Db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { Errors } from '../../core/errors.js';

const digits = (col: ReturnType<typeof sql.ref>) => sql`regexp_replace(coalesce(${col}, ''), '[^0-9]', '', 'g')`;

/** Đối tượng đã từng đổi MST: có ≥ 2 MST (phần chữ số, khác rỗng) khác nhau trong lịch sử. */
const changedTax = sql`(SELECT a.tenant_id, a.entity_id FROM entity_attributes a
                         WHERE a.entity_type = 'partner' AND regexp_replace(coalesce(a.tax_code, ''), '[^0-9]', '', 'g') <> ''
                         GROUP BY a.tenant_id, a.entity_id
                        HAVING count(DISTINCT regexp_replace(a.tax_code, '[^0-9]', '', 'g')) > 1)`;

/** Hoá đơn lệch MST của một đơn vị (tuỳ chọn một đối tượng, một chi nhánh, khoảng ngày). */
const mismatchRows = (tenantId: string, opts: { partnerId?: string; branchId?: string; from?: string; to?: string } = {}) => sql`
  SELECT i.id, i.partner_id, i.invoice_date, i.invoice_serial, i.invoice_no, i.doc_no, i.direction, i.buyer_tax_code AS tax_on_invoice,
         (bizcity_entity_attr_at(i.tenant_id, 'partner', i.partner_id, i.invoice_date)).tax_code AS tax_at_date
    FROM tax_invoices i
    JOIN ${changedTax} c ON c.tenant_id = i.tenant_id AND c.entity_id = i.partner_id
   WHERE i.tenant_id = ${tenantId} AND i.status = 'valid' AND i.partner_id IS NOT NULL
     AND ${digits(sql.ref('i.buyer_tax_code'))} <> ''
     ${opts.partnerId ? sql`AND i.partner_id = ${opts.partnerId}` : sql``}
     ${opts.branchId ? sql`AND i.branch_id = ${opts.branchId}` : sql``}
     ${opts.from ? sql`AND i.invoice_date >= ${opts.from}::date` : sql``}
     ${opts.to ? sql`AND i.invoice_date <= ${opts.to}::date` : sql``}
     AND ${digits(sql.ref('i.buyer_tax_code'))}
         <> regexp_replace(coalesce((bizcity_entity_attr_at(i.tenant_id, 'partner', i.partner_id, i.invoice_date)).tax_code, ''), '[^0-9]', '', 'g')`;

/**
 * Cảnh báo lúc ghi (PART-HINT-005): đổi MST với ngày hiệu lực đã qua → số hoá đơn từ ngày đó vẫn mang MST HIỆN HÀNH (sắp thành MST cũ).
 * Không đổi MST, không có ngày, ngày từ hôm nay trở đi, hoặc đối tượng chưa có → 0.
 */
export async function countInvoicesKeepingOldTax(trx: Db, tenantId: string, code: string, newTaxCode: string | null | undefined, validFrom: string | null | undefined): Promise<{ count: number; oldTaxCode: string }> {
  const none = { count: 0, oldTaxCode: '' };
  if (!validFrom) return none;
  const p = await trx.selectFrom('partners').select(['id', 'tax_code']).where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  const oldTax = (p?.tax_code ?? '').replace(/\D/g, '');
  if (!p || !oldTax || oldTax === (newTaxCode ?? '').replace(/\D/g, '')) return none;
  const r = await sql<{ n: number }>`
    SELECT count(*)::int AS n FROM tax_invoices i
     WHERE i.tenant_id = ${tenantId} AND i.partner_id = ${p.id} AND i.status = 'valid'
       AND i.invoice_date >= ${validFrom}::date AND i.invoice_date <= CURRENT_DATE
       AND regexp_replace(i.buyer_tax_code, '[^0-9]', '', 'g') = ${oldTax}`.execute(trx);
  return { count: Number(r.rows[0]?.n ?? 0), oldTaxCode: p.tax_code ?? '' };
}

/**
 * Ngày hiệu lực người dùng chọn (NT-DM-011): ≤ hôm nay và SAU ngày bắt đầu của phiên bản đang dùng. Kiểm ở đây để báo lỗi nhập liệu
 * rõ ràng; trigger 0168 vẫn chặn ở CSDL cho mọi đường ghi.
 */
export async function assertValidFrom(trx: Db, tenantId: string, code: string, validFrom: string): Promise<void> {
  const r = await sql<{ today: string; open_from: string | null }>`
    SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today,
           (SELECT to_char(a.valid_from, 'YYYY-MM-DD') FROM entity_attributes a JOIN partners p ON p.id = a.entity_id AND p.tenant_id = a.tenant_id
             WHERE a.tenant_id = ${tenantId} AND a.entity_type = 'partner' AND p.code = ${code} AND a.valid_to IS NULL) AS open_from`.execute(trx);
  const { today, open_from: openFrom } = r.rows[0]!;
  const vn = (d: string) => d.split('-').reverse().join('/');
  if (validFrom > today) throw Errors.validation(`Ngày hiệu lực ${vn(validFrom)} không được sau hôm nay (${vn(today)}).`, { field: 'validFrom' });
  if (openFrom && validFrom <= openFrom) {
    throw Errors.validation(`Ngày hiệu lực ${vn(validFrom)} phải sau ngày bắt đầu của phiên bản đang dùng (${vn(openFrom)}): phiên bản ghi theo thứ tự ngày, nhập thay đổi cũ hơn trước.`, { field: 'validFrom' });
  }
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

export async function partnerAttributeRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/partners/:code/attributes', {
    preHandler: requirePermission('catalog:read'),
    schema: {
      tags: ['Danh mục: Đối tượng'],
      summary: 'Lịch sử tên / MST / địa chỉ theo ngày hiệu lực của một đối tượng, kèm hoá đơn mang MST khác MST hiệu lực tại ngày hoá đơn (chỉ đọc, NT-DM-011)',
      params: z.object({ code: z.string() }),
    },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const p = await db.selectFrom('partners').select(['id']).where('tenant_id', '=', tenantId).where('code', '=', req.params.code).executeTakeFirst();
      if (!p) throw Errors.notFound(`đối tượng ${req.params.code}`);
      const versions = await db.selectFrom('entity_attributes')
        .select(['id', 'version', 'valid_from', 'valid_to', 'name', 'tax_code', 'address', 'created_by', 'created_at', 'note'])
        .where('tenant_id', '=', tenantId).where('entity_type', '=', 'partner').where('entity_id', '=', p.id).orderBy('version', 'desc').execute();
      const bad = (await sql<{ invoice_date: unknown; invoice_serial: string; invoice_no: string; doc_no: string; direction: string; tax_on_invoice: string; tax_at_date: string | null }>`
        SELECT * FROM (${mismatchRows(tenantId, { partnerId: p.id })}) x ORDER BY x.invoice_date, x.invoice_no LIMIT 500`.execute(db)).rows;
      const mismatches = bad.map((x) => ({
        invoiceDate: iso(x.invoice_date), invoiceSerial: x.invoice_serial, invoiceNo: x.invoice_no, docNo: x.doc_no, direction: x.direction,
        taxCodeOnInvoice: x.tax_on_invoice, taxCodeAtDate: x.tax_at_date ?? '',
      }));
      return ok({
        versions: versions.map((v) => {
          const from = iso(v.valid_from)!;
          const to = iso(v.valid_to);
          return {
            version: v.version, validFrom: from, validTo: to, name: v.name, taxCode: v.tax_code ?? '', address: v.address ?? '',
            createdBy: v.created_by, createdAt: v.created_at, note: v.note,
            mismatched: mismatches.filter((m) => m.invoiceDate! >= from && (!to || m.invoiceDate! < to)).length,
          };
        }),
        mismatches,
      });
    },
  });
}

/** Phép kiểm HT08 (L3, warn): hoá đơn lệch MST đối tượng. Mẫu <mã đối tượng>:<số hoá đơn>:<dd/mm/yyyy>. */
export const PARTNER_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'PARTNER_TAX_MISMATCH', closeRef: 'PC-011', layer: 'L3', level: 'warn', scoped: true,
    remedy: {
      steps: [
        { text: 'Mở hồ sơ đối tượng trong mẫu, mục Lịch sử MST, tên, địa chỉ để xem hoá đơn lệch', screen: SCREENS.DM03, role: 'accountant' },
        { text: 'Hỏi nhà cung cấp / khách hàng: hoá đơn lập trước ngày đổi MST thì ghi lý do khi khoá kỳ', role: 'accountant' },
        { text: 'Hoá đơn lập sau ngày đổi mà vẫn ghi MST cũ: yêu cầu đối tác lập hoá đơn điều chỉnh / thay thế (NĐ 123/2020)', role: 'chief_accountant' },
      ],
      owner: 'accountant', verify: { code: 'PARTNER_TAX_MISMATCH' },
    },
    title: 'Hoá đơn của đối tượng đã đổi MST mang đúng MST hiệu lực tại ngày hoá đơn',
    fix: 'Đối tượng đã đổi MST theo ngày hiệu lực mà hoá đơn từ ngày đó vẫn mang MST cũ (hoặc ngược lại): kê khai thuế, khấu trừ đầu vào có thể bị loại. Rà với đối tác, không sửa hoá đơn đã nhận. Mẫu: <mã đối tượng>:<số hoá đơn>:<dd/mm/yyyy>.',
    run: (trx, s: DiagScope) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM tax_invoices i JOIN ${changedTax} c ON c.tenant_id = i.tenant_id AND c.entity_id = i.partner_id
           WHERE i.tenant_id = ${s.tenantId} AND i.status = 'valid'
             ${s.branchId ? sql`AND i.branch_id = ${s.branchId}` : sql``}
             ${s.from ? sql`AND i.invoice_date >= ${s.from}::date` : sql``} ${s.to ? sql`AND i.invoice_date <= ${s.to}::date` : sql``}`,
      sql`SELECT p.code || ':' || x.invoice_no || ':' || to_char(x.invoice_date, 'DD/MM/YYYY') AS key, count(*) OVER ()::int AS total
            FROM (${mismatchRows(s.tenantId, { branchId: s.branchId, from: s.from, to: s.to })}) x JOIN partners p ON p.id = x.partner_id
           ORDER BY x.invoice_date, p.code LIMIT 20`),
  },
];
// Đăng ký theo mã (gọi lại không trùng) — không sửa app.ts (đang thuộc dòng giữ chỗ khác, NT-DM-011 §3.4).
registerDiagnostics(PARTNER_DIAGNOSTICS);
