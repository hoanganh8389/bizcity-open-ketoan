// [2026-11-11 Nguyễn Văn Thủy] Form phiếu thu / chi làm lại theo mẫu chuẩn: ô Loại ở tiêu đề, đầu phiếu nhãn trên ô, lưới Hạch toán gọn + nút Cột (đóng góp)
/**
 * Form Phiếu thu / Phiếu chi / Thu tiền gửi (báo có) / Chi tiền gửi (báo nợ).
 *
 *   Tiêu đề   : "Phiếu chi PC…" + ô Loại (mẫu định khoản, loaiPhieu.ts): chọn loại thì điền tài khoản tiền + tài khoản đối ứng.
 *               Tổng tiền chữ lớn góc phải (= tổng số tiền các dòng + tiền thuế).
 *   Đầu phiếu : trái  Mã đối tượng · Tên đối tượng · Người nộp / Người nhận · Địa chỉ · Lý do thu / chi (tự gợi "Chi tiền cho …")
 *                     · Nhân viên · Kèm theo … chứng từ gốc; tiền gửi: Nộp vào tài khoản / Tài khoản chi (tài khoản ngân hàng).
 *               phải  Ngày hạch toán · Số phiếu · Chi nhánh (chỉ khi có từ 2 chi nhánh) · Lý do hạch toán (khi bật lý do).
 *   Hạch toán : # · Diễn giải · TK Nợ · TK Có · Số tiền · Đối tượng · Tên đối tượng; nút Cột bật thêm: Khoản mục CP · Đơn vị ·
 *               Hợp đồng · Nhân viên · Mã lưu chuyển tiền tệ · nhóm Thuế (loại thuế, tiền thuế, hoá đơn) · nhóm Chứng từ thanh toán.
 *               Cột có dữ liệu luôn hiện. Nút Tìm chứng từ (chứng từ còn nợ của đối tượng), Thêm dòng, Xóa hết dòng. Dán từ Excel.
 *
 * Ghi sổ: tài khoản tiền đối ứng với tài khoản từng dòng (một tài khoản tiền cho cả phiếu, sửa ở bất kỳ dòng nào).
 *   Phiếu thu, báo có: Nợ TK tiền / Có TK dòng.   Phiếu chi, báo nợ: Nợ TK dòng / Có TK tiền.
 * "Tìm chứng từ": chọn chứng từ còn nợ của khách hàng / nhà cung cấp, mỗi chứng từ một dòng trả đúng số còn nợ.
 */
import { useEffect, useMemo, useState, type ClipboardEvent } from 'react';
import { bangDan, khongDau, soDan } from '@/lib/danExcel';
import { ngay } from '@/lib/nhapExcel';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Columns3, FileSearch, Plus, Trash2 } from 'lucide-react';
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
import { VoucherModal, readOnlyReason, useVoucherSave } from '@/components/voucher/VoucherModal';
import { useDimension } from '@/components/voucher/lookups';
import { useUseReasons } from '@/lib/useReasons';
import { LOAI_PHIEU, guessLoai, pickAccount } from './loaiPhieu';

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
  invoicePartnerName: string; invoicePartnerTaxCode: string; department: string; contract: string; case: string; project: string; capitalSource: string; cashItem: string;
  settleItemId: string; settleDocNo: string; settleDocDate: string; settleTotal: number | null; settleRemaining: number | null;
}

let seq = 0;
const blankRow = (patch: Partial<Row> = {}): Row => ({
  key: ++seq, account: '', amount: '', partner: '', creditPartner: '', cashflowCode: '', description: '', taxCode: '', employee: '', taxAmount: '', invoiceDate: '', costItem: '',
  invoiceNo: '', invoiceSerial: '', invoiceForm: '', invoicePartnerName: '', invoicePartnerTaxCode: '', department: '', contract: '', case: '', project: '', capitalSource: '', cashItem: '',
  settleItemId: '', settleDocNo: '', settleDocDate: '', settleTotal: null, settleRemaining: null, ...patch,
});

/** Cột thêm của lưới Hạch toán (nút Cột); nhóm Thuế, Chứng từ thanh toán bật / tắt cả nhóm. */
type ColKey = 'cashItem' | 'costItem' | 'department' | 'contract' | 'employee' | 'cashflowCode' | 'tax' | 'settle';
const COLS: [ColKey, string][] = [['cashItem', 'Mục thu/chi'], ['costItem', 'Khoản mục CP'], ['department', 'Đơn vị'], ['contract', 'Hợp đồng'], ['employee', 'Nhân viên'], ['cashflowCode', 'Mã lưu chuyển tiền tệ'], ['tax', 'Thuế, hoá đơn'], ['settle', 'Chứng từ thanh toán']];
/** Như mẫu chuẩn: lưới mặc định 6 cột, các cột thêm (Khoản mục CP, Mục thu/chi…) ẩn sẵn — bật ở nút Cột; cột có dữ liệu tự hiện. */
const COLS_DEFAULT: ColKey[] = [];
const hasData = (rows: Row[], k: ColKey) => rows.some((r) => (k === 'tax' ? r.taxCode || r.taxAmount || r.invoiceNo : k === 'settle' ? r.settleItemId : r[k]));

/* DÁN TỪ EXCEL (Ctrl + V) vào lưới: theo thứ tự cột đang hiện (data-f trên ô), hoặc theo dòng tiêu đề. */
type DanTruong = 'account' | 'amount' | 'partner' | 'cashflowCode' | 'description' | 'taxCode' | 'employee' | 'taxAmount' | 'invoiceDate' | 'costItem'
  | 'invoiceNo' | 'invoiceSerial' | 'invoiceForm' | 'invoicePartnerName' | 'invoicePartnerTaxCode' | 'department' | 'contract';
const DAN_TEN_TIEN: [RegExp, DanTruong][] = [
  [/^(tai khoan|tk|tk doi ung|tai khoan doi ung|tk no|tk co)$/, 'account'], [/^(so tien|thanh tien|tien|no|co|ps no|ps co)$/, 'amount'], [/^(doi tuong|ma doi tuong|ma kh|ma ncc)$/, 'partner'],
  [/^(dien giai|noi dung|ly do)$/, 'description'], [/^(ma luu chuyen tien te|luu chuyen tien te)$/, 'cashflowCode'], [/^(thue|loai thue|thue suat)$/, 'taxCode'], [/^(nhan vien|ma nhan vien)$/, 'employee'],
  [/^(tien thue)$/, 'taxAmount'], [/^(ngay hd|ngay hoa don)$/, 'invoiceDate'], [/^(khoan muc|khoan muc cp)$/, 'costItem'], [/^(so hd|so hoa don)$/, 'invoiceNo'], [/^(so seri|ky hieu)$/, 'invoiceSerial'],
  [/^(mau hd|mau hoa don)$/, 'invoiceForm'], [/^(doi tuong thue vat|ten don vi)$/, 'invoicePartnerName'], [/^(ma so thue|mst)$/, 'invoicePartnerTaxCode'], [/^(bo phan|don vi)$/, 'department'], [/^(hop dong)$/, 'contract'],
];
function giaTriTien(f: DanTruong, v: string): string {
  if (f === 'amount' || f === 'taxAmount') { const n = soDan(v); return Number.isFinite(n) && n > 0 ? money(n) : ''; }
  if (f === 'invoiceDate') return ngay(v);
  if (f === 'account') return v.trim().split(/\s|-|–/)[0] ?? '';
  return v;
}
export const parseAmount = (s: string): number => Number(s.replace(/[.,\s]/g, '')) || 0;
export const showAmount = (s: string): string => (parseAmount(s) ? money(parseAmount(s)) : '');
export { useDimension } from '@/components/voucher/lookups';

const colsKey = (type: string) => `pt-cot-v2-${type}`;
function readCols(type: string): ColKey[] {
  try { const v = JSON.parse(localStorage.getItem(colsKey(type)) ?? 'null') as ColKey[] | null; return Array.isArray(v) ? v : COLS_DEFAULT; } catch { return COLS_DEFAULT; }
}

export function CashVoucherForm({ type, existing, initial, onClose, onSaved }: {
  type: Exclude<VoucherType, 'manual'>;
  existing?: ExistingVoucher;
  initial?: VoucherTemplateInput;
  onClose: () => void;
  /** addNew = bấm "Ghi và thêm mới": mở tiếp phiếu trống. */
  onSaved: (docNo: string, docDate: string, addNew: boolean) => void;
}) {
  const useReasons = useUseReasons();
  const qc = useQueryClient();
  const meta = VOUCHER_META[type];
  const moneySide = VOUCHER_MONEY[type]!.side;
  /** Phiếu thu, báo có: tài khoản dòng ở bên Có. Phiếu chi, báo nợ: bên Nợ. */
  const lineSide: 'debit' | 'credit' = moneySide === 'debit' ? 'credit' : 'debit';
  const isReceipt = moneySide === 'debit';
  const isBank = type === 'bank_receipt' || type === 'bank_payment';
  const p = existing?.payload ?? initial;
  const pv = p as Partial<VoucherInput> | undefined;
  const cancelled = existing?.status === 'cancelled';
  const readOnly = cancelled || existing?.canModify === false;
  const loaiList = LOAI_PHIEU[type];

  const { data: branches } = useBranches();
  const multi = (branches?.filter((b) => b.isActive).length ?? 0) > 1;
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts', 'posting'], queryFn: () => api.get<Account[]>('/api/v1/accounts', { postingOnly: true }), staleTime: 60_000 });
  const { data: taxCodes = [] } = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 });
  const { data: reasons = [] } = useQuery({ queryKey: ['reasons'], queryFn: () => api.get<Reason[]>('/api/v1/posting/reasons'), staleTime: 60_000 });
  const employees = useDimension('employee');
  const costItems = useDimension('cost_item');
  const departments = useDimension('department');
  const contracts = useDimension('contract');
  // Mục thu / chi: phiếu thu chỉ mục thu, phiếu chi chỉ mục chi (theo Loại của mục).
  const cashItemsAll = useDimension('cash_item') as (Dimension & { extra?: { loai?: string } })[];
  const cashItems = useMemo(() => cashItemsAll.filter((d) => (d.extra?.loai ?? 'chi') === (isReceipt ? 'thu' : 'chi')), [cashItemsAll, isReceipt]);
  const banks = useBankAccounts().data ?? [];
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);
  const moneyAccounts = useMemo(() => accounts.filter((a) => isMoneyAccountFor(type, a.code)), [accounts, type]);
  const reasonKind = isReceipt ? 'receipt' : 'payment';
  // Lý do hạch toán theo màn (chỉ khi bật lý do): màn đã gán lý do thì chỉ hiện các lý do đó.
  const screenKey = isReceipt ? 'cash_receipt' : 'cash_payment';
  const screen = useQuery({ queryKey: ['posting-flow', 'screen-reasons', screenKey], staleTime: 60_000, enabled: useReasons,
    queryFn: () => api.get<{ assigned: boolean; reasons: { code: string; isDefault: boolean }[] }>(`/api/v1/posting-flow/screens/${screenKey}/reasons`) }).data;
  const allowed = screen?.assigned ? new Set(screen.reasons.map((r) => r.code)) : null;
  const reasonList = reasons.filter((r) => r.kind === reasonKind && (r.isActive || r.code === pv?.reasonCode) && (!allowed || allowed.has(r.code) || r.code === pv?.reasonCode));
  const screenDefault = screen?.assigned ? screen.reasons.find((r) => r.isDefault)?.code : undefined;

  const [h, setH] = useState({
    docNo: existing?.docNo ?? '',
    branchCode: p?.branchCode || branches?.find((b) => b.isActive)?.code || '',
    docDate: (existing?.payload.docDate ?? today()) as string,
    moneyAccount: p?.lines[0] ? (isReceipt ? p.lines[0].debitAccount : p.lines[0].creditAccount) : '',
    reasonCode: pv?.reasonCode ?? '',
    employeeCode: pv?.employeeCode ?? '',
    partnerCode: p?.partnerCode ?? '',
    partnerName: pv?.partnerName ?? '',
    phone: pv?.phone ?? '',
    address: pv?.address ?? '',
    counterparty: p?.counterparty ?? '',
    description: p?.description ?? '',
    reference: existing?.payload.reference ?? '',
  });
  const set = (patch: Partial<typeof h>) => setH((x) => ({ ...x, ...patch }));
  useEffect(() => { if (!existing && screenDefault) setH((x) => (x.reasonCode ? x : { ...x, reasonCode: screenDefault })); }, [existing, screenDefault]);
  const branchCode = h.branchCode || branches?.find((b) => b.isActive)?.code || '';
  const [rows, setRows] = useState<Row[]>(() =>
    (p?.lines ?? []).map((l) =>
      blankRow({
        account: lineSide === 'credit' ? l.creditAccount : l.debitAccount,
        amount: l.amount ? money(l.amount) : '', partner: l.partnerCode ?? '', creditPartner: l.creditPartnerCode ?? '', cashflowCode: l.cashflowCode ?? '', description: l.description ?? '',
        taxCode: l.taxCode ?? '', employee: l.employee ?? '', taxAmount: l.taxAmount ? money(l.taxAmount) : '', invoiceDate: l.invoiceDate ?? '', costItem: l.costItem ?? '',
        invoiceNo: l.invoiceNo ?? '', invoiceSerial: l.invoiceSerial ?? '', invoiceForm: l.invoiceForm ?? '', invoicePartnerName: l.invoicePartnerName ?? '', invoicePartnerTaxCode: l.invoicePartnerTaxCode ?? '',
        department: l.department ?? '', contract: l.contract ?? '', case: l.case ?? '', project: l.project ?? '', capitalSource: l.capitalSource ?? '', cashItem: l.cashItem ?? '',
        settleItemId: l.settleItemId ?? '', settleDocNo: l.settleDocNo ?? '', settleDocDate: l.settleDocDate ?? '', settleTotal: l.settleTotal ?? null, settleRemaining: l.settleRemaining ?? null,
      }),
    ),
  );
  // Loại phiếu: phiếu đã lập thì đoán theo tài khoản đối ứng dòng đầu.
  const [loai, setLoai] = useState(() => (p?.lines[0] ? guessLoai(loaiList, lineSide === 'credit' ? p.lines[0].creditAccount : p.lines[0].debitAccount, lineSide) : -1));
  // Lý do tự gợi ("Chi tiền cho …") cho tới khi người lập tự sửa.
  const [autoDesc, setAutoDesc] = useState(!p?.description);
  const [cols, setCols] = useState<ColKey[]>(() => readCols(type));
  const [colMenu, setColMenu] = useState(false);
  const [finding, setFinding] = useState(false);
  const signatures = useSignatures(existing && !cancelled ? existing.id : undefined).data;
  const setRow = (key: number, patch: Partial<Row>) => setRows((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const show = (k: ColKey) => cols.includes(k) || hasData(rows, k);
  const toggleCol = (k: ColKey) => { const next = cols.includes(k) ? cols.filter((x) => x !== k) : [...cols, k]; setCols(next); try { localStorage.setItem(colsKey(type), JSON.stringify(next)); } catch { /* bỏ qua */ } };

  /** Tài khoản tiền mặc định: theo loại phiếu, không có thì tài khoản tiền đầu tiên (1111, 1121…). */
  const defaultMoney = () => pickAccount(moneyAccounts, isReceipt ? loaiList[Math.max(loai, 0)]?.no : loaiList[Math.max(loai, 0)]?.co) || moneyAccounts[0]?.code || '';
  const moneyAccount = h.moneyAccount || (isBank ? '' : defaultMoney());
  // Phiếu mới chưa có dòng: thêm sẵn một dòng (diễn giải theo lý do), như mẫu.
  useEffect(() => { if (!p && !rows.length && accounts.length) setRows([blankRow({ description: h.description })]); }, [accounts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseLoai = (i: number) => {
    setLoai(i);
    const l = loaiList[i];
    if (!l) return;
    const counter = pickAccount(accounts, lineSide === 'credit' ? l.co : l.no);
    const m = pickAccount(moneyAccounts, isReceipt ? l.no : l.co);
    if (m && !isBank) set({ moneyAccount: m });
    // Dòng chưa có tài khoản (hoặc đang theo loại trước) đổi theo loại mới.
    setRows((xs) => xs.map((r) => (!r.account || r.account === pickAccount(accounts, lineSide === 'credit' ? loaiList[loai]?.co : loaiList[loai]?.no) ? { ...r, account: counter } : r)));
  };

  // Đối tượng: chọn mã thì điền Tên, Người nộp / nhận, Điện thoại, Địa chỉ; lý do tự gợi theo tên.
  const partnerQ = useQuery({
    queryKey: ['partners', 'pick', h.partnerCode],
    queryFn: () => api.get<PartnerInfo[]>('/api/v1/partners', { search: h.partnerCode, pageSize: 20 }),
    enabled: h.partnerCode.length >= 2,
    staleTime: 30_000,
  });
  const descFor = (name: string) => `${isReceipt ? 'Thu tiền của' : 'Chi tiền cho'} ${name}`.trim();
  const setDesc = (description: string) => { set({ description }); setRows((xs) => xs.map((r) => (!r.description || r.description === h.description ? { ...r, description } : r))); };
  const pickPartner = async (code: string) => {
    if (!code) return set({ partnerCode: '', partnerName: '', phone: '', address: '' });
    set({ partnerCode: code });
    const list = await qc.fetchQuery({ queryKey: ['partners', 'pick', code], queryFn: () => api.get<PartnerInfo[]>('/api/v1/partners', { search: code, pageSize: 20 }), staleTime: 30_000 });
    const x = list.find((r) => r.code === code);
    if (!x) return;
    set({ partnerCode: code, partnerName: x.name, counterparty: x.contactName || x.name, phone: x.mobile || x.phone || '', address: x.address || '' });
    if (autoDesc) setDesc(descFor(x.name));
    setRows((xs) => xs.map((r) => (r.partner ? r : { ...r, partner: code })));
  };
  const partnerName = h.partnerName || partnerQ.data?.find((x) => x.code === h.partnerCode)?.name || '';

  const total = rows.reduce((s, r) => s + parseAmount(r.amount), 0);
  const taxTotal = rows.reduce((s, r) => s + parseAmount(r.taxAmount), 0);

  /** Thêm dòng: tài khoản theo loại (hoặc lý do), đối tượng / nhân viên / diễn giải theo đầu phiếu. */
  const addRow = () => {
    const l = loaiList[loai];
    const account = pickAccount(accounts, lineSide === 'credit' ? l?.co : l?.no) || ((useReasons ? reasons.find((x) => x.code === h.reasonCode)?.counterAccount : undefined) ?? '');
    setRows((xs) => [...xs, blankRow({ account, partner: h.partnerCode, employee: h.employeeCode, description: h.description })]);
  };
  const removeRow = (key: number) => setRows((xs) => xs.filter((x) => x.key !== key));

  const pickTax = (r: Row, code: string) => {
    const rate = taxCodes.find((t) => t.code === code)?.rate ?? 0;
    setRow(r.key, { taxCode: code, taxAmount: code ? (parseAmount(r.taxAmount) ? r.taxAmount : showAmount(String(Math.round((parseAmount(r.amount) * rate) / 100)))) : '' });
  };

  /** Kiểm tra trước khi ghi. */
  const check = (): string | null => {
    if (!branchCode) return 'Bạn chưa chọn chi nhánh';
    if (!moneyAccount) return isBank ? `Bạn chưa chọn ${isReceipt ? 'tài khoản nộp vào' : 'tài khoản chi'}` : 'Chưa có tài khoản tiền';
    if (!accountMap.has(moneyAccount)) return 'Tài khoản tiền không có trong danh mục';
    if (employees.length > 0 && !h.employeeCode) return 'Bạn chưa chọn nhân viên';
    if (!h.description.trim()) return `Bạn chưa nhập ${isReceipt ? 'lý do thu' : 'lý do chi'}`;
    const lines = rows.filter((r) => r.account || parseAmount(r.amount));
    if (lines.length === 0) return 'Phiếu chưa có dòng hạch toán';
    for (const [i, r] of lines.entries()) {
      const row = `Dòng ${i + 1}: `;
      if (!r.account) return `${row}${lineSide === 'credit' ? 'TK Có' : 'TK Nợ'} không được để trống`;
      const acc = accountMap.get(r.account);
      if (!acc) return `${row}tài khoản không có trong danh mục`;
      if (!parseAmount(r.amount)) return `${row}chưa nhập số tiền`;
      if (r.settleRemaining && parseAmount(r.amount) > r.settleRemaining) return `${row}số tiền phải nhỏ hơn hoặc bằng số tiền còn nợ trên hóa đơn`;
      if (parseAmount(r.taxAmount) > 0 && !r.taxCode) return `${row}bạn chưa chọn loại thuế.`;
      if ((acc.trackPartner || acc.isDebt || acc.normalSide === 'both') && !(r.partner || h.partnerCode)) return `${row}tài khoản bắt buộc phải chọn đối tượng`;
      if (acc.trackCostItem && costItems.length && !r.costItem) return `${row}tài khoản này bắt buộc phải chọn khoản mục CP`;
      if (acc.trackContract && contracts.length && !r.contract) return `${row}tài khoản bắt buộc phải chọn hợp đồng`;
      if (acc.trackDepartment && departments.length && !r.department) return `${row}tài khoản bắt buộc phải chọn đơn vị`;
    }
    return null;
  };

  // Phiếu cũ thanh toán công nợ không qua dòng (chọn khoản công nợ riêng): giữ nguyên các khoản đó khi ghi lại.
  const legacySettle = existing?.payload.settle && !existing.payload.lines.some((l) => l.settleItemId) ? existing.payload.settle : undefined;
  const body = (): VoucherInput => {
    const reason = reasons.find((r) => r.code === h.reasonCode);
    const lines = rows.filter((r) => r.account || parseAmount(r.amount));
    const settleMap = new Map<string, number>();
    for (const r of lines) if (r.settleItemId) settleMap.set(r.settleItemId, (settleMap.get(r.settleItemId) ?? 0) + parseAmount(r.amount));
    return {
      docType: type,
      branchCode,
      docDate: h.docDate,
      docNo: existing ? undefined : h.docNo.trim() || undefined,
      description: h.description.trim() || reason?.name || meta.title,
      counterparty: h.counterparty,
      partnerCode: h.partnerCode || undefined,
      reference: h.reference.trim(),
      reasonCode: h.reasonCode || undefined,
      employeeCode: h.employeeCode || undefined,
      partnerName: partnerName || undefined,
      phone: h.phone || undefined,
      address: h.address || undefined,
      purpose: existing?.payload.purpose,
      dueDate: existing?.payload.dueDate,
      settle: legacySettle ?? [...settleMap].map(([debtItemId, amount]) => ({ debtItemId, amount })),
      lines: lines.map((r) => ({
        debitAccount: lineSide === 'debit' ? r.account : moneyAccount,
        creditAccount: lineSide === 'credit' ? r.account : moneyAccount,
        amount: parseAmount(r.amount),
        description: r.description || h.description,
        partnerCode: r.partner || undefined,
        creditPartnerCode: r.creditPartner || undefined,
        costItem: r.costItem || undefined, cashItem: r.cashItem || undefined, department: r.department || undefined, contract: r.contract || undefined, employee: r.employee || undefined,
        case: r.case || undefined, project: r.project || undefined, capitalSource: r.capitalSource || undefined, cashflowCode: r.cashflowCode || undefined,
        taxCode: r.taxCode || undefined, taxAmount: parseAmount(r.taxAmount), invoiceNo: r.invoiceNo || undefined, invoiceSerial: r.invoiceSerial || undefined,
        invoiceForm: r.invoiceForm || undefined, invoiceDate: r.invoiceDate || undefined, invoicePartnerName: r.invoicePartnerName || undefined, invoicePartnerTaxCode: r.invoicePartnerTaxCode || undefined,
        settleItemId: r.settleItemId || undefined, settleDocNo: r.settleDocNo || undefined, settleDocDate: r.settleDocDate || undefined,
        settleTotal: r.settleTotal ?? undefined, settleRemaining: r.settleRemaining ?? undefined,
      })),
    };
  };

  const { doSave, doDelete, saving, error, setProblem, advisories } = useVoucherSave({
    existing, check, docDate: h.docDate, docType: type, onSaved, onClose,
    confirm: 'Bạn có chắc chắn muốn Ghi phiếu này không?',
    invalidate: [['documents']],
    submit: () => (existing ? api.put<{ docNo: string }>(`/api/v1/vouchers/${existing.id}`, body()) : api.post<{ docNo: string }>('/api/v1/vouchers', body())),
  });

  const dis = readOnly;
  const partnerKind = isReceipt ? 'customer' : 'supplier';
  // Tên đối tượng của từng dòng: đối tượng đầu phiếu lấy tên đầu phiếu; mã khác tra danh mục (giữ trong bộ nhớ đệm).
  const [rowNames, setRowNames] = useState<Record<string, string>>({});
  const lookupName = async (code: string) => {
    if (!code || code === h.partnerCode || rowNames[code] !== undefined) return;
    const list = await qc.fetchQuery({ queryKey: ['partners', 'pick', code], queryFn: () => api.get<PartnerInfo[]>('/api/v1/partners', { search: code, pageSize: 20 }), staleTime: 30_000 });
    setRowNames((m) => ({ ...m, [code]: list.find((x) => x.code === code)?.name ?? '' }));
  };
  useEffect(() => { for (const r of rows) if (r.partner) void lookupName(r.partner); }, [rows.map((r) => r.partner).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameOfPartner = (code: string) => (code === h.partnerCode ? partnerName : rowNames[code] ?? '');
  const moneyPicker = <AccountPicker postingOnly hideName className="input mono" value={moneyAccount} disabled={dis || isBank} onChange={(v) => set({ moneyAccount: v })} />;
  const text = (r: Row, field: 'description' | 'invoiceNo' | 'invoiceSerial' | 'invoiceForm' | 'invoicePartnerName' | 'invoicePartnerTaxCode', cls = 'input') => (
    <input className={cls} value={r[field]} disabled={dis} onChange={(e) => setRow(r.key, { [field]: e.target.value })} />
  );
  const dimCell = (r: Row, field: 'cashItem' | 'costItem' | 'department' | 'contract' | 'employee', list: Dimension[]) => (
    <ListPicker items={list.filter((d) => d.isActive || d.code === r[field])} value={r[field]} disabled={dis} onChange={(v) => setRow(r.key, { [field]: v })} hideName={field !== 'cashItem' && field !== 'costItem'} />
  );

  /** Dán từ Excel: có dòng tiêu đề thì ghép theo tên; không có thì từ ô đang đứng ghi sang phải theo các cột đang hiện, thiếu dòng tự thêm. */
  const onDan = (e: ClipboardEvent<HTMLTableSectionElement>) => {
    if (dis) return;
    const bang = bangDan(e.clipboardData.getData('text/plain'));
    const tr = (e.target as HTMLElement).closest('tr[data-dong]');
    const td = (e.target as HTMLElement).closest('td');
    if (!bang || !tr || !td) return;
    e.preventDefault();
    const moi = () => blankRow({ partner: h.partnerCode, employee: h.employeeCode, description: h.description });
    const dau = bang[0]!.map((c) => DAN_TEN_TIEN.find(([re]) => re.test(khongDau(c)))?.[1]);
    if (dau.filter(Boolean).length >= 2) {
      const them = bang.slice(1).map((cells) => { const r = moi(); dau.forEach((f, i) => { if (f) (r as unknown as Record<string, string>)[f] = giaTriTien(f, cells[i] ?? ''); }); return r; });
      setRows((xs) => [...xs.filter((x) => x.account || parseAmount(x.amount)), ...them]);
      return;
    }
    const cot = [...tr.querySelectorAll('td[data-f]')].map((c) => c.getAttribute('data-f') as DanTruong);
    const c0 = Math.max(0, cot.indexOf(td.getAttribute('data-f') as DanTruong));
    const r0 = rows.findIndex((x) => String(x.key) === tr.getAttribute('data-dong'));
    setRows((xs) => {
      const out = [...xs];
      bang.forEach((cells, k) => {
        const i = r0 + k;
        while (out.length <= i) out.push(moi());
        const patch: Record<string, string> = {};
        cells.forEach((v, j) => { const f = cot[c0 + j]; if (f) patch[f] = giaTriTien(f, v); });
        out[i] = { ...out[i]!, ...patch };
      });
      return out;
    });
  };

  const title = isBank ? (isReceipt ? 'Thu tiền gửi' : 'Chi tiền gửi') : meta.title;
  const bankAcc = banks.find((b) => b.accountCode === moneyAccount && b.isActive);
  return (
    <>
    <VoucherModal
      title={title} existing={existing} readOnly={dis} saving={saving} total={total + taxTotal}
      titleExtra={
        <select className="select input pt-loai" value={loai} disabled={dis} title="Loại phiếu: chọn để điền sẵn tài khoản" onChange={(e) => chooseLoai(Number(e.target.value))}>
          <option value={-1}>— Chọn loại {isReceipt ? 'thu' : 'chi'} —</option>
          {loaiList.map((l, i) => <option key={l.name} value={i}>{i + 1}. {l.name}</option>)}
        </select>
      }
      onSave={() => doSave(false)} onSaveNew={() => doSave(true)}
      printSlot={<PrintButton bare screen={VOUCHER_SCREEN[type]} templates={VOUCHER_TEMPLATES[type]} disabled={!existing} getDocs={(): PrintSheet[] => (existing ? [{ type: type, docNo: existing.docNo, voucher: existing.payload, signatures, banks, branchName: branches?.find((b) => b.code === existing.payload.branchCode)?.name ?? existing.payload.branchCode }] : [])} />}
      onDelete={doDelete} onClose={onClose}
      error={error} readOnlyText={readOnlyReason(existing, { external: false })} advisories={advisories}
    >
      <div className="pt-head">
        <div className="pt-head-left">
          {isBank && (
            <div className="pt-f wide">
              <label className="req">{isReceipt ? 'Nộp vào tài khoản' : 'Tài khoản chi'}</label>
              <select className="select input" value={bankAcc?.code ?? ''} disabled={dis} onChange={(e) => { const b = banks.find((x) => x.code === e.target.value); if (b) set({ moneyAccount: b.accountCode }); }}>
                <option value="" />
                {banks.filter((b) => b.isActive).map((b) => <option key={b.code} value={b.code}>{b.accountNo} — {b.bankName} (TK {b.accountCode})</option>)}
              </select>
            </div>
          )}
          <div className="pt-f"><label>Mã đối tượng</label><PartnerPicker activeOnly={!existing} addKind={partnerKind} value={h.partnerCode} disabled={dis} hideName onChange={(v) => void pickPartner(v)} /></div>
          <div className="pt-f"><label>Tên đối tượng</label><input className="input" value={partnerName} disabled={dis} onChange={(e) => set({ partnerName: e.target.value })} /></div>
          <div className="pt-f"><label>{isReceipt ? 'Người nộp' : 'Người nhận'}</label><input className="input" value={h.counterparty} disabled={dis} onChange={(e) => set({ counterparty: e.target.value })} /></div>
          <div className="pt-f"><label>Địa chỉ</label><input className="input" value={h.address} disabled={dis} onChange={(e) => set({ address: e.target.value })} /></div>
          <div className="pt-f wide"><label className="req">{isBank ? (isReceipt ? 'Lý do thu' : 'Nội dung thanh toán') : isReceipt ? 'Lý do nộp' : 'Lý do chi'}</label>
            <input className="input" value={h.description} disabled={dis} placeholder={descFor('…')} onChange={(e) => { setAutoDesc(false); setDesc(e.target.value); }} />
          </div>
          <div className="pt-f"><label className={employees.length > 0 ? 'req' : undefined}>Nhân viên</label>
            <ListPicker className="input" style={{ width: "100%" }} items={employees.filter((e) => e.isActive || e.code === h.employeeCode)} value={h.employeeCode} disabled={dis} onChange={(v) => set({ employeeCode: v })} />
          </div>
          <div className="pt-f"><label>Kèm theo</label>
            <div className="pt-kem"><input className="input" value={h.reference} disabled={dis} placeholder="Số lượng" onChange={(e) => set({ reference: e.target.value })} /> <span>chứng từ gốc</span></div>
          </div>
        </div>
        <div className="pt-head-right">
          <div className="pt-f"><label className="req">Ngày hạch toán</label><input type="date" className="input" value={h.docDate} disabled={dis} onChange={(e) => set({ docDate: e.target.value })} /></div>
          <div className="pt-f"><label>{isBank ? 'Số chứng từ' : isReceipt ? 'Số phiếu thu' : 'Số phiếu chi'}</label><input className="input mono" value={h.docNo} disabled={dis || Boolean(existing)} placeholder="Tự cấp khi ghi" onChange={(e) => set({ docNo: e.target.value })} /></div>
          {multi && <div className="pt-f"><label className="req">Chi nhánh</label><BranchPicker activeOnly value={branchCode} disabled={dis || Boolean(existing)} onChange={(c) => set({ branchCode: c })} /></div>}
          {useReasons && <div className="pt-f"><label>Lý do hạch toán</label><ListPicker items={reasonList.map((r) => ({ code: r.code, name: r.name }))} value={h.reasonCode} disabled={dis} onChange={(v) => set({ reasonCode: v })} /></div>}
        </div>
      </div>

      <div className="pt-tabs">
        <span className="tab-on">Hạch toán</span>
        <div className="pt-tools">
          <button className="btn btn-sm" disabled={dis} onClick={() => (h.partnerCode ? setFinding(true) : setProblem('Bạn phải chọn đối tượng trước khi tìm chứng từ còn nợ'))} title="Chọn chứng từ còn nợ của đối tượng, mỗi chứng từ thành một dòng"><FileSearch size={14} /> Tìm chứng từ</button>
          <span style={{ position: 'relative' }}>
            <button className="btn btn-sm" onClick={() => setColMenu((x) => !x)} title="Bật / tắt cột thêm của lưới"><Columns3 size={14} /> Cột</button>
            {colMenu && (
              <div className="pt-cot" onMouseLeave={() => setColMenu(false)}>
                {COLS.map(([k, l]) => <label key={k} className="checkbox"><input type="checkbox" checked={show(k)} disabled={hasData(rows, k)} onChange={() => toggleCol(k)} /> {l}</label>)}
              </div>
            )}
          </span>
        </div>
      </div>
      <div className="vf-grid-wrap">
        <table className="vf-grid">
          <thead>
            <tr>
              <th className="vf-act">#</th>
              <th style={{ minWidth: 280 }}>Diễn giải</th>
              <th style={{ minWidth: 90 }}>TK Nợ</th><th style={{ minWidth: 90 }}>TK Có</th>
              <th style={{ minWidth: 130 }}>Số tiền</th>
              <th style={{ minWidth: 120 }}>Đối tượng</th><th style={{ minWidth: 200 }}>Tên đối tượng</th>
              {show('cashItem') && <th style={{ minWidth: 220 }} title="Mục thu / chi của dòng tiền — báo cáo Dòng tiền gom theo mục">Mục thu/chi</th>}
              {show('costItem') && <th style={{ minWidth: 220 }}>Khoản mục CP</th>}
              {show('department') && <th style={{ minWidth: 110 }}>Đơn vị</th>}
              {show('contract') && <th style={{ minWidth: 110 }}>Hợp đồng</th>}
              {show('employee') && <th style={{ minWidth: 110 }}>Nhân viên</th>}
              {show('cashflowCode') && <th style={{ minWidth: 130 }}>Mã lưu chuyển tiền tệ</th>}
              {show('tax') && <><th style={{ minWidth: 90 }}>Loại thuế</th><th style={{ minWidth: 110 }}>Tiền thuế</th><th style={{ minWidth: 100 }}>Số HĐ</th><th style={{ minWidth: 90 }}>Ký hiệu HĐ</th><th style={{ minWidth: 120 }}>Ngày HĐ</th><th style={{ minWidth: 160 }}>Tên đơn vị trên HĐ</th><th style={{ minWidth: 110 }}>MST trên HĐ</th></>}
              {show('settle') && <><th style={{ minWidth: 120 }}>Chứng từ còn nợ</th><th style={{ minWidth: 100 }}>Ngày chứng từ</th><th style={{ minWidth: 110 }}>Tổng tiền</th><th style={{ minWidth: 110 }}>Số còn nợ</th></>}
              <th className="vf-act" />
            </tr>
          </thead>
          <tbody onPaste={onDan}>
            {rows.map((r, i) => (
              <tr key={r.key} data-dong={r.key}>
                <td className="vf-act num">{i + 1}</td>
                <td data-f="description">{text(r, 'description')}</td>
                {lineSide === 'debit'
                  ? <><td data-f="account"><AccountPicker postingOnly hideName className="input mono" value={r.account} disabled={dis} onChange={(v) => setRow(r.key, { account: v })} /></td><td>{moneyPicker}</td></>
                  : <><td>{moneyPicker}</td><td data-f="account"><AccountPicker postingOnly hideName className="input mono" value={r.account} disabled={dis} onChange={(v) => setRow(r.key, { account: v })} /></td></>}
                <td data-f="amount"><input className="input num" inputMode="numeric" value={r.amount} disabled={dis} onChange={(e) => setRow(r.key, { amount: e.target.value })} onBlur={() => setRow(r.key, { amount: showAmount(r.amount) })} /></td>
                <td data-f="partner"><PartnerPicker activeOnly={!existing} addKind={partnerKind} hideName value={r.partner} disabled={dis} onChange={(v) => setRow(r.key, { partner: v })} /></td>
                <td className="ro">{nameOfPartner(r.partner || h.partnerCode)}</td>
                {show('cashItem') && <td>{dimCell(r, 'cashItem', cashItems)}</td>}
                {show('costItem') && <td data-f="costItem">{dimCell(r, 'costItem', costItems)}</td>}
                {show('department') && <td data-f="department">{dimCell(r, 'department', departments)}</td>}
                {show('contract') && <td data-f="contract">{dimCell(r, 'contract', contracts)}</td>}
                {show('employee') && <td data-f="employee">{dimCell(r, 'employee', employees)}</td>}
                {show('cashflowCode') && (
                  <td data-f="cashflowCode">
                    <select className="select input" value={r.cashflowCode} disabled={dis} onChange={(e) => setRow(r.key, { cashflowCode: e.target.value })}>
                      <option value="" />
                      {CASHFLOW_CODES.map(([c, n]) => <option key={c} value={c} title={n}>{c} — {n}</option>)}
                    </select>
                  </td>
                )}
                {show('tax') && <>
                  <td data-f="taxCode">
                    <select className="select input" value={r.taxCode} disabled={dis} onChange={(e) => pickTax(r, e.target.value)}>
                      <option value="" />
                      {taxCodes.filter((t) => t.isActive || t.code === r.taxCode).map((t) => <option key={t.code} value={t.code}>{t.code}</option>)}
                    </select>
                  </td>
                  <td data-f="taxAmount"><input className="input num" inputMode="numeric" value={r.taxAmount} disabled={dis} onChange={(e) => setRow(r.key, { taxAmount: e.target.value })} onBlur={() => setRow(r.key, { taxAmount: showAmount(r.taxAmount) })} /></td>
                  <td data-f="invoiceNo">{text(r, 'invoiceNo', 'input mono')}</td>
                  <td data-f="invoiceSerial">{text(r, 'invoiceSerial', 'input mono')}</td>
                  <td data-f="invoiceDate"><input type="date" className="input" value={r.invoiceDate} disabled={dis} onChange={(e) => setRow(r.key, { invoiceDate: e.target.value })} /></td>
                  <td data-f="invoicePartnerName">{text(r, 'invoicePartnerName')}</td>
                  <td data-f="invoicePartnerTaxCode">{text(r, 'invoicePartnerTaxCode', 'input mono')}</td>
                </>}
                {show('settle') && <>
                  <td className="mono ro">{r.settleDocNo}</td>
                  <td className="ro">{r.settleDocDate ? showDate(r.settleDocDate) : ''}</td>
                  <td className="num ro">{r.settleTotal ? money(r.settleTotal) : ''}</td>
                  <td className="num ro">{r.settleRemaining ? money(r.settleRemaining) : ''}</td>
                </>}
                <td className="vf-act"><button disabled={dis} title="Xóa dòng" onClick={() => removeRow(r.key)}><Trash2 size={14} className="text-bad" /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="vf-act" /><td /><td /><td />
              <td className="num"><b>{money(total, { blankZero: false })}</b></td>
              <td colSpan={2} />
              {show('cashItem') && <td />}{show('costItem') && <td />}{show('department') && <td />}{show('contract') && <td />}{show('employee') && <td />}{show('cashflowCode') && <td />}
              {show('tax') && <><td /><td className="num">{taxTotal ? money(taxTotal) : ''}</td><td colSpan={5} /></>}
              {show('settle') && <td colSpan={4} />}
              <td className="vf-act" />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 6 }}>
        <button className="btn btn-sm" disabled={dis} onClick={addRow}><Plus size={14} /> Thêm dòng</button>
        <button className="btn btn-sm" disabled={dis || !rows.length} onClick={() => setRows([])}><Trash2 size={14} /> Xóa hết dòng</button>
      </div>

      {existing && !cancelled && <div style={{ marginTop: 8 }}><SignaturePanel id={existing.id} roles={signRolesOf(type)} /></div>}
    </VoucherModal>
      {finding && (
        <FindDocuments
          partnerCode={h.partnerCode}
          side={isReceipt ? 'debit' : 'credit'}
          taken={new Set(rows.map((r) => r.settleItemId).filter(Boolean))}
          onClose={() => setFinding(false)}
          onPick={(items) => {
            setRows((xs) => [...xs.filter((x) => x.account || parseAmount(x.amount)), ...items.map((i) => blankRow({
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
