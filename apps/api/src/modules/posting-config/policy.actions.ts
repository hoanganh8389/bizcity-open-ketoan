// @bizcity-layer K kernel/config
/**
 * Chính sách kế toán có phiên bản (ADR-0009) — action:
 *   GET  /api/v1/posting/policy/versions   accounting.policy.list     — lịch sử phiên bản (không kèm bản chụp)
 *   POST /api/v1/posting/policy/publish    accounting.policy.publish  — đổi chế độ: chụp cấu hình đang dùng, hiệu lực từ ngày chọn
 * Sửa cấu hình hằng ngày KHÔNG cần phát hành: lần định khoản sau tự chụp bản `amend` của chế độ đang áp (./policy.ts).
 * Phát hành là việc của người có quyền cấu hình, không phơi cho AI (STD-MCP-6).
 */
import { z } from 'zod';
import { defineAction, type AnyActionDef } from '../../core/actions.js';
import { emitKernelEvent } from '../documents/kernel-events.js';
import { loadPolicyRaw } from './posting-config.repository.js';
import { listPolicyVersions, publishPolicy, type PolicyVersionRow } from './policy.js';

const tags = ['Cấu hình hạch toán'];
const versionSchema = z.object({
  version: z.number(),
  effectiveFrom: z.string().describe('Ngày hiệu lực YYYY-MM-DD'),
  kind: z.enum(['initial', 'amend', 'publish']).describe('initial: bản đầu; amend: tự chụp sau khi sửa cấu hình; publish: phát hành chế độ mới'),
  hash: z.string(),
  note: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
});
const view = (v: PolicyVersionRow) => ({
  version: v.version, effectiveFrom: String(v.effective_from).slice(0, 10), kind: v.kind, hash: v.hash, note: v.note,
  createdBy: v.created_by, createdAt: new Date(v.created_at).toISOString(),
});
const ymd = (d: unknown) => (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : String(d).slice(0, 10));

export const policyActions: AnyActionDef[] = [
  defineAction({
    id: 'accounting.policy.list', title: 'Lịch sử phiên bản chính sách kế toán', tags,
    description: 'Các phiên bản cấu hình định khoản, mới nhất trước. Chứng từ có ngày hạch toán D định khoản theo bản có ngày hiệu lực ≤ D lớn nhất.',
    permission: 'ledger:read', effect: 'read', idempotency: 'none',
    input: z.object({}),
    output: z.array(versionSchema),
    expose: { http: { method: 'GET', path: '/api/v1/posting/policy/versions' }, mcp: true, ai: 'read' },
    handler: async (ctx) => (await listPolicyVersions(ctx.data.tx, ctx.tenant.id)).map((v) => ({ ...view(v), effectiveFrom: ymd(v.effective_from) })),
  }),
  defineAction({
    id: 'accounting.policy.publish', title: 'Phát hành chính sách kế toán mới', tags,
    description: 'Chụp cấu hình định khoản đang dùng thành một phiên bản có ngày hiệu lực mới (vd đổi chế độ kế toán từ 01/01). '
      + 'Chứng từ trước ngày đó định khoản lại vẫn theo bản cũ. Ngày hiệu lực không được ở kỳ đã khoá.',
    permission: 'settings:write', effect: 'write', idempotency: 'required', sideEffects: ['settings'], dryRun: true,
    input: z.object({
      effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD'),
      note: z.string().trim().min(5, 'Ghi rõ vì sao đổi chính sách (ít nhất 5 ký tự)').max(500),
    }),
    output: versionSchema,
    expose: { http: { method: 'POST', path: '/api/v1/posting/policy/publish', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_policy', objectId: (_i, o) => String(o.version) },
    handler: async (ctx, input) => {
      const v = await publishPolicy(ctx.data.tx, ctx.tenant.id, await loadPolicyRaw(ctx.data.tx, ctx.tenant.id), { ...input, actor: ctx.actor.id });
      await emitKernelEvent(ctx.data.tx, ctx.legacyAuth, 'bizcity.posting.policy.published', `policy:${v.version}`, { version: v.version, effectiveFrom: input.effectiveFrom, hash: v.hash });
      return { ...view(v), effectiveFrom: ymd(v.effective_from) };
    },
  }),
];
