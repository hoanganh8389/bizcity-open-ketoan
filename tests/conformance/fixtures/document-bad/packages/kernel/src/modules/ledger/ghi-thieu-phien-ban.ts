// @bizcity-layer K kernel/ledger
// Mẫu SAI: dựng bút toán có sourceDocumentId nhưng không có sourceVersion.
import { ledgerService } from './ledger.service.js';
export async function ghiThieu(trx: any, tenantId: string, actor: string, docId: string, lines: unknown[], accounts: unknown): Promise<unknown> {
  return ledgerService.post(trx, tenantId, actor, {
    docType: 'sale',
    sourceDocumentId: docId,
    lines,
    isReversal: false,
  }, accounts);
}
