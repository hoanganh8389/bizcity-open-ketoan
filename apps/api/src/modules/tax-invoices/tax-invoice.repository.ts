// @bizcity-layer K kernel/tax
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Sổ hoá đơn: ghi lại hoá đơn của chứng từ có hoá đơn (tax_invoices + lines), làm bảng kê bán ra / mua vào.
 *   bán ra (output): hoá đơn bán, hàng bán trả lại (dấu −);
 *   mua vào (input): hoá đơn đầu vào của phiếu nhập mua, trả hàng nhà cung cấp (dấu −).
 * Luôn phản ánh phiên bản mới nhất: xoá bản cũ của chứng từ rồi ghi lại.
 */
import type { TradeDocument } from '@ketoan/contracts';
import { invoiceDirection, sumMoney } from '@ketoan/contracts';
import type { Db } from '../../db/client.js';
import type { PostingConfig } from '../posting-config/posting-config.repository.js';

export const taxInvoiceRepository = {
  async removeForDocument(db: Db, sourceDocumentId: string): Promise<void> {
    await db.deleteFrom('tax_invoices').where('event_id', '=', sourceDocumentId).execute();
  },

  async saveForDocument(
    db: Db,
    args: { tenantId: string; branchId: string; sourceDocumentId: string; partnerId: string | null; doc: TradeDocument; taxCodes: PostingConfig['taxCodes'] },
  ): Promise<void> {
    const { doc } = args;
    await taxInvoiceRepository.removeForDocument(db, args.sourceDocumentId);
    if (!doc.invoice) return;

    const sign = doc.docType === 'sale_return' || doc.docType === 'purchase_return' ? -1 : 1;
    const direction = invoiceDirection(doc);
    const inv = doc.invoice;
    const row = await db
      .insertInto('tax_invoices')
      .values({
        tenant_id: args.tenantId,
        branch_id: args.branchId,
        direction,
        event_id: args.sourceDocumentId,
        doc_type: doc.docType,
        doc_no: doc.docNo,
        doc_date: doc.docDate.slice(0, 10),
        invoice_no: inv.no,
        invoice_serial: inv.serial,
        invoice_form: inv.form,
        invoice_date: inv.date.slice(0, 10),
        status: inv.status,
        partner_id: args.partnerId,
        // Bán ra: người mua (bán lẻ không ghi tên → "Khách lẻ", đúng cách thể hiện trên bảng kê).
        // Mua vào: cột này giữ tên, mã số thuế của người bán (nhà cung cấp) để bảng kê mua vào đọc chung một chỗ.
        buyer_name: inv.buyerLegalName || inv.buyerName || doc.partner?.name || (direction === 'input' ? '' : 'Khách lẻ'),
        buyer_tax_code: inv.buyerTaxCode || doc.partner?.taxCode || '',
        buyer_address: inv.buyerAddress || doc.partner?.address || '',
        total_before_tax: sumMoney(doc.lines.map((l) => Math.abs(l.amountBeforeTax))),
        total_tax: sumMoney(doc.lines.map((l) => Math.abs(l.taxAmount))),
        sign,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    if (doc.lines.length) {
      await db
        .insertInto('tax_invoice_lines')
        .values(
          doc.lines.map((l, i) => {
            const tax = args.taxCodes.get(l.taxCode);
            return {
              tax_invoice_id: row.id,
              line_no: i + 1,
              sku: l.sku,
              name: l.name,
              unit: l.unit,
              qty: l.qty,
              amount_before_tax: Math.abs(l.amountBeforeTax),
              tax_code: l.taxCode,
              tax_rate: tax?.rate ?? 0,
              report_group: tax?.reportGroup ?? 'KCT',
              tax_amount: Math.abs(l.taxAmount),
            };
          }),
        )
        .execute();
    }
  },
};
