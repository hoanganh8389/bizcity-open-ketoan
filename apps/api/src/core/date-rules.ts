// @bizcity-layer P documents
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Khoá dữ liệu theo ngày (ngoài khoá kỳ). Cấu hình ở tenants.settings.dataLock, sửa ở màn ACC2 tab "Khoá theo ngày":
 *   - lockUntil       : chứng từ có ngày đến hết ngày này thì không lập, sửa, huỷ được.
 *   - editWithinDays  : chỉ lập, sửa, huỷ chứng từ có ngày trong N ngày gần nhất (0 = không giới hạn).
 *   - todayOnly       : chỉ lập, sửa phiếu đúng ngày hôm nay (không lập phiếu ngày quá khứ hay tương lai).
 *   - noCancelForAccountant : kế toán viên không huỷ được phiếu (chỉ sửa).
 * Chủ đơn vị, kế toán trưởng (quyền documents:bypass-date-lock) và khoá API không bị các luật này chặn;
 * khoá kỳ vẫn áp cho mọi người.
 */
import { z } from 'zod';
import type { Db } from '../db/client.js';
import type { AuthContext } from './auth.js';
import { Errors } from './errors.js';

export const dataLockSchema = z.object({
  lockUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  editWithinDays: z.number().int().min(0).max(3650).default(0),
  todayOnly: z.boolean().default(false),
  noCancelForAccountant: z.boolean().default(false),
});
export type DataLock = z.infer<typeof dataLockSchema>;

export const readDataLock = (settings: unknown): DataLock =>
  dataLockSchema.parse((settings as { dataLock?: unknown } | null)?.dataLock ?? {});

/** Ngày hôm nay theo giờ Việt Nam, YYYY-MM-DD. */
export function todayVN(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

const vn = (d: string) => d.split('-').reverse().join('/');
const minusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** Lý do bị chặn (null = được phép). `dates`: ngày cũ (khi sửa / huỷ) và ngày mới của chứng từ. */
export function dateRuleViolation(
  rules: DataLock,
  auth: Pick<AuthContext, 'kind' | 'role' | 'permissions'>,
  action: 'lập' | 'sửa' | 'huỷ',
  dates: string[],
  today = todayVN(),
): string | null {
  if (auth.kind !== 'user' || auth.permissions.has('documents:bypass-date-lock')) return null;
  if (action === 'huỷ' && rules.noCancelForAccountant) return 'Bạn không có quyền huỷ phiếu. Cần kế toán trưởng huỷ.';
  for (const d of dates) {
    if (rules.lockUntil && d <= rules.lockUntil) return `Dữ liệu đang khoá đến ngày ${vn(rules.lockUntil)}: không ${action} được chứng từ ngày ${vn(d)}.`;
    if (rules.editWithinDays > 0 && d < minusDays(today, rules.editWithinDays)) return `Chỉ được ${action} chứng từ trong ${rules.editWithinDays} ngày gần nhất (chứng từ ngày ${vn(d)}).`;
    if (rules.todayOnly && action !== 'huỷ' && d !== today) return `Bạn chỉ được ${action} phiếu ngày hôm nay (${vn(today)}).`;
  }
  return null;
}

/** Kiểm tra luật khoá theo ngày của đơn vị; vi phạm thì báo lỗi 403. */
export async function assertDateRules(trx: Db, auth: AuthContext, action: 'lập' | 'sửa' | 'huỷ', dates: string[]): Promise<void> {
  if (auth.kind !== 'user' || auth.permissions.has('documents:bypass-date-lock')) return;
  const t = await trx.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
  const msg = dateRuleViolation(readDataLock(t.settings), auth, action, dates);
  if (msg) throw Errors.forbidden(msg);
}
