// [2026-10-31 08:13 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7, S012-2): kiểu LedgerQuery / LedgerQueryRow dùng chung Kernel, runtime action, module-sdk
/**
 * Câu hỏi đọc sổ (năng lực ledger.query, BIZCITY-DATA §7). Module hỏi theo MÃ — không thấy bảng ledger_*, không thấy id nội bộ.
 * Kernel trả lời ở apps/api/src/modules/ledger/ledger-query.ts; module gọi ctx.ledger.query(q).
 */
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

export const ledgerQueryGroupSchema = z.enum(['account', 'partner', 'branch']);
export type LedgerQueryGroup = z.infer<typeof ledgerQueryGroupSchema>;

export const ledgerQuerySchema = z.object({
  /** Ngày cuối, tính cả ngày này. */
  to: isoDate,
  /** Có `from` → tách đầu kỳ (trước `from`) và phát sinh trong kỳ; không có → phát sinh luỹ kế tới `to`, opening = 0. */
  from: isoDate.optional(),
  /** Đầu số tài khoản, vd ['131', '331']. Bỏ trống = mọi tài khoản. */
  accounts: z.array(z.string().regex(/^\d{1,10}$/)).max(50).optional(),
  partnerCode: z.string().min(1).max(64).optional(),
  branchCodes: z.array(z.string().min(1).max(64)).max(100).optional(),
  /** Chiều phân tích {mã chiều: mã giá trị}, vd { contract: 'HD-001' }. Có chiều thì Kernel đọc dòng sổ thay vì số dư ngày. */
  dimension: z.record(z.string().min(1).max(64), z.string().min(1).max(128)).optional(),
  /** Mã hàng (SKU_RULE). */
  sku: z.string().min(1).max(64).optional(),
  /** Gộp theo; mặc định ['account']. */
  groupBy: z.array(ledgerQueryGroupSchema).max(3).optional(),
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

export interface LedgerQueryRow {
  accountCode?: string;
  partnerCode?: string | null;
  branchCode?: string;
  /** Nợ − Có trước `from`. */
  opening: number;
  debit: number;
  credit: number;
  /** opening + debit − credit. */
  closing: number;
}
