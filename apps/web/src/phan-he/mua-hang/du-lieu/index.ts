/**
 * DỮ LIỆU PHÂN HỆ MUA HÀNG — gọi API thật (/api/v1/purchase/*, hợp đồng docs/api/14-mua-hang.md). Máy chủ lưu bảng
 * purchase_documents / purchase_policies, duyệt = ghi sổ thật, báo cáo đọc từ sổ. Bộ máy tính dùng chung
 * ('@ketoan/contracts/mua-hang') chạy cả ở đây để tổng tiền hiện ngay khi gõ; cảnh báo, hạn mức, giá mua do máy chủ trả.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Accounts, Check, CreditStatus, DocCalc, Entry, PDoc, Policy, PriceRow, ProductUnit, SupplierProduct } from '@ketoan/contracts/mua-hang';

export interface StoredDoc extends PDoc {
  revision: number;
  links: { docKey: string; docNo: string; eventId: string; role: string }[];
  checks?: (Check & { blocking: boolean })[];
  /** Vết chính sách chốt lúc duyệt (chính sách nào áp, ra bao nhiêu). */
  policyTrace?: { policy: string; kind: string; text: string; amount?: number }[];
  totals: { beforeTax: number; tax: number; total: number };
  /** Công nợ NCC (TK 331) phiếu đã ghi sổ sinh ra: phải trả / đã trả; NCC nợ lại mình (ứng trước, trả hàng…) / đã đối trừ. */
  debt?: { owed: number; owedPaid: number; advance: number; advanceUsed: number };
  dueDate?: string;
  isDemo: boolean;
  createdByName: string;
  approvedBy: string | null;
  approvedAt: string | null;
  updatedAt?: string;
  /** Người tạo / duyệt: mã tài khoản + nhãn "email đăng nhập (Họ tên)" (danh sách chứng từ). */
  createdBy?: string; createdAt?: string; approvedActor?: string; createdByLabel?: string; approvedByLabel?: string;
}
export interface Analysis {
  prices: SupplierProduct[];
  units: Record<string, ProductUnit[]>;
  calc: DocCalc; checks: Check[]; credit: CreditStatus[]; entries: Entry[]; blocking: Check[]; prepayment: number;
  refOrder?: StoredDoc; priceHistory: Record<string, (PriceRow & { discountPct?: number })[]>; accounts: Accounts; priceWarnPct?: number;
}
export interface LogRow { ts: string; event: string; docNo: string; user: string; data: Record<string, unknown> }
/** units: ĐVT của các mã trên đơn đặt (tỉ lệ về ĐVT nhỏ nhất). */
/** Phiếu nhập mua NGOÀI ĐƠN (không theo đơn đặt nào) — ngoại lệ được phép, lọc / rà soát riêng. */
export const nhapNgoaiDon = (d: { kind: string; refIds?: string[]; lines: { lineType: string }[] }) => d.kind === 'receipt' && !(d.refIds ?? []).length && d.lines.some((l) => l.lineType === 'buy');

export interface MhData { docs: StoredDoc[]; policies: Policy[]; units: Record<string, ProductUnit[]> }

export const P = '/api/v1/purchase';
/** Ngày hôm nay theo giờ máy (không theo UTC — trước 7 giờ sáng UTC còn là hôm qua). */
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const monthStart = () => `${today().slice(0, 8)}01`;
/** Thuế suất GTGT đầu vào hiển thị cho người dùng (mã thuế → nhãn). */
/** Thuế suất trên dòng phiếu mua: KCT = hàng không chịu thuế GTGT (V13K); KKKN = không kê khai (quà / hàng không hoá đơn). */
export const TAX_LABEL: Record<string, string> = { V00: '0%', V05: '5%', V08: '8%', V10: '10%', V13K: 'KCT (không chịu thuế)', KKKN: 'Không kê khai' };

/** Lựa chọn gần nhất của người dùng (chi nhánh, NCC, loại đơn giá) để phiếu mới điền sẵn; chỉ là tiện ích, mất cũng không sao. */
export interface LastUsed { branchCode?: string; partnerCode?: string; priceIncludesVat?: boolean }
export const lastUsed = {
  get(): LastUsed { try { return JSON.parse(localStorage.getItem('mh-last') ?? '{}') as LastUsed; } catch { return {}; } },
  set(p: LastUsed) { try { localStorage.setItem('mh-last', JSON.stringify({ ...lastUsed.get(), ...p })); } catch { /* trình duyệt chặn lưu */ } },
};

/** Nhãn hàng để gợi ý: danh mục nhãn + nhãn đã dùng ở chính sách. */
export function useBrands(policies: Policy[] = []) {
  const q = useQuery({ queryKey: ['item-classes', 'brand'], queryFn: () => api.get<{ code: string; name: string }[]>('/api/v1/item-classes/brand'), staleTime: 300_000 });
  const map = new Map((q.data ?? []).map((b) => [b.code, b.name]));
  for (const p of policies) if (p.scope.brandCode && !map.has(p.scope.brandCode)) map.set(p.scope.brandCode, p.scope.brandCode);
  return [...map].map(([code, name]) => ({ code, name }));
}
/**
 * Các nhãn NCC đang bán — suy từ mặt hàng NCC bán / đã nhập (nhãn khai ở danh mục mặt hàng, không khai riêng ở NCC).
 * Dùng gợi ý nhãn khi lập chính sách cho NCC và hiện ở hồ sơ NCC.
 */
export function useSupplierBrands(code: string | undefined) {
  const q = useQuery({ queryKey: ['mua-hang', 'ncc-brands', code], enabled: Boolean(code), staleTime: 60_000,
    queryFn: () => api.get<{ brandCode: string; name: string; skus: number }[]>(`${P}/suppliers/${encodeURIComponent(code!)}/brands`) });
  return q.data ?? [];
}
export const vnd = (n: number | undefined | null) => (n ? Math.round(n).toLocaleString('vi-VN') : '0');

export const KIND_LABEL: Record<PDoc['kind'], string> = {
  order: 'Đơn đặt hàng', receipt: 'Nhập mua', return: 'Trả hàng NCC', exchange: 'Đổi hàng NCC', gift_in: 'Nhận quà (không HĐ)', gift_out: 'Xuất quà tặng',
  cost: 'Chi phí mua hàng', rebate: 'Thưởng / CK cuối kỳ', prepayment: 'Ứng trước NCC', payment: 'Trả tiền NCC',
};
export const STATUS_LABEL: Record<PDoc['status'], string> = { draft: 'Nháp', pending_approval: 'Chờ duyệt', approved: 'Đã duyệt', cancelled: 'Đã huỷ' };
export const GOODS_KINDS: PDoc['kind'][] = ['order', 'receipt', 'return', 'exchange', 'gift_in', 'gift_out'];
export const GIFT_SOURCE: Record<string, string> = { ncc_program: 'NCC tặng theo chương trình', ncc_extra: 'NCC tặng ngoài hợp đồng', self_buy: 'TGS tự mua', promo_consumer: 'KM người tiêu dùng (kèm HĐ mua)' };

/** Chứng từ + chính sách (mọi màn dùng chung, nạp lại sau mỗi lần ghi). */
export function useMuaHang() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['mua-hang', 'all'],
    queryFn: async (): Promise<MhData> => {
      const [docs, policies] = await Promise.all([api.get<StoredDoc[]>(`${P}/documents`), api.get<Policy[]>(`${P}/policies`)]);
      // ĐVT của mọi mã trên đơn đặt: tiến độ đơn ↔ phiếu nhập so theo ĐVT nhỏ nhất (đặt Thùng, nhận Hộp vẫn trừ đúng).
      const skus = [...new Set(docs.filter((d) => d.kind === 'order' && d.status !== 'cancelled').flatMap((d) => d.lines.map((l) => l.sku)).filter(Boolean))];
      const units = skus.length ? await api.post<Record<string, ProductUnit[]>>(`${P}/units`, { skus }) : {};
      return { docs, policies, units };
    },
  });
  return { ...q, refresh: () => qc.invalidateQueries({ queryKey: ['mua-hang'] }) };
}

/** Tên chi nhánh đã tải (useNames ghi vào) — cho hàm thuần như câu tóm tắt chính sách (ruleText) hiện tên thay mã. */
export const tenChiNhanh = new Map<string, string>();

/** Tên đối tượng / chi nhánh để hiện trong bảng (danh mục thật). */
export function useNames() {
  // NCC là doanh nghiệp: tên / địa chỉ trên hoá đơn = khối công ty (chưa có thì tên / địa chỉ chung) — phiếu mua lấy đúng bộ này.
  const partners = useQuery({ queryKey: ['mua-hang', 'partners'], staleTime: 300_000, queryFn: async () => (await api.get<{ code: string; name: string; companyName?: string; taxCode?: string | null; address?: string | null; companyAddress?: string; phone?: string | null }[]>('/api/v1/partners', { pageSize: 5000, status: 'all' }))
    .map((p) => ({ ...p, name: p.companyName || p.name, address: p.companyAddress || p.address })) });
  const branches = useQuery({ queryKey: ['mua-hang', 'branches'], queryFn: () => api.get<{ code: string; name: string }[]>('/api/v1/branches'), staleTime: 300_000 });
  for (const b of branches.data ?? []) tenChiNhanh.set(b.code, b.name);
  return {
    partnerName: (c: string) => partners.data?.find((x) => x.code === c)?.name ?? c,
    partner: (c: string) => partners.data?.find((x) => x.code === c),
    branchName: (c: string) => branches.data?.find((x) => x.code === c)?.name ?? c,
    branches: branches.data ?? [],
  };
}

export const purchaseApi = {
  analyze: (d: PDoc) => api.post<Analysis>(`${P}/analyze`, d),
  get: (id: string) => api.get<{ doc: StoredDoc; analysis: Analysis }>(`${P}/documents/${id}`),
  save: (d: PDoc) => (d.id && !d.id.startsWith('new-') ? api.put<StoredDoc>(`${P}/documents/${d.id}`, d) : api.post<StoredDoc>(`${P}/documents`, { ...d, id: undefined })),
  submit: (id: string) => api.post<StoredDoc>(`${P}/documents/${id}/submit`),
  approve: (id: string) => api.post<StoredDoc>(`${P}/documents/${id}/approve`),
  override: (id: string, reason: string) => api.post<StoredDoc>(`${P}/documents/${id}/override`, { reason }),
  /** Rà soát phiếu nhập ngoài đơn đã duyệt. */
  reviewOutside: (id: string, note: string) => api.post<StoredDoc>(`${P}/documents/${id}/review-outside`, { note }),
  unapprove: (id: string) => api.post<StoredDoc>(`${P}/documents/${id}/unapprove`, {}),
  cancel: (id: string) => api.post<StoredDoc>(`${P}/documents/${id}/cancel`),
  deletePolicy: (id: string) => api.delete(`${P}/policies/${id}`),
  deleteSupplierProduct: (id: string) => api.delete(`${P}/supplier-products/${id}`),
  savePolicy: (p: Policy) => (p.id && !p.id.startsWith('new-') ? api.put<{ id: string }>(`${P}/policies/${p.id}`, p) : api.post<{ id: string }>(`${P}/policies`, p)),
  transferLimit: (id: string, b: { from: string; to: string; amount: number }) => api.post(`${P}/policies/${id}/transfer-limit`, b),
  seedDemo: (password: string, reset = false) => api.post<{ documents: number; errors: { docNo: string; error?: string }[]; skipped?: { docNo: string; error?: string }[]; report: { docNo: string; status: string; error?: string }[] }>(`${P}/demo/seed`, { password, reset }),
  demoWarehouses: (password: string) => api.post<{ created: string[]; branches: string[] }>(`${P}/demo/warehouses`, { password }),
  clearDemo: (password: string) => api.post<{ documents: number }>(`${P}/demo/clear`, { password }),
  suppliers: (scope: 'active' | 'all') => api.get<SupplierRow[]>(`${P}/suppliers`, { scope }),
  supplier: (code: string) => api.get<SupplierProfile>(`${P}/suppliers/${encodeURIComponent(code)}`),
  attachments: (ownerType: OwnerType, ownerId: string) => api.get<{ files: Attachment[]; kinds: Record<string, string> }>(`${P}/attachments`, { ownerType, ownerId }),
  addAttachment: (b: { ownerType: OwnerType; ownerId: string; kind: string; fileName: string; mime: string; dataBase64: string; note?: string }) => api.post<{ id: string }>(`${P}/attachments`, b),
  deleteAttachment: (id: string) => api.delete(`${P}/attachments/${id}`),
  lookupProducts: (skus: string[]) => api.post<{ sku: string; name: string; unit: string; taxInCode: string | null; brandCode: string | null }[]>(`${P}/products-lookup`, { skus }),
  /** Mặt hàng & giá mua của NCC (kèm ĐVT các mã): theo NCC (withGeneral = cả giá chung) hoặc theo mã. */
  supplierProducts: (q: { partnerCode?: string; sku?: string; withGeneral?: boolean; all?: boolean }) => api.get<{ rows: SupplierProduct[]; units: Record<string, ProductUnit[]> }>(`${P}/supplier-products`, q),
  /** Giá vốn theo ĐVT nhỏ nhất: bình quân tháng gần nhất + tạm tính theo tồn hiện tại. */
  productCost: (sku: string) => api.get<{ monthly: { period: string; unitCost: number } | null; current: { qty: number; value: number; unitCost: number } | null }>(`${P}/product-cost/${encodeURIComponent(sku)}`),
  units: (skus: string[]) => api.get<Record<string, ProductUnit[]>>(`${P}/units`, { skus: skus.join(',') }),
  saveSupplierProducts: (rows: Partial<SupplierProduct>[]) => api.post<{ added: number; updated: number }>(`${P}/supplier-products`, { rows }),
  history: (q: { docNo?: string; partnerCode?: string; event?: string }) => api.get<LogRow[]>(`${P}/logs`, q),
  openAttachment: (a: Attachment) => api.download(`${P}/attachments/${a.id}/file`, {}, a.fileName),
  attachmentBlob: (a: Attachment) => api.blob(`${P}/attachments/${a.id}/file`),
};

export type OwnerType = 'partner' | 'document' | 'policy' | 'invoice';
export interface Attachment { id: string; kind: string; kindLabel: string; fileName: string; mime: string; size: number; note: string; uploadedBy: string; createdAt: string }
export interface SupplierRow {
  createdBy?: string; createdAt?: string | null;
  code: string; name: string; taxCode: string | null; groupCode: string | null; phone: string | null; address: string | null; isActive: boolean;
  debt: number; overdue: number; dueSoon: number; /** Ứng / trả trước NCC chưa đối trừ (đã trừ trong debt). */ advance: number; creditLimit: number | null; creditUsed: number; creditPolicy?: string;
  term: string; policies: number; items: number; contractTo?: string; contractNo?: string; lastReceipt?: string; monthPurchase: number; documents: number; attachments: number; openOrders: number;
}
export interface SupplierProfile {
  partner: { code: string; name: string; taxCode: string | null; address: string | null; phone: string | null; email: string | null; contactName: string; bankAccount: string; bankName: string; groupCode: string | null; kind: string; isActive: boolean };
  summary?: SupplierRow; credit?: CreditStatus; months: { month: string; amount: number }[]; logs: LogRow[];
}

export const toJsonl = (rows: LogRow[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
