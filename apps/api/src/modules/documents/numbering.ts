// @bizcity-layer K kernel/intake
// [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — documents.numbering (PHASES 2.7): một chỗ cấp số trên bộ đếm document_sequences; phiếu tay, quy, mua-hang, ctx.documents.nextNumber cùng dùng
/**
 * Bộ đếm số chứng từ (bizcity_document@1 §3, STD-DOC-6). Bảng document_sequences là của Kernel: không nơi nào khác ghi.
 * Một dãy = (đơn vị, khoá dãy, năm); lấy số kế tiếp trong giao dịch của người gọi — giao dịch huỷ thì số không bị dùng.
 * Khoá dãy: Kernel dùng loại phiếu (manual, receipt…); phân hệ cũ giữ khoá sẵn có (payment_request, mh:<loại>) để không
 * nhảy số; module mới đi qua ctx.documents.nextNumber, khoá là <module>:<dãy> (Platform tự gắn tiền tố).
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';

const KEY_RE = /^[a-z][a-z0-9_:-]{0,63}$/;

export const documentNumbers = {
  /** Số kế tiếp của dãy (bắt đầu từ 1 mỗi năm). */
  async next(trx: Db, tenantId: string, key: string, year: number): Promise<number> {
    if (!KEY_RE.test(key)) throw Errors.validation(`Khoá dãy số không hợp lệ: ${key}`);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw Errors.validation(`Năm của dãy số không hợp lệ: ${year}`);
    const row = await trx
      .insertInto('document_sequences')
      .values({ tenant_id: tenantId, doc_type: key, year, last_no: 1 })
      .onConflict((oc) => oc.columns(['tenant_id', 'doc_type', 'year']).doUpdateSet({ last_no: sql`document_sequences.last_no + 1` }))
      .returning('last_no')
      .executeTakeFirstOrThrow();
    return Number(row.last_no);
  },
};
