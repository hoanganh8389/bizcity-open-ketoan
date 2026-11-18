/**
 * Cấp số phiếu của máy bán (mod_pos.code_counters), tăng một chiều (nhảy số chấp nhận, Q20).
 * - Dạng cũ (HD / TH): chi nhánh × loại × tháng.
 * - Dạng shop (NT-BH-027, MẶC ĐỊNH từ 18/11/2026): một bộ đếm mỗi shop × loại, không đặt lại (kỳ cố định SHOP); sàn mặc định
 *   bán 9 999 / hoàn 0. Số cuối website báo lên (máy bán gửi kèm bootstrap / xin dải) chỉ NÂNG bộ đếm (raiseShopCounters) — không
 *   bao giờ hạ, không trùng mã đã phát. Mã chi nhánh không dựng được mã 12 ký tự giữ HD / TH theo tháng.
 * Dải số máy xin trước được ghi lại (mod_pos.code_reservations) để báo cáo "Số bill bị thiếu".
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027: bộ đếm dạng shop liên tục + ghi dải số đã cấp cho máy (đóng góp)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 (18/11 anh chốt): sàn mặc định, nâng bộ đếm theo số cuối website báo (đóng góp)
import { sql, type ActionContext } from '@bizcity/module-sdk';
import { codePeriod, formatCode, parseCode } from './domain/order.js';
import { SHOP_PERIOD, isWebsiteLast, shopFloor, shopReturnCode, shopReturnSeq, shopSaleCode, shopSaleSeq, type CodeScheme, type WebsiteLast } from './domain/codes.js';

type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];
type Kind = 'sale' | 'return';

/** Cấp `count` số mới (dạng cũ, theo tháng); trả các mã liên tiếp. */
export async function takeCodes(tx: Tx, tenantId: string, branchCode: string, kind: Kind, period: string, count: number): Promise<string[]> {
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
export async function lastCode(tx: Tx, branchCode: string, kind: Kind, period: string): Promise<number> {
  const r = (await sql<{ last_no: number }>`
    SELECT last_no FROM mod_pos.code_counters WHERE branch_code = ${branchCode} AND kind = ${kind} AND period = ${period}`.execute(tx)).rows[0];
  return r ? Number(r.last_no) : 0;
}

/** Cấp `count` mã theo dạng của cửa hàng (dạng shop: liên tục, sàn mặc định bán 9 999 / hoàn 0; dạng cũ: theo tháng của ngày bán). */
export async function issueCodes(tx: Tx, tenantId: string, branchCode: string, kind: Kind, businessDate: string, count: number, scheme: CodeScheme): Promise<string[]> {
  if (scheme.mode === 'legacy') return takeCodes(tx, tenantId, branchCode, kind, codePeriod(businessDate), count);
  const floor = shopFloor(kind);
  const r = (await sql<{ last_no: number }>`
    INSERT INTO mod_pos.code_counters (tenant_id, branch_code, kind, period, last_no)
    VALUES (${tenantId}, ${branchCode}, ${kind}, ${SHOP_PERIOD}, ${floor + count})
    ON CONFLICT (tenant_id, branch_code, kind, period)
    DO UPDATE SET last_no = GREATEST(mod_pos.code_counters.last_no, ${floor}) + ${count}, updated_at = now()
    RETURNING last_no`.execute(tx)).rows[0]!;
  const last = Number(r.last_no);
  const fmt = kind === 'sale' ? shopSaleCode : shopReturnCode;
  return Array.from({ length: count }, (_, i) => fmt(scheme.shop, last - count + 1 + i));
}

/**
 * Nâng bộ đếm dạng shop lên ít nhất số cuối website báo (bán / hoàn) — KHÔNG bao giờ hạ. Một câu upsert (khoá dòng bộ đếm tới hết giao
 * dịch của module): hai máy cùng báo chạy nối tiếp, cấp số sau đó luôn > số đã nâng. Cửa hàng dạng cũ (HD / TH) hay số không hợp lệ
 * (không phải số nguyên 1…SHOP_LAST_MAX) → bỏ qua. Trả số cuối của bộ đếm sau khi nâng (loại không báo thì không có).
 */
export async function raiseShopCounters(tx: Tx, tenantId: string, branchCode: string, scheme: CodeScheme, last: WebsiteLast): Promise<WebsiteLast> {
  if (scheme.mode !== 'shop') return {};
  const out: WebsiteLast = {};
  for (const [kind, n] of [['sale', last.sale], ['return', last.ret]] as const) {
    if (!isWebsiteLast(n)) continue;
    const r = (await sql<{ last_no: number }>`
      INSERT INTO mod_pos.code_counters (tenant_id, branch_code, kind, period, last_no)
      VALUES (${tenantId}, ${branchCode}, ${kind}, ${SHOP_PERIOD}, ${Math.max(n, shopFloor(kind))})
      ON CONFLICT (tenant_id, branch_code, kind, period)
      DO UPDATE SET last_no = GREATEST(mod_pos.code_counters.last_no, EXCLUDED.last_no), updated_at = now()
      RETURNING last_no`.execute(tx)).rows[0]!;
    if (kind === 'sale') out.sale = Number(r.last_no);
    else out.ret = Number(r.last_no);
  }
  return out;
}

/**
 * Mã máy gửi (số đã xin trước) có phải số đã cấp của dãy đang dùng không: đúng khuôn của dạng hiện hành và không vượt số cuối đã cấp.
 * Mã dạng khác (vd mã HD xin trước khi cửa hàng chuyển sang dạng shop) → false: máy chủ cấp số mới, số cũ thành số thiếu có lý do.
 */
export async function wasIssued(tx: Tx, branchCode: string, kind: Kind, businessDate: string, code: string, scheme: CodeScheme): Promise<boolean> {
  if (scheme.mode === 'legacy') {
    const period = codePeriod(businessDate);
    const no = parseCode(kind, period, code);
    return no !== null && no <= (await lastCode(tx, branchCode, kind, period));
  }
  const no = kind === 'sale' ? shopSaleSeq(scheme.shop, code) : shopReturnSeq(scheme.shop, code);
  return no !== null && no <= (await lastCode(tx, branchCode, kind, SHOP_PERIOD));
}

/** Ghi dải số vừa cấp cho máy (báo cáo số thiếu: số đã cấp mà không đơn nào dùng). */
export async function recordReservation(tx: Tx, r: {
  tenantId: string; branchCode: string; kind: Kind; codes: readonly string[]; businessDate: string; deviceId: string | null;
  actorId: string; actorName: string | null; expiresAt: string;
}): Promise<void> {
  await sql`
    INSERT INTO mod_pos.code_reservations (tenant_id, branch_code, kind, codes, business_date, device_id, reserved_by, reserved_by_name, expires_at)
    VALUES (${r.tenantId}, ${r.branchCode}, ${r.kind}, ${[...r.codes]}::text[], ${r.businessDate}, ${r.deviceId},
            ${r.actorId}, ${r.actorName}, ${r.expiresAt})`.execute(tx);
}
