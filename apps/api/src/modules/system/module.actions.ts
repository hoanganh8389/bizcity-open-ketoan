// @bizcity-layer P module-sdk
// [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.13 (ADR-0011 D1, CK-4, CK-5): action core.module.enable / disable — chủ đơn vị bật / tắt module cho đơn vị; dry-run báo ảnh hưởng; bằng chứng + biên nhận; phát bizcity.module.toggled
/**
 * BẬT / TẮT MODULE THEO ĐƠN VỊ (ADR-0011 D1). Ghi `tenant_modules` (0052); không có dòng = bật.
 *
 *   Tắt: route của module trả MODULE_DISABLED cho đơn vị, sự kiện tới subscriber của module giao 'skipped'. Dữ liệu, chứng từ,
 *        bút toán module đã nộp GIỮ NGUYÊN — tắt module không bao giờ đụng sổ (dry-run cho biết còn bao nhiêu chứng từ chờ /
 *        lỗi định khoản của module để kế toán xử lý trước nếu muốn).
 *   Bật: kiểm năng lực manifest cần (planned → CAPABILITY_MISSING, CK-5) và module phải đang nạp trong bản cài.
 *   Module lõi (ke-toan, he-thong) không tắt được.
 */
import { z } from 'zod';
import { sql } from 'kysely';
import { defineAction, type AnyActionDef } from '../../core/actions.js';
import { Errors } from '../../core/errors.js';
import { emitEvent } from '../../core/events.js';
import { forgetTenantModules } from '@bizcity/platform/core/module-registry';
import { bundledModules, missingCapabilities, REQUIRED_MODULES } from '../../core/module-lifecycle.js';

const tags = ['Hệ thống'];
const input = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Khoá module sai khuôn').describe('Khoá phân hệ / add-in (GET /api/v1/system/modules?view=tenant)'),
  reason: z.string().trim().max(500).optional().describe('Lý do bật / tắt (ghi vào bằng chứng)'),
});
const output = z.object({
  key: z.string(), enabled: z.boolean(), changed: z.boolean(),
  impact: z.object({
    pendingDocuments: z.number().describe('Chứng từ của module đang chờ / lỗi định khoản (nguồn = khoá module) — vẫn giữ nguyên'),
    postedEntries: z.number().describe('Bút toán đã ghi từ chứng từ của module — vẫn giữ nguyên'),
  }),
});

function toggle(enabled: boolean): AnyActionDef {
  return defineAction({
    id: enabled ? 'core.module.enable' : 'core.module.disable',
    title: enabled ? 'Bật module cho đơn vị' : 'Tắt module cho đơn vị',
    description: enabled
      ? 'Bật lại phân hệ / add-in cho đơn vị. Kiểm năng lực Core module cần.'
      : 'Tắt phân hệ / add-in cho đơn vị: route trả MODULE_DISABLED, sự kiện giao skipped. Dữ liệu, chứng từ, bút toán giữ nguyên.',
    tags, permission: 'users:write', effect: 'write', idempotency: 'natural', sideEffects: ['settings'], dryRun: true,
    input, output,
    expose: { http: { method: 'POST', path: enabled ? '/api/v1/system/modules/enable' : '/api/v1/system/modules/disable' }, ai: 'deny' },
    evidence: { objectType: 'module', objectId: (i) => i.key },
    handler: async (ctx, { key, reason }) => {
      const m = bundledModules().find((b) => b.key === key);
      if (!m) throw Errors.notFound(`module "${key}"`);
      if (!enabled && REQUIRED_MODULES.has(key)) throw Errors.validation(`Module ${m.label} là lõi kế toán / hệ thống, không tắt được`);
      if (enabled) {
        const missing = missingCapabilities(m.requires);
        if (missing.length) throw Errors.capabilityMissing(missing.join(', '));
      }
      const tx = ctx.data.tx;
      const tenantId = ctx.tenant.id;
      const impactRow = await sql<{ pending: number; entries: number }>`
        SELECT (SELECT count(*)::int FROM accounting_events e WHERE e.tenant_id = ${tenantId} AND e.source_system = ${key} AND e.status IN ('pending', 'error')) AS pending,
               (SELECT count(*)::int FROM bizcity_read.ledger_entries l JOIN accounting_events e ON e.id = l.event_id
                 WHERE l.tenant_id = ${tenantId} AND e.source_system = ${key} AND l.status = 'posted') AS entries`.execute(tx);
      const impact = { pendingDocuments: impactRow.rows[0]?.pending ?? 0, postedEntries: impactRow.rows[0]?.entries ?? 0 };
      const cur = await tx.selectFrom('tenant_modules').select('enabled').where('tenant_id', '=', tenantId).where('module_key', '=', key).executeTakeFirst();
      const was = cur?.enabled ?? true;
      if (was === enabled) return { key, enabled, changed: false, impact };
      await tx.insertInto('tenant_modules')
        .values({ tenant_id: tenantId, module_key: key, enabled, changed_by: ctx.actor.id, reason: reason ?? null })
        .onConflict((oc) => oc.columns(['tenant_id', 'module_key']).doUpdateSet({ enabled, changed_at: new Date(), changed_by: ctx.actor.id, reason: reason ?? null }))
        .execute();
      await emitEvent(tx, {
        tenantId, type: 'bizcity.module.toggled', subject: `module:${key}`, source: 'bizcity.platform',
        actor: { kind: ctx.actor.kind, id: ctx.actor.id }, data: { module: key, enabled },
      });
      ctx.evidence.note('impact', impact);
      // Bộ đệm của tiến trình này xoá ngay (sau commit đọc lại); tiến trình khác hết hạn sau ≤ 30 giây.
      if (!ctx.dryRun) forgetTenantModules(tenantId);
      return { key, enabled, changed: true, impact };
    },
  });
}

export const moduleActions: AnyActionDef[] = [toggle(true), toggle(false)];
