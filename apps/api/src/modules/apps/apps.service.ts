// @bizcity-layer P apps.external
// [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14 (ADR-0011 mức 2): kết nối app với đơn vị — khoá có phạm vi, bí mật webhook, bật / tắt, cập nhật phạm vi, xoay khoá, vé iframe
/**
 * Kết nối app ngoài tiến trình với đơn vị (ADR-0011 mức 2). Dữ liệu: app_installations + api_keys.app_key (0051).
 *
 * Khoá API và bí mật webhook chỉ trả về MỘT lần (lúc kết nối / xoay khoá), như khoá API thường. Không qua runtime action:
 * bản lưu idempotency của action sẽ giữ bí mật trong CSDL. Mỗi thay đổi ghi nhật ký (audit) với người làm.
 */
import { db, type Db } from '@bizcity/platform/db/client';
import { Errors } from '@bizcity/platform/core/errors';
import { writeAudit } from '@bizcity/platform/core/audit';
import { PERMISSIONS, type AuthContext } from '@bizcity/platform/core/auth';
import { generateApiKey } from '@bizcity/platform/core/security/password';
import {
  appEventTypes, getAppManifest, listAppManifests, newWebhookSalt, signAppTicket, verifyAppTicket, webhookSecret, type AppManifest,
} from '@bizcity/platform/core/apps';
import { sameTx, type ActionTx } from '@bizcity/platform/core/actions';

const need = (key: string): AppManifest => {
  const m = getAppManifest(key);
  if (!m) throw Errors.notFound(`app "${key}" trong bản cài này`);
  return m;
};

const lockInstallation = (trx: Db, tenantId: string, key: string) =>
  trx.selectFrom('app_installations').selectAll().where('tenant_id', '=', tenantId).where('app_key', '=', key).forUpdate().executeTakeFirst();

/** Cấp khoá mới cho app (khoá cũ còn hiệu lực thì thu hồi trước). */
async function issueKey(trx: Db, tenantId: string, m: AppManifest) {
  await trx.updateTable('api_keys').set({ revoked_at: new Date() })
    .where('tenant_id', '=', tenantId).where('app_key', '=', m.key).where('revoked_at', 'is', null).execute();
  const k = generateApiKey();
  const row = await trx.insertInto('api_keys')
    .values({ tenant_id: tenantId, name: `App ${m.label}`, key_prefix: k.prefix, key_hash: k.hash, scopes: [], app_key: m.key })
    .returning('id').executeTakeFirstOrThrow();
  return { id: row.id, key: k.key, prefix: k.prefix };
}

const secretsOut = (tenantId: string, m: AppManifest, salt: string, key: { key: string; prefix: string }) => ({
  apiKey: key.key, keyPrefix: key.prefix,
  webhookSecret: m.app.webhook?.url ? webhookSecret(tenantId, m.key, salt) : null,
});

export const appsService = {
  /** App cài trong bản này + trạng thái kết nối của đơn vị. */
  async list(auth: AuthContext) {
    const rows = await db.selectFrom('app_installations').selectAll().where('tenant_id', '=', auth.tenantId).execute();
    return listAppManifests().map((m) => {
      const r = rows.find((x) => x.app_key === m.key);
      return {
        key: m.key, id: m.id, label: m.label, description: m.description, version: m.version, icon: m.ui?.icon ?? null,
        scopes: m.app.scopes ?? [], events: appEventTypes(m), webhook: Boolean(m.app.webhook?.url),
        ui: m.ui?.origin ? { origin: m.ui.origin, entry: m.ui.entry ?? '/' } : null,
        installation: r ? {
          status: r.status, appVersion: r.app_version, permissions: r.permissions, events: r.events, installedAt: r.installed_at,
          // Manifest đổi phạm vi so với lúc chủ đơn vị đồng ý → cần đồng ý lại (update) mới có hiệu lực.
          scopeChanged: r.app_version !== m.version || [...r.permissions].sort().join() !== [...(m.app.scopes ?? [])].sort().join()
            || [...r.events].sort().join() !== appEventTypes(m).sort().join(),
        } : null,
      };
    });
  },

  /** Kết nối app: đồng ý phạm vi trong manifest, nhận khoá API + bí mật webhook (một lần). */
  async install(auth: AuthContext, key: string) {
    return db.transaction().execute((trx) => appsService.installIn(trx, auth, key));
  },

  // [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): bản *In chạy trong giao dịch của action (defineAction); bản cũ giữ chữ ký, tự mở giao dịch
  async installIn(trx: ActionTx, auth: AuthContext, key: string) {
    const m = need(key);
    return sameTx(trx, async (trx) => {
      const cur = await lockInstallation(trx, auth.tenantId, key);
      if (cur) throw Errors.conflict(cur.status === 'active' ? `App ${m.label} đã kết nối với đơn vị này` : `App ${m.label} đã kết nối nhưng đang tắt — bật lại thay vì kết nối mới`);
      const salt = newWebhookSalt();
      const permissions = m.app.scopes ?? [];
      const events = appEventTypes(m);
      await trx.insertInto('app_installations').values({
        tenant_id: auth.tenantId, app_key: key, app_version: m.version, permissions, events, webhook_salt: salt, installed_by: auth.actor,
      }).execute();
      const k = await issueKey(trx, auth.tenantId, m);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'app.install', objectType: 'app', objectId: key, after: { version: m.version, permissions, events, apiKeyId: k.id } });
      return { key, permissions, events, ...secretsOut(auth.tenantId, m, salt, k) };
    });
  },

  /** Bật / tắt kết nối. Tắt: khoá app bị từ chối, webhook ngừng; dữ liệu và bút toán app đã nộp giữ nguyên. */
  async setStatus(auth: AuthContext, key: string, status: 'active' | 'disabled') {
    return db.transaction().execute((trx) => appsService.setStatusIn(trx, auth, key, status));
  },

  // [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): bản *In chạy trong giao dịch của action (defineAction); bản cũ giữ chữ ký, tự mở giao dịch
  async setStatusIn(trx: ActionTx, auth: AuthContext, key: string, status: 'active' | 'disabled') {
    need(key);
    return sameTx(trx, async (trx) => {
      const cur = await lockInstallation(trx, auth.tenantId, key);
      if (!cur) throw Errors.notFound(`kết nối app "${key}" của đơn vị`);
      if (cur.status === status) return { key, status, changed: false };
      await trx.updateTable('app_installations').set({ status, updated_by: auth.actor, updated_at: new Date() })
        .where('tenant_id', '=', auth.tenantId).where('app_key', '=', key).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: status === 'active' ? 'app.enable' : 'app.disable', objectType: 'app', objectId: key, before: { status: cur.status }, after: { status } });
      return { key, status, changed: true };
    });
  },

  /** Đồng ý phạm vi mới của manifest (app nâng cấp xin thêm / bớt quyền, sự kiện). Không đổi khoá. */
  async updateScope(auth: AuthContext, key: string) {
    return db.transaction().execute((trx) => appsService.updateScopeIn(trx, auth, key));
  },

  // [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): bản *In chạy trong giao dịch của action (defineAction); bản cũ giữ chữ ký, tự mở giao dịch
  async updateScopeIn(trx: ActionTx, auth: AuthContext, key: string) {
    const m = need(key);
    return sameTx(trx, async (trx) => {
      const cur = await lockInstallation(trx, auth.tenantId, key);
      if (!cur) throw Errors.notFound(`kết nối app "${key}" của đơn vị`);
      const after = { version: m.version, permissions: m.app.scopes ?? [], events: appEventTypes(m) };
      await trx.updateTable('app_installations').set({ app_version: after.version, permissions: after.permissions, events: after.events, updated_by: auth.actor, updated_at: new Date() })
        .where('tenant_id', '=', auth.tenantId).where('app_key', '=', key).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'app.scope', objectType: 'app', objectId: key, before: { version: cur.app_version, permissions: cur.permissions, events: cur.events }, after });
      return { key, ...after };
    });
  },

  /** Xoay khoá: thu hồi khoá API cũ, cấp khoá mới + bí mật webhook mới (một lần). */
  async rotate(auth: AuthContext, key: string) {
    return db.transaction().execute((trx) => appsService.rotateIn(trx, auth, key));
  },

  // [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): bản *In chạy trong giao dịch của action (defineAction); bản cũ giữ chữ ký, tự mở giao dịch
  async rotateIn(trx: ActionTx, auth: AuthContext, key: string) {
    const m = need(key);
    return sameTx(trx, async (trx) => {
      const cur = await lockInstallation(trx, auth.tenantId, key);
      if (!cur) throw Errors.notFound(`kết nối app "${key}" của đơn vị`);
      const salt = newWebhookSalt();
      await trx.updateTable('app_installations').set({ webhook_salt: salt, updated_by: auth.actor, updated_at: new Date() })
        .where('tenant_id', '=', auth.tenantId).where('app_key', '=', key).execute();
      const k = await issueKey(trx, auth.tenantId, m);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'app.rotate', objectType: 'app', objectId: key, after: { apiKeyId: k.id } });
      return { key, ...secretsOut(auth.tenantId, m, salt, k) };
    });
  },

  /** Vé iframe cho người dùng đang đăng nhập (≤ 5 phút). Giao diện chuyển vé cho iframe qua postMessage, không qua URL. */
  async ticket(auth: AuthContext, key: string) {
    const m = need(key);
    if (auth.kind !== 'user') throw Errors.forbidden('Vé iframe chỉ cấp cho người dùng đăng nhập giao diện');
    if (!m.ui?.origin) throw Errors.validation(`App ${m.label} không có giao diện nhúng (ui.origin)`);
    const inst = await db.selectFrom('app_installations').select('status').where('tenant_id', '=', auth.tenantId).where('app_key', '=', key).executeTakeFirst();
    if (inst?.status !== 'active') throw Errors.moduleDisabled(key);
    const t = await signAppTicket({ tenantId: auth.tenantId, app: key, userId: auth.actor.replace(/^user:/, ''), name: auth.actorName, role: auth.role ?? '' });
    return { ...t, origin: m.ui.origin, url: `${m.ui.origin}${m.ui.entry ?? '/'}` };
  },

  /** App (bằng khoá của nó) đổi vé lấy ngữ cảnh: đơn vị, người dùng đang mở iframe, phạm vi của app. */
  async exchange(auth: AuthContext, ticket: string) {
    if (!auth.app) throw Errors.forbidden('Chỉ khoá API của app đổi được vé iframe');
    const c = await verifyAppTicket(ticket);
    if (!c) throw Errors.unauthorized('Vé không hợp lệ hoặc đã hết hạn');
    if (c.app !== auth.app || c.tenantId !== auth.tenantId) throw Errors.forbidden('Vé không cấp cho app / đơn vị này');
    const user = await db.selectFrom('users').select(['id', 'full_name', 'role', 'is_active']).where('tenant_id', '=', c.tenantId).where('id', '=', c.userId).executeTakeFirst();
    if (!user?.is_active) throw Errors.unauthorized('Người dùng của vé không còn hoạt động');
    const tenant = await db.selectFrom('tenants').select(['id', 'code', 'name']).where('id', '=', c.tenantId).executeTakeFirstOrThrow();
    return {
      app: auth.app,
      tenant: { id: String(tenant.id), code: tenant.code, name: tenant.name },
      user: { id: String(user.id), name: user.full_name, role: user.role },
      // [2026-11-09 05:20 PM kiennt] PHASE-028 — giai đoạn 3.1: chỉ báo quyền Core app được cấp (như trước) — quyền chứng từ chi tiết được documents:write kéo theo là chi tiết thi hành, không đổi hợp đồng của app
      permissions: [...auth.permissions].filter((p) => (PERMISSIONS as readonly string[]).includes(p)).sort(),
    };
  },
};
