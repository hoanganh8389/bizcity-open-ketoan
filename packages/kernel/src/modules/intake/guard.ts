// @bizcity-layer K kernel/intake
// [2026-11-03 09:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-29 (ADR-0019, R-GATE-8): Commit Guard — dấu cấu hình lúc tiền kiểm so với lúc ghi sổ (IN-GUARD-001)
/**
 * COMMIT GUARD (ADR-0019, R-GATE-8). Tiền kiểm trả `guard` = dấu của phần cấu hình chứng từ ĐANG DỰA VÀO; nguồn gửi lại dấu đó lúc
 * nộp (header `X-Preflight-Guard` ở POST /api/v1/documents, trường `guard` ở core.document.submit). Cửa nạp tính lại dấu:
 *   - trùng → đi tiếp như thường (cửa nạp vẫn tự kiểm đủ luật của nó);
 *   - khác (danh mục / chính sách / khoá kỳ vừa đổi) → chạy lại tiền kiểm MỘT lần; còn lỗi chặn → từ chối với IN-GUARD-001 kèm các
 *     lỗi đó (bể chờ ghi lý do "cấu hình vừa đổi"); hết lỗi chặn → nhận.
 * Không gửi dấu → hành vi cũ (tương thích ngược).
 *
 * Dấu gồm (chỉ phần chứng từ chạm tới, để sửa danh mục khác không làm lệch): mặt hàng trên dòng (nháp, ĐVT, nhóm hạch toán,
 * đang dùng, lần sửa), chi nhánh, đối tượng, phiên bản chính sách kế toán, sự kiện khoá / mở kỳ gần nhất.
 */
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';

export const GUARD_PREFIX = 'g1:';

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d == null ? null : String(d));

/** Dấu cấu hình cho một chứng từ thô (chưa cần đúng khuôn — thiếu phần nào thì phần đó rỗng). */
export async function commitGuard(trx: Db, tenantId: string, raw: unknown): Promise<string> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const skus = Array.isArray(r.lines)
    ? [...new Set((r.lines as { sku?: unknown }[]).map((l) => str(l?.sku)).filter((s): s is string => Boolean(s)))].sort()
    : [];
  const branchCode = str(r.branchCode);
  const partnerCode = str((r.partner as { code?: unknown } | undefined)?.code) ?? str(r.partnerCode);

  const [products, branch, partner, policy, lock] = await Promise.all([
    skus.length
      ? trx.selectFrom('products').select(['sku', 'is_draft', 'unit', 'posting_group_code', 'is_active', 'updated_at'])
        .where('tenant_id', '=', tenantId).where('sku', 'in', skus).orderBy('sku').execute()
      : [],
    branchCode
      ? trx.selectFrom('branches').select(['id', 'is_active', 'parent_id', 'level']).where('tenant_id', '=', tenantId).where('code', '=', branchCode).executeTakeFirst()
      : undefined,
    partnerCode
      ? trx.selectFrom('partners').select(['id', 'is_active', 'updated_at']).where('tenant_id', '=', tenantId).where('code', '=', partnerCode).executeTakeFirst()
      : undefined,
    trx.selectFrom('posting_policy_versions').select(['version', 'hash']).where('tenant_id', '=', tenantId).orderBy('version', 'desc').limit(1).executeTakeFirst(),
    trx.selectFrom('period_lock_events').select(sql<string | null>`max(id)::text`.as('last')).where('tenant_id', '=', tenantId).executeTakeFirst(),
  ]);

  const parts = {
    p: products.map((p) => [p.sku, p.is_draft, p.unit, p.posting_group_code, p.is_active, iso(p.updated_at)]),
    b: branch ? [branch.id, branch.is_active, branch.parent_id, branch.level] : null,
    o: partner ? [partner.id, partner.is_active, iso(partner.updated_at)] : null,
    v: policy ? [policy.version, policy.hash] : null,
    k: lock?.last ?? null,
  };
  return GUARD_PREFIX + createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
}
