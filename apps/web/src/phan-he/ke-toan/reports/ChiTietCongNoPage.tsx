// [2026-11-11 Nguyễn Văn Thủy] Chi tiết công nợ theo đối tượng (mẫu quản trị): nhóm từng đối tượng, số dư chạy, Cộng nhóm, Tổng cộng (đóng góp)
/**
 * CHI TIẾT CÔNG NỢ — một màn cho nhiều cửa vào (preset): ACC40 theo đối tượng (chọn tài khoản), ACC40A phải thu khách hàng (131),
 *   ACC81 phải trả nhà cung cấp (331), ACC62 nội bộ (1368).
 * Tham số: kỳ, tài khoản, đối tượng (trống = mọi đối tượng có số dư hoặc phát sinh); nhiều chi nhánh (lớp gắn thêm): chọn chi nhánh.
 * Bảng: mỗi đối tượng một nhóm "Tên …: X" — Số dư đầu kỳ, từng dòng phát sinh (số dư chạy bù trừ một bên), Cộng nhóm; cuối Tổng cộng.
 * Cột: Ngày hạch toán · Ngày chứng từ · Số chứng từ · Diễn giải · TK công nợ · TK đối ứng · Phát sinh (Nợ, Có) · Số dư (Nợ, Có).
 * Số liệu: /reports/partner-balances (số dư đầu kỳ từng đối tượng) + /reports/account-ledger (kind partner, các dòng có đối tượng).
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { date, defaultTo, kyText, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange, useBranches } from '@/components/filters';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { AccountPicker, PartnerPicker } from '@/components/pickers';
import { DataGrid, type Column } from '@/components/DataGrid';
import { LedgerForm, mb, screenTemplate, PrintButton, type PrintTemplate } from '@/components/print';
import { EntryOpen } from '../../../features/ledger/EntriesPage';
import { REPORT_SIGNS } from './mauIn/congNoChung';
import { usePartnerFamilies } from '../../../features/catalog/nhomChaCon';

interface Line { unit?: string; entryId: string; postingDate: string; docDate: string; docNo: string; description: string; accountCode: string; counterAccounts: string; partnerCode: string | null; partnerName: string | null; branchCode: string; debit: number; credit: number }
interface Balance { partnerCode: string; partnerName: string; openingDebit: number; openingCredit: number }

/** Một dòng bảng: tiêu đề đối tượng, số dư đầu kỳ, phát sinh, cộng nhóm, tổng cộng. */
interface Row {
  key: string; p: string; kind: 'group' | 'open' | 'data' | 'sub' | 'total'; label?: string; entryId?: string;
  postingDate?: string; docDate?: string; docNo?: string; description?: string; acc?: string; counter?: string; branchCode?: string;
  /** Đơn vị của dòng khi xem theo nhóm mẹ – chi nhánh (mã đối tượng trên chứng từ). */ unit?: string;
  debit: number; credit: number; dn: number; dc: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Số dư bù trừ một bên. */
const side = (net: number) => ({ dn: net > 0 ? r2(net) : 0, dc: net < 0 ? r2(-net) : 0 });

function buildRows(balances: Balance[], lines: (Line & { unit?: string })[], who: string, groupNote?: (p: string) => string): Row[] {
  const byP = new Map<string, Line[]>();
  for (const l of lines) if (l.partnerCode) byP.set(l.partnerCode, [...(byP.get(l.partnerCode) ?? []), l]);
  const names = new Map(balances.map((b) => [b.partnerCode, b.partnerName]));
  const codes = [...new Set([...balances.filter((b) => b.partnerCode).map((b) => b.partnerCode), ...byP.keys()])].sort();
  const out: Row[] = [];
  let td = 0; let tc = 0; let tNet = 0;
  for (const p of codes) {
    const b = balances.find((x) => x.partnerCode === p);
    const ls = byP.get(p) ?? [];
    let net = (b?.openingDebit ?? 0) - (b?.openingCredit ?? 0);
    if (!net && !ls.length) continue;
    const name = names.get(p) || ls[0]?.partnerName || p;
    out.push({ key: `g${p}`, p, kind: 'group', label: `Tên ${who}: ${name}${groupNote?.(p) ?? ''}`, debit: 0, credit: 0, dn: 0, dc: 0 });
    out.push({ key: `o${p}`, p, kind: 'open', description: 'Số dư đầu kỳ', debit: 0, credit: 0, ...side(net) });
    let d = 0; let c = 0;
    ls.forEach((l, i) => {
      net += l.debit - l.credit; d += l.debit; c += l.credit;
      out.push({ key: `d${p}-${i}`, p, kind: 'data', unit: l.unit, entryId: l.entryId, postingDate: l.postingDate, docDate: l.docDate || l.postingDate, docNo: l.docNo, description: l.description, acc: l.accountCode, counter: l.counterAccounts, branchCode: l.branchCode, debit: l.debit, credit: l.credit, ...side(net) });
    });
    out.push({ key: `s${p}`, p, kind: 'sub', description: `Cộng nhóm: ${name}`, debit: r2(d), credit: r2(c), ...side(net) });
    td += d; tc += c; tNet += net;
  }
  if (out.length) out.push({ key: 'tong', p: '', kind: 'total', description: 'Tổng cộng', debit: r2(td), credit: r2(tc), ...side(tNet) });
  return out;
}

interface Sheet { title: string; account: string; from: string; to: string; rows: Row[] }
export const CHI_TIET_CONG_NO_TEMPLATES: PrintTemplate<Sheet>[] = [
  {
    id: 'ctcn', name: 'Chi tiết công nợ', paper: 'A4L',
    render: (s, ctx) => {
      const strong = (r: Row, v: string) => (r.kind === 'data' ? v : <b>{v}</b>);
      return (
        <LedgerForm ctx={ctx} d={{
          title: s.title.toUpperCase(), from: s.from, to: s.to, info: [['Tài khoản', s.account]], total: false, signs: REPORT_SIGNS,
          rows: s.rows.filter((r) => r.kind !== 'group' && r.kind !== 'total'),
          groupBy: { key: (r) => r.p, label: (k) => <b>{s.rows.find((x) => x.kind === 'group' && x.p === k)?.label}</b> },
          after: s.rows.filter((r) => r.kind === 'total').map((r) => ({ label: 'Tổng cộng', cells: { n: mb(r.debit), c: mb(r.credit), dn: mb(r.dn), dc: mb(r.dc) } })),
          cols: [
            { key: 'nht', h: 'Ngày hạch toán', w: 62, center: true, v: (r) => date(r.postingDate) },
            { key: 'nct', h: 'Ngày chứng từ', w: 62, center: true, v: (r) => date(r.docDate) },
            { key: 'so', h: 'Số chứng từ', w: 80, v: (r) => r.docNo ?? '' },
            { key: 'dg', h: 'Diễn giải', v: (r) => strong(r, r.description ?? '') },
            { key: 'tk', h: 'TK công nợ', w: 50, center: true, v: (r) => r.acc ?? '' },
            { key: 'du', h: 'TK đối ứng', w: 54, center: true, v: (r) => r.counter ?? '' },
            { key: 'n', h: 'Nợ', group: 'Phát sinh', w: 88, num: true, v: (r) => (r.kind === 'open' ? '' : strong(r, mb(r.debit))) },
            { key: 'c', h: 'Có', group: 'Phát sinh', w: 88, num: true, v: (r) => (r.kind === 'open' ? '' : strong(r, mb(r.credit))) },
            { key: 'dn', h: 'Nợ', group: 'Số dư', w: 88, num: true, v: (r) => strong(r, mb(r.dn)) },
            { key: 'dc', h: 'Có', group: 'Số dư', w: 88, num: true, v: (r) => strong(r, mb(r.dc)) },
          ],
        }} />
      );
    },
  },
  screenTemplate<Sheet>(),
];

export interface ChiTietCongNoPreset { account: string; title: string; code: string; who: string }

export function ChiTietCongNoPage({ preset }: { preset: ChiTietCongNoPreset }) {
  const [params] = useSearchParams();
  const multi = (useBranches().data?.length ?? 0) > 1;
  const [f, setF] = useState({
    from: params.get('from') ?? periodFrom(), to: params.get('to') ?? defaultTo(), account: params.get('account') ?? preset.account,
    partnerCode: params.get('partnerCode') ?? '', branchCodes: params.get('branchCodes') ?? '', gop: params.get('gop') === '1',
  });
  const [entryId, setEntryId] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const base = { account: f.account, from: f.from, to: f.to, branchCodes: f.branchCodes };
  const bal = useQuery({ queryKey: ['partner-balances', 'ctcn', base], queryFn: () => api.get<{ rows: Balance[] }>('/api/v1/reports/partner-balances', base), enabled: Boolean(f.account) });
  // [2026-11-13 Nguyễn Văn Thủy] xem theo nhóm mẹ – chi nhánh: mỗi nhóm một khối, số dư cả nhóm, cột Đơn vị cho từng dòng (đóng góp)
  const fam = usePartnerFamilies();
  const gop = f.gop && fam.count > 0;
  const members = f.partnerCode ? (gop ? fam.familyOf(f.partnerCode) : [f.partnerCode]) : null;
  const led = useQuery({ queryKey: ['account-ledger', 'ctcn', base, members?.length === 1 ? f.partnerCode : ''], queryFn: () => api.get<{ rows: Line[]; truncated: boolean }>('/api/v1/reports/account-ledger', { ...base, kind: 'partner', partnerCode: members?.length === 1 ? f.partnerCode : '' }), enabled: Boolean(f.account) });
  const loading = bal.isLoading || led.isLoading;
  const rootOf = (c: string) => (gop ? fam.info(c)?.rootCode ?? c : c);
  const rawBal = (bal.data?.rows ?? []).filter((b) => !members || members.includes(b.partnerCode));
  const rawLines = (led.data?.rows ?? []).filter((l) => !members || (l.partnerCode && members.includes(l.partnerCode)));
  const balances = gop ? [...rawBal.reduce((m, b) => { const k = rootOf(b.partnerCode); const x = m.get(k) ?? { partnerCode: k, partnerName: fam.info(k)?.name ?? b.partnerName, openingDebit: 0, openingCredit: 0 }; x.openingDebit += b.openingDebit; x.openingCredit += b.openingCredit; m.set(k, x); return m; }, new Map<string, Balance>()).values()] : rawBal;
  const lines = gop ? rawLines.map((l) => ({ ...l, unit: l.partnerCode ?? '', partnerCode: l.partnerCode ? rootOf(l.partnerCode) : null, partnerName: l.partnerCode && fam.info(l.partnerCode) ? fam.info(l.partnerCode)!.rootName : l.partnerName })) : rawLines;
  const note = (p: string) => { const n = gop && fam.info(p) ? fam.familyOf(p).length : 0; return n > 1 ? ` — cả nhóm: đơn vị mẹ và ${n - 1} chi nhánh` : ''; };
  const rows = loading ? [] : buildRows(balances, lines, preset.who, note);
  const money = (r: Row, v: number) => (r.kind === 'group' ? null : v);
  const columns: Column<Row>[] = [
    { key: 'postingDate', header: 'Ngày hạch toán', type: 'date', width: 104, noSort: true },
    { key: 'docDate', header: 'Ngày chứng từ', type: 'date', width: 104, noSort: true },
    { key: 'docNo', header: 'Số chứng từ', type: 'code', width: 130, noSort: true },
    { key: 'unit', header: 'Đơn vị', type: 'code', width: 130, hidden: !gop, noSort: true, title: 'Đơn vị (đơn vị mẹ hoặc chi nhánh) ghi trên chứng từ' },
    { key: 'description', header: 'Diễn giải', width: 300, noSort: true },
    { key: 'acc', header: 'TK công nợ', type: 'code', width: 90, noSort: true },
    { key: 'counter', header: 'TK đối ứng', type: 'code', width: 90, noSort: true },
    { key: 'debit', header: 'Nợ', band: 'Phát sinh', type: 'money', width: 130, noSort: true, value: (r) => (r.kind === 'open' ? null : money(r, r.debit)) },
    { key: 'credit', header: 'Có', band: 'Phát sinh', type: 'money', width: 130, noSort: true, value: (r) => (r.kind === 'open' ? null : money(r, r.credit)) },
    { key: 'dn', header: 'Nợ', band: 'Số dư', type: 'money', width: 130, noSort: true, value: (r) => money(r, r.dn) },
    { key: 'dc', header: 'Có', band: 'Số dư', type: 'money', width: 130, noSort: true, value: (r) => money(r, r.dc) },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 90, hidden: !multi, noSort: true },
  ];
  const err = bal.error ?? led.error;
  return (
    <>
      <PageHeader title={preset.title} code={preset.code} subtitle={`Phát sinh và số dư công nợ của từng ${preset.who} trong kỳ`} helpKey="so-chi-tiet-cong-no" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen={preset.code} templates={CHI_TIET_CONG_NO_TEMPLATES} disabled={!rows.length} getDocs={() => [{ title: preset.title, account: f.account, from: f.from, to: f.to, rows }]} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <div className="field"><label>Tài khoản</label><AccountPicker className="input w-md" value={f.account} onChange={(account) => set({ account })} placeholder={preset.account} /></div>
            <div className="field"><label>{preset.who[0]!.toUpperCase() + preset.who.slice(1)}</label><PartnerPicker value={f.partnerCode} onChange={(partnerCode) => set({ partnerCode })} placeholder="Tất cả" /></div>
            {multi && <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />}
            {fam.count > 0 && <label className="checkbox" title="Mỗi nhóm mẹ – chi nhánh là một khối: số dư đầu kỳ cả nhóm, từng dòng có cột Đơn vị, cuối khối Cộng nhóm. Chọn đơn vị mẹ ở ô trên thì lấy luôn các chi nhánh."><input type="checkbox" checked={f.gop} onChange={(e) => set({ gop: e.target.checked })} /> Xem theo nhóm mẹ – chi nhánh ({fam.count} nhóm)</label>}
          </>
        }
      >
        <div className="card">
          <div className="rp-tieu-de"><h2>{preset.title.toUpperCase()}</h2><i>Tài khoản: {f.account}; {kyText(f.from, f.to)}</i></div>
          <ErrorBox error={err ? errorText(err) : null} />
          {loading ? <Loading /> : !rows.length ? <Empty text="Không có công nợ trong kỳ này" /> : (
            <DataGrid storageKey={`${preset.code.toLowerCase()}-ctcn-v1`} rows={rows} rowKey={(r) => r.key} columns={columns}
              note={led.data?.truncated ? 'chỉ hiện 20.000 dòng đầu, hãy thu hẹp khoảng ngày' : undefined}
              rowKind={(r) => (r.kind === 'group' ? 'group' : r.kind === 'sub' || r.kind === 'total' ? 'subtotal' : 'data')}
              groupLabel={(r) => <b>{r.label}</b>}
              onRowClick={(r) => r.entryId && setEntryId(r.entryId)}
              exportName={preset.title} exportTitle={`${preset.title} — ${kyText(f.from, f.to)}`} />
          )}
        </div>
      </FilterLayout>
      {entryId && <EntryOpen id={entryId} onClose={() => setEntryId(null)} />}
    </>
  );
}
