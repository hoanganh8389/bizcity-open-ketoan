/** Dùng chung cho màn Đơn đặt hàng (NT-BH-023): kiểu dữ liệu API, nhãn trạng thái, định dạng. */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: màn Đơn đặt hàng (đóng góp)
export const M = '/api/v1/m/phieu-ban';
export const HOLD_KEY = 'bizcity.phieu_ban.hold_warehouses';

export type OrderLine = {
  lineKey: string; sku: string; name: string; unit: string; qty: number; unitPrice: number; discount: number; amountBeforeTax: number; taxAmount: number;
  isGift: boolean; delivered: number; held: number; shipping?: number;
};
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: thông tin giao, chuyến giao, copy đơn (đóng góp)
export type Shipping = { receiver?: string; phone?: string; address?: string; fee: number; carrier?: string; trackingNo?: string; cod: number };
export type ShipStatus = 'waiting' | 'shipping' | 'delivered' | 'returned';
export type Shipment = {
  id: string; seq: number; status: ShipStatus; carrier: string | null; trackingNo: string | null; fee: number; cod: number; shipWarehouseCode: string | null;
  lines: { lineKey: string; sku: string; name: string; unit: string; qty: number }[]; saleDocId: string | null; saleDocNo: string | null;
  log: { at: string; by: string; byName?: string; from: ShipStatus | null; to: ShipStatus; note?: string; docNo?: string }[];
};
export const SHIP_STATUS: Record<ShipStatus, { label: string; tone: string }> = {
  waiting: { label: 'Chờ lấy hàng', tone: 'gray' }, shipping: { label: 'Đang giao', tone: 'info' }, delivered: { label: 'Đã giao', tone: 'ok' }, returned: { label: 'Hoàn', tone: 'warn' },
};
/** Bước kế tiếp của chuyến: [trạng thái đích, nhãn nút, giải thích]. */
export const SHIP_NEXT: Record<ShipStatus, [ShipStatus, string, string][]> = {
  waiting: [['shipping', 'Đi giao', 'Hàng rời cửa hàng: chuyển kho KCB → KHG (chưa ghi doanh thu)'], ['returned', 'Huỷ chuyến', 'Chưa lấy hàng: trả số lượng về đơn']],
  shipping: [['delivered', 'Đã giao', 'Sinh phiếu bán BH10 nháp xuất từ KHG (phí ship, COD) — kế toán duyệt'], ['returned', 'Hoàn', 'Khách không nhận: chuyển kho KHG → KCB, đơn vẫn mở']],
  delivered: [], returned: [],
};
export const SELF_CARRIER = 'SELF';
export type Order = {
  id: string; orderNo: string; orderDate: string; validUntil: string | null; status: Status; source: 'manual' | 'livestream'; branchCode: string;
  warehouseCode: string; holdWarehouseCode: string | null; phone: string | null; partner?: { code: string; name: string }; customer?: { name?: string; phone?: string };
  lines: OrderLine[]; totals: { beforeTax: number; tax: number; total: number }; note?: string; total: number; pendingReasons: string[];
  closeReason: string | null; deliveries: { docId: string; docNo: string; at: string; by: string; returned?: boolean; lines: { sku: string; qty: number }[] }[];
  rejection?: { by: string; at: string; note: string }; createdBy: string; createdAt: string; approvedBy?: string; approvedAt?: string;
  shipping?: Shipping | null; copiedFrom?: string | null; shipments?: Shipment[];
};
export type Status = 'draft' | 'pending' | 'open' | 'closed' | 'cancelled';
export type HistoryEvent = { id: string; at: string; actor: string; actorName: string | null; action: string; changes: { field: string; from: unknown; to: unknown }[]; note: string | null };

export const STATUS: Record<Status, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'gray' }, pending: { label: 'Chờ duyệt', tone: 'warn' }, open: { label: 'Đã gửi', tone: 'info' },
  closed: { label: 'Đã đóng', tone: 'ok' }, cancelled: { label: 'Đã huỷ', tone: 'bad' },
};
export const ACTION: Record<string, string> = {
  create: 'Lập đơn', update: 'Sửa', merge: 'Gộp đơn livestream', send: 'Gửi', approve: 'Duyệt', reject: 'Từ chối', hold: 'Giữ hàng', release: 'Trả hàng giữ',
  deliver: 'Giao tại quầy', update_delivery: 'Sửa phiếu giao', delivery_returned: 'Xoá phiếu giao', close: 'Đóng đơn', cancel: 'Huỷ đơn',
  copy: 'Copy đơn', ship_create: 'Lập chuyến giao', ship_status: 'Cập nhật chuyến giao',
};

export const vnd = (n: number | null | undefined) => (n === null || n === undefined ? '' : new Intl.NumberFormat('vi-VN').format(n));
export const time = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
export const today = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date(Date.now() + offset * 86_400_000));
export const remaining = (l: Pick<OrderLine, 'qty' | 'delivered'> & { shipping?: number }) => Math.max(0, Math.round((l.qty - l.delivered - (l.shipping ?? 0)) * 10_000) / 10_000);
export const fmt = (v: unknown) => (typeof v === 'number' ? vnd(v) : v === null || v === undefined || v === '' ? '—' : String(v));

/** Dán bảng từ Excel (cột: Tên | SĐT | Mã hàng | SL | Đơn giá | Mã khách) → dòng. Dòng đầu là tiêu đề thì bỏ. */
export function parsePaste(text: string): { name: string; phone: string; sku: string; qty: number; unitPrice?: number; partnerCode?: string; row: number }[] {
  const out: { name: string; phone: string; sku: string; qty: number; unitPrice?: number; partnerCode?: string; row: number }[] = [];
  const num = (s: string | undefined) => { const t = (s ?? '').replace(/[.\s]/g, '').replace(',', '.'); return t ? Number(t) : NaN; };
  text.split(/\r?\n/).forEach((raw, i) => {
    const c = raw.split(raw.includes('\t') ? '\t' : ',').map((x) => x.trim());
    if (c.length < 4 || !c[2]) return;
    const qty = num(c[3]);
    if (!(qty > 0)) return; // dòng tiêu đề / dòng sai bỏ qua
    const price = num(c[4]);
    out.push({ name: c[0] ?? '', phone: c[1] ?? '', sku: c[2]!, qty, ...(price >= 0 ? { unitPrice: price } : {}), ...(c[5] ? { partnerCode: c[5] } : {}), row: i + 1 });
  });
  return out;
}

/** Gom dòng dán thành đơn: cùng SĐT (hoặc tên khi trống SĐT) = một đơn. */
export function groupPaste(rows: ReturnType<typeof parsePaste>, branchCode: string, orderDate: string) {
  const by = new Map<string, ReturnType<typeof parsePaste>>();
  for (const r of rows) {
    const k = r.phone.replace(/\D+/g, '') || r.name;
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  return [...by.values()].map((rs) => ({
    orderDate, branchCode, source: 'livestream' as const,
    customer: { name: rs[0]!.name, phone: rs[0]!.phone }, ...(rs[0]!.partnerCode ? { partner: { code: rs[0]!.partnerCode } } : {}),
    lines: rs.map((r, i) => ({ lineKey: `L${i + 1}`, sku: r.sku, qty: r.qty, ...(r.unitPrice !== undefined ? { unitPrice: r.unitPrice } : {}) })),
  }));
}

/** In báo giá (đơn nháp có hạn) ra cửa sổ in của trình duyệt. */
export function printQuote(o: Order) {
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
  const who = o.partner ? `${o.partner.code} — ${o.partner.name}` : `${o.customer?.name ?? ''} ${o.customer?.phone ?? ''}`;
  const rows = o.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.sku)}</td><td>${esc(l.name)}</td><td>${esc(l.unit)}</td><td class="n">${vnd(l.qty)}</td>`
    + `<td class="n">${vnd(l.unitPrice)}</td><td class="n">${vnd(l.discount)}</td><td class="n">${vnd(l.amountBeforeTax + l.taxAmount)}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Báo giá ${esc(o.orderNo)}</title><style>
    body{font-family:Arial,sans-serif;font-size:13px;margin:24px}h1{font-size:20px;text-align:center;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:12px}
    td,th{border:1px solid #999;padding:4px 6px}.n{text-align:right}.muted{color:#555;text-align:center}</style></head><body>
    <h1>BÁO GIÁ / ĐƠN ĐẶT HÀNG</h1><div class="muted">Số ${esc(o.orderNo)} · ngày ${esc(o.orderDate)}${o.validUntil ? ` · hiệu lực đến hết ${esc(o.validUntil)}` : ''}</div>
    <p>Khách hàng: <b>${esc(who)}</b><br/>Cửa hàng: ${esc(o.branchCode)}${o.note ? `<br/>Ghi chú: ${esc(o.note)}` : ''}${shipText(o, esc)}</p>
    <table><thead><tr><th>#</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>Chiết khấu</th><th>Thành tiền</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td colspan="7" class="n"><b>Tổng cộng</b></td><td class="n"><b>${vnd(o.totals.total)}</b></td></tr></tfoot></table>
    <script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

/** Thông tin giao trên phiếu in (NT-BH-032 §3 dòng 1). */
function shipText(o: Order, esc: (s: string) => string) {
  const s = o.shipping;
  if (!s) return '';
  const carrier = s.carrier ? (s.carrier === SELF_CARRIER ? 'Tự giao' : s.carrier) : '';
  return `<br/>Giao cho: ${esc([s.receiver, s.phone].filter(Boolean).join(' · '))}${s.address ? ` — ${esc(s.address)}` : ''}`
    + `<br/>Hãng: ${esc(carrier)}${s.trackingNo ? ` · mã vận đơn ${esc(s.trackingNo)}` : ''} · phí ship ${vnd(s.fee)} · COD ${vnd(s.cod)}`;
}
