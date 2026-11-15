// @bizcity-layer M platform/help
// [2026-11-12 Nguyễn Văn Thủy] thẻ hướng dẫn sử dụng soạn trong hệ thống, gắn vào từng màn / hộp thoại (0113) (đóng góp)
/**
 * THẺ HƯỚNG DẪN (help_cards) và NƠI GẮN (help_places: định danh màn / hộp thoại → thẻ).
 *   GET    /api/v1/help/place?key=…          thẻ đang gắn ở nơi này (kèm nội dung) hoặc null
 *   PUT    /api/v1/help/place                gắn thẻ { key, label, cardId | null }
 *   GET    /api/v1/help/cards                danh sách thẻ (không kèm nội dung) + số nơi gắn
 *   GET    /api/v1/help/cards/:id            một thẻ (kèm nội dung, nơi gắn)
 *   POST   /api/v1/help/cards                thêm thẻ { title, body, format, sourceKey?, placeKey?, placeLabel? } — có placeKey thì gắn luôn
 *   PATCH  /api/v1/help/cards/:id            sửa thẻ
 *   DELETE /api/v1/help/cards/:id            xoá thẻ (nơi đang gắn thành chưa gắn)
 *   POST   /api/v1/help/import               chép nhiều tài liệu có sẵn thành thẻ, gắn vào nơi cùng khoá nếu nơi đó chưa có thẻ
 *   [2026-11-15 Nguyễn Văn Thủy] mang thẻ sang máy chủ khác (đóng góp):
 *   GET    /api/v1/help/export               gói JSON mọi thẻ (kèm nội dung, ảnh trong nội dung) + nơi gắn
 *   POST   /api/v1/help/package/preview      xem trước nhập gói: thẻ nào thêm / ghi đè / không đổi, màn nào đổi thẻ
 *   POST   /api/v1/help/package/import       nhập gói: GHI ĐÈ thẻ khớp, thêm thẻ mới, gắn đúng các nơi trong gói
 *     Khớp thẻ (mã số thẻ mỗi máy chủ khác nhau): cùng mã nguồn (sourceKey) → thẻ đang gắn ở một nơi của thẻ trong gói → cùng tiêu đề.
 *     Thẻ có ở máy chủ này mà không có trong gói: giữ nguyên (không xoá).
 * Tạm thời ai đăng nhập cũng sửa được (quyền tính sau).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql } from 'kysely';
import { z } from 'zod';
import { authOf, requirePermission, type AuthContext } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { db, type Db } from '../../db/client.js';
import { sameTx, type ActionTx, defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';

const tags = ['Hướng dẫn sử dụng'];
const read = requirePermission('catalog:read');
const iso = (v: unknown) => new Date(v as string).toISOString();
const keySchema = z.string().trim().min(1).max(300);
const cardBody = z.object({
  title: z.string().trim().max(300).default(''),
  body: z.string().max(5_000_000).default(''),
  format: z.enum(['md', 'html']).default('html'),
  sourceKey: z.string().trim().max(200).default(''),
  placeKey: keySchema.optional(),
  placeLabel: z.string().trim().max(300).default(''),
});
const cardPatch = z.object({ title: z.string().trim().max(300).optional(), body: z.string().max(5_000_000).optional(), format: z.enum(['md', 'html']).optional() });
const idParam = z.object({ id: z.string().regex(/^[1-9][0-9]*$/, 'Mã không hợp lệ') });

type CardRow = { id: string; title: string; body: string; format: string; source_key: string; created_by: string; updated_by: string; created_at: unknown; updated_at: unknown };
const cardDto = (r: CardRow, withBody = true) => ({
  id: String(r.id), title: r.title, format: r.format as 'md' | 'html', sourceKey: r.source_key, ...(withBody ? { body: r.body } : {}),
  createdBy: r.created_by, updatedBy: r.updated_by, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
});

async function bind(trx: Db, auth: AuthContext, key: string, label: string, cardId: string | null) {
  await sql`INSERT INTO help_places (tenant_id, place_key, label, card_id, updated_by, updated_at)
    VALUES (${auth.tenantId}, ${key}, ${label}, ${cardId}, ${auth.actorName}, now())
    ON CONFLICT (tenant_id, place_key) DO UPDATE SET card_id = EXCLUDED.card_id, label = CASE WHEN EXCLUDED.label <> '' THEN EXCLUDED.label ELSE help_places.label END,
      updated_by = EXCLUDED.updated_by, updated_at = now()`.execute(trx);
}

// ---------------------------------------------------------------- gói xuất / nhập
const PKG_KIND = 'bizcity.help-cards';
const pkgCard = z.object({
  title: z.string().trim().max(300).default(''),
  format: z.enum(['md', 'html']).default('html'),
  body: z.string().max(5_000_000).default(''),
  sourceKey: z.string().trim().max(200).default(''),
  places: z.array(z.object({ key: keySchema, label: z.string().trim().max(300).default('') })).max(500).default([]),
});
const pkgSchema = z.object({
  kind: z.literal(PKG_KIND, { errorMap: () => ({ message: 'Không phải tệp thẻ hướng dẫn (kind phải là bizcity.help-cards)' }) }),
  version: z.number().int().min(1).max(1),
  exportedAt: z.string().optional(),
  cards: z.array(pkgCard).max(3000),
});
type Pkg = z.infer<typeof pkgSchema>;
type PlanRow = { title: string; action: 'new' | 'update' | 'same'; targetId: string | null; targetTitle: string | null; titleChanged: boolean; bodyChanged: boolean;
  places: { key: string; label: string; before: string | null; change: boolean }[] };

/** Ghép từng thẻ trong gói với thẻ ở máy chủ này (không ghi gì). */
async function planPackage(trx: Db, tenantId: string, pkg: Pkg): Promise<PlanRow[]> {
  const cards = await trx.selectFrom('help_cards').select(['id', 'title', 'body', 'format', 'source_key']).where('tenant_id', '=', tenantId).execute();
  const places = await trx.selectFrom('help_places').select(['place_key', 'card_id']).where('tenant_id', '=', tenantId).execute();
  const byId = new Map(cards.map((c) => [String(c.id), c]));
  const used = new Set<string>();
  return pkg.cards.map((c) => {
    // chỉ ghép với thẻ chưa bị thẻ khác trong gói lấy (thẻ trùng tiêu đề / mã nguồn vẫn ghép đúng cặp)
    const pick = (f: (x: (typeof cards)[number]) => boolean) => cards.find((x) => !used.has(String(x.id)) && f(x));
    const sameTitle = (x: { title: string }) => x.title.trim().toLowerCase() === c.title.trim().toLowerCase();
    const bound = c.places.map((p) => places.find((x) => x.place_key === p.key)?.card_id).find((id) => id && !used.has(String(id)));
    const t = (c.sourceKey ? pick((x) => x.source_key === c.sourceKey && sameTitle(x)) : undefined)
      ?? (bound ? byId.get(String(bound)) : undefined)
      ?? (c.sourceKey ? pick((x) => x.source_key === c.sourceKey) : undefined)
      ?? pick(sameTitle);
    if (t) used.add(String(t.id));
    const titleChanged = Boolean(t) && t!.title !== c.title;
    const bodyChanged = Boolean(t) && (t!.body !== c.body || t!.format !== c.format);
    const pl = c.places.map((p) => {
      const cur = places.find((x) => x.place_key === p.key)?.card_id;
      const before = cur ? byId.get(String(cur))?.title ?? null : null;
      return { key: p.key, label: p.label, before, change: !t || String(cur ?? '') !== String(t.id) };
    });
    return { title: c.title, action: !t ? 'new' : titleChanged || bodyChanged ? 'update' : 'same', targetId: t ? String(t.id) : null, targetTitle: t?.title ?? null, titleChanged, bodyChanged, places: pl };
  });
}

export const helpService = {
  /** Gói JSON mọi thẻ + nơi gắn (mang sang máy chủ khác). */
  async exportPackage(auth: AuthContext) {
    const cards = await db.selectFrom('help_cards').select(['id', 'title', 'body', 'format', 'source_key']).where('tenant_id', '=', auth.tenantId).orderBy(sql`lower(title)`).execute();
    const places = await db.selectFrom('help_places').select(['place_key', 'label', 'card_id']).where('tenant_id', '=', auth.tenantId).where('card_id', 'is not', null).execute();
    return {
      kind: PKG_KIND, version: 1, exportedAt: new Date().toISOString(),
      cards: cards.map((c) => ({ title: c.title, format: c.format, body: c.body, sourceKey: c.source_key, places: places.filter((p) => String(p.card_id) === String(c.id)).map((p) => ({ key: p.place_key, label: p.label })) })),
    };
  },
  async previewPackage(auth: AuthContext, pkg: Pkg) {
    const rows = await planPackage(db, auth.tenantId, pkg);
    return { rows, counts: { new: rows.filter((x) => x.action === 'new').length, update: rows.filter((x) => x.action === 'update').length, same: rows.filter((x) => x.action === 'same').length, placesChanged: rows.reduce((n, x) => n + x.places.filter((p) => p.change).length, 0) } };
  },
  /** Nhập gói: ghi đè thẻ khớp, thêm thẻ mới, gắn đúng các nơi trong gói. */
  async importPackageIn(trx: ActionTx, auth: AuthContext, pkg: Pkg) {
    return sameTx(trx, async (trx) => {
      const rows = await planPackage(trx, auth.tenantId, pkg);
      let added = 0, updated = 0, bound = 0;
      for (const [i, row] of rows.entries()) {
        const c = pkg.cards[i]!;
        let id = row.targetId;
        if (!id) {
          id = String((await trx.insertInto('help_cards').values({ tenant_id: auth.tenantId, title: c.title, body: c.body, format: c.format, source_key: c.sourceKey, created_by: auth.actorName, updated_by: auth.actorName }).returning('id').executeTakeFirstOrThrow()).id);
          added++;
        } else if (row.action === 'update') {
          await trx.updateTable('help_cards').set({ title: c.title, body: c.body, format: c.format, ...(c.sourceKey ? { source_key: c.sourceKey } : {}), updated_by: auth.actorName, updated_at: new Date() })
            .where('tenant_id', '=', auth.tenantId).where('id', '=', id).execute();
          updated++;
        }
        for (const p of row.places) if (p.change) { await bind(trx, auth, p.key, p.label, id); bound++; }
      }
      return { added, updated, same: rows.filter((x) => x.action === 'same').length, bound };
    });
  },
  async place(auth: AuthContext, key: string) {
    const p = await db.selectFrom('help_places').selectAll().where('tenant_id', '=', auth.tenantId).where('place_key', '=', key).executeTakeFirst();
    if (!p?.card_id) return { key, label: p?.label ?? '', card: null };
    const c = await db.selectFrom('help_cards').selectAll().where('tenant_id', '=', auth.tenantId).where('id', '=', p.card_id).executeTakeFirst();
    return { key, label: p.label, card: c ? cardDto(c as unknown as CardRow) : null };
  },
  async cards(auth: AuthContext) {
    const rows = await db.selectFrom('help_cards').select(['id', 'title', 'body', 'format', 'source_key', 'created_by', 'updated_by', 'created_at', 'updated_at'])
      .where('tenant_id', '=', auth.tenantId).orderBy(sql`lower(title)`).execute();
    const places = await db.selectFrom('help_places').select(['place_key', 'label', 'card_id']).where('tenant_id', '=', auth.tenantId).where('card_id', 'is not', null).execute();
    return rows.map((r) => ({ ...cardDto(r as unknown as CardRow, false), places: places.filter((p) => p.card_id === r.id).map((p) => ({ key: p.place_key, label: p.label })) }));
  },
  async card(auth: AuthContext, id: string) {
    const c = await db.selectFrom('help_cards').selectAll().where('tenant_id', '=', auth.tenantId).where('id', '=', id).executeTakeFirst();
    if (!c) throw Errors.notFound(`thẻ hướng dẫn #${id}`);
    const places = await db.selectFrom('help_places').select(['place_key', 'label']).where('tenant_id', '=', auth.tenantId).where('card_id', '=', id).execute();
    return { ...cardDto(c as unknown as CardRow), places: places.map((p) => ({ key: p.place_key, label: p.label })) };
  },
  async createIn(trx: ActionTx, auth: AuthContext, i: z.infer<typeof cardBody>) {
    return sameTx(trx, async (trx) => {
      const r = await trx.insertInto('help_cards').values({ tenant_id: auth.tenantId, title: i.title, body: i.body, format: i.format, source_key: i.sourceKey, created_by: auth.actorName, updated_by: auth.actorName })
        .returningAll().executeTakeFirstOrThrow();
      if (i.placeKey) await bind(trx, auth, i.placeKey, i.placeLabel, String(r.id));
      return cardDto(r as unknown as CardRow);
    });
  },
  async updateIn(trx: ActionTx, auth: AuthContext, id: string, i: z.infer<typeof cardPatch>) {
    return sameTx(trx, async (trx) => {
      const r = await trx.updateTable('help_cards').set({ ...(i.title !== undefined ? { title: i.title } : {}), ...(i.body !== undefined ? { body: i.body } : {}), ...(i.format ? { format: i.format } : {}), updated_by: auth.actorName, updated_at: new Date() })
        .where('tenant_id', '=', auth.tenantId).where('id', '=', id).returningAll().executeTakeFirst();
      if (!r) throw Errors.notFound(`thẻ hướng dẫn #${id}`);
      return cardDto(r as unknown as CardRow);
    });
  },
  async removeIn(trx: ActionTx, auth: AuthContext, id: string) {
    return sameTx(trx, async (trx) => {
      const r = await trx.deleteFrom('help_cards').where('tenant_id', '=', auth.tenantId).where('id', '=', id).executeTakeFirst();
      if (!Number(r.numDeletedRows)) throw Errors.notFound(`thẻ hướng dẫn #${id}`);
      return { id };
    });
  },
  async bindIn(trx: ActionTx, auth: AuthContext, i: { key: string; label: string; cardId: string | null }) {
    return sameTx(trx, async (trx) => { await bind(trx, auth, i.key, i.label, i.cardId); return { key: i.key, cardId: i.cardId }; });
  },
  /** Chép tài liệu có sẵn: mỗi khoá một thẻ (đã chép thì bỏ qua); nơi cùng khoá chưa có thẻ thì gắn. */
  async importIn(trx: ActionTx, auth: AuthContext, docs: { key: string; title: string; body: string }[]) {
    return sameTx(trx, async (trx) => {
      let added = 0, bound = 0;
      for (const d of docs) {
        let card = await trx.selectFrom('help_cards').select('id').where('tenant_id', '=', auth.tenantId).where('source_key', '=', d.key).executeTakeFirst();
        if (!card) {
          card = await trx.insertInto('help_cards').values({ tenant_id: auth.tenantId, title: d.title, body: d.body, format: 'md', source_key: d.key, created_by: auth.actorName, updated_by: auth.actorName }).returning('id').executeTakeFirstOrThrow();
          added++;
        }
        const p = await trx.selectFrom('help_places').select('card_id').where('tenant_id', '=', auth.tenantId).where('place_key', '=', d.key).executeTakeFirst();
        if (!p?.card_id) { await bind(trx, auth, d.key, d.title, String(card.id)); bound++; }
      }
      return { added, bound };
    });
  },
};

export async function helpRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/help/place', { preHandler: read, schema: { tags, summary: 'Thẻ hướng dẫn đang gắn ở một màn / hộp thoại', querystring: z.object({ key: keySchema }) }, handler: async (req) => ok(await helpService.place(authOf(req), req.query.key)) });
  r.get('/api/v1/help/cards', { preHandler: read, schema: { tags, summary: 'Danh sách thẻ hướng dẫn' }, handler: async (req) => ok(await helpService.cards(authOf(req))) });
  r.get('/api/v1/help/export', { preHandler: read, schema: { tags, summary: 'Xuất gói JSON thẻ hướng dẫn + nơi gắn (mang sang máy chủ khác)' }, handler: async (req) => ok(await helpService.exportPackage(authOf(req))) });
  r.post('/api/v1/help/package/preview', { preHandler: read, bodyLimit: 100 * 1024 * 1024, schema: { tags, summary: 'Xem trước nhập gói thẻ hướng dẫn: thêm / ghi đè / không đổi, nơi gắn đổi', body: z.object({ package: pkgSchema }) },
    handler: async (req) => ok(await helpService.previewPackage(authOf(req), req.body.package)) });
  r.get('/api/v1/help/cards/:id', { preHandler: read, schema: { tags, summary: 'Một thẻ hướng dẫn', params: idParam }, handler: async (req) => ok(await helpService.card(authOf(req), req.params.id)) });
  mountActions(app, helpActions);
}

const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);
const helpActions: AnyActionDef[] = [
  defineAction({
    id: 'core.help.card-create', title: 'Thêm thẻ hướng dẫn', tags, permission: 'catalog:read', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: cardBody, output: anyOut, expose: { http: { method: 'POST', path: '/api/v1/help/cards', status: 201 }, mcp: false, ai: 'deny' }, evidence: { objectType: 'help_card' },
    handler: (ctx, i) => helpService.createIn(ctx.data.tx, ctx.legacyAuth, i),
  }),
  defineAction({
    id: 'core.help.card-update', title: 'Sửa thẻ hướng dẫn', tags, permission: 'catalog:read', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: cardPatch.merge(idParam), output: anyOut, expose: { http: { method: 'PATCH', path: '/api/v1/help/cards/:id' }, mcp: false, ai: 'deny' }, evidence: { objectType: 'help_card', objectId: (i) => String(i.id) },
    handler: (ctx, i) => { const { id, ...rest } = i; return helpService.updateIn(ctx.data.tx, ctx.legacyAuth, id, rest); },
  }),
  defineAction({
    id: 'core.help.card-delete', title: 'Xoá thẻ hướng dẫn', tags, permission: 'catalog:read', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: idParam, output: anyOut, expose: { http: { method: 'DELETE', path: '/api/v1/help/cards/:id' }, mcp: false, ai: 'deny' }, evidence: { objectType: 'help_card', objectId: (i) => String(i.id) },
    handler: (ctx, i) => helpService.removeIn(ctx.data.tx, ctx.legacyAuth, i.id),
  }),
  defineAction({
    id: 'core.help.place-bind', title: 'Gắn thẻ hướng dẫn vào màn / hộp thoại', tags, permission: 'catalog:read', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ key: keySchema, label: z.string().trim().max(300).default(''), cardId: z.string().regex(/^[1-9][0-9]*$/).nullable() }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/help/place' }, mcp: false, ai: 'deny' }, evidence: { objectType: 'help_place' },
    handler: (ctx, i) => helpService.bindIn(ctx.data.tx, ctx.legacyAuth, i),
  }),
  defineAction({
    id: 'core.help.import', title: 'Chép tài liệu hướng dẫn có sẵn thành thẻ', tags, permission: 'catalog:read', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ docs: z.array(z.object({ key: z.string().trim().min(1).max(200), title: z.string().trim().max(300), body: z.string().max(2_000_000) })).max(500) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/help/import' }, mcp: false, ai: 'deny' }, evidence: { objectType: 'help_card' },
    handler: (ctx, i) => helpService.importIn(ctx.data.tx, ctx.legacyAuth, i.docs),
  }),
  defineAction({
    id: 'core.help.package-import', title: 'Nhập gói thẻ hướng dẫn (ghi đè thẻ khớp, thêm thẻ mới, gắn nơi)', tags, permission: 'catalog:read', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ package: pkgSchema }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/help/package/import', bodyLimit: 100 * 1024 * 1024 }, mcp: false, ai: 'deny' }, evidence: { objectType: 'help_card' },
    handler: (ctx, i) => helpService.importPackageIn(ctx.data.tx, ctx.legacyAuth, i.package),
  }),
];
