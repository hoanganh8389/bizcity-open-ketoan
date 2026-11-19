/**
 * Đơn đặt hàng (phiếu NT-BH-023) — hàm thuần (không đọc CSDL): khuôn đầu vào, số đơn, kiểm hạn mức / nợ quá hạn, giữ hàng (chia số
 * giữ / trả theo dòng), giao nhiều lần (không vượt số còn lại), lịch sử cũ → mới, lọc trùng đơn livestream, chứng từ chuyển kho giữ
 * hàng (bizcity_ledger_intake@1, docType transfer cùng chi nhánh, amount 0 — Kernel định giá). Không viết số tài khoản.
 */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: hàm thuần đơn đặt hàng (đóng góp)
import { roundMoney, z } from '@bizcity/module-sdk';
import { lineInput, type Line } from './doc.js';

export const ORDER_STATUSES = ['draft', 'pending', 'open', 'closed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_SOURCES = ['manual', 'livestream'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const optDate = date.optional().or(z.literal('').transform(() => undefined));

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: thông tin giao, chuyến giao (đóng góp)
/** Mã hãng "tự giao" (nhân viên cửa hàng giao). */
export const SELF_CARRIER = 'SELF';
const money = z.number().finite().min(0).max(1e12);
export const shippingInput = z.object({
  receiver: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(32).optional(),
  address: z.string().trim().max(500).optional(),
  /** Phí ship thu khách (gồm thuế) — thành một dòng dịch vụ trên phiếu bán của chuyến giao. */
  fee: money.optional(),
  /** Hãng vận chuyển: SELF (tự giao) hoặc mã hãng (vd GHN) — chọn hình thức thanh toán "COD — <hãng>" theo cài đặt. */
  carrier: z.string().trim().max(32).optional(),
  trackingNo: z.string().trim().max(64).optional(),
  /** Tiền thu hộ (COD) hãng thu của khách. */
  cod: money.optional(),
});
export type ShippingInput = z.infer<typeof shippingInput>;
export type Shipping = { receiver?: string; phone?: string; address?: string; fee: number; carrier?: string; trackingNo?: string; cod: number };

/** Chuẩn hoá thông tin giao (tiền làm tròn đồng, hãng viết hoa, bỏ ô trống); không khai gì → null. */
export function normShipping(s: ShippingInput | undefined | null): Shipping | null {
  if (!s) return null;
  const t = (x?: string) => (x && x.trim() ? x.trim() : undefined);
  const out: Shipping = {
    ...(t(s.receiver) ? { receiver: t(s.receiver) } : {}), ...(t(s.phone) ? { phone: t(s.phone) } : {}), ...(t(s.address) ? { address: t(s.address) } : {}),
    fee: roundMoney(s.fee ?? 0), ...(t(s.carrier) ? { carrier: t(s.carrier)!.toUpperCase() } : {}), ...(t(s.trackingNo) ? { trackingNo: t(s.trackingNo) } : {}),
    cod: roundMoney(s.cod ?? 0),
  };
  return Object.keys(out).length > 2 || out.fee > 0 || out.cod > 0 ? out : null;
}

export const SHIPMENT_STATUSES = ['waiting', 'shipping', 'delivered', 'returned'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = { waiting: 'Chờ lấy hàng', shipping: 'Đang giao', delivered: 'Đã giao', returned: 'Hoàn' };
/** Đổi trạng thái chuyến giao được phép: Chờ lấy → Đang giao | Hoàn (huỷ chuyến trước khi lấy); Đang giao → Đã giao | Hoàn. */
export const SHIPMENT_NEXT: Record<ShipmentStatus, readonly ShipmentStatus[]> = { waiting: ['shipping', 'returned'], shipping: ['delivered', 'returned'], delivered: [], returned: [] };
export type ShipLine = { lineKey: string; sku: string; name: string; unit: string; qty: number };

export const orderInput = z.object({
  orderDate: date,
  branchCode: z.string().trim().min(1, 'Chưa chọn cửa hàng').max(32),
  /** Kho bán (kho xuất khi giữ hàng). Trống = kho mặc định của cửa hàng. */
  warehouseCode: z.string().trim().max(64).optional(),
  /** Hạn hiệu lực của đơn nháp (báo giá). */
  validUntil: optDate,
  source: z.enum(ORDER_SOURCES).default('manual'),
  partner: z.object({ code: z.string().trim().max(64) }).passthrough().optional(),
  /** Người đặt chưa có mã khách (đơn livestream): tên, số điện thoại. */
  customer: z.object({ name: z.string().trim().max(255).optional(), phone: z.string().trim().max(32).optional() }).optional(),
  lines: z.array(lineInput).min(1, 'Đơn chưa có dòng hàng').max(500),
  note: z.string().trim().max(1000).optional(),
  policyRefs: z.array(z.object({ key: z.string().trim().min(1).max(64), version: z.number().int().min(1), hash: z.string().trim().min(1).max(128) })).max(50).optional(),
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032 Q1: thông tin giao trên đơn đặt hàng (đóng góp)
  /** Thông tin giao (NT-BH-032): người nhận, SĐT, địa chỉ, phí ship thu khách, hãng (SELF = tự giao), mã vận đơn, tiền COD. */
  shipping: shippingInput.optional(),
});
export type OrderInput = z.infer<typeof orderInput>;

/** delivered = đã giao (phiếu bán đã sinh); held = đang giữ ở KCB cho phần còn lại; shipping = đang trên chuyến giao chưa xong (NT-BH-032). */
export type OrderLine = Line & { delivered: number; held: number; shipping?: number };
/** Một lần giao sinh phiếu bán; `shipmentId` = phiếu bán của chuyến giao (NT-BH-032, xuất từ kho KHG). */
export type Delivery = { docId: string; docNo: string; at: string; by: string; lines: { lineKey: string; sku: string; qty: number }[]; returned?: boolean; shipmentId?: string };
export type OrderBody = {
  partner?: { code: string; name: string; taxCode?: string };
  customer?: { name?: string; phone?: string };
  lines: OrderLine[];
  totals: { beforeTax: number; tax: number; total: number };
  note?: string;
  policyRefs?: { key: string; version: number; hash: string }[];
  deliveries: Delivery[];
  rejection?: { by: string; at: string; note: string };
  /** NT-BH-032: đơn copy từ đơn / hoá đơn khác (loại + số gốc). */
  copiedFrom?: { kind: 'order' | 'sale' | 'pos'; no: string };
};

export const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Số đơn: DH + yyMM + 6 số theo cửa hàng × tháng. */
export function formatOrderNo(period: string, n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999_999) throw new RangeError(`Số đơn ngoài khoảng: ${n}`);
  return `DH${period}${String(n).padStart(6, '0')}`;
}

/** Số điện thoại chỉ giữ chữ số (lọc trùng không lệ thuộc cách gõ). */
export const normPhone = (s: string | undefined | null) => (s ?? '').replace(/\D+/g, '');

/** Còn giao / đi giao được = SL − đã giao − đang trên chuyến giao (NT-BH-032). Cũng là số phải giữ ở KCB. */
export const remainingOf = (l: Pick<OrderLine, 'qty' | 'delivered'> & { shipping?: number }) => r4(Math.max(0, l.qty - l.delivered - (l.shipping ?? 0)));
/** Giao đủ: mọi dòng đã giao hết (chuyến đang đi chưa tính). */
export const fullyDelivered = (lines: readonly OrderLine[]) => lines.every((l) => r4(l.qty - l.delivered) <= 0);
/** Còn chuyến giao chưa xong (Chờ lấy / Đang giao). */
export const anyShipping = (lines: readonly OrderLine[]) => lines.some((l) => (l.shipping ?? 0) > 0);
export const anyDelivered = (lines: readonly OrderLine[]) => lines.some((l) => l.delivered > 0);

/** Đơn quá hạn hiệu lực (so ngày, không giờ). */
export const expired = (validUntil: string | null | undefined, today: string) => Boolean(validUntil) && validUntil! < today;

/**
 * Ghép dòng mới tính lại với số đã giao / đang giữ của dòng cũ (theo lineKey). Dòng đã giao không được bỏ, không được đổi mã,
 * không giảm dưới số đã giao. Dòng bỏ đi còn giữ hàng → trả lại khi cân giữ hàng (held giữ nguyên ở danh sách `removed`).
 */
export function mergeProgress(old: readonly OrderLine[], next: readonly Line[]): { lines: OrderLine[]; removed: OrderLine[]; problems: string[] } {
  const prev = new Map(old.map((l) => [l.lineKey, l]));
  const problems: string[] = [];
  const lines = next.map((l) => {
    const o = prev.get(l.lineKey);
    if (o && o.sku !== l.sku && o.delivered > 0) problems.push(`Dòng ${l.lineKey}: đã giao ${o.sku} — không đổi mã hàng`);
    if (o && o.sku !== l.sku && (o.shipping ?? 0) > 0) problems.push(`Dòng ${l.lineKey}: ${o.sku} đang trên chuyến giao — không đổi mã hàng`);
    if (o && l.qty < r4(o.delivered + (o.shipping ?? 0))) {
      problems.push(`Dòng ${l.lineKey} (${l.sku}): số lượng ${l.qty} nhỏ hơn số đã giao${o.shipping ? ' / đang giao' : ''} ${r4(o.delivered + (o.shipping ?? 0))}`);
    }
    return { ...l, delivered: o?.delivered ?? 0, held: o && o.sku === l.sku ? o.held : 0, ...(o?.shipping ? { shipping: o.shipping } : {}) };
  });
  const keep = new Set(next.map((l) => l.lineKey));
  const removed = old.filter((l) => !keep.has(l.lineKey) || next.find((n) => n.lineKey === l.lineKey)!.sku !== l.sku);
  for (const l of removed) if ((l.shipping ?? 0) > 0 && !keep.has(l.lineKey)) problems.push(`Dòng ${l.lineKey} (${l.sku}) đang trên chuyến giao — không bỏ được`);
  for (const l of removed) if (l.delivered > 0 && !keep.has(l.lineKey)) problems.push(`Dòng ${l.lineKey} (${l.sku}) đã giao ${l.delivered} — không bỏ được, giảm số lượng về số đã giao`);
  return { lines, removed: removed.filter((l) => l.held > 0), problems };
}

export type Move = { lineKey: string; sku: string; name: string; unit: string; qty: number };
export type Short = { sku: string; need: number; have: number };

/**
 * Cân hàng giữ của đơn đang mở: mỗi dòng giữ đúng số còn lại (SL − đã giao). Giữ thêm thì lấy từ tồn kho bán (`have`, theo mã),
 * thiếu thì giữ được bao nhiêu giữ bấy nhiêu và báo `short` (không chặn — NT-BH-023 bước 2). `releaseAll` (đóng / huỷ): trả hết.
 * Dòng đã bỏ khỏi đơn (`removed`) trả hết số đang giữ.
 */
export function rebalanceHolds(lines: readonly OrderLine[], have: ReadonlyMap<string, number>, opts: { releaseAll?: boolean; removed?: readonly OrderLine[] } = {}) {
  const left = new Map(have);
  const hold: Move[] = [];
  const release: Move[] = [];
  const need = new Map<string, number>();
  const out = lines.map((l) => {
    const target = opts.releaseAll ? 0 : remainingOf(l);
    const mv = { lineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.unit };
    if (l.held > target) {
      release.push({ ...mv, qty: r4(l.held - target) });
      return { ...l, held: target };
    }
    const want = r4(target - l.held);
    if (want <= 0) return { ...l };
    need.set(l.sku, r4((need.get(l.sku) ?? 0) + want));
    const can = r4(Math.max(0, Math.min(want, left.get(l.sku) ?? 0)));
    left.set(l.sku, r4((left.get(l.sku) ?? 0) - can));
    if (can > 0) hold.push({ ...mv, qty: can });
    return { ...l, held: r4(l.held + can) };
  });
  for (const l of opts.removed ?? []) if (l.held > 0) release.push({ lineKey: `${l.lineKey}x`, sku: l.sku, name: l.name, unit: l.unit, qty: l.held });
  const short: Short[] = [...need.entries()].map(([sku, n]) => ({ sku, need: n, have: r4(Math.max(0, have.get(sku) ?? 0)) })).filter((s) => s.need > s.have)
    .sort((a, b) => a.sku.localeCompare(b.sku));
  return { lines: out, hold, release, short };
}

/** Một lần giao: mỗi dòng ≤ số còn lại. Đã giao tăng, đang giữ giảm tương ứng (hàng vẫn nằm ở kho KCB tới khi phiếu bán được duyệt). */
export function applyDelivery(lines: readonly OrderLine[], req: readonly { lineKey: string; qty: number }[]) {
  const byKey = new Map(lines.map((l) => [l.lineKey, l]));
  const over: { lineKey: string; sku: string; qty: number; remaining: number }[] = [];
  const problems: string[] = [];
  const want = new Map<string, number>();
  for (const r of req) {
    if (!(r.qty > 0)) continue;
    if (!byKey.has(r.lineKey)) { problems.push(`Đơn không có dòng ${r.lineKey}`); continue; }
    want.set(r.lineKey, r4((want.get(r.lineKey) ?? 0) + r.qty));
  }
  if (!want.size && !problems.length) problems.push('Chưa chọn số lượng giao');
  for (const [k, q] of want) {
    const l = byKey.get(k)!;
    if (q > remainingOf(l) + 1e-9) over.push({ lineKey: k, sku: l.sku, qty: q, remaining: remainingOf(l) });
  }
  const next = lines.map((l) => {
    const q = want.get(l.lineKey) ?? 0;
    return q ? { ...l, delivered: r4(l.delivered + q), held: r4(Math.max(0, l.held - q)) } : { ...l };
  });
  return { lines: next, delivered: [...want.entries()].map(([lineKey, qty]) => ({ lineKey, sku: byKey.get(lineKey)!.sku, qty })), over, problems };
}

/**
 * Trả lại số đã giao của một lần giao (phiếu bán nháp bị xoá / giảm số): đã giao giảm; đơn còn mở thì hàng (đang nằm ở KCB) giữ lại
 * cho đơn. `keepHeld = false` (đơn đã đóng tay / huỷ): hàng phải chuyển về kho bán — trả `release`.
 */
export function returnDelivery(lines: readonly OrderLine[], back: readonly { lineKey: string; qty: number }[], keepHeld: boolean) {
  const q = new Map<string, number>();
  for (const b of back) q.set(b.lineKey, r4((q.get(b.lineKey) ?? 0) + b.qty));
  const release: Move[] = [];
  const next = lines.map((l) => {
    const n = Math.min(q.get(l.lineKey) ?? 0, l.delivered);
    if (!n) return { ...l };
    if (!keepHeld) release.push({ lineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.unit, qty: n });
    return { ...l, delivered: r4(l.delivered - n), held: keepHeld ? r4(l.held + n) : l.held };
  });
  return { lines: next, release };
}

/** Dòng phiếu bán của một lần giao: giá, thuế, quà, chương trình theo đơn; chiết khấu chia theo số giao (làm tròn luỹ kế — cộng các lần = chiết khấu dòng). */
export function deliveryLines(lines: readonly OrderLine[], delivered: readonly { lineKey: string; qty: number }[], before: ReadonlyMap<string, number>) {
  const byKey = new Map(lines.map((l) => [l.lineKey, l]));
  return delivered.map((d) => {
    const l = byKey.get(d.lineKey)!;
    const prev = before.get(d.lineKey) ?? 0;
    const share = (n: number) => roundMoney(l.discount * n / l.qty);
    const discount = l.isGift ? 0 : share(r4(prev + d.qty)) - share(prev);
    return {
      lineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.unit, qty: d.qty, unitPrice: l.unitPrice, discount, taxCode: l.taxCode,
      ...(l.isGift ? { isGift: true } : {}), ...(l.policyRef ? { policyRef: l.policyRef } : {}),
    };
  });
}

/** Giá trị chưa giao của đơn (sau thuế, theo tỷ lệ số còn lại) — cộng vào nợ khi kiểm hạn mức. */
export function undeliveredValue(body: Pick<OrderBody, 'lines'>): number {
  return roundMoney(body.lines.reduce((s, l) => s + (l.qty > 0 ? (l.amountBeforeTax + l.taxAmount) * Math.max(0, l.qty - l.delivered) / l.qty : 0), 0));
}

/** Nợ của khách từ báo cáo công nợ theo đối tượng (mọi tài khoản theo dõi đối tượng): nợ = Σ(dư Nợ − dư Có); phát sinh Nợ trong kỳ. */
export function debtOf(rows: readonly { partnerCode?: string; debit?: number; closingDebit?: number; closingCredit?: number }[], partnerCode: string) {
  let debt = 0;
  let periodDebit = 0;
  for (const r of rows) {
    if (r.partnerCode !== partnerCode) continue;
    debt += Number(r.closingDebit ?? 0) - Number(r.closingCredit ?? 0);
    periodDebit += Number(r.debit ?? 0);
  }
  debt = roundMoney(debt);
  periodDebit = roundMoney(periodDebit);
  // Nợ quá hạn: phần nợ không phát sinh trong hạn thanh toán (nợ cũ hơn N ngày còn chưa trả — thu tiền trừ nợ cũ trước).
  return { debt, periodDebit, overdue: roundMoney(Math.max(0, debt - periodDebit)) };
}

const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

/** Lý do phải duyệt (rỗng = gửi thẳng): vượt hạn mức (hạn mức > 0), có nợ quá hạn. */
export function creditReasons(c: { limit: number; debt: number; openOthers: number; thisOrder: number; overdue: number; termDays: number }): string[] {
  const out: string[] = [];
  if (c.limit > 0 && c.debt + c.openOthers + c.thisOrder > c.limit + 1e-6) {
    out.push(`Vượt hạn mức ${vnd(c.limit)}: nợ ${vnd(c.debt)} + đơn mở ${vnd(c.openOthers)} + đơn này ${vnd(c.thisOrder)}`);
  }
  if (c.overdue > 0) out.push(`Khách có nợ quá hạn ${vnd(c.overdue)} (hạn thanh toán ${c.termDays} ngày)`);
  return out;
}

/** Khoá cấu hình kho giữ hàng: mảng "CN01=KHO-KCB" → bảng cửa hàng → kho KCB. */
export function parseHoldMap(v: unknown): Map<string, string> {
  const m = new Map<string, string>();
  if (!Array.isArray(v)) return m;
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const i = x.indexOf('=');
    if (i <= 0) continue;
    const b = x.slice(0, i).trim();
    const w = x.slice(i + 1).trim();
    if (b && w) m.set(b, w);
  }
  return m;
}

export type DupCandidate = { orderId: string; orderNo: string; status: string; createdAt: Date; skus: string[] };
/** Đơn livestream trùng: cùng SĐT (đã lọc ở câu đọc) + cùng ít nhất một mã hàng, lập trong 24 giờ trước `now`, chưa huỷ. */
export function duplicatesOf(cands: readonly DupCandidate[], skus: readonly string[], now: Date) {
  const want = new Set(skus);
  const since = now.getTime() - 24 * 3600_000;
  return cands.filter((c) => c.status !== 'cancelled' && c.createdAt.getTime() >= since && c.skus.some((s) => want.has(s)))
    .map((c) => ({ orderId: c.orderId, orderNo: c.orderNo, status: c.status, skus: c.skus.filter((s) => want.has(s)), createdAt: c.createdAt.toISOString() }));
}

export type Change = { field: string; from: unknown; to: unknown };
type Head = { partner?: string | null; validUntil?: string | null; warehouse?: string | null; branch?: string | null; note?: string | null; orderDate?: string | null; phone?: string | null };

/** Thay đổi cũ → mới để ghi lịch sử: phần đầu đơn và từng dòng (thêm, bỏ, đổi mã, SL, đơn giá, chiết khấu, quà). */
export function diffOrder(a: { head: Head; lines: readonly Line[] }, b: { head: Head; lines: readonly Line[] }): Change[] {
  const out: Change[] = [];
  for (const k of Object.keys({ ...a.head, ...b.head }) as (keyof Head)[]) {
    const x = a.head[k] ?? null;
    const y = b.head[k] ?? null;
    if (x !== y) out.push({ field: k, from: x, to: y });
  }
  const A = new Map(a.lines.map((l) => [l.lineKey, l]));
  const B = new Map(b.lines.map((l) => [l.lineKey, l]));
  for (const [k, l] of A) if (!B.has(k)) out.push({ field: `line ${k}`, from: `${l.sku} × ${l.qty}`, to: null });
  for (const [k, l] of B) {
    const o = A.get(k);
    if (!o) { out.push({ field: `line ${k}`, from: null, to: `${l.sku} × ${l.qty}` }); continue; }
    for (const f of ['sku', 'qty', 'unitPrice', 'discount', 'isGift'] as const) if (o[f] !== l[f]) out.push({ field: `line ${k} ${f}`, from: o[f], to: l[f] });
  }
  return out;
}

export const holdDocKey = (orderId: string, seq: number) => `phieu-ban:dh:${orderId}:${seq}`;

/**
 * Chứng từ chuyển kho giữ / trả hàng (một chứng từ cho cả cặp, cùng chi nhánh: toBranchCode = branchCode, dòng ghi kho xuất +
 * kho nhận). amount 0: Kernel định giá theo giá vốn; cùng tài khoản kho thì không phát sinh bút toán, chỉ thẻ kho đổi kho.
 */
export function toHoldDoc(d: { orderId: string; orderNo: string; seq: number; branchCode: string; docDate: string; from: string; to: string; moves: readonly Move[]; release: boolean;
  /** NT-BH-032: ship = đi giao (KCB → KHG), back = hàng hoàn (KHG → KCB); trống = giữ / trả hàng giữ như cũ. */
  kind?: 'ship' | 'back' }) {
  const keys = new Set<string>();
  const tag = d.kind === 'ship' ? 'S' : d.kind === 'back' ? 'H' : d.release ? 'T' : 'G';
  const what = d.kind === 'ship' ? 'Đi giao' : d.kind === 'back' ? 'Hàng hoàn (khách không nhận)' : d.release ? 'Trả hàng giữ' : 'Giữ hàng';
  return {
    docType: 'transfer',
    docKey: holdDocKey(d.orderId, d.seq),
    version: 1,
    branchCode: d.branchCode,
    toBranchCode: d.branchCode,
    status: 'received',
    docNo: `${d.orderNo}-${tag}${d.seq}`,
    docDate: d.docDate,
    description: `${what} cho đơn đặt hàng ${d.orderNo}: ${d.from} → ${d.to}`,
    sourceRef: { type: 'phieu-ban.order', id: d.orderId, label: d.orderNo },
    lines: d.moves.filter((m) => m.qty > 0).map((m, i) => {
      let k = m.lineKey;
      if (keys.has(k)) k = `${k}.${i + 1}`;
      keys.add(k);
      return { lineKey: k, sku: m.sku, name: m.name, unit: m.unit, qty: m.qty, amount: 0, warehouseCode: d.from, toWarehouseCode: d.to };
    }),
    totals: { total: 0 },
  };
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: chuyến giao — giữ chỗ số lượng, giao xong, hoàn (đóng góp)
/**
 * Lập chuyến giao: mỗi dòng ≤ số còn lại (SL − đã giao − đang trên chuyến khác). Dòng: shipping tăng, held giảm (hàng vẫn ở KCB tới khi
 * Đang giao). Trả `ship` (dòng chuyến) hoặc `over` / `problems`.
 */
export function reserveShipment(lines: readonly OrderLine[], req: readonly { lineKey: string; qty: number }[]) {
  const a = applyDelivery(lines, req);
  const byKey = new Map(lines.map((l) => [l.lineKey, l]));
  const want = new Map(a.delivered.map((d) => [d.lineKey, d.qty]));
  const next = lines.map((l) => {
    const q = want.get(l.lineKey) ?? 0;
    return q ? { ...l, shipping: r4((l.shipping ?? 0) + q), held: r4(Math.max(0, l.held - q)) } : { ...l };
  });
  const ship: ShipLine[] = a.delivered.map((d) => { const l = byKey.get(d.lineKey)!; return { lineKey: d.lineKey, sku: l.sku, name: l.name, unit: l.unit, qty: d.qty }; });
  return { lines: next, ship, over: a.over, problems: a.problems };
}

const sumByKey = (xs: readonly { lineKey: string; qty: number }[]) => {
  const q = new Map<string, number>();
  for (const s of xs) q.set(s.lineKey, r4((q.get(s.lineKey) ?? 0) + s.qty));
  return q;
};

/** Chuyến giao xong (Đã giao): đang giao → đã giao. `undo` (xoá phiếu bán nháp của chuyến): ngược lại, hàng vẫn ở KHG. */
export function shipmentDelivered(lines: readonly OrderLine[], ship: readonly { lineKey: string; qty: number }[], undo = false) {
  const q = sumByKey(ship);
  const k = undo ? -1 : 1;
  return lines.map((l) => {
    const n = q.get(l.lineKey) ?? 0;
    if (!n) return { ...l };
    return { ...l, delivered: r4(Math.max(0, l.delivered + k * n)), shipping: r4(Math.max(0, (l.shipping ?? 0) - k * n)) };
  });
}

/** Chuyến hoàn (khách không nhận / huỷ trước khi lấy): đang giao → giữ lại ở KCB cho đơn (đơn vẫn mở phần chưa giao). */
export function shipmentReturned(lines: readonly OrderLine[], ship: readonly { lineKey: string; qty: number }[]) {
  const q = sumByKey(ship);
  return lines.map((l) => {
    const n = q.get(l.lineKey) ?? 0;
    return n ? { ...l, shipping: r4(Math.max(0, (l.shipping ?? 0) - n)), held: r4(l.held + n) } : { ...l };
  });
}

/** Phí ship thu khách (gồm thuế) → đơn giá trước thuế của dòng dịch vụ (làm tròn đồng). */
export const feeBeforeTax = (fee: number, ratePct: number) => roundMoney(fee / (1 + ratePct / 100));

/** Khoá cấu hình ánh xạ "<hãng>=<mã hình thức thanh toán>" (cùng khuôn với kho giữ hàng); mã hãng viết hoa. */
export function parseCarrierMap(v: unknown): Map<string, string> {
  return new Map([...parseHoldMap(v)].map(([k, x]) => [k.toUpperCase(), x]));
}
