// [2026-11-10 08:30 PM Nguyễn Văn Thủy] PHASE-026 — phiếu chuyển kho KHO01 chạy API thật /api/v1/kho/transfers (đóng góp)
/** Khuôn dữ liệu + gọi API phiếu chuyển kho (KHO01) — máy chủ: apps/api/src/phan-he/kho/phieu-chuyen-kho.ts. */
import { api } from '@/lib/api';
import type { TradeDoc } from '@/lib/tradeDocs';

export interface CkLine {
  lineKey: string;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  /** Số thực nhận; trống = nhận đủ. */
  receivedQty?: number;
  lotNo?: string;
  expDate?: string;
  note?: string;
  /** Chỉ ở giao diện: lô do phần mềm gợi ý (đổi số lượng thì gợi ý lại); gõ tay thì thôi. */
  lotAuto?: boolean;
}
export type CkStatus = 'shipped' | 'received' | 'rejected' | 'cancelled';
export interface CkDoc {
  id: string;
  docNo: string;
  docDate: string;
  fromBranchCode: string;
  fromWarehouse: string;
  toBranchCode: string;
  toWarehouse: string;
  reasonCode?: string;
  note: string;
  status: CkStatus;
  lines: CkLine[];
  receivedDate?: string;
  receivedBy?: string;
  receivedNote?: string;
  outDocKey?: string;
  inDocKey?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  totalQty: number;
  totalReceived: number;
  short: boolean;
  outLots?: Record<string, { lotNo: string; expDate: string | null; qty: number }[]>;
  ledger?: { out: { status: string; version: number } | null; in: { status: string; version: number } | null };
}
export interface CkInput {
  docNo: string; docDate: string; fromBranchCode: string; fromWarehouse: string; toBranchCode: string; toWarehouse: string;
  reasonCode?: string; note: string; lines: CkLine[]; receiveNow?: boolean;
}

export const STATUS_TEXT: Record<CkStatus, string> = { shipped: 'Đã xuất, chờ nhận', received: 'Đã nhận', rejected: 'Bên nhận từ chối', cancelled: 'Đã huỷ' };
export const statusText = (d: Pick<CkDoc, 'status' | 'short'>) => (d.status === 'received' && d.short ? 'Nhận thiếu' : STATUS_TEXT[d.status] ?? d.status);
export const statusClass = (d: Pick<CkDoc, 'status' | 'short'>) => (d.status === 'shipped' ? 'badge-warn' : d.status === 'received' ? (d.short ? 'badge-warn' : 'badge-ok') : 'badge-bad');

const strip = (l: CkLine) => ({ lineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, receivedQty: l.receivedQty, lotNo: l.lotNo || undefined, expDate: l.expDate || undefined, note: l.note || undefined });
const body = (d: CkInput) => ({ ...d, reasonCode: d.reasonCode || undefined, lines: d.lines.map(strip) });

export const ckApi = {
  list: (q: Record<string, string>) => api.get<CkDoc[]>('/api/v1/kho/transfers', q),
  get: (id: string) => api.get<CkDoc>(`/api/v1/kho/transfers/${id}`),
  create: (d: CkInput) => api.post<CkDoc>('/api/v1/kho/transfers', body(d)),
  update: (id: string, d: CkInput) => api.put<CkDoc>(`/api/v1/kho/transfers/${id}`, body(d)),
  receive: (id: string, b: { receivedDate: string; lines: { lineKey: string; receivedQty: number }[]; note: string }) => api.post<CkDoc>(`/api/v1/kho/transfers/${id}/receive`, b),
  unreceive: (id: string) => api.post<CkDoc>(`/api/v1/kho/transfers/${id}/unreceive`, {}),
  reject: (id: string, reason: string) => api.post<CkDoc>(`/api/v1/kho/transfers/${id}/reject`, { reason }),
  cancel: (id: string, reason: string) => api.post<CkDoc>(`/api/v1/kho/transfers/${id}/cancel`, { reason }),
  stock: (q: { branchCode: string; warehouse?: string; date: string; skus: string[]; exceptId?: string }) =>
    api.get<{ warehouse: string; stock: Record<string, number> }>('/api/v1/kho/transfers/stock', { branchCode: q.branchCode, warehouse: q.warehouse ?? '', date: q.date, skus: q.skus.join(','), ...(q.exceptId ? { exceptId: q.exceptId } : {}) }),
  suggest: (q: { branchCode: string; warehouse: string; date: string; items: { sku: string; qty: number }[]; except?: string[] }) =>
    api.get<{ sku: string; qty: number; lots: { lotNo: string; expDate: string | null; purchaseName: string; warehouse: string; available: number; take: number }[]; shortage: number }[]>('/api/v1/lots/suggest', {
      branchCode: q.branchCode, warehouse: q.warehouse, date: q.date, items: q.items.map((x) => `${x.sku}*${x.qty}`).join(','), ...(q.except?.length ? { except: q.except.join(',') } : {}),
    }),
};

/** Đổi sang khuôn phiếu hàng để dùng chung mẫu in (Phiếu chuyển kho A4 / A5, Phiếu xuất kho kiêm vận chuyển nội bộ). */
export const toPrintDoc = (d: CkDoc): TradeDoc => ({
  id: d.id, docType: 'transfer', status: 'approved', docNo: d.docNo, docDate: d.docDate, branchCode: d.fromBranchCode, toBranchCode: d.toBranchCode,
  warehouseCode: d.fromWarehouse, toWarehouseCode: d.toWarehouse, note: d.note,
  lines: d.lines.map((l) => ({ lineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, amountBeforeTax: 0, lotNo: l.lotNo, expDate: l.expDate, receivedQty: d.status === 'received' ? l.receivedQty ?? l.qty : undefined })),
  totals: { beforeTax: 0, tax: 0, total: 0 },
});

let seq = 0;
export const newLineKey = () => `L${Date.now().toString(36)}${(seq++).toString(36)}`;
export const viDate = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '');
export const qtyText = (n?: number | null) => (n === undefined || n === null ? '' : n.toLocaleString('vi-VN', { maximumFractionDigits: 4 }));
