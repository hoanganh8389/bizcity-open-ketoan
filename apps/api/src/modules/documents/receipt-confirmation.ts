// @bizcity-layer K kernel/intake
/**
 * Kế toán xác nhận đã nhận tiền của phiếu chuyển tiền (bảng cash_transfer_confirmations, migration 0058).
 *
 * Phiếu chuyển tiền từ hệ thống bán hàng đến ở trạng thái "sent": chỉ ghi phía nơi chuyển (Nợ 11319 / Có tiền).
 * Kế toán đối chiếu quỹ / sao kê rồi xác nhận ở ACC14; khi định khoản, chứng từ được ghi như "received" (thêm bút toán
 * nơi nhận: Nợ tiền / Có 11319) — thay bước duyệt sp_ApproveCHUYENTIENSHOWROOM của HTsoft (nhân viên cửa hàng không
 * xác nhận). Như HTsoft: xác nhận chỉ còn hiệu lực khi số tiền, chi nhánh nhận, ngân hàng nhận không đổi so với lúc
 * xác nhận; nguồn gửi bản mới đổi một trong ba thứ đó thì định khoản lại sẽ đảo bút toán nơi nhận, kế toán xác nhận lại.
 */
import type { IngestDocument } from '@ketoan/contracts';
import type { Db } from '../../db/client.js';
import { toNumber } from '../../db/client.js';

export interface ReceiptConfirmation {
  amount: number;
  toBranchCode: string;
  toBankCode: string;
  note: string;
  confirmedBy: string;
  confirmedAt: string;
}

/** Thời điểm (timestamptz) → chuỗi ISO. */
export function isoTime(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

export async function loadReceiptConfirmation(db: Db, eventId: string): Promise<ReceiptConfirmation | undefined> {
  const r = await db.selectFrom('cash_transfer_confirmations').selectAll().where('event_id', '=', eventId).executeTakeFirst();
  return r
    ? { amount: toNumber(r.amount), toBranchCode: r.to_branch_code, toBankCode: r.to_bank_code, note: r.note, confirmedBy: r.confirmed_by, confirmedAt: isoTime(r.confirmed_at) }
    : undefined;
}

/** Xác nhận còn khớp nội dung chứng từ (số tiền, chi nhánh nhận, ngân hàng nhận). */
export function confirmationMatches(doc: IngestDocument, c: ReceiptConfirmation): boolean {
  if (doc.docType !== 'cash_transfer') return false;
  return Math.abs(doc.totals.total - c.amount) < 0.005 && doc.toBranchCode === c.toBranchCode && (doc.toBankCode ?? '') === c.toBankCode;
}

/** Chứng từ chuyển tiền "sent" đã được kế toán xác nhận (còn khớp) → ghi như "received". Loại khác: giữ nguyên. */
export function applyReceiptConfirmation(doc: IngestDocument, c?: ReceiptConfirmation): IngestDocument {
  if (!c || doc.docType !== 'cash_transfer' || doc.status !== 'sent' || !confirmationMatches(doc, c)) return doc;
  return { ...doc, status: 'received' };
}
