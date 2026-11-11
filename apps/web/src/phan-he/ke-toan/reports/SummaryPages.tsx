/**
 * Ba báo cáo tổng hợp dạng bảng đơn giản:
 *   TaxSummaryPage      Bảng tổng hợp thuế GTGT theo chi nhánh, tháng      (ACC91)
 *   CashBalancesPage    Bảng kê số dư tiền theo ngày: chi nhánh → chỉ tiêu → tài khoản, mỗi ngày một cột (ACC80)
 *   PostingSummaryPage  Bảng tổng hợp chứng từ theo cặp tài khoản Nợ / Có   (ACC63)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { DOC_TYPE_LABELS, DOC_TYPE_LIST, type DocType } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { defaultFrom, defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange, useBranches } from '@/components/filters';
import { Empty, ErrorBox, Loading, Money } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker } from '@/components/pickers';
import { PrintButton } from '@/components/print';
import { CASH_BALANCE_TEMPLATES, POSTING_TEMPLATES, TAX_SUMMARY_TEMPLATES, type CashBalanceLine } from './mauIn/baoCaoTongHop';

/* ------------------------------------------------------------------ ACC91 */
interface TaxRow { branchCode: string; branchName: string; month: string; invoices: number; carried: number; inputTax: number; revenue: number; outputTax: number; payable: number }

export function TaxSummaryPage() {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '' });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['tax-summary', f], queryFn: () => api.get<{ rows: TaxRow[]; totals: Omit<TaxRow, 'branchCode' | 'branchName' | 'month'> }>('/api/v1/reports/tax-summary', f) });
  const d = q.data;
  return (
    <>
      <PageHeader title="Bảng tổng hợp thuế GTGT" code="ACC91" subtitle="Doanh thu, thuế ra, thuế vào, khấu trừ và thuế nộp cuối kỳ của từng chi nhánh, từng tháng" helpKey="tong-hop-thue" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen="ACC91" templates={TAX_SUMMARY_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
          </>
        }
      >
        {d && (
          <div className="kpis">
            <div className="card kpi"><div className="label">Thuế đầu ra</div><div className="value"><Money value={d.totals.outputTax} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Thuế đầu vào + khấu trừ kỳ trước</div><div className="value"><Money value={d.totals.inputTax + d.totals.carried} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">{d.totals.payable >= 0 ? 'Thuế phải nộp cuối kỳ' : 'Còn được khấu trừ chuyển kỳ sau'}</div><div className="value"><Money value={Math.abs(d.totals.payable)} blankZero={false} /></div></div>
          </div>
        )}
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có số liệu thuế trong khoảng này" /> : (
            <DataGrid
              storageKey="acc91-v2"
              rows={d.rows}
              rowKey={(r) => `${r.branchCode}-${r.month}`}
              columns={[
                { key: 'branchCode', header: 'Mã CN', type: 'code' },
                { key: 'month', header: 'Tháng' },
                { key: 'carried', header: 'Thuế GTGT còn được khấu trừ kỳ trước chuyển sang', type: 'money', sum: true },
                { key: 'revenue', header: 'Doanh thu bán ra trong kỳ', type: 'money', sum: true },
                { key: 'inputTax', header: 'Thuế GTGT mua vào được khấu trừ kỳ này', type: 'money', sum: true },
                { key: 'outputTax', header: 'Thuế GTGT HHDV bán ra trong kỳ', type: 'money', sum: true },
                { key: 'payable', header: 'Thuế GTGT phải nộp trong kỳ', type: 'money', sum: true, bold: true },
                { key: 'branchName', header: 'Tên CN' },
                { key: 'invoices', header: 'Số hoá đơn', type: 'number', sum: true, hidden: true },
              ] satisfies Column<TaxRow>[]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ ACC80 */
interface CashRow { branchCode: string; branchName: string; accountCode: string; accountName: string; opening: number; debit: number; credit: number; closing: number }
/** Chỉ tiêu cấp 1 của bảng kê theo đầu tài khoản tiền. */
const CHI_TIEU: [string, string][] = [['111', 'Tiền mặt'], ['112', 'Tiền gửi ngân hàng'], ['113', 'Tiền đang chuyển']];
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const dmy = (d: string) => d.split('-').reverse().join('/');

/** Dựng dòng bảng kê: mỗi chi nhánh một nhóm → chỉ tiêu → tài khoản; cộng nhóm; tổng cộng khi nhiều chi nhánh. */
function buildCashLines(perDay: CashRow[][], multi: boolean): CashBalanceLine[] {
  const n = perDay.length;
  const val = new Map<string, number[]>();
  const meta = new Map<string, CashRow>();
  perDay.forEach((rows, i) => rows.forEach((r) => {
    const k = `${r.branchCode}|${r.accountCode}`;
    meta.set(k, r);
    if (!val.has(k)) val.set(k, Array<number>(n).fill(0));
    val.get(k)![i] = r.closing;
  }));
  const sum = (ks: string[]) => Array.from({ length: n }, (_, i) => ks.reduce((a, k) => a + (val.get(k)?.[i] ?? 0), 0));
  const branches = [...new Set([...meta.values()].map((r) => r.branchCode))].sort();
  const out: CashBalanceLine[] = [];
  const all: string[] = [];
  for (const b of branches) {
    const keys = [...meta.keys()].filter((k) => k.startsWith(`${b}|`)).sort();
    const name = meta.get(keys[0]!)!.branchName;
    out.push({ key: `g${b}`, label: `Chi nhánh hạch toán: ${multi ? `${b} - ` : ''}${name}`, level: 0, kind: 'group', values: [] });
    for (const [pre, label] of CHI_TIEU) {
      const ks = keys.filter((k) => meta.get(k)!.accountCode.startsWith(pre));
      if (!ks.length) continue;
      out.push({ key: `h${b}${pre}`, label, level: 0, kind: 'head', values: sum(ks) });
      for (const k of ks) out.push({ key: `d${k}`, label: `${meta.get(k)!.accountCode} - ${meta.get(k)!.accountName}`, level: 1, kind: 'data', values: val.get(k)! });
    }
    out.push({ key: `s${b}`, label: `Cộng nhóm: ${name}`, level: 0, kind: 'subtotal', values: sum(keys) });
    all.push(...keys);
  }
  if (branches.length > 1) out.push({ key: 'tong', label: 'Tổng cộng', level: 0, kind: 'total', values: sum(all) });
  return out;
}

/**
 * Bảng kê số dư tiền theo ngày (ACC80): tham số Đến ngày, So sánh với N ngày trước (mỗi ngày một cột).
 * Dòng: chi nhánh hạch toán → Tiền mặt / Tiền gửi ngân hàng / Tiền đang chuyển → từng tài khoản; Cộng nhóm.
 * Nhiều chi nhánh (lớp gắn thêm): chọn chi nhánh, thêm dòng Tổng cộng.
 */
export function CashBalancesPage() {
  const navigate = useNavigate();
  const { data: branchList = [] } = useBranches();
  const multi = branchList.length > 1;
  const [f, setF] = useState({ to: defaultTo(), compare: false, days: 1, branchCodes: '' });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const days = f.compare ? Array.from({ length: f.days + 1 }, (_, i) => addDays(f.to, i - f.days)) : [f.to];
  const qs = useQueries({ queries: days.map((d) => ({
    queryKey: ['cash-balances', d, f.branchCodes],
    queryFn: () => api.get<{ rows: CashRow[] }>('/api/v1/reports/cash-balances', { from: d, to: d, branchCodes: f.branchCodes, accounts: '111,112,113' }),
  })) });
  const loading = qs.some((q) => q.isLoading);
  const error = qs.find((q) => q.error)?.error;
  const lines = loading || error ? [] : buildCashLines(qs.map((q) => q.data?.rows ?? []), multi);
  const branchText = f.branchCodes ? f.branchCodes.split(',').map((c) => branchList.find((b) => b.code === c)?.name ?? c).join(', ') : '';
  const columns: Column<CashBalanceLine>[] = [
    { key: 'label', header: 'Chỉ tiêu', width: 420, noFilter: true, noSort: true,
      render: (r) => <span style={{ paddingLeft: r.level * 18, fontWeight: r.kind === 'data' ? undefined : 700 }}>{r.label}</span> },
    ...days.map((d, i): Column<CashBalanceLine> => ({ key: `d${i}`, header: `Ngày ${dmy(d)}`, type: 'money', width: 150, showZero: true, noFilter: true, noSort: true,
      value: (r) => (r.kind === 'group' ? null : r.values[i] ?? 0), bold: (r) => r.kind !== 'data' })),
  ];
  return (
    <>
      <PageHeader title="Bảng kê số dư tiền theo ngày" code="ACC80" subtitle="Số dư tiền mặt, tiền gửi từng tài khoản tại cuối ngày, so sánh được với các ngày trước" helpKey="so-du-tien" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen="ACC80" templates={CASH_BALANCE_TEMPLATES} disabled={!lines.length} getDocs={() => [{ to: f.to, days, branchText, lines }]} />}
        filters={
          <>
            <div className="field"><label>Đến ngày</label><input type="date" className="input" value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
            <label className="checkbox"><input type="checkbox" checked={f.compare} onChange={(e) => set({ compare: e.target.checked })} /> So sánh với ngày trước</label>
            <div className="field"><label>Số ngày trước</label>
              <select className="select input" value={f.days} disabled={!f.compare} onChange={(e) => set({ days: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7].map((k) => <option key={k} value={k}>{k} ngày trước</option>)}
              </select>
            </div>
            {multi && <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />}
          </>
        }
      >
        <div className="card">
          <div className="rp-tieu-de">
            <h2>BẢNG KÊ SỐ DƯ TIỀN THEO NGÀY</h2>
            <i>{branchText ? `Chi nhánh: ${branchText}; ` : ''}Loại tiền: VND; Đến ngày {dmy(f.to)}</i>
          </div>
          <ErrorBox error={error ? errorText(error) : null} />
          {loading ? <Loading /> : !lines.length ? <Empty text="Không có số dư tiền đến ngày này" /> : (
            <DataGrid storageKey="acc80-v2" rows={lines} rowKey={(r) => r.key} columns={columns}
              rowKind={(r) => (r.kind === 'group' ? 'group' : r.kind === 'subtotal' || r.kind === 'total' ? 'subtotal' : 'data')}
              groupLabel={(r) => <b>{r.label}</b>}
              onRowClick={(r) => { if (r.kind === 'data') navigate(`/bao-cao/so-chi-tiet?${new URLSearchParams({ account: r.label.split(' - ')[0]!, from: `${f.to.slice(0, 8)}01`, to: f.to }).toString()}`); }}
              exportName="bang-ke-so-du-tien-theo-ngay" exportTitle={`Bảng kê số dư tiền theo ngày — đến ngày ${dmy(f.to)}`} />
          )}
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ ACC63 */
interface PostingRow { branchCode: string; month: string; docType: string; costItem: string; reasonCode: string; debitAccount: string; creditAccount: string; amount: number; entries: number }
const TYPES: DocType[] = DOC_TYPE_LIST.filter((t) => t !== 'opening');
const POSTING_GROUPS = [['branch', 'Chi nhánh'], ['month', 'Tháng'], ['docType', 'Loại chứng từ'], ['costItem', 'Khoản mục'], ['reason', 'Lý do']] as const;

export function PostingSummaryPage() {
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '', docType: '', groups: 'branch,month,costItem,reason' });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['posting-summary', f], queryFn: () => api.get<{ rows: PostingRow[]; total: number }>('/api/v1/reports/posting-summary', f) });
  const d = q.data;
  const on = (g: string) => f.groups.split(',').includes(g);
  const toggle = (g: string) => set({ groups: POSTING_GROUPS.map(([k]) => k).filter((k) => (k === g ? !on(k) : on(k))).join(',') });
  const lead = POSTING_GROUPS.filter(([k]) => on(k) && k !== 'costItem' && k !== 'reason');
  const tail = POSTING_GROUPS.filter(([k]) => on(k) && (k === 'costItem' || k === 'reason'));
  const cell = (r: PostingRow, k: string) => (k === 'branch' ? r.branchCode : k === 'month' ? r.month.replace(/^(\d{4})(\d{2})$/, '$2/$1') : k === 'docType' ? DOC_TYPE_LABELS[r.docType as DocType] ?? r.docType : k === 'costItem' ? r.costItem : r.reasonCode);
  return (
    <>
      <PageHeader title="Bảng tổng hợp chứng từ" code="ACC63" subtitle="Tổng số tiền theo từng cặp tài khoản Nợ / Có, theo chi nhánh, tháng, khoản mục, lý do" helpKey="tong-hop-chung-tu" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen="ACC63" templates={POSTING_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <div className="field">
              <label>Loại chứng từ</label>
              <select className="select input w-md" value={f.docType} onChange={(e) => set({ docType: e.target.value })}>
                <option value="">Tất cả</option>
                {TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tách theo</label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 6 }}>
                {POSTING_GROUPS.map(([k, l]) => <label key={k} className="checkbox"><input type="checkbox" checked={on(k)} onChange={() => toggle(k)} /> {l}</label>)}
              </div>
            </div>
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có bút toán nào trong khoảng này" /> : (
            <DataGrid
              storageKey="acc63"
              rows={d.rows}
              rowKey={(r) => [r.branchCode, r.month, r.docType, r.debitAccount, r.creditAccount, r.costItem, r.reasonCode].join('|')}
              columns={[
                ...lead.map(([k, l]): Column<PostingRow> => ({ key: k, header: l, value: (r) => cell(r, k) as string, type: k === 'docType' ? 'text' : 'code' })),
                { key: 'debitAccount', header: 'TK Nợ', type: 'code' },
                { key: 'creditAccount', header: 'TK Có', type: 'code' },
                ...tail.map(([k, l]): Column<PostingRow> => ({ key: k, header: l, value: (r) => cell(r, k) as string, type: 'code' })),
                { key: 'amount', header: 'Số tiền', type: 'money', sum: true, showZero: true },
                { key: 'entries', header: 'Số bút toán', type: 'number', sum: true },
              ]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}
