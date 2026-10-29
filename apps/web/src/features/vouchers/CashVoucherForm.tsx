/**
 * Form Phiếu thu / Phiếu chi / Phiếu báo có / Phiếu báo nợ, xếp như form phiếu thu chi quen thuộc của kế toán.
 *
 *   Thanh nút : Ghi, Ghi và thêm mới, In, Xuất, Xóa, Đóng.
 *   Đầu phiếu : cột 1 Số chứng từ, Ngày chứng từ, Tài khoản nợ (phiếu chi: Tài khoản có), Tiền tệ + tỷ giá, Số tiền,
 *               Ngân hàng (phiếu báo có / báo nợ), nút Tìm chứng từ;
 *               cột 2 Lý do, Nhân viên, Khách hàng, Điện thoại, Địa chỉ, Diễn giải;
 *               cột 3 Chi nhánh, Tên NV, Tên KH, Người nộp (phiếu chi: Người nhận).
 *   Chi tiết  : "Thêm chi tiết phiếu" / "Xóa chi tiết phiếu"; lưới Tài khoản, Nợ, Có, Đối tượng, Mã lưu chuyển tiền tệ,
 *               Diễn giải, Thuế, Nhân viên, Tiền thuế, thông tin hoá đơn, chứng từ thanh toán, Khoản mục, Bộ phận, Hợp đồng.
 *
 * Ghi sổ: tài khoản tiền ở đầu phiếu đối ứng với tài khoản từng dòng.
 *   Phiếu thu, báo có: dòng nhập ở cột Có  → Nợ TK tiền / Có TK dòng.
 *   Phiếu chi, báo nợ: dòng nhập ở cột Nợ  → Nợ TK dòng / Có TK tiền.
 *   Số tiền đầu phiếu phải bằng tổng tiền các dòng cộng tiền thuế.
 * "Tìm chứng từ": chọn chứng từ còn nợ của khách hàng / nhà cung cấp, mỗi chứng từ thành một dòng trả đúng số còn nợ;
 *   dòng mang chứng từ nào thì phiếu thanh toán cho khoản công nợ đó.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSearch, Plus, Trash2, X } from 'lucide-react';
import { VOUCHER_MONEY, isMoneyAccountFor, type VoucherInput, type VoucherTemplateInput, type VoucherType } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { date as showDate, money, today } from '@/lib/format';
import { BranchPicker, useBranches } from '@/components/filters';
import { AccountPicker, ListPicker, PartnerPicker } from '@/components/pickers';
import { useBankAccounts } from '../catalog/BankAccountsPage';
import { CASHFLOW_CODES, VOUCHER_META, type ExistingVoucher } from './VoucherForm';
import { VOUCHER_SCREEN, VOUCHER_TEMPLATES, signRolesOf, type PrintSheet } from './VoucherPrint';
import { PrintButton } from '@/components/print';
import { SignaturePanel, useSignatures } from './Signatures';
import { C, L, VoucherModal, readOnlyReason, useVoucherSave } from '@/components/voucher/VoucherModal';
import { useDimension } from '@/components/voucher/lookups';

interface Account { code: string; name: string; isPosting: boolean; trackPartner: boolean; isDebt?: boolean; normalSide: string; trackCostItem: boolean; trackDepartment: boolean; trackContract: boolean; trackEmployee: boolean }
interface Dimension { code: string; name: string; isActive: boolean }
interface TaxCode { code: string; name: string; rate: number; isActive: boolean }
interface Reason { code: string; name: string; kind: string; counterAccount: string | null; isActive: boolean }
interface PartnerInfo { code: string; name: string; phone?: string | null; mobile?: string | null; address?: string | null; contactName?: string | null }
interface OpenItem { id: string; docNo: string; docDate: string; dueDate: string; accountCode: string; amount: number; remaining: number; description: string }

interface Row {
  key: number;
  account: string; amount: string; partner: string; creditPartner: string; cashflowCode: string; description: string;
  taxCode: string; employee: string; taxAmount: string; invoiceDate: string; costItem: string; invoiceNo: string; invoiceSerial: string; invoiceForm: string;
  invoicePartnerName: string; invoicePartnerTaxCode: string; department: string; contract: string; case: string; project: string; capitalSource: string;
  settleItemId: string; settleDocNo: string; settleDocDate: string; settleTotal: number | null; settleRemaining: number | null;
}

let seq = 0;
const blankRow = (patch: Partial<Row> = {}): Row => ({
  key: ++seq, account: '', amount: '', partner: '', creditPartner: '', cashflowCode: '', description: '', taxCode: '', employee: '', taxAmount: '', invoiceDate: '', costItem: '',
  invoiceNo: '', invoiceSerial: '', invoiceForm: '', invoicePartnerName: '', invoicePartnerTaxCode: '', department: '', contract: '', case: '', project: '', capitalSource: '',
  settleItemId: '', settleDocNo: '', settleDocDate: '', settleTotal: null, settleRemaining: null, ...patch,
});
export const parseAmount = (s: string): number => Number(s.replace(/[.,\s]/g, '')) || 0;
export const showAmount = (s: string): string => (parseAmount(s) ? money(parseAmount(s)) : '');
export { useDimension } from '@/components/voucher/lookups';

export function CashVoucherForm({ type, existing, initial, onClose, onSaved }: {
  type: Exclude<VoucherType, 'manual'>;
  existing?: ExistingVoucher;
  initial?: VoucherTemplateInput;
  onClose: () => void;
  /** addNew = bấm "Ghi và thêm mới": mở tiếp phiếu trống. */
  onSaved: (docNo: string, docDate: string, addNew: boolean) => void;
}) {
  const qc = useQueryClient();
  const meta = VOUCHER_META[type];
  const moneySide = VOUCHER_MONEY[type]!.side;
  /** Phiếu thu, báo có: dòng nhập cột Có. Phiếu chi, báo nợ: dòng nhập cột Nợ. */
  const lineSide: 'debit' | 'credit' = moneySide === 'debit' ? 'credit' : 'debit';
  const isBank = type === 'bank_receipt' || type === 'bank_payment';
  const p = existing?.payload ?? initial;
  /** Phiếu đang mở hoặc phiếu được copy: có đủ các ô đầu phiếu (bút toán mẫu thì không có). */
  const pv = p as Partial<VoucherInput> | undefined;
  const cancelled = existing?.status === 'cancelled';
  const readOnly = cancelled || existing?.canModify === false;

  const { data: branches } = useBranches();
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts', 'posting'], queryFn: () => api.get<Account[]>('/api/v1/accounts', { postingOnly: true }), staleTime: 60_000 });
  const { data: taxCodes = [] } = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 });
  const { data: reasons = [] } = useQuery({ queryKey: ['reasons'], queryFn: () => api.get<Reason[]>('/api/v1/posting/reasons'), staleTime: 60_000 });
  const employees = useDimension('employee');
  const costItems = useDimension('cost_item');
  const departments = useDimension('department');
  const contracts = useDimension('contract');
  const banks = useBankAccounts().data ?? [];
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);
  const moneyAccounts = useMemo(() => accounts.filter((a) => isMoneyAccountFor(type, a.code)), [accounts, type]);
  const reasonKind = moneySide === 'debit' ? 'receipt' : 'payment';
  const reasonList = reasons.filter((r) => r.kind === reasonKind && (r.isActive || r.code === pv?.reasonCode));

  const [h, setH] = useState({
    docNo: existing?.docNo ?? '',
    branchCode: p?.branchCode || branches?.find((b) => b.isActive)?.code || '',
    docDate: (existing?.payload.docDate ?? today()) as string,
    moneyAccount: p?.lines[0] ? (moneySide === 'debit' ? p.lines[0].debitAccount : p.lines[0].creditAccount) : '',
    amount: p ? money(p.lines.reduce((s, l) => s + l.amount + (l.taxAmount ?? 0), 0)) : '',
    reasonCode: pv?.reasonCode ?? '',
    employeeCode: pv?.employeeCode ?? '',
    partnerCode: p?.partnerCode ?? '',
    partnerName: pv?.partnerName ?? '',
    phone: pv?.phone ?? '',
    address: pv?.address ?? '',
    counterparty: p?.counterparty ?? '',
    description: p?.description ?? '',
  });
  const set = (patch: Partial<typeof h>) => setH((x) => ({ ...x, ...patch }));
  const branchCode = h.branchCode || branches?.find((b) => b.isActive)?.code || '';
  const [rows, setRows] = useState<Row[]>(() =>
    (p?.lines ?? []).map((l) =>
      blankRow({
        account: lineSide === 'credit' ? l.creditAccount : l.debitAccount,
        amount: l.amount ? money(l.amount) : '', partner: l.partnerCode ?? '', creditPartner: l.creditPartnerCode ?? '', cashflowCode: l.cashflowCode ?? '', description: l.description ?? '',
        taxCode: l.taxCode ?? '', employee: l.employee ?? '', taxAmount: l.taxAmount ? money(l.taxAmount) : '', invoiceDate: l.invoiceDate ?? '', costItem: l.costItem ?? '',
        invoiceNo: l.invoiceNo ?? '', invoiceSerial: l.invoiceSerial ?? '', invoiceForm: l.invoiceForm ?? '', invoicePartnerName: l.invoicePartnerName ?? '', invoicePartnerTaxCode: l.invoicePartnerTaxCode ?? '',
        department: l.department ?? '', contract: l.contract ?? '', case: l.case ?? '', project: l.project ?? '', capitalSource: l.capitalSource ?? '',
        settleItemId: l.settleItemId ?? '', settleDocNo: l.settleDocNo ?? '', settleDocDate: l.settleDocDate ?? '', settleTotal: l.settleTotal ?? null, settleRemaining: l.settleRemaining ?? null,
      }),
    ),
  );
  const [activeKey, setActiveKey] = useState<number | null>(null);
  const [finding, setFinding] = useState(false);
  const signatures = useSignatures(existing && !cancelled ? existing.id : undefined).data;
  const setRow = (key: number, patch: Partial<Row>) => setRows((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  // Khách hàng / nhà cung cấp: chọn mã thì điền Tên KH, Người nộp (người đại diện), Điện thoại, Địa chỉ.
  const partnerQ = useQuery({
    queryKey: ['partners', 'pick', h.partnerCode],
    queryFn: () => api.get<PartnerInfo[]>('/api/v1/partners', { search: h.partnerCode, pageSize: 20 }),
    enabled: h.partnerCode.length >= 2,
    staleTime: 30_000,
  });
  const pickPartner = async (code: string) => {
    set({ partnerCode: code });
    if (!code) return set({ partnerCode: '', partnerName: '', phone: '', address: '' });
    const list = await qc.fetchQuery({ queryKey: ['partners', 'pick', code], queryFn: () => api.get<PartnerInfo[]>('/api/v1/partners', { search: code, pageSize: 20 }), staleTime: 30_000 });
    const x = list.find((r) => r.code === code);
    if (x) set({ partnerCode: code, partnerName: x.name, counterparty: x.contactName || x.name, phone: x.mobile || x.phone || '', address: x.address || '' });
  };
  const partnerName = h.partnerName || partnerQ.data?.find((x) => x.code === h.partnerCode)?.name || '';
  const employeeName = employees.find((e) => e.code === h.employeeCode)?.name ?? '';

  const total = rows.reduce((s, r) => s + parseAmount(r.amount), 0);
  const taxTotal = rows.reduce((s, r) => s + parseAmount(r.taxAmount), 0);

  /** Thêm chi tiết phiếu: tài khoản theo lý do, số tiền bằng số tiền đầu phiếu, đối tượng / nhân viên / diễn giải theo đầu phiếu. */
  const addRow = () => {
    const r = blankRow({
      account: reasons.find((x) => x.code === h.reasonCode)?.counterAccount ?? '',
      amount: h.amount, partner: h.partnerCode, employee: h.employeeCode, description: h.description,
    });
    setRows((xs) => [...xs, r]);
    setActiveKey(r.key);
  };
  const removeRow = (key: number | null) => key !== null && setRows((xs) => xs.filter((x) => x.key !== key));

  const pickTax = (r: Row, code: string) => {
    const rate = taxCodes.find((t) => t.code === code)?.rate ?? 0;
    setRow(r.key, { taxCode: code, taxAmount: code ? (parseAmount(r.taxAmount) ? r.taxAmount : showAmount(String(Math.round((parseAmount(r.amount) * rate) / 100)))) : '' });
  };

  /** Kiểm tra trước khi ghi, theo thứ tự và lời báo của form phiếu thu chi. */
  const check = (): string | null => {
    if (!branchCode) return 'Bạn chưa chọn chi nhánh';
    if (!h.moneyAccount) return `${moneySide === 'debit' ? 'Tài khoản nợ' : 'Tài khoản có'} không được để trống`;
    if (!accountMap.has(h.moneyAccount)) return 'Tài khoản không có trong danh mục';
    if (employees.length > 0 && !h.employeeCode) return 'Bạn chưa chọn nhân viên';
    if (rows.length === 0) return 'Phiếu chưa có chi tiết';
    for (const [i, r] of rows.entries()) {
      const row = `Dòng ${i + 1}: `;
      if (!r.account) return `${row}tài khoản không được phép để trống`;
      const acc = accountMap.get(r.account);
      if (!acc) return `${row}tài khoản không có trong danh mục`;
      if (!parseAmount(r.amount)) return `${row}chưa nhập số tiền ${lineSide === 'credit' ? 'Có' : 'Nợ'}`;
      if (r.settleRemaining && parseAmount(r.amount) > r.settleRemaining) return `${row}số tiền phải nhỏ hơn hoặc bằng số tiền còn nợ trên hóa đơn`;
      if (parseAmount(r.taxAmount) > 0 && !r.taxCode) return `${row}bạn chưa chọn loại thuế.`;
      if ((acc.trackPartner || acc.isDebt || acc.normalSide === 'both') && !(r.partner || h.partnerCode)) return `${row}tài khoản bắt buộc phải chọn đối tượng`;
      if (acc.trackCostItem && costItems.length && !r.costItem) return `${row}tài khoản này bắt buộc phải chọn khoản mục`;
      if (acc.trackContract && contracts.length && !r.contract) return `${row}tài khoản bắt buộc phải chọn hợp đồng`;
      if (acc.trackDepartment && departments.length && !r.department) return `${row}tài khoản bắt buộc phải chọn bộ phận`;
    }
    if (Math.round(parseAmount(h.amount)) !== Math.round(total + taxTotal)) return `Số tiền trên phiếu (${money(parseAmount(h.amount), { blankZero: false })}) phải bằng tổng tiền chi tiết cộng tiền thuế (${money(total + taxTotal, { blankZero: false })})`;
    return null;
  };

  // Phiếu cũ thanh toán công nợ không qua dòng (chọn khoản công nợ riêng): giữ nguyên các khoản đó khi ghi lại.
  const legacySettle = existing?.payload.settle && !existing.payload.lines.some((l) => l.settleItemId) ? existing.payload.settle : undefined;
  const body = (): VoucherInput => {
    const reason = reasons.find((r) => r.code === h.reasonCode);
    const settleMap = new Map<string, number>();
    for (const r of rows) if (r.settleItemId) settleMap.set(r.settleItemId, (settleMap.get(r.settleItemId) ?? 0) + parseAmount(r.amount));
    return {
      docType: type,
      branchCode,
      docDate: h.docDate,
      docNo: existing ? undefined : h.docNo.trim() || undefined,
      description: h.description.trim() || reason?.name || meta.title,
      counterparty: h.counterparty,
      partnerCode: h.partnerCode || undefined,
      reference: existing?.payload.reference ?? '',
      reasonCode: h.reasonCode || undefined,
      employeeCode: h.employeeCode || undefined,
      partnerName: partnerName || undefined,
      phone: h.phone || undefined,
      address: h.address || undefined,
      purpose: existing?.payload.purpose,
      dueDate: existing?.payload.dueDate,
      settle: legacySettle ?? [...settleMap].map(([debtItemId, amount]) => ({ debtItemId, amount })),
      lines: rows.map((r) => ({
        debitAccount: lineSide === 'debit' ? r.account : h.moneyAccount,
        creditAccount: lineSide === 'credit' ? r.account : h.moneyAccount,
        amount: parseAmount(r.amount),
        description: r.description,
        partnerCode: r.partner || undefined,
        creditPartnerCode: r.creditPartner || undefined,
        costItem: r.costItem || undefined, department: r.department || undefined, contract: r.contract || undefined, employee: r.employee || undefined,
        case: r.case || undefined, project: r.project || undefined, capitalSource: r.capitalSource || undefined, cashflowCode: r.cashflowCode || undefined,
        taxCode: r.taxCode || undefined, taxAmount: parseAmount(r.taxAmount), invoiceNo: r.invoiceNo || undefined, invoiceSerial: r.invoiceSerial || undefined,
        invoiceForm: r.invoiceForm || undefined, invoiceDate: r.invoiceDate || undefined, invoicePartnerName: r.invoicePartnerName || undefined, invoicePartnerTaxCode: r.invoicePartnerTaxCode || undefined,
        settleItemId: r.settleItemId || undefined, settleDocNo: r.settleDocNo || undefined, settleDocDate: r.settleDocDate || undefined,
        settleTotal: r.settleTotal ?? undefined, settleRemaining: r.settleRemaining ?? undefined,
      })),
    };
  };

  const { doSave, doDelete, saving, error, setProblem } = useVoucherSave({
    existing, check, docDate: h.docDate, onSaved, onClose,
    confirm: 'Bạn có chắc chắn muốn Ghi phiếu này không?',
    invalidate: [['documents']],
    submit: () => (existing ? api.put<{ docNo: string }>(`/api/v1/vouchers/${existing.id}`, body()) : api.post<{ docNo: string }>('/api/v1/vouchers', body())),
  });

  /** Xuất lưới chi tiết ra tệp Excel (CSV). */
  const exportRows = () => {
    const head = ['Tài khoản', 'Nợ', 'Có', 'Đối tượng', 'Mã lưu chuyển tiền tệ', 'Diễn giải', 'Thuế', 'Nhân viên', 'Tiền thuế', 'Ngày HĐ', 'Khoản mục', 'Số HĐ', 'Số seri', 'Mẫu HĐ', 'Đối tượng thuế VAT', 'Mã số thuế', 'Số hóa đơn', 'Ngày hóa đơn', 'Tổng tiền HĐ', 'Số còn nợ', 'Bộ phận', 'Hợp đồng'];
    const body = rows.map((r) => {
      const amt = parseAmount(r.amount);
      return [r.account, lineSide === 'debit' ? amt : 0, lineSide === 'credit' ? amt : 0, r.partner, r.cashflowCode, r.description, r.taxCode, r.employee, parseAmount(r.taxAmount), r.invoiceDate, r.costItem,
        r.invoiceNo, r.invoiceSerial, r.invoiceForm, r.invoicePartnerName, r.invoicePartnerTaxCode, r.settleDocNo, r.settleDocDate, r.settleTotal ?? '', r.settleRemaining ?? '', r.department, r.contract];
    });
    const csv = [head, ...body].map((x) => x.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${meta.title} ${existing?.docNo ?? ''}.csv`.replace(/\s+\./, '.');
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const dis = readOnly;
  const amountCell = (r: Row, side: 'debit' | 'credit') =>
    side === lineSide
      ? <input className="input num" inputMode="numeric" value={r.amount} disabled={dis} onChange={(e) => setRow(r.key, { amount: e.target.value })} onBlur={() => setRow(r.key, { amount: showAmount(r.amount) })} />
      : <input className="input num" value="" disabled tabIndex={-1} />;
  const dimCell = (r: Row, field: 'costItem' | 'department' | 'contract' | 'employee', list: Dimension[]) => (
    <ListPicker items={list.filter((d) => d.isActive || d.code === r[field])} value={r[field]} disabled={dis} onChange={(v) => setRow(r.key, { [field]: v })} hideName />
  );
  const text = (r: Row, field: 'description' | 'invoiceNo' | 'invoiceSerial' | 'invoiceForm' | 'invoicePartnerName' | 'invoicePartnerTaxCode', cls = 'input') => (
    <input className={cls} value={r[field]} disabled={dis} onChange={(e) => setRow(r.key, { [field]: e.target.value })} />
  );

  return (
    <>
    <VoucherModal
      title={meta.title} existing={existing} readOnly={dis} saving={saving}
      onSave={() => doSave(false)} onSaveNew={() => doSave(true)} printSlot={<PrintButton bare screen={VOUCHER_SCREEN[type]} templates={VOUCHER_TEMPLATES[type]} disabled={!existing} getDocs={(): PrintSheet[] => (existing ? [{ type: type, docNo: existing.docNo, voucher: existing.payload, signatures, banks, branchName: branches?.find((b) => b.code === existing.payload.branchCode)?.name ?? existing.payload.branchCode }] : [])} />} onExport={exportRows} onDelete={doDelete} onClose={onClose}
      error={error} readOnlyText={readOnlyReason(existing, { external: false })}
    >
          {/* Đầu phiếu: lưới 6 cột (nhãn, ô) × 3; Địa chỉ, Diễn giải kéo dài từ cột 2 sang hết cột 3. */}
          <div className="vf-head-grid">
            <L c={1} r={1} req>Số chứng từ</L>
            <C c={1} r={1}><input className="input mono" value={h.docNo} disabled={dis || Boolean(existing)} placeholder="Tự cấp khi ghi" onChange={(e) => set({ docNo: e.target.value })} /></C>
            <L c={1} r={2} req>Ngày chứng từ</L>
            <C c={1} r={2}><input type="date" className="input" style={{ fontWeight: 700 }} value={h.docDate} disabled={dis} onChange={(e) => set({ docDate: e.target.value })} /></C>
            <L c={1} r={3} req>{moneySide === 'debit' ? 'Tài khoản nợ' : 'Tài khoản có'}</L>
            <C c={1} r={3}>
              <select className="select input" value={h.moneyAccount} disabled={dis} onChange={(e) => set({ moneyAccount: e.target.value })} title={accountMap.get(h.moneyAccount)?.name}>
                <option value="" />
                {moneyAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
              </select>
            </C>
            <L c={1} r={4}>Tiền tệ</L>
            <C c={1} r={4} pair>
              <select className="select input" value="VND" disabled><option value="VND">VND</option></select>
              <input className="input num" value="1,0000" disabled />
            </C>
            <L c={1} r={5} req>Số tiền</L>
            <C c={1} r={5} pair>
              <input className="input num" inputMode="numeric" value={h.amount} disabled={dis} placeholder="0" onChange={(e) => set({ amount: e.target.value })} onBlur={() => set({ amount: showAmount(h.amount) })} />
              <input className="input num" value={showAmount(h.amount) || '0'} disabled />
            </C>
            {isBank && <L c={1} r={6} req>Ngân hàng</L>}
            <C c={1} r={6} pair>
              {isBank ? (
                <select className="select input" value={banks.find((b) => b.accountCode === h.moneyAccount && b.isActive)?.code ?? ''} disabled={dis} onChange={(e) => { const b = banks.find((x) => x.code === e.target.value); if (b) set({ moneyAccount: b.accountCode }); }}>
                  <option value="" />
                  {banks.filter((b) => b.isActive).map((b) => <option key={b.code} value={b.code}>{b.code} — {b.bankName} {b.accountNo}</option>)}
                </select>
              ) : <span />}
              <button className="btn btn-sm" disabled={dis} onClick={() => (h.partnerCode ? setFinding(true) : setProblem('Bạn phải chọn đối tượng (KH/NCC) trước khi chọn phiếu thanh toán kèm theo'))}><FileSearch size={14} /> Tìm chứng từ</button>
            </C>

            <L c={2} r={1}>Lý do</L>
            <C c={2} r={1}><ListPicker items={reasonList.map((r) => ({ code: r.code, name: r.name }))} value={h.reasonCode} disabled={dis} onChange={(v) => set({ reasonCode: v })} /></C>
            <L c={2} r={2} req={employees.length > 0}>Nhân viên</L>
            <C c={2} r={2}><ListPicker items={employees.filter((e) => e.isActive || e.code === h.employeeCode)} value={h.employeeCode} disabled={dis} hideName onChange={(v) => set({ employeeCode: v })} /></C>
            <L c={2} r={3}>Khách hàng</L>
            <C c={2} r={3}><PartnerPicker activeOnly={!existing} value={h.partnerCode} disabled={dis} hideName onChange={(v) => void pickPartner(v)} /></C>
            <L c={2} r={4}>Điện thoại</L>
            <C c={2} r={4}><input className="input" value={h.phone} disabled={dis} onChange={(e) => set({ phone: e.target.value })} /></C>
            <L c={2} r={5}>Địa chỉ</L>
            <C c={2} r={5} wide><input className="input" value={h.address} disabled={dis} onChange={(e) => set({ address: e.target.value })} /></C>
            <L c={2} r={6}>Diễn giải</L>
            <C c={2} r={6} wide><input className="input" value={h.description} disabled={dis} onChange={(e) => set({ description: e.target.value })} /></C>

            <L c={3} r={1}>Chi nhánh</L>
            <C c={3} r={1}><BranchPicker activeOnly value={branchCode} disabled={dis || Boolean(existing)} onChange={(c) => set({ branchCode: c })} /></C>
            <L c={3} r={2}>Tên NV</L>
            <C c={3} r={2}><input className="input" value={employeeName} disabled /></C>
            <L c={3} r={3}>Tên KH</L>
            <C c={3} r={3}><input className="input" value={partnerName} disabled={dis} onChange={(e) => set({ partnerName: e.target.value })} /></C>
            <L c={3} r={4}>{moneySide === 'debit' ? 'Người nộp' : 'Người nhận'}</L>
            <C c={3} r={4}><input className="input" value={h.counterparty} disabled={dis} onChange={(e) => set({ counterparty: e.target.value })} /></C>
          </div>

          <div className="vf-toolbar vf-sub">
            <button disabled={dis} onClick={addRow}><Plus size={15} className="text-ok" /> Thêm chi tiết phiếu</button>
            <button disabled={dis || activeKey === null} onClick={() => removeRow(activeKey)}><X size={15} className="text-bad" /> Xóa chi tiết phiếu</button>
          </div>
          <div className="vf-grid-wrap">
            <table className="vf-grid">
              <thead>
                <tr>
                  <th className="vf-act" /><th className="vf-act" />
                  <th style={{ minWidth: 90 }}>Tài khoản</th><th style={{ minWidth: 110 }}>Nợ</th><th style={{ minWidth: 110 }}>Có</th><th style={{ minWidth: 110 }}>Đối tượng</th>
                  <th style={{ minWidth: 120 }}>Mã lưu chuyển tiền tệ</th><th style={{ minWidth: 300 }}>Diễn giải</th><th style={{ minWidth: 90 }}>Thuế</th><th style={{ minWidth: 100 }}>Nhân viên</th>
                  <th style={{ minWidth: 100 }}>Tiền thuế</th><th style={{ minWidth: 120 }}>Ngày HĐ</th><th style={{ minWidth: 100 }}>Khoản mục</th><th style={{ minWidth: 100 }}>Số HĐ</th>
                  <th style={{ minWidth: 90 }}>Số seri</th><th style={{ minWidth: 90 }}>Mẫu HĐ</th><th style={{ minWidth: 160 }}>Đối tượng thuế VAT</th><th style={{ minWidth: 110 }}>Mã số thuế</th>
                  <th style={{ minWidth: 120 }}>Số hóa đơn</th><th style={{ minWidth: 100 }}>Ngày hóa đơn</th><th style={{ minWidth: 110 }}>Tổng tiền HĐ</th><th style={{ minWidth: 110 }}>Số còn nợ</th>
                  <th style={{ minWidth: 100 }}>Bộ phận</th><th style={{ minWidth: 100 }}>Hợp đồng</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={activeKey === r.key ? 'active' : undefined} onFocus={() => setActiveKey(r.key)} onClick={() => setActiveKey(r.key)}>
                    <td className="vf-act"><button disabled={dis} title="Thêm" onClick={addRow}><Plus size={14} className="text-ok" /></button></td>
                    <td className="vf-act"><button disabled={dis} title="Xóa" onClick={() => removeRow(r.key)}><Trash2 size={14} className="text-bad" /></button></td>
                    <td><AccountPicker postingOnly hideName className="input mono" value={r.account} disabled={dis} onChange={(v) => setRow(r.key, { account: v })} /></td>
                    <td>{amountCell(r, 'debit')}</td>
                    <td>{amountCell(r, 'credit')}</td>
                    <td><PartnerPicker activeOnly={!existing} hideName value={r.partner} disabled={dis} onChange={(v) => setRow(r.key, { partner: v })} /></td>
                    <td>
                      <select className="select input" value={r.cashflowCode} disabled={dis} onChange={(e) => setRow(r.key, { cashflowCode: e.target.value })}>
                        <option value="" />
                        {CASHFLOW_CODES.map(([c, n]) => <option key={c} value={c} title={n}>{c} — {n}</option>)}
                      </select>
                    </td>
                    <td>{text(r, 'description')}</td>
                    <td>
                      <select className="select input" value={r.taxCode} disabled={dis} onChange={(e) => pickTax(r, e.target.value)}>
                        <option value="" />
                        {taxCodes.filter((t) => t.isActive || t.code === r.taxCode).map((t) => <option key={t.code} value={t.code}>{t.code}</option>)}
                      </select>
                    </td>
                    <td>{dimCell(r, 'employee', employees)}</td>
                    <td><input className="input num" inputMode="numeric" value={r.taxAmount} disabled={dis} onChange={(e) => setRow(r.key, { taxAmount: e.target.value })} onBlur={() => setRow(r.key, { taxAmount: showAmount(r.taxAmount) })} /></td>
                    <td><input type="date" className="input" value={r.invoiceDate} disabled={dis} onChange={(e) => setRow(r.key, { invoiceDate: e.target.value })} /></td>
                    <td>{dimCell(r, 'costItem', costItems)}</td>
                    <td>{text(r, 'invoiceNo', 'input mono')}</td>
                    <td>{text(r, 'invoiceSerial', 'input mono')}</td>
                    <td>{text(r, 'invoiceForm', 'input mono')}</td>
                    <td>{text(r, 'invoicePartnerName')}</td>
                    <td>{text(r, 'invoicePartnerTaxCode', 'input mono')}</td>
                    <td className="mono ro">{r.settleDocNo}</td>
                    <td className="ro">{r.settleDocDate ? showDate(r.settleDocDate) : ''}</td>
                    <td className="num ro">{r.settleTotal ? money(r.settleTotal) : ''}</td>
                    <td className="num ro">{r.settleRemaining ? money(r.settleRemaining) : ''}</td>
                    <td>{dimCell(r, 'department', departments)}</td>
                    <td>{dimCell(r, 'contract', contracts)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="vf-act" /><td className="vf-act" />
                  <td className="num">{rows.length}</td>
                  <td className="num">{lineSide === 'debit' ? money(total, { blankZero: false }) : ''}</td>
                  <td className="num">{lineSide === 'credit' ? money(total, { blankZero: false }) : ''}</td>
                  <td colSpan={5} />
                  <td className="num">{taxTotal ? money(taxTotal) : ''}</td>
                  <td colSpan={9} />
                  <td className="num">{rows.some((r) => r.settleTotal) ? money(rows.reduce((s, r) => s + (r.settleTotal ?? 0), 0)) : ''}</td>
                  <td className="num">{rows.some((r) => r.settleRemaining) ? money(rows.reduce((s, r) => s + (r.settleRemaining ?? 0), 0)) : ''}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {existing && !cancelled && <div style={{ marginTop: 8 }}><SignaturePanel id={existing.id} roles={signRolesOf(type)} /></div>}
    </VoucherModal>
      {finding && (
        <FindDocuments
          partnerCode={h.partnerCode}
          side={moneySide === 'debit' ? 'debit' : 'credit'}
          taken={new Set(rows.map((r) => r.settleItemId).filter(Boolean))}
          onClose={() => setFinding(false)}
          onPick={(items) => {
            setRows((xs) => [...xs, ...items.map((i) => blankRow({
              account: i.accountCode, amount: money(i.remaining), partner: h.partnerCode, employee: h.employeeCode, description: h.description,
              settleItemId: i.id, settleDocNo: i.docNo, settleDocDate: i.docDate, settleTotal: i.amount, settleRemaining: i.remaining,
            }))]);
            setFinding(false);
          }}
        />
      )}
    </>
  );
}

export { L, C } from '@/components/voucher/VoucherModal';

/** Chọn chứng từ còn nợ của đối tượng (phiếu thu: khoản phải thu; phiếu chi: khoản phải trả). */
function FindDocuments({ partnerCode, side, taken, onClose, onPick }: { partnerCode: string; side: 'debit' | 'credit'; taken: Set<string>; onClose: () => void; onPick: (items: OpenItem[]) => void }) {
  const q = useQuery({ queryKey: ['debt-items', 'find', partnerCode, side], queryFn: () => api.get<OpenItem[]>('/api/v1/debt-items', { partnerCode, side, status: 'open', pageSize: 500 }) });
  const items = (q.data ?? []).filter((i) => !taken.has(i.id));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  return (
    <div className="modal-mask" style={{ zIndex: 95 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" style={{ width: 'min(900px, 100%)' }}>
        <div className="modal-head">Chọn chứng từ chưa thanh toán — {partnerCode}</div>
        <div className="modal-body" style={{ display: 'block' }}>
          {q.isLoading ? <div className="muted">Đang tải…</div> : q.error ? <div className="alert alert-bad">{errorText(q.error)}</div> : !items.length ? <div className="muted">Không còn chứng từ nào chưa thanh toán.</div> : (
            <div style={{ maxHeight: '55vh', overflow: 'auto' }}>
              <table className="vf-grid">
                <thead>
                  <tr>
                    <th className="vf-act"><input type="checkbox" checked={items.every((i) => picked.has(i.id))} onChange={(e) => setPicked(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())} /></th>
                    <th>Số hóa đơn</th><th>Ngày hóa đơn</th><th>Hạn TT</th><th>Tài khoản</th><th>Diễn giải</th><th>Tổng tiền HĐ</th><th>Số còn nợ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} onClick={() => setPicked((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })}>
                      <td className="vf-act"><input type="checkbox" checked={picked.has(i.id)} readOnly /></td>
                      <td className="mono ro">{i.docNo}</td><td className="ro">{showDate(i.docDate)}</td><td className="ro">{showDate(i.dueDate)}</td><td className="mono ro">{i.accountCode}</td>
                      <td className="ro">{i.description}</td><td className="num ro">{money(i.amount)}</td><td className="num ro">{money(i.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Đóng</button>
          <button className="btn btn-primary" disabled={!picked.size} onClick={() => onPick(items.filter((i) => picked.has(i.id)))}>Chọn</button>
        </div>
      </div>
    </div>
  );
}
