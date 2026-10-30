// @bizcity-layer K kernel/config
// [2026-10-30 10:11 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — gói định khoản cài / xem trước / gỡ: bảng config_packs, cài = phát hành một bản chính sách (ADR-0009 Q-5).
/**
 * Gói định khoản (bizcity_posting_template@1 §5, PHASES 3.11) — action:
 *   GET  /api/v1/posting/packs            core.template.list       — gói đã cài / đã gỡ
 *   POST /api/v1/posting/packs/install    core.template.install    — ?dryRun=1 xem trước (thêm / sửa / giữ / xung đột + bản chính
 *                                                                   sách sẽ phát hành) → xác nhận = ghi một giao dịch (STD-TPL-5)
 *   POST /api/v1/posting/packs/uninstall  core.template.uninstall  — ngừng dùng mã gói đã thêm mà chưa phát sinh (STD-TPL-8)
 * Cài / gỡ là việc của người có quyền cấu hình (`settings:write`), không phơi cho AI (STD-MCP-6). Bằng chứng: id action.
 */
import { z } from 'zod';
import { defineAction, type AnyActionDef } from '../../core/actions.js';
import { emitKernelEvent } from '../documents/kernel-events.js';
import { installPack, listPacks, postingPackSchema, uninstallPack, type PackResult } from './pack.js';

const tags = ['Cấu hình hạch toán'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const itemSchema = z.object({
  kind: z.enum(['account', 'default', 'reason', 'group', 'paymentMethod', 'taxCode']),
  code: z.string(),
  action: z.enum(['add', 'update', 'keep', 'conflict']).describe('add: thêm · update: ghi đè / dùng lại · keep: trùng, giữ · conflict: khác cấu hình đơn vị, giữ nguyên'),
  changes: z.array(z.string()).optional(),
  note: z.string().optional(),
});
const resultSchema = z.object({
  packId: z.string(), version: z.string(), items: z.array(itemSchema),
  policyVersion: z.number().nullable().describe('Bản chính sách kế toán phát hành (null = cấu hình định khoản không đổi)'),
});
const emitPolicy = (ctx: Parameters<AnyActionDef['handler']>[0], r: PackResult, action: 'install' | 'uninstall') => r.policyVersion === null ? Promise.resolve()
  : emitKernelEvent(ctx.data.tx, ctx.legacyAuth, 'bizcity.posting.policy.published', `policy:${r.policyVersion}`, { version: r.policyVersion, pack: r.packId, packVersion: r.version, action });

export const packActions: AnyActionDef[] = [
  defineAction({
    id: 'core.template.list', title: 'Gói định khoản đã cài', tags,
    description: 'Gói định khoản theo ngành đã cài / đã gỡ của đơn vị, kèm các mục gói đã thêm và bản chính sách kế toán lần cài phát hành.',
    permission: 'catalog:read', effect: 'read', idempotency: 'none',
    input: z.object({}),
    output: z.array(z.object({
      packId: z.string(), version: z.string(), title: z.string(), regime: z.string(), status: z.enum(['installed', 'uninstalled']),
      policyVersion: z.number().nullable(), installedBy: z.string(), installedAt: z.string(), uninstalledAt: z.string().nullable(), added: z.number(),
    })),
    expose: { http: { method: 'GET', path: '/api/v1/posting/packs' }, mcp: true, ai: 'read' },
    handler: async (ctx) => (await listPacks(ctx.data.tx, ctx.tenant.id)).map((p) => ({
      packId: p.pack_id, version: p.version, title: p.title, regime: p.regime, status: p.status, policyVersion: p.policy_version, installedBy: p.installed_by,
      installedAt: new Date(p.installed_at).toISOString(), uninstalledAt: p.uninstalled_at ? new Date(p.uninstalled_at).toISOString() : null,
      added: (p.items as { action: string }[]).filter((i) => i.action === 'add').length,
    })),
  }),

  defineAction({
    id: 'core.template.install', title: 'Cài gói định khoản', tags,
    description: 'Cài (hoặc nâng cấp) gói định khoản theo ngành: lý do, nhóm hạch toán, tài khoản ngầm định, hình thức thanh toán, mã thuế, tài khoản con. '
      + 'Chạy thử (?dryRun=1) để xem từng mục thêm / ghi đè / giữ / xung đột. Mục đang khác cấu hình của đơn vị được GIỮ, trừ khi liệt kê trong overwrite ("reason:XBA"). '
      + 'Cấu hình đổi → phát hành một bản chính sách kế toán hiệu lực từ effectiveFrom (mặc định hôm nay); chứng từ trước ngày đó vẫn định khoản theo bản cũ. Bút toán đã ghi không đổi.',
    permission: 'settings:write', effect: 'write', idempotency: 'required', sideEffects: ['settings'], dryRun: true,
    input: z.object({
      pack: postingPackSchema.describe('Gói theo bizcity_posting_template@1'),
      overwrite: z.array(z.string().regex(/^(account|default|reason|group|paymentMethod|taxCode):.+$/)).max(500).default([]).describe('Mục đồng ý ghi đè, dạng <kind>:<mã>'),
      effectiveFrom: day.optional().describe('Ngày hiệu lực của bản chính sách mới; mặc định hôm nay'),
    }),
    output: resultSchema,
    expose: { http: { method: 'POST', path: '/api/v1/posting/packs/install', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'config_pack', objectId: (input) => `${input.pack.id}@${input.pack.version}` },
    handler: async (ctx, input) => {
      const r = await installPack(ctx.data.tx, ctx.tenant.id, input.pack, { overwrite: input.overwrite, effectiveFrom: input.effectiveFrom, actor: ctx.actor.id });
      await emitPolicy(ctx, r, 'install');
      return r;
    },
  }),

  defineAction({
    id: 'core.template.uninstall', title: 'Gỡ gói định khoản', tags,
    description: 'Gỡ gói: mã gói đã THÊM mà chưa phát sinh thì ngừng dùng; mã đã dùng, nhóm hạch toán, tài khoản ngầm định giữ nguyên. Không gỡ được gói đang là gói nền của gói khác.',
    permission: 'settings:write', effect: 'write', idempotency: 'required', sideEffects: ['settings'], dryRun: true,
    input: z.object({ packId: z.string().min(3), effectiveFrom: day.optional() }),
    output: resultSchema,
    expose: { http: { method: 'POST', path: '/api/v1/posting/packs/uninstall' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'config_pack', objectId: (input) => input.packId },
    handler: async (ctx, input) => {
      const r = await uninstallPack(ctx.data.tx, ctx.tenant.id, input.packId, { effectiveFrom: input.effectiveFrom, actor: ctx.actor.id });
      await emitPolicy(ctx, r, 'uninstall');
      return r;
    },
  }),
];
