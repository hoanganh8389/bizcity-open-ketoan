/**
 * Đơn hàng WooCommerce (REST API v3) → hoá đơn bán theo khuôn IngestDocument.
 *   - Một đơn = một hoá đơn bán của chi nhánh cấu hình ở kết nối; docKey woo:<mã kết nối>:<id đơn>.
 *   - version = số giây của date_modified_gmt: đơn sửa bên cửa hàng thì lên phiên bản mới (chờ định khoản lại).
 *   - Dòng hàng: tiền trước thuế = line.total (đã trừ giảm giá), thuế = line.total_tax; phí giao hàng thành một dòng.
 *   - Đơn đã thanh toán (date_paid) thì có một khoản thu theo cổng thanh toán (methodMap; chưa khai thì lấy mã cổng IN HOA
 *     để kế toán thấy rõ "Hình thức thanh toán … chưa khai báo").
 *   - Đơn huỷ / hoàn tiền / thất bại không kéo về. Hoàn tiền một phần chưa hỗ trợ (lập phiếu kế toán).
 */
import type { Connection, IngestDocument } from '@ketoan/contracts';

interface WooLine { id: number; sku?: string; name?: string; product_id?: number; quantity?: number; total?: string; total_tax?: string; subtotal?: string }
interface WooOrder {
  id: number; number?: string; status: string; date_created?: string; date_modified_gmt?: string; date_paid?: string | null;
  customer_id?: number; billing?: { first_name?: string; last_name?: string; email?: string; phone?: string; company?: string; address_1?: string };
  payment_method?: string; payment_method_title?: string; total?: string; total_tax?: string;
  line_items?: WooLine[]; shipping_lines?: { id: number; method_title?: string; total?: string; total_tax?: string }[];
}

const KEEP = ['processing', 'completed', 'on-hold'];
const num = (v: unknown) => Math.round(Number(v ?? 0) || 0);

export function wooOrderToDocument(o: WooOrder, c: Connection): IngestDocument | null {
  if (!KEEP.includes(o.status)) return null;
  const b = o.billing ?? {};
  const name = [b.last_name, b.first_name].filter(Boolean).join(' ').trim() || b.company || 'Khách lẻ';
  const partnerCode = o.customer_id ? `WOO${o.customer_id}` : (b.phone || b.email || 'KHACHLE');
  const lines = (o.line_items ?? []).map((l) => ({
    lineKey: String(l.id), sku: l.sku || String(l.product_id ?? ''), name: l.name ?? '', unit: '', qty: Number(l.quantity ?? 0),
    unitPrice: 0, amountBeforeTax: num(l.total), discount: Math.max(0, num(l.subtotal) - num(l.total)), taxCode: c.taxCode || 'KCT', taxAmount: num(l.total_tax), isGift: false,
  }));
  for (const s of o.shipping_lines ?? []) {
    if (!num(s.total) && !num(s.total_tax)) continue;
    lines.push({ lineKey: `ship${s.id}`, sku: 'PHIVANCHUYEN', name: s.method_title || 'Phí vận chuyển', unit: '', qty: 1, unitPrice: 0, amountBeforeTax: num(s.total), discount: 0, taxCode: c.taxCode || 'KCT', taxAmount: num(s.total_tax), isGift: false });
  }
  const beforeTax = lines.reduce((s, l) => s + l.amountBeforeTax, 0);
  const tax = lines.reduce((s, l) => s + l.taxAmount, 0);
  const total = beforeTax + tax;
  const gateway = (o.payment_method ?? '').trim();
  const method = c.methodMap[gateway] || gateway.toUpperCase() || 'TM';
  const modified = o.date_modified_gmt ? Math.floor(new Date(`${o.date_modified_gmt}Z`).getTime() / 1000) : 1;
  return {
    docType: 'sale',
    docKey: `woo:${c.code}:${o.id}`,
    version: Math.max(1, modified),
    branchCode: c.branchCode,
    docNo: `WOO${o.number ?? o.id}`,
    docDate: (o.date_created ?? '').slice(0, 10),
    description: `Đơn hàng WooCommerce #${o.number ?? o.id}`,
    internalOnly: false,
    partner: { code: partnerCode, name, email: b.email || undefined, phone: b.phone || undefined, address: b.address_1 || undefined },
    sourceSystem: c.code,
    sourceRef: { type: 'woo_order', id: String(o.id), label: 'Đơn hàng WooCommerce', url: `${c.url.replace(/\/+$/, '')}/wp-admin/post.php?post=${o.id}&action=edit` },
    lines,
    payments: o.date_paid ? [{ methodCode: method, amount: total, reference: o.payment_method_title || undefined }] : [],
    totals: { beforeTax, tax, total },
  } as IngestDocument;
}

/** Đọc một trang đơn hàng (100 đơn) trong khoảng ngày tạo đơn. */
export async function fetchWooPage(c: Connection, from: string, to: string, page: number): Promise<{ orders: WooOrder[]; more: boolean }> {
  const u = new URL(`${c.url.replace(/\/+$/, '')}/wp-json/wc/v3/orders`);
  u.searchParams.set('after', `${from}T00:00:00`);
  u.searchParams.set('before', `${to}T23:59:59`);
  u.searchParams.set('per_page', '100');
  u.searchParams.set('page', String(page));
  u.searchParams.set('orderby', 'id');
  u.searchParams.set('order', 'asc');
  const auth = Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString('base64');
  const res = await fetch(u, { headers: { authorization: `Basic ${auth}`, accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`WooCommerce trả lỗi ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const orders = (await res.json()) as WooOrder[];
  const pages = Number(res.headers.get('x-wp-totalpages') ?? 1);
  return { orders, more: page < pages };
}
