// @bizcity-layer K kernel/intake
/**
 * Cửa ghi sổ cho sự việc do Kernel tự lập (phiếu kế toán tay, số dư đầu kỳ, kết chuyển, khấu hao / phân bổ, giá vốn).
 * Chứng từ nhận từ nguồn ngoài đi postDocumentIn() (luật định khoản); các dịch vụ trên tự dựng dòng Nợ / Có nên không
 * qua luật, nhưng phải đi chung chuỗi phiên bản này để sổ truy vết được (STD-DOM-1, -11; AP-1, AP-5):
 *
 *   lock(docKey) → reverseActive() → saveVersion() → post() → markPosted()      (hoặc cancel() khi không còn số)
 *
 * - Bút toán luôn gắn (sự việc, phiên bản): post() tự điền sourceDocumentId / sourceVersion.
 * - markPosted() đặt posted_version = phiên bản vừa ghi và ghi posting_log — chung một chỗ cho mọi dịch vụ.
 * - Ngoài modules/{ledger,posting,documents} không gọi ledgerService (SC-KERNEL-3, R-LEDGER-4).
 */
import type { Db } from '../../db/client.js';
import type { Account } from '../../db/types.js';
import type { AuthContext } from '../../core/auth.js';
import { ledgerRepository } from '../ledger/ledger.repository.js';
import { ledgerService } from '../ledger/ledger.service.js';
import type { DraftEntry } from '../ledger/ledger.types.js';
import { documentRepository } from './document.repository.js';
import { logPosting } from './document.service.js';

type Accounts = Map<string, Account>;
type EventRow = NonNullable<Awaited<ReturnType<typeof documentRepository.findByKeyForUpdate>>>;

/** Nội dung một phiên bản sự việc (các cột của accounting_events đổi theo phiên bản). */
export interface EventVersionFields {
  branch_id: string;
  doc_date: string;
  total: number;
  payload: string;
  partner_id?: string | null;
}

export const eventStore = {
  /** Khoá dòng sự việc theo docKey tới hết giao dịch; chưa có thì trả undefined. */
  lock(trx: Db, tenantId: string, docKey: string) {
    return documentRepository.findByKeyForUpdate(trx, tenantId, docKey);
  },

  /** Đảo (ghi số âm) mọi bút toán còn hiệu lực của sự việc. Trả số bút toán đã đảo. */
  async reverseActive(trx: Db, auth: AuthContext, eventId: string, accounts: Accounts, reason: string): Promise<number> {
    const active = await ledgerRepository.findActiveEntriesBySource(trx, auth.tenantId, eventId);
    for (const e of active) await ledgerService.reverse(trx, auth.tenantId, auth.actor, e.id, accounts, reason);
    return active.length;
  },

  /**
   * Lưu phiên bản mới: sự việc đã có thì cất phiên bản cũ (accounting_event_versions) rồi ghi đè, phiên bản + 1;
   * chưa có thì thêm, phiên bản 1. Không đụng sổ.
   */
  async saveVersion(
    trx: Db,
    auth: AuthContext,
    existing: EventRow | undefined,
    v: { docKey: string; docType: string; docNo: string; sourceSystem?: string; createdBy?: string; fields: EventVersionFields },
  ): Promise<{ id: string; version: number }> {
    const version = (existing?.version ?? 0) + 1;
    if (existing) {
      await documentRepository.archiveVersion(trx, existing.id, existing.version, existing.payload, existing.received_at);
      await documentRepository.update(trx, existing.id, { ...v.fields, version, received_at: new Date() });
      return { id: existing.id, version };
    }
    const created = await documentRepository.insert(trx, {
      tenant_id: auth.tenantId, source_system: v.sourceSystem ?? 'manual', doc_key: v.docKey, doc_type: v.docType, doc_no: v.docNo,
      invoice_no: null, partner_id: null, ...(v.createdBy ? { created_by: v.createdBy } : {}), ...v.fields, version,
    });
    return { id: created.id, version };
  },

  /** Ghi một bút toán của phiên bản `version` của sự việc. */
  post(
    trx: Db,
    auth: AuthContext,
    event: { id: string; version: number },
    entry: Omit<DraftEntry, 'sourceDocumentId' | 'sourceVersion' | 'isReversal' | 'reversesEntryId'>,
    accounts: Accounts,
  ): Promise<{ id: string; entryNo: string }> {
    return ledgerService.post(trx, auth.tenantId, auth.actor, { ...entry, sourceDocumentId: event.id, sourceVersion: event.version }, accounts);
  },

  /** Chốt phiên bản đã vào sổ: status posted, posted_version = version, một dòng posting_log. */
  async markPosted(
    trx: Db,
    auth: AuthContext,
    v: { id: string; version: number; docType: string; docNo: string; entryIds: string[]; reversed?: number; total?: number | null; action?: 'post' | 'repost' },
  ): Promise<void> {
    await documentRepository.update(trx, v.id, { status: 'posted', posted_at: new Date(), posted_version: v.version, error_code: null, error_message: null });
    await logPosting(trx, {
      tenantId: auth.tenantId, eventId: v.id, docType: v.docType, docNo: v.docNo, version: v.version,
      action: v.action ?? (v.version > 1 ? 'repost' : 'post'), entryIds: v.entryIds, reversed: v.reversed ?? 0, total: v.total, actor: auth.actor,
    });
  },

  /** Huỷ sự việc (người gọi đã đảo hết bút toán): status cancelled + posting_log. */
  async cancel(trx: Db, auth: AuthContext, row: EventRow, v: { message: string; reversed?: number }): Promise<void> {
    await documentRepository.update(trx, row.id, { status: 'cancelled', error_message: v.message });
    await logPosting(trx, {
      tenantId: auth.tenantId, eventId: row.id, docType: row.doc_type, docNo: row.doc_no, version: row.version,
      action: 'cancel', reversed: v.reversed ?? 0, message: v.message, actor: auth.actor,
    });
  },

  /**
   * Ngoại lệ đóng danh sách của RULE-LEDGER: ghi đè số tiền cặp dòng chờ giá vốn (cost_fill), không đảo bút toán.
   * Chỉ tính giá vốn (modules/inventory/costing.service.ts) được gọi.
   */
  overwriteCostPairs(trx: Db, tenantId: string, pairs: { entryId: string; pairNo: number; amount: number }[], accounts: Accounts): Promise<number> {
    return ledgerService.overwriteCostPairs(trx, tenantId, pairs, accounts);
  },
};
