// @bizcity-layer K kernel/intake
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
// [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009).
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/documents/kernel-events.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
/**
 * Sự kiện Core do Kernel phát (bizcity_event@1 §7), ghi cùng giao dịch với sổ:
 *   bizcity.ledger.entry.posted    — một phiên bản chứng từ đã vào sổ (cửa nạp hoặc eventStore); subject = docKey
 *   bizcity.ledger.entry.reversed  — bút toán của chứng từ bị đảo mà không ghi phiên bản mới (huỷ, bỏ định khoản)
 *   bizcity.period.locked / .unlocked — khoá / mở kỳ; subject = period:<yyyy-mm>
 *   bizcity.posting.policy.published — phát hành chính sách kế toán mới (ADR-0009); subject = policy:<version>
 * Module dùng entry.posted để biết CHẮC sổ đã ghi (vd đổi kỳ hợp đồng sang "đã thu"). Không module nào được phát bizcity.*.
 */
import type { Db } from '@bizcity/platform/db/client';
import type { AuthContext } from '@bizcity/platform/core/auth';
import { emitEvent } from '@bizcity/platform/core/events';

export type KernelEventType = 'bizcity.ledger.entry.posted' | 'bizcity.ledger.entry.reversed' | 'bizcity.period.locked' | 'bizcity.period.unlocked'
  | 'bizcity.posting.policy.published';

export function emitKernelEvent(trx: Db, auth: AuthContext, type: KernelEventType, subject: string, data: Record<string, unknown>): Promise<string | null> {
  return emitEvent(trx, { tenantId: auth.tenantId, type, subject, data, source: 'bizcity.kernel', actor: { kind: auth.kind, id: auth.actor } });
}
