// @bizcity-layer P bizcity.config
// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09 "Quy định dữ liệu danh mục": duyệt luật nhắc theo đơn vị (D023-4 / D023-8) + công tắc tự thêm mặt hàng từ chứng từ (D024-3)
/**
 * QUY ĐỊNH DỮ LIỆU DANH MỤC (HT09) — việc của kế toán trưởng / chủ đơn vị:
 *   GET  /api/v1/catalog-rules                  core.catalog-rules.list — mọi luật nhắc khung Vì sao: mức, câu chữ (mặc định / đơn
 *                                               vị sửa), bản xem trước như người dùng thấy trong form, trạng thái duyệt
 *   POST /api/v1/catalog-rules/:code/review     core.catalog-rule.review — edit (sửa câu chữ, chỉ dùng biến
 *                                               ([2026-11-03 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020: không còn "chờ duyệt" — luật chạy ngay; approve chỉ ghi nhận đã xem)
 *                                               của luật gốc) · lower / unlower (hạ cảnh báo mềm xuống nhắc, D023-8, bắt buộc lý do)
 *                                               · reset (về mặc định, nhãn nháp) — quyền conformance:approve (kế toán trưởng, D023-8);
 *                                               nhật ký catalog.rule.review. Bản duyệt gắn dấu luật (hintHash): luật đổi → hết hiệu lực
 *   GET  /api/v1/settings/item-auto-create      chế độ tự thêm mặt hàng từ chứng từ: on (mặc định mọi đơn vị, R-GATE-9 — thêm + nhắc) · off (mã lạ → mặt hàng NHÁP +
 *                                               chứng từ vào bể chờ với IN-ITEM-001)
 *   PUT  /api/v1/settings/item-auto-create      core.settings.item-auto-create — đổi chế độ, bắt buộc lý do; nhật ký settings.item-auto-create
 * Không hạ được mức chặn: chặn chỉ dành cho toàn vẹn dữ liệu (bizcity_catalog_hint@1).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CATALOG_HINTS, CATALOG_HINT_EXAMPLES, WARN_ACK_MIN_REASON, applyRuleReview, basisOf, catalogFinding, hintHash, hintVars, type CatalogFinding,
} from '@ketoan/contracts';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { ok } from '../../core/http.js';
import { writeAudit } from '../../core/audit.js';
import { docKiem, ghiKiem } from '@bizcity/platform/core/nhat-ky-kiem';
import { defineAction, mountActions } from '../../core/actions.js';
import { settingsValuesRoutes } from './settings-values.routes.js';
// [2026-11-06 02:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-39: tổng quan cấu hình cho màn HT13
import { settingsOverviewRoutes } from './settings-overview.routes.js';

const tags = ['Quy định dữ liệu danh mục'];
const FINDING_BASIS_TITLES = (code: string) => basisOf(code).map((b) => b.title);
const reason = z.string().trim().min(WARN_ACK_MIN_REASON, `Lý do ít nhất ${WARN_ACK_MIN_REASON} ký tự`).max(500);
const text = (max: number) => z.string().trim().max(max).nullish();

type ReviewRow = { code: string; title: string | null; why: string | null; fix: string | null; lowered: boolean; note: string; rule_hash: string; reviewed_by: string; reviewed_by_name: string; reviewed_at: Date };

function ruleView(code: string, row: ReviewRow | undefined) {
  const d = CATALOG_HINTS[code]!;
  // Luật đã đổi sau lần duyệt (dấu khác) → bản duyệt hết hiệu lực: hiện như chưa duyệt, kèm cờ stale.
  const stale = Boolean(row && row.rule_hash !== hintHash(code));
  const r = stale ? undefined : row;
  const preview: CatalogFinding = applyRuleReview(catalogFinding(code, CATALOG_HINT_EXAMPLES[code] ?? {}), r);
  return {
    code, entity: d.entity, level: d.level, effectiveLevel: preview.level, rule: d.rule ?? null, okText: d.okText ?? null, field: d.field ?? null,
    // ADR-0020: không có trạng thái "chờ duyệt" — luật chạy ngay; đơn vị chỉ có thể đã sửa câu chữ / đã hạ mức
    status: r && r.lowered && d.level === 'warn' ? 'lowered' as const : r && (r.title || r.why || r.fix) ? 'edited' as const : 'default' as const,
    edited: Boolean(r && (r.title || r.why || r.fix)),
    basis: FINDING_BASIS_TITLES(code),
    canLower: d.level === 'warn',
    vars: hintVars(code),
    defaults: { title: d.title, why: d.why, fix: d.fix ?? null },
    overrides: { title: r?.title ?? null, why: r?.why ?? null, fix: r?.fix ?? null },
    preview,
    stale,
    review: row ? { note: row.note, by: row.reviewed_by_name || row.reviewed_by, at: row.reviewed_at } : null,
  };
}

const ruleOut = z.custom<ReturnType<typeof ruleView>>((v) => typeof v === 'object' && v !== null && typeof (v as { code?: unknown }).code === 'string');

const listRules = defineAction({
  id: 'core.catalog-rules.list', title: 'Luật nhắc của khung Vì sao và trạng thái duyệt tại đơn vị', tags,
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({ entity: z.enum(['account', 'partner', 'item', 'unit', 'bank', 'branch', 'group']).optional() }),
  output: z.object({ items: z.array(ruleOut), total: z.number(), customized: z.number() }),
  expose: { http: { method: 'GET', path: '/api/v1/catalog-rules' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => {
    const rows = await ctx.data.tx.selectFrom('catalog_rule_reviews').selectAll().where('tenant_id', '=', ctx.tenant.id).execute();
    const by = new Map(rows.map((r) => [r.code, r as ReviewRow]));
    const items = Object.values(CATALOG_HINTS).filter((d) => !input.entity || d.entity === input.entity).map((d) => ruleView(d.id, by.get(d.id)));
    return { items, total: items.length, customized: items.filter((i) => i.status !== 'default').length };
  },
});

const reviewRule = defineAction({
  id: 'core.catalog-rule.review', title: 'Chỉnh một luật nhắc tại đơn vị (sửa câu chữ, hạ mức, về mặc định)', tags,
  description: 'approve: ghi nhận đã xem (không đổi gì) · edit: sửa câu chữ (chỉ dùng biến của luật gốc) · lower: hạ cảnh báo mềm xuống nhắc tại đơn vị (D023-8, bắt buộc lý do) '
    + '· unlower: bỏ hạ mức · reset: về nội dung mặc định. Không hạ được mức chặn.',
  permission: 'conformance:approve', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
  input: z.object({
    code: z.string().trim().min(3).max(32),
    decision: z.enum(['approve', 'edit', 'lower', 'unlower', 'reset']),
    title: text(300), why: text(1000), fix: text(500),
    note: z.string().trim().max(500).default(''),
  }),
  output: ruleOut,
  expose: { http: { method: 'POST', path: '/api/v1/catalog-rules/:code/review' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'catalog_rule', objectId: (i) => i.code },
  handler: async (ctx, input) => {
    const def = CATALOG_HINTS[input.code];
    if (!def) throw Errors.notFound(`luật nhắc ${input.code}`);
    const tx = ctx.data.tx;
    const auth = ctx.legacyAuth;
    const before = await tx.selectFrom('catalog_rule_reviews').selectAll().where('tenant_id', '=', ctx.tenant.id).where('code', '=', input.code).executeTakeFirst() as ReviewRow | undefined;

    if (input.decision === 'reset') {
      await tx.deleteFrom('catalog_rule_reviews').where('tenant_id', '=', ctx.tenant.id).where('code', '=', input.code).execute();
    } else {
      if ((input.decision === 'lower' || input.decision === 'unlower') && def.level !== 'warn') {
        throw Errors.validation(`Chỉ hạ được cảnh báo mềm (warn); ${input.code} là mức ${def.level} — mức chặn chỉ dành cho toàn vẹn dữ liệu, không hạ được`);
      }
      if (input.decision === 'lower') reason.parse(input.note);
      const fresh = before && before.rule_hash === hintHash(input.code) ? before : undefined; // bản duyệt của luật cũ không mang sang
      const next = {
        title: fresh?.title ?? null, why: fresh?.why ?? null, fix: fresh?.fix ?? null, lowered: fresh?.lowered ?? false,
      };
      if (input.decision === 'edit') {
        const allowed = new Set(hintVars(input.code));
        for (const [k, v] of [['title', input.title], ['why', input.why], ['fix', input.fix]] as const) {
          if (v === undefined) continue;
          const bad = [...(v ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((x) => !allowed.has(x));
          if (bad.length) throw Errors.validation(`Câu chữ chỉ dùng được biến của luật gốc (${[...allowed].map((x) => `{${x}}`).join(', ') || 'không có biến'}); không có {${bad.join('}, {')}}`);
          next[k] = v ? v : null;
        }
      }
      if (input.decision === 'lower') next.lowered = true;
      if (input.decision === 'unlower') next.lowered = false;
      const row = { ...next, note: input.note, rule_hash: hintHash(input.code), reviewed_by: auth.actor, reviewed_by_name: auth.actorName ?? '', reviewed_at: new Date() };
      await tx.insertInto('catalog_rule_reviews').values({ tenant_id: ctx.tenant.id, code: input.code, ...row })
        .onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(row)).execute();
    }
    const after = await tx.selectFrom('catalog_rule_reviews').selectAll().where('tenant_id', '=', ctx.tenant.id).where('code', '=', input.code).executeTakeFirst() as ReviewRow | undefined;
    await writeAudit(tx, {
      tenantId: ctx.tenant.id, actor: auth.actor, action: 'catalog.rule.review', objectType: 'catalog_rule', objectId: input.code,
      before: before ?? null, after: { decision: input.decision, note: input.note, row: after ?? null },
    });
    return ruleView(input.code, after);
  },
});

// ── Tự thêm mặt hàng từ chứng từ (D024-3) ──────────────────────────────────────────────────────────────────────────────────
const AUTO_MODES = ['on', 'off'] as const;
type AutoMode = (typeof AUTO_MODES)[number];
const readMode = (settings: unknown): AutoMode => ((settings as { item?: { autoCreate?: unknown } } | null)?.item?.autoCreate === 'off' ? 'off' : 'on');

const setAutoCreate = defineAction({
  id: 'core.settings.item-auto-create', title: 'Bật / tắt tự thêm mặt hàng từ chứng từ', tags,
  description: 'on: mã hàng lạ trên chứng từ được tự thêm vào danh mục ở trạng thái đang dùng (như cũ). '
    + 'off: mã lạ → tạo mặt hàng NHÁP (điền sẵn tên, ĐVT từ dòng) và chứng từ vào Trạm kiểm tra với IN-ITEM-001; kế toán kích hoạt rồi nộp lại. Bắt buộc lý do.',
  permission: 'settings:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
  input: z.object({ mode: z.enum(AUTO_MODES), reason }),
  output: z.object({ mode: z.enum(AUTO_MODES) }),
  expose: { http: { method: 'PUT', path: '/api/v1/settings/item-auto-create' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'tenant', objectId: () => 'item.autoCreate' },
  handler: async (ctx, input) => {
    const tx = ctx.data.tx;
    const cur = await tx.selectFrom('tenants').select('settings').where('id', '=', ctx.tenant.id).executeTakeFirstOrThrow();
    const settings = (cur.settings as Record<string, unknown> | null) ?? {};
    const before = readMode(settings);
    const item = { ...((settings.item as Record<string, unknown> | undefined) ?? {}), autoCreate: input.mode };
    await tx.updateTable('tenants').set({ settings: JSON.stringify({ ...settings, item }) }).where('id', '=', ctx.tenant.id).execute();
    await writeAudit(tx, {
      tenantId: ctx.tenant.id, actor: ctx.legacyAuth.actor, action: 'settings.item-auto-create', objectType: 'tenant', objectId: ctx.tenant.id,
      before: { mode: before }, after: { mode: input.mode, reason: input.reason },
    });
    return { mode: input.mode };
  },
});

export const CATALOG_RULE_ACTIONS = [listRules, reviewRule, setAutoCreate];

export async function catalogRulesRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, CATALOG_RULE_ACTIONS);
  // [2026-11-06 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E2 đợt 1: đường đọc / ghi cấu hình chung đăng ký cùng tệp cấu hình HT09 (system.routes.ts / loi.ts đang thuộc dòng giữ chỗ khác — 30 §5)
  await settingsValuesRoutes(app);
  await settingsOverviewRoutes(app);
  // [2026-11-19 Nguyễn Văn Thủy] lỗi form tự chặn (chưa gửi máy chủ) cũng vào nhật ký kiểm — đếm lỗi hay gặp (đóng góp)
  app.post('/api/v1/validation-log/form', {
    schema: { tags, summary: 'Ghi một lần form tự chặn (thiếu ô, sai dữ liệu) vào nhật ký kiểm khai báo — người đã đăng nhập',
      body: z.object({ entity: z.string().trim().min(1).max(200), key: z.string().max(200).default(''), screen: z.string().max(300).optional(),
        failed: z.array(z.object({ code: z.string().max(40).default('FORM-CHAN'), title: z.string().max(500) })).min(1).max(20) }) },
    handler: async (req) => {
      const a = authOf(req);
      const b = req.body as { entity: string; key: string; screen?: string; failed: { code: string; title: string }[] };
      await ghiKiem(a.tenantId, { entity: b.entity, key: b.key, action: 'form', ok: false, source: 'form', screen: b.screen, failed: b.failed.map((f) => ({ code: f.code, level: 'block', title: f.title })), user: a.actorName || a.actor, requestId: String(req.id) });
      return ok({ logged: true });
    },
  });
  // [2026-11-19 Nguyễn Văn Thủy] nhật ký kiểm khai báo (JSONL, docs/nghiep-vu/25 §3.5) (đóng góp)
  app.get('/api/v1/validation-log', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Nhật ký kiểm khai báo: mỗi lần lưu danh mục / chứng từ — đạt hay bị chặn, mã quy tắc chưa đạt, mã tra cứu',
      querystring: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), entity: z.string().max(1000).optional(), code: z.string().max(40).optional(), key: z.string().max(200).optional(), user: z.string().max(200).optional(), onlyFailed: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(5000).default(1000) }) },
    handler: async (req) => {
      const q = req.query as { from?: string; entity?: string; code?: string; key?: string; user?: string; onlyFailed?: boolean; limit: number };
      return ok(await docKiem(authOf(req).tenantId, { since: q.from ? new Date(`${q.from}T00:00:00+07:00`) : undefined, entity: q.entity, code: q.code, key: q.key, user: q.user, onlyFailed: q.onlyFailed, limit: q.limit }));
    },
  });
  app.get('/api/v1/settings/item-auto-create', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Chế độ tự thêm mặt hàng từ chứng từ (on / off) và lần đổi gần nhất' },
    handler: async (req) => {
      const auth = authOf(req);
      return db.transaction().execute(async (trx) => {
        const t = await trx.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
        const last = await trx.selectFrom('audit_logs').select(['actor', 'created_at', 'after_data']).where('tenant_id', '=', auth.tenantId)
          .where('action', '=', 'settings.item-auto-create').orderBy('id', 'desc').limit(1).executeTakeFirst();
        return ok({ mode: readMode(t.settings), last: last ? { by: last.actor, at: last.created_at, reason: (last.after_data as { reason?: string } | null)?.reason ?? null } : null });
      });
    },
  });
}
