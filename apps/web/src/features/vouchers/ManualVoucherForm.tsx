/**
 * Form Phiếu kế toán (ACC16), xếp như form phiếu kế toán quen thuộc của kế toán.
 *
 *   Thanh nút : Ghi, Ghi và tạo mới, In, Xuất, Xóa, Đóng.
 *   Đầu phiếu : Số chứng từ, Ngày chứng từ, Diễn giải | Lý do, Nhân viên | Tiền tệ + tỷ giá, Tên NV, Chi nhánh.
 *   Lưới trên : các dòng phiếu — Tài khoản, PS Có, PS Nợ (mỗi dòng chỉ nhập một bên), Đối tượng, thuế, hoá đơn,
 *               Tk đối ứng (tóm tắt), Nhân viên, Diễn giải, Bộ phận, Hợp đồng, Khoản mục.
 *   Lưới dưới : tài khoản đối ứng của dòng đang chọn — bên ngược lại, cộng lại phải bằng số tiền của dòng CỘNG tiền
 *               thuế của dòng (phiếu phải cân: Nợ 24218 15tr + thuế V08 1,2tr ⇒ Có 33111 16,2tr), lệch thì không cho ghi.
 *               "Thêm chi tiết phiếu" ở lưới dưới điền sẵn số tiền còn thiếu và thông tin của dòng.
 *
 * Ghi sổ: mỗi tài khoản đối ứng thành một cặp Nợ / Có với tài khoản của dòng (dòng ghi Nợ → đối ứng ghi Có và ngược lại).
 * Các cặp nhớ `group` + `mainSide` để mở lại phiếu hiện đúng như lúc nhập.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import type { VoucherInput, VoucherLine, VoucherTemplateInput } from '@ketoan/contracts';
import { api } from '@/lib/api';
import { money, today } from '@/lib/format';
import { BranchPicker, useBranches } from '@/components/filters';
import { AccountPicker, ListPicker, PartnerPicker } from '@/components/pickers';
import { VOUCHER_META, type ExistingVoucher } from './VoucherForm';
import { VOUCHER_SCREEN, VOUCHER_TEMPLATES, signRolesOf, type PrintSheet } from './VoucherPrint';
import { PrintButton } from '@/components/print';
import { SignaturePanel, useSignatures } from './Signatures';
import { parseAmount, showAmount } from './CashVoucherForm';
import { C, L, VoucherModal, readOnlyReason, useVoucherSave } from '@/components/voucher/VoucherModal';
import { useDimension } from '@/components/voucher/lookups';

interface Account { code: string; name: string; trackPartner: boolean; isDebt?: boolean; normalSide: string; trackCostItem: boolean; trackDepartment: boolean; trackContract: boolean }
interface Dimension { code: string; name: string; isActive: boolean }
interface TaxCode { code: string; name: string; rate: number; isActive: boolean }
interface Reason { code: string; name: string; kind: string; isActive: boolean }

/** Thông tin chung của một dòng (dòng chính hoặc tài khoản đối ứng). */
interface Base {
  key: number; account: string; partner: string; description: string; employee: string; department: string; contract: string; costItem: string;
}
interface Counter extends Base { amount: string }
interface Row extends Base {
  debit: string; credit: string;
  taxCode: string; invoicePartnerTaxCode: string; taxAmount: string; invoiceDate: string; invoiceNo: string; invoiceSerial: string; invoiceForm: string; invoicePartnerName: string;
  case: string; project: string; capitalSource: string; cashflowCode: string;
  counters: Counter[];
}

let seq = 0;
const base = (p: Partial<Base> = {}): Base => ({ key: ++seq, account: '', partner: '', description: '', employee: '', department: '', contract: '', costItem: '', ...p });
const blankRow = (p: Partial<Row> = {}): Row => ({
  ...base(), debit: '', credit: '', taxCode: '', invoicePartnerTaxCode: '', taxAmount: '', invoiceDate: '', invoiceNo: '', invoiceSerial: '', invoiceForm: '', invoicePartnerName: '',
  case: '', project: '', capitalSource: '', cashflowCode: '', counters: [], ...p,
});
const amountOf = (r: Row) => parseAmount(r.debit) || parseAmount(r.credit);
/** Số tiền tài khoản đối ứng phải cộng đủ: tiền của dòng + tiền thuế của dòng (cặp thuế ghi sổ cùng đối ứng đầu tiên). */
const needOf = (r: Row) => amountOf(r) + parseAmount(r.taxAmount);
const sideOf = (r: Row): 'debit' | 'credit' => (parseAmount(r.debit) ? 'debit' : 'credit');

/** Dựng lại các dòng chính + đối ứng từ các cặp đã lưu (phiếu cũ không có group: mỗi cặp một dòng chính ghi Nợ). */
function rowsFromLines(lines: VoucherLine[], headPartner = ''): Row[] {
  const groups = new Map<string, VoucherLine[]>();
  lines.forEach((l, i) => { const k = l.group !== undefined ? `g${l.group}` : `i${i}`; groups.set(k, [...(groups.get(k) ?? []), l]); });
  return [...groups.values()].map((ls) => {
    const f = ls[0]!;
    const side = f.mainSide ?? 'debit';
    const total = ls.reduce((s, l) => s + l.amount, 0);
    return blankRow({
      account: side === 'debit' ? f.debitAccount : f.creditAccount,
      debit: side === 'debit' ? money(total) : '', credit: side === 'credit' ? money(total) : '',
      partner: (side === 'debit' ? f.partnerCode : f.creditPartnerCode) || headPartner,
      description: f.description ?? '', employee: f.employee ?? '', department: f.department ?? '', contract: f.contract ?? '', costItem: f.costItem ?? '',
      case: f.case ?? '', project: f.project ?? '', capitalSource: f.capitalSource ?? '', cashflowCode: f.cashflowCode ?? '',
      taxCode: f.taxCode ?? '', taxAmount: f.taxAmount ? money(f.taxAmount) : '', invoiceDate: f.invoiceDate ?? '', invoiceNo: f.invoiceNo ?? '', invoiceSerial: f.invoiceSerial ?? '',
      invoiceForm: f.invoiceForm ?? '', invoicePartnerName: f.invoicePartnerName ?? '', invoicePartnerTaxCode: f.invoicePartnerTaxCode ?? '',
      counters: ls.map((l, j) => ({
        ...base({ account: side === 'debit' ? l.creditAccount : l.debitAccount, partner: (side === 'debit' ? l.creditPartnerCode : l.partnerCode) || headPartner, description: l.description ?? '', employee: l.employee ?? '', department: l.department ?? '', contract: l.contract ?? '', costItem: l.costItem ?? '' }),
        // Đối ứng đầu tiên mang cả tiền thuế của dòng (lúc ghi trừ ra thành cặp thuế riêng).
        amount: money(l.amount + (j === 0 ? l.taxAmount ?? 0 : 0)),
      })),
    });
  });
}

export function ManualVoucherForm({ existing, initial, onClose, onSaved }: {
  existing?: ExistingVoucher;
  initial?: VoucherTemplateInput;
  onClose: () => void;
  onSaved: (docNo: string, docDate: string, addNew: boolean) => void;
}) {
  const qc = useQueryClient();
  const meta = VOUCHER_META.manual;
  const p = existing?.payload ?? initial;
  const pv = p as Partial<VoucherInput> | undefined;
  const cancelled = existing?.status === 'cancelled';
  const dis = cancelled || existing?.canModify === false;

  const { data: branches } = useBranches();
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts', 'posting'], queryFn: () => api.get<Account[]>('/api/v1/accounts', { postingOnly: true }), staleTime: 60_000 });
  const { data: taxCodes = [] } = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 });
  const { data: reasons = [] } = useQuery({ queryKey: ['reasons'], queryFn: () => api.get<Reason[]>('/api/v1/posting/reasons'), staleTime: 60_000 });
  const employees = useDimension('employee') as Dimension[];
  const costItems = useDimension('cost_item') as Dimension[];
  const departments = useDimension('department') as Dimension[];
  const contracts = useDimension('contract') as Dimension[];
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);
  const reasonList = reasons.filter((r) => (r.kind === 'receipt' || r.kind === 'payment') && (r.isActive || r.code === pv?.reasonCode));

  const [h, setH] = useState({
    docNo: existing?.docNo ?? '',
    branchCode: p?.branchCode || branches?.find((b) => b.isActive)?.code || '',
    docDate: (existing?.payload.docDate ?? today()) as string,
    reasonCode: pv?.reasonCode ?? '',
    employeeCode: pv?.employeeCode ?? '',
    description: p?.description ?? '',
  });
  const set = (patch: Partial<typeof h>) => setH((x) => ({ ...x, ...patch }));
  const branchCode = h.branchCode || branches?.find((b) => b.isActive)?.code || '';
  const [rows, setRows] = useState<Row[]>(() => rowsFromLines(p?.lines ?? [], p?.partnerCode ?? ''));
  const [activeKey, setActiveKey] = useState<number | null>(rows[0]?.key ?? null);
  const [activeCounter, setActiveCounter] = useState<number | null>(null);
  const signatures = useSignatures(existing && !cancelled ? existing.id : undefined).data;
  const active = rows.find((r) => r.key === activeKey) ?? null;
  const employeeName = employees.find((e) => e.code === h.employeeCode)?.name ?? '';

  const setRow = (key: number, patch: Partial<Row>) => setRows((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const setCounter = (rowKey: number, key: number, patch: Partial<Counter>) =>
    setRows((xs) => xs.map((x) => (x.key === rowKey ? { ...x, counters: x.counters.map((c) => (c.key === key ? { ...c, ...patch } : c)) } : x)));

  /** Thêm chi tiết phiếu (lưới trên): dòng trống mang diễn giải, nhân viên của đầu phiếu. */
  const addRow = () => { const r = blankRow({ description: h.description, employee: h.employeeCode }); setRows((xs) => [...xs, r]); setActiveKey(r.key); };
  const removeRow = (key: number | null) => key !== null && setRows((xs) => xs.filter((x) => x.key !== key));
  /** Thêm tài khoản đối ứng cho dòng đang chọn: số tiền còn thiếu, thông tin lấy theo dòng. */
  const addCounter = () => {
    if (!active) return setProblem('Chọn một dòng ở lưới trên trước');
    const left = needOf(active) - active.counters.reduce((s, c) => s + parseAmount(c.amount), 0);
    const c: Counter = { ...base({ partner: active.partner, description: active.description, employee: active.employee, department: active.department, contract: active.contract, costItem: active.costItem }), amount: left > 0 ? money(left) : '' };
    setRow(active.key, { counters: [...active.counters, c] });
    setActiveCounter(c.key);
  };
  const removeCounter = (key: number | null) => { if (active && key !== null) setRow(active.key, { counters: active.counters.filter((c) => c.key !== key) }); };

  const needs = (code: string) => accountMap.get(code);
  const check = (): string | null => {
    if (!branchCode) return 'Bạn chưa chọn chi nhánh';
    if (!rows.length) return 'Phiếu chưa có chi tiết';
    for (const [i, r] of rows.entries()) {
      const row = `Dòng ${i + 1}: `;
      if (!r.account) return `${row}tài khoản không được phép để trống.`;
      const acc = needs(r.account);
      if (!acc) return `${row}tài khoản không có trong danh mục`;
      if (parseAmount(r.debit) && parseAmount(r.credit)) return `${row}bạn chỉ được phép nhập số tiền nợ hoặc có`;
      if (!amountOf(r)) return `${row}chưa nhập số tiền`;
      if (parseAmount(r.taxAmount) && !r.taxCode) return `${row}bạn chưa chọn loại thuế.`;
      if ((acc.trackPartner || acc.isDebt || acc.normalSide === 'both') && !r.partner) return `${row}tài khoản bắt buộc phải chọn đối tượng`;
      if (acc.trackDepartment && departments.length && !r.department) return `${row}tài khoản bắt buộc phải chọn bộ phận`;
      if (acc.trackCostItem && costItems.length && !r.costItem) return `${row}tài khoản này bắt buộc phải chọn khoản mục`;
      if (acc.trackContract && contracts.length && !r.contract) return `${row}tài khoản bắt buộc phải chọn hợp đồng`;
      if (!r.counters.length) return `${row}chưa có tài khoản đối ứng`;
      for (const c of r.counters) {
        if (!c.account) return `${row}tài khoản đối ứng không được phép để trống.`;
        const ca = needs(c.account);
        if (!ca) return `${row}tài khoản đối ứng ${c.account} không có trong danh mục`;
        if (!parseAmount(c.amount)) return `${row}tài khoản đối ứng ${c.account} chưa nhập số tiền`;
        if ((ca.trackPartner || ca.isDebt || ca.normalSide === 'both') && !c.partner) return `${row}tài khoản đối ứng ${c.account} bắt buộc phải chọn đối tượng`;
      }
      const sum = r.counters.reduce((s, c) => s + parseAmount(c.amount), 0);
      const tax = parseAmount(r.taxAmount);
      if (Math.round(sum) !== Math.round(needOf(r))) {
        return tax
          ? `${row}phiếu chưa cân — tổng tài khoản đối ứng (${money(sum, { blankZero: false })}) phải bằng số tiền của dòng + tiền thuế (${money(amountOf(r), { blankZero: false })} + ${money(tax, { blankZero: false })} = ${money(needOf(r), { blankZero: false })})`
          : `${row}phiếu chưa cân — tổng tài khoản đối ứng (${money(sum, { blankZero: false })}) phải bằng số tiền của dòng (${money(amountOf(r), { blankZero: false })})`;
      }
      if (tax && parseAmount(r.counters[0]!.amount) < tax) return `${row}tài khoản đối ứng đầu tiên (${r.counters[0]!.account}) phải chứa được tiền thuế ${money(tax, { blankZero: false })}`;
    }
    return null;
  };

  const body = (): VoucherInput => {
    const reason = reasons.find((r) => r.code === h.reasonCode);
    const lines: VoucherLine[] = [];
    rows.forEach((r, g) => {
      const side = sideOf(r);
      r.counters.forEach((c, j) => {
        lines.push({
          debitAccount: side === 'debit' ? r.account : c.account,
          creditAccount: side === 'debit' ? c.account : r.account,
          // Đối ứng đầu tiên gồm cả tiền thuế → cặp chính ghi phần chưa thuế; máy chủ ghi cặp thuế (Nợ TK thuế / Có đối ứng).
          amount: parseAmount(c.amount) - (j === 0 ? parseAmount(r.taxAmount) : 0),
          description: c.description || r.description,
          partnerCode: (side === 'debit' ? r.partner : c.partner) || undefined,
          creditPartnerCode: (side === 'debit' ? c.partner : r.partner) || undefined,
          employee: r.employee || undefined, department: r.department || undefined, contract: r.contract || undefined, costItem: r.costItem || undefined,
          case: r.case || undefined, project: r.project || undefined, capitalSource: r.capitalSource || undefined, cashflowCode: r.cashflowCode || undefined,
          // Thuế, hoá đơn của dòng đi theo cặp đầu tiên.
          taxCode: j === 0 ? r.taxCode || undefined : undefined,
          taxAmount: j === 0 ? parseAmount(r.taxAmount) : 0,
          invoiceNo: j === 0 ? r.invoiceNo || undefined : undefined, invoiceSerial: j === 0 ? r.invoiceSerial || undefined : undefined,
          invoiceForm: j === 0 ? r.invoiceForm || undefined : undefined, invoiceDate: j === 0 ? r.invoiceDate || undefined : undefined,
          invoicePartnerName: j === 0 ? r.invoicePartnerName || undefined : undefined, invoicePartnerTaxCode: j === 0 ? r.invoicePartnerTaxCode || undefined : undefined,
          group: g, mainSide: side,
        });
      });
    });
    return {
      docType: 'manual', branchCode, docDate: h.docDate,
      docNo: existing ? undefined : h.docNo.trim() || undefined,
      description: h.description.trim() || reason?.name || meta.title,
      counterparty: existing?.payload.counterparty ?? '',
      partnerCode: existing?.payload.partnerCode,
      reference: existing?.payload.reference ?? '',
      reasonCode: h.reasonCode || undefined,
      employeeCode: h.employeeCode || undefined,
      purpose: existing?.payload.purpose,
      dueDate: existing?.payload.dueDate,
      settle: existing?.payload.settle,
      lines,
    };
  };

  const { doSave, doDelete, saving, error, setProblem } = useVoucherSave({
    existing, check, docDate: h.docDate, onSaved, onClose,
    confirm: 'Bạn có chắc chắn muốn Ghi phiếu này không?',
    invalidate: [['documents']],
    submit: () => (existing ? api.put<{ docNo: string }>(`/api/v1/vouchers/${existing.id}`, body()) : api.post<{ docNo: string }>('/api/v1/vouchers', body())),
  });
  const exportRows = () => {
    const head = ['Tài khoản', 'PS Có', 'PS Nợ', 'Đối tượng', 'Loại thuế', 'Mã số thuế', 'Tiền Thuế', 'Ngày Hóa Đơn', 'Tk đối ứng', 'Số Hóa Đơn', 'Số seri', 'Mẫu hóa đơn', 'Đối tượng thuế VAT', 'Nhân viên', 'Diễn giải', 'Bộ phận', 'Hợp đồng', 'Khoản mục'];
    const data = rows.map((r) => [r.account, parseAmount(r.credit), parseAmount(r.debit), r.partner, r.taxCode, r.invoicePartnerTaxCode, parseAmount(r.taxAmount), r.invoiceDate, r.counters.map((c) => c.account).join(', '),
      r.invoiceNo, r.invoiceSerial, r.invoiceForm, r.invoicePartnerName, r.employee, r.description, r.department, r.contract, r.costItem]);
    const csv = [head, ...data].map((x) => x.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${meta.title} ${existing?.docNo ?? ''}.csv`.replace(/\s+\./, '.');
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const totalDebit = rows.reduce((s, r) => s + parseAmount(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + parseAmount(r.credit), 0);
  const money2 = (r: Row, f: 'debit' | 'credit' | 'taxAmount') => (
    <input className="input num" inputMode="numeric" value={r[f]} disabled={dis} onChange={(e) => setRow(r.key, { [f]: e.target.value })} onBlur={() => setRow(r.key, { [f]: showAmount(r[f]) })} />
  );
  const text = (r: Row, f: 'description' | 'invoiceNo' | 'invoiceSerial' | 'invoiceForm' | 'invoicePartnerName' | 'invoicePartnerTaxCode', cls = 'input') => (
    <input className={cls} value={r[f]} disabled={dis} onChange={(e) => setRow(r.key, { [f]: e.target.value })} />
  );
  const dim = (value: string, list: Dimension[], onChange: (v: string) => void) => <ListPicker items={list.filter((d) => d.isActive || d.code === value)} value={value} disabled={dis} hideName onChange={onChange} />;
  const counterSide = active ? (sideOf(active) === 'debit' ? 'credit' : 'debit') : 'credit';

  return (
    <>
    <VoucherModal
      title="Phiếu kế toán khác" existing={existing} readOnly={dis} saving={saving}
      onSave={() => doSave(false)} onSaveNew={() => doSave(true)} printSlot={<PrintButton bare screen={VOUCHER_SCREEN['manual']} templates={VOUCHER_TEMPLATES['manual']} disabled={!existing} getDocs={(): PrintSheet[] => (existing ? [{ type: 'manual', docNo: existing.docNo, voucher: existing.payload, signatures, branchName: branches?.find((b) => b.code === existing.payload.branchCode)?.name ?? existing.payload.branchCode }] : [])} />} onExport={exportRows} onDelete={doDelete} onClose={onClose}
      error={error} readOnlyText={readOnlyReason(existing, { external: false })}
    >
          <div className="vf-head-grid vf-head-grid-3">
            <L c={1} r={1} req>Số chứng từ</L>
            <C c={1} r={1}><input className="input mono" value={h.docNo} disabled={dis || Boolean(existing)} placeholder="Tự cấp khi ghi" onChange={(e) => set({ docNo: e.target.value })} /></C>
            <L c={1} r={2} req>Ngày chứng từ</L>
            <C c={1} r={2}><input type="date" className="input" style={{ fontWeight: 700 }} value={h.docDate} disabled={dis} onChange={(e) => set({ docDate: e.target.value })} /></C>
            <L c={1} r={3}>Diễn giải</L>
            <div className="vf-cell" style={{ gridColumn: '2 / 5', gridRow: 3 }}><input className="input" value={h.description} disabled={dis} onChange={(e) => set({ description: e.target.value })} /></div>

            <L c={2} r={1}>Lý do</L>
            <C c={2} r={1}><ListPicker items={reasonList.map((r) => ({ code: r.code, name: r.name }))} value={h.reasonCode} disabled={dis} onChange={(v) => set({ reasonCode: v })} /></C>
            <L c={2} r={2}>Nhân viên</L>
            <C c={2} r={2}><ListPicker items={employees.filter((e) => e.isActive || e.code === h.employeeCode)} value={h.employeeCode} disabled={dis} hideName onChange={(v) => set({ employeeCode: v })} /></C>

            <L c={3} r={1}>Tiền tệ</L>
            <C c={3} r={1} pair>
              <select className="select input" value="VND" disabled><option value="VND">VND</option></select>
              <input className="input num" value="1,0000" disabled />
            </C>
            <L c={3} r={2}>Tên NV</L>
            <C c={3} r={2}><input className="input" value={employeeName} disabled /></C>
            <L c={3} r={3}>Chi nhánh</L>
            <C c={3} r={3}><BranchPicker activeOnly value={branchCode} disabled={dis || Boolean(existing)} onChange={(c) => set({ branchCode: c })} /></C>
          </div>

          <div className="vf-toolbar vf-sub">
            <button disabled={dis} onClick={addRow}><Plus size={15} className="text-ok" /> Thêm chi tiết phiếu</button>
            <button disabled={dis || activeKey === null} onClick={() => removeRow(activeKey)}><X size={15} className="text-bad" /> Xóa chi tiết phiếu</button>
          </div>
          <div className="vf-grid-wrap" style={{ maxHeight: '30vh', minHeight: 120 }}>
            <table className="vf-grid">
              <thead>
                <tr>
                  <th className="vf-act" /><th style={{ minWidth: 90 }}>Tài khoản</th><th className="vf-act" />
                  <th style={{ minWidth: 110 }}>PS Có</th><th style={{ minWidth: 110 }}>PS Nợ</th><th style={{ minWidth: 110 }}>Đối tượng</th>
                  <th style={{ minWidth: 80 }}>Loại thuế</th><th style={{ minWidth: 100 }}>Mã số thuế</th><th style={{ minWidth: 100 }}>Tiền Thuế</th><th style={{ minWidth: 120 }}>Ngày Hóa Đơn</th>
                  <th style={{ minWidth: 110 }}>Tk đối ứng</th><th style={{ minWidth: 100 }}>Số Hóa Đơn</th><th style={{ minWidth: 90 }}>Số seri</th><th style={{ minWidth: 90 }}>Mẫu hóa đơn</th>
                  <th style={{ minWidth: 150 }}>Đối tượng thuế VAT</th><th style={{ minWidth: 100 }}>Nhân viên</th><th style={{ minWidth: 260 }}>Diễn giải</th><th style={{ minWidth: 100 }}>Bộ phận</th>
                  <th style={{ minWidth: 100 }}>Hợp đồng</th><th style={{ minWidth: 100 }}>Khoản mục</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={activeKey === r.key ? 'active' : undefined} onFocus={() => setActiveKey(r.key)} onClick={() => setActiveKey(r.key)}>
                    <td className="vf-act"><button disabled={dis} title="Xóa" onClick={() => removeRow(r.key)}><Trash2 size={14} className="text-bad" /></button></td>
                    <td><AccountPicker postingOnly hideName className="input mono" value={r.account} disabled={dis} onChange={(v) => setRow(r.key, { account: v })} /></td>
                    <td className="vf-act"><button disabled={dis} title="Thêm" onClick={addRow}><Plus size={14} className="text-ok" /></button></td>
                    <td>{money2(r, 'credit')}</td>
                    <td>{money2(r, 'debit')}</td>
                    <td><PartnerPicker activeOnly={!existing} hideName value={r.partner} disabled={dis} onChange={(v) => setRow(r.key, { partner: v })} /></td>
                    <td>
                      <select className="select input" value={r.taxCode} disabled={dis} onChange={(e) => setRow(r.key, { taxCode: e.target.value })}>
                        <option value="" />
                        {taxCodes.filter((t) => t.isActive || t.code === r.taxCode).map((t) => <option key={t.code} value={t.code}>{t.code}</option>)}
                      </select>
                    </td>
                    <td>{text(r, 'invoicePartnerTaxCode', 'input mono')}</td>
                    <td>{money2(r, 'taxAmount')}</td>
                    <td><input type="date" className="input" value={r.invoiceDate} disabled={dis} onChange={(e) => setRow(r.key, { invoiceDate: e.target.value })} /></td>
                    <td className="mono ro">{r.counters.map((c) => c.account).filter(Boolean).join(', ')}</td>
                    <td>{text(r, 'invoiceNo', 'input mono')}</td>
                    <td>{text(r, 'invoiceSerial', 'input mono')}</td>
                    <td>{text(r, 'invoiceForm', 'input mono')}</td>
                    <td>{text(r, 'invoicePartnerName')}</td>
                    <td>{dim(r.employee, employees, (v) => setRow(r.key, { employee: v }))}</td>
                    <td>{text(r, 'description')}</td>
                    <td>{dim(r.department, departments, (v) => setRow(r.key, { department: v }))}</td>
                    <td>{dim(r.contract, contracts, (v) => setRow(r.key, { contract: v }))}</td>
                    <td>{dim(r.costItem, costItems, (v) => setRow(r.key, { costItem: v }))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="vf-act" /><td className="num">{rows.length}</td><td className="vf-act" />
                  <td className="num">{money(totalCredit, { blankZero: false })}</td><td className="num">{money(totalDebit, { blankZero: false })}</td>
                  <td colSpan={2} /><td /><td className="num">{rows.some((r) => parseAmount(r.taxAmount)) ? money(rows.reduce((s, r) => s + parseAmount(r.taxAmount), 0)) : ''}</td>
                  <td colSpan={11} />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="vf-toolbar vf-sub">
            <button disabled={dis || !active} onClick={addCounter}><Plus size={15} className="text-ok" /> Thêm chi tiết phiếu</button>
            <button disabled={dis || activeCounter === null} onClick={() => removeCounter(activeCounter)}><X size={15} className="text-bad" /> Xóa chi tiết phiếu</button>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
              {active ? <>Tài khoản đối ứng của dòng <b className="mono">{active.account || '…'}</b> {amountOf(active) ? <>({sideOf(active) === 'debit' ? 'PS Nợ' : 'PS Có'} {money(amountOf(active))}{parseAmount(active.taxAmount) ? <> + thuế {money(parseAmount(active.taxAmount))} = {money(needOf(active))}</> : null})</> : null}</> : 'Chọn một dòng ở lưới trên'}
            </span>
          </div>
          <div className="vf-grid-wrap" style={{ maxHeight: '26vh', minHeight: 100 }}>
            <table className="vf-grid">
              <thead>
                <tr>
                  <th className="vf-act" /><th style={{ minWidth: 90 }}>Tài khoản</th><th className="vf-act" />
                  <th style={{ minWidth: 110 }}>{counterSide === 'credit' ? 'PS Có' : 'PS Nợ'}</th><th style={{ minWidth: 110 }}>Đối tượng</th>
                  <th style={{ minWidth: 100 }}>Nhân viên</th><th style={{ minWidth: 260 }}>Diễn giải</th><th style={{ minWidth: 100 }}>Bộ phận</th>
                  <th style={{ minWidth: 100 }}>Hợp đồng</th><th style={{ minWidth: 100 }}>Khoản mục</th>
                </tr>
              </thead>
              <tbody>
                {active?.counters.map((c) => (
                  <tr key={c.key} className={activeCounter === c.key ? 'active' : undefined} onFocus={() => setActiveCounter(c.key)} onClick={() => setActiveCounter(c.key)}>
                    <td className="vf-act"><button disabled={dis} title="Xóa" onClick={() => removeCounter(c.key)}><Trash2 size={14} className="text-bad" /></button></td>
                    <td><AccountPicker postingOnly hideName className="input mono" value={c.account} disabled={dis} onChange={(v) => setCounter(active.key, c.key, { account: v })} /></td>
                    <td className="vf-act"><button disabled={dis} title="Thêm" onClick={addCounter}><Plus size={14} className="text-ok" /></button></td>
                    <td><input className="input num" inputMode="numeric" value={c.amount} disabled={dis} onChange={(e) => setCounter(active.key, c.key, { amount: e.target.value })} onBlur={() => setCounter(active.key, c.key, { amount: showAmount(c.amount) })} /></td>
                    <td><PartnerPicker activeOnly={!existing} hideName value={c.partner} disabled={dis} onChange={(v) => setCounter(active.key, c.key, { partner: v })} /></td>
                    <td>{dim(c.employee, employees, (v) => setCounter(active.key, c.key, { employee: v }))}</td>
                    <td><input className="input" value={c.description} disabled={dis} onChange={(e) => setCounter(active.key, c.key, { description: e.target.value })} /></td>
                    <td>{dim(c.department, departments, (v) => setCounter(active.key, c.key, { department: v }))}</td>
                    <td>{dim(c.contract, contracts, (v) => setCounter(active.key, c.key, { contract: v }))}</td>
                    <td>{dim(c.costItem, costItems, (v) => setCounter(active.key, c.key, { costItem: v }))}</td>
                  </tr>
                ))}
              </tbody>
              {active && (
                <tfoot>
                  <tr>
                    <td className="vf-act" /><td className="num">{active.counters.length}</td><td className="vf-act" />
                    <td className="num">{money(active.counters.reduce((s, c) => s + parseAmount(c.amount), 0), { blankZero: false })}</td>
                    <td colSpan={6} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {existing && !cancelled && <div style={{ marginTop: 8 }}><SignaturePanel id={existing.id} roles={signRolesOf('manual')} /></div>}
    </VoucherModal>
    </>
  );
}
