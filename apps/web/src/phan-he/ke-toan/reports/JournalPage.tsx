// [2026-11-11 Nguyễn Văn Thủy] Sổ nhật ký chung theo mẫu S03a-DN: tham số kỳ + cộng gộp bút toán giống nhau; cột chuẩn, cột thêm ẩn sẵn (đóng góp)
/**
 * Sổ nhật ký chung (S03a-DN, ACC89): mọi dòng định khoản trong kỳ theo thứ tự thời gian.
 *   Tham số: kỳ; Cộng gộp các bút toán giống nhau; nhiều chi nhánh (lớp gắn thêm): chọn chi nhánh.
 *   Cột: Ngày hạch toán · Ngày chứng từ · Số chứng từ · Diễn giải · Tài khoản · TK đối ứng · Phát sinh Nợ · Phát sinh Có;
 *   cột thêm ẩn sẵn (bật ở nút Cột): loại chứng từ, đối tượng, mã / tên hàng, số hoá đơn, chi nhánh.
 *   ?account=, ?docType=, ?sku= trên đường dẫn vẫn lọc (liên kết từ màn khác).
 */
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DOC_TYPE_LABELS, type DocType } from '@ketoan/contracts';
import { api, errorText, ALL_ROWS } from '@/lib/api';
import { defaultTo, kyText, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { BranchCheckList, ReportSideLayout, SideActions, SideKy, branchesPicked } from '@/components/ReportPanel';
import { useBranches } from '@/components/filters';
import { EntryOpen } from '../../../features/ledger/EntriesPage';
import { DataGrid, type Column } from '@/components/DataGrid';
import { PrintButton } from '@/components/print';
import { NKC_TEMPLATES } from './mauIn/soNhatKyChung';
import { gopMacDinh, nhoGop } from './gopNho';

interface Row {
  id: string; entryId: string; postingDate: string; docDate: string; entryNo: string; docNo: string; docType: DocType; invoiceNo: string | null;
  reasonCode: string | null; sourceType?: string | null; description: string; accountCode: string; counterAccounts: string; debit: number; credit: number;
  partnerCode: string | null; partnerName: string | null; productSku: string | null; productName: string | null; branchCode: string; isReversal: boolean; entryStatus?: string;
  /** Số dòng mã hàng gộp vào (chế độ Cộng gộp). */ lineCount?: number;
}
interface Data { rows: Row[]; totals: { lines: number; entries: number; debit: number; credit: number } }

export function JournalPage() {
  const [params] = useSearchParams();
  const multi = (useBranches().data?.length ?? 0) > 1;
  // draft: ô đang sửa; f: điều kiện đã bấm "Tìm kiếm".
  const start = { from: periodFrom(), to: defaultTo(), branchCodes: '', account: params.get('account') ?? '', counterAccount: '', docType: params.get('docType') ?? '', sku: params.get('sku') ?? '', groupMode: gopMacDinh('ACC89', true) ? '2' : '1', corrections: 'hide' };
  const [draft, setDraft] = useState(start);
  const [f, setF] = useState(start);
  const [entryId, setEntryId] = useState<string | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const set = (patch: Partial<typeof start>) => setDraft((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['journal', f], queryFn: () => api.getPage<Data>('/api/v1/reports/journal', { ...f, pageSize: ALL_ROWS }), placeholderData: keepPreviousData });
  const d = q.data?.data;
  const detail = f.groupMode === '1';

  const panel = (
    <>
      <SideKy from={draft.from} to={draft.to} onChange={(from, to) => set({ from, to })} />
      <label className="checkbox" style={{ fontSize: 12 }}><input type="checkbox" checked={draft.groupMode === '2'} onChange={(e) => { nhoGop('ACC89', e.target.checked); set({ groupMode: e.target.checked ? '2' : '1' }); }} /> Cộng gộp các bút toán giống nhau</label>
      {multi && (
        <>
          <span className="muted" style={{ fontSize: 12, marginTop: 2 }}>Chi nhánh</span>
          <BranchCheckList value={draft.branchCodes} onChange={(branchCodes) => set({ branchCodes })} onRestore={(branchCodes) => { set({ branchCodes }); setF((x) => ({ ...x, branchCodes })); }} />
        </>
      )}
      <SideActions onSearch={() => branchesPicked(draft.branchCodes) && setF(draft)} onExport={d && d.rows.length ? () => exportRef.current?.() : undefined} busy={q.isFetching}
        print={<PrintButton screen="ACC89" templates={NKC_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />} />
    </>
  );

  return (
    <>
      <PageHeader title="Sổ nhật ký chung" code="ACC89" subtitle="Mẫu S03a-DN: toàn bộ định khoản trong kỳ theo thứ tự thời gian" helpKey="nhat-ky-chung" />
      <ReportSideLayout panel={panel} boThamSo={{ value: f, onApply: (v: typeof f) => { setDraft(v); setF(v); } }}>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        <div className="card">
          <div className="rp-tieu-de"><h2>SỔ NHẬT KÝ CHUNG</h2><i>{kyText(f.from, f.to)}</i></div>
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có định khoản nào trong kỳ này" /> : (
            <DataGrid
              storageKey="acc89-v6"
              rows={d.rows}
              rowKey={(r, i) => (detail ? r.id : `${r.entryId}-${r.accountCode}-${r.counterAccounts}-${i}`)}
              onRowClick={(r) => setEntryId(r.entryId)}
              exportRef={exportRef}
              exportName={`so-nhat-ky-chung-${f.from}-${f.to}`}
              exportTitle={`Sổ nhật ký chung — ${kyText(f.from, f.to)}`}
              footerLabel="Tổng cộng"
              columns={[
                { key: 'postingDate', header: 'Ngày hạch toán', type: 'date', width: 104 },
                { key: 'docDate', header: 'Ngày chứng từ', type: 'date', width: 104, value: (r) => r.docDate || r.postingDate },
                { key: 'docNo', header: 'Số chứng từ', type: 'code', width: 130, render: (r) => <>{r.docNo}{r.isReversal ? <span className="badge badge-warn" style={{ marginLeft: 6 }}>Ghi số âm</span> : r.entryStatus && r.entryStatus !== 'posted' ? <span className="badge badge-gray" style={{ marginLeft: 6 }}>Đã đảo</span> : null}</> },
                { key: 'description', header: 'Diễn giải', width: 300 },
                { key: 'accountCode', header: 'Tài khoản', type: 'code', width: 90 },
                { key: 'counterAccounts', header: 'TK đối ứng', type: 'code', width: 90 },
                { key: 'debit', header: 'Phát sinh Nợ', type: 'money', sum: true, width: 130 },
                { key: 'credit', header: 'Phát sinh Có', type: 'money', sum: true, width: 130 },
                { key: 'lineCount', header: 'Số dòng', type: 'number', width: 70, hidden: detail, title: 'Số dòng chi tiết (từng mã hàng) đã cộng gộp vào dòng này. Bấm vào dòng để xem bút toán với từng dòng mã hàng.' },
                { key: 'docType', header: 'Loại chứng từ', width: 150, hidden: true, value: (r) => (r.sourceType === 'export_adjust' ? 'Xuất kho điều chỉnh' : DOC_TYPE_LABELS[r.docType] ?? r.docType) },
                { key: 'partnerCode', header: 'Mã đối tượng', type: 'code', width: 110, hidden: true },
                { key: 'partnerName', header: 'Tên đối tượng', width: 180, hidden: true },
                { key: 'productSku', header: 'Mã hàng', type: 'code', width: 110, hidden: true },
                { key: 'productName', header: 'Tên hàng', width: 180, hidden: true },
                { key: 'invoiceNo', header: 'Số hoá đơn', type: 'code', width: 100, hidden: true },
                { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 90, hidden: !multi },
              ] satisfies Column<Row>[]}
            />
          )}
        </div>
      </ReportSideLayout>
      {entryId && <EntryOpen id={entryId} onClose={() => setEntryId(null)} />}
    </>
  );
}
