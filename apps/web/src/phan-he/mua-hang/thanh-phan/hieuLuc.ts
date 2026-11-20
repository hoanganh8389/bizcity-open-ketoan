// [2026-11-20 khanhtd] MH-KM — cột Hiệu lực của Bảng khuyến mại trên phiếu / đơn mua (đóng góp)
/**
 * HIỆU LỰC CỦA MỘT CHƯƠNG TRÌNH trên Bảng khuyến mại của phiếu:
 *   - phiếu đang lập: hiệu lực của bản chính sách áp ở NGÀY PHIẾU (policyAt — cùng bản bộ máy dùng để tính);
 *   - phiếu đã duyệt: hiệu lực của ĐÚNG BẢN đã chốt lúc duyệt (số bản ghi trong vết chốt), không phải bản hiện hành;
 *   - sắp hết hạn: còn dưới 7 ngày tính từ ngày phiếu → tô cam; ngày phiếu đã quá ngày kết thúc → tô cam, ghi "đã hết hạn".
 * Dòng "ghi trên phiếu" (CK tay) không phải chương trình → không có hiệu lực.
 */
import { policyAt, type Policy } from '@bizcity/mua-hang-domain';

export const SAP_HET_HAN_NGAY = 7;

export interface HieuLuc { text: string; warn: boolean; title: string }

const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const days = (from: string, to: string) => (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000;

/** `version`: số bản trong vết chốt (phiếu đã duyệt); không có → bản áp ở ngày phiếu. */
export function hieuLucCua(policy: Policy | undefined, docDate: string, version?: number): HieuLuc | undefined {
  if (!policy) return undefined;
  const snap = version !== undefined ? policy.versions?.find((x) => x.version === version)?.snapshot : undefined;
  const p = snap ? { validFrom: snap.validFrom ?? undefined, validTo: snap.validTo ?? undefined } : policyAt(policy, docDate);
  const from = p.validFrom, to = p.validTo;
  const text = !from && !to ? 'Không thời hạn' : `${from ? dmy(from) : '…'} → ${to ? dmy(to) : 'không thời hạn'}`;
  const ban = snap ? ` · bản ${version} (lúc chốt)` : '';
  if (!to || !docDate) return { text, warn: false, title: `Hiệu lực của chương trình${ban}` };
  const left = days(docDate, to);
  if (left < 0) return { text, warn: true, title: `Đã hết hạn ngày ${dmy(to)} — trước ngày phiếu ${dmy(docDate)}${ban}` };
  if (left < SAP_HET_HAN_NGAY) return { text, warn: true, title: `Sắp hết hạn: còn ${left} ngày tính từ ngày phiếu ${dmy(docDate)} (hết ngày ${dmy(to)})${ban}` };
  return { text, warn: false, title: `Còn ${left} ngày tính từ ngày phiếu ${dmy(docDate)}${ban}` };
}
