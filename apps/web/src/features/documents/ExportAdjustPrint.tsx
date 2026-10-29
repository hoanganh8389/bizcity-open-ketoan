/**
 * MẪU IN Phiếu xuất điều chỉnh (BH06): phiếu bán nội bộ có lý do xuất (dùng nội bộ, tặng, dùng thử, huỷ hỏng…).
 *
 *   Phiếu điều chỉnh giảm / tăng   rptDieuChinhGiam.rpt, rptDieuChinhTang.rpt (Crystal, chưa trích được bố cục —
 *                                  dựng theo tên mẫu): phiếu xuất điều chỉnh luôn làm GIẢM hàng; phiếu có số lượng âm
 *                                  (nhập lại) thì tự đổi tiêu đề thành điều chỉnh tăng.
 *   Phiếu xuất kho 02-VT           mẫu TT200; giá xuất lấy theo giá vốn đã ghi sổ (bút toán Có TK 15x của mặt hàng).
 */
import { api } from '@/lib/api';
import { Fields, Foot, OrgHead, Signs, StockForm, Table, Title, m, mb, qty, words, type PrintCtx, type PrintTemplate, type Row, type StockData } from '@/components/print';

interface AdjLine { sku: string; name: string; unit: string; qty: number; unitQty?: number; unitRatio?: number; unitPrice: number; amountBeforeTax: number; cost?: number; lotNo?: string; expDate?: string; note?: string; warehouseCode?: string }
/** Một phiếu xuất điều chỉnh đã nạp đủ để in. */
export interface ExportAdjustSheet {
  docNo: string; docDate: string; branchCode: string; reasonCode: string; reasonName: string; label: string; description: string;
  partnerName: string; employeeName: string; lines: AdjLine[];
  /** Giá vốn từng mặt hàng theo bút toán đã ghi sổ (Có TK 15x). */
  costBySku: Record<string, number>; debitAccounts: string[]; creditAccounts: string[];
}

interface DocResp {
  docNo: string; docDate: string; branch: { code: string; name: string } | null; payload: any;
  entries: { status: string; isReversal: boolean; lines: { accountCode: string; debit: number; credit: number; productSku?: string | null }[] }[];
}

/** Nạp chứng từ (nội dung mới nhất + bút toán) để in. */
export async function loadExportAdjust(id: string, reasonName: (code: string) => string): Promise<ExportAdjustSheet> {
  const d = await api.get<DocResp>(`/api/v1/documents/${id}`);
  const p = d.payload ?? {};
  const costBySku: Record<string, number> = {};
  const debit = new Set<string>(); const credit = new Set<string>();
  for (const e of d.entries.filter((x) => x.status === 'posted' && !x.isReversal)) {
    for (const l of e.lines) {
      if (l.credit > 0 && l.accountCode.startsWith('15')) { credit.add(l.accountCode); if (l.productSku) costBySku[l.productSku] = (costBySku[l.productSku] ?? 0) + l.credit; }
      if (l.debit > 0 && l.productSku && !/^(13|11)/.test(l.accountCode)) debit.add(l.accountCode);
    }
  }
  const reasonCode = p.reasonCode ?? '';
  return {
    docNo: d.docNo, docDate: String(d.docDate).slice(0, 10), branchCode: d.branch?.code ?? p.branchCode ?? '', reasonCode, reasonName: reasonName(reasonCode),
    label: p.sourceRef?.label ?? 'Phiếu xuất điều chỉnh', description: p.description ?? '', partnerName: p.partner?.name || p.partner?.code || '',
    employeeName: p.employee?.name ?? '', lines: p.lines ?? [], costBySku, debitAccounts: [...debit], creditAccounts: [...credit],
  };
}

/** Số lượng theo ĐVT trên phiếu; chứng từ cũ chưa có unitQty thì suy từ số quy đổi và tỉ lệ. */
const qtyOf = (l: AdjLine) => l.unitQty ?? (l.unitRatio ? l.qty / l.unitRatio : l.qty);
/** Giá trị dòng: giá vốn đã ghi sổ (chia theo tỉ lệ số lượng nếu mã hàng lặp), không có thì giá vốn nguồn gửi, rồi tiền hàng. */
function valueOf(s: ExportAdjustSheet, l: AdjLine): number {
  const total = s.costBySku[l.sku];
  if (total !== undefined) {
    const same = s.lines.filter((x) => x.sku === l.sku).reduce((a, x) => a + Math.abs(x.qty), 0);
    return same ? Math.round((total * Math.abs(l.qty)) / same) : total;
  }
  return Math.abs(l.cost ?? l.amountBeforeTax ?? 0);
}
/** Phân kho của phiếu: các mã kho trên dòng (trống = kho mặc định của chi nhánh), "Chi nhánh — kho mã · tên". */
const khoText = (s: ExportAdjustSheet, ctx: PrintCtx) => `${ctx.branchName(s.branchCode)} — kho ${[...new Set(s.lines.map((l) => l.warehouseCode ?? ''))].map((c) => ctx.kho(s.branchCode, c || undefined)).filter((x, i, a) => a.indexOf(x) === i).join(', ') || ctx.kho(s.branchCode)}`;
const reasonText = (s: ExportAdjustSheet) => [s.reasonCode && `${s.reasonCode}${s.reasonName ? ` — ${s.reasonName}` : ''}`, s.description].filter(Boolean).join('. ');

/** Phiếu điều chỉnh giảm / tăng: bảng hàng có giá trị. */
function AdjustSheet({ s, ctx }: { s: ExportAdjustSheet; ctx: PrintCtx }) {
  const up = s.lines.reduce((a, l) => a + l.qty, 0) < 0;
  const total = s.lines.reduce((a, l) => a + valueOf(s, l), 0);
  return (
    <>
      <OrgHead ctx={ctx} branchCode={s.branchCode} />
      <Title title={up ? 'PHIẾU ĐIỀU CHỈNH TĂNG' : 'PHIẾU ĐIỀU CHỈNH GIẢM'} sub={s.label} date={s.docDate} no={s.docNo} />
      <Fields rows={[
        ['Chi nhánh / kho', khoText(s, ctx)],
        ['Lý do điều chỉnh', reasonText(s)],
        ...(s.partnerName ? [['Đối tượng', s.partnerName] as Row] : []),
        ...(s.employeeName ? [['Nhân viên', s.employeeName] as Row] : []),
      ]} />
      <Table rows={s.lines} minRows={3} cols={[
        { h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
        { h: 'Mã hàng', w: 90, v: (l) => l.sku },
        { h: 'Tên hàng hoá', v: (l) => <>{l.name}{l.lotNo ? <i> · Lô {l.lotNo}</i> : null}</> },
        { h: 'ĐVT', w: 44, center: true, v: (l) => l.unit },
        { h: 'Số lượng', w: 60, num: true, v: (l) => qty(Math.abs(qtyOf(l))) },
        { h: 'Đơn giá', w: 80, num: true, v: (l) => { const q = Math.abs(qtyOf(l)); return q ? mb(Math.round(valueOf(s, l) / q)) : ''; } },
        { h: 'Thành tiền', w: 96, num: true, v: (l) => mb(valueOf(s, l)) },
        { h: 'Ghi chú', w: 100, v: (l) => l.note ?? '' },
      ]} foot={<tr><td colSpan={4} className="c">Cộng</td><td className="num">{qty(s.lines.reduce((a, l) => a + Math.abs(qtyOf(l)), 0))}</td><td /><td className="num">{m(total)}</td><td /></tr>} />
      <div className="pd-words">Tổng giá trị (viết bằng chữ): <i>{words(total)}</i></div>
      <Signs date={s.docDate} items={[{ title: 'Người lập phiếu' }, { title: 'Thủ kho' }, { title: 'Kế toán trưởng' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }]} />
      <Foot ctx={ctx} />
    </>
  );
}

/** Phiếu xuất kho 02-VT (mẫu chung StockForm): giá xuất = giá vốn đã ghi sổ, Nợ / Có theo bút toán. */
const stockOut = (s: ExportAdjustSheet, ctx: PrintCtx): StockData => ({
  dir: 'out', branchCode: s.branchCode, docNo: s.docNo, date: s.docDate, person: s.partnerName || s.employeeName, price: 'value',
  reason: `${s.label}${reasonText(s) ? ` — ${reasonText(s)}` : ''}`, warehouse: khoText(s, ctx),
  debit: s.debitAccounts.join(', '), credit: s.creditAccounts.join(', '),
  lines: s.lines.map((l) => { const q = Math.abs(qtyOf(l)); return { sku: l.sku, name: l.name, unit: l.unit, qty: q, actual: q, amount: valueOf(s, l) }; }),
});

export const EXPORT_ADJUST_TEMPLATES: PrintTemplate<ExportAdjustSheet>[] = [
  { id: 'dcg', name: 'Phiếu điều chỉnh giảm (tăng)', paper: 'A4', source: 'rptDieuChinhGiam.rpt, rptDieuChinhTang.rpt', render: (s, c) => <AdjustSheet s={s} ctx={c} /> },
  { id: 'pxk', name: 'Phiếu xuất kho 02-VT', paper: 'A4', source: 'mẫu chuẩn', render: (s, c) => <StockForm s={stockOut(s, c)} ctx={c} /> },
];
