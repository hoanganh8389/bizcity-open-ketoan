/**
 * Chương trình có hạn mức theo cửa hàng (trước là màn BH12 *Chương trình bán*, nay là thẻ *Có hạn mức* của màn *Chương trình khuyến mại*
 * BH18 — phiếu NT-BH-018). Hàm thuần: form ↔ thân API `/api/v1/sale-programs` (API, dữ liệu giữ nguyên), nhãn ưu đãi, trạng thái.
 * Hàng tặng / giảm giá vẫn là mặt hàng chính, không sinh mã mới; Core tính theo khuôn `sale.program.{gift|discount}@1`.
 */
// [2026-11-15 09:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-018: chuyển giao diện BH12 vào module pos (anh Hoàng quản lý phần BH12 từ 15/11) (đóng góp)

export type ProgramState = 'running' | 'upcoming' | 'ended' | 'stopped';
export interface Quota { branchCode: string; quotaQty: number; usedQty: number; remaining: number }
export interface Program {
  id: string; code: string; name: string; programKind: string; mode: 'gift' | 'discount'; sku: string; skuName: string | null; buyQty: number;
  giftSku: string | null; giftSkuName: string | null; giftQty: number | null; discountPct: number | null; discountAmount: number | null; salePrice: number | null;
  validFrom: string; validTo: string; isActive: boolean; state: ProgramState; version: number; note: string; quotas: Quota[];
  quotaTotal: number; usedTotal: number; remainingTotal: number;
}
export interface ProgramKind { code: string; name: string; side: string; note: string; isActive: boolean }
export interface ReportRow {
  programId: string; program: string; name: string; programKind: string; mode: string; sku: string; skuName: string | null; validFrom: string; validTo: string;
  branchCode: string; quota: number; used: number; remaining: number; usedPct: number; periodQty: number; periodAmount: number; periodDocs: number; pace: number | null;
}

export const PROGRAM_STATE: Record<ProgramState, { label: string; tone: string }> = {
  running: { label: 'Đang chạy', tone: 'ok' }, upcoming: { label: 'Sắp chạy', tone: 'info' }, ended: { label: 'Đã hết hạn', tone: 'gray' }, stopped: { label: 'Đã ngừng', tone: 'bad' },
};

/** Hai loại có hạn mức ở hộp Thêm của màn Chương trình khuyến mại (cạnh 6 loại khuyến mại). */
export const QUOTA_KINDS = {
  gift: { label: 'Tặng hàng có hạn mức cửa hàng', hint: 'Mua đủ số lượng một mặt hàng tặng hàng; mỗi cửa hàng một số suất, hết suất thì thôi' },
  discount: { label: 'Giảm giá có hạn mức cửa hàng (kể cả cận date)', hint: 'Giảm %, giảm tiền hoặc giá chương trình trên một mặt hàng; mỗi cửa hàng một số lượng' },
} as const;

const money = (n: number) => n.toLocaleString('vi-VN');

export function offerText(p: Pick<Program, 'mode' | 'buyQty' | 'giftQty' | 'giftSku' | 'giftSkuName' | 'discountPct' | 'discountAmount' | 'salePrice'>): string {
  if (p.mode === 'gift') return `Mua ${p.buyQty} tặng ${p.giftQty ?? 1} ${p.giftSku ? (p.giftSkuName ?? p.giftSku) : 'chính hàng này'}`;
  if (p.discountPct) return `Giảm ${p.discountPct}%`;
  if (p.discountAmount) return `Giảm ${money(p.discountAmount)} đ / đơn vị`;
  return `Giá chương trình ${money(p.salePrice ?? 0)} đ`;
}

export interface ProgramForm {
  code: string; name: string; programKind: string; mode: 'gift' | 'discount'; sku: string; buyQty: number; giftSku: string; giftQty: number;
  discountWay: 'pct' | 'amount' | 'price'; discountValue: number; validFrom: string; validTo: string; isActive: boolean; note: string; quotas: Record<string, number>;
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function emptyProgramForm(mode: 'gift' | 'discount', today: string): ProgramForm {
  return { code: '', name: '', programKind: 'KM-CTY', mode, sku: '', buyQty: 1, giftSku: '', giftQty: 1, discountWay: 'pct', discountValue: 10, validFrom: today, validTo: addDays(today, 30), isActive: true, note: '', quotas: {} };
}

export function fromProgram(p: Program): ProgramForm {
  return {
    code: p.code, name: p.name, programKind: p.programKind, mode: p.mode, sku: p.sku, buyQty: p.buyQty, giftSku: p.giftSku ?? '', giftQty: p.giftQty ?? 1,
    discountWay: p.discountPct ? 'pct' : p.discountAmount ? 'amount' : 'price', discountValue: p.discountPct ?? p.discountAmount ?? p.salePrice ?? 0,
    validFrom: p.validFrom, validTo: p.validTo, isActive: p.isActive, note: p.note, quotas: Object.fromEntries(p.quotas.map((q) => [q.branchCode, q.quotaQty])),
  };
}

/**
 * Form → thân POST / PUT `/api/v1/sale-programs`. Hạn mức: gửi cửa hàng có hạn mức > 0, và cửa hàng đã dùng (để API giữ dòng, không hạ dưới
 * số đã dùng). Trả lỗi kiểm ở màn (câu tiếng Việt) trước khi gửi.
 */
export function toProgramBody(f: ProgramForm, used: ReadonlyMap<string, number>): { body: Record<string, unknown>; problems: string[] } {
  const problems: string[] = [];
  if (!/^\S{2,64}$/.test(f.code)) problems.push('Mã chương trình: 2–64 ký tự, không dấu cách (vd KM-T11-LY)');
  if (!f.name.trim()) problems.push('Chưa nhập tên chương trình');
  if (!f.sku) problems.push('Chưa chọn mặt hàng chính');
  if (!f.validFrom || !f.validTo || f.validTo < f.validFrom) problems.push('Thời gian: đến ngày phải từ ngày trở về sau');
  if (f.mode === 'gift' && (!(f.buyQty > 0) || !(f.giftQty > 0))) problems.push('Số lượng mua và tặng phải lớn hơn 0');
  if (f.mode === 'discount' && !(f.discountValue > 0)) problems.push('Mức giảm phải lớn hơn 0');
  if (f.mode === 'discount' && f.discountWay === 'pct' && f.discountValue > 100) problems.push('Phần trăm giảm không quá 100');
  for (const [b, u] of used) if ((f.quotas[b] ?? 0) < u) problems.push(`Hạn mức ${b} không được thấp hơn số đã dùng (${u})`);
  const body: Record<string, unknown> = {
    code: f.code, name: f.name.trim(), programKind: f.programKind, mode: f.mode, sku: f.sku, validFrom: f.validFrom, validTo: f.validTo, isActive: f.isActive, note: f.note,
    ...(f.mode === 'gift'
      ? { buyQty: f.buyQty, giftSku: f.giftSku || null, giftQty: f.giftQty }
      : { [f.discountWay === 'pct' ? 'discountPct' : f.discountWay === 'amount' ? 'discountAmount' : 'salePrice']: f.discountValue }),
    quotas: Object.entries(f.quotas).filter(([b, q]) => q > 0 || (used.get(b) ?? 0) > 0).map(([branchCode, quotaQty]) => ({ branchCode, quotaQty: quotaQty || 0 })),
  };
  return { body, problems };
}
