/**
 * Số liệu ca bán và tổng quan bán hàng (phiếu NT-BH-007) — hàm thuần trên bản chụp đơn / phiếu trả của module, không đọc CSDL.
 * Tiền theo hình thức: đơn "tiền mặt" (mode cash) = tổng đơn vào hình thức tiền mặt (đã trừ thối); đơn nhiều hình thức lấy từng
 * phần; phần đối trừ (đổi hàng) không phải tiền thu nên không tính.
 */
import { isOffsetMethod, paymentKind } from './order.js';

export type OrderSnap = {
  code: string; status: string; total: number; createdAt: string; saleSource?: string;
  payment: { mode: string; parts?: { method: string; amount: number }[] };
  lines?: { sku: string; name: string; unitQty: number; unitRatio?: number; amount: number; taxAmount: number }[];
};
export type ReturnSnap = { refundMethod: string; refundTotal: number };
export type MethodAmount = { method: string; name: string; amount: number };

export function orderPayments(o: Pick<OrderSnap, 'payment' | 'total'>, cashCode: string): MethodAmount[] {
  if (o.payment.mode === 'split') {
    return (o.payment.parts ?? []).filter((p) => !isOffsetMethod(p.method) && p.amount > 0).map((p) => ({ method: p.method, name: p.method, amount: p.amount }));
  }
  if (o.payment.mode === 'cash') return o.total > 0 ? [{ method: cashCode, name: cashCode, amount: o.total }] : [];
  return o.total > 0 ? [{ method: o.payment.mode, name: o.payment.mode, amount: o.total }] : [];
}

const addTo = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
const sorted = (m: Map<string, number>, names: Record<string, string> = {}): MethodAmount[] =>
  [...m].map(([method, amount]) => ({ method, name: names[method] ?? method, amount })).sort((a, b) => b.amount - a.amount || a.method.localeCompare(b.method));

export type ShiftNumbers = {
  orderCount: number; total: number; byPayment: MethodAmount[]; cashSales: number; returnCount: number; cashRefunds: number; expectedCash: number;
  blockers: { kind: 'awaiting_payment'; ref: string; message: string }[];
};

/** Số liệu ca: chỉ đơn hoàn tất tính doanh thu; đơn chờ trả tiền là việc dở chặn chốt ca thường. */
export function shiftNumbers(input: { openingCash: number; orders: readonly OrderSnap[]; returns: readonly ReturnSnap[]; cashCode: string; methodNames?: Record<string, string> }): ShiftNumbers {
  const done = input.orders.filter((o) => o.status === 'completed');
  const by = new Map<string, number>();
  for (const o of done) for (const p of orderPayments(o, input.cashCode)) addTo(by, p.method, p.amount);
  const cashSales = [...by].filter(([m]) => paymentKind(m) === 'cash' || m === input.cashCode).reduce((s, [, v]) => s + v, 0);
  const cashRefunds = input.returns.filter((r) => paymentKind(r.refundMethod) === 'cash' || r.refundMethod === input.cashCode).reduce((s, r) => s + r.refundTotal, 0);
  return {
    orderCount: done.length,
    total: done.reduce((s, o) => s + o.total, 0),
    byPayment: sorted(by, input.methodNames),
    cashSales,
    returnCount: input.returns.length,
    cashRefunds,
    expectedCash: input.openingCash + cashSales - cashRefunds,
    blockers: input.orders.filter((o) => o.status === 'awaiting_payment')
      .map((o) => ({ kind: 'awaiting_payment' as const, ref: o.code, message: `Đơn ${o.code} còn chờ trả tiền` })),
  };
}

export type Dashboard = {
  from: string; to: string; orderCount: number; total: number; taxTotal: number; promoDiscount: number; returnCount: number; returnTotal: number; net: number;
  byPayment: MethodAmount[]; bySaleSource: { code: string; name: string; orders: number; total: number }[];
  byPromotion: never[]; topProducts: { sku: string; name: string; qty: number; total: number }[]; byHour: { hour: number; orders: number; total: number }[];
};

/** Giờ Việt Nam (UTC+7) của một thời điểm. */
export const vnHour = (iso: string) => (new Date(iso).getUTCHours() + 7) % 24;

export function dashboard(input: {
  from: string; to: string; orders: readonly OrderSnap[]; returns: readonly ReturnSnap[]; cashCode: string; saleSourceNames?: Record<string, string>; methodNames?: Record<string, string>; top?: number;
}): Dashboard {
  const done = input.orders.filter((o) => o.status === 'completed');
  const pay = new Map<string, number>();
  const src = new Map<string, { orders: number; total: number }>();
  const prod = new Map<string, { name: string; qty: number; total: number }>();
  const hours = new Map<number, { orders: number; total: number }>();
  let taxTotal = 0;
  for (const o of done) {
    for (const p of orderPayments(o, input.cashCode)) addTo(pay, p.method, p.amount);
    const s = src.get(o.saleSource ?? 'tai_quay') ?? { orders: 0, total: 0 };
    src.set(o.saleSource ?? 'tai_quay', { orders: s.orders + 1, total: s.total + o.total });
    const h = vnHour(o.createdAt);
    const hh = hours.get(h) ?? { orders: 0, total: 0 };
    hours.set(h, { orders: hh.orders + 1, total: hh.total + o.total });
    for (const l of o.lines ?? []) {
      const x = prod.get(l.sku) ?? { name: l.name, qty: 0, total: 0 };
      // Dòng đơn: amount chưa thuế + taxAmount = tiền khách trả của dòng; qty theo ĐVT nhỏ nhất.
      prod.set(l.sku, { name: x.name, qty: x.qty + l.unitQty * (l.unitRatio ?? 1), total: x.total + l.amount + l.taxAmount });
      taxTotal += l.taxAmount;
    }
  }
  const total = done.reduce((s, o) => s + o.total, 0);
  const returnTotal = input.returns.reduce((s, r) => s + r.refundTotal, 0);
  return {
    from: input.from, to: input.to, orderCount: done.length, total, taxTotal, promoDiscount: 0,
    returnCount: input.returns.length, returnTotal, net: total - returnTotal,
    byPayment: sorted(pay, input.methodNames),
    bySaleSource: [...src].map(([code, v]) => ({ code, name: input.saleSourceNames?.[code] ?? code, ...v })).sort((a, b) => b.total - a.total),
    byPromotion: [],
    topProducts: [...prod].map(([sku, v]) => ({ sku, ...v })).sort((a, b) => b.total - a.total || a.sku.localeCompare(b.sku)).slice(0, input.top ?? 10),
    byHour: [...hours].map(([hour, v]) => ({ hour, ...v })).sort((a, b) => a.hour - b.hour),
  };
}
