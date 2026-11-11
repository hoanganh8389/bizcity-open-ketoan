// @bizcity-layer A adapters/tax-lookup
/**
 * TRA CỨU DOANH NGHIỆP THEO MÃ SỐ THUẾ — điền sẵn form nhà cung cấp / khách hàng (tên trên hoá đơn, địa chỉ đăng ký, tên viết
 * tắt, người đại diện), kèm trạng thái thuế để cảnh báo NCC đã ngừng hoạt động.
 *
 * Nguồn (thử lần lượt, nguồn đầu trả "không tìm thấy" thì vẫn thử nguồn sau):
 *   1. doanhnghiep.vn  GET /api/v1/companies/{mst}, khoá x-api-key (DOANHNGHIEP_API_KEY) — thêm người đại diện, ngành, ngày lập.
 *   2. VietQR          GET https://api.vietqr.io/v2/business/{mst} — công khai, dữ liệu Cục Thuế: tên, tên quốc tế, tên viết tắt,
 *                      địa chỉ, trạng thái.
 * Chỉ gửi đi MÃ SỐ THUẾ (thông tin công khai). Kết quả nhớ 24 giờ trong bộ nhớ (đỡ tốn lượt gói miễn phí khi bấm lại).
 * VietQR giới hạn ~2 lượt / giây / IP (x-ratelimit-limit: 2): các lượt gọi xếp hàng, cách nhau VIETQR_GAP_MS; hai yêu cầu cùng MST cùng lúc
 * dùng chung một lượt; 429 thì chờ theo Retry-After rồi thử lại (tối đa VIETQR_TRIES lần); vẫn hết lượt → RATE_LIMITED (429, thử lại được).
 * Kèm đối tượng đã dùng MST này trong đơn vị (để form báo trùng ngay).
 */
import { db } from '../../db/client.js';
import { env } from '../../config/env.js';
import { Errors } from '../../core/errors.js';
import { toPartnerDto } from './partner.repository.js';

export interface TaxLookupResult {
  taxCode: string;
  name: string;
  internationalName: string;
  shortName: string;
  address: string;
  representative: string;
  /** Trạng thái theo nguồn (vd "NNT đang hoạt động"); active = false khi nguồn báo ngừng / bỏ địa chỉ / giải thể. */
  status: string;
  active: boolean | null;
  industry: string;
  registeredAt: string;
  source: 'doanhnghiep.vn' | 'vietqr';
}

const TIMEOUT_MS = 8000;
const UA = 'tgs-ketoan/1.0 (tax-code lookup)'; // header HTTP chỉ nhận ASCII
const cache = new Map<string, { at: number; value: TaxLookupResult | null }>();
const DAY = 86_400_000;

/** MST hợp lệ: 10 số, 10 số + "-" + 3 số (chi nhánh), 12 số (hộ kinh doanh / CCCD), 13 số liền. Bỏ khoảng trắng, dấu chấm. */
export function normalizeTaxCode(raw: string): string | null {
  const s = raw.replace(/[\s.]/g, '');
  if (/^\d{10}$/.test(s) || /^\d{12}$/.test(s)) return s;
  if (/^\d{10}-\d{3}$/.test(s)) return s;
  if (/^\d{13}$/.test(s)) return `${s.slice(0, 10)}-${s.slice(10)}`;
  return null;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
/** Trạng thái chữ → còn hoạt động không (null = không rõ). */
const activeOf = (status: string): boolean | null => {
  const s = status.toLowerCase();
  if (!s) return null;
  if (/ngừng|ngưng|giải thể|bỏ địa chỉ|không hoạt động|đóng mã|closed|inactive|dissolved|suspend/.test(s)) return false;
  if (/đang hoạt động|active/.test(s)) return true;
  return null;
};

async function fetchJson(url: string, headers: Record<string, string>) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA, ...headers }, signal: ctl.signal });
    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    return { status: res.status, body, retryAfter: Number(res.headers.get('retry-after')) || 0 };
  } finally { clearTimeout(t); }
}

/** doanhnghiep.vn: 404 = không có; lỗi khác (401 sai khoá, 429 hết lượt, mạng) = ném để chuyển nguồn dự phòng. */
async function fromDoanhNghiep(mst: string): Promise<TaxLookupResult | null> {
  const r = await fetchJson(`https://doanhnghiep.vn/api/v1/companies/${encodeURIComponent(mst)}`, { 'x-api-key': env.DOANHNGHIEP_API_KEY });
  if (r.status === 404) return null;
  if (r.status !== 200 || !r.body) throw new Error(`doanhnghiep.vn trả ${r.status}${r.body?.error ? ` (${String(r.body.error)})` : ''}`);
  const b = r.body;
  const status = str(b.status) === 'active' ? 'Đang hoạt động' : str(b.status);
  const industry = b.industry && typeof b.industry === 'object' ? str((b.industry as Record<string, unknown>).name_vi) : '';
  return {
    taxCode: str(b.mst) || mst, name: str(b.name_vi), internationalName: str(b.name_en), shortName: '', address: str(b.address_full),
    representative: str(b.legal_rep_name), status, active: str(b.status) ? str(b.status) === 'active' || activeOf(status) === true : null,
    industry, registeredAt: str(b.registered_at), source: 'doanhnghiep.vn',
  };
}

// [2026-11-11 11:26 AM kiennt] HT03 — VietQR giới hạn ~2 lượt / giây / IP: xếp hàng có giãn nhịp, theo Retry-After, hết lượt báo RATE_LIMITED
const VIETQR_GAP_MS = 600;
const VIETQR_TRIES = 4;
/** Hết lượt VietQR sau khi đã chờ và thử lại — báo RATE_LIMITED (thử lại được), không phải lỗi dữ liệu. */
class RateLimitedError extends Error {}
let vietQrQueue: Promise<unknown> = Promise.resolve();
let vietQrLast = 0;
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** Gọi VietQR lần lượt (một lượt một lúc, cách nhau ít nhất VIETQR_GAP_MS) — nhiều người cùng tra không làm vượt giới hạn. */
function vietQrCall(url: string) {
  const run = vietQrQueue.then(async () => {
    const wait = vietQrLast + VIETQR_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try { return await fetchJson(url, {}); } finally { vietQrLast = Date.now(); }
  });
  vietQrQueue = run.catch(() => undefined);
  return run;
}
/** Cho test: quên nhịp gọi, đệm kết quả và lượt đang chạy. */
export function resetTaxLookup(): void { vietQrLast = 0; vietQrQueue = Promise.resolve(); cache.clear(); inflight.clear(); }

/** VietQR: code "00" = có; khác "00" (không tìm thấy / sai định dạng) = không có. */
async function fromVietQr(mst: string): Promise<TaxLookupResult | null> {
  const url = `https://api.vietqr.io/v2/business/${encodeURIComponent(mst)}`;
  let r = await vietQrCall(url);
  // Hết lượt (429): chờ theo Retry-After (tối thiểu 1 giây, tăng dần) rồi thử lại.
  for (let i = 1; r.status === 429 && i < VIETQR_TRIES; i++) { await sleep(Math.max(r.retryAfter * 1000, 1000 * i)); r = await vietQrCall(url); }
  if (r.status === 429) throw new RateLimitedError('VietQR đang giới hạn lượt tra (429)');
  if (r.status !== 200 || !r.body) throw new Error(`VietQR trả ${r.status}`);
  if (r.body.code !== '00' || !r.body.data || typeof r.body.data !== 'object') return null;
  const d = r.body.data as Record<string, unknown>;
  const status = str(d.status);
  return {
    taxCode: str(d.id) || mst, name: str(d.name), internationalName: str(d.internationalName), shortName: str(d.shortName), address: str(d.address),
    representative: '', status, active: activeOf(status), industry: '', registeredAt: '', source: 'vietqr',
  };
}

/** Lượt tra đang chạy theo MST: hai yêu cầu cùng MST cùng lúc (rời ô tự tra + bấm nút, hai người) dùng chung một lượt gọi ra ngoài. */
const inflight = new Map<string, Promise<TaxLookupResult | null>>();

export async function lookupTaxCode(tenantId: string, raw: string) {
  if (env.TAX_LOOKUP === 'off') throw Errors.validation('Tra cứu mã số thuế đang tắt (TAX_LOOKUP=off) — nhập tay thông tin');
  const mst = normalizeTaxCode(raw);
  if (!mst) throw Errors.validation(`Mã số thuế "${raw}" không đúng dạng: 10 số, 10 số-3 số (đơn vị phụ thuộc) hoặc 12 số (hộ kinh doanh)`);
  const existing = (await db.selectFrom('partners').selectAll().where('tenant_id', '=', tenantId).where('tax_code', 'in', [mst, mst.replace('-', '')]).orderBy('code').limit(5).execute()).map(toPartnerDto);
  const hit = cache.get(mst);
  if (hit && Date.now() - hit.at < DAY) return { found: Boolean(hit.value), company: hit.value, existing, cached: true };
  let p = inflight.get(mst);
  if (!p) {
    p = fetchCompany(mst).finally(() => inflight.delete(mst));
    inflight.set(mst, p);
  }
  const company = await p;
  return { found: Boolean(company), company, existing, cached: false };
}

/** Thử lần lượt các nguồn; nhớ kết quả (kể cả "không có") 24 giờ. Không nguồn nào trả lời: hết lượt → RATE_LIMITED, lỗi khác → VALIDATION như cũ. */
async function fetchCompany(mst: string): Promise<TaxLookupResult | null> {
  const sources = [...(env.DOANHNGHIEP_API_KEY ? [fromDoanhNghiep] : []), fromVietQr];
  const errors: string[] = [];
  let limited = false;
  let company: TaxLookupResult | null = null;
  let answered = false;
  for (const src of sources) {
    try {
      company = await src(mst);
      answered = true;
      if (company?.name) break;
    } catch (e) {
      if (e instanceof RateLimitedError) limited = true;
      errors.push((e as Error).name === 'AbortError' ? 'quá thời gian chờ' : (e as Error).message);
    }
  }
  if (!answered && limited) throw Errors.rateLimited(`Nguồn tra mã số thuế đang giới hạn lượt tra (${errors.join('; ')}) — chờ vài giây rồi bấm Lấy thông tin lại, hoặc nhập tay`);
  if (!answered) throw Errors.validation(`Không tra cứu được mã số thuế lúc này (${errors.join('; ')}) — nhập tay hoặc thử lại sau`);
  if (company && !company.name) company = null;
  cache.set(mst, { at: Date.now(), value: company });
  return company;
}
