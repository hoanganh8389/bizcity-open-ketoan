/**
 * Màn Khuyến mại (BH18, phiếu NT-BH-016, chữ chốt docs/nghiep-vu/22) — phần thuần: form người kinh doanh điền ↔ `params` của khuôn luật
 * `sale.promo.*` (Core kiểm lại khi phát hành, không tin số của màn), trạng thái ở danh sách, nội dung bản "ngừng".
 * Không gọi API, không React — test ở modules/pos/test/khuyen-mai.test.ts.
 */
// [2026-11-14 01:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-016: mô hình form khuyến mại 6 loại (đóng góp)

export type PromoKind = 'tiered' | 'order_discount' | 'order_gift' | 'combo' | 'cheapest_free' | 'buy_x_get_y';

export const KIND_INFO: Record<PromoKind, { contract: string; label: string; hint: string }> = {
  tiered: { contract: 'sale.promo.tiered@1', label: 'Giảm theo bậc (mua nhiều giảm nhiều)', hint: 'Nhóm mặt hàng: từ N cái (hoặc từ N đồng) giảm % / giá chương trình' },
  order_discount: { contract: 'sale.promo.order_discount@1', label: 'Giảm theo tổng đơn / mã giảm giá', hint: 'Đơn từ … giảm % hoặc tiền, có trần; dùng kèm mã giảm giá' },
  order_gift: { contract: 'sale.promo.order_gift@1', label: 'Quà theo tổng đơn', hint: 'Đơn từ … tặng quà' },
  combo: { contract: 'sale.promo.combo@1', label: 'Combo', hint: 'Mua đủ bộ món: giá bộ / giảm % / giảm tiền' },
  cheapest_free: { contract: 'sale.promo.cheapest_free@1', label: 'Mua bất kỳ tặng món rẻ nhất', hint: 'Trong nhóm mặt hàng: mua N món tặng M món rẻ nhất' },
  buy_x_get_y: { contract: 'sale.promo.buy_x_get_y@1', label: 'Mua X tặng Y', hint: 'Mua đủ số lượng mặt hàng X tặng mặt hàng Y' },
};
export const KIND_BY_CONTRACT: Record<string, PromoKind> = Object.fromEntries(Object.entries(KIND_INFO).map(([k, v]) => [v.contract, k as PromoKind]));

export type TierMode = 'pct' | 'unitPrice' | 'amountPerUnit';
export type Form = {
  kind: PromoKind;
  key: string; reason: string; effectiveFrom: string; branchCodes: string[];
  validFrom: string; validTo: string; priority: number; exclusive: boolean;
  /** Trần NĐ81 (% tiền dòng); trống = mặc định 50; `noCap` = miễn trần (người khai chịu trách nhiệm). */
  legalCapPct: string; noCap: boolean;
  weekdays: number[]; timeFrom: string; timeTo: string; minOrderAmount: string; couponCodes: string; birthdayMonth: boolean; memberLevels: string;
  /** Danh sách mã hàng, cách nhau dấu phẩy / xuống dòng. */
  skus: string;
  basis: 'qty' | 'amount';
  tiers: { min: string; mode: TierMode; value: string }[];
  orderTiers: { minOrder: string; mode: 'pct' | 'amount'; value: string; maxDiscount: string }[];
  /** Quà theo bậc: "QUA01:1, QUA02:2". */
  giftTiers: { minOrder: string; gifts: string }[];
  items: { sku: string; qty: string }[];
  comboMode: 'comboPrice' | 'discountPct' | 'discountAmount'; comboValue: string; maxCombos: string;
  buyQty: string; freeQty: string; repeat: boolean;
  buy: { sku: string; qty: string }; get: { sku: string; qty: string }; maxGiftQty: string;
};

export function emptyForm(kind: PromoKind, today: string): Form {
  return {
    kind, key: '', reason: '', effectiveFrom: today, branchCodes: [], validFrom: today, validTo: '', priority: 0, exclusive: false, legalCapPct: '', noCap: false,
    weekdays: [], timeFrom: '', timeTo: '', minOrderAmount: '', couponCodes: '', birthdayMonth: false, memberLevels: '',
    skus: '', basis: 'qty', tiers: [{ min: '', mode: 'pct', value: '' }], orderTiers: [{ minOrder: '', mode: 'pct', value: '', maxDiscount: '' }],
    giftTiers: [{ minOrder: '', gifts: '' }], items: [{ sku: '', qty: '1' }], comboMode: 'comboPrice', comboValue: '', maxCombos: '',
    buyQty: '2', freeQty: '1', repeat: true, buy: { sku: '', qty: '1' }, get: { sku: '', qty: '1' }, maxGiftQty: '',
  };
}

/** Số người gõ: bỏ dấu chấm / phẩy phân cách nghìn; trống → undefined. */
export const num = (s: string): number | undefined => {
  const t = String(s ?? '').trim().replace(/[.\s]/g, '').replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
export const list = (s: string) => [...new Set(String(s ?? '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];

/** "QUA01:1, QUA02:2" → [{ sku, qty }]. */
export function parseGifts(s: string): { sku: string; qty: number }[] | null {
  const out: { sku: string; qty: number }[] = [];
  for (const part of String(s ?? '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\S+?)\s*[:x×*]\s*(\d+(?:[.,]\d+)?)$/i.exec(part) ?? /^(\S+)$/.exec(part);
    if (!m) return null;
    const qty = m[2] ? num(m[2]) : 1;
    if (!qty || !(qty > 0)) return null;
    out.push({ sku: m[1]!, qty });
  }
  return out;
}

type Params = Record<string, unknown>;

/** Form → `params` của khuôn. Lỗi rõ ràng theo ô (Core còn kiểm lại khi phát hành). */
export function toParams(f: Form): { params: Params; problems: string[] } {
  const problems: string[] = [];
  const need = (v: number | undefined, label: string, opt: { int?: boolean; min?: number } = {}) => {
    if (v === undefined || Number.isNaN(v) || v < (opt.min ?? 0) || (opt.int && !Number.isInteger(v))) { problems.push(`${label}: chưa nhập hoặc sai`); return undefined; }
    return v;
  };
  const common: Params = {};
  if (f.kind !== 'buy_x_get_y') {
    common.priority = f.priority || 0;
    common.exclusive = f.exclusive;
    if (f.noCap) common.legalCapPct = null;
    else if (f.legalCapPct.trim()) common.legalCapPct = need(num(f.legalCapPct), 'Trần khuyến mại (%)');
    const c: Params = {};
    if (f.weekdays.length) c.weekdays = [...f.weekdays].sort();
    if (f.timeFrom) c.timeFrom = f.timeFrom;
    if (f.timeTo) c.timeTo = f.timeTo;
    if (f.minOrderAmount.trim()) c.minOrderAmount = need(num(f.minOrderAmount), 'Đơn tối thiểu');
    if (list(f.couponCodes).length) c.couponCodes = list(f.couponCodes);
    if (f.birthdayMonth) c.birthdayMonth = true;
    if (list(f.memberLevels).length) c.memberLevels = list(f.memberLevels);
    if (Object.keys(c).length) common.conditions = c;
  }
  if (f.validFrom) common.validFrom = f.validFrom;
  if (f.validTo) common.validTo = f.validTo;
  if (f.validFrom && f.validTo && f.validTo < f.validFrom) problems.push('Đến ngày trước từ ngày');
  if (f.timeFrom && f.timeTo && f.timeTo < f.timeFrom) problems.push('Giờ kết thúc trước giờ bắt đầu');
  const skus = list(f.skus);
  let own: Params = {};
  switch (f.kind) {
    case 'tiered': {
      if (!skus.length) problems.push('Chưa nhập nhóm mã hàng');
      const tiers = f.tiers.map((t, i) => ({ min: need(num(t.min), `Bậc ${i + 1}: từ`), [t.mode]: need(num(t.value), `Bậc ${i + 1}: mức giảm`) }));
      const mins = tiers.map((t) => t.min ?? 0);
      if (mins.some((m, i) => i > 0 && m <= mins[i - 1]!)) problems.push('Các bậc phải tăng dần');
      own = { skus, basis: f.basis, tiers };
      break;
    }
    case 'order_discount': {
      const tiers = f.orderTiers.map((t, i) => ({
        minOrder: need(num(t.minOrder), `Bậc ${i + 1}: đơn từ`), [t.mode]: need(num(t.value), `Bậc ${i + 1}: mức giảm`),
        ...(t.maxDiscount.trim() ? { maxDiscount: need(num(t.maxDiscount), `Bậc ${i + 1}: giảm tối đa`) } : {}),
      }));
      own = { ...(skus.length ? { skus } : {}), tiers };
      break;
    }
    case 'order_gift': {
      const tiers = f.giftTiers.map((t, i) => {
        const gifts = parseGifts(t.gifts);
        if (!gifts?.length) problems.push(`Bậc ${i + 1}: quà ghi dạng MÃ:số lượng, cách nhau dấu phẩy`);
        return { minOrder: need(num(t.minOrder), `Bậc ${i + 1}: đơn từ`), gifts: gifts ?? [] };
      });
      own = { ...(skus.length ? { skus } : {}), tiers };
      break;
    }
    case 'combo': {
      const items = f.items.filter((x) => x.sku.trim()).map((x, i) => ({ sku: x.sku.trim(), qty: need(num(x.qty), `Món ${i + 1}: số lượng`) }));
      if (!items.length) problems.push('Combo chưa có món');
      own = { items, [f.comboMode]: need(num(f.comboValue), f.comboMode === 'comboPrice' ? 'Giá bộ' : 'Mức giảm'), ...(f.maxCombos.trim() ? { maxCombos: need(num(f.maxCombos), 'Số bộ tối đa', { int: true, min: 1 }) } : {}) };
      break;
    }
    case 'cheapest_free': {
      if (!skus.length) problems.push('Chưa nhập nhóm mã hàng');
      own = { skus, buyQty: need(num(f.buyQty), 'Mua (số món)', { int: true, min: 2 }), freeQty: need(num(f.freeQty), 'Tặng (số món)', { int: true, min: 1 }), repeat: f.repeat };
      break;
    }
    case 'buy_x_get_y': {
      if (!f.buy.sku.trim()) problems.push('Chưa nhập mã hàng phải mua');
      if (!f.get.sku.trim()) problems.push('Chưa nhập mã hàng được tặng');
      own = {
        buy: { sku: f.buy.sku.trim(), qty: need(num(f.buy.qty), 'Số lượng mua') }, get: { sku: f.get.sku.trim(), qty: need(num(f.get.qty), 'Số lượng tặng') },
        repeat: f.repeat, ...(f.maxGiftQty.trim() ? { maxGiftQty: need(num(f.maxGiftQty), 'Trần quà / phiếu') } : {}),
      };
      break;
    }
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(f.key.trim())) problems.push('Mã khuyến mại: 2–64 ký tự chữ, số, dấu chấm, gạch (vd KM-TET-2026)');
  if (!f.effectiveFrom) problems.push('Chưa chọn ngày bắt đầu áp');
  return { params: { ...common, ...own }, problems };
}

/** `params` của bản đang có → form (để Sửa / Ngừng). Khuôn lạ → null. */
export function fromParams(contract: string, p: Params, meta: { key: string; branchCodes?: string[]; today: string }): Form | null {
  const kind = KIND_BY_CONTRACT[contract];
  if (!kind) return null;
  const f = emptyForm(kind, meta.today);
  const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  const c = (p.conditions ?? {}) as Record<string, unknown>;
  Object.assign(f, {
    key: meta.key, branchCodes: meta.branchCodes ?? [], validFrom: s(p.validFrom), validTo: s(p.validTo), priority: Number(p.priority ?? 0), exclusive: Boolean(p.exclusive),
    noCap: p.legalCapPct === null, legalCapPct: p.legalCapPct === null || p.legalCapPct === undefined ? '' : s(p.legalCapPct),
    weekdays: (c.weekdays as number[] | undefined) ?? [], timeFrom: s(c.timeFrom), timeTo: s(c.timeTo), minOrderAmount: s(c.minOrderAmount),
    couponCodes: ((c.couponCodes as string[] | undefined) ?? []).join(', '), birthdayMonth: Boolean(c.birthdayMonth), memberLevels: ((c.memberLevels as string[] | undefined) ?? []).join(', '),
    skus: ((p.skus as string[] | undefined) ?? []).join(', '),
  });
  const tiers = (p.tiers ?? []) as Record<string, unknown>[];
  if (kind === 'tiered') {
    f.basis = p.basis === 'amount' ? 'amount' : 'qty';
    f.tiers = tiers.map((t) => { const mode: TierMode = t.pct != null ? 'pct' : t.unitPrice != null ? 'unitPrice' : 'amountPerUnit'; return { min: s(t.min), mode, value: s(t[mode]) }; });
  }
  if (kind === 'order_discount') f.orderTiers = tiers.map((t) => ({ minOrder: s(t.minOrder), mode: t.pct != null ? 'pct' : 'amount', value: s(t.pct ?? t.amount), maxDiscount: s(t.maxDiscount) }));
  if (kind === 'order_gift') f.giftTiers = tiers.map((t) => ({ minOrder: s(t.minOrder), gifts: ((t.gifts ?? []) as { sku: string; qty: number }[]).map((g) => `${g.sku}:${g.qty}`).join(', ') }));
  if (kind === 'combo') {
    f.items = ((p.items ?? []) as { sku: string; qty: number }[]).map((x) => ({ sku: x.sku, qty: s(x.qty) }));
    f.comboMode = p.comboPrice != null ? 'comboPrice' : p.discountPct != null ? 'discountPct' : 'discountAmount';
    f.comboValue = s(p[f.comboMode]); f.maxCombos = s(p.maxCombos);
  }
  if (kind === 'cheapest_free') { f.buyQty = s(p.buyQty); f.freeQty = s(p.freeQty ?? 1); f.repeat = p.repeat !== false; }
  if (kind === 'buy_x_get_y') {
    const b = (p.buy ?? {}) as { sku?: string; qty?: number }, g = (p.get ?? {}) as { sku?: string; qty?: number };
    f.buy = { sku: s(b.sku), qty: s(b.qty) }; f.get = { sku: s(g.sku), qty: s(g.qty) }; f.repeat = p.repeat !== false; f.maxGiftQty = s(p.maxGiftQty);
  }
  return f;
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Nội dung bản "ngừng" từ ngày `stopFrom`: giữ nguyên nội dung, kết thúc chiến dịch hôm trước (`validTo` = stopFrom − 1). Khuyến mại chưa chạy
 * (validFrom ≥ stopFrom) → cửa sổ thu về một ngày trước stopFrom: không ngày bán nào từ stopFrom trở đi còn áp.
 */
export function stopParams(p: Params, stopFrom: string): Params {
  const end = addDays(stopFrom, -1);
  const from = typeof p.validFrom === 'string' && p.validFrom > end ? end : p.validFrom;
  return { ...p, ...(from !== undefined ? { validFrom: from } : {}), validTo: typeof p.validTo === 'string' && p.validTo < end ? p.validTo : end };
}

export type Status = 'upcoming' | 'running' | 'ended' | 'stopped';
export const STATUS_LABEL: Record<Status, { label: string; tone: string }> = {
  upcoming: { label: 'Sắp chạy', tone: 'info' }, running: { label: 'Đang chạy', tone: 'ok' }, ended: { label: 'Đã hết', tone: 'gray' }, stopped: { label: 'Đã ngừng', tone: 'warn' },
};
/** Lý do phát hành của bản "ngừng" — để danh sách nhận ra. */
export const STOP_REASON = 'Ngừng khuyến mại';

/** Trạng thái theo ngày hôm nay, cửa sổ chiến dịch trong nội dung và bản cuối (ngừng hay không). */
export function statusOf(x: { validFrom?: string | null; validTo?: string | null; lastReason?: string | null; effectiveTo?: string | null }, today: string): Status {
  if (x.lastReason?.startsWith(STOP_REASON)) return 'stopped';
  if (x.effectiveTo && x.effectiveTo < today) return 'ended';
  if (x.validTo && x.validTo < today) return 'ended';
  if (x.validFrom && x.validFrom > today) return 'upcoming';
  return 'running';
}
