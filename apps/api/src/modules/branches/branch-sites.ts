// @bizcity-layer M data/masterdata
/**
 * Cầu nối chi nhánh ↔ website của hệ thống bán hàng (danh mục Chi nhánh DM02).
 * Gọi đầu "sites" của KẾT NỐI CHÍNH (kết nối đầu chuẩn đánh dấu Chính; chỉ có một kết nối đầu chuẩn thì dùng luôn):
 * cùng địa chỉ cổng chờ, đổi đuôi /pending → /sites, cùng khoá. Bên kia trả mỗi website (blog_id, tên, địa chỉ, mã kho
 * đại diện) và chi nhánh website đang nối. Giữ kết quả 60 giây để màn danh mục mở nhanh.
 */
import { connectionSchema, type Connection } from '@ketoan/contracts';
import { db } from '../../db/client.js';

export interface SourceSite { blogId: number; name: string; url: string; siteCode: string; branchCode: string | null; isMain: boolean; active: boolean }
export interface BranchSites { connection: { code: string; name: string } | null; sites: SourceSite[]; error?: string; fetchedAt?: string }

const cache = new Map<string, { at: number; value: BranchSites }>();
const TTL = 60_000;

/** Kết nối chính tới hệ thống bán hàng (null = chưa có kết nối đầu chuẩn nào đang bật). */
export async function primaryConnection(tenantId: string): Promise<Connection | null> {
  const t = await db.selectFrom('tenants').select('settings').where('id', '=', tenantId).executeTakeFirstOrThrow();
  const list = (((t.settings as { connections?: unknown[] }) ?? {}).connections ?? []).flatMap((raw) => {
    const p = connectionSchema.safeParse(raw);
    return p.success && p.data.kind === 'standard' && p.data.enabled ? [p.data] : [];
  });
  return list.find((c) => c.primary) ?? (list.length === 1 ? list[0]! : null);
}

/** Đường dẫn đầu "sites" suy từ đường dẫn cổng chờ (…/tgs-acc/v1/pending hoặc ?rest_route=/tgs-acc/v1/pending). */
function sitesUrl(c: Connection): URL {
  const u = new URL(c.url);
  const rr = u.searchParams.get('rest_route');
  if (rr) u.searchParams.set('rest_route', rr.replace(/\/pending\/?$/, '/sites'));
  else u.pathname = u.pathname.replace(/\/pending\/?$/, '/sites');
  u.searchParams.delete('consumer');
  return u;
}

export async function branchSites(tenantId: string, refresh = false): Promise<BranchSites> {
  const hit = cache.get(tenantId);
  if (!refresh && hit && Date.now() - hit.at < TTL) return hit.value;
  const c = await primaryConnection(tenantId);
  let value: BranchSites;
  if (!c) {
    value = { connection: null, sites: [], error: 'Chưa có kết nối chính tới hệ thống bán hàng (Định khoản tự động → Kết nối: đánh dấu cột Chính)' };
  } else {
    try {
      const res = await fetch(sitesUrl(c), { headers: { accept: 'application/json', ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}) }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(res.status === 404 ? 'Hệ thống bán hàng chưa có đầu danh sách website (cập nhật cổng kế toán)' : `Hệ thống bán hàng trả lỗi ${res.status}`);
      const body = (await res.json()) as { sites?: SourceSite[] };
      value = { connection: { code: c.code, name: c.name }, sites: Array.isArray(body.sites) ? body.sites : [], fetchedAt: new Date().toISOString() };
    } catch (e) {
      value = { connection: { code: c.code, name: c.name }, sites: [], error: `Không lấy được danh sách website: ${(e as Error).message}` };
    }
  }
  cache.set(tenantId, { at: Date.now(), value });
  return value;
}
