// @bizcity-layer K kernel/config
// [2026-11-03 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-MOD-2, C-7): phân hệ cần lý do riêng (vd quà tặng, giảm giá hàng mua) thì nhờ Kernel thêm — không ghi thẳng posting_reasons
/**
 * Lý do định khoản là cấu hình của Kernel (quyết định tài khoản khi ghi sổ). Phân hệ cần một lý do riêng thì gọi
 * ensurePostingReason: chỉ THÊM khi mã chưa có (không đè lý do kế toán đã sửa), ghi bằng chứng `reason.ensure`, cờ `module`
 * cho biết phân hệ nào cần lý do này. Đổi / xoá lý do vẫn chỉ qua màn Cấu hình hạch toán.
 */
import type { Db } from '@bizcity/platform/db/client';
import { writeAudit } from '@bizcity/platform/core/audit';

export interface EnsureReasonInput {
  code: string;
  name: string;
  kind: 'in' | 'out';
  counterAccount?: string | null;
  revenueAccount?: string | null;
  expenseAccount?: string | null;
  flags?: Record<string, unknown>;
}

/** Thêm lý do nếu chưa có. Trả true khi vừa thêm. */
export async function ensurePostingReason(trx: Db, tenantId: string, module: string, actor: string, r: EnsureReasonInput): Promise<boolean> {
  const added = await trx.insertInto('posting_reasons').values({
    tenant_id: tenantId, code: r.code, name: r.name, kind: r.kind,
    counter_account: r.counterAccount ?? null, revenue_account: r.revenueAccount ?? null, expense_account: r.expenseAccount ?? null,
    flags: JSON.stringify({ ...(r.flags ?? {}), module }),
  } as never).onConflict((oc) => oc.columns(['tenant_id', 'code'] as never).doNothing()).returning('code').executeTakeFirst();
  if (added) await writeAudit(trx, { tenantId, actor, action: 'reason.ensure', objectType: 'posting_reason', objectId: r.code, after: { ...r, module } });
  return Boolean(added);
}
