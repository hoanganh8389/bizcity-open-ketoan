// @bizcity-layer M data/masterdata
/**
 * Gợi ý mã đối tượng mới — theo cách HTsoft (frmKhachhang2.GetNewCode, tuỳ chọn GetKHCodeByNhomKH): chọn nhóm thì mã tự
 * nhảy theo dãy mã của nhóm đó.
 *
 * HTsoft gọi sp_GetMaxCode<phiên bản> với nhóm (@KHNID): mã lớn nhất của nhóm + 1. Nhóm của dữ liệu cũ lẫn vài dãy (nhóm
 * "NCC hàng hoá" có 507 mã NC1xxxxx và 20 mã NC2xxxxx), lấy mã lớn nhất cả nhóm sẽ nhảy sang dãy khác. Ở đây chia mã theo
 * DÃY = phần chữ đứng trước + số chữ số + chữ số đầu (NC1xxxxx, NC2xxxxx, 202AA0xxxxx…), chọn dãy ĐÔNG NHẤT của nhóm, lấy mã
 * lớn nhất dãy đó + 1, giữ nguyên độ dài (đệm số 0). Mã gợi ý đã có ở đơn vị thì tăng tiếp.
 *
 * Mã chỉ toàn chữ số (khách lẻ từ máy bán hàng lấy số điện thoại làm mã) không phải dãy mã: bỏ qua, không thì mã gợi ý thành
 * một số điện thoại. Mã HTsoft luôn có chữ (NC100642, 202AA000295, TGS00001).
 *
 * Nhóm chưa có mã nào có đuôi số (hoặc không chọn nhóm): làm như trên với mọi đối tượng cùng loại; vẫn không có thì dùng tiền tố
 * mặc định theo loại + 000001.
 */
import type { Db } from '../../db/client.js';

/** Tiền tố mặc định khi chưa có dãy mã nào để nối tiếp. */
export const DEFAULT_PREFIX: Record<string, string> = { customer: 'KH', supplier: 'NCC', employee: 'NV', internal: 'NB', other: 'DT' };

interface Series { key: string; prefix: string; width: number; lead: string; count: number; max: bigint; maxCode: string }

/** Dãy của một mã: phần trước đuôi số, độ dài đuôi số, chữ số đầu. Mã không có đuôi số trả null. */
function seriesOf(code: string): { key: string; prefix: string; digits: string } | null {
  const m = /^(.*?)(\d+)$/.exec(code);
  if (!m || !/\D/.test(m[1] ?? '')) return null;
  const [, prefix, digits] = m as unknown as [string, string, string];
  return { key: `${prefix}|${digits.length}|${digits[0]}`, prefix, digits };
}

/** Mã kế tiếp của dãy đông nhất trong danh sách; không có mã nào có đuôi số thì null. */
export function nextCodeFrom(codes: string[]): { code: string; series: string; count: number } | null {
  const map = new Map<string, Series>();
  for (const c of codes) {
    const s = seriesOf(c.trim());
    if (!s) continue;
    const n = BigInt(s.digits);
    const cur = map.get(s.key) ?? { key: s.key, prefix: s.prefix, width: s.digits.length, lead: s.digits[0]!, count: 0, max: -1n, maxCode: '' };
    cur.count += 1;
    if (n > cur.max) { cur.max = n; cur.maxCode = c; }
    map.set(s.key, cur);
  }
  const best = [...map.values()].sort((a, b) => b.count - a.count || (a.maxCode < b.maxCode ? 1 : -1))[0];
  if (!best) return null;
  return { code: best.prefix + String(best.max + 1n).padStart(best.width, '0'), series: `${best.prefix}${best.lead}${'x'.repeat(best.width - 1)}`, count: best.count };
}

/** Tăng đuôi số của mã thêm 1 (giữ độ dài). */
function bump(code: string): string {
  const s = seriesOf(code)!;
  return s.prefix + String(BigInt(s.digits) + 1n).padStart(s.digits.length, '0');
}

export type NextCodeBasis = 'group' | 'kind' | 'default';

/** Gợi ý mã mới cho đối tượng thuộc nhóm / loại; bảo đảm mã chưa có ở đơn vị. */
export async function suggestPartnerCode(db: Db, tenantId: string, q: { groupCode?: string | null; kind?: string }) {
  const kind = q.kind || 'customer';
  let basis: NextCodeBasis = 'default';
  let found: ReturnType<typeof nextCodeFrom> = null;
  if (q.groupCode) {
    const rows = await db.selectFrom('partners').select('code').where('tenant_id', '=', tenantId).where('group_code', '=', q.groupCode).execute();
    found = nextCodeFrom(rows.map((r) => r.code));
    if (found) basis = 'group';
  }
  if (!found) {
    const rows = await db.selectFrom('partners').select('code').where('tenant_id', '=', tenantId).where('kind', '=', kind).execute();
    found = nextCodeFrom(rows.map((r) => r.code));
    if (found) basis = 'kind';
  }
  let code = found?.code ?? `${DEFAULT_PREFIX[kind] ?? 'DT'}000001`;
  // Mã gợi ý đã có (dãy khác trùng số, mã nhập tay…): tăng tiếp, tối đa 1000 lần.
  for (let i = 0; i < 1000; i++) {
    const hit = await db.selectFrom('partners').select('code').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
    if (!hit) break;
    code = bump(code);
  }
  return { code, basis, series: found?.series ?? null, count: found?.count ?? 0 };
}
