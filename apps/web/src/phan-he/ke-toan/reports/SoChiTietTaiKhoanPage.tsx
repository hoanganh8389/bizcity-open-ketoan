// [2026-11-11 Nguyễn Văn Thủy] Sổ chi tiết các tài khoản (ACC12) và Sổ cái S03b-DN (ACC88): nhiều tài khoản một lần, nhóm "Tài khoản: …" (đóng góp)
/**
 * SỔ CHI TIẾT CÁC TÀI KHOẢN (ACC12).
 *   Tham số: kỳ; tài khoản (chọn nhiều); Cộng gộp các bút toán giống nhau; nhiều chi nhánh (lớp gắn thêm): chọn chi nhánh.
 *   Bảng: mỗi tài khoản một nhóm — Số dư đầu kỳ (nếu có), từng dòng phát sinh (Dư Nợ / Dư Có chạy), dòng Cộng; cuối bảng Tổng cộng.
 *   Cột: Ngày hạch toán · Ngày chứng từ · Số chứng từ · Diễn giải · TK đối ứng · Phát sinh Nợ · Phát sinh Có · Dư Nợ · Dư Có.
 *   Số liệu: /reports/account-ledger từng tài khoản (kind detail).
 * SỔ CÁI S03b-DN (ACC88, soCai): cùng khung; cột Ngày ghi sổ · Chứng từ (Số hiệu, Ngày tháng) · Diễn giải · TK đối ứng ·
 *   Số tiền (Nợ, Có); mỗi tài khoản: Số dư đầu kỳ, phát sinh, Cộng số phát sinh, Số dư cuối kỳ (kind ledger).
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { date, defaultTo, kyText, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange, useBranches } from '@/components/filters';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { AccountPicker } from '@/components/pickers';
import { DataGrid, type Column } from '@/components/DataGrid';
import { BOOK_SIGNS, LedgerForm, mb, screenTemplate, PrintButton, type PrintTemplate } from '@/components/print';
import { EntryOpen } from '../../../features/ledger/EntriesPage';

interface Line { entryId: string; postingDate: string; docDate: string; docNo: string; description: string; counterAccounts: string; branchCode: string; debit: number; credit: number; balanceDebit: number; balanceCredit: number }
interface Data { account: { code: string; name: string }; opening: { debit: number; credit: number }; closing: { debit: number; credit: number }; totals: { debit: number; credit: number }; rows: Line[] }

/** Một dòng bảng: tiêu đề tài khoản, số dư đầu, phát sinh, cộng tài khoản, tổng cộng. */
interface Row {
  key: string; acc: string; kind: 'group' | 'open' | 'data' | 'sub' | 'total'; label?: string; entryId?: string;
  postingDate?: string; docDate?: string; docNo?: string; description?: string; counter?: string; branchCode?: string;
  debit: number; credit: number; dn: number; dc: number;
}

function buildRows(list: Data[], soCai = false): Row[] {
  const out: Row[] = [];
  let td = 0; let tc = 0;
  for (const d of list) {
    const a = d.account.code;
    out.push({ key: `g${a}`, acc: a, kind: 'group', label: `Tài khoản: ${a} - ${d.account.name}`, debit: 0, credit: 0, dn: 0, dc: 0 });
    if (soCai) {
      out.push({ key: `o${a}`, acc: a, kind: 'open', description: 'Số dư đầu kỳ', debit: d.opening.debit, credit: d.opening.credit, dn: 0, dc: 0 });
      d.rows.forEach((r, i) => out.push({ key: `d${a}-${i}`, acc: a, kind: 'data', entryId: r.entryId, postingDate: r.postingDate, docDate: r.docDate || r.postingDate, docNo: r.docNo, description: r.description, counter: r.counterAccounts, branchCode: r.branchCode, debit: r.debit, credit: r.credit, dn: 0, dc: 0 }));
      out.push({ key: `s${a}`, acc: a, kind: 'sub', description: 'Cộng số phát sinh', debit: d.totals.debit, credit: d.totals.credit, dn: 0, dc: 0 });
      out.push({ key: `c${a}`, acc: a, kind: 'sub', description: 'Số dư cuối kỳ', debit: d.closing.debit, credit: d.closing.credit, dn: 0, dc: 0 });
      continue;
    }
    if (d.opening.debit || d.opening.credit) out.push({ key: `o${a}`, acc: a, kind: 'open', description: 'Số dư đầu kỳ', debit: 0, credit: 0, dn: d.opening.debit, dc: d.opening.credit });
    d.rows.forEach((r, i) => out.push({ key: `d${a}-${i}`, acc: a, kind: 'data', entryId: r.entryId, postingDate: r.postingDate, docDate: r.docDate || r.postingDate, docNo: r.docNo, description: r.description, counter: r.counterAccounts, branchCode: r.branchCode, debit: r.debit, credit: r.credit, dn: r.balanceDebit, dc: r.balanceCredit }));
    out.push({ key: `s${a}`, acc: a, kind: 'sub', description: 'Cộng', debit: d.totals.debit, credit: d.totals.credit, dn: d.closing.debit, dc: d.closing.credit });
    td += d.totals.debit; tc += d.totals.credit;
  }
  if (list.length > 1 && !soCai) out.push({ key: 'tong', acc: '', kind: 'total', description: 'Tổng cộng', debit: td, credit: tc, dn: 0, dc: 0 });
  return out;
}

interface Sheet { from: string; to: string; rows: Row[] }
const TEMPLATES: PrintTemplate<Sheet>[] = [
  {
    id: 'sctk', name: 'Sổ chi tiết các tài khoản', paper: 'A4L',
    render: (s, ctx) => {
      const strong = (r: Row, v: string) => (r.kind === 'data' ? v : <b>{v}</b>);
      return (
        <LedgerForm ctx={ctx} d={{
          title: 'SỔ CHI TIẾT CÁC TÀI KHOẢN', from: s.from, to: s.to, total: false, signs: [{ title: 'Người lập biểu' }, ...BOOK_SIGNS.slice(1)],
          rows: s.rows.filter((r) => r.kind !== 'group' && r.kind !== 'total'),
          groupBy: { key: (r) => r.acc, label: (k) => <b>{s.rows.find((x) => x.kind === 'group' && x.acc === k)?.label}</b> },
          after: s.rows.filter((r) => r.kind === 'total').map((r) => ({ label: 'Tổng cộng', cells: { n: mb(r.debit), c: mb(r.credit) } })),
          cols: [
            { key: 'nht', h: 'Ngày hạch toán', w: 64, center: true, v: (r) => date(r.postingDate) },
            { key: 'nct', h: 'Ngày chứng từ', w: 64, center: true, v: (r) => date(r.docDate) },
            { key: 'so', h: 'Số chứng từ', w: 84, v: (r) => r.docNo ?? '' },
            { key: 'dg', h: 'Diễn giải', v: (r) => strong(r, r.description ?? '') },
            { key: 'du', h: 'TK đối ứng', w: 62, v: (r) => r.counter ?? '' },
            { key: 'n', h: 'Phát sinh Nợ', w: 92, num: true, v: (r) => strong(r, mb(r.debit)) },
            { key: 'c', h: 'Phát sinh Có', w: 92, num: true, v: (r) => strong(r, mb(r.credit)) },
            { key: 'dn', h: 'Dư Nợ', w: 92, num: true, v: (r) => (r.kind === 'total' ? '' : strong(r, mb(r.dn))) },
            { key: 'dc', h: 'Dư Có', w: 92, num: true, v: (r) => (r.kind === 'total' ? '' : strong(r, mb(r.dc))) },
          ],
        }} />
      );
    },
  },
  screenTemplate<Sheet>(),
];

const SO_CAI_TEMPLATES: PrintTemplate<Sheet>[] = [
  {
    id: 's03b', name: 'Sổ cái S03b-DN', paper: 'A4L',
    render: (s, ctx) => {
      const strong = (r: Row, v: string) => (r.kind === 'data' ? v : <b>{v}</b>);
      return (
        <LedgerForm ctx={ctx} d={{
          title: 'SỔ CÁI', form: 'Mẫu số: S03b-DN', from: s.from, to: s.to, total: false, bookNote: true, signs: [{ title: 'Người lập biểu' }, ...BOOK_SIGNS.slice(1)],
          rows: s.rows.filter((r) => r.kind !== 'group'),
          groupBy: { key: (r) => r.acc, label: (k) => <b>{s.rows.find((x) => x.kind === 'group' && x.acc === k)?.label}</b> },
          cols: [
            { key: 'ngs', h: 'Ngày, tháng ghi sổ', w: 64, center: true, v: (r) => date(r.postingDate) },
            { key: 'so', h: 'Số hiệu', group: 'Chứng từ', w: 84, v: (r) => r.docNo ?? '' },
            { key: 'nct', h: 'Ngày tháng', group: 'Chứng từ', w: 64, center: true, v: (r) => date(r.docDate) },
            { key: 'dg', h: 'Diễn giải', v: (r) => strong(r, r.description ?? '') },
            { key: 'du', h: 'Số hiệu TK đối ứng', w: 66, center: true, v: (r) => r.counter ?? '' },
            { key: 'n', h: 'Nợ', group: 'Số tiền', w: 100, num: true, v: (r) => strong(r, mb(r.debit)) },
            { key: 'c', h: 'Có', group: 'Số tiền', w: 100, num: true, v: (r) => strong(r, mb(r.credit)) },
          ],
        }} />
      );
    },
  },
  screenTemplate<Sheet>(),
];

export function SoChiTietTaiKhoanPage({ soCai = false }: { soCai?: boolean } = {}) {
  const [params] = useSearchParams();
  const multi = (useBranches().data?.length ?? 0) > 1;
  const [f, setF] = useState({ from: params.get('from') ?? periodFrom(), to: params.get('to') ?? defaultTo(), accounts: params.get('account') ?? '111', branchCodes: '', gop: false });
  const [entryId, setEntryId] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const accounts = [...new Set(f.accounts.split(',').map((s) => s.trim()).filter(Boolean))];
  const qs = useQueries({ queries: accounts.map((account) => ({
    queryKey: ['account-ledger', soCai ? 'so-cai' : 'sctk', account, f.from, f.to, f.branchCodes, f.gop],
    queryFn: () => api.get<Data>('/api/v1/reports/account-ledger', { account, from: f.from, to: f.to, branchCodes: f.branchCodes, kind: soCai ? 'ledger' : 'detail', groupMode: f.gop ? '2' : '1' }),
  })) });
  const loading = qs.some((q) => q.isLoading);
  const error = qs.find((q) => q.error)?.error;
  const rows = loading ? [] : buildRows(qs.map((q) => q.data).filter((d): d is Data => Boolean(d)), soCai);
  const title = soCai ? 'Sổ cái' : 'Sổ chi tiết các tài khoản';
  const code = soCai ? 'ACC88' : 'ACC12';
  const money = (r: Row, v: number) => (r.kind === 'group' ? null : v);
  const columns: Column<Row>[] = soCai ? [
    { key: 'postingDate', header: 'Ngày, tháng ghi sổ', type: 'date', width: 110, noSort: true },
    { key: 'docNo', header: 'Số hiệu', band: 'Chứng từ', type: 'code', width: 130, noSort: true },
    { key: 'docDate', header: 'Ngày tháng', band: 'Chứng từ', type: 'date', width: 104, noSort: true },
    { key: 'description', header: 'Diễn giải', width: 320, noSort: true },
    { key: 'counter', header: 'Số hiệu TK đối ứng', type: 'code', width: 110, noSort: true },
    { key: 'debit', header: 'Nợ', band: 'Số tiền', type: 'money', width: 140, noSort: true, value: (r) => money(r, r.debit) },
    { key: 'credit', header: 'Có', band: 'Số tiền', type: 'money', width: 140, noSort: true, value: (r) => money(r, r.credit) },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 90, hidden: !multi, noSort: true },
  ] : [
    { key: 'postingDate', header: 'Ngày hạch toán', type: 'date', width: 104, noSort: true },
    { key: 'docDate', header: 'Ngày chứng từ', type: 'date', width: 104, noSort: true },
    { key: 'docNo', header: 'Số chứng từ', type: 'code', width: 130, noSort: true },
    { key: 'description', header: 'Diễn giải', width: 300, noSort: true },
    { key: 'counter', header: 'TK đối ứng', type: 'code', width: 90, noSort: true },
    { key: 'debit', header: 'Phát sinh Nợ', type: 'money', width: 130, noSort: true, value: (r) => money(r, r.debit) },
    { key: 'credit', header: 'Phát sinh Có', type: 'money', width: 130, noSort: true, value: (r) => money(r, r.credit) },
    { key: 'dn', header: 'Dư Nợ', type: 'money', width: 130, noSort: true, value: (r) => (r.kind === 'total' ? null : money(r, r.dn)) },
    { key: 'dc', header: 'Dư Có', type: 'money', width: 130, noSort: true, value: (r) => (r.kind === 'total' ? null : money(r, r.dc)) },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 90, hidden: !multi, noSort: true },
  ];
  return (
    <>
      <PageHeader title={title} code={code} subtitle={soCai ? 'Mẫu S03b-DN (hình thức Nhật ký chung): số dư đầu kỳ, phát sinh, số dư cuối kỳ từng tài khoản' : 'Phát sinh và số dư của từng tài khoản trong kỳ; chọn được nhiều tài khoản'} helpKey={soCai ? 'so-cai' : 'so-chi-tiet'} />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen={code} templates={soCai ? SO_CAI_TEMPLATES : TEMPLATES} disabled={!rows.length} getDocs={() => [{ from: f.from, to: f.to, rows }]} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <div className="field"><label>Tài khoản (chọn nhiều)</label><AccountPicker multiple className="input w-lg mono" value={f.accounts} onChange={(accounts) => set({ accounts })} /></div>
            <label className="checkbox"><input type="checkbox" checked={f.gop} onChange={(e) => set({ gop: e.target.checked })} /> Cộng gộp các bút toán giống nhau</label>
            {multi && <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />}
          </>
        }
      >
        <div className="card">
          <div className="rp-tieu-de"><h2>{title.toUpperCase()}</h2><i>{kyText(f.from, f.to)}</i></div>
          <ErrorBox error={error ? errorText(error) : null} />
          {!accounts.length ? <Empty text="Chọn tài khoản để xem" /> : loading ? <Loading /> : !rows.length ? <Empty /> : (
            <DataGrid storageKey={soCai ? 'acc88-v3' : 'acc12-v3'} rows={rows} rowKey={(r) => r.key} columns={columns}
              rowKind={(r) => (r.kind === 'group' ? 'group' : r.kind === 'sub' || r.kind === 'total' ? 'subtotal' : 'data')}
              groupLabel={(r) => <b>{r.label}</b>}
              onRowClick={(r) => r.entryId && setEntryId(r.entryId)}
              exportName={soCai ? 'so-cai' : 'so-chi-tiet-cac-tai-khoan'} exportTitle={`${title} — ${kyText(f.from, f.to)}`} />
          )}
        </div>
      </FilterLayout>
      {entryId && <EntryOpen id={entryId} onClose={() => setEntryId(null)} />}
    </>
  );
}
