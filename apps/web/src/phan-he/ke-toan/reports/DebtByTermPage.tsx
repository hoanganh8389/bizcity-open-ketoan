/**
 * Sổ công nợ theo hạn thanh toán (ACC39), theo từng đối tượng:
 *   dòng đối tượng (in đậm): tên, Dư đầu kỳ, Ps Nợ, Ps Có, Dư cuối kỳ;
 *   dòng chứng từ: Ngày CT, Số CT, Ngày phải TT, Hạn thanh toán, Diễn giải, Ps Nợ, Ps Có, nhân viên;
 *   dòng thanh toán (dưới chứng từ): Số, Ngày, Giá trị của phiếu đã trừ vào chứng từ đó.
 * Bấm dòng chứng từ → phiếu nhập từ trang quản trị mở modal phiếu bên đó (xem, sửa, duyệt); chứng từ khác mở form
 * xem phiếu của kế toán. Bấm dòng thanh toán → mở phiếu chi / thu đó.
 * Ô lọc: Từ ngày, Đến ngày, Số tài khoản, Nhóm KH, Khách hàng / Nhà cung cấp, Chi nhánh.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { date, defaultFrom, defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker, ListPicker, PartnerPicker } from '@/components/pickers';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import { findDocByNo } from '@/lib/sourceDoc';
import { PrintButton } from '@/components/print';
import { DEBT_TERM_TEMPLATES, type DebtTermSheet } from './mauIn/congNoTheoHan';

interface Row {
  kind: 'partner' | 'doc' | 'pay'; partnerCode: string; partnerName: string; docDate: string; docNo: string; description: string; termDays: number | null; dueDate: string;
  opening: number; debit: number; credit: number; closing: number; payNo: string; payDate: string; payAmount: number; employeeCode: string; employeeName: string; branchCode: string;
}
interface Data { side: 'debit' | 'credit'; rows: Row[]; totals: { opening: number; debit: number; credit: number; closing: number; payAmount: number } }

export function DebtByTermPage() {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), account: '131', groupCode: '', partnerCode: '', branchCodes: '' });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const groups = useQuery({ queryKey: ['partner-groups'], queryFn: () => api.get<{ code: string; name: string }[]>('/api/v1/partner-groups'), staleTime: 60_000 }).data ?? [];
  const q = useQuery({ queryKey: ['debt-by-term', f], queryFn: () => api.get<Data>('/api/v1/reports/debt-by-term', { ...f, account: f.account || '131' }) });
  const d = q.data;
  const isP = (r: Row) => r.kind === 'partner';
  // Sổ chỉ có số chứng từ → tra mã chứng từ theo số (đúng chi nhánh nếu trùng số) rồi mở form xem phiếu.
  const [docId, setDocId] = useState<string | null>(null);
  const [finding, setFinding] = useState('');
  const openByNo = async (no: string, branchCode: string) => {
    if (!no) return;
    setFinding(no);
    try {
      const hit = await findDocByNo(no, branchCode);
      if (hit) setDocId(hit.id); // form chứng từ có nút mở phiếu gốc ở trang quản trị
    } finally { setFinding(''); }
  };
  const amt = (v: number) => (v ? v.toLocaleString('vi-VN') : '');
  const columns: Column<Row>[] = [
    { key: 'docDate', header: 'Ngày CT', value: (r) => (r.docDate ? date(r.docDate) : '') },
    { key: 'docNo', header: 'Số CT', type: 'code' },
    { key: 'dueDate', header: 'Ngày phải TT', value: (r) => (r.dueDate ? date(r.dueDate) : '') },
    { key: 'termDays', header: 'Hạn thanh toán', type: 'number', value: (r) => (r.kind === 'doc' && r.termDays ? r.termDays : '') },
    { key: 'partnerCode', header: 'Mã khách hàng', type: 'code', value: (r) => (r.kind === 'pay' ? '' : r.partnerCode) },
    { key: 'partnerName', header: 'Tên khách hàng', value: (r) => (r.kind === 'pay' ? '' : r.partnerName) },
    { key: 'description', header: 'Diễn Giải', value: (r) => (isP(r) ? '' : r.description) },
    { key: 'debit', header: 'Ps Nợ', type: 'money', footer: d ? amt(d.totals.debit) : '', render: (r) => (r.kind === 'pay' ? '' : amt(r.debit)), value: (r) => (r.kind === 'pay' ? 0 : r.debit) },
    { key: 'credit', header: 'Ps Có', type: 'money', footer: d ? amt(d.totals.credit) : '', render: (r) => (r.kind === 'pay' ? '' : amt(r.credit)), value: (r) => (r.kind === 'pay' ? 0 : r.credit) },
    { key: 'employeeCode', header: 'Mã nhân viên', type: 'code' },
    { key: 'employeeName', header: 'Tên nhân viên' },
    { key: 'opening', header: 'Dư Đầu Kỳ', type: 'money', footer: d ? amt(d.totals.opening) : '', render: (r) => (isP(r) ? amt(r.opening) : ''), value: (r) => (isP(r) ? r.opening : 0) },
    { key: 'closing', header: 'Dư cuối kỳ', type: 'money', footer: d ? amt(d.totals.closing) : '', render: (r) => (isP(r) ? amt(r.closing) : ''), value: (r) => (isP(r) ? r.closing : 0) },
    { key: 'payNo', header: 'Số', type: 'code' },
    { key: 'payDate', header: 'Ngày', value: (r) => (r.payDate ? date(r.payDate) : '') },
    { key: 'payAmount', header: 'Giá trị', type: 'money', footer: d ? amt(d.totals.payAmount) : '', render: (r) => amt(r.payAmount), value: (r) => r.payAmount },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
  ];

  return (
    <>
      <PageHeader title="Sổ công nợ theo hạn thanh toán" code="ACC39" subtitle="Từng chứng từ nợ của đối tượng: hạn thanh toán, ngày phải thanh toán và các phiếu đã thanh toán cho chứng từ đó" helpKey="tuoi-no" />
      <FilterLayout
        print={<PrintButton screen="ACC39" templates={DEBT_TERM_TEMPLATES} disabled={!d || !d.rows.length}
          getDocs={(): DebtTermSheet[] => (d ? [{ from: f.from, to: f.to, account: f.account || '131', branchCodes: f.branchCodes,
            partnerName: f.partnerCode ? d.rows.find((r) => r.partnerCode === f.partnerCode)?.partnerName ?? f.partnerCode : undefined, rows: d.rows, totals: d.totals }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <div className="field"><label>Số tài khoản</label><AccountPicker className="input" value={f.account} onChange={(account) => set({ account })} /></div>
            <div className="field"><label>Nhóm KH</label><ListPicker items={groups} value={f.groupCode} onChange={(groupCode) => set({ groupCode })} placeholder="Tất cả" /></div>
            <div className="field"><label>Khách hàng / Nhà cung cấp</label><PartnerPicker value={f.partnerCode} onChange={(partnerCode) => set({ partnerCode })} placeholder="Tất cả" /></div>
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có công nợ trong khoảng này" /> : (
            <DataGrid
              storageKey="acc39-v2"
              rows={d.rows}
              rowKey={(r, i) => `${r.kind}-${r.partnerCode}-${r.docNo}-${r.payNo}-${i}`}
              rowKind={(r) => (isP(r) ? 'group' : 'data')}
              exportName={`ACC39-${f.from}-${f.to}`}
              columns={columns}
              onRowClick={(r) => { if (r.kind === 'doc') void openByNo(r.docNo, r.branchCode); else if (r.kind === 'pay') void openByNo(r.payNo, r.branchCode); }}
            />
          )}
        </div>
      </FilterLayout>
      {finding && <div className="muted" style={{ position: 'fixed', bottom: 12, right: 16 }}>Đang mở phiếu {finding}…</div>}
      {docId && <DocumentDetail id={docId} onClose={() => setDocId(null)} />}
    </>
  );
}
