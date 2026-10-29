/**
 * Báo cáo phân tích và kiểm soát:
 *   ExpensePage   Chi phí theo khoản mục, bộ phận, hợp đồng   (ACC44)
 *   ContractProfitPage  Lãi lỗ theo hợp đồng                  (ACC70 tổng hợp, ACC71 chi tiết)
 *   ChecksPage    Kiểm tra chứng từ, hoá đơn                  (ACC93)
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ANALYSIS_DIMS, CONTRACT_TYPES, DOC_TYPE_LABELS, type AnalysisDimField, type DocType } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { date, defaultFrom, defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading, Money } from '@/components/ui';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker } from '@/components/pickers';
import { PrintButton } from '@/components/print';
import { CHECKS_TEMPLATES, EXPENSE_TEMPLATES, contractProfitTemplates } from './mauIn/kiemSoat';

/* ------------------------------------------------------------------ ACC44 */
type ExpenseCol = AnalysisDimField | 'account';
type ExpenseRow = { amount: number; accountCode?: string; accountName?: string } & Record<string, string | number | undefined>;
const GROUPINGS: { key: string; label: string; cols: ExpenseCol[] }[] = [
  { key: 'costItem', label: 'Theo khoản mục', cols: ['costItem'] },
  { key: 'department', label: 'Theo bộ phận', cols: ['department'] },
  { key: 'costItem,department', label: 'Khoản mục × bộ phận', cols: ['costItem', 'department'] },
  { key: 'account,costItem', label: 'Tài khoản × khoản mục', cols: ['account', 'costItem'] },
  { key: 'contract', label: 'Theo hợp đồng', cols: ['contract'] },
  { key: 'employee', label: 'Theo nhân viên', cols: ['employee'] },
  { key: 'case', label: 'Theo vụ việc', cols: ['case'] },
  { key: 'project', label: 'Theo dự án', cols: ['project'] },
  { key: 'capitalSource', label: 'Theo nguồn vốn', cols: ['capitalSource'] },
];
const NONE = <span className="muted">(chưa phân loại)</span>;

export function ExpensePage() {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '', account: '64', groupBy: 'costItem' });
  const [account, setAccount] = useState(f.account);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['expense-by-dimension', f], queryFn: () => api.get<{ rows: ExpenseRow[]; total: number }>('/api/v1/reports/expense-by-dimension', f), enabled: Boolean(f.account) });
  const d = q.data;
  const g = GROUPINGS.find((x) => x.key === f.groupBy)!;
  const codeOf = (r: ExpenseRow, c: ExpenseCol) => String((c === 'account' ? r.accountCode : r[c]) ?? '');
  const nameOf = (r: ExpenseRow, c: ExpenseCol) => String((c === 'account' ? r.accountName : r[`${c}Name`]) ?? '');
  const cell = (r: ExpenseRow, c: ExpenseCol): ReactNode => {
    const code = codeOf(r, c);
    return code ? <><span className="mono">{code}</span> {nameOf(r, c)}</> : NONE;
  };
  const HEAD: Record<ExpenseCol, string> = { ...Object.fromEntries(ANALYSIS_DIMS.map((x) => [x.field, x.label])), account: 'Tài khoản' } as Record<ExpenseCol, string>;
  return (
    <>
      <PageHeader title="Chi phí theo khoản mục và bộ phận" code="ACC44" subtitle="Phát sinh chi phí gom theo khoản mục, bộ phận, hợp đồng, nhân viên, vụ việc, dự án, nguồn vốn ghi trên từng dòng phiếu" helpKey="chi-phi-khoan-muc" />
      <FilterLayout
        print={<PrintButton screen="ACC44" templates={EXPENSE_TEMPLATES} disabled={!d}
          getDocs={() => (d ? [{ ...f, groupLabel: g.label, dims: g.cols.map((c) => ({ key: c, head: HEAD[c] })), rows: d.rows, total: d.total }] : [])} />}
        filters={
          <>
            <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ account: account.trim() }); }}>
              <div className="field"><label>Tài khoản chi phí</label><AccountPicker className="input w-md" value={account} onChange={(v) => { setAccount(v); set({ account: v }); }} placeholder="64" /></div>
              <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
              <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            </form>
          </>
        }
      >
        <div className="card">
          <div className="tabs" role="tablist">
            {GROUPINGS.map((x) => <button key={x.key} role="tab" className={`tab ${f.groupBy === x.key ? 'active' : ''}`} onClick={() => set({ groupBy: x.key })}>{x.label}</button>)}
          </div>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có phát sinh chi phí trong khoảng này" /> : (
            <DataGrid
              storageKey={`acc44-${f.groupBy}`}
              rows={d.rows}
              rowKey={(r, i) => `${g.cols.map((c) => codeOf(r, c)).join('|')}|${i}`}
              columns={[
                ...g.cols.map((c): Column<ExpenseRow> => ({ key: c, header: HEAD[c], value: (r) => (codeOf(r, c) ? `${codeOf(r, c)} ${nameOf(r, c)}`.trim() : '(chưa phân loại)'), render: (r) => cell(r, c) })),
                { key: 'amount', header: 'Số tiền', type: 'money', sum: true, showZero: true },
                { key: 'share', header: 'Tỷ trọng', type: 'number', noFilter: true, value: (r) => (d.total ? Math.round((r.amount / d.total) * 1000) / 10 : 0), render: (r) => <span className="muted">{d.total ? `${((r.amount / d.total) * 100).toFixed(1)}%` : ''}</span> },
              ]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ ACC70, ACC71 */
interface ContractProfitRow { contractCode: string; contractName: string; contractType: string; partnerCode: string; partnerName: string; contractValue: number; accountCode: string; accountName: string; revenue: number; cost: number; profit: number }
const CONTRACT_TYPE_NAME: Record<string, string> = Object.fromEntries(CONTRACT_TYPES);

/** Lãi lỗ theo hợp đồng: doanh thu, thu nhập trừ giá vốn, chi phí của các dòng sổ có gắn hợp đồng. */
export function ContractProfitPage({ detail }: { detail: boolean }) {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '' });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['profit-by-contract', detail, f], queryFn: () => api.get<{ rows: ContractProfitRow[] }>('/api/v1/reports/profit-by-contract', { ...f, detail }) });
  const rows = q.data?.rows ?? [];
  return (
    <>
      <PageHeader title={detail ? 'Chi tiết lãi lỗ theo hợp đồng' : 'Tổng hợp lãi lỗ theo hợp đồng'} code={detail ? 'ACC71' : 'ACC70'} subtitle="Doanh thu, thu nhập trừ giá vốn, chi phí của các dòng phiếu có chọn hợp đồng; không tính bút toán kết chuyển" helpKey="hop-dong" />
      <FilterLayout
        print={<PrintButton screen={detail ? 'ACC71' : 'ACC70'} templates={contractProfitTemplates(detail)} disabled={!q.data} getDocs={() => (q.data ? [{ ...f, detail, typeName: CONTRACT_TYPE_NAME, rows }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : rows.length === 0 ? <Empty text="Không có doanh thu, chi phí nào gắn hợp đồng trong khoảng này" /> : (
            <DataGrid
              storageKey={detail ? 'acc71' : 'acc70'}
              rows={rows}
              rowKey={(r) => `${r.contractCode}|${r.accountCode}`}
              columns={[
                { key: 'contractCode', header: 'Mã hợp đồng', type: 'code' },
                { key: 'contractName', header: 'Tên hợp đồng' },
                { key: 'contractType', header: 'Loại', value: (r) => CONTRACT_TYPE_NAME[r.contractType] ?? '' },
                { key: 'partnerName', header: 'Khách hàng / NCC', value: (r) => (r.partnerCode ? `${r.partnerCode} ${r.partnerName}` : '') },
                ...(detail ? ([{ key: 'accountCode', header: 'Tài khoản', type: 'code' }, { key: 'accountName', header: 'Tên tài khoản' }] satisfies Column<ContractProfitRow>[]) : ([{ key: 'contractValue', header: 'Giá trị hợp đồng', type: 'money' }] satisfies Column<ContractProfitRow>[])),
                { key: 'revenue', header: 'Doanh thu, thu nhập', type: 'money', sum: true },
                { key: 'cost', header: 'Giá vốn, chi phí', type: 'money', sum: true },
                { key: 'profit', header: 'Lãi (+) / lỗ (−)', type: 'money', sum: true, showZero: true },
              ]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ ACC93 */
interface DocItem { id: string; docNo: string; docDate: string; docType: string; invoiceNo: string; total: number; branchCode: string; note: string }
interface Checks {
  errors: { count: number; rows: DocItem[] };
  noInvoice: { count: number; total: number; rows: DocItem[] };
  abnormalInvoices: { count: number; rows: { id: string; docNo: string; invoiceNo: string; invoiceSerial: string; invoiceDate: string; status: string; amount: number; branchCode: string }[] };
  duplicateInvoices: { count: number; rows: { invoiceSerial: string; invoiceNo: string; times: number; docs: string; branchCodes: string }[] };
  invoiceGaps: { count: number; rows: { invoiceSerial: string; firstNo: string; lastNo: string; issued: number; missing: number; sample: string }[] };
  orphanReturns: { count: number; rows: DocItem[] };
  entryMismatch: { count: number; rows: DocItem[] };
  balanceMismatch: { count: number; rows: { branchCode: string; accountCode: string; day: string; lineDebit: number; lineCredit: number; balanceDebit: number; balanceCredit: number }[] };
}
const INVOICE_STATUS: Record<string, string> = { replaced: 'Đã bị thay thế', adjusted: 'Đã điều chỉnh', cancelled: 'Đã huỷ' };

function Section({ title, count, ok, hint, children }: { title: string; count: number; ok: string; hint: string; children: ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-body row" style={{ paddingBottom: 8 }}>
        <b>{title}</b>
        <span className={`badge ${count ? 'badge-warn' : 'badge-ok'}`}>{count ? `${count.toLocaleString('vi-VN')} trường hợp` : ok}</span>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>{hint}</span>
      </div>
      {count > 0 && <div className="table-wrap" style={{ maxHeight: 300 }}>{children}</div>}
    </div>
  );
}

export function ChecksPage() {
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '' });
  const [docId, setDocId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['document-checks', f], queryFn: () => api.get<Checks>('/api/v1/reports/document-checks', f) });
  const d = q.data;
  const docTable = (rows: DocItem[], noteHead: string) => (
    <table className="grid">
      <thead><tr><th>Ngày</th><th>Số chứng từ</th><th>Loại</th><th>Chi nhánh</th><th className="num">Số tiền</th><th>{noteHead}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="clickable" onClick={() => setDocId(r.id)}>
            <td>{date(r.docDate)}</td><td className="mono">{r.docNo}</td><td>{DOC_TYPE_LABELS[r.docType as DocType] ?? r.docType}</td><td>{r.branchCode}</td>
            <td className="num"><Money value={r.total} blankZero={false} /></td><td>{r.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <>
      <PageHeader title="Kiểm tra chứng từ, hoá đơn" code="ACC93" subtitle="Các trường hợp dễ làm số liệu lệch khi đối chiếu với bên phát hành hoá đơn và hệ thống bán hàng" helpKey="kiem-tra-chung-tu" />
      <FilterLayout
        print={<PrintButton screen="ACC93" templates={CHECKS_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, checks: d }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => setF((x) => ({ ...x, from, to }))} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => setF((x) => ({ ...x, branchCodes }))} />
          </>
        }
      >
        <div className="card" style={{ marginBottom: 14 }}>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading && <Loading />}
        </div>
        {d && (
          <>
            <Section title="1. Chứng từ lỗi, chưa ghi sổ" count={d.errors.count} ok="Không có" hint="Chưa vào sổ nên thiếu trong mọi báo cáo. Mở chứng từ, sửa cấu hình rồi bấm Ghi sổ lại.">
              {docTable(d.errors.rows, 'Lý do lỗi')}
            </Section>
            <Section title="2. Số hoá đơn trùng" count={d.duplicateInvoices.count} ok="Không có" hint="Cùng ký hiệu và số hoá đơn nằm trên nhiều chứng từ bán: doanh thu, thuế bị kê hai lần.">
              <table className="grid">
                <thead><tr><th>Ký hiệu</th><th>Số hoá đơn</th><th className="num">Số lần</th><th>Các chứng từ</th><th>Chi nhánh</th></tr></thead>
                <tbody>{d.duplicateInvoices.rows.map((r) => <tr key={r.invoiceSerial + r.invoiceNo}><td className="mono">{r.invoiceSerial}</td><td className="mono">{r.invoiceNo}</td><td className="num">{r.times}</td><td className="mono">{r.docs}</td><td>{r.branchCodes}</td></tr>)}</tbody>
              </table>
            </Section>
            <Section title="3. Số hoá đơn nhảy cóc" count={d.invoiceGaps.count} ok="Liền số" hint="Trong dải số đã nhận của một ký hiệu còn thiếu số: hoá đơn chưa gửi sang, hoặc phát hành ở kỳ / chi nhánh khác.">
              <table className="grid">
                <thead><tr><th>Ký hiệu</th><th>Từ số</th><th>Đến số</th><th className="num">Đã nhận</th><th className="num">Thiếu</th><th>Các số thiếu</th></tr></thead>
                <tbody>{d.invoiceGaps.rows.map((r) => <tr key={r.invoiceSerial}><td className="mono">{r.invoiceSerial}</td><td className="mono">{r.firstNo}</td><td className="mono">{r.lastNo}</td><td className="num">{r.issued.toLocaleString('vi-VN')}</td><td className="num neg">{r.missing.toLocaleString('vi-VN')}</td><td className="mono">{r.sample}</td></tr>)}</tbody>
              </table>
            </Section>
            <Section title="4. Hoá đơn bị thay thế, điều chỉnh, huỷ" count={d.abnormalInvoices.count} ok="Không có" hint="Cần xem hoá đơn thay thế / điều chỉnh tương ứng đã về chưa.">
              <table className="grid">
                <thead><tr><th>Ngày hoá đơn</th><th>Ký hiệu</th><th>Số hoá đơn</th><th>Trạng thái</th><th>Chứng từ</th><th>Chi nhánh</th><th className="num">Số tiền</th></tr></thead>
                <tbody>{d.abnormalInvoices.rows.map((r) => <tr key={r.id} className="clickable" onClick={() => setDocId(r.id)}><td>{date(r.invoiceDate)}</td><td className="mono">{r.invoiceSerial}</td><td className="mono">{r.invoiceNo}</td><td>{INVOICE_STATUS[r.status] ?? r.status}</td><td className="mono">{r.docNo}</td><td>{r.branchCode}</td><td className="num"><Money value={r.amount} blankZero={false} /></td></tr>)}</tbody>
              </table>
            </Section>
            <Section title="5. Phiếu bán, trả lại không có hoá đơn" count={d.noInvoice.count} ok="Không có" hint={d.noInvoice.count ? `Tổng ${d.noInvoice.total.toLocaleString('vi-VN')} đ, không có trong sổ hoá đơn. Bình thường với phiếu nội bộ; bất thường nếu lẽ ra phải xuất hoá đơn.` : 'Mọi phiếu bán trong kỳ đều có hoá đơn.'}>
              {docTable(d.noInvoice.rows, 'Ghi chú')}
            </Section>
            <Section title="6. Phiếu trả lại không nối được phiếu gốc" count={d.orphanReturns.count} ok="Không có" hint="Phiếu trả hàng vẫn ghi sổ đủ, nhưng không tra ngược được phiếu bán / phiếu nhập gốc: bên gửi không gửi mã phiếu gốc, phiếu gốc chưa nhận, hoặc phiếu gốc đã huỷ.">
              {docTable(d.orphanReturns.rows, 'Ghi chú')}
            </Section>
            <Section title="7. Chứng từ lệch bút toán" count={d.entryMismatch.count} ok="Khớp" hint="Chứng từ đã ghi sổ mà không còn bút toán hiệu lực, hoặc đã huỷ mà còn bút toán hiệu lực. Bình thường không xảy ra; có thì báo người quản trị.">
              {docTable(d.entryMismatch.rows, 'Ghi chú')}
            </Section>
            <Section title="8. Sổ tổng hợp lệch sổ chi tiết" count={d.balanceMismatch.count} ok="Khớp" hint="Số phát sinh theo ngày (dùng cho bảng cân đối, tổng hợp công nợ) khác tổng các dòng bút toán. Bình thường không xảy ra; có thì báo người quản trị.">
              <table className="grid">
                <thead><tr><th>Ngày</th><th>Chi nhánh</th><th>Tài khoản</th><th className="num">Nợ (chi tiết)</th><th className="num">Nợ (tổng hợp)</th><th className="num">Có (chi tiết)</th><th className="num">Có (tổng hợp)</th></tr></thead>
                <tbody>{d.balanceMismatch.rows.map((r) => <tr key={`${r.branchCode}-${r.accountCode}-${r.day}`}><td>{date(r.day)}</td><td>{r.branchCode}</td><td className="mono">{r.accountCode}</td><td className="num"><Money value={r.lineDebit} blankZero={false} /></td><td className="num"><Money value={r.balanceDebit} blankZero={false} /></td><td className="num"><Money value={r.lineCredit} blankZero={false} /></td><td className="num"><Money value={r.balanceCredit} blankZero={false} /></td></tr>)}</tbody>
              </table>
            </Section>
          </>
        )}
        {docId && <DocumentDetail id={docId} onClose={() => setDocId(null)} />}
      </FilterLayout>
    </>
  );
}
