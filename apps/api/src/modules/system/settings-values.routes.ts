// @bizcity-layer P module-sdk
// [2026-11-06 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E2 đợt 1 (S029-10, bizcity_settings@1 1.1.0-draft §2.4): một đường đọc / ghi cấu hình có phạm vi, ngày hiệu lực, phiên bản
/**
 * GIÁ TRỊ CẤU HÌNH (bizcity_settings@1 §2) — một kho, một đường ghi cho mọi khoá registry có `valueType`:
 *   GET /api/v1/settings/values                 khoá đi đường chung: lớp, phạm vi được phép, giá trị hiện hành của đơn vị, configVersion
 *   GET /api/v1/settings/values/:key            giá trị hiệu lực theo ?branchId&accountingUnitId&userId&date + nguồn (phạm vi / bản cũ / mặc định)
 *   GET /api/v1/settings/values/:key/history    mọi phiên bản: người, lúc, lý do, hiệu lực, phạm vi
 *   PUT /api/v1/settings/values/:key            core.settings.set — ghi phiên bản mới (settings:write + quyền riêng của khoá; loại A bắt buộc lý do)
 * Route ghi riêng cũ (/settings/posting-modes, /data-lock, /item-auto-create…) còn chạy tới đợt 2; khoá của chúng vẫn đọc đúng qua đây.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@bizcity/platform/db/client';
import { authOf, requireAuthenticated } from '@bizcity/platform/core/auth';
import { Errors } from '@bizcity/platform/core/errors';
import { ok } from '@bizcity/platform/core/http';
import { defineAction, mountActions } from '@bizcity/platform/core/actions';
import { getSetting, setSetting, settingHistory, settingsRegistry, type SettingScope } from '@bizcity/platform/core/settings';

const tags = ['Cấu hình'];
const KEY_RE = /^bizcity\.[a-z0-9_]+(\.[a-z0-9_]+)+$/;
const idText = z.string().regex(/^\d+$/, 'định danh số');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

/** Khoá đi đường chung (có valueType) — khoá khác báo rõ "ghi qua đường riêng". */
function sharedKey(key: string) {
  if (!KEY_RE.test(key)) throw Errors.validation(`Khoá "${key}" sai khuôn bizcity.<miền>.<khoá>`);
  const e = settingsRegistry().get(key);
  if (!e) throw Errors.notFound(`khoá cấu hình ${key}`);
  if (!e.valueType) throw Errors.validation(`Khoá "${key}" chưa đi đường chung (chưa có valueType) — dùng màn / route riêng của nó`);
  return e;
}

const setValue = defineAction({
  id: 'core.settings.set', title: 'Ghi một giá trị cấu hình (phiên bản mới)', tags,
  description: 'Ghi phiên bản mới của một khoá cấu hình theo phạm vi (đơn vị / đơn vị hạch toán / chi nhánh / người dùng) và ngày hiệu lực. '
    + 'Không ghi đè: phiên bản cũ giữ nguyên làm lịch sử. Khoá loại A (ảnh hưởng sổ) và hiệu lực lùi về trước hôm nay bắt buộc lý do; '
    + 'đổi chỉ áp cho nghiệp vụ từ ngày hiệu lực, không đổi bút toán đã ghi (R-MATRIX-6).',
  permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'required',
  input: z.object({
    key: z.string(),
    value: z.unknown(),
    scope: z.enum(['tenant', 'accounting_unit', 'branch', 'user']).default('tenant'),
    scopeId: idText.optional(),
    validFrom: date.optional(),
    reason: z.string().max(500).optional(),
  }),
  output: z.object({ key: z.string(), value: z.unknown(), before: z.unknown(), source: z.unknown(), configVersion: z.number() }),
  expose: { http: { method: 'PUT', path: '/api/v1/settings/values/:key' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'setting', objectId: (input) => input.key },
  handler: async (ctx, input) => {
    sharedKey(input.key);
    if (input.value === undefined) throw Errors.validation('Thiếu value');
    return setSetting(ctx.data.tx, { tenantId: ctx.tenant.id, actor: ctx.legacyAuth.actor, can: (p) => ctx.can(p as never) }, input.key, {
      value: input.value, scope: input.scope, scopeId: input.scopeId, validFrom: input.validFrom, reason: input.reason,
    });
  },
});

export const SETTINGS_VALUE_ACTIONS = [setValue];

const readQuery = z.object({ branchId: idText.optional(), accountingUnitId: idText.optional(), userId: idText.optional(), date: date.optional() });

export async function settingsValuesRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, SETTINGS_VALUE_ACTIONS);

  app.get('/api/v1/settings/values', {
    preHandler: requireAuthenticated(),
    schema: { tags, summary: 'Khoá cấu hình đi đường chung (có valueType): lớp, phạm vi được phép, giá trị hiện hành của đơn vị, configVersion' },
    handler: async (req) => {
      const auth = authOf(req);
      return db.transaction().execute(async (trx) => {
        const entries = [...settingsRegistry().values()].filter((e) => e.valueType).sort((a, b) => a.key.localeCompare(b.key));
        const items = [];
        let configVersion = 0;
        for (const e of entries) {
          const r = await getSetting(trx, auth.tenantId, e.key);
          configVersion = r.configVersion;
          items.push({ key: e.key, class: e.class ?? null, owner: e.owner, scopes: e.scopes, valueType: e.valueType, permission: e.permission ?? null, value: r.value, source: r.source });
        }
        return ok({ configVersion, items });
      });
    },
  });

  app.get<{ Params: { key: string }; Querystring: Record<string, string> }>('/api/v1/settings/values/:key', {
    preHandler: requireAuthenticated(),
    schema: { tags, summary: 'Giá trị hiệu lực của một khoá theo phạm vi và ngày (hẹp → rộng → mặc định) và nguồn của nó' },
    handler: async (req) => {
      const auth = authOf(req);
      sharedKey(req.params.key);
      const q = readQuery.safeParse(req.query);
      if (!q.success) throw Errors.validation(q.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      // Đọc tuỳ chọn của người khác cần quyền cấu hình; không truyền userId = đọc theo chính mình nếu khoá có phạm vi user.
      const self = auth.actor.startsWith('user:') ? auth.actor.slice(5) : undefined;
      if (q.data.userId && q.data.userId !== self && !auth.permissions.has('settings:write')) throw Errors.forbidden('Đọc cấu hình của người dùng khác cần quyền settings:write');
      const scope: SettingScope = { ...q.data, userId: q.data.userId ?? self };
      return db.transaction().execute(async (trx) => ok(await getSetting(trx, auth.tenantId, req.params.key, scope)));
    },
  });

  app.get<{ Params: { key: string } }>('/api/v1/settings/values/:key/history', {
    preHandler: requireAuthenticated(),
    schema: { tags, summary: 'Mọi phiên bản của một khoá cấu hình trong đơn vị (người ghi, lúc, lý do, hiệu lực, phạm vi)' },
    handler: async (req) => {
      const auth = authOf(req);
      sharedKey(req.params.key);
      return db.transaction().execute(async (trx) => ok({ key: req.params.key, versions: await settingHistory(trx, auth.tenantId, req.params.key) }));
    },
  });
}
