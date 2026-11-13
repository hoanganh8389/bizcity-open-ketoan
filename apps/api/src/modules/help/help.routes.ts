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

export const helpService = {
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
];
