/**
 * MẶT HÀNG & GIÁ MUA CỦA NHÀ CUNG CẤP (bảng supplier_products) + ĐƠN VỊ TÍNH của mặt hàng (product_units):
 *   - ĐVT chỉ khai ở Mặt hàng (tỉ lệ quy đổi về ĐVT nhỏ nhất); mọi chỗ khác CHỌN trong danh sách đó.
 *   - ĐVT mua mặc định: dòng NCC có is_default_unit → NCC chỉ khai một ĐVT cho mã thì ĐVT đó → cờ "mua mặc định" của mặt hàng
 *     → ĐVT bán chính → ĐVT nhỏ nhất.
 *   - Giá mua cố định: dòng của đúng NCC thắng dòng giá chung (NCC trống); đúng ĐVT; còn hiệu lực; hiệu lực mới nhất.
 *     Không có dòng đúng ĐVT thì quy đổi từ ĐVT khác theo tỉ lệ.
 */
export interface ProductUnit { unit: string; ratio: number; isDefault?: boolean; isPurchaseDefault?: boolean }
export interface SupplierProduct {
  id?: string;
  /** Trống / null = giá chung cho mọi NCC. */
  partnerCode?: string | null;
  sku: string;
  unit: string;
  isDefaultUnit?: boolean;
  nccSku?: string;
  /** Tên hàng bên NCC. */
  nccName?: string;
  price?: number | null;
  priceIncludesVat: boolean;
  warnPct: number;
  validFrom?: string;
  validTo?: string;
  note?: string;
  isActive: boolean;
  createdBy?: string; updatedBy?: string; createdAt?: string; updatedAt?: string;
}

const same = (a?: string, b?: string) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
export const ratioOf = (units: ProductUnit[], unit?: string) => units.find((u) => same(u.unit, unit))?.ratio ?? 1;
export const baseUnitOf = (units: ProductUnit[]) => units.find((u) => Number(u.ratio) === 1)?.unit ?? units[0]?.unit ?? '';
const live = (r: SupplierProduct, date: string) => r.isActive && (!r.validFrom || r.validFrom <= date) && (!r.validTo || r.validTo >= date);

/** ĐVT mua mặc định của một mã khi lập phiếu cho NCC. */
export function defaultUnitFor(units: ProductUnit[], rows: SupplierProduct[], partnerCode: string, sku: string, fallback = ''): string {
  // ĐVT lập đơn / phiếu với NCC = ĐVT trên dòng giá của NCC đó (bảng Mặt hàng & giá mua). NCC khai nhiều ĐVT cho cùng mã:
  // ưu tiên ĐVT "Mua mặc định" của mặt hàng nếu NCC có khai, không thì dòng giá mới nhất. NCC chưa khai: Mua mặc định → Bán
  // chính → ĐVT nhỏ nhất. (Không còn ô tích riêng "đặt theo ĐVT" — mỗi dòng giá đã mang ĐVT.)
  const mine = partnerCode ? rows.filter((r) => r.sku === sku && r.isActive && r.partnerCode === partnerCode) : [];
  const buyDefault = units.find((u) => u.isPurchaseDefault)?.unit;
  const own = mine.find((r) => buyDefault && same(r.unit, buyDefault)) ?? [...mine].sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''))[0];
  return own?.unit || buyDefault || units.find((u) => u.isDefault)?.unit || baseUnitOf(units) || fallback;
}

/** Giá mua cố định áp cho (NCC, mã, ĐVT, ngày). Trả dòng giá + giá đã quy về đúng ĐVT hỏi. */
export function priceFor(rows: SupplierProduct[], ctx: { date: string; partnerCode?: string; sku: string; unit?: string }, units: ProductUnit[] = []): { row: SupplierProduct; price: number } | undefined {
  const cand = rows.filter((r) => r.sku === ctx.sku && r.price !== null && r.price !== undefined && live(r, ctx.date) && (!r.partnerCode || r.partnerCode === ctx.partnerCode));
  const rank = (r: SupplierProduct) => (r.partnerCode ? 2 : 0) + (!ctx.unit || same(r.unit, ctx.unit) ? 1 : 0);
  const best = cand.sort((a, b) => rank(b) - rank(a) || (b.validFrom ?? '').localeCompare(a.validFrom ?? ''))[0];
  if (!best) return undefined;
  if (!ctx.unit || same(best.unit, ctx.unit)) return { row: best, price: Number(best.price) };
  // Quy đổi theo tỉ lệ — chỉ khi cả hai ĐVT đều có ở mặt hàng (ĐVT lạ thì không so giá).
  const from = units.find((u) => same(u.unit, best.unit))?.ratio, to = units.find((u) => same(u.unit, ctx.unit))?.ratio;
  return from && to ? { row: best, price: Math.round((Number(best.price) / from) * to * 10000) / 10000 } : undefined;
}

/** Câu tóm tắt một dòng giá. */
export const priceText = (r: SupplierProduct) => (r.price === null || r.price === undefined ? 'Có bán (chưa khai giá)' : `${Number(r.price).toLocaleString('vi-VN')}đ / ${r.unit} (${r.priceIncludesVat ? 'gồm' : 'chưa'} thuế)`);
