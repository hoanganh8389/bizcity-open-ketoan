/**
 * Phiếu công nợ lập nhanh:
 *   mode = ar       Ghi tăng / ghi giảm công nợ phải thu        (CN02)
 *   mode = ap       Ghi tăng / ghi giảm công nợ phải trả        (CN03)
 *   mode = deposit  Đặt cọc, trả trước (khách đặt cọc; đặt cọc cho nhà cung cấp)   (CN04)
 *
 * Mỗi phiếu là một phiếu nhập tay có ghi mục đích (purpose), ghi sổ ngay, sinh một khoản công nợ có hạn thanh toán:
 *   ghi tăng phải thu   Nợ TK phải thu / Có TK đối ứng        ghi giảm phải thu   Nợ TK đối ứng / Có TK phải thu
 *   ghi tăng phải trả   Nợ TK đối ứng / Có TK phải trả        ghi giảm phải trả   Nợ TK phải trả / Có TK đối ứng
 *   khách đặt cọc       Nợ TK tiền / Có TK phải thu (phiếu thu / báo có)
 *   đặt cọc cho NCC     Nợ TK phải trả hoặc ký quỹ / Có TK tiền (phiếu chi / báo nợ)
 * Danh sách đọc từ khoản công nợ nên thấy ngay mỗi phiếu đã đối trừ bao nhiêu, còn lại bao nhiêu.
 * Sửa / huỷ: bấm dòng để mở phiếu (hộp phiếu thường, có nút In).
 * In nhiều phiếu: tích các dòng, bấm In — mẫu phiếu theo loại phiếu (VOUCHER_TEMPLATES): CN02, CN03 phiếu kế toán;
 * CN04 phiếu thu / chi / báo có / báo nợ theo loại từng phiếu, hoặc phiếu kế toán.
 */
import { workBranch } from '@/lib/workBranch';
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { VOUCHER_PURPOSES, type VoucherInput, type VoucherPurpose, type VoucherType } from '@ketoan/contracts';
import { api, errorText, ALL_ROWS } from '@/lib/api';
import { defaultFrom, money, today } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { DateRange, useBranches, BranchPicker } from '@/components/filters';
import { Empty, ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker, PartnerPicker } from '@/components/pickers';
import { VoucherForm, type ExistingVoucher } from '../../../features/vouchers/VoucherForm';
import { VOUCHER_TEMPLATES, type PrintSheet, type SignatureInfo } from '../../../features/vouchers/VoucherPrint';
import { PrintButton, type PrintTemplate } from '@/components/print';
import type { DebtItem } from './DebtItemsPage';
import { ReferencePicker, type ReferenceDoc } from './ReferenceDocsPage';

type Mode = 'ar' | 'ap' | 'deposit';
interface PurposeDef { debtDefault: string; counterDefault: string; counterLabel: string; debtLabel: string; money: boolean; debtSide: 'debit' | 'credit'; tax?: 'input' | 'output' }
const DEF: Record<Exclude<VoucherPurpose, 'offset'>, PurposeDef> = {
  ar_increase: { debtDefault: '1311', counterDefault: '', counterLabel: 'TK ghi Có (doanh thu, thu nhập, phải trả khác…)', debtLabel: 'TK phải thu (ghi Nợ)', money: false, debtSide: 'debit', tax: 'output' },
  ar_decrease: { debtDefault: '1311', counterDefault: '', counterLabel: 'TK ghi Nợ (giảm trừ, chi phí, xoá nợ…)', debtLabel: 'TK phải thu (ghi Có)', money: false, debtSide: 'credit' },
  ap_increase: { debtDefault: '33111', counterDefault: '', counterLabel: 'TK ghi Nợ (chi phí, tài sản, trả trước…)', debtLabel: 'TK phải trả (ghi Có)', money: false, debtSide: 'credit', tax: 'input' },
  ap_decrease: { debtDefault: '33111', counterDefault: '', counterLabel: 'TK ghi Có (thu nhập, giảm chi phí…)', debtLabel: 'TK phải trả (ghi Nợ)', money: false, debtSide: 'debit' },
  deposit_received: { debtDefault: '1311', counterDefault: '1111', counterLabel: 'Thu vào tài khoản tiền (ghi Nợ)', debtLabel: 'TK ghi Có (phải thu khách hàng)', money: true, debtSide: 'credit' },
  deposit_paid: { debtDefault: '33111', counterDefault: '1111', counterLabel: 'Chi từ tài khoản tiền (ghi Có)', debtLabel: 'TK ghi Nợ (phải trả NCC, hoặc ký quỹ 244)', money: true, debtSide: 'debit' },
};
const MODES: Record<Mode, { title: string; code: string; subtitle: string; purposes: Exclude<VoucherPurpose, 'offset'>[] }> = {
  ar: { title: 'Ghi tăng, ghi giảm công nợ phải thu', code: 'CN02', subtitle: 'Khoản phải thu không qua phiếu bán: phí, phạt, chiết khấu, xoá nợ, điều chỉnh công nợ khách hàng', purposes: ['ar_increase', 'ar_decrease'] },
  ap: { title: 'Ghi tăng, ghi giảm công nợ phải trả', code: 'CN03', subtitle: 'Khoản phải trả không qua phiếu nhập: hoá đơn dịch vụ, tiền thuê, chiết khấu được hưởng, điều chỉnh công nợ nhà cung cấp', purposes: ['ap_increase', 'ap_decrease'] },
  deposit: { title: 'Đặt cọc, trả trước', code: 'CN04', subtitle: 'Khách đặt cọc, trả trước; đặt cọc, trả trước cho nhà cung cấp. Theo dõi số cọc còn lại và trừ vào hoá đơn', purposes: ['deposit_received', 'deposit_paid'] },
};
interface TaxCode { code: string; name: string; rate: number; direction: string; isActive: boolean }
const parseAmount = (s: string): number => Number(s.replace(/[.,\s]/g, '')) || 0;
/**
 * Mẫu in của danh sách: CN02, CN03 chỉ có phiếu kế toán; CN04 lẫn phiếu thu / chi / báo có / báo nợ nên mẫu đầu in
 * mỗi phiếu theo mẫu mặc định của loại phiếu đó (đều khổ A5 ngang), mẫu sau in tất cả dạng phiếu kế toán.
 */
const PK = VOUCHER_TEMPLATES.manual[0]!;
export const LIST_TEMPLATES: Record<Mode, PrintTemplate<PrintSheet>[]> = {
  ar: VOUCHER_TEMPLATES.manual,
  ap: VOUCHER_TEMPLATES.manual,
  deposit: [
    { id: 'by-type', name: 'Phiếu thu / chi / báo có / báo nợ (theo loại phiếu)', paper: 'A5L', source: 'rdlcPhieuThu, rdlcPhieuChi, rdlcPhieuBaoCo, rdlcPhieuBaoNo.rdlc', render: (s, c) => VOUCHER_TEMPLATES[s.type][0]!.render(s, c) },
    { ...PK, render: (s, c) => PK.render({ ...s, type: 'manual' }, c) },
  ],
};
/** Loại chứng từ nguồn dùng được cho từng loại phiếu. */
const SOURCE_KINDS: Record<Exclude<VoucherPurpose, 'offset'>, string[]> = {
  ar_increase: ['goods_issue', 'sales_order', 'other'],
  ar_decrease: ['sales_return', 'other'],
  ap_increase: ['goods_receipt', 'purchase_order', 'purchase_quotation', 'other'],
  ap_decrease: ['purchase_return', 'other'],
  deposit_received: ['sales_order', 'sales_quotation', 'other'],
  deposit_paid: ['purchase_order', 'purchase_quotation', 'other'],
};

export function DebtVouchersPage({ mode }: { mode: Mode }) {
  const m = MODES[mode];
  const { can } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({ from: defaultFrom(), to: today(), partnerCode: '', purpose: '', status: 'all', page: 1 });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ type: VoucherType; existing: ExistingVoucher } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: branches } = useBranches();
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch, page: patch.page ?? 1 }));
  const params = { from: f.from, to: f.to, status: f.status, partnerCode: f.partnerCode || undefined, purpose: f.purpose || m.purposes.join(','), page: f.page, pageSize: ALL_ROWS };
  const q = useQuery({ queryKey: ['debt-items', 'vouchers', mode, params], queryFn: () => api.getPage<DebtItem[]>('/api/v1/debt-items', params), placeholderData: keepPreviousData });
  const open = async (r: DebtItem) => {
    setLoadError(null);
    try {
      const d = await qc.fetchQuery({ queryKey: ['document', r.documentId], queryFn: () => api.get<ExistingVoucher & { docType: VoucherType }>(`/api/v1/documents/${r.documentId}`), staleTime: 0 });
      setEditing({ type: d.docType, existing: d });
    } catch (e) { setLoadError(errorText(e)); }
  };
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['debt-items'] }); };
  const rows = q.data?.data ?? [];
  const picked = rows.filter((r) => selected.has(r.id));
  /** Nạp đủ phiếu của các dòng đã tích (một phiếu một lần dù sinh nhiều khoản công nợ) để in. */
  const printPicked = async (): Promise<PrintSheet[]> => {
    const ids = [...new Set(picked.map((r) => r.documentId))];
    const docs = await Promise.all(ids.map((id) => qc.fetchQuery({ queryKey: ['document', id], queryFn: () => api.get<ExistingVoucher & { docType: VoucherType; signatures?: SignatureInfo[] }>(`/api/v1/documents/${id}`), staleTime: 0 })));
    return docs.map((d) => ({ type: d.docType, docNo: d.docNo, voucher: d.payload, signatures: d.signatures, branchName: branches?.find((b) => b.code === d.payload.branchCode)?.name ?? d.payload.branchCode }));
  };
  return (
    <>
      <PageHeader title={m.title} code={m.code} subtitle={m.subtitle} helpKey="phieu-cong-no"
        actions={can('documents:write') ? <button className="btn btn-primary" onClick={() => { setNotice(null); setAdding(true); }}><Plus size={16} /> Lập phiếu</button> : undefined} />
      {notice && <div className="alert alert-ok" style={{ marginBottom: 14 }}>{notice}</div>}
      <FilterLayout
        filters={
          <>
            <DateRange remember={false} from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <div className="field">
              <label>Loại phiếu</label>
              <select className="select input" value={f.purpose} onChange={(e) => set({ purpose: e.target.value })}>
                <option value="">Tất cả</option>{m.purposes.map((p) => <option key={p} value={p}>{VOUCHER_PURPOSES[p]}</option>)}
              </select>
            </div>
            <div className="field"><label>Đối tượng</label><PartnerPicker value={f.partnerCode} onChange={(partnerCode) => set({ partnerCode })} placeholder="Tất cả" /></div>
            <div className="field">
              <label>Trạng thái</label>
              <select className="select input" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="all">Tất cả</option><option value="open">Còn lại &gt; 0</option><option value="settled">Đã đối trừ hết</option></select>
            </div>
          </>
        }
      >
        <div className="card">
          <div className="vf-toolbar">
            <PrintButton bare screen={m.code} templates={LIST_TEMPLATES[mode]} disabled={!picked.length} label={picked.length ? `In ${picked.length} phiếu đã chọn` : 'In (tích chọn dòng)'} getDocs={printPicked} />
          </div>
          <ErrorBox error={q.error ? errorText(q.error) : loadError} />
          {q.isLoading ? <Loading /> : !q.data?.data.length ? <Empty text="Chưa có phiếu nào trong khoảng này" /> : (
            <DataGrid storageKey={`debt-voucher-${mode}`} rows={q.data.data} rowKey={(r) => r.id} onRowClick={(r) => void open(r)} 
              columns={[
                {
                  key: 'pick', noFilter: true, noSort: true, width: 46, value: () => '',
                  header: <label className="checkbox" title="Chọn tất cả"><input type="checkbox" checked={rows.length > 0 && rows.every((r) => selected.has(r.id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /> Chọn</label>,
                  render: (r) => <input type="checkbox" checked={selected.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />,
                },
                { key: 'docDate', header: 'Ngày', type: 'date' },
                { key: 'docNo', header: 'Số phiếu', type: 'code' },
                { key: 'purpose', header: 'Loại', value: (r) => VOUCHER_PURPOSES[r.purpose as VoucherPurpose] ?? '' },
                { key: 'partnerCode', header: 'Mã đối tượng', type: 'code' },
                { key: 'partnerName', header: 'Tên đối tượng' },
                { key: 'accountCode', header: 'TK công nợ', type: 'code' },
                { key: 'description', header: 'Diễn giải' },
                { key: 'dueDate', header: 'Hạn TT', type: 'date' },
                { key: 'amount', header: 'Số tiền', type: 'money', sum: true },
                { key: 'settled', header: 'Đã đối trừ', type: 'money', sum: true },
                { key: 'remaining', header: 'Còn lại', type: 'money', sum: true },
                { key: 'branchCode', header: 'Chi nhánh', type: 'code', hidden: true },
              ] satisfies Column<DebtItem>[]} />
          )}
        </div>
      </FilterLayout>
      {adding && <DebtVoucherForm mode={mode} onClose={() => setAdding(false)} onSaved={(docNo, docDate) => { setAdding(false); setNotice(`Đã ghi sổ phiếu ${docNo}.`); setF((x) => ({ ...x, from: docDate < x.from ? docDate : x.from, to: docDate > x.to ? docDate : x.to, page: 1 })); refresh(); }} />}
      {editing && <VoucherForm type={editing.type} existing={editing.existing} onClose={() => { setEditing(null); refresh(); }} onSaved={(docNo) => { setEditing(null); setNotice(`Đã ghi lại phiếu ${docNo}.`); refresh(); }} />}
    </>
  );
}

function DebtVoucherForm({ mode, onClose, onSaved }: { mode: Mode; onClose: () => void; onSaved: (docNo: string, docDate: string) => void }) {
  const m = MODES[mode];
  const { data: branches } = useBranches();
  const { data: taxCodes = [] } = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 });
  const [purpose, setPurpose] = useState(m.purposes[0]!);
  const def = DEF[purpose];
  const [v, setV] = useState({ docDate: today(), branchCode: workBranch.get(), partnerCode: '', debt: def.debtDefault, counter: def.counterDefault, amount: '', dueDate: '', description: '', reference: '', counterparty: '', taxCode: '', taxAmount: '', invoiceNo: '', invoiceSerial: '', invoiceDate: '' });
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const [source, setSource] = useState<ReferenceDoc | null>(null);
  const [picking, setPicking] = useState(false);
  /** Điền phiếu theo chứng từ nguồn: đối tượng, số tiền, hạn thanh toán, nội dung. */
  const useSource = (d: ReferenceDoc) => {
    setSource(d); setPicking(false);
    set({ partnerCode: d.partnerCode || v.partnerCode, amount: d.total ? money(d.total) : v.amount, dueDate: d.dueDate ?? v.dueDate, reference: `${d.kindLabel} ${d.docNo}`, description: v.description || d.description, branchCode: branches?.some((b) => b.code === d.branchCode) ? d.branchCode : v.branchCode });
  };
  const branchCode = v.branchCode || branches?.find((b) => b.isActive)?.code || '';
  const amount = parseAmount(v.amount);
  const taxAmount = parseAmount(v.taxAmount);
  const changePurpose = (p: typeof purpose) => { setPurpose(p); set({ debt: DEF[p].debtDefault, counter: DEF[p].counterDefault, taxCode: '', taxAmount: '' }); };
  const pickTax = (code: string) => { const rate = taxCodes.find((t) => t.code === code)?.rate ?? 0; set({ taxCode: code, taxAmount: code && !taxAmount ? money(Math.round((amount * rate) / 100)) : code ? v.taxAmount : '' }); };
  const save = useMutation({
    mutationFn: () => {
      const [debitAccount, creditAccount] = def.debtSide === 'debit' ? [v.debt.trim(), v.counter.trim()] : [v.counter.trim(), v.debt.trim()];
      // Phiếu đặt cọc đi qua tiền: tài khoản 111 → phiếu thu / chi; 112 → báo có / báo nợ.
      const bank = v.counter.trim().startsWith('112');
      const docType: VoucherType = !def.money ? 'manual' : purpose === 'deposit_received' ? (bank ? 'bank_receipt' : 'receipt') : bank ? 'bank_payment' : 'payment';
      const description = v.description.trim() || VOUCHER_PURPOSES[purpose];
      const body: VoucherInput = {
        docType, branchCode, docDate: v.docDate, description, counterparty: v.counterparty, partnerCode: v.partnerCode, reference: v.reference, purpose, dueDate: v.dueDate || undefined, sourceDocKey: source?.docKey,
        lines: [{ debitAccount, creditAccount, amount, description, taxCode: v.taxCode || undefined, taxAmount, invoiceNo: v.invoiceNo.trim() || undefined, invoiceSerial: v.invoiceSerial.trim() || undefined, invoiceDate: v.invoiceDate || undefined }],
      };
      return api.post<{ docNo: string }>('/api/v1/vouchers', body);
    },
    onSuccess: (r) => onSaved(r.docNo, v.docDate),
  });
  const canSave = branchCode && v.partnerCode && v.debt.trim() && v.counter.trim() && amount > 0;
  return (
    <Modal wide title={`Lập phiếu — ${m.title.toLowerCase()}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>Ghi sổ</button></>}>
      <Field label="Loại phiếu">
        <select className="select input" value={purpose} onChange={(e) => changePurpose(e.target.value as typeof purpose)}>{m.purposes.map((p) => <option key={p} value={p}>{VOUCHER_PURPOSES[p]}</option>)}</select>
      </Field>
      <Field label="Ngày phiếu"><input type="date" className="input" value={v.docDate} onChange={(e) => set({ docDate: e.target.value })} /></Field>
      <Field label="Chi nhánh">
        <BranchPicker activeOnly value={branchCode} onChange={(c) => set({ branchCode: c })} />
      </Field>
      <Field label="Đối tượng (bắt buộc)"><PartnerPicker activeOnly value={v.partnerCode} onChange={(partnerCode) => set({ partnerCode })} placeholder="Gõ mã, tên hoặc mã số thuế" /></Field>
      <Field label={def.debtLabel}><AccountPicker postingOnly className="input mono" value={v.debt} onChange={(debt) => set({ debt })} /></Field>
      <Field label={def.counterLabel}><AccountPicker postingOnly className="input mono" value={v.counter} onChange={(counter) => set({ counter })} placeholder="Bấm để chọn" /></Field>
      <Field label={def.tax ? 'Số tiền chưa thuế' : 'Số tiền'}><input className="input num" inputMode="numeric" value={v.amount} onChange={(e) => set({ amount: e.target.value })} onBlur={() => set({ amount: amount ? money(amount) : '' })} /></Field>
      <Field label="Hạn thanh toán" hint="Trống = ngày phiếu + hạn thanh toán của đối tượng"><input type="date" className="input" value={v.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></Field>
      <Field label="Chứng từ nguồn" hint={source ? 'Phiếu ghi xong thì chứng từ nguồn chuyển sang "đã lập phiếu"' : 'Số đơn đặt hàng, báo giá, phiếu nhập / xuất, hợp đồng…'}>
        <div className="row" style={{ gap: 6 }}>
          <input className="input" style={{ flex: 1 }} value={v.reference} onChange={(e) => { set({ reference: e.target.value }); setSource(null); }} />
          <button type="button" className="btn" onClick={() => setPicking(true)}>Chọn…</button>
        </div>
      </Field>
      {def.money && <Field label={purpose === 'deposit_received' ? 'Người nộp tiền' : 'Người nhận tiền'}><input className="input" value={v.counterparty} onChange={(e) => set({ counterparty: e.target.value })} /></Field>}
      <Field label="Diễn giải" full><input className="input" value={v.description} onChange={(e) => set({ description: e.target.value })} placeholder={VOUCHER_PURPOSES[purpose]} /></Field>
      {def.tax && (
        <>
          <Field label="Thuế GTGT">
            <select className="select input" value={v.taxCode} onChange={(e) => pickTax(e.target.value)}>
              <option value="">Không có thuế</option>{taxCodes.filter((t) => t.isActive && t.direction === def.tax).map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
            </select>
          </Field>
          <Field label="Tiền thuế"><input className="input num" inputMode="numeric" disabled={!v.taxCode} value={v.taxAmount} onChange={(e) => set({ taxAmount: e.target.value })} onBlur={() => set({ taxAmount: taxAmount ? money(taxAmount) : '' })} /></Field>
          <Field label="Ký hiệu hoá đơn"><input className="input mono" disabled={!v.taxCode} value={v.invoiceSerial} onChange={(e) => set({ invoiceSerial: e.target.value })} /></Field>
          <Field label="Số hoá đơn"><input className="input mono" disabled={!v.taxCode} value={v.invoiceNo} onChange={(e) => set({ invoiceNo: e.target.value })} /></Field>
          <Field label="Ngày hoá đơn"><input type="date" className="input" disabled={!v.taxCode} value={v.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} /></Field>
        </>
      )}
      {taxAmount > 0 && <div className="full muted">Tổng công nợ ghi nhận: <b>{money(amount + taxAmount)}</b> (tiền chưa thuế {money(amount)} + thuế {money(taxAmount)})</div>}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
      {picking && <ReferencePicker kinds={SOURCE_KINDS[purpose]} partnerCode={v.partnerCode} onPick={useSource} onClose={() => setPicking(false)} />}
    </Modal>
  );
}
