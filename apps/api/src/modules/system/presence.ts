// @bizcity-layer P permissions
/**
 * NGƯỜI DÙNG ĐANG ONLINE — mỗi tab đang mở (và đang hiện) báo về ~1 phút / lần:
 *   POST /api/v1/presence/ping { deviceId, tabId, path, screen, leave? }
 * deviceId: mã riêng của TRÌNH DUYỆT (lưu trong máy) — nhiều tab cùng máy = 1 thiết bị. Đếm theo THIẾT BỊ để tài khoản dùng chung
 * (vd tài khoản trải nghiệm gửi cả nhóm) vẫn ra đúng số người thật: 8 người / 8 máy cùng một tài khoản = 8 online.
 * Online = có tab báo trong ONLINE_MS gần nhất; tab đóng / ẩn thì gửi leave (hoặc tự hết hạn).
 *
 *   GET /api/v1/presence   mọi người dùng: số thiết bị online, số tài khoản, số tab, số thiết bị / tài khoản đã vào hôm nay;
 *                          người có quyền users:write xem thêm danh sách theo tài khoản → từng thiết bị (trình duyệt · hệ điều hành,
 *                          màn đang mở, online từ lúc nào, mấy tab).
 *
 * Lưu trong bộ nhớ tiến trình API (một tiến trình — docker-compose một dịch vụ api): khởi động lại thì danh sách tự đầy lại sau
 * ~1 phút. Không ghi cơ sở dữ liệu, không lưu IP; chỉ giữ tên trình duyệt / hệ điều hành rút từ User-Agent. Khoá API không tính.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requireAuthenticated } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { todayVN } from '../../core/date-rules.js';

const ONLINE_MS = 150_000; // 2,5 phút: tab báo mỗi 60 giây, lỡ một nhịp vẫn còn online
interface Tab { path: string; screen: string; seen: number }
interface Device { agent: string; since: number; tabs: Map<string, Tab> }
interface UserPresence { name: string; role: string | null; devices: Map<string, Device> }

const tenants = new Map<string, Map<string, UserPresence>>();
/** Đã vào trong ngày (giờ Việt Nam): tài khoản + thiết bị. */
const today = new Map<string, { day: string; users: Set<string>; devices: Set<string> }>();

/** "Chrome · Windows", "Safari · iPhone"… — chỉ để phân biệt các máy dùng chung tài khoản. */
export function agentLabel(ua: string): string {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /coc_coc|CocCoc/i.test(ua) ? 'Cốc Cốc' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(' · ') || 'Trình duyệt khác';
}

function sweep(users: Map<string, UserPresence>, now: number) {
  for (const [id, u] of users) {
    for (const [did, d] of u.devices) {
      for (const [tid, t] of d.tabs) if (now - t.seen > ONLINE_MS) d.tabs.delete(tid);
      if (!d.tabs.size) u.devices.delete(did);
    }
    if (!u.devices.size) users.delete(id);
  }
}

export function touchPresence(tenantId: string, actor: string, name: string, role: string | null, agent: string,
  tab: { deviceId: string; tabId: string; path: string; screen: string; leave?: boolean }) {
  const now = Date.now();
  let users = tenants.get(tenantId);
  if (!users) { users = new Map(); tenants.set(tenantId, users); }
  sweep(users, now);
  // Trình duyệt cũ chưa gửi deviceId: coi mỗi tab là một thiết bị (không gộp nhầm nhiều máy).
  const deviceId = tab.deviceId || `tab:${tab.tabId}`;
  let u = users.get(actor);
  if (tab.leave) {
    const d = u?.devices.get(deviceId);
    d?.tabs.delete(tab.tabId);
    if (u && d && !d.tabs.size) u.devices.delete(deviceId);
    if (u && !u.devices.size) users.delete(actor);
    return;
  }
  if (!u) { u = { name, role, devices: new Map() }; users.set(actor, u); }
  u.name = name; u.role = role;
  let d = u.devices.get(deviceId);
  if (!d) { d = { agent, since: now, tabs: new Map() }; u.devices.set(deviceId, d); }
  d.agent = agent;
  d.tabs.set(tab.tabId, { path: tab.path, screen: tab.screen, seen: now });
  const day = todayVN();
  let t = today.get(tenantId);
  if (!t || t.day !== day) { t = { day, users: new Set(), devices: new Set() }; today.set(tenantId, t); }
  t.users.add(actor);
  t.devices.add(`${actor}|${deviceId}`);
}

export function readPresence(tenantId: string, withList: boolean) {
  const users = tenants.get(tenantId) ?? new Map<string, UserPresence>();
  sweep(users, Date.now());
  const all = [...users.values()];
  const devices = all.reduce((s, u) => s + u.devices.size, 0);
  const t = today.get(tenantId);
  const fresh = t && t.day === todayVN();
  const list = withList ? all.map((u) => ({
    name: u.name, role: u.role,
    devices: [...u.devices.values()].map((d) => {
      const last = [...d.tabs.values()].sort((a, b) => b.seen - a.seen)[0]!;
      return { agent: d.agent, since: new Date(d.since).toISOString(), lastSeen: new Date(last.seen).toISOString(), screen: last.screen, path: last.path, tabs: d.tabs.size };
    }).sort((a, b) => a.since.localeCompare(b.since)),
  })).sort((a, b) => b.devices.length - a.devices.length || a.name.localeCompare(b.name, 'vi')) : undefined;
  return {
    /** Số hiện trên thanh trên cùng = số THIẾT BỊ đang online (tài khoản dùng chung vẫn đếm đúng số máy). */
    online: devices, devices, accounts: users.size,
    tabs: all.reduce((s, u) => s + [...u.devices.values()].reduce((x, d) => x + d.tabs.size, 0), 0),
    today: fresh ? t.devices.size : devices, todayAccounts: fresh ? t.users.size : users.size,
    users: list,
  };
}

export async function presenceRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.post('/api/v1/presence/ping', {
    preHandler: requireAuthenticated(),
    schema: {
      tags: ['Hệ thống'], summary: 'Tab đang mở báo còn online (≈1 phút / lần); deviceId = mã trình duyệt (đếm theo thiết bị); leave = tab đóng / ẩn',
      body: z.object({ deviceId: z.string().max(64).default(''), tabId: z.string().min(1).max(64), path: z.string().max(300).default(''), screen: z.string().max(200).default(''), leave: z.boolean().default(false) }),
    },
    handler: async (req) => {
      const a = authOf(req);
      if (a.kind === 'user') touchPresence(a.tenantId, a.actor, a.actorName, a.role, agentLabel(String(req.headers['user-agent'] ?? '')), req.body);
      return ok(readPresence(a.tenantId, false));
    },
  });
  r.get('/api/v1/presence', {
    preHandler: requireAuthenticated(),
    schema: { tags: ['Hệ thống'], summary: 'Thiết bị / tài khoản đang online, số tab, đã vào hôm nay; danh sách chi tiết theo tài khoản → thiết bị cho người có quyền quản trị người dùng' },
    handler: async (req) => {
      const a = authOf(req);
      return ok(readPresence(a.tenantId, a.permissions.has('users:write')));
    },
  });
}
