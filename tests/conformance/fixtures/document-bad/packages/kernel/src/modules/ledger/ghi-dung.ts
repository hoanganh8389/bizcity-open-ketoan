// @bizcity-layer K kernel/ledger
// Mẫu ĐÚNG: có sourceVersion cùng khối — không bị báo.
import { ledgerService } from './ledger.service.js';
export async function ghiDung(trx: any, tenantId: string, actor: string, docId: string, version: number, lines: unknown[], accounts: unknown): Promise<unknown> {
  return ledgerService.post(trx, tenantId, actor, { docType: 'sale', sourceDocumentId: docId, sourceVersion: version, lines, isReversal: false }, accounts);
}
