/**
 * PHIẾU HÀNG HOÁ nhập ngay trong phần mềm: bán hàng, hàng bán trả lại, mua hàng, trả hàng nhà cung cấp, chuyển kho.
 *
 * Khuôn dữ liệu theo đúng hợp đồng chứng từ ở docs/api (02-ban-hang, 03-tra-hang-ban, 04-nhap-mua, 05-tra-hang-ncc,
 * 06-chuyen-kho) + vài trường của màn nhập (id, trạng thái nháp / đã duyệt, ghi chú).
 *
 * NGUỒN DỮ LIỆU — mỗi loại phiếu chọn một trong hai (màn API → Nguồn dữ liệu màn hình, nhớ theo máy):
 *   mock  dữ liệu giả ở trình duyệt (lib/mockStore.ts), nạp từ tệp JSON mẫu của màn — dùng khi API chưa xong;
 *   api   API thật — endpoint ĐỀ XUẤT dưới đây (docs/api/13-phieu-nhap-tay.md), bạn phụ trách API viết rồi bật lên.
 * Màn hình chỉ gọi tradeApi(kind, seed): đổi nguồn không phải sửa màn.
 */
import { api } from './api';
import { createMockStore, type MockPage } from './mockStore';

export type TradeKind = 'sale' | 'sale_return' | 'purchase' | 'purchase_return' | 'transfer';
export type TradeStatus = 'draft' | 'approved';

export interface TradeLine {
  lineKey: string;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice?: number;
  discount?: number;
  /** Tiền hàng trước thuế, đã trừ chiết khấu (chuyển kho: 0). */
  amountBeforeTax: number;
  taxCode?: string;
  taxAmount?: number;
  isGift?: boolean;
}
export interface TradePayment { methodCode: string; amount: number; reference?: string }
export interface TradeDoc {
  id: string;
  docType: TradeKind;
  status: TradeStatus;
  docNo: string;
  docDate: string;
  branchCode: string;
  /** Chuyển kho: chi nhánh / kho nhận. */
  toBranchCode?: string;
  /** Kho của phiếu (chọn ở đầu phiếu, mọi dòng đi theo): bán = kho xuất hàng, trả lại = kho nhận hàng trả, mua = kho nhập,
   *  chuyển kho = kho XUẤT. Trống = kho mặc định của chi nhánh. API ghi xuống từng dòng (line.warehouseCode). */
  warehouseCode?: string;
  /** Chuyển kho: kho NHẬN của chi nhánh nhận (line.toWarehouseCode). Cùng chi nhánh thì bắt buộc khác kho xuất. */
  toWarehouseCode?: string;
  partner?: { code: string; name: string; taxCode?: string };
  invoice?: { no: string; serial?: string; date: string };
  /** Trả lại: số phiếu gốc (tham khảo). */
  originalDocNo?: string;
  dueDate?: string;
  lines: TradeLine[];
  payments?: TradePayment[];
  totals: { beforeTax: number; tax: number; total: number };
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface TradeQuery { from?: string; to?: string; branchCodes?: string; status?: string; search?: string; page?: number; pageSize?: number }

/** Thông tin từng loại phiếu (nhãn, đầu số, đối tượng, loại thuế). */
export const KIND_INFO: Record<TradeKind, {
  label: string; noPrefix: string; partner: 'customer' | 'supplier' | null; partnerLabel: string; taxDir: 'output' | 'input' | null;
  hasInvoice: boolean; hasPayments: boolean; hasOriginal: boolean; isTransfer: boolean;
}> = {
  sale: { label: 'Phiếu bán hàng', noPrefix: 'BH', partner: 'customer', partnerLabel: 'Khách hàng', taxDir: 'output', hasInvoice: true, hasPayments: true, hasOriginal: false, isTransfer: false },
  sale_return: { label: 'Hàng bán trả lại', noPrefix: 'TL', partner: 'customer', partnerLabel: 'Khách hàng', taxDir: 'output', hasInvoice: true, hasPayments: true, hasOriginal: true, isTransfer: false },
  purchase: { label: 'Phiếu mua hàng', noPrefix: 'MH', partner: 'supplier', partnerLabel: 'Nhà cung cấp', taxDir: 'input', hasInvoice: true, hasPayments: false, hasOriginal: false, isTransfer: false },
  purchase_return: { label: 'Trả hàng nhà cung cấp', noPrefix: 'TN', partner: 'supplier', partnerLabel: 'Nhà cung cấp', taxDir: 'input', hasInvoice: true, hasPayments: false, hasOriginal: true, isTransfer: false },
  transfer: { label: 'Phiếu chuyển kho', noPrefix: 'CK', partner: null, partnerLabel: '', taxDir: null, hasInvoice: false, hasPayments: false, hasOriginal: false, isTransfer: true },
};
export const TRADE_KINDS = Object.keys(KIND_INFO) as TradeKind[];

/** Thuế suất theo mã thuế (đầu ra R.., đầu vào V..). */
export const TAX_RATES: Record<string, number> = { KCT: 0, R00: 0, R05: 5, R08: 8, R10: 10, V00: 0, V05: 5, V08: 8, V10: 10, KKKN: 0 };
export const TAX_OPTIONS = {
  output: [['R08', '8%'], ['R10', '10%'], ['R05', '5%'], ['R00', '0%'], ['KCT', 'KCT']],
  input: [['V08', '8%'], ['V10', '10%'], ['V05', '5%'], ['V00', '0%'], ['KKKN', 'Không kê khai']],
} as const;

/** Tính lại tiền dòng + tổng phiếu (làm tròn đồng như hoá đơn). */
export function recompute(doc: TradeDoc): TradeDoc {
  const transfer = KIND_INFO[doc.docType].isTransfer;
  const lines = doc.lines.map((l) => {
    if (transfer) return { ...l, amountBeforeTax: 0, taxAmount: 0 };
    const before = l.isGift ? 0 : Math.round((l.qty || 0) * (l.unitPrice || 0) - (l.discount || 0));
    return { ...l, amountBeforeTax: before, taxAmount: Math.round((before * (TAX_RATES[l.taxCode ?? ''] ?? 0)) / 100) };
  });
  const beforeTax = lines.reduce((s, l) => s + l.amountBeforeTax, 0);
  const tax = lines.reduce((s, l) => s + (l.taxAmount ?? 0), 0);
  return { ...doc, lines, totals: { beforeTax, tax, total: beforeTax + tax } };
}

/* ------------------------------------------------------------------ nguồn dữ liệu */

export type DataSource = 'mock' | 'api';
const SRC_KEY = 'ketoan.datasource.';
export function getSource(kind: TradeKind): DataSource {
  try { return localStorage.getItem(SRC_KEY + kind) === 'api' ? 'api' : 'mock'; } catch { return 'mock'; }
}
export function setSource(kind: TradeKind, s: DataSource) {
  try { localStorage.setItem(SRC_KEY + kind, s); } catch { /* bỏ qua */ }
}

/** Endpoint ĐỀ XUẤT cho API thật (một tài nguyên chung, lọc theo docType) — xem docs/api/13-phieu-nhap-tay.md. */
export const TRADE_ENDPOINT = '/api/v1/trade-documents';

export interface TradeApi {
  source: DataSource;
  list(q: TradeQuery): Promise<MockPage<TradeDoc>>;
  get(id: string): Promise<TradeDoc>;
  save(doc: TradeDoc): Promise<TradeDoc>;
  remove(id: string): Promise<void>;
  setStatus(id: string, status: TradeStatus): Promise<TradeDoc>;
  resetMock(): void;
  mockCount(): number;
}

/** Ngày trong JSON mẫu viết tương đối: "@-2" = 2 ngày trước hôm nay, "@0" = hôm nay → mẫu luôn là phiếu gần đây. */
const relDate = (d: string | undefined) => {
  const m = /^@(-?\d+)$/.exec(d ?? '');
  if (!m) return d;
  const t = new Date(Date.now() + 7 * 3600_000 + Number(m[1]) * 86_400_000);
  return t.toISOString().slice(0, 10);
};
function storeOf(kind: TradeKind, seed: TradeDoc[]) {
  const fixed = seed.map((r) => ({ ...r, docDate: relDate(r.docDate)!, dueDate: relDate(r.dueDate), invoice: r.invoice ? { ...r.invoice, date: relDate(r.invoice.date)! } : undefined }));
  return createMockStore<TradeDoc>(`trade.${kind}`, fixed);
}

/** Loại phiếu này đã có dữ liệu giả lưu ở máy chưa (chưa = đang hiện mẫu ban đầu). */
export function hasMockChanges(kind: TradeKind): boolean {
  try { return localStorage.getItem(`ketoan.mock.trade.${kind}`) !== null; } catch { return false; }
}

/** Số phiếu kế tiếp (dữ liệu giả): <đầu số><năm 2 số><số thứ tự 5 chữ số>. */
function nextNo(kind: TradeKind, rows: TradeDoc[], date: string) {
  const p = `${KIND_INFO[kind].noPrefix}${date.slice(2, 4)}`;
  const max = rows.filter((r) => r.docNo.startsWith(p)).map((r) => Number(r.docNo.slice(p.length)) || 0).reduce((a, b) => Math.max(a, b), 0);
  return p + String(max + 1).padStart(5, '0');
}

export function tradeApi(kind: TradeKind, seed: TradeDoc[] = []): TradeApi {
  const source = getSource(kind);
  const store = storeOf(kind, seed);
  if (source === 'api') {
    return {
      source,
      list: (q) => api.getPage<TradeDoc[]>(TRADE_ENDPOINT, { ...q, docType: kind }).then((r) => ({ data: r.data, meta: { total: Number(r.meta?.total ?? r.data.length), page: q.page ?? 1, pageSize: q.pageSize ?? r.data.length } })),
      get: (id) => api.get<TradeDoc>(`${TRADE_ENDPOINT}/${encodeURIComponent(id)}`),
      save: (doc) => (doc.id ? api.put<TradeDoc>(`${TRADE_ENDPOINT}/${encodeURIComponent(doc.id)}`, doc) : api.post<TradeDoc>(TRADE_ENDPOINT, { ...doc, docType: kind })),
      remove: (id) => api.delete<void>(`${TRADE_ENDPOINT}/${encodeURIComponent(id)}`),
      setStatus: (id, status) => api.post<TradeDoc>(`${TRADE_ENDPOINT}/${encodeURIComponent(id)}/${status === 'approved' ? 'approve' : 'unapprove'}`),
      resetMock: () => store.reset(),
      mockCount: () => store.count(),
    };
  }
  return {
    source,
    list: (q) => {
      const s = (q.search ?? '').trim().toLowerCase();
      const branches = q.branchCodes ? q.branchCodes.split(',') : [];
      return store.list(q, (r) => (!q.from || r.docDate >= q.from) && (!q.to || r.docDate <= q.to) && (!branches.length || branches.includes(r.branchCode))
        && (!q.status || r.status === q.status)
        && (!s || [r.docNo, r.partner?.name, r.partner?.code, r.invoice?.no, r.note].some((x) => (x ?? '').toLowerCase().includes(s))),
      (a, b) => (b.docDate.localeCompare(a.docDate) || b.docNo.localeCompare(a.docNo)));
    },
    get: (id) => store.get(id),
    async save(doc) {
      const now = new Date().toISOString();
      const full = recompute({ ...doc, docType: kind });
      if (full.id) {
        const cur = await store.get(full.id);
        if (cur.status === 'approved') throw new Error('Phiếu đã duyệt: bỏ duyệt rồi mới sửa được');
        return store.update(full.id, { ...full, updatedAt: now });
      }
      const all = (await store.list()).data;
      const { id: _id, ...rest } = full;
      return store.create({ ...rest, docNo: full.docNo || nextNo(kind, all, full.docDate), status: 'draft', createdAt: now, updatedAt: now });
    },
    async remove(id) {
      const cur = await store.get(id);
      if (cur.status === 'approved') throw new Error('Phiếu đã duyệt: bỏ duyệt rồi mới xoá được');
      return store.remove(id);
    },
    setStatus: (id, status) => store.update(id, { status, updatedAt: new Date().toISOString() }),
    resetMock: () => store.reset(),
    mockCount: () => store.count(),
  };
}

/** Phiếu trống của một loại. */
export function emptyDoc(kind: TradeKind, branchCode = '', today = new Date().toISOString().slice(0, 10)): TradeDoc {
  return {
    id: '', docType: kind, status: 'draft', docNo: '', docDate: today, branchCode,
    lines: [], payments: KIND_INFO[kind].hasPayments ? [] : undefined, totals: { beforeTax: 0, tax: 0, total: 0 }, note: '',
  };
}
