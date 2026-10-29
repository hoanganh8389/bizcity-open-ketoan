/**
 * Các sổ nhật ký và bảng kê đọc thẳng sổ cái:
 *   CashJournalPage     Sổ nhật ký thu tiền (ACC72) / chi tiền (ACC73), mẫu S03a1
 *   SalesJournalPage    Sổ nhật ký bán hàng (ACC84)
 *   PurchaseJournalPage Sổ nhật ký mua hàng (ACC77)
 *   VoucherListingPage  Bảng kê chi tiết chứng từ (ACC60)
 *   CashFlowPage        Báo cáo lưu chuyển tiền tệ (ACC13)
 */
import { Fragment, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DOC_TYPE_LABELS, DOC_TYPE_LIST, type DocType } from '@ketoan/contracts';
import { api, errorText, ALL_ROWS } from '@/lib/api';
import { date, defaultFrom, defaultTo, firstDayOfMonth, periodFrom, today } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading, Money } from '@/components/ui';
import { EntryOpen } from '../../../features/ledger/EntriesPage';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker, PartnerPicker, ItemPicker } from '@/components/pickers';
import { PrintButton } from '@/components/print';
import { CASH_FLOW_TEMPLATES, CASH_JOURNAL_TEMPLATES, LISTING_TEMPLATES, PURCHASE_JOURNAL_TEMPLATES, SALES_JOURNAL_TEMPLATES } from './mauIn/nhatKyBangKe';

const TYPES: DocType[] = DOC_TYPE_LIST;
const typeLabel = (t: string) => DOC_TYPE_LABELS[t as DocType] ?? t;

/* ------------------------------------------------------------- ACC72 / ACC73 */
interface CashJournalRow { entryId: string; postingDate: string; docNo: string; description: string; partnerCode: string | null; partnerName: string | null; branchCode: string; amount: number; cells: number[]; other: number; otherAccount: string }
interface CashJournalData { direction: 'in' | 'out'; columns: string[]; rows: CashJournalRow[]; totals: { amount: number; cells: number[]; other: number }; truncated: boolean }
const DEFAULT_COLUMNS = { in: '511,3331,131,112,1388', out: '331,1331,642,641,112' };

export function CashJournalPage({ direction }: { direction: 'in' | 'out' }) {
  const thu = direction === 'in';
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '', account: '111', direction, columns: DEFAULT_COLUMNS[direction] });
  const [draft, setDraft] = useState({ account: f.account, columns: f.columns });
  const [entryId, setEntryId] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['cash-journal', f], queryFn: () => api.get<CashJournalData>('/api/v1/reports/cash-journal', f) });
  const d = q.data;
  const apply = () => set({ account: draft.account.trim() || '111', columns: draft.columns.replace(/\s/g, '') });
  return (
    <>
      <PageHeader
        title={thu ? 'Sổ nhật ký thu tiền' : 'Sổ nhật ký chi tiền'}
        code={thu ? 'ACC72' : 'ACC73'}
        subtitle={thu ? 'Các khoản thu tiền trong kỳ, chia cột theo tài khoản ghi Có (mẫu S03a1)' : 'Các khoản chi tiền trong kỳ, chia cột theo tài khoản ghi Nợ (mẫu S03a2)'}
        helpKey="nhat-ky-thu-chi"
      />
      <FilterLayout
        print={<PrintButton screen={thu ? 'ACC72' : 'ACC73'} templates={CASH_JOURNAL_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, direction: d.direction, columns: d.columns, rows: d.rows }] : [])} />}
        filters={
          <>
            <form className="rp-form" onSubmit={(e) => { e.preventDefault(); apply(); }}>
              <div className="field"><label>Tài khoản tiền</label><AccountPicker className="input w-md" value={draft.account} onChange={(v) => { setDraft({ ...draft, account: v }); set({ account: v || '111' }); }} /></div>
              <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
              <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
              <div className="field"><label>Cột tài khoản đối ứng (tối đa 5, cách nhau dấu phẩy)</label><AccountPicker multiple className="input w-lg mono" value={draft.columns} onChange={(v) => { setDraft({ ...draft, columns: v }); set({ columns: v }); }} /></div>
            </form>
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text={thu ? 'Không có khoản thu nào trong khoảng này' : 'Không có khoản chi nào trong khoảng này'} /> : (
            <DataGrid
              storageKey={thu ? 'acc72' : 'acc73'}
              rows={d.rows}
              rowKey={(r, i) => `${r.entryId}-${i}`}
              onRowClick={(r) => setEntryId(r.entryId)}
              note={d.truncated ? 'chỉ hiện 20.000 dòng đầu' : undefined}
              columns={[
                { key: 'postingDate', header: 'Ngày', type: 'date' },
                { key: 'docNo', header: 'Số chứng từ', type: 'code' },
                { key: 'description', header: 'Diễn giải' },
                { key: 'partner', header: 'Đối tượng', value: (r) => [r.partnerCode, r.partnerName].filter(Boolean).join(' ') },
                { key: 'branchCode', header: 'Chi nhánh', type: 'code', hidden: true },
                { key: 'amount', header: `${thu ? 'Ghi Nợ TK' : 'Ghi Có TK'} ${f.account}`, type: 'money', sum: true },
                ...d.columns.map((c, k): Column<CashJournalRow> => ({ key: `c${k}`, header: c, band: thu ? 'Ghi Có các tài khoản' : 'Ghi Nợ các tài khoản', type: 'money', sum: true, value: (r) => r.cells[k] })),
                { key: 'other', header: 'Số tiền TK khác', band: thu ? 'Ghi Có các tài khoản' : 'Ghi Nợ các tài khoản', type: 'money', sum: true },
                { key: 'otherAccount', header: 'Số hiệu TK khác', band: thu ? 'Ghi Có các tài khoản' : 'Ghi Nợ các tài khoản', type: 'code' },
              ]}
            />
          )}
        </div>
      </FilterLayout>
      {entryId && <EntryOpen id={entryId} onClose={() => setEntryId(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ ACC84 */
interface SalesCols { goods: number; finished: number; service: number; other: number; total: number }
interface SalesJournalRow extends SalesCols {
  entryId: string; postingDate: string; docDate: string; createdDate: string; invoiceDate: string | null; docNo: string; invoiceNo: string | null;
  description: string; partnerCode: string | null; partnerName: string | null; account: string; contraAccount: string; otherAccount: string; reasonCode: string;
}
interface SalesJournalData { branches: { branchCode: string; rows: SalesJournalRow[]; totals: SalesCols }[]; totals: SalesCols; documents: number }

function SalesCells({ v, bold }: { v: SalesCols; bold?: boolean }) {
  return <><td className="num"><Money value={v.total} bold={bold} /></td><td className="num"><Money value={v.goods} bold={bold} /></td><td className="num"><Money value={v.finished} bold={bold} /></td><td className="num"><Money value={v.service} bold={bold} /></td><td className="num"><Money value={v.other} bold={bold} /></td></>;
}

export function SalesJournalPage() {
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '', partnerCode: '', account: '', productSkus: '' });
  const [partner, setPartner] = useState('');
  const [entryId, setEntryId] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['sales-journal', f], queryFn: () => api.get<SalesJournalData>('/api/v1/reports/sales-journal', f) });
  const d = q.data;
  return (
    <>
      <PageHeader title="Sổ nhật ký bán hàng" code="ACC84" subtitle="Doanh thu bán hàng theo từng hoá đơn, chia cột hàng hoá / thành phẩm / dịch vụ" helpKey="nhat-ky-ban-hang" />
      <FilterLayout
        print={<PrintButton screen="ACC84" templates={SALES_JOURNAL_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, branches: d.branches.length, rows: d.branches.flatMap((b) => b.rows.map((r) => ({ ...r, branchCode: b.branchCode }))) }] : [])} />}
        filters={
          <>
            <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ partnerCode: partner.trim() }); }}>
              <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
              <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
              <div className="field"><label>Tài khoản</label><AccountPicker className="input w-md" placeholder="TK doanh thu (5111…)" value={f.account} onChange={(account) => set({ account })} /></div>
              <div className="field"><label>Mặt hàng</label><ItemPicker className="input w-lg" placeholder="Tất cả" value={f.productSkus} onChange={(productSkus) => set({ productSkus })} /></div>
              <div className="field"><label>Khách hàng</label><PartnerPicker className="input w-lg" placeholder="Tất cả" value={partner} onChange={(v) => { setPartner(v); set({ partnerCode: v }); }} /></div>
            </form>
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.documents === 0 ? <Empty text="Không có hoá đơn bán hàng trong khoảng này" /> : (
            <DataGrid
              storageKey="acc84"
              rows={d.branches.flatMap((b) => [
                ...b.rows.map((r) => ({ ...r, branchCode: b.branchCode, kind: 'data' as const })),
                { ...b.totals, entryId: `sum-${b.branchCode}`, postingDate: '', docDate: '', createdDate: '', invoiceDate: null, docNo: '', invoiceNo: null, description: `Cộng chi nhánh ${b.branchCode}`, partnerCode: null, partnerName: null, account: '', contraAccount: '', otherAccount: '', reasonCode: '', branchCode: b.branchCode, kind: 'subtotal' as const },
              ])}
              rowKey={(r) => r.entryId}
              rowKind={(r) => r.kind}
              onRowClick={(r) => setEntryId(r.entryId)}
              // Cột như HTsoft (ACC84, mẫu S07-DN): ngày lập CT, số CT, ngày ghi sổ, ngày CT, ngày + số HĐ, diễn giải, khách, phải thu,
              // ghi Có TK doanh thu (hàng hoá / thành phẩm / dịch vụ), số tiền + số hiệu TK khác; cuối cùng như HTsoft: Tài khoản
              // (TK doanh thu), TK đối ứng (TK phải thu), Lý do.
              columns={[
                { key: 'createdDate', header: 'Ngày lập chứng từ', type: 'date', hidden: true },
                { key: 'postingDate', header: 'Ngày ghi sổ', type: 'date' },
                { key: 'docNo', header: 'Số hiệu', type: 'code', band: 'Chứng từ' },
                { key: 'docDate', header: 'Ngày, tháng', type: 'date', band: 'Chứng từ' },
                { key: 'invoiceNo', header: 'Số', type: 'code', band: 'Hoá đơn' },
                { key: 'invoiceDate', header: 'Ngày', type: 'date', band: 'Hoá đơn' },
                { key: 'description', header: 'Diễn giải', value: (r) => r.description },
                { key: 'partnerCode', header: 'Mã khách', type: 'code' },
                { key: 'partnerName', header: 'Tên khách', value: (r) => r.partnerName ?? '' },
                { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
                { key: 'total', header: 'Phải thu từ người mua (ghi Nợ)', type: 'money', sum: true },
                { key: 'goods', header: 'Hàng hoá', band: 'Ghi Có tài khoản doanh thu', type: 'money', sum: true },
                { key: 'finished', header: 'Thành phẩm', band: 'Ghi Có tài khoản doanh thu', type: 'money', sum: true },
                { key: 'service', header: 'Dịch vụ', band: 'Ghi Có tài khoản doanh thu', type: 'money', sum: true },
                { key: 'other', header: 'Số tiền', band: 'Tài khoản khác', type: 'money', sum: true },
                { key: 'otherAccount', header: 'Số hiệu', band: 'Tài khoản khác', type: 'code' },
                { key: 'account', header: 'Tài khoản', type: 'code' },
                { key: 'contraAccount', header: 'TK đối ứng', type: 'code' },
                { key: 'reasonCode', header: 'Lý do', type: 'code' },
              ]}
            />
          )}
        </div>
      </FilterLayout>
      {entryId && <EntryOpen id={entryId} onClose={() => setEntryId(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ ACC77 */
interface PurchaseCols { goods: number; materials: number; tools: number; other: number; total: number }
interface PurchaseJournalRow extends PurchaseCols { entryId: string; postingDate: string; docNo: string; invoiceNo: string | null; description: string; partnerCode: string | null; partnerName: string | null; creditAccount: string; otherAccount: string }
interface PurchaseJournalData { branches: { branchCode: string; rows: PurchaseJournalRow[]; totals: PurchaseCols }[]; totals: PurchaseCols; documents: number }

export function PurchaseJournalPage() {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '', partnerCode: '' });
  const [partner, setPartner] = useState('');
  const [entryId, setEntryId] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['purchase-journal', f], queryFn: () => api.get<PurchaseJournalData>('/api/v1/reports/purchase-journal', f) });
  const d = q.data;
  const band = 'Ghi Nợ các tài khoản';
  return (
    <>
      <PageHeader title="Sổ nhật ký mua hàng" code="ACC77" subtitle="Hàng hoá, nguyên liệu, công cụ mua theo từng phiếu nhập (mẫu S03a3)" helpKey="nhat-ky-mua-hang" />
      <FilterLayout
        print={<PrintButton screen="ACC77" templates={PURCHASE_JOURNAL_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, branches: d.branches.length, rows: d.branches.flatMap((b) => b.rows.map((r) => ({ ...r, branchCode: b.branchCode }))) }] : [])} />}
        filters={
          <>
            <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ partnerCode: partner.trim() }); }}>
              <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
              <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
              <div className="field"><label>Nhà cung cấp</label><PartnerPicker className="input w-lg" placeholder="Tất cả" value={partner} onChange={(v) => { setPartner(v); set({ partnerCode: v }); }} /></div>
            </form>
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.documents === 0 ? (
            // Trống thì nói rõ đang lọc gì và cho bỏ lọc một chạm — tránh tưởng phần mềm không có dữ liệu.
            <div className="empty">
              <div>Không có phiếu nhập mua đã ghi sổ từ <b>{date(f.from)}</b> đến <b>{date(f.to)}</b>{f.partnerCode ? <> của nhà cung cấp <b>{f.partnerCode}</b></> : null}{f.branchCodes ? ' ở các chi nhánh đã chọn' : ''}.</div>
              <div className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>Phiếu nháp / chờ duyệt chưa vào sổ nên chưa hiện ở đây.</div>
              <div className="row" style={{ gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                {f.from > firstDayOfMonth() && <button type="button" className="btn btn-sm btn-primary" onClick={() => set({ from: firstDayOfMonth(), to: today() })}>Xem cả tháng này</button>}
                {f.partnerCode && <button type="button" className="btn btn-sm" onClick={() => { setPartner(''); set({ partnerCode: '' }); }}>Bỏ lọc nhà cung cấp</button>}
                {f.branchCodes && <button type="button" className="btn btn-sm" onClick={() => set({ branchCodes: '' })}>Mọi chi nhánh</button>}
              </div>
            </div>
          ) : (
            <DataGrid
              storageKey="acc77"
              rows={d.branches.flatMap((b) => [
                ...b.rows.map((r) => ({ ...r, branchCode: b.branchCode, kind: 'data' as const })),
                { ...b.totals, entryId: `sum-${b.branchCode}`, postingDate: '', docNo: '', invoiceNo: null, description: `Cộng chi nhánh ${b.branchCode}`, partnerCode: null, partnerName: null, creditAccount: '', otherAccount: '', branchCode: b.branchCode, kind: 'subtotal' as const },
              ])}
              rowKey={(r) => r.entryId}
              rowKind={(r) => r.kind}
              onRowClick={(r) => {
                if (r.kind !== 'data') return;
                setEntryId(r.entryId);
              }}
              columns={[
                { key: 'postingDate', header: 'Ngày ghi sổ', type: 'date' },
                { key: 'docNo', header: 'Số chứng từ', type: 'code' },
                { key: 'invoiceNo', header: 'Số HĐ', type: 'code' },
                { key: 'supplier', header: 'Nhà cung cấp / diễn giải', value: (r) => (r.kind === 'subtotal' ? r.description : r.partnerName || r.description) },
                { key: 'partnerCode', header: 'Mã NCC', type: 'code' },
                { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
                { key: 'goods', header: 'Hàng hoá', band, type: 'money', sum: true },
                { key: 'materials', header: 'Nguyên liệu, vật liệu', band, type: 'money', sum: true },
                { key: 'tools', header: 'Công cụ, dụng cụ', band, type: 'money', sum: true },
                { key: 'other', header: 'Số tiền TK khác', band, type: 'money', sum: true },
                { key: 'otherAccount', header: 'Số hiệu TK khác', band, type: 'code' },
                { key: 'total', header: 'Phải trả người bán (ghi Có)', type: 'money', sum: true },
              ]}
            />
          )}
        </div>
      </FilterLayout>
      {entryId && <EntryOpen id={entryId} onClose={() => setEntryId(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ ACC60 */
interface ListingRow { entryId: string; postingDate: string; docNo: string; docType: string; invoiceNo: string | null; description: string; debitAccount: string; creditAccount: string; amount: number; debitPartner: string; creditPartner: string; costItem: string; department: string; contract: string; branchCode: string; reasonCode: string }

export function VoucherListingPage() {
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '', account: '', docType: '', page: 1 });
  const [account, setAccount] = useState('');
  const [entryId, setEntryId] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p, page: p.page ?? 1 }));
  const q = useQuery({ queryKey: ['voucher-listing', f], queryFn: () => api.getPage<{ rows: ListingRow[]; total: number; amount: number }>('/api/v1/reports/voucher-listing', { ...f, pageSize: ALL_ROWS }), placeholderData: keepPreviousData });
  const d = q.data?.data;
  return (
    <>
      <PageHeader title="Bảng kê chi tiết chứng từ" code="ACC60" subtitle="Mỗi cặp Nợ / Có một dòng: tài khoản, số tiền, đối tượng từng bên, khoản mục, bộ phận" helpKey="bang-ke-chung-tu" />
      <FilterLayout
        print={<PrintButton screen="ACC60" templates={LISTING_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />}
        filters={
          <>
            <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ account: account.trim() }); }}>
              <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
              <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
              <div className="field"><label>Tài khoản (Nợ hoặc Có)</label><AccountPicker className="input w-md" value={account} onChange={(v) => { setAccount(v); set({ account: v }); }} placeholder="Tất cả" /></div>
              <div className="field">
                <label>Loại chứng từ</label>
                <select className="select input w-md" value={f.docType} onChange={(e) => set({ docType: e.target.value })}>
                  <option value="">Tất cả</option>
                  {TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
                </select>
              </div>
            </form>
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có chứng từ nào trong khoảng này" /> : (
            <>
              <DataGrid
                storageKey="acc60"
                rows={d.rows}
                rowKey={(r, i) => `${r.entryId}-${i}`}
                onRowClick={(r) => setEntryId(r.entryId)}
                note={`Tổng cả kỳ: ${d.total.toLocaleString('vi-VN')} dòng`}
                columns={[
                  { key: 'postingDate', header: 'Ngày', type: 'date' },
                  { key: 'docNo', header: 'Số chứng từ', type: 'code' },
                  { key: 'docType', header: 'Loại', value: (r) => typeLabel(r.docType) },
                  { key: 'description', header: 'Diễn giải' },
                  { key: 'debitAccount', header: 'TK Nợ', type: 'code' },
                  { key: 'creditAccount', header: 'TK Có', type: 'code' },
                  { key: 'amount', header: 'Số tiền', type: 'money', sum: true, showZero: true },
                  { key: 'debitPartner', header: 'Đối tượng Nợ', type: 'code' },
                  { key: 'creditPartner', header: 'Đối tượng Có', type: 'code' },
                  { key: 'costItem', header: 'Khoản mục', type: 'code' },
                  { key: 'department', header: 'Bộ phận', type: 'code' },
                  { key: 'contract', header: 'Hợp đồng', type: 'code', hidden: true },
                  { key: 'reasonCode', header: 'Lý do', type: 'code', hidden: true },
                  { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
                ]}
              />
            </>
          )}
        </div>
      </FilterLayout>
      {entryId && <EntryOpen id={entryId} onClose={() => setEntryId(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ ACC13 */
interface CashFlowData { rows: { code: string; name: string; bold: boolean; value: number | null }[]; check: { closing: number; actualClosing: number; difference: number }; guessedAmount: number }

export function CashFlowPage() {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['cash-flow', f], queryFn: () => api.get<CashFlowData>('/api/v1/reports/cash-flow', f) });
  const d = q.data;
  return (
    <>
      <PageHeader title="Báo cáo lưu chuyển tiền tệ" code="ACC13" subtitle="Mẫu B03-DN, phương pháp trực tiếp — tiền và tương đương tiền (TK 111, 112, 113)" helpKey="luu-chuyen-tien-te" />
      <FilterLayout
        print={<PrintButton screen="ACC13" templates={CASH_FLOW_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d ? <Empty /> : (
            <>
              {d.check.difference !== 0 && <div className="alert alert-bad" style={{ margin: 12 }}>Tiền cuối kỳ theo báo cáo lệch <Money value={d.check.difference} blankZero={false} /> so với số dư tài khoản tiền (<Money value={d.check.actualClosing} blankZero={false} />). Kiểm tra các dòng tiền chưa gán đúng chỉ tiêu.</div>}
              {d.guessedAmount !== 0 && <div className="alert alert-info" style={{ margin: 12 }}>Có <Money value={d.guessedAmount} blankZero={false} /> dòng tiền chưa gán mã chỉ tiêu (trên phiếu hoặc trên lý do); phần mềm tự xếp theo tài khoản đối ứng.</div>}
              <DataGrid
                storageKey="acc13"
                rows={d.rows}
                rowKey={(r, i) => `${r.code}-${i}`}
                footerLabel={false}
                rowClassName={(r) => (r.bold ? 'bold' : '')}
                columns={[
                  { key: 'name', header: 'Chỉ tiêu', noSort: true, render: (r) => <span style={{ paddingLeft: r.bold ? 0 : 16 }}>{r.name}</span> },
                  { key: 'code', header: 'Mã số', type: 'code', noSort: true },
                  { key: 'value', header: 'Kỳ này', type: 'money', noSort: true, render: (r) => (r.value === null ? '' : <Money value={r.value} bold={r.bold} />) },
                ]}
              />
            </>
          )}
        </div>
      </FilterLayout>
    </>
  );
}
