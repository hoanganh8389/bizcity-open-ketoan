/**
 * Hộp lập / sửa phiếu nhập tay.
 *  - Phiếu thu, chi, báo có, báo nợ: chọn MỘT tài khoản tiền cho cả phiếu, mỗi dòng nhập tài khoản đối ứng + số tiền.
 *  - Phiếu kế toán: mỗi dòng nhập đủ tài khoản Nợ, tài khoản Có, số tiền.
 *  - Hai ô đánh dấu phía trên bảng mở thêm phần nhập cho từng dòng:
 *      "Khoản mục, bộ phận, hợp đồng"  — chiều phân tích chi phí
 *      "Thuế GTGT, hoá đơn"            — loại thuế, tiền thuế, số / ký hiệu / ngày hoá đơn, đơn vị trên hoá đơn
 *    Phần này tự mở khi phiếu đang sửa đã có số liệu, hoặc khi tài khoản vừa chọn yêu cầu.
 * Bấm Ghi là ghi sổ ngay. Sửa phiếu đã ghi: bút toán cũ được đảo bằng ghi số âm, ghi bút toán mới.
 * Phiếu thu / chi có đối tượng: ô "Thanh toán cho khoản công nợ" mở bảng các khoản còn mở của đối tượng để chọn
 *   phiếu này trả cho khoản nào (settle); phần không chọn nằm lại là khoản trả trước, đối trừ sau ở màn CN01.
 * Chế độ mẫu (prop `template`): soạn bút toán mẫu — không có ngày, số tiền được để 0, Ghi lưu vào danh mục mẫu.
 * `initial`: điền sẵn phiếu mới từ một bút toán mẫu ({ky}, {thang}, {nam} trong diễn giải thay theo ngày phiếu khi ghi).
 */
import { workBranch } from '@/lib/workBranch';
import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useBankAccounts } from '../catalog/BankAccountsPage';
import { VOUCHER_MONEY, fillPeriodText, isMoneyAccountFor, type VoucherInput, type VoucherTemplateInput, type VoucherType } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { date as showDate, money, today } from '@/lib/format';
import { useBranches, BranchPicker } from '@/components/filters';
import { Field, Modal, useViewAgain } from '@/components/ui';
import { VOUCHER_SCREEN, VOUCHER_TEMPLATES, signRolesOf, type PrintSheet } from './VoucherPrint';
import { PrintButton } from '@/components/print';
import { SignaturePanel, useSignatures } from './Signatures';
import { AccountPicker, ListPicker, PartnerPicker } from '@/components/pickers';

export const VOUCHER_META: Record<VoucherType, { title: string; code: string; path: string; helpKey: string; party: string; moneyLabel: string; counterLabel: string }> = {
  receipt: { title: 'Phiếu thu', code: 'ACC51', path: '/nghiep-vu/phieu-thu', helpKey: 'phieu-thu-chi', party: 'Người nộp tiền', moneyLabel: 'Thu vào quỹ tiền mặt (TK Nợ)', counterLabel: 'TK ghi Có' },
  payment: { title: 'Phiếu chi', code: 'ACC52', path: '/nghiep-vu/phieu-chi', helpKey: 'phieu-thu-chi', party: 'Người nhận tiền', moneyLabel: 'Chi từ quỹ tiền mặt (TK Có)', counterLabel: 'TK ghi Nợ' },
  bank_payment: { title: 'Phiếu báo nợ', code: 'ACC53', path: '/nghiep-vu/phieu-bao-no', helpKey: 'phieu-bao-no-bao-co', party: 'Đơn vị nhận tiền', moneyLabel: 'Chi từ tài khoản ngân hàng (TK Có)', counterLabel: 'TK ghi Nợ' },
  bank_receipt: { title: 'Phiếu báo có', code: 'ACC54', path: '/nghiep-vu/phieu-bao-co', helpKey: 'phieu-bao-no-bao-co', party: 'Đơn vị chuyển tiền', moneyLabel: 'Thu vào tài khoản ngân hàng (TK Nợ)', counterLabel: 'TK ghi Có' },
  manual: { title: 'Phiếu kế toán', code: 'ACC16', path: '/nghiep-vu/phieu-ke-toan', helpKey: 'phieu-ke-toan', party: 'Người liên quan', moneyLabel: '', counterLabel: '' },
};

interface Account { code: string; name: string; isPosting: boolean; trackPartner: boolean; isDebt?: boolean; normalSide: string; trackCostItem: boolean; trackDepartment: boolean; trackContract: boolean; trackEmployee: boolean; trackCase: boolean; trackProject: boolean; trackCapitalSource: boolean }
interface Dimension { code: string; name: string; isActive: boolean }
interface TaxCode { code: string; name: string; rate: number; direction: string; isActive: boolean }
interface OpenItem { id: string; docNo: string; docDate: string; dueDate: string; accountCode: string; remaining: number; overdueDays: number }
interface LineDraft {
  debit: string; credit: string; amount: string; description: string; creditPartner: string;
  costItem: string; department: string; contract: string; employee: string; case: string; project: string; capitalSource: string; cashflowCode: string;
  taxCode: string; taxAmount: string; invoiceNo: string; invoiceSerial: string; invoiceDate: string; invoicePartnerName: string; invoicePartnerTaxCode: string;
}
export interface ExistingVoucher { id: string; docKey: string; docNo: string; status: string; version: number; payload: VoucherInput; canModify?: boolean; modifyBlockedReason?: string | null; createdByName?: string | null }
/** Bút toán mẫu đang soạn (chế độ mẫu của hộp phiếu). */
export interface TemplateDraft { code: string; name: string; isActive: boolean; isNew: boolean; voucher?: VoucherTemplateInput }

/** Chỉ tiêu báo cáo lưu chuyển tiền tệ (B03-DN trực tiếp) chọn được trên dòng phiếu tiền. */
export const CASHFLOW_CODES: [string, string][] = [
  ['01', 'Thu bán hàng, cung cấp dịch vụ'], ['02', 'Chi trả người cung cấp'], ['03', 'Chi trả người lao động'], ['04', 'Chi phí đi vay đã trả'],
  ['05', 'Nộp thuế TNDN'], ['06', 'Thu khác từ hoạt động kinh doanh'], ['07', 'Chi khác cho hoạt động kinh doanh'],
  ['21', 'Chi mua sắm TSCĐ'], ['22', 'Thu thanh lý TSCĐ'], ['23', 'Chi cho vay'], ['24', 'Thu hồi cho vay'], ['25', 'Chi góp vốn'], ['26', 'Thu hồi góp vốn'], ['27', 'Thu lãi cho vay, cổ tức'],
  ['31', 'Nhận vốn góp'], ['32', 'Trả lại vốn góp'], ['33', 'Thu từ đi vay'], ['34', 'Trả nợ gốc vay'], ['35', 'Trả nợ thuê tài chính'], ['36', 'Trả cổ tức, lợi nhuận'],
];
const blankLine = (): LineDraft => ({ debit: '', credit: '', amount: '', description: '', creditPartner: '', costItem: '', department: '', contract: '', employee: '', case: '', project: '', capitalSource: '', cashflowCode: '', taxCode: '', taxAmount: '', invoiceNo: '', invoiceSerial: '', invoiceDate: '', invoicePartnerName: '', invoicePartnerTaxCode: '' });
/** Đọc số tiền người dùng gõ (bỏ dấu chấm, phẩy, khoảng trắng phân cách nghìn). */
const parseAmount = (s: string): number => Number(s.replace(/[.,\s]/g, '')) || 0;
const showAmount = (s: string): string => (parseAmount(s) ? money(parseAmount(s)) : '');
const useDimension = (kind: string) => useQuery({ queryKey: ['dimensions', kind], queryFn: () => api.get<Dimension[]>(`/api/v1/dimensions/${kind}`), staleTime: 60_000 });

export function VoucherForm({ type, existing, initial, template, onClose, onSaved }: { type: VoucherType; existing?: ExistingVoucher; initial?: VoucherTemplateInput; template?: TemplateDraft; onClose: () => void; onSaved: (docNo: string, docDate: string) => void }) {
  const qc = useQueryClient();
  const meta = VOUCHER_META[type];
  /** Phiếu có một tài khoản tiền chung cho cả phiếu (thu, chi, báo có, báo nợ). */
  const cash = VOUCHER_MONEY[type] !== null;
  /** Phía tài khoản tiền của phiếu. */
  const moneySide: 'debit' | 'credit' = VOUCHER_MONEY[type]?.side ?? 'debit';
  const counterSide: 'debit' | 'credit' = moneySide === 'debit' ? 'credit' : 'debit';
  const p: (Omit<VoucherTemplateInput, 'name' | 'docType' | 'isActive'> & { docDate?: string }) | undefined = existing?.payload ?? template?.voucher ?? initial;
  const [tpl, setTpl] = useState({ code: template?.code ?? '', name: template?.name ?? '', isActive: template?.isActive ?? true });
  const cancelled = existing?.status === 'cancelled';
  /** Đã huỷ, hoặc phiếu của người khác mà mình không có quyền sửa. */
  const readOnly = cancelled || existing?.canModify === false;

  const { data: branches } = useBranches();
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts', 'posting'], queryFn: () => api.get<Account[]>('/api/v1/accounts', { postingOnly: true }), staleTime: 60_000 });
  const { data: taxCodes = [] } = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 });
  const costItems = useDimension('cost_item').data ?? [];
  const departments = useDimension('department').data ?? [];
  const contracts = useDimension('contract').data ?? [];
  const employees = useDimension('employee').data ?? [];
  const banks = useBankAccounts().data ?? [];
  const cases = useDimension('case').data ?? [];
  const projects = useDimension('project').data ?? [];
  const capitalSources = useDimension('capital_source').data ?? [];
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);
  const moneyAccounts = useMemo(() => (cash ? accounts.filter((a) => isMoneyAccountFor(type, a.code)) : []), [accounts, cash, type]);

  const [h, setH] = useState({
    branchCode: p?.branchCode ?? workBranch.get(),
    docDate: p?.docDate ?? today(),
    description: p?.description ?? '',
    counterparty: p?.counterparty ?? '',
    partnerCode: p?.partnerCode ?? '',
    reference: p?.reference ?? '',
    moneyAccount: p?.lines[0] ? (moneySide === 'debit' ? p.lines[0].debitAccount : p.lines[0].creditAccount) : '',
  });
  const [lines, setLines] = useState<LineDraft[]>(
    p?.lines.length
      ? p.lines.map((l) => ({
          ...blankLine(),
          debit: l.debitAccount, credit: l.creditAccount, amount: l.amount ? money(l.amount) : '', description: l.description ?? '', creditPartner: l.creditPartnerCode ?? '',
          costItem: l.costItem ?? '', department: l.department ?? '', contract: l.contract ?? '', employee: l.employee ?? '', case: l.case ?? '', project: l.project ?? '', capitalSource: l.capitalSource ?? '', cashflowCode: l.cashflowCode ?? '',
          taxCode: l.taxCode ?? '', taxAmount: l.taxAmount ? money(l.taxAmount) : '', invoiceNo: l.invoiceNo ?? '', invoiceSerial: l.invoiceSerial ?? '',
          invoiceDate: l.invoiceDate ?? '', invoicePartnerName: l.invoicePartnerName ?? '', invoicePartnerTaxCode: l.invoicePartnerTaxCode ?? '',
        }))
      : [blankLine()],
  );
  const [showDims, setShowDims] = useState(Boolean(p?.lines.some((l) => l.costItem || l.department || l.contract || l.employee || l.case || l.project || l.capitalSource || l.cashflowCode)));
  const [showTax, setShowTax] = useState(Boolean(p?.lines.some((l) => l.taxCode || l.invoiceNo)));
  const [dueDate, setDueDate] = useState(existing?.payload.dueDate ?? '');
  /** Khoản công nợ phiếu này thanh toán: id khoản → số tiền (chuỗi đang gõ). */
  const [settle, setSettle] = useState<Record<string, string>>(Object.fromEntries((existing?.payload.settle ?? []).map((s) => [s.debtItemId, money(s.amount)])));
  const [showSettle, setShowSettle] = useState(Boolean(existing?.payload.settle?.length));
  const signatures = useSignatures(existing && existing.status !== 'cancelled' ? existing.id : undefined).data;
  const set = (patch: Partial<typeof h>) => setH((x) => ({ ...x, ...patch }));
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const branchCode = h.branchCode || branches?.find((b) => b.isActive)?.code || '';

  const partnerQ = useQuery({
    queryKey: ['partners', 'pick', h.partnerCode],
    queryFn: () => api.get<{ code: string; name: string }[]>('/api/v1/partners', { search: h.partnerCode, pageSize: 20 }),
    enabled: h.partnerCode.length >= 2,
    staleTime: 30_000,
  });
  const partnerName = partnerQ.data?.find((x) => x.code === h.partnerCode)?.name;
  // Khoản công nợ còn mở của đối tượng mà phiếu tiền này có thể thanh toán: phiếu thu trả khoản ghi Nợ, phiếu chi trả khoản ghi Có.
  const settleSide = moneySide === 'debit' ? 'debit' : 'credit';
  const openItemsQ = useQuery({
    queryKey: ['debt-items', 'settle', h.partnerCode, settleSide],
    queryFn: () => api.get<OpenItem[]>('/api/v1/debt-items', { partnerCode: h.partnerCode, side: settleSide, status: 'all', pageSize: 500 }),
    enabled: cash && !template && showSettle && Boolean(partnerName),
  });
  const openItems = (openItemsQ.data ?? []).filter((i) => i.remaining > 0 || settle[i.id]);
  const settleTotal = Object.values(settle).reduce((s, x) => s + parseAmount(x), 0);

  /** Hai tài khoản thật của một dòng (đã ghép tài khoản tiền chung của phiếu). */
  const accountsOf = (l: LineDraft) => [cash && moneySide === 'debit' ? h.moneyAccount : l.debit, cash && moneySide === 'credit' ? h.moneyAccount : l.credit].map((c) => accountMap.get(c.trim()));
  const filled = lines.filter((l) => l.debit || l.credit || parseAmount(l.amount));
  const subtotal = filled.reduce((s, l) => s + parseAmount(l.amount), 0);
  const taxTotal = filled.reduce((s, l) => s + parseAmount(l.taxAmount), 0);
  const total = subtotal + taxTotal;
  const needsPartner = filled.some((l) => accountsOf(l).some((a) => a?.trackPartner || a?.isDebt));
  // Chiều phân tích chỉ bắt buộc khi đơn vị đã khai danh mục của chiều đó.
  const need = (l: LineDraft, flag: 'trackCostItem' | 'trackDepartment' | 'trackContract' | 'trackEmployee' | 'trackCase' | 'trackProject' | 'trackCapitalSource', list: Dimension[]) => list.length > 0 && accountsOf(l).some((a) => a?.[flag]);
  const dimsVisible = showDims || filled.some((l) => need(l, 'trackCostItem', costItems) || need(l, 'trackDepartment', departments) || need(l, 'trackContract', contracts) || need(l, 'trackEmployee', employees) || need(l, 'trackCase', cases) || need(l, 'trackProject', projects) || need(l, 'trackCapitalSource', capitalSources));

  /** Chọn loại thuế: tự tính tiền thuế theo thuế suất nếu ô tiền thuế đang trống. */
  const pickTax = (i: number, code: string) => {
    const l = lines[i]!;
    const rate = taxCodes.find((t) => t.code === code)?.rate ?? 0;
    setLine(i, { taxCode: code, taxAmount: code ? (parseAmount(l.taxAmount) ? l.taxAmount : showAmount(String(Math.round((parseAmount(l.amount) * rate) / 100)))) : '' });
  };

  const body = (): VoucherInput => ({
    docType: type,
    branchCode,
    docDate: h.docDate,
    description: template ? h.description : fillPeriodText(h.description, h.docDate),
    counterparty: h.counterparty,
    partnerCode: h.partnerCode || undefined,
    reference: h.reference,
    purpose: existing?.payload.purpose,
    dueDate: dueDate || undefined,
    settle: cash && !template && (showSettle || existing?.payload.settle) ? Object.entries(settle).map(([debtItemId, s]) => ({ debtItemId, amount: parseAmount(s) })).filter((s) => s.amount > 0) : undefined,
    lines: filled.map((l) => ({
      debitAccount: cash && moneySide === 'debit' ? h.moneyAccount : l.debit.trim(),
      creditAccount: cash && moneySide === 'credit' ? h.moneyAccount : l.credit.trim(),
      amount: parseAmount(l.amount),
      description: template ? l.description : fillPeriodText(l.description, h.docDate),
      creditPartnerCode: l.creditPartner.trim() || undefined,
      costItem: l.costItem.trim() || undefined,
      department: l.department.trim() || undefined,
      contract: l.contract.trim() || undefined,
      employee: l.employee.trim() || undefined,
      case: l.case.trim() || undefined,
      project: l.project.trim() || undefined,
      capitalSource: l.capitalSource.trim() || undefined,
      cashflowCode: l.cashflowCode || undefined,
      taxCode: l.taxCode || undefined,
      taxAmount: parseAmount(l.taxAmount),
      invoiceNo: l.invoiceNo.trim() || undefined,
      invoiceSerial: l.invoiceSerial.trim() || undefined,
      invoiceDate: l.invoiceDate || undefined,
      invoicePartnerName: l.invoicePartnerName.trim() || undefined,
      invoicePartnerTaxCode: l.invoicePartnerTaxCode.trim() || undefined,
    })),
  });

  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: async () => {
      if (template) {
        const { docType, docDate: _d, docNo: _n, ...v } = body();
        await api.put(`/api/v1/voucher-templates/${encodeURIComponent(tpl.code)}`, { ...v, docType, name: tpl.name, isActive: tpl.isActive, branchCode: h.branchCode });
        return { docNo: tpl.code };
      }
      return existing ? api.put<{ docNo: string }>(`/api/v1/vouchers/${existing.id}`, body()) : api.post<{ docNo: string }>('/api/v1/vouchers', body());
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['voucher-templates'] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['document'] });
      if (existing || (template && !template.isNew)) viewAgain[1](); else onSaved(r.docNo, h.docDate);
    },
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => api.post('/api/v1/documents/cancel', { docKey: existing!.docKey, reason }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['documents'] }); onClose(); },
  });

  const canSave = template
    ? tpl.code.trim() && tpl.name.trim() && h.description.trim() && filled.length > 0 && (!cash || h.moneyAccount)
    : !readOnly && branchCode && h.description.trim() && filled.length > 0 && subtotal > 0 && (!cash || h.moneyAccount);
  const accName = (code: string) => (code ? accountMap.get(code)?.name ?? 'Chưa có trong danh mục tài khoản chi tiết' : '');
  const cols = (cash ? 1 : 2) + 3;
  const dimInput = (i: number, l: LineDraft, field: 'costItem' | 'department' | 'contract' | 'employee' | 'case' | 'project' | 'capitalSource', label: string, list: Dimension[], listId: string, required: boolean) => (
    <label className="sub-field">
      <span>{label}{required ? ' *' : ''}</span>
      <ListPicker items={list.filter((d) => d.isActive || d.code === l[field])} value={l[field]} disabled={readOnly} onChange={(v) => setLine(i, { [field]: v })} placeholder={list.length ? 'Bấm để chọn' : 'Chưa khai danh mục'} />
    </label>
  );

  return (
    <Modal viewAgain={viewAgain} viewFirst={Boolean((existing && !readOnly) || (template && !template.isNew))}
      wide
      title={template ? (template.isNew ? `Thêm bút toán mẫu — ${meta.title.toLowerCase()}` : `Bút toán mẫu ${template.code}`) : existing ? `${meta.title} ${existing.docNo}${cancelled ? ' (đã huỷ)' : ''}` : `Lập ${meta.title.toLowerCase()}${initial ? ' từ mẫu' : ''}`}
      onClose={onClose}
      footer={
        <>
          {existing && !readOnly && (
            <button data-view-ok className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={cancel.isPending} onClick={() => { const r = window.prompt('Lý do huỷ phiếu (bút toán sẽ được ghi số âm để đảo):'); if (r) cancel.mutate(r); }}>Huỷ phiếu</button>
          )}
          {existing && <span data-view-ok><PrintButton screen={VOUCHER_SCREEN[type]} templates={VOUCHER_TEMPLATES[type]} label="In phiếu" title="In phiếu theo nội dung đã ghi sổ"
            getDocs={(): PrintSheet[] => [{ type, docNo: existing.docNo, voucher: existing.payload, signatures, branchName: branches?.find((b) => b.code === existing.payload.branchCode)?.name ?? existing.payload.branchCode }]} /></span>}
          <button className="btn" onClick={onClose}>Đóng</button>
          {!readOnly && <button className="btn btn-primary" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>{template ? 'Ghi mẫu' : existing ? 'Ghi lại' : 'Ghi sổ'}</button>}
        </>
      }
    >
      {template && (
        <>
          <Field label="Mã mẫu"><input className="input mono" value={tpl.code} disabled={!template.isNew} onChange={(e) => setTpl((x) => ({ ...x, code: e.target.value.trim() }))} /></Field>
          <Field label="Tên mẫu"><input className="input" value={tpl.name} onChange={(e) => setTpl((x) => ({ ...x, name: e.target.value }))} placeholder="Ví dụ: Chi tiền thuê nhà HN01" /></Field>
          <Field label="Trạng thái"><label className="checkbox" style={{ height: 34 }}><input type="checkbox" checked={tpl.isActive} onChange={(e) => setTpl((x) => ({ ...x, isActive: e.target.checked }))} /> Đang dùng</label></Field>
          <div className="alert alert-info" style={{ gridColumn: 'span 1', margin: 0 }}>Diễn giải dùng được <b>{'{ky}'}</b>, <b>{'{thang}'}</b>, <b>{'{nam}'}</b>; số tiền để trống thì nhập khi lập phiếu.</div>
        </>
      )}
      <Field label="Chi nhánh">
        <BranchPicker activeOnly value={template ? h.branchCode : branchCode} disabled={readOnly} onChange={(c) => set({ branchCode: c })} placeholder={template ? '(Chọn khi lập phiếu)' : 'Gõ mã hoặc tên chi nhánh'} />
      </Field>
      {!template && <Field label="Ngày phiếu"><input type="date" className="input" value={h.docDate} disabled={readOnly} onChange={(e) => set({ docDate: e.target.value })} /></Field>}
      <Field label={meta.party}><input className="input" value={h.counterparty} disabled={readOnly} onChange={(e) => set({ counterparty: e.target.value })} /></Field>
      <Field label="Chứng từ kèm theo"><input className="input" value={h.reference} disabled={readOnly} onChange={(e) => set({ reference: e.target.value })} placeholder="Số hoá đơn, giấy báo…" /></Field>

      <div className="field" style={{ gridColumn: 'span 2' }}>
        <label>Diễn giải</label>
        <input className="input" value={h.description} disabled={readOnly} onChange={(e) => set({ description: e.target.value })} placeholder="Nội dung thu / chi / hạch toán" />
      </div>
      <Field label={`Đối tượng công nợ${needsPartner ? ' (bắt buộc)' : ''}`} hint={partnerName ?? (h.partnerCode ? 'Gõ mã hoặc tên rồi chọn trong danh sách' : undefined)}>
        <PartnerPicker activeOnly={!existing} value={h.partnerCode} disabled={readOnly} onChange={(partnerCode) => set({ partnerCode })} placeholder="Gõ mã, tên hoặc mã số thuế" />
      </Field>
      {!template && (needsPartner || dueDate) && <Field label="Hạn thanh toán" hint="Trống = ngày phiếu + hạn của đối tượng"><input type="date" className="input" value={dueDate} disabled={readOnly} onChange={(e) => setDueDate(e.target.value)} /></Field>}

      {cash && (
        <div className="field" style={{ gridColumn: 'span 2' }}>
          <label>{meta.moneyLabel}</label>
          <select className="select input" value={h.moneyAccount} disabled={readOnly} onChange={(e) => set({ moneyAccount: e.target.value })}>
            <option value="">— Chọn tài khoản tiền —</option>
            {moneyAccounts.map((a) => { const b = banks.find((x) => x.accountCode === a.code && x.isActive); return <option key={a.code} value={a.code}>{a.code} — {b ? `${b.bankName} ${b.accountNo}${b.holder ? ` (${b.holder})` : ''}` : a.name}</option>; })}
          </select>
        </div>
      )}
      <div className="field" style={{ gridColumn: cash ? 'span 2' : '1 / -1' }}>
        <label>Nhập thêm cho từng dòng</label>
        <div className="row" style={{ height: 34, gap: 18 }}>
          <label className="checkbox"><input type="checkbox" checked={dimsVisible} disabled={dimsVisible && !showDims} onChange={(e) => setShowDims(e.target.checked)} /> Khoản mục, bộ phận, hợp đồng</label>
          <label className="checkbox"><input type="checkbox" checked={showTax} onChange={(e) => setShowTax(e.target.checked)} /> Thuế GTGT, hoá đơn</label>
          {cash && !template && <label className="checkbox" title="Chọn phiếu này trả cho khoản công nợ nào của đối tượng"><input type="checkbox" checked={showSettle} disabled={readOnly || !h.partnerCode} onChange={(e) => setShowSettle(e.target.checked)} /> Thanh toán cho khoản công nợ</label>}
        </div>
      </div>

      <div className="full">
        <div style={{ maxHeight: '44vh', overflow: 'auto' }}>
          <table className="voucher-lines">
            <thead>
              <tr>
                {cash ? <th style={{ width: 190 }}>{meta.counterLabel}</th> : <><th style={{ width: 170 }}>TK Nợ</th><th style={{ width: 170 }}>TK Có</th></>}
                <th style={{ width: 170 }} className="num">{showTax ? 'Tiền chưa thuế' : 'Số tiền'}</th><th>Diễn giải dòng</th><th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <Fragment key={i}>
                  <tr>
                    {(cash ? [counterSide] : (['debit', 'credit'] as const)).map((side) => (
                      <td key={side}>
                        <AccountPicker postingOnly hideName className="input mono" value={l[side]} disabled={readOnly} onChange={(v) => setLine(i, { [side]: v })} placeholder="Bấm để chọn" />
                        <div className="acc-name">{accName(l[side])}</div>
                      </td>
                    ))}
                    <td><input className="input num" inputMode="numeric" value={l.amount} disabled={readOnly} onChange={(e) => setLine(i, { amount: e.target.value })} onBlur={() => setLine(i, { amount: showAmount(l.amount) })} placeholder="0" /></td>
                    <td><input className="input" value={l.description} disabled={readOnly} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Để trống = diễn giải chung" /></td>
                    <td>{!readOnly && lines.length > 1 && <button className="btn btn-sm btn-ghost" title="Xoá dòng" onClick={() => setLines((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}</td>
                  </tr>
                  {(dimsVisible || showTax || l.creditPartner) && (
                    <tr className="sub-row">
                      <td colSpan={cols}>
                        <div className="sub-fields">
                          {l.creditPartner && (
                            <label className="sub-field wide" title="Đối tượng riêng của bên Có (cấn trừ, chuyển nợ giữa hai đối tượng)">
                              <span>Đối tượng bên Có</span>
                              <PartnerPicker value={l.creditPartner} disabled={readOnly} onChange={(v) => setLine(i, { creditPartner: v })} placeholder="Gõ mã, tên" />
                            </label>
                          )}
                          {dimsVisible && (
                            <>
                              {dimInput(i, l, 'costItem', 'Khoản mục', costItems, 'voucher-cost-items', need(l, 'trackCostItem', costItems))}
                              {dimInput(i, l, 'department', 'Bộ phận', departments, 'voucher-departments', need(l, 'trackDepartment', departments))}
                              {dimInput(i, l, 'contract', 'Hợp đồng', contracts, 'voucher-contracts', need(l, 'trackContract', contracts))}
                              {dimInput(i, l, 'employee', 'Nhân viên', employees, 'voucher-employees', need(l, 'trackEmployee', employees))}
                              {(cases.length > 0 || l.case) && dimInput(i, l, 'case', 'Vụ việc', cases, 'voucher-cases', need(l, 'trackCase', cases))}
                              {(projects.length > 0 || l.project) && dimInput(i, l, 'project', 'Dự án', projects, 'voucher-projects', need(l, 'trackProject', projects))}
                              {(capitalSources.length > 0 || l.capitalSource) && dimInput(i, l, 'capitalSource', 'Nguồn vốn', capitalSources, 'voucher-capital-sources', need(l, 'trackCapitalSource', capitalSources))}
                              {cash && (
                                <label className="sub-field" title="Chỉ tiêu trên báo cáo lưu chuyển tiền tệ. Để trống: lấy theo lý do hoặc tự xếp theo tài khoản đối ứng.">
                                  <span>Lưu chuyển tiền tệ</span>
                                  <select className="select input" value={l.cashflowCode} disabled={readOnly} onChange={(e) => setLine(i, { cashflowCode: e.target.value })}>
                                    <option value="">Tự xếp</option>
                                    {CASHFLOW_CODES.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
                                  </select>
                                </label>
                              )}
                            </>
                          )}
                          {showTax && (
                            <>
                              <label className="sub-field">
                                <span>Loại thuế</span>
                                <select className="select input" value={l.taxCode} disabled={readOnly} onChange={(e) => pickTax(i, e.target.value)}>
                                  <option value="">Không có thuế</option>
                                  {taxCodes.filter((t) => t.isActive).map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
                                </select>
                              </label>
                              <label className="sub-field"><span>Tiền thuế</span><input className="input num" inputMode="numeric" value={l.taxAmount} disabled={readOnly || !l.taxCode} onChange={(e) => setLine(i, { taxAmount: e.target.value })} onBlur={() => setLine(i, { taxAmount: showAmount(l.taxAmount) })} /></label>
                              <label className="sub-field"><span>Ký hiệu HĐ</span><input className="input mono" value={l.invoiceSerial} disabled={readOnly || !l.taxCode} onChange={(e) => setLine(i, { invoiceSerial: e.target.value })} /></label>
                              <label className="sub-field"><span>Số hoá đơn</span><input className="input mono" value={l.invoiceNo} disabled={readOnly || !l.taxCode} onChange={(e) => setLine(i, { invoiceNo: e.target.value })} /></label>
                              <label className="sub-field"><span>Ngày hoá đơn</span><input type="date" className="input" value={l.invoiceDate} disabled={readOnly || !l.taxCode} onChange={(e) => setLine(i, { invoiceDate: e.target.value })} /></label>
                              <label className="sub-field wide"><span>Đơn vị trên hoá đơn</span><input className="input" value={l.invoicePartnerName} disabled={readOnly || !l.taxCode} onChange={(e) => setLine(i, { invoicePartnerName: e.target.value })} placeholder={h.counterparty || 'Tên người bán'} /></label>
                              <label className="sub-field"><span>Mã số thuế</span><input className="input mono" value={l.invoicePartnerTaxCode} disabled={readOnly || !l.taxCode} onChange={(e) => setLine(i, { invoicePartnerTaxCode: e.target.value })} /></label>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={cash ? 1 : 2}>{!readOnly && <button className="btn btn-sm" onClick={() => setLines((xs) => [...xs, blankLine()])}><Plus size={14} /> Thêm dòng</button>}</td>
                <td className="num">{money(subtotal, { blankZero: false })}</td>
                <td colSpan={2} className="muted" style={{ fontWeight: 400 }}>
                  {taxTotal > 0 ? <>Tiền chưa thuế · Thuế <b>{money(taxTotal)}</b> · Tổng thanh toán <b style={{ color: 'var(--ink-900)' }}>{money(total)}</b></> : 'Tổng số tiền'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {cash && !template && showSettle && (
        <div className="full">
          <h3 style={{ fontSize: 14, margin: '4px 0 6px' }}>Khoản công nợ còn mở của {partnerName ?? h.partnerCode} — phiếu này thanh toán cho khoản nào</h3>
          {!partnerName ? <div className="muted">Chọn đối tượng công nợ trước.</div> : openItemsQ.isLoading ? <div className="muted">Đang tải…</div> : !openItems.length ? <div className="muted">Đối tượng không còn khoản nào để thanh toán; số tiền của phiếu sẽ nằm lại là khoản trả trước.</div> : (
            <div style={{ maxHeight: '26vh', overflow: 'auto' }}>
              <table className="grid">
                <thead><tr><th>Hạn TT</th><th>Ngày CT</th><th>Số chứng từ</th><th>TK</th><th className="num">Còn lại</th><th className="num" style={{ width: 170 }}>Trả lần này</th></tr></thead>
                <tbody>
                  {openItems.map((i) => (
                    <tr key={i.id}>
                      <td className={i.overdueDays ? 'text-bad' : undefined}>{showDate(i.dueDate)}</td><td>{showDate(i.docDate)}</td><td className="mono">{i.docNo}</td><td className="mono">{i.accountCode}</td><td className="num">{money(i.remaining, { blankZero: false })}</td>
                      <td><input className="input num" inputMode="numeric" disabled={readOnly} value={settle[i.id] ?? ''} placeholder="0" onChange={(e) => setSettle((s) => ({ ...s, [i.id]: e.target.value }))} onBlur={() => setSettle((s) => ({ ...s, [i.id]: showAmount(s[i.id] ?? '') }))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {settleTotal > 0 && <div className="muted" style={{ marginTop: 6 }}>Thanh toán cho các khoản đã chọn: <b>{money(settleTotal)}</b>{total > settleTotal ? <> · phần còn lại <b>{money(total - settleTotal)}</b> là khoản trả trước, đối trừ sau ở màn Khoản công nợ và đối trừ</> : null}</div>}
          <div className="muted" style={{ fontSize: 12 }}>Dòng phiếu phải ghi vào đúng tài khoản công nợ (cột TK) của khoản được chọn.</div>
        </div>
      )}
      {existing && !cancelled && <SignaturePanel id={existing.id} roles={signRolesOf(type)} />}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
      {cancel.error && <div className="alert alert-bad full">{errorText(cancel.error)}</div>}
      {existing && !cancelled && existing.canModify === false && (
        <div className="alert alert-warn full">{existing.modifyBlockedReason ?? `Phiếu do ${existing.createdByName ?? 'người khác'} lập. Bạn chỉ xem được; sửa / huỷ cần kế toán trưởng.`}</div>
      )}
      {existing && !readOnly && <div className="alert alert-info full">Phiếu đã ghi sổ (phiên bản {existing.version}). Bấm "Ghi lại" sẽ đảo bút toán cũ bằng ghi số âm và ghi bút toán mới.</div>}
    </Modal>
  );
}
