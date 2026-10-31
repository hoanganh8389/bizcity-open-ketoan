// @bizcity-layer A adapters/wordpress
/**
 * Kết nối hệ thống khác (trạm ACC14): cấu hình lưu ở tenants.settings.connections, lần kéo gần nhất ở
 * tenants.settings.connectionPulls. Không có bảng riêng.
 *
 * Kéo chứng từ: gọi API của hệ thống nguồn theo khoảng ngày (theo trang), mỗi chứng từ kiểm theo khuôn rồi lưu qua
 * cùng một cửa với cổng chờ (postDocumentIn) ở chế độ GIỮ: luôn "Chờ định khoản", kể cả loại chứng từ đặt định khoản
 * ngay. Nguồn (sourceSystem) của chứng từ = mã kết nối. Chứng từ đã có đúng phiên bản thì bỏ qua; phiên bản mới thì
 * chờ định khoản lại (bút toán cũ giữ nguyên tới khi định khoản lại).
 * Đầu chuẩn: sau mỗi trang, báo nhận cho hệ thống nguồn (POST cùng đường dẫn, { received, rejected }) để bên đó đánh dấu
 * phiếu đã vào cổng chờ; POST bị chặn (403) thì báo nhận bằng GET ?ack=<json>; báo nhận lỗi không làm hỏng lần kéo
 * (ghi ở ackError).
 */
import {
  SECRET_MASK, connectionSchema, ingestDocumentSchema,
  type Connection, type ConnectionView, type IngestDocument, type PullResult,
} from '@ketoan/contracts';
import { db } from '../../db/client.js';
import { Errors, AppError } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/auth.js';
import { documentService, postDocumentIn } from '../../kernel/public.js';
import { fetchWooPage, wooOrderToDocument } from './woocommerce.js';
import { env } from '../../config/env.js';

type Settings = Record<string, unknown> & { connections?: unknown[]; connectionPulls?: Record<string, ConnectionView['lastPull']> };
const MAX_PAGES = 500;
/** Độ dài tối đa (ký tự) của danh sách mã cửa hàng trong một lần gọi đầu chuẩn (tham số shops trên đường dẫn). */
const SHOPS_PER_REQUEST_CHARS = 600;

async function loadSettings(tenantId: string): Promise<Settings> {
  const t = await db.selectFrom('tenants').select('settings').where('id', '=', tenantId).executeTakeFirstOrThrow();
  return ((t.settings as Settings) ?? {}) as Settings;
}

function readConnections(s: Settings): Connection[] {
  return (s.connections ?? []).flatMap((raw) => {
    const p = connectionSchema.safeParse(raw);
    return p.success ? [p.data] : [];
  });
}

const mask = (v: string) => (v ? SECRET_MASK : '');

/** Kết nối chính tới hệ thống bán hàng (đầu chuẩn, đang bật) — nơi nhận báo "danh mục hàng vừa đổi". */
export async function primaryConnection(tenantId: string): Promise<Connection | null> {
  return readConnections(await loadSettings(tenantId)).find((c) => c.primary && c.enabled && c.kind === 'standard') ?? null;
}

export const connectionService = {
  /**
   * Chứng từ hệ thống nguồn TỰ ĐẨY vào (khoá API, gửi tức thời theo sự kiện) — chuẩn hoá y như chứng từ KÉO qua kết nối
   * cùng mã (sourceSystem = mã kết nối): đổi hình thức thanh toán theo cột "Đổi hình thức" của kết nối. Hai đường vào
   * (đẩy / kéo) cho cùng một kết quả. Sổ thuế (BOOK_MODE=tax): chỉ nhận phiếu bán / hoàn có số hoá đơn, còn lại bỏ qua.
   */
  async prepareIncoming(tenantId: string, raw: unknown): Promise<{ doc: unknown; skip?: string }> {
    if (env.BOOK_MODE === 'tax' && !isInvoicedTrade(raw)) return { doc: raw, skip: 'Sổ thuế chỉ nhận phiếu bán / hoàn có số hoá đơn' };
    const code = (raw as { sourceSystem?: unknown })?.sourceSystem;
    if (typeof code !== 'string' || !code) return { doc: raw };
    const c = readConnections(await loadSettings(tenantId)).find((x) => x.code === code);
    return { doc: c ? mapMethods(raw as Record<string, unknown>, c.methodMap) : raw };
  },

  async list(auth: AuthContext): Promise<ConnectionView[]> {
    const s = await loadSettings(auth.tenantId);
    return readConnections(s).map((c) => ({ ...c, apiKey: mask(c.apiKey), apiSecret: mask(c.apiSecret), lastPull: s.connectionPulls?.[c.code] ?? null }));
  },

  /** Ghi cả danh sách kết nối. Khoá gửi lên đúng chuỗi che thì giữ khoá đang lưu. */
  async save(auth: AuthContext, input: Connection[]): Promise<ConnectionView[]> {
    await db.transaction().execute(async (trx) => {
      const t = await trx.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).forUpdate().executeTakeFirstOrThrow();
      const s = ((t.settings as Settings) ?? {}) as Settings;
      const old = new Map(readConnections(s).map((c) => [c.code, c]));
      const next = input.map((c) => ({
        ...c,
        apiKey: c.apiKey === SECRET_MASK ? (old.get(c.code)?.apiKey ?? '') : c.apiKey,
        apiSecret: c.apiSecret === SECRET_MASK ? (old.get(c.code)?.apiSecret ?? '') : c.apiSecret,
      }));
      const pulls = Object.fromEntries(Object.entries(s.connectionPulls ?? {}).filter(([k]) => next.some((c) => c.code === k)));
      await trx.updateTable('tenants').set({ settings: JSON.stringify({ ...s, connections: next, connectionPulls: pulls }) }).where('id', '=', auth.tenantId).execute();
      await writeAudit(trx, {
        tenantId: auth.tenantId, actor: auth.actor, action: 'settings.connections', objectType: 'tenant', objectId: auth.tenantId,
        before: [...old.values()].map((c) => ({ code: c.code, kind: c.kind, url: c.url, enabled: c.enabled })),
        after: next.map((c) => ({ code: c.code, kind: c.kind, url: c.url, enabled: c.enabled })),
      });
    });
    return connectionService.list(auth);
  },

  async get(auth: AuthContext, code: string): Promise<Connection> {
    const c = readConnections(await loadSettings(auth.tenantId)).find((x) => x.code === code);
    if (!c) throw Errors.notFound(`kết nối ${code}`);
    return c;
  },

  /** Thử kết nối: đọc trang đầu của hôm nay, không lưu gì. */
  async test(auth: AuthContext, code: string): Promise<{ ok: boolean; message: string; sample: number }> {
    const c = await connectionService.get(auth, code);
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    try {
      const page = await fetchPage(c, today, today, null, 1);
      return { ok: true, message: `Kết nối được. Hôm nay có ${page.docs.length}${page.next ? '+' : ''} chứng từ.`, sample: page.docs.length };
    } catch (e) {
      return { ok: false, message: (e as Error).message, sample: 0 };
    }
  },

  /** Kéo chứng từ của một kết nối trong khoảng ngày về trạm ACC14 (chờ định khoản). */
  async pull(auth: AuthContext, code: string, q: { from: string; to: string; branchCodes?: string[] }): Promise<PullResult> {
    const c = await connectionService.get(auth, code);
    if (!c.enabled) throw Errors.conflict(`Kết nối ${c.name} đang tắt`);
    const result: PullResult = { connection: c.code, fetched: 0, received: 0, unchanged: 0, errors: [], cancelled: 0 };
    // Sổ thuế: chỉ nhận phiếu bán / hoàn có số hoá đơn từ cổng chờ chuẩn; đơn WooCommerce không kéo.
    if (env.BOOK_MODE === 'tax' && c.kind === 'woocommerce') return result;
    // Kéo theo chi nhánh đang chọn: đầu chuẩn gửi mã cửa hàng ở hệ thống nguồn (mã tham chiếu của chi nhánh, không có thì
    // mã chi nhánh) để nguồn chỉ quét các cửa hàng đó; WooCommerce chỉ kéo khi chi nhánh nhận đơn nằm trong danh sách.
    let shops: string[] | undefined;
    if (q.branchCodes?.length) {
      if (c.kind === 'woocommerce') {
        if (!q.branchCodes.includes(c.branchCode)) return result;
      } else {
        const rows = await db.selectFrom('branches').select(['code', 'external_ref']).where('tenant_id', '=', auth.tenantId).where('code', 'in', q.branchCodes).execute();
        shops = [...new Set(rows.flatMap((b) => [b.code, b.external_ref].filter((x): x is string => Boolean(x))))];
        if (!shops.length) return result;
      }
    }
    // Nhiều chi nhánh: chia mã cửa hàng thành từng nhóm cho đường dẫn đủ ngắn (máy chủ từ chối URL quá dài — lỗi 414),
    // kéo lần lượt từng nhóm, mỗi nhóm đọc hết các trang.
    const groups: (string[] | undefined)[] = [];
    if (!shops) groups.push(undefined);
    else for (let i = 0, cur: string[] = [], len = 0; i < shops.length; i++) {
      cur.push(shops[i]!); len += shops[i]!.length + 1;
      if (len > SHOPS_PER_REQUEST_CHARS || i === shops.length - 1) { groups.push(cur); cur = []; len = 0; }
    }
    for (const group of groups) {
    let cursor: string | null = null;
    for (let page = 1; page <= MAX_PAGES; page++) {
      let got: { docs: unknown[]; cancelled: { docKey: string; reason: string }[]; next: string | null };
      try {
        got = await fetchPage(c, q.from, q.to, cursor, page, group);
      } catch (e) {
        throw Errors.validation(`Không đọc được ${c.name}: ${(e as Error).message}`);
      }
      const received: { docKey: string; version: number; status: 'received' | 'unchanged' }[] = [];
      const rejected: { docKey: string; message: string }[] = [];
      for (const raw of got.docs) {
        // Sổ thuế: bỏ qua (không nhận, không báo nhận) chứng từ không phải bán / hoàn có hoá đơn — cổng chờ đã lọc, đây là chốt chặn.
        if (env.BOOK_MODE === 'tax' && !isInvoicedTrade(raw)) continue;
        result.fetched++;
        const parsed = ingestDocumentSchema.safeParse(mapMethods({ ...(raw as object), sourceSystem: c.code }, c.methodMap));
        const key = String((raw as { docKey?: unknown })?.docKey ?? '?');
        const no = String((raw as { docNo?: unknown })?.docNo ?? key);
        if (!parsed.success) {
          const message = `Sai khuôn: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
          result.errors.push({ docKey: key, docNo: no, message });
          rejected.push({ docKey: key, message });
          continue;
        }
        try {
          const r = await db.transaction().execute((trx) => postDocumentIn(trx, auth, parsed.data as IngestDocument, { hold: true }));
          if (r.status === 'unchanged') result.unchanged++;
          else result.received++;
          received.push({ docKey: parsed.data.docKey, version: parsed.data.version, status: r.status === 'unchanged' ? 'unchanged' : 'received' });
        } catch (e) {
          const message = e instanceof AppError ? e.message : (e as Error).message;
          result.errors.push({ docKey: key, docNo: no, message });
          rejected.push({ docKey: key, message });
        }
      }
      // Phiếu đã gửi nay bị xoá ở nguồn: đưa về cổng chờ ở trạng thái Chờ huỷ (kế toán định khoản mới huỷ). Chưa từng nhận thì bỏ qua.
      const cancelledKeys: { docKey: string }[] = [];
      for (const x of got.cancelled) {
        try {
          const exists = await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', auth.tenantId).where('doc_key', '=', x.docKey).executeTakeFirst();
          if (exists) {
            if ((await documentService.requestCancel(auth, x.docKey, x.reason || `Phiếu đã xoá ở ${c.name}`)).requested) result.cancelled++;
          }
          cancelledKeys.push({ docKey: x.docKey });
        } catch (e) {
          result.errors.push({ docKey: x.docKey, docNo: x.docKey, message: `Không huỷ được: ${e instanceof AppError ? e.message : (e as Error).message}` });
        }
      }
      if (c.kind === 'standard' && (received.length || rejected.length || cancelledKeys.length)) {
        try {
          await acknowledge(c, received, rejected, cancelledKeys);
        } catch (e) {
          result.ackError = (e as Error).message;
        }
      }
      if (!got.next) break;
      cursor = got.next;
    }
    }
    await db.transaction().execute(async (trx) => {
      const t = await trx.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).forUpdate().executeTakeFirstOrThrow();
      const s = ((t.settings as Settings) ?? {}) as Settings;
      const lastPull = { at: new Date().toISOString(), from: q.from, to: q.to, fetched: result.fetched, received: result.received, unchanged: result.unchanged, errors: result.errors.length, cancelled: result.cancelled };
      await trx.updateTable('tenants').set({ settings: JSON.stringify({ ...s, connectionPulls: { ...(s.connectionPulls ?? {}), [c.code]: lastPull } }) }).where('id', '=', auth.tenantId).execute();
    });
    return result;
  },
};

/**
 * Địa chỉ cổng chờ của kết nối. Sổ thuế gửi kèm consumer=tax: nguồn lọc phiếu bán / hoàn có hoá đơn và giữ nhật ký gửi
 * riêng, báo nhận của sổ thuế không làm sổ nội bộ mất chứng từ.
 */
function gateUrl(c: Connection): URL {
  const u = new URL(c.url);
  if (env.BOOK_MODE === 'tax') u.searchParams.set('consumer', 'tax');
  return u;
}

/** Phiếu bán / hoàn có số hoá đơn (không phải phiếu nội bộ, hoá đơn chưa huỷ) — loại chứng từ duy nhất của sổ thuế. */
function isInvoicedTrade(raw: unknown): boolean {
  const d = raw as { docType?: string; internalOnly?: boolean; invoice?: { no?: string; status?: string } };
  return (d.docType === 'sale' || d.docType === 'sale_return') && !d.internalOnly && Boolean(d.invoice?.no) && d.invoice?.status !== 'cancelled';
}

/** Báo nhận cho hệ thống nguồn (đầu chuẩn): phiếu nào đã vào cổng chờ, phiếu nào bị từ chối kèm lý do. */
async function acknowledge(c: Connection, received: unknown[], rejected: unknown[], cancelled: unknown[] = []): Promise<void> {
  const res = await fetch(gateUrl(c), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}) },
    body: JSON.stringify({ received, rejected, cancelled }),
    signal: AbortSignal.timeout(30_000),
  });
  // Máy chủ chặn POST (tường lửa, plugin bảo mật): báo nhận bằng GET ?ack=<json>, từng nhóm nhỏ cho vừa độ dài đường dẫn.
  if (res.status === 403) {
    const items = [...received.map((x) => ({ r: x })), ...rejected.map((x) => ({ j: x })), ...cancelled.map((x) => ({ c: x }))];
    for (let i = 0; i < items.length; i += 20) {
      const part = items.slice(i, i + 20);
      const u = gateUrl(c);
      u.searchParams.set('ack', JSON.stringify({ received: part.flatMap((x) => ('r' in x ? [x.r] : [])), rejected: part.flatMap((x) => ('j' in x ? [x.j] : [])), cancelled: part.flatMap((x) => ('c' in x ? [x.c] : [])) }));
      const g = await fetch(u, { headers: { accept: 'application/json', ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}) }, signal: AbortSignal.timeout(30_000) });
      if (!g.ok) throw new Error(`báo nhận lỗi ${g.status} (POST bị chặn 403, GET cũng lỗi)`);
    }
    return;
  }
  if (!res.ok && res.status !== 404 && res.status !== 405) {
    const text = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    throw new Error(`báo nhận lỗi ${res.status}${text ? `: ${text}` : ''}`);
  }
}

/** Một trang chứng từ của kết nối, đã đổi về khuôn IngestDocument (chưa kiểm). */
/**
 * Bảng đổi hình thức thanh toán của kết nối (mã nguồn → mã đã khai ở Hình thức thanh toán): áp cho mã hình thức của
 * chứng từ thanh toán và từng khoản thanh toán kèm phiếu. Mã không có trong bảng giữ nguyên.
 */
function mapMethods(doc: Record<string, unknown>, map: Record<string, string>): Record<string, unknown> {
  if (!Object.keys(map).length) return doc;
  const to = (v: unknown) => (typeof v === 'string' && map[v] ? map[v] : v);
  const out: Record<string, unknown> = { ...doc, methodCode: to(doc.methodCode) };
  if (doc.methodCode === undefined) delete out.methodCode;
  if (Array.isArray(doc.payments)) out.payments = doc.payments.map((p) => (p && typeof p === 'object' ? { ...p, methodCode: to((p as { methodCode?: unknown }).methodCode) } : p));
  return out;
}

async function fetchPage(c: Connection, from: string, to: string, cursor: string | null, page: number, shops?: string[]): Promise<{ docs: unknown[]; cancelled: { docKey: string; reason: string }[]; next: string | null }> {
  if (c.kind === 'woocommerce') {
    const r = await fetchWooPage(c, from, to, page);
    return { docs: r.orders.map((o) => wooOrderToDocument(o, c)).filter(Boolean), cancelled: [], next: r.more ? String(page + 1) : null };
  }
  const u = gateUrl(c);
  u.searchParams.set('from', from);
  u.searchParams.set('to', to);
  if (cursor) u.searchParams.set('cursor', cursor);
  if (shops?.length) u.searchParams.set('shops', shops.join(','));
  const res = await fetch(u, { headers: { accept: 'application/json', ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}) }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`hệ thống nguồn trả lỗi ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { documents?: unknown; cancelled?: unknown; nextCursor?: unknown; data?: { documents?: unknown; cancelled?: unknown; nextCursor?: unknown } };
  const b = body.data && typeof body.data === 'object' && 'documents' in body.data ? body.data : body;
  if (!Array.isArray(b.documents)) throw new Error('phản hồi không có mảng "documents" (xem docs/cong-ket-noi.md)');
  const cancelled = (Array.isArray(b.cancelled) ? b.cancelled : [])
    .map((x) => ({ docKey: String((x as { docKey?: unknown })?.docKey ?? ''), reason: String((x as { reason?: unknown })?.reason ?? '') }))
    .filter((x) => x.docKey);
  return { docs: b.documents, cancelled, next: typeof b.nextCursor === 'string' && b.nextCursor ? b.nextCursor : null };
}
