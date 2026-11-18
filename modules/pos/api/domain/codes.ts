/**
 * Số bill theo dạng của shop (phiếu NT-BH-027, chốt 18/11/2026) — hàm thuần, không đọc CSDL. Làm giống hệt luật mã chế độ "bt" của
 * POS website (tgs_pos includes/class-tgs-pos-sale-code.php, tgs_pos/docs/ma-phieu-hai-che-do.md):
 *
 *   phiếu bán   {mã shop}BT{5 số}   bắt đầu 10000; một bộ đếm mỗi shop, không đặt lại theo ngày / tháng;
 *               bộ đếm là MỘT số nguyên, chỉ cách viết chia dải 99 999 số: dải = (số − 1) div 99 999, số in = (số − 1) mod 99 999 + 1,
 *               dải 0 = BT, dải 1 = BU… tới ZZ (BT99999 → BU00001); hết ZZ thì dồn vào ZZ, số tự dài ra.
 *   bill Z      mã phiếu cha + "Z" (không tiêu số của bộ đếm) — toOrderSnapshot đã làm.
 *   phiếu hoàn  {mã shop}.B{5 số}   từ 00001, không chia dải (vượt 99 999 thì số tự dài ra).
 *
 * Mã shop = mã chi nhánh bên kế toán (= tgs_site_code của website). MẶC ĐỊNH mọi cửa hàng dùng dạng shop (chốt 18/11/2026, bỏ khoá
 * bật / tắt); chỉ mã chi nhánh không dựng được mã 12 ký tự (không phải 1–5 chữ hoa / số, vd "CN-NA") giữ dạng HD / TH theo tháng như
 * cũ (formatCode / parseCode). Số bắt đầu: website tự báo số cuối của bộ đếm "bt" (trang vỏ React → máy bán gửi kèm bootstrap / xin dải)
 * — module chỉ NÂNG bộ đếm lên ≥ số đó, không bao giờ hạ (codes.ts raiseShopCounters). Shop chưa có số: bán từ 10000, hoàn từ 00001.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027: số bill theo dạng shop (mã shop + BT + 5 số, liên tục), phiếu hoàn {shop}.B{5 số} (đóng góp)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 (18/11 anh chốt): mặc định dạng shop, bỏ bật / tắt, website tự báo số cuối (đóng góp)

export const SHOP_SALE_MARKER = 'BT';
export const SHOP_RETURN_MARKER = 'B';
/** Mỗi dải chữ 99 999 số (00001…99999). */
export const SHOP_SERIES_SIZE = 99_999;
/** Số phiếu bán đầu tiên của chế độ "bt" (bộ đếm khởi đầu ở 9 999). */
export const SHOP_SALE_FIRST = 10_000;
const PAD = 5;

/** Cặp chữ → 0…675 (AA = 0, ZZ = 675); không phải hai chữ cái → −1. */
const lettersIndex = (s: string) => (/^[A-Z]{2}$/.test(s) ? (s.charCodeAt(0) - 65) * 26 + (s.charCodeAt(1) - 65) : -1);
const indexLetters = (i: number) => String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
const FIRST = lettersIndex(SHOP_SALE_MARKER);
const LAST = 675;

/** Mã shop dùng được: 1–5 ký tự chữ hoa / số (như tgs_site_code). */
export const isShopCode = (s: string) => /^[A-Z0-9]{1,5}$/.test(s);

/** Bộ đếm → mã phiếu bán: (08022, 12346) → 08022BT12346; (08022, 100000) → 08022BU00001. */
export function shopSaleCode(shop: string, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError(`Số phiếu ngoài khoảng: ${seq}`);
  let series = Math.floor((seq - 1) / SHOP_SERIES_SIZE);
  let no = ((seq - 1) % SHOP_SERIES_SIZE) + 1;
  if (FIRST + series > LAST) {
    series = LAST - FIRST;
    no = seq - series * SHOP_SERIES_SIZE;
  }
  return `${shop}${indexLetters(FIRST + series)}${String(no).padStart(PAD, '0')}`;
}

/** Mã phiếu bán → bộ đếm nếu đúng dãy của shop (đúng mã shop, cặp chữ BT…ZZ, không phải bill Z); khác → null. */
export function shopSaleSeq(shop: string, code: string): number | null {
  const m = new RegExp(`^${shop}([A-Z]{2})(\\d+)$`).exec(code.trim().toUpperCase());
  if (!m) return null;
  const idx = lettersIndex(m[1]!);
  const no = Number(m[2]);
  if (idx < FIRST || idx > LAST || !(no > 0)) return null;
  // Dải đầu cho phép số dài ra (mã kiểu cũ); dải sau thì không, trừ dải cuối (dồn).
  if (idx > FIRST && idx < LAST && no > SHOP_SERIES_SIZE) return null;
  return (idx - FIRST) * SHOP_SERIES_SIZE + no;
}

/** Bộ đếm → mã phiếu hoàn: (08022, 268) → 08022.B00268. */
export function shopReturnCode(shop: string, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError(`Số phiếu ngoài khoảng: ${seq}`);
  return `${shop}.${SHOP_RETURN_MARKER}${String(seq).padStart(PAD, '0')}`;
}

/** Mã phiếu hoàn → bộ đếm nếu đúng dãy của shop; khác → null. */
export function shopReturnSeq(shop: string, code: string): number | null {
  const m = new RegExp(`^${shop}\\.${SHOP_RETURN_MARKER}(\\d+)$`).exec(code.trim().toUpperCase());
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

/** Số cuối website báo lên (bộ đếm "bt" của shop): số nguyên dương, tối đa 99 999 999 (≈ 1 000 dải chữ — dư cho mọi shop). */
export const SHOP_LAST_MAX = 99_999_999;
/** Số cuối do website báo cho từng loại phiếu; thiếu = không báo (chỉ dùng sàn mặc định). */
export type WebsiteLast = { sale?: number | undefined; ret?: number | undefined };

/** Sàn mặc định của bộ đếm dạng shop: bán 9 999 (số đầu 10000), hoàn 0 (số đầu 00001). */
export const shopFloor = (kind: 'sale' | 'return') => (kind === 'sale' ? SHOP_SALE_FIRST - 1 : 0);

/** Số cuối website báo có dùng được không: số nguyên 1…SHOP_LAST_MAX. */
export const isWebsiteLast = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= SHOP_LAST_MAX;

/** Dạng mã của một cửa hàng: legacy = HD / TH theo tháng (mã chi nhánh không dựng được mã 12 ký tự); shop = mã shop + BT / .B, liên tục. */
export type CodeScheme = { mode: 'legacy' } | { mode: 'shop'; shop: string };

/** Mặc định dạng shop; mã chi nhánh không phải 1–5 chữ hoa / số (vd CN-NA, CHINHANH01) → HD / TH. */
export function schemeOf(branchCode: string): CodeScheme {
  return isShopCode(branchCode) ? { mode: 'shop', shop: branchCode } : { mode: 'legacy' };
}

/** Bộ đếm của dạng shop nằm ở code_counters với kỳ cố định này (không theo tháng). */
export const SHOP_PERIOD = 'SHOP';

// ── Báo cáo "Số bill bị thiếu" ─────────────────────────────────────────────────────────────────────────────────────

export type Reservation = { codes: readonly string[]; deviceId: string | null; reservedByName: string | null; reservedBy: string | null; reservedAt: string; expiresAt: string };
export type MissingCode = { code: string; reasonCode: 'reserved_unused' | 'range_expired'; reason: string; deviceId: string | null; reservedAt: string; expiresAt: string };

/**
 * Số đã cấp cho máy (dải xin trước) mà không có đơn / phiếu nào dùng: lý do "máy … xin chưa dùng"; dải đã quá hạn thì ghi thêm hết hạn.
 * `used`: mã đã dùng (đơn bán gồm đã huỷ — huỷ giữ số, không hở). Thứ tự theo lúc xin rồi theo thứ tự trong dải.
 */
export function missingCodes(rs: readonly Reservation[], used: ReadonlySet<string>, now: Date): MissingCode[] {
  const out: MissingCode[] = [];
  const seen = new Set<string>();
  for (const r of [...rs].sort((a, b) => a.reservedAt.localeCompare(b.reservedAt))) {
    const who = r.deviceId ? `máy ${r.deviceId}` : `máy của ${r.reservedByName || r.reservedBy || 'không rõ'}`;
    const time = vnTime(r.reservedAt);
    const expired = Date.parse(r.expiresAt) < now.getTime();
    for (const code of r.codes) {
      if (used.has(code) || seen.has(code)) continue;
      seen.add(code);
      out.push({
        code, deviceId: r.deviceId, reservedAt: r.reservedAt, expiresAt: r.expiresAt,
        reasonCode: expired ? 'range_expired' : 'reserved_unused',
        reason: `${who} xin lúc ${time} chưa dùng${expired ? ` — dải hết hạn ${vnTime(r.expiresAt)}` : ''}`,
      });
    }
  }
  return out;
}

/** Gộp số thiếu liên tiếp cùng lý do thành dải (12353–12359) để báo cáo đọc gọn. */
export function missingRanges(items: readonly MissingCode[]): { from: string; to: string; count: number; reason: string }[] {
  const out: { from: string; to: string; count: number; reason: string; last: number | null }[] = [];
  const tail = (c: string) => { const m = /(\d+)$/.exec(c); return m ? Number(m[1]) : null; };
  for (const it of items) {
    const n = tail(it.code);
    const prev = out[out.length - 1];
    if (prev && prev.reason === it.reason && n !== null && prev.last !== null && n === prev.last + 1) {
      prev.to = it.code; prev.count += 1; prev.last = n;
    } else out.push({ from: it.code, to: it.code, count: 1, reason: it.reason, last: n });
  }
  return out.map(({ last: _l, ...r }) => r);
}

/** Giờ Việt Nam "dd/MM HH:mm". */
function vnTime(iso: string): string {
  const d = new Date(Date.parse(iso) + 7 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`;
}
