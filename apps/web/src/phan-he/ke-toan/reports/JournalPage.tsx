/**
 * Sổ nhật ký chung (S03a): mọi dòng định khoản trong kỳ theo ngày, số chứng từ, kèm tài khoản đối ứng.
 * Bố cục như màn sổ quen thuộc: bảng lọc bên trái (Từ ngày, Đến ngày, Số tài khoản, TK Đối ứng, Chi nhánh,
 * Kiểu báo cáo, Tìm kiếm / Xuất / In), lưới bên phải có dải kéo cột để nhóm.
 * Cột: Số chứng từ, Ngày tháng ghi sổ, Tài khoản, Tài khoản đối ứng, Ghi chú, Số tiền Nợ, Số tiền Có, Mã lý do, Loại phiếu, Mã / tên hàng, đối tượng.
 * Lọc thêm loại chứng từ và mã hàng (sổ chi tiết có định khoản theo mã hàng); mở bằng ?docType=purchase từ menu Mua hàng.
 */
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DOC_TYPE_LABELS, type DocType } from '@ketoan/contracts';
import { api, errorText, ALL_ROWS } from '@/lib/api';
import { defaultFrom, defaultTo } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { AccountPicker, ItemPicker } from '@/components/pickers';
import { BranchCheckList, ReportSideLayout, SideActions, SideField, branchesPicked } from '@/components/ReportPanel';
import { EntryOpen } from '../../../features/ledger/EntriesPage';
import { DataGrid, type Column } from '@/components/DataGrid';
import { PrintButton } from '@/components/print';
import { NKC_TEMPLATES } from './mauIn/soNhatKyChung';

interface Row {
  id: string; entryId: string; postingDate: string; docDate: string; entryNo: string; docNo: string; docType: DocType; invoiceNo: string | null;
  reasonCode: string | null; sourceType?: string | null; description: string; accountCode: string; counterAccounts: string; debit: number; credit: number;
  partnerCode: string | null; partnerName: string | null; productSku: string | null; productName: string | null; branchCode: string; isReversal: boolean; entryStatus?: string;
}
interface Data { rows: Row[]; totals: { lines: number; entries: number; debit: number; credit: number } }

const INIT = { from: defaultFrom(), to: defaultTo(), branchCodes: '', account: '', counterAccount: '', docType: '', sku: '', groupMode: '1', corrections: 'hide' as 'hide' | 'all' | 'only' };
const TYPE_OPTIONS: DocType[] = ['purchase', 'purchase_return', 'payment', 'bank_payment', 'sale', 'sale_return', 'receipt', 'bank_receipt', 'manual'];

export function JournalPage() {
  // draft: ô lọc đang sửa; f: điều kiện đã bấm "Tìm kiếm".
  const [params] = useSearchParams();
  const start = { ...INIT, docType: params.get('docType') ?? '', sku: params.get('sku') ?? '', account: params.get('account') ?? '' };
  const [draft, setDraft] = useState(start);
  const [f, setF] = useState(start);
  const [entryId, setEntryId] = useState<string | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const set = (patch: Partial<typeof INIT>) => setDraft((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['journal', f], queryFn: () => api.getPage<Data>('/api/v1/reports/journal', { ...f, pageSize: ALL_ROWS }), placeholderData: keepPreviousData });
  const d = q.data?.data;
  const detail = f.groupMode === '1';

  const panel = (
    <>
      <SideField label="Từ ngày"><input type="date" className="input" value={draft.from} onChange={(e) => set({ from: e.target.value })} /></SideField>
      <SideField label="Đến ngày"><input type="date" className="input" value={draft.to} min={draft.from} onChange={(e) => set({ to: e.target.value })} /></SideField>
      <SideField label="Số tài khoản"><AccountPicker className="input" placeholder="" value={draft.account} onChange={(account) => set({ account })} /></SideField>
      <SideField label="TK Đối ứng"><AccountPicker className="input" placeholder="" value={draft.counterAccount} onChange={(counterAccount) => set({ counterAccount })} /></SideField>
      <SideField label="Loại chứng từ">
        <select className="select input" style={{ height: 26, fontSize: 12 }} value={draft.docType} onChange={(e) => set({ docType: e.target.value })}>
          <option value="">Tất cả</option>
          {TYPE_OPTIONS.filter((t) => DOC_TYPE_LABELS[t]).map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
        </select>
      </SideField>
      <SideField label="Mã hàng"><ItemPicker className="input" hideName placeholder="Tất cả" value={draft.sku} onChange={(sku) => set({ sku })} /></SideField>
      <span className="muted" style={{ fontSize: 12, marginTop: 2 }}>Chi nhánh</span>
      <BranchCheckList value={draft.branchCodes} onChange={(branchCodes) => set({ branchCodes })} onRestore={(branchCodes) => { set({ branchCodes }); setF((x) => ({ ...x, branchCodes })); }} />
      <span className="muted" style={{ fontSize: 12, marginTop: 2 }}>Kiểu báo cáo</span>
      <select className="select input" style={{ height: 26, fontSize: 12 }} value={draft.groupMode} onChange={(e) => set({ groupMode: e.target.value })}>
        <option value="1">Theo chi tiết chứng từ</option>
        <option value="2">Theo chứng từ + tài khoản đối ứng</option>
        <option value="3">Theo chứng từ</option>
      </select>
      <span className="muted" style={{ fontSize: 12, marginTop: 2 }}>Bút toán hiển thị</span>
      <select className="select input" style={{ height: 26, fontSize: 12 }} value={draft.corrections} onChange={(e) => set({ corrections: e.target.value as typeof INIT.corrections })} title="Bút toán đã đảo: bút toán gốc bị sửa / huỷ và bút toán ghi số âm đảo nó">
        <option value="hide">Chỉ bút toán đang hiệu lực</option>
        <option value="all">Hiện cả bút toán đã đảo</option>
        <option value="only">Chỉ bút toán đã đảo / ghi số âm</option>
      </select>
      <SideActions onSearch={() => branchesPicked(draft.branchCodes) && setF(draft)} onExport={d && d.rows.length ? () => exportRef.current?.() : undefined} busy={q.isFetching}
        print={<PrintButton screen="ACC89" templates={NKC_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />} />
    </>
  );

  return (
    <>
      <PageHeader title="Sổ nhật ký chung" code="ACC89" subtitle="Toàn bộ định khoản trong kỳ theo ngày và số chứng từ" helpKey="nhat-ky-chung" />
      <ReportSideLayout panel={panel}>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <div className="card"><Empty text="Không có định khoản nào trong khoảng này" /></div> : (
          <div className="card">
            <DataGrid
              storageKey="acc89-v5"
              rows={d.rows}
              rowKey={(r, i) => (detail ? r.id : `${r.entryId}-${r.accountCode}-${r.counterAccounts}-${i}`)}
              onRowClick={(r) => setEntryId(r.entryId)}
              groupable
              exportRef={exportRef}
              exportName={`so-nhat-ky-chung-${f.from}-${f.to}`}
              note={`${d.totals.entries.toLocaleString('vi-VN')} chứng từ`}
              columns={[
                { key: 'docNo', header: 'Số chứng từ', type: 'code', render: (r) => <>{r.docNo}{r.isReversal ? <span className="badge badge-warn" style={{ marginLeft: 6 }}>Ghi số âm</span> : r.entryStatus && r.entryStatus !== 'posted' ? <span className="badge badge-gray" style={{ marginLeft: 6 }}>Đã đảo</span> : null}</> },
                { key: 'postingDate', header: 'Ngày, tháng ghi sổ', type: 'date' },
                { key: 'accountCode', header: 'Tài khoản', type: 'code' },
                { key: 'counterAccounts', header: 'Tài khoản đối ứng', type: 'code' },
                // Mã hàng ngay sau tài khoản: xem định khoản theo mã không phải kéo sang phải.
                { key: 'productSku', header: 'Mã hàng', type: 'code' },
                { key: 'productName', header: 'Tên hàng' },
                { key: 'description', header: 'Ghi chú' },
                { key: 'debit', header: 'Số tiền Nợ', type: 'money', sum: true },
                { key: 'credit', header: 'Số tiền Có', type: 'money', sum: true },
                { key: 'reasonCode', header: 'Mã lý do', type: 'code' },
                { key: 'docType', header: 'Loại phiếu', value: (r) => (r.sourceType === 'export_adjust' ? 'Phiếu xuất điều chỉnh' : DOC_TYPE_LABELS[r.docType] ?? r.docType) },
                { key: 'branchCode', header: 'Chi nhánh', type: 'code', hidden: true },
                { key: 'docDate', header: 'Ngày chứng từ', type: 'date', hidden: true },
                { key: 'entryNo', header: 'Số bút toán', type: 'code', hidden: true },
                { key: 'invoiceNo', header: 'Số hoá đơn', type: 'code' },
                { key: 'partnerCode', header: 'Mã đối tượng', type: 'code' },
                { key: 'partnerName', header: 'Tên đối tượng', hidden: true },
              ] satisfies Column<Row>[]}
            />
          </div>
        )}
      </ReportSideLayout>
      {entryId && <EntryOpen id={entryId} onClose={() => setEntryId(null)} />}
    </>
  );
}
