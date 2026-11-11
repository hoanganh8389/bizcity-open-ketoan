/**
 * Một màn cho bốn loại sổ của một tài khoản (chọn qua preset.kind):
 *   detail   Sổ chi tiết tài khoản: dư luỹ kế từng dòng, có cột khoản mục / bộ phận.
 *   ledger   Sổ cái (S03b): không có dư luỹ kế, lọc được theo tài khoản đối ứng.
 *   partner  Sổ chi tiết công nợ: lọc theo đối tượng, dư luỹ kế.
 *   cash     Sổ quỹ / tiền gửi: cột Thu / Chi / Tồn; tuỳ chọn chi tiết thu chi chia cột theo tài khoản đối ứng.
 * Kiểu báo cáo: 1 = từng dòng, 2 = theo chứng từ + tài khoản đối ứng, 3 = theo chứng từ.
 */
import { useRef, useState } from 'react';
import { BranchCheckList, ReportSideLayout, SideActions, SideField, SideKy, branchesPicked, FilterLayout } from '@/components/ReportPanel';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DOC_TYPE_LABELS, DOC_TYPE_LIST, type DocType } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { date, defaultFrom, defaultTo, periodFrom } from '@/lib/format';
import { useBranches } from '@/components/filters';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Loading, Money } from '@/components/ui';
import { EntryOpen } from '../../../features/ledger/EntriesPage';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker, ItemPicker, ListPicker, PartnerPicker } from '@/components/pickers';
import { useBankAccounts } from '../../../features/catalog/BankAccountsPage';
import { PrintButton } from '@/components/print';
import { ledgerTemplates, type LedgerSheet } from './mauIn/soTaiKhoan';

type Kind = 'detail' | 'ledger' | 'partner' | 'cash';
interface Line {
  postingDate: string; docDate: string; counterparty: string; entryId: string; entryNo: string; docNo: string; docType: string; invoiceNo: string | null; description: string; accountCode: string;
  counterAccounts: string; partnerCode: string | null; partnerName: string | null; productSku: string; productName: string; branchCode: string; costItem: string; department: string; contract: string;
  cashColumn: string; debit: number; credit: number; balanceDebit: number; balanceCredit: number;
}
interface Data {
  account: { code: string; name: string };
  opening: { debit: number; credit: number };
  rows: Line[];
  totals: { debit: number; credit: number };
  closing: { debit: number; credit: number };
  truncated: boolean;
}

/** Bản dựng sẵn của sổ cho một nhóm tài khoản (sổ cái, sổ quỹ tiền mặt, sổ tiền gửi, sổ công nợ). */
export interface LedgerPreset { account: string; title: string; code: string; helpKey: string; kind?: Kind }

const DOC_TYPES: DocType[] = DOC_TYPE_LIST;
/** Loại CT của sổ quỹ / tiền gửi. */
const CASH_DOC_TYPES: [string, string][] = [
  ['', 'Tất cả'], ['purchase', 'Phiếu trả tiền NCC'], ['sale', 'Phiếu thu tiền khách hàng'], ['receipt', 'Phiếu thu'], ['payment', 'Phiếu chi'],
  ['bank_receipt', 'Thu tiền gửi'], ['bank_payment', 'Chi tiền gửi'],
];

export function AccountLedgerPage({ preset }: { preset?: LedgerPreset }) {
  const kind: Kind = preset?.kind ?? 'detail';
  const banks = useBankAccounts(preset?.code === 'ACC56').data ?? [];
  const [params] = useSearchParams();
  const [f, setF] = useState({
    account: params.get('account') ?? preset?.account ?? '1111',
    // Sổ quỹ, sổ tiền gửi mở theo tháng này; sổ khác như cũ.
    from: params.get('from') ?? (kind === 'cash' ? periodFrom() : defaultFrom()),
    to: params.get('to') ?? defaultTo(),
    branchCodes: '',
    partnerCode: params.get('partnerCode') ?? '',
    showCorrections: false,
    kind,
    groupMode: '1',
    counterAccount: '',
    docType: '',
    sku: params.get('sku') ?? '',
  });
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  // Sổ cái, sổ chi tiết tài khoản: bảng lọc bên trái, sửa ô lọc rồi bấm "Tìm kiếm" mới xem (như màn sổ quen thuộc).
  const [df, setDf] = useState(f);
  const setD = (p: Partial<typeof f>) => setDf((x) => ({ ...x, ...p }));
  const exportRef = useRef<(() => void) | null>(null);
  const q = useQuery({ queryKey: ['account-ledger', f], queryFn: () => api.get<Data>('/api/v1/reports/account-ledger', f), enabled: Boolean(f.account) });
  const d = q.data;

  const cash = kind === 'cash';
  const ledger = kind === 'ledger';
  const withBalance = !ledger;
  const label = (t: string) => DOC_TYPE_LABELS[t as DocType] ?? t;

  const panel = (
    <>
      <SideKy from={df.from} to={df.to} onChange={(from, to) => setD({ from, to })} />
      <SideField label="Số tài khoản"><AccountPicker className="input" placeholder="" value={df.account} onChange={(account) => setD({ account })} /></SideField>
      <SideField label="TK Đối ứng"><AccountPicker className="input" placeholder="" value={df.counterAccount} onChange={(counterAccount) => setD({ counterAccount })} /></SideField>
      {cash && (
        <SideField label="Loại CT">
          <select className="select input" value={df.docType} onChange={(e) => setD({ docType: e.target.value })}>
            {CASH_DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </SideField>
      )}
      {preset?.code === 'ACC56' && (
        <SideField label="Ngân hàng">
          <ListPicker className="input" items={banks.map((b) => ({ code: b.accountCode, name: `${b.bankName} ${b.accountNo}`, hint: b.code }))} value={banks.some((b) => b.accountCode === df.account) ? df.account : ''}
            onChange={(v) => setD({ account: v || preset.account })} placeholder="" />
        </SideField>
      )}
      {(kind === 'detail' || kind === 'ledger') && <SideField label="Mã hàng"><ItemPicker className="input" hideName placeholder="Tất cả" value={df.sku} onChange={(sku) => setD({ sku })} /></SideField>}
      {(kind === 'detail' || kind === 'partner') && <SideField label={kind === 'partner' ? 'KH/NCC' : 'Mã đối tượng'}><PartnerPicker className="input" placeholder="" value={df.partnerCode} onChange={(partnerCode) => setD({ partnerCode })} /></SideField>}
      <span className="muted" style={{ fontSize: 12, marginTop: 2 }}>Chi nhánh</span>
      <BranchCheckList value={df.branchCodes} onChange={(branchCodes) => setD({ branchCodes })} onRestore={(branchCodes) => { setD({ branchCodes }); set({ branchCodes }); }} />
      {!cash && kind !== 'partner' && (
        <>
          <span className="muted" style={{ fontSize: 12, marginTop: 2 }}>Kiểu báo cáo</span>
          <select className="select input" style={{ height: 26, fontSize: 12 }} value={df.groupMode} onChange={(e) => setD({ groupMode: e.target.value })}>
            <option value="1">Theo chi tiết chứng từ</option>
            <option value="2">Theo chứng từ + tài khoản đối ứng</option>
            <option value="3">Theo chứng từ</option>
          </select>
        </>
      )}
      <SideActions onSearch={() => branchesPicked(df.branchCodes) && setF(df)} onExport={d && d.rows.length ? () => exportRef.current?.() : undefined} busy={q.isFetching}
        print={<PrintButton screen={preset?.code ?? 'ACC12'} templates={ledgerTemplates(kind, preset?.code ?? 'ACC12')} disabled={!d}
          getDocs={(): LedgerSheet[] => (d ? [{ ...d, kind, code: preset?.code ?? 'ACC12', title: preset?.title ?? 'Sổ chi tiết tài khoản', from: f.from, to: f.to, branchCodes: f.branchCodes, partnerCode: f.partnerCode }] : [])} />} />
    </>
  );

  return (
    <>
      <PageHeader
        title={preset?.title ?? 'Sổ chi tiết tài khoản'}
        code={preset?.code ?? 'ACC12'}
        note={d ? `${d.account.code} — ${d.account.name}` : 'Chọn tài khoản để xem'}
        helpKey={preset?.helpKey ?? 'so-chi-tiet'}
      />
      <ReportSideLayout panel={panel} boThamSo={{ value: f, onApply: (v: typeof f) => { setF(v); setDf(v); } }}>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        <div className="card">
          {!f.account ? <Empty text="Chọn Số tài khoản ở bảng bên trái rồi bấm Tìm kiếm." /> : q.isLoading ? <Loading /> : !d ? <Empty /> : cash ? (
            <CashTable d={d} title={preset?.title ?? ''} from={f.from} to={f.to} onOpen={setOpenEntry} storageKey={preset?.code ?? 'acc55'} exportRef={exportRef} />
          ) : (
            <LedgerGrid d={d} kind={kind} storageKey={`${preset?.code ?? 'ACC12'}-${kind}-v2`} onOpen={setOpenEntry} exportRef={exportRef} />
          )}
        </div>
      </ReportSideLayout>
      {openEntry && <EntryOpen id={openEntry} onClose={() => setOpenEntry(null)} />}
    </>
  );
}

/** Tài khoản doanh thu, chi phí (loại 5–8) và xác định kết quả 911: sau kết chuyển không có số dư cuối kỳ. */
const isProfitLossAccount = (code: string) => /^[5-8]/.test(code) || code.startsWith('911');

/** Lưới sổ cái / sổ chi tiết tài khoản (dòng Số đầu kỳ, phát sinh, Số cuối kỳ). */
function LedgerGrid({ d, kind, storageKey, onOpen, exportRef }: { d: Data; kind: Kind; storageKey: string; onOpen: (id: string) => void; exportRef?: { current: (() => void) | null } }) {
  if (kind === 'partner') return <PartnerLedgerGrid d={d} storageKey={storageKey} onOpen={onOpen} exportRef={exportRef} />;
  const ledger = kind === 'ledger';
  // Sổ chi tiết tài khoản doanh thu, chi phí (loại 5–8) và 911: sau kết chuyển các tài khoản này không có số dư cuối kỳ,
  // nên bỏ dòng Số dư cuối kỳ (vẫn giữ Số dư đầu kỳ và cột Dư Nợ / Dư Có).
  const profitLoss = kind === 'detail' && isProfitLossAccount(d.account.code);
  const withBalance = !ledger;
  const goods = /^15[2-8]/.test(d.account.code);
  const label = (t: string) => DOC_TYPE_LABELS[t as DocType] ?? t;
  return (
    <DataGrid
      storageKey={storageKey}
      rows={d.rows}
      rowKey={(r, i) => `${r.entryId}-${i}`}
      onRowClick={(r) => onOpen(r.entryId)}
      exportRef={exportRef}
      groupable
      footerLabel="Phát sinh trong kỳ"
      note={d.truncated ? 'chỉ hiện 20.000 dòng đầu, hãy thu hẹp khoảng ngày' : profitLoss ? 'tài khoản doanh thu, chi phí: không hiện dòng số dư cuối kỳ' : undefined}
      topRows={[{ key: 'open', label: ledger ? 'Số đầu kỳ' : 'Số dư đầu kỳ', cells: withBalance ? { balanceDebit: <Money value={d.opening.debit} />, balanceCredit: <Money value={d.opening.credit} /> } : { debit: <Money value={d.opening.debit} />, credit: <Money value={d.opening.credit} /> } }]}
      bottomRows={profitLoss ? [] : [{ key: 'close', label: ledger ? 'Số cuối kỳ' : 'Số dư cuối kỳ', cells: withBalance ? { balanceDebit: <Money value={d.closing.debit} />, balanceCredit: <Money value={d.closing.credit} /> } : { debit: <Money value={d.closing.debit} />, credit: <Money value={d.closing.credit} /> } }]}
      columns={[
        { key: 'postingDate', header: ledger ? 'Ngày, tháng ghi sổ' : 'Ngày ghi sổ', type: 'date' },
        { key: 'docNo', header: 'Số chứng từ', type: 'code', render: (r) => <>{r.docNo}{r.docType === 'closing' && <span className="muted"> · KC</span>}</> },
        { key: 'docType', header: 'Loại chứng từ', value: (r) => label(r.docType), hidden: true },
        { key: 'invoiceNo', header: ledger ? 'Số hoá đơn' : 'Số HĐ', type: 'code' },
        { key: 'description', header: 'Diễn giải' },
        { key: 'counterAccounts', header: ledger ? 'Tài khoản đối ứng' : 'TK đối ứng', type: 'code' },
        { key: 'partnerCode', header: 'Mã đối tượng', type: 'code', hidden: true },
        { key: 'partnerName', header: 'Tên đối tượng', hidden: true },
        // Mã hàng: sổ các tài khoản hàng hoá (15*) hiện sẵn để đối chiếu theo mã; tài khoản khác bật ở nút Cột.
        { key: 'productSku', header: 'Mã hàng', type: 'code', hidden: !goods },
        { key: 'productName', header: 'Tên hàng', hidden: !goods },
        { key: 'costItem', header: 'Khoản mục', type: 'code', hidden: true },
        { key: 'department', header: 'Bộ phận', type: 'code', hidden: true },
        { key: 'contract', header: 'Hợp đồng', type: 'code', hidden: true },
        { key: 'employee', header: 'Nhân viên', type: 'code', hidden: true },
        { key: 'case', header: 'Vụ việc', type: 'code', hidden: true },
        { key: 'project', header: 'Dự án', type: 'code', hidden: true },
        { key: 'capitalSource', header: 'Nguồn vốn', type: 'code', hidden: true },
        ...(ledger ? [] : ([{ key: 'branchCode', header: 'Chi nhánh', type: 'code', hidden: true }] satisfies Column<Line>[])),
        { key: 'debit', header: ledger ? 'Phát sinh Nợ' : 'Nợ', type: 'money', sum: true },
        { key: 'credit', header: ledger ? 'Phát sinh Có' : 'Có', type: 'money', sum: true },
        // Sổ cái: chi nhánh và tài khoản chi tiết (lọc theo đầu số 111 ra cả 1111, 1121…) hiện sau số tiền.
        ...(ledger ? ([
          { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
          { key: 'accountCode', header: 'Tài khoản', type: 'code' },
        ] satisfies Column<Line>[]) : []),
        ...(withBalance ? ([
          { key: 'balanceDebit', header: 'Dư Nợ', type: 'money' },
          { key: 'balanceCredit', header: 'Dư Có', type: 'money' },
        ] satisfies Column<Line>[]) : []),
      ] satisfies Column<Line>[]}
    />
  );
}

/** Sổ chi tiết công nợ: cột như sổ chi tiết công nợ quen thuộc (Ps Nợ, Ps Có, Nợ / Có cuối kỳ, mã khách hàng…). */
function PartnerLedgerGrid({ d, storageKey, onOpen, exportRef }: { d: Data; storageKey: string; onOpen: (id: string) => void; exportRef?: { current: (() => void) | null } }) {
  const label = (t: string) => DOC_TYPE_LABELS[t as DocType] ?? t;
  return (
    <DataGrid
      storageKey={`${storageKey}-v2`}
      rows={d.rows}
      rowKey={(r, i) => `${r.entryId}-${i}`}
      onRowClick={(r) => onOpen(r.entryId)}
      exportRef={exportRef}
      groupable
      footerLabel="Phát sinh trong kỳ"
      note={d.truncated ? 'chỉ hiện 20.000 dòng đầu, hãy thu hẹp khoảng ngày' : undefined}
      topRows={[{ key: 'open', label: 'Số dư đầu kỳ', cells: { balanceDebit: <Money value={d.opening.debit} />, balanceCredit: <Money value={d.opening.credit} /> } }]}
      bottomRows={[{ key: 'close', label: 'Số dư cuối kỳ', cells: { balanceDebit: <Money value={d.closing.debit} />, balanceCredit: <Money value={d.closing.credit} /> } }]}
      columns={[
        { key: 'postingDate', header: 'Ngày, tháng ghi sổ', type: 'date' },
        { key: 'docNo', header: 'Số CT', type: 'code' },
        { key: 'description', header: 'Diễn Giải' },
        { key: 'debit', header: 'Ps Nợ', type: 'money', sum: true },
        { key: 'credit', header: 'Ps Có', type: 'money', sum: true },
        { key: 'balanceDebit', header: 'Nợ cuối kỳ', type: 'money' },
        { key: 'balanceCredit', header: 'Có cuối kỳ', type: 'money' },
        { key: 'counterAccounts', header: 'Tài khoản đối ứng', type: 'code' },
        { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
        { key: 'employee', header: 'Mã nhân viên', type: 'code' },
        { key: 'invoiceNo', header: 'Số hóa đơn', type: 'code' },
        { key: 'docType', header: 'Loại phiếu', value: (r) => label(r.docType) },
        { key: 'partnerCode', header: 'Mã khách hàng', type: 'code' },
        { key: 'partnerName', header: 'Tên khách hàng' },
        { key: 'accountCode', header: 'Tài Khoản', type: 'code' },
        { key: 'costItem', header: 'Mã khoản mục', type: 'code', hidden: true },
        { key: 'contract', header: 'Mã hợp đồng', type: 'code', hidden: true },
        { key: 'department', header: 'Mã bộ phận', type: 'code', hidden: true },
      ] satisfies Column<Line>[]}
    />
  );
}

/**
 * Sổ quỹ / tiền gửi: dòng Dư đầu kỳ, từng dòng thu chi (Số tiền thu, Số tiền chi, Dư cuối), Phát sinh trong kỳ, Dư cuối kỳ.
 * Các cột Thu ngân hàng … Chi khác chia số tiền theo tài khoản đối ứng; chỉ có số khi tích "Hiển thị chi tiết từng loại thu chi".
 */
/** Kỳ của sổ: "Tháng 11 năm 2026", "Năm 2026" hoặc "Từ ngày … đến ngày …". */
export function kyText(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const last = new Date(ty!, tm!, 0).getDate();
  if (fd === 1 && fy === ty && fm === tm && td === last) return `Tháng ${fm} năm ${fy}`;
  if (fd === 1 && fm === 1 && fy === ty && tm === 12 && td === 31) return `Năm ${fy}`;
  return `Từ ngày ${date(from)} đến ngày ${date(to)}`;
}

/**
 * Sổ quỹ tiền mặt (S07a-DN) / Sổ tiền gửi ngân hàng: Ngày ghi sổ · Ngày chứng từ · Số hiệu chứng từ (Thu, Chi) · Diễn giải ·
 * Số tiền (Thu, Chi, Tồn) · Người nhận/Người nộp · Loại chứng từ · Ghi chú. Dòng Số tồn đầu kỳ, Cộng phát sinh, Số tồn cuối kỳ.
 * Cột Chi nhánh chỉ hiện khi đơn vị có nhiều chi nhánh.
 */
function CashTable({ d, title, from, to, onOpen, storageKey, exportRef }: { d: Data; title: string; from: string; to: string; onOpen: (id: string) => void; storageKey: string; exportRef?: { current: (() => void) | null } }) {
  const multi = (useBranches().data?.length ?? 0) > 1;
  const opening = d.opening.debit - d.opening.credit;
  const closing = d.closing.debit - d.closing.credit;
  const label = (t: string) => DOC_TYPE_LABELS[t as DocType] ?? t;
  const ton = (v: number) => <Money value={v} blankZero={false} />;
  return (
    <>
      <div className="rp-tieu-de"><h2>{title.toUpperCase()}</h2><i>{kyText(from, to)}</i></div>
      <DataGrid
        storageKey={`${storageKey}-so-quy-v3`}
        rows={d.rows}
        rowKey={(r, i) => `${r.entryId}-${i}`}
        onRowClick={(r) => onOpen(r.entryId)}
        exportRef={exportRef}
        exportTitle={`${title} — ${kyText(from, to)}`}
        footerLabel="Cộng phát sinh"
        note={d.truncated ? 'chỉ hiện 20.000 dòng đầu, hãy thu hẹp khoảng ngày' : undefined}
        topRows={[{ key: 'open', label: 'Số tồn đầu kỳ', cells: { ton: ton(opening) } }]}
        bottomRows={[{ key: 'close', label: 'Số tồn cuối kỳ', cells: { ton: ton(closing) } }]}
        columns={[
          { key: 'postingDate', header: 'Ngày ghi sổ', type: 'date', width: 96 },
          { key: 'docDate', header: 'Ngày chứng từ', type: 'date', width: 96 },
          { key: 'soThu', header: 'Thu', title: 'Số hiệu chứng từ thu', band: 'Số hiệu chứng từ', type: 'code', width: 110, value: (r) => (r.debit > 0 ? r.docNo : '') },
          { key: 'soChi', header: 'Chi', title: 'Số hiệu chứng từ chi', band: 'Số hiệu chứng từ', type: 'code', width: 110, value: (r) => (r.credit > 0 ? r.docNo : '') },
          { key: 'description', header: 'Diễn giải', width: 280 },
          { key: 'debit', header: 'Thu', title: 'Số tiền thu', band: 'Số tiền', type: 'money', sum: true, width: 120 },
          { key: 'credit', header: 'Chi', title: 'Số tiền chi', band: 'Số tiền', type: 'money', sum: true, width: 120 },
          { key: 'ton', header: 'Tồn', title: 'Số tiền tồn sau dòng này', band: 'Số tiền', type: 'money', showZero: true, width: 130, value: (r) => r.balanceDebit - r.balanceCredit },
          { key: 'nguoi', header: 'Người nhận/Người nộp', width: 180, value: (r) => r.counterparty || r.partnerName || '' },
          { key: 'docType', header: 'Loại chứng từ', width: 140, value: (r) => label(r.docType) },
          { key: 'ghiChu', header: 'Ghi chú', width: 140, value: () => '' },
          { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 90, hidden: !multi },
          { key: 'counterAccounts', header: 'TK đối ứng', type: 'code', width: 90, hidden: true },
          { key: 'partnerCode', header: 'Mã đối tượng', type: 'code', width: 110, hidden: true },
          { key: 'invoiceNo', header: 'Số hóa đơn', type: 'code', width: 100, hidden: true },
        ]}
      />
    </>
  );
}
