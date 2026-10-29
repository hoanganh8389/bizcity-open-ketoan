/**
 * Báo cáo thuế ra (ACC65) / thuế vào (ACC64): bảng kê hoá đơn theo nhóm thuế suất.
 * Nhóm thuế ra: 1. Không chịu thuế · 2. Thuế suất 0% · 3. Thuế suất 5% · 4. Thuế suất 10% (gồm cả dòng 8%).
 * Nguồn: sổ hoá đơn (chỉ chứng từ có hoá đơn, số tiền theo hoá đơn); hàng trả lại / điều chỉnh giảm ghi âm.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading, Money } from '@/components/ui';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import { DataGrid, type Column } from '@/components/DataGrid';
import { DOC_TYPE_LABELS, type DocType } from '@ketoan/contracts';
import { PrintButton } from '@/components/print';
import { taxInvoiceTemplates } from '../mauIn/bangKeThue';

interface Row { invoiceForm: string; invoiceSerial: string; invoiceNo: string; invoiceDate: string; docNo: string; docDate: string; docType: string; buyerName: string; buyerTaxCode: string; partnerCode: string; partnerName: string; branchCode: string; taxRate: number; amount: number; tax: number; sourceDocumentId: string }
type GridRow = Row & { kind: 'data' | 'group' | 'subtotal'; key: string; counted: boolean };
const EMPTY: Row = { invoiceForm: '', invoiceSerial: '', invoiceNo: '', invoiceDate: '', docNo: '', docDate: '', docType: '', buyerName: '', buyerTaxCode: '', partnerCode: '', partnerName: '', branchCode: '', taxRate: 0, amount: 0, tax: 0, sourceDocumentId: '' };
interface Data { groups: { group: string; label: string; rows: Row[]; amount: number; tax: number; counted: boolean }[]; totals: { amount: number; tax: number; invoices: number } }

/** `direction`: 'output' = bảng kê bán ra (mặc định), 'input' = bảng kê mua vào. */
export function SalesInvoicesPage({ direction = 'output' }: { direction?: 'output' | 'input' }) {
  const input = direction === 'input';
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '', direction });
  const [docId, setDocId] = useState<string | null>(null);
  const [group, setGroup] = useState('');
  const q = useQuery({ queryKey: ['sales-invoices', f], queryFn: () => api.get<Data>('/api/v1/reports/sales-invoices', f) });
  const raw = q.data;
  // Loại thuế: chỉ xem một nhóm thuế suất.
  const d = raw && { ...raw, groups: raw.groups.filter((g) => !group || g.group === group) };

  return (
    <>
      <PageHeader
        title={input ? 'Báo cáo thuế vào' : 'Báo cáo thuế ra'}
        code={input ? 'ACC64' : 'ACC65'}
        subtitle={input ? 'Bảng kê hoá đơn, chứng từ hàng hoá, dịch vụ mua vào theo thuế suất' : 'Bảng kê hoá đơn, chứng từ hàng hoá, dịch vụ bán ra theo thuế suất'}
        helpKey={input ? 'bang-ke-mua-vao' : 'bang-ke-ban-ra'}
      />
      <FilterLayout
        print={<PrintButton screen={input ? 'ACC64' : 'ACC65'} templates={taxInvoiceTemplates(direction)} disabled={!d} getDocs={() => (d ? [{ ...f, groups: d.groups }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => setF((x) => ({ ...x, from, to }))} />
            <div className="field">
              <label>Loại thuế</label>
              <select className="select input" value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">Tất cả</option>
                {(raw?.groups ?? []).filter((g) => g.label).map((g) => <option key={g.group} value={g.group}>{g.label}</option>)}
              </select>
            </div>
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => setF((x) => ({ ...x, branchCodes }))} />
          </>
        }
      >
        {d && (
          <div className="kpis">
            <div className="card kpi"><div className="label">Số hoá đơn</div><div className="value">{d.totals.invoices.toLocaleString('vi-VN')}</div></div>
            <div className="card kpi"><div className="label">{input ? 'Giá trị mua vào chưa thuế' : 'Doanh thu chưa thuế'}</div><div className="value"><Money value={d.totals.amount} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Thuế GTGT</div><div className="value"><Money value={d.totals.tax} blankZero={false} /></div></div>
          </div>
        )}
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.groups.length === 0 ? <Empty text="Không có hoá đơn trong khoảng này" /> : (
            <DataGrid
              storageKey={input ? 'acc64-v2' : 'acc65-v2'}
              rows={d.groups.flatMap((g): GridRow[] => [
                ...(g.label ? [{ ...EMPTY, kind: 'group' as const, key: `h-${g.group}`, buyerName: g.label, counted: g.counted }] : []),
                ...g.rows.map((r, i) => ({ ...r, kind: 'data' as const, key: `${g.group}-${r.invoiceNo}-${r.docNo}-${i}`, counted: g.counted })),
                ...(g.counted ? [{ ...EMPTY, kind: 'subtotal' as const, key: `t-${g.group}`, buyerName: 'Tổng:', amount: g.amount, tax: g.tax, counted: true }] : []),
              ])}
              rowKey={(r) => r.key}
              rowKind={(r) => r.kind}
              groupLabel={(r) => r.buyerName}
              onRowClick={(r) => r.sourceDocumentId && setDocId(r.sourceDocumentId)}
              columns={[
                { key: 'invoiceSerial', header: 'Ký hiệu', type: 'code' },
                { key: 'invoiceForm', header: 'Mẫu số' },
                { key: 'invoiceDate', header: 'Ngày HĐ', type: 'date' },
                { key: 'invoiceNo', header: 'Số hóa đơn', type: 'code' },
                { key: 'buyerName', header: 'Tên đối tượng' },
                { key: 'buyerTaxCode', header: 'Mã số thuế', type: 'code' },
                { key: 'amount', header: 'Doanh thu chưa thuế', type: 'money', showZero: true, footerValue: (rows) => rows.filter((r) => r.counted).reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100 },
                { key: 'taxRate', header: 'Tỷ lệ thuế', type: 'number', render: (r) => (r.kind === 'data' ? `${r.taxRate}%` : '') },
                { key: 'tax', header: 'Số tiền thuế', type: 'money', showZero: true, footerValue: (rows) => rows.filter((r) => r.counted).reduce((s, r) => s + Math.round(r.tax * 100), 0) / 100 },
                { key: 'branchCode', header: 'Mã CN', type: 'code' },
                { key: 'docDate', header: 'Ngày chứng từ', type: 'date' },
                { key: 'docNo', header: 'Số phiếu', type: 'code' },
                { key: 'docType', header: 'Loại phiếu', value: (r) => (r.docType ? DOC_TYPE_LABELS[r.docType as DocType] ?? r.docType : '') },
                { key: 'partnerCode', header: 'Mã đối tượng', type: 'code', hidden: true },
                { key: 'partnerName', header: 'Đối tượng', hidden: true },
              ] satisfies Column<GridRow>[]}
            />
          )}
        </div>
      </FilterLayout>
      {docId && <DocumentDetail id={docId} onClose={() => setDocId(null)} />}
    </>
  );
}
