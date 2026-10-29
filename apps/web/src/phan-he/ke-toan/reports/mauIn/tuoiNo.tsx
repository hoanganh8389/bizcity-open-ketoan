/**
 * MẪU IN Công nợ theo tuổi nợ (ACC67 trước và quá hạn, ACC67A trước hạn, ACC67B quá hạn) — A4 ngang.
 * HTsoft rptTKSoChiTietCongNoTheoTuoiNoGlobal.rpt / rptTKKhachhangnoDetail.rpt là Crystal (không đọc được): bố cục theo các khoảng tuổi nợ của màn:
 *   STT | Mã KH | Tên KH | [Tổng nợ] | Không có hạn nợ | Trước hạn (các khoảng ngày, Tổng) | Quá hạn (các khoảng ngày, Tổng); Tổng cộng.
 * Thêm mẫu nhóm theo Nhóm KH (dòng cộng từng nhóm).
 */
import { date } from '@/lib/format';
import { LedgerForm, mb, screenTemplate, type LedgerCol, type PrintTemplate } from '@/components/print';
import { branchInfo, oneBranch, REPORT_SIGNS } from './congNoChung';

export interface AgingRow { partnerCode: string; partnerName: string; groupCode: string | null; total: number; noTerm: number; before: number[]; beforeTotal: number; over: number[]; overTotal: number }
export interface AgingSheet {
  code: string; title: string; kind: 1 | 2 | 3; asOf: string; step: number; account: string; branchCodes: string;
  ranges: string[]; rows: AgingRow[];
}

const money = (key: string, h: string, v: (r: AgingRow) => number, group?: string, bold = false): LedgerCol<AgingRow> =>
  ({ key, h, group, num: true, v: (r) => (bold ? <b>{mb(v(r))}</b> : mb(v(r))), sum: v });

function cols(s: AgingSheet): LedgerCol<AgingRow>[] {
  const k = s.kind;
  return [
    { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
    { key: 'ma', h: 'Mã KH/NCC', w: 76, v: (r) => r.partnerCode },
    { key: 'ten', h: 'Tên KH/NCC', w: k === 3 ? 170 : undefined, v: (r) => r.partnerName },
    ...(k === 3 ? [money('total', 'Tổng nợ', (r) => r.total, undefined, true)] : []),
    money('noTerm', 'Không có hạn nợ', (r) => r.noTerm),
    ...(k !== 2 ? s.ranges.map((l, i) => money(`th${i}`, l, (r) => r.before[i] ?? 0, 'Trước hạn (số ngày còn tới hạn)')) : []),
    ...(k === 3 ? [money('beforeTotal', 'Tổng', (r) => r.beforeTotal, 'Trước hạn (số ngày còn tới hạn)', true)] : []),
    ...(k !== 1 ? s.ranges.map((l, i) => money(`qh${i}`, l, (r) => r.over[i] ?? 0, 'Quá hạn (số ngày quá hạn)')) : []),
    ...(k === 3 ? [money('overTotal', 'Tổng', (r) => r.overTotal, 'Quá hạn (số ngày quá hạn)', true)] : []),
  ];
}

const aging = (byGroup: boolean): PrintTemplate<AgingSheet> => ({
  id: byGroup ? 'tuoino-nhom' : 'tuoino', name: byGroup ? 'Báo cáo tuổi nợ — theo nhóm khách hàng' : 'Báo cáo công nợ theo tuổi nợ', paper: 'A4L',
  source: 'rptTKSoChiTietCongNoTheoTuoiNoGlobal.rpt, rptTKKhachhangnoDetail.rpt',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: s.title.toUpperCase(), branchCode: oneBranch(s.branchCodes), period: `Đến ngày ${date(s.asOf)}`,
      info: [['Số tài khoản', s.account], ['Bước nhảy', `${s.step} ngày`], ...branchInfo(s.branchCodes, ctx)],
      cols: cols(s), rows: byGroup ? [...s.rows].sort((a, b) => (a.groupCode ?? '').localeCompare(b.groupCode ?? '')) : s.rows,
      groupBy: byGroup ? { key: (r) => r.groupCode ?? '', label: (k) => <b>Nhóm KH: {k || '(chưa phân nhóm)'}</b>, subtotal: 'Cộng nhóm' } : undefined,
      total: 'Tổng cộng', signs: REPORT_SIGNS,
    }} />
  ),
});

export const AGING_TEMPLATES: PrintTemplate<AgingSheet>[] = [aging(false), aging(true), screenTemplate<AgingSheet>()];
