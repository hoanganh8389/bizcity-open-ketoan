// @bizcity-layer K kernel/intake
/**
 * Sự kiện Core do Kernel phát (bizcity_event@1 §7), ghi cùng giao dịch với sổ:
 *   bizcity.ledger.entry.posted    — một phiên bản chứng từ đã vào sổ (cửa nạp hoặc eventStore); subject = docKey
 *   bizcity.ledger.entry.reversed  — bút toán của chứng từ bị đảo mà không ghi phiên bản mới (huỷ, bỏ định khoản)
 *   bizcity.period.locked / .unlocked — khoá / mở kỳ; subject = period:<yyyy-mm>
 * Module dùng entry.posted để biết CHẮC sổ đã ghi (vd đổi kỳ hợp đồng sang "đã thu"). Không module nào được phát bizcity.*.
 */
import type { Db } from '../../db/client.js';
import type { AuthContext } from '../../core/auth.js';
import { emitEvent } from '../../core/events.js';

export type KernelEventType = 'bizcity.ledger.entry.posted' | 'bizcity.ledger.entry.reversed' | 'bizcity.period.locked' | 'bizcity.period.unlocked';

export function emitKernelEvent(trx: Db, auth: AuthContext, type: KernelEventType, subject: string, data: Record<string, unknown>): Promise<string | null> {
  return emitEvent(trx, { tenantId: auth.tenantId, type, subject, data, source: 'bizcity.kernel', actor: { kind: auth.kind, id: auth.actor } });
}
