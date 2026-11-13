// @bizcity-layer D modules/ban-hang
// [2026-11-13 03:10 PM Võ Hoàng] UX-14 — việc cần làm của phân hệ Bán hàng cho Luồng chi tiết (chữ chốt cap-nhat-ux/14 mục 4, phiếu NT-BH-013 §5 dòng 4) (đóng góp)
/**
 * GET /api/v1/ban-hang/viec-can-lam — chỉ đọc, quyền reports:read. Gom việc tồn đọng của Bán hàng để trang Luồng chi tiết hiện ở khung
 * "Việc cần làm" và gắn vào đúng ô:
 *   - chứng từ bán / trả lỗi định khoản, chờ định khoản (theo loại, để đếm ở ô);
 *   - chương trình bán đang chạy đã dùng ≥ 90 % hạn mức ở một cửa hàng;
 *   - phải thu quá hạn (khoản nợ TK 131 đã qua hạn trả, còn dư).
 * Việc của máy bán POS (đơn chờ tiền QR, ca chưa chốt) do trang đọc ở module `pos` — Core không đọc bảng của module.
 */
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { db } from '../../db/client.js';

export interface ViecItem { key: string; level: 'error' | 'warn' | 'info'; text: string; count: number; amount?: number; path: string }
export interface ViecCanLam { byKind: Record<string, { pending: number; error: number }>; items: ViecItem[] }

export async function viecCanLam(tenantId: string, today: string): Promise<ViecCanLam> {
  const byKind: ViecCanLam['byKind'] = { sale: { pending: 0, error: 0 }, sale_return: { pending: 0, error: 0 } };
  const docs = (await sql<{ doc_type: string; status: string; n: string }>`
    SELECT doc_type, status, count(*)::text AS n FROM accounting_events
     WHERE tenant_id = ${tenantId} AND doc_type IN ('sale', 'sale_return') AND status IN ('pending', 'error')
     GROUP BY doc_type, status`.execute(db)).rows;
  for (const r of docs) byKind[r.doc_type]![r.status as 'pending' | 'error'] = Number(r.n);

  const items: ViecItem[] = [];
  const errors = byKind.sale!.error + byKind.sale_return!.error;
  const pending = byKind.sale!.pending + byKind.sale_return!.pending;
  if (errors) items.push({ key: 'doc_error', level: 'error', text: 'chứng từ bán / trả lỗi định khoản — sửa rồi ghi sổ lại', count: errors, path: '/chung-tu?status=error' });
  if (pending) items.push({ key: 'doc_pending', level: 'warn', text: 'chứng từ bán / trả chờ định khoản', count: pending, path: '/chung-tu?status=pending' });

  const quota = (await sql<{ n: string }>`
    SELECT count(*)::text AS n FROM sale_program_quotas q JOIN sale_programs p ON p.id = q.program_id
     WHERE q.tenant_id = ${tenantId} AND p.is_active AND p.valid_from <= ${today}::date AND p.valid_to >= ${today}::date
       AND q.quota_qty > 0 AND q.used_qty >= q.quota_qty * 0.9`.execute(db)).rows[0];
  if (Number(quota?.n)) items.push({ key: 'program_quota', level: 'warn', text: 'chương trình bán sắp hết / đã hết hạn mức ở cửa hàng (≥ 90 %)', count: Number(quota!.n), path: '/ban-hang/chuong-trinh' });

  const overdue = (await sql<{ partners: string; amount: string | null }>`
    SELECT count(DISTINCT x.partner_id)::text AS partners, sum(x.remaining)::text AS amount FROM (
      SELECT i.partner_id, i.amount - COALESCE((SELECT sum(a.amount) FROM debt_allocations a
               WHERE (a.debit_item_id = i.id OR a.credit_item_id = i.id) AND a.alloc_date <= ${today}::date), 0) AS remaining
        FROM debt_items i
       WHERE i.tenant_id = ${tenantId} AND i.account_code LIKE '131%' AND i.side = 'debit' AND i.due_date < ${today}::date
    ) x WHERE x.remaining > 0`.execute(db)).rows[0];
  if (Number(overdue?.partners)) items.push({ key: 'receivable_overdue', level: 'warn', text: 'khách còn nợ quá hạn', count: Number(overdue!.partners), amount: Math.round(Number(overdue!.amount ?? 0)), path: '/bao-cao/tuoi-no-qua-han' });

  return { byKind, items };
}

export async function viecCanLamRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/ban-hang/viec-can-lam', { preHandler: requirePermission('reports:read'), schema: { tags: ['Bán hàng'], summary: 'Việc cần làm của phân hệ Bán hàng (Luồng chi tiết)' } }, async (req) => {
    const today = (await sql<{ d: string }>`SELECT current_date::text AS d`.execute(db)).rows[0]!.d;
    return ok(await viecCanLam(authOf(req).tenantId, today));
  });
}
