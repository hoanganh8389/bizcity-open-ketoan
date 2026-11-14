// @bizcity-layer P module-sdk
// [2026-11-14 03:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-3 (B1, chữ chốt PHASE-036 · 00 §10): tenantEmptiness() — đơn vị trắng theo danh sách đóng loại chứng từ; action core.setup.status
/**
 * Đơn vị trắng (D036-1): chưa có bút toán **và** chưa có chứng từ nào ở bất kỳ trạng thái nào (kể cả nháp, chờ duyệt, bị giữ).
 * Danh mục (tài khoản, đối tượng, mặt hàng, chi nhánh…) không tính — seed() và Quay về dữ liệu gốc tạo chúng trên đơn vị mới.
 * Mọi nơi cần biết (biểu ngữ, hộp thoại Thiết lập nhanh, nạp mẫu, tự nạp khi cài mới) gọi lại một hàm này.
 * Thêm loại chứng từ mới → thêm dòng ở EMPTINESS_PROBES, ở bảng PHASE-036 · 00 §10 và ở test.
 */
import { sql } from 'kysely';
import { z } from 'zod';
import type { Db } from '@bizcity/platform/db/client';
import { defineAction, type AnyActionDef } from '@bizcity/platform/core/actions';
// [2026-11-14 05:53 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-4: status trả thêm runs[] (lần chạy gói mẫu gần nhất mỗi gói)
import { latestRuns, runSchema } from './setup-run.js';

/** Loại dữ liệu nghiệp vụ → bảng. Danh sách đóng (PHASE-036 · 00 §10). */
export const EMPTINESS_PROBES = [
  { kind: 'ledger', table: 'ledger_entries' },
  { kind: 'event', table: 'accounting_events' },
  { kind: 'intake', table: 'intake_inbox' },
  { kind: 'purchase', table: 'purchase_documents' },
  { kind: 'supplier_invoice', table: 'supplier_invoices' },
  { kind: 'stock_transfer', table: 'stock_transfer_docs' },
  { kind: 'payment_request', table: 'payment_requests' },
  { kind: 'transfer_request', table: 'transfer_requests' },
  { kind: 'asset', table: 'assets' },
  { kind: 'tax_invoice', table: 'tax_invoices' },
  { kind: 'vat_return', table: 'vat_returns' },
  { kind: 'cit_return', table: 'cit_returns' },
] as const;
export type EmptinessKind = (typeof EMPTINESS_PROBES)[number]['kind'];
const KINDS = EMPTINESS_PROBES.map((p) => p.kind) as [EmptinessKind, ...EmptinessKind[]];

export interface TenantEmptiness { empty: boolean; kinds: EmptinessKind[] }

/**
 * Đơn vị có trắng không. `lock: true` → khoá advisory theo đơn vị tới hết giao dịch (gọi trong giao dịch ghi, ngay trước khi
 * nạp mẫu — B2 `core.setup.apply`), để hai lệnh nạp cùng lúc hoặc chứng từ đầu tiên vừa nhập không lọt qua giữa lúc kiểm và lúc ghi.
 */
export async function tenantEmptiness(trx: Db, tenantId: string, opts: { lock?: boolean } = {}): Promise<TenantEmptiness> {
  if (opts.lock) await sql`SELECT pg_advisory_xact_lock(hashtext(${'setup:' + tenantId}))`.execute(trx);
  const cols = EMPTINESS_PROBES.map((p) => sql`EXISTS (SELECT 1 FROM ${sql.table(p.table)} WHERE tenant_id = ${tenantId} LIMIT 1) AS ${sql.ref(p.kind)}`);
  const r = await sql<Record<EmptinessKind, boolean>>`SELECT ${sql.join(cols)}`.execute(trx);
  const row = r.rows[0]!;
  const kinds = EMPTINESS_PROBES.filter((p) => row[p.kind]).map((p) => p.kind);
  return { empty: kinds.length === 0, kinds };
}

const status = defineAction({
  id: 'core.setup.status', title: 'Thiết lập: đơn vị đang dùng có trắng không (chưa có bút toán, chưa có chứng từ nào)', tags: ['Thiết lập'],
  description: 'Đơn vị trắng = chưa có bút toán và chưa có chứng từ ở bất kỳ trạng thái nào (kể cả nháp, chờ duyệt, bể chờ). '
    + 'Danh mục không tính. `kinds` = các loại dữ liệu nghiệp vụ đã có (không trả số dòng, số tiền, tên). `canSetup` = người gọi có quyền settings:write.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({}),
  output: z.object({ empty: z.boolean(), kinds: z.array(z.enum(KINDS)), canSetup: z.boolean(), runs: z.array(runSchema) }),
  expose: { http: { method: 'GET', path: '/api/v1/setup/status' }, mcp: true, ai: 'read' },
  handler: async (ctx) => {
    const e = await tenantEmptiness(ctx.data.tx, ctx.tenant.id);
    return { ...e, canSetup: ctx.can('settings:write'), runs: await latestRuns(ctx.data.tx, ctx.tenant.id) };
  },
});

export const setupActions: AnyActionDef[] = [status];
