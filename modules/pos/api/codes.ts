/** Cấp số phiếu của máy bán (mod_pos.code_counters): chi nhánh × loại × tháng, tăng một chiều (nhảy số chấp nhận, Q20). */
import { sql, type ActionContext } from '@bizcity/module-sdk';
import { formatCode } from './domain/order.js';

type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

/** Cấp `count` số mới; trả các mã liên tiếp. */
export async function takeCodes(tx: Tx, tenantId: string, branchCode: string, kind: 'sale' | 'return', period: string, count: number): Promise<string[]> {
  const r = (await sql<{ last_no: number }>`
    INSERT INTO mod_pos.code_counters (tenant_id, branch_code, kind, period, last_no)
    VALUES (${tenantId}, ${branchCode}, ${kind}, ${period}, ${count})
    ON CONFLICT (tenant_id, branch_code, kind, period)
    DO UPDATE SET last_no = mod_pos.code_counters.last_no + ${count}, updated_at = now()
    RETURNING last_no`.execute(tx)).rows[0]!;
  const last = Number(r.last_no);
  return Array.from({ length: count }, (_, i) => formatCode(kind, period, last - count + 1 + i));
}

/** Số cuối đã cấp (0 = chưa cấp số nào). */
export async function lastCode(tx: Tx, branchCode: string, kind: 'sale' | 'return', period: string): Promise<number> {
  const r = (await sql<{ last_no: number }>`
    SELECT last_no FROM mod_pos.code_counters WHERE branch_code = ${branchCode} AND kind = ${kind} AND period = ${period}`.execute(tx)).rows[0];
  return r ? Number(r.last_no) : 0;
}
