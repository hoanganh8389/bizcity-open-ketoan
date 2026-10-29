/**
 * Gọi API tồn max / chuyển hàng shop / công thức đặt hàng (/api/v1/stock/*, docs/nghiep-vu/09-ton-max-dat-hang.md mục B3).
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { FormulaConfig, MaxRequestItem, MaxRequestKind, MaxRequestStatus, PLine, TransferMode } from '@ketoan/contracts/mua-hang';

const S = '/api/v1/stock';

export interface WarehouseInfo { code: string; name: string; isDefault: boolean; isActive: boolean; isPromo: boolean }
export interface BranchNode { id: string; code: string; name: string; level: '' | 'branch' | 'shop'; parentCode: string | null; isActive: boolean; warehouses: WarehouseInfo[] }
export interface LevelRow { branchCode: string; warehouseCode: string; sku: string; max: number; min: number; source: string; note: string; updatedBy: string; updatedAt: string }
export interface LevelInput { branchCode: string; warehouseCode?: string; sku: string; max: number; min?: number; note?: string; remove?: boolean }
export interface SkuSetting { sku: string; windowDays: number | null; coverDays: number | null; transferMode: TransferMode; note: string }
export interface MaxBoardRow {
  branchCode: string; branchName: string; warehouseCode: string; sku: string; name: string; baseUnit: string; pack?: number; packUnit?: string;
  ton: number; avgPerDay: number; windowDays: number; coverDays: number; suggested: number; max: number; min: number; hasLevel: boolean; transferMode: TransferMode; shopMaxSum?: number;
}
export interface MaxBoard { rows: MaxBoardRow[]; parent: { code: string; name: string }; shops: { code: string; name: string; warehouse?: string }[]; warehouses: WarehouseInfo[]; formula: FormulaConfig; asOf: string; warehouseCode: string; mainWarehouse: boolean }
export interface AnalysisRow {
  sku: string; name: string; barcode: string; brandCode: string; brandName: string; partnerCode: string; partnerName: string; taxCode: string;
  baseUnit: string; pack?: number; packUnit?: string; price: number | null; priceIncludesVat: boolean; promo: string;
  need: number; parts: { key: string; label: string; signed: number }[]; options: number[]; suggest: number;
  maxKho: number; minKho: number; tonKho: number; diDuongKho: number; diDuongShop: number; maxShop: number; tonShop: number; banShop: number; banThangTruoc: number; dangDat: number;
  partnerSource: 'lan_nhap' | 'bang_gia' | ''; nccCount: number;
  shopsBelowMax: number; shopsWithMax: number; nccNote: string; nccSku: string; nccName: string; orders: { docNo: string; partnerCode: string; date: string; remaining: number; sku: string }[];
  /** Họ mã: chi tiết mã cha + mã con (số của dòng đã cộng dồn cả họ). Trống = mã đơn lẻ. */
  members: { sku: string; name: string; kind: string; tonKho: number; tonShop: number; diDuong: number; dangDat: number; banShop: number; banThangTruoc: number; maxKho: number; maxShop: number }[];
}
export interface OrderAnalysis { rows: AnalysisRow[]; formula: FormulaConfig; parent: { code: string; name: string }; shops: number; asOf: string }
export interface TransferSuggestLine {
  shopCode: string; shopName: string; toWarehouse: string; sku: string; name: string; baseUnit: string; pack?: number; packUnit?: string; mode: TransferMode;
  max: number; ton: number; diDuong: number; reserved: number; gap: number; want: number; qty: number; short: number; khoTon: number;
}
export interface TransferSuggest { lines: TransferSuggestLine[]; fromWarehouse: string; parent: { code: string; name: string }; warehouses: WarehouseInfo[]; asOf: string; threshold: number }
export interface TransferRequest {
  id: string; code: string; fromBranch: string; fromName: string; fromWarehouse: string; toBranch: string; toName: string; toWarehouse: string; status: 'open' | 'done' | 'cancelled'; note: string;
  lines: { sku: string; name: string; unit: string; qty: number; pack?: number; packUnit?: string; note?: string }[]; lineCount: number; qty: number; createdBy: string; createdAt: string; doneBy: string; doneAt: string | null;
}
export interface MaxRequest {
  id: string; code: string; kind: MaxRequestKind; branchCode: string; branchName: string; parentCode: string; status: MaxRequestStatus; title: string; note: string; source: string;
  items: (MaxRequestItem & { applied?: boolean })[]; itemCount: number; unlinked: number; pendingApply: number; createdBy: string; approvedBy: string; approvedAt: string | null; createdAt: string; updatedAt: string;
}
export interface MaxRequestInput { kind: MaxRequestKind; branchCode: string; title?: string; note?: string; items: MaxRequestItem[]; submit?: boolean }

const csv = (a?: string[]) => (a?.length ? a.join(',') : undefined);
export const stockApi = {
  hierarchy: () => api.get<{ branches: BranchNode[] }>(`${S}/hierarchy`),
  saveHierarchy: (items: { code: string; level: BranchNode['level']; parentCode?: string | null }[]) => api.put<{ saved: number }>(`${S}/hierarchy`, { items }),
  autoArrange: (overwrite = false) => api.post<{ saved: number }>(`${S}/hierarchy/auto`, { overwrite }),
  levels: (f: { branchCodes?: string[]; skus?: string[] }) => api.get<LevelRow[]>(`${S}/levels`, { branchCodes: csv(f.branchCodes), skus: csv(f.skus) }),
  saveLevels: (items: LevelInput[], source: 'manual' | 'import' | 'suggest' = 'manual') => api.put<{ saved: number; removed: number }>(`${S}/levels`, { items, source }),
  board: (f: { parentCode: string; branchCode?: string; warehouseCode?: string; sku?: string }) => api.get<MaxBoard>(`${S}/max-board`, f),
  skuSettings: (skus?: string[]) => api.get<SkuSetting[]>(`${S}/sku-settings`, { skus: csv(skus) }),
  saveSkuSettings: (items: (Partial<SkuSetting> & { sku: string; remove?: boolean })[]) => api.put<{ saved: number }>(`${S}/sku-settings`, { items }),
  formula: (code: string) => api.get<{ config: FormulaConfig; saved: boolean; updatedBy: string; updatedAt: string | null }>(`${S}/formulas/${encodeURIComponent(code)}`),
  saveFormula: (code: string, config: FormulaConfig) => api.put<{ config: FormulaConfig; saved: boolean; updatedBy: string; updatedAt: string | null }>(`${S}/formulas/${encodeURIComponent(code)}`, config),
  analysis: (branchCode: string, sku?: string) => api.get<OrderAnalysis>(`${S}/order-analysis`, { branchCode, sku }),
  transferSuggest: (branchCode: string, fromWarehouse?: string) => api.get<TransferSuggest>(`${S}/transfer-suggest`, { branchCode, fromWarehouse }),
  transferRequests: (f: { from?: string; to?: string; status?: string; branchCode?: string }) => api.get<TransferRequest[]>(`${S}/transfer-requests`, f),
  createTransfers: (body: { fromBranch: string; fromWarehouse?: string; note?: string; shops: { toBranch: string; toWarehouse?: string; lines: TransferRequest['lines'] }[] }) => api.post<{ codes: string[] }>(`${S}/transfer-requests`, body),
  transferStatus: (id: string, action: 'done' | 'cancel' | 'reopen') => api.post<{ code: string }>(`${S}/transfer-requests/${id}/${action}`),
  maxRequests: (f: { from?: string; to?: string; status?: string; branchCode?: string; kind?: string }) => api.get<MaxRequest[]>(`${S}/max-requests`, f),
  maxRequest: (id: string) => api.get<MaxRequest>(`${S}/max-requests/${id}`),
  maxSuggest: (branchCode: string) => api.get<(MaxRequestItem & { ton: number; shopMaxSum?: number })[]>(`${S}/max-requests/suggest`, { branchCode }),
  saveMaxRequest: (body: MaxRequestInput, id?: string) => (id ? api.put<MaxRequest>(`${S}/max-requests/${id}`, body) : api.post<MaxRequest>(`${S}/max-requests`, body)),
  approveMaxRequest: (id: string) => api.post<MaxRequest>(`${S}/max-requests/${id}/approve`),
  cancelMaxRequest: (id: string) => api.post<MaxRequest>(`${S}/max-requests/${id}/cancel`),
};

/** Phân tích đặt hàng của chi nhánh cha chứa chi nhánh / shop này (map mã → dòng) — gợi ý SL ở các hộp lập đơn. */
export function useNeedOf(branchCode: string | undefined, enabled = true) {
  const h = useHierarchy();
  const b = h.data?.branches.find((x) => x.code === branchCode);
  const parent = b?.level === 'branch' ? b.code : b?.level === 'shop' ? b.parentCode ?? '' : '';
  const q = useQuery({ queryKey: ['ton-max', 'analysis', parent], enabled: enabled && Boolean(parent), queryFn: () => stockApi.analysis(parent), staleTime: 60_000 });
  return { parent, rows: new Map((q.data?.rows ?? []).map((r) => [r.sku, r])), loading: q.isLoading };
}

/** Cây chi nhánh (mọi màn tồn max dùng chung). */
export function useHierarchy() {
  return useQuery({ queryKey: ['ton-max', 'hierarchy'], queryFn: stockApi.hierarchy, staleTime: 60_000 });
}

const KEY = 'tm-parent';
/** Chi nhánh cha đang làm việc — nhớ cho lần sau (chỉ là tiện ích). */
export const lastParent = {
  get: () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } },
  set: (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* trình duyệt chặn lưu */ } },
};

export const qtyFmt = (n: number | null | undefined) => (n === null || n === undefined ? '' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 }));

/** Một mã trong họ mã / dòng đơn — đủ thông tin như dòng phân tích: tồn kho, tồn shop, max, đi đường, đang đặt, bán. */
export type StockFacts = { tonKho?: number; tonShop?: number; maxKho?: number; maxShop?: number; diDuong?: number; dangDat?: number; banShop?: number; banThangTruoc?: number };
export function factsText(m: StockFacts, banDays = 7): string {
  const q = (n?: number) => qtyFmt(n ?? 0) || '0';
  return [`kho ${q(m.tonKho)}`, `shop ${q(m.tonShop)}`, `max kho ${q(m.maxKho)}`, `max shop ${q(m.maxShop)}`, `đi đường ${q(m.diDuong)}`, `chưa về ${q(m.dangDat)}`, `bán ${banDays} ngày ${q(m.banShop)}`, `tháng trước ${q(m.banThangTruoc)}`].join(' · ');
}

/**
 * Chụp số liệu tồn lúc lập / lưu đơn đặt cho một mã (như thuế: lưu theo lúc đó, sau này mở lại vẫn đúng lúc đặt): mã cha → số cả họ
 * + chi tiết từng mã con; mã con (đuôi Z / Q / M…) → số riêng của mã đó. Không có trong phân tích → undefined.
 */
/**
 * Số liệu tồn của một mã để chụp vào dòng đơn đặt. ownDocNo = số đơn đang lập: phần "chưa nhập kho" của CHÍNH đơn này không tính
 * (đơn đã lưu thì phân tích đặt hàng đã cộng nó vào "SL mua chưa nhập kho") — Cần nhập trả lại đúng như lúc chưa có đơn.
 */
export function stockSnapshot(rows: Map<string, AnalysisRow>, sku: string, ownDocNo?: string): Pick<PLine, 'stockInfo' | 'family'> | undefined {
  const mine = (r: AnalysisRow, s?: string) => (ownDocNo ? r.orders.filter((o) => o.docNo === ownDocNo && (!s || o.sku === s)).reduce((t, o) => t + o.remaining, 0) : 0);
  const r = rows.get(sku);
  if (r) {
    const own = mine(r);
    const part = r.parts.find((p) => p.key === 'dangDat');
    // Thành phần "chưa nhập kho" trong công thức = dấu × hệ số × dangDat → bỏ phần của đơn này thì bù lại đúng tỉ lệ.
    const need = own && part && r.dangDat ? Math.round((r.parts.reduce((t, p) => t + p.signed, 0) - (part.signed * own) / r.dangDat) * 1000) / 1000 : r.need;
    return {
      stockInfo: { need, tonKho: r.tonKho, dangDat: r.dangDat - own, banThangTruoc: r.banThangTruoc, banShop: r.banShop, maxKho: r.maxKho, diDuong: r.diDuongKho + r.diDuongShop, maxShop: r.maxShop, tonShop: r.tonShop },
      family: (r.members ?? []).length ? r.members.map((m) => ({ sku: m.sku, kind: m.kind, tonKho: m.tonKho, tonShop: m.tonShop, banShop: m.banShop, dangDat: m.dangDat - mine(r, m.sku), maxKho: m.maxKho, maxShop: m.maxShop, diDuong: m.diDuong, banThangTruoc: m.banThangTruoc })) : undefined,
    };
  }
  for (const x of rows.values()) {
    const m = (x.members ?? []).find((y) => y.sku === sku);
    if (m) return { stockInfo: { tonKho: m.tonKho, tonShop: m.tonShop, maxKho: m.maxKho, maxShop: m.maxShop, diDuong: m.diDuong, dangDat: m.dangDat - mine(x, m.sku), banShop: m.banShop, banThangTruoc: m.banThangTruoc } };
  }
  return undefined;
}
export const num = (s: string) => { const v = Number(String(s).replace(/\s/g, '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
