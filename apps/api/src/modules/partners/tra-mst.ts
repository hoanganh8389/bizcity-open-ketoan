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
    return { status: res.status, body };
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

/** VietQR: code "00" = có; khác "00" (không tìm thấy / sai định dạng) = không có. */
async function fromVietQr(mst: string): Promise<TaxLookupResult | null> {
  const url = `https://api.vietqr.io/v2/business/${encodeURIComponent(mst)}`;
  let r = await fetchJson(url, {});
  // Nguồn công khai giới hạn tốc độ (429) khi bấm dồn: chờ chút rồi thử lại một lần.
  if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 1500)); r = await fetchJson(url, {}); }
  if (r.status === 429) throw new Error('VietQR đang giới hạn lượt tra (429), thử lại sau ít giây');
  if (r.status !== 200 || !r.body) throw new Error(`VietQR trả ${r.status}`);
  if (r.body.code !== '00' || !r.body.data || typeof r.body.data !== 'object') return null;
  const d = r.body.data as Record<string, unknown>;
  const status = str(d.status);
  return {
    taxCode: str(d.id) || mst, name: str(d.name), internationalName: str(d.internationalName), shortName: str(d.shortName), address: str(d.address),
    representative: '', status, active: activeOf(status), industry: '', registeredAt: '', source: 'vietqr',
  };
}

export async function lookupTaxCode(tenantId: string, raw: string) {
  if (env.TAX_LOOKUP === 'off') throw Errors.validation('Tra cứu mã số thuế đang tắt (TAX_LOOKUP=off) — nhập tay thông tin');
  const mst = normalizeTaxCode(raw);
  if (!mst) throw Errors.validation(`Mã số thuế "${raw}" không đúng dạng: 10 số, 10 số-3 số (đơn vị phụ thuộc) hoặc 12 số (hộ kinh doanh)`);
  const existing = (await db.selectFrom('partners').selectAll().where('tenant_id', '=', tenantId).where('tax_code', 'in', [mst, mst.replace('-', '')]).orderBy('code').limit(5).execute()).map(toPartnerDto);
  const hit = cache.get(mst);
  if (hit && Date.now() - hit.at < DAY) return { found: Boolean(hit.value), company: hit.value, existing, cached: true };
  const sources = [...(env.DOANHNGHIEP_API_KEY ? [fromDoanhNghiep] : []), fromVietQr];
  const errors: string[] = [];
  let company: TaxLookupResult | null = null;
  let answered = false;
  for (const src of sources) {
    try {
      company = await src(mst);
      answered = true;
      if (company?.name) break;
    } catch (e) { errors.push((e as Error).name === 'AbortError' ? 'quá thời gian chờ' : (e as Error).message); }
  }
  if (!answered) throw Errors.validation(`Không tra cứu được mã số thuế lúc này (${errors.join('; ')}) — nhập tay hoặc thử lại sau`);
  if (company && !company.name) company = null;
  cache.set(mst, { at: Date.now(), value: company });
  return { found: Boolean(company), company, existing, cached: false };
}
