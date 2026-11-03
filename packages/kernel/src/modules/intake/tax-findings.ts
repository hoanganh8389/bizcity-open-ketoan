// @bizcity-layer K kernel/intake
// [2026-11-03 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-25 (ADR-0014 D3; PHASE-022 ý "một nguồn luật"): L4 thuế GTGT / hoá đơn / hồ sơ kế toán — IN-VAT-001, IN-INV-001, IN-INV-002, IN-CFG-001, mức warn, dùng hàm kiểm theo một chứng từ của tax.findings.ts
/**
 * Cảnh báo lúc nhập (mức warn, không chặn cửa nạp) cho bốn điểm mà tự chẩn đoán cũng quét theo kỳ — cùng luật, hai thời điểm:
 *   IN-VAT-001  dòng bán ra dùng loại thuế có thuế suất giảm ngoài khoảng ngày giảm  (VAT_REDUCED_RATE; số liệu từ rulepack)
 *   IN-INV-001  hoá đơn mua vào thiếu ký hiệu / tên / mã số thuế người bán            (INVOICE_FIELDS; taxIssues của ACC78)
 *   IN-INV-002  hoá đơn bán hàng lập sau ngày chứng từ (ngày chuyển giao)              (INVOICE_ISSUE_DATE)
 *   IN-CFG-001  đơn vị chưa khai hồ sơ kế toán áp cho ngày chứng từ                    (PROFILE_DECLARED; trọng số 0: lỗi cấu hình, không phải lỗi người lập)
 * Chỉ đọc. Mã số thuế sai dạng đã có IN-MD-005 nên không lặp ở đây.
 */
import { intakeFinding, type IngestDocument, type IntakeFinding } from '@ketoan/contracts';
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';
import { MISSING_FIELD_ISSUES, invoiceFieldIssues, invoiceIssuedAfterDelivery, outsideReducedWindow, reducedRateWindow } from '../tax-info/tax.findings.js';

/** Loại chứng từ có hoá đơn và hướng của hoá đơn đó. */
const DIRECTION: Partial<Record<string, 'input' | 'output'>> = { sale: 'output', sale_return: 'output', purchase: 'input', purchase_return: 'input' };

export async function taxFindings(trx: Db, tenantId: string, doc: IngestDocument): Promise<IntakeFinding[]> {
  const out: IntakeFinding[] = [];
  const direction = DIRECTION[doc.docType];
  const lines = ((doc as { lines?: { taxCode?: string; amountBeforeTax?: number }[] }).lines ?? []);

  // IN-VAT-001: chỉ hàng bán ra (sale)
  if (doc.docType === 'sale') {
    const w = reducedRateWindow();
    if (outsideReducedWindow(doc.docDate, w)) {
      const codes = [...new Set(lines.filter((l) => l.taxCode && Number(l.amountBeforeTax) !== 0).map((l) => l.taxCode!))];
      if (codes.length) {
        const rates = await trx.selectFrom('tax_codes').select(['code', 'rate']).where('tenant_id', '=', tenantId).where('direction', '=', 'output').where('code', 'in', codes).execute();
        const reduced = new Set(rates.filter((r) => Number(r.rate) === w.rate).map((r) => r.code));
        const at = lines.findIndex((l) => l.taxCode && Number(l.amountBeforeTax) !== 0 && reduced.has(l.taxCode));
        if (at >= 0) out.push(intakeFinding('IN-VAT-001', `lines[${at}].taxCode`, { got: lines[at]!.taxCode, expected: `thuế suất ${w.rate}% chỉ áp từ ${w.from} đến ${w.to}` }));
      }
    }
  }

  // IN-INV-001 (hoá đơn mua vào) và IN-INV-002 (hoá đơn bán hàng hoá)
  const inv = (doc as { invoice?: { no?: string; serial?: string; date?: string } }).invoice;
  const partner = (doc as { partner?: { name?: string; taxCode?: string } }).partner;
  if (inv && direction === 'input' && inv.no) {
    const miss = invoiceFieldIssues({ direction, serial: inv.serial ?? '', name: partner?.name ?? '', taxCode: partner?.taxCode ?? '' }, MISSING_FIELD_ISSUES);
    if (miss.length) out.push(intakeFinding('IN-INV-001', 'invoice', { got: miss.join('; '), expected: 'đủ ký hiệu, tên và mã số thuế người bán' }));
  }
  if (inv?.date && doc.docType === 'sale' && invoiceIssuedAfterDelivery(inv.date, doc.docDate)) {
    out.push(intakeFinding('IN-INV-002', 'invoice.date', { got: inv.date, expected: `không sau ngày chứng từ ${doc.docDate.slice(0, 10)}` }));
  }

  // IN-CFG-001: hồ sơ kế toán áp cho ngày chứng từ
  const profile = await trx.selectFrom('accounting_profiles').select('version').where('tenant_id', '=', tenantId).where(sql<boolean>`effective_from <= ${doc.docDate.slice(0, 10)}::date`).executeTakeFirst();
  if (!profile) out.push(intakeFinding('IN-CFG-001', 'docDate', { got: doc.docDate.slice(0, 10), expected: 'đơn vị đã khai hồ sơ kế toán có hiệu lực tới ngày này' }));

  return out;
}
