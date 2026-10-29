/**
 * Chứng từ kế toán (Tiện ích) — làm lại màn CtrlLedger của HTsoft. Một màn, bốn chế độ (cùng bố cục, khác cách lọc):
 *   ACC3   Chứng từ kế toán                     mọi chứng từ kế toán đang hiệu lực
 *   ACC3A  CT kế toán bị mất liên kết phiếu gốc  phiếu gốc không còn / đã huỷ / nguồn báo xoá / bút toán của phiên bản cũ
 *   ACC3B  CT kế toán lệch giữa thân và chi tiết tổng tiền thân khác tổng Nợ, hoặc Nợ khác Có
 *   ACC3C  CT kế toán lệch so với phiếu gốc      tổng tiền phiếu gốc khác giá trị phiếu trên sổ
 * Bảng lọc trái như HTsoft: Từ ngày, Đến ngày, Tìm số chứng từ, Số tài khoản, Loại chứng từ, Chi nhánh; nút Tìm, Xoá, Xuất.
 * Lưới trên: mỗi dòng một phiếu gốc (cộng các bút toán đang hiệu lực), cột Chọn để Xoá nhiều phiếu; dòng Tổng cộng.
 * Lưới dưới: chi tiết hạch toán của phiếu đang chọn. Bấm đúp mở phiếu gốc.
 * Xoá = BỎ ĐỊNH KHOẢN (HTsoft xoá bút toán, giữ phiếu gốc): đảo bút toán, chứng từ về Chờ định khoản ở ACC14 để định khoản lại.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Search, Trash2 } from 'lucide-react';
import { DOC_TYPE_LABELS, DOC_TYPE_LIST } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { date, today } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { BranchCheckList, ReportSideLayout, SideField, branchesPicked } from '@/components/ReportPanel';
import { AccountPicker } from '@/components/pickers';
import { DataGrid, type Column } from '@/components/DataGrid';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { DocumentDetail } from '../documents/DocumentDetail';
import { EntryOpen } from './EntriesPage';

export type VoucherMode = 'all' | 'unlinked' | 'unbalanced' | 'source-diff';
const SCREEN: Record<VoucherMode, { code: string; title: string; subtitle: string; diffLabel: string }> = {
  all: { code: 'ACC3', title: 'Chứng từ kế toán', subtitle: 'Chứng từ kế toán đang hiệu lực theo phiếu gốc; chọn để xem chi tiết hạch toán, tích để bỏ định khoản', diffLabel: 'Chênh lệch (Nợ − Có)' },
  unlinked: { code: 'ACC3A', title: 'CT kế toán bị mất liên kết phiếu gốc', subtitle: 'Bút toán còn hiệu lực mà phiếu gốc không còn, đã huỷ, nguồn báo xoá, hoặc là bút toán của phiên bản cũ', diffLabel: 'Chênh lệch (Nợ − Có)' },
  unbalanced: { code: 'ACC3B', title: 'CT kế toán lệch giữa thân và chi tiết', subtitle: 'Tổng tiền thân bút toán khác tổng Nợ của các dòng, hoặc tổng Nợ khác tổng Có', diffLabel: 'Chênh lệch (thân − chi tiết)' },
  'source-diff': { code: 'ACC3C', title: 'CT kế toán lệch so với phiếu gốc', subtitle: 'Tổng tiền phiếu gốc khác giá trị phiếu trên sổ (phiếu có bản mới chưa định khoản lại, sửa tay…)', diffLabel: 'Chênh lệch (phiếu gốc − sổ)' },
};

interface Row {
  key: string; entryIds: string[]; entryNos: string; year: number; docDate: string; postingDate: string; docNo: string; invoiceNo: string | null;
  docType: string; docTypeLabel: string; description: string; branchCode: string; branchName: string; reasonCode: string | null; bank: string;
  createdBy: string; docTotal: number; totalDebit: number; totalCredit: number; stockValue: number; diff: number;
  sourceDocumentId: string | null; sourceStatus: string | null; sourceVersion: number | null; sourceSystem: string | null; linkProblem: string; canUnpost: boolean;
}
interface Data { rows: Row[]; truncated: boolean; totals: Record<'docTotal' | 'totalDebit' | 'totalCredit' | 'stockValue' | 'diff', number> }
interface Line {
  lineNo: number; accountCode: string; accountName: string; debit: number; credit: number; description: string; partnerCode: string | null; partnerName: string | null;
  productSku: string | null; productName: string | null; department: string; contract: string; costItem: string; employeeCode: string; employeeName: string;
}
interface Entry { id: string; entryNo: string; lines: Line[] }
interface UnpostResult { results: { docNo: string; ok: boolean; reversed?: number; message?: string }[]; done: number; failed: number }

const STATUS_TEXT: Record<string, string> = { posted: 'đã định khoản', pending: 'chờ định khoản', error: 'lỗi định khoản', cancelled: 'đã huỷ' };

/** Người lập: "user:12" → mã người dùng; "apikey:3" → hệ thống tích hợp (như cột UserID của HTsoft). */
const userText = (s: string) => (s.startsWith('apikey:') ? 'Tích hợp' : s.replace(/^user:/, 'ND '));

export function AccountingVouchersPage({ mode = 'all' }: { mode?: VoucherMode }) {
  const screen = SCREEN[mode];
  const { can } = useAuth();
  const qc = useQueryClient();
  const init = { from: today(), to: today(), docNo: '', account: '', docType: '', branchCodes: '' };
  const [f, setF] = useState(init);
  const [df, setDf] = useState(init);
  const setD = (p: Partial<typeof init>) => setDf((x) => ({ ...x, ...p }));
  const [searched, setSearched] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Row | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [notice, setNotice] = useState<UnpostResult | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const viewRef = useRef<Row[]>([]);

  const params = { mode, from: f.from, to: f.to, docNo: f.docNo || undefined, account: f.account || undefined, docType: f.docType || undefined, branchCodes: f.branchCodes || undefined };
  const q = useQuery({ queryKey: ['ledger-vouchers', params], queryFn: () => api.get<Data>('/api/v1/ledger/vouchers', params), enabled: searched });
  const rows = q.data?.rows ?? [];
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  const search = () => {
    if (!branchesPicked(df.branchCodes)) return;
    if (df.from > df.to) { window.alert('Từ ngày phải trước đến ngày'); return; }
    setF(df); setSearched(true); setChecked(new Set()); setSel(null); setNotice(null);
    void qc.invalidateQueries({ queryKey: ['ledger-vouchers'] });
  };

  const unpost = useMutation({
    mutationFn: (v: { entryIds: string[]; reason: string }) => api.post<UnpostResult>('/api/v1/ledger/vouchers/unpost', v),
    onSuccess: (r) => { setNotice(r); setChecked(new Set()); setSel(null); void qc.invalidateQueries({ queryKey: ['ledger-vouchers'] }); void qc.invalidateQueries({ queryKey: ['documents'] }); },
  });
  const picked = [...checked].map((k) => byKey.get(k)).filter((r): r is Row => Boolean(r));
  const doDelete = () => {
    if (!picked.length) { window.alert('Bạn chưa tích chọn chứng từ để xoá'); return; }
    const skip = picked.filter((r) => !r.canUnpost).length;
    const reason = window.prompt(
      `Bỏ định khoản ${picked.length - skip} chứng từ đã chọn: đảo bút toán, chứng từ về "Chờ định khoản" ở ACC14 để định khoản lại.`
      + (skip ? `\n${skip} chứng từ lập tay / kết chuyển / giá vốn sẽ được bỏ qua (sửa ở màn của chúng).` : '')
      + '\n\nLý do:',
    );
    if (reason?.trim()) unpost.mutate({ entryIds: picked.flatMap((r) => r.entryIds), reason: reason.trim() });
  };

  // Chi tiết hạch toán của phiếu đang chọn: mọi bút toán đang hiệu lực của phiếu.
  const details = useQueries({ queries: (sel?.entryIds ?? []).map((id) => ({ queryKey: ['ledger-entry', id], queryFn: () => api.get<Entry>(`/api/v1/ledger/entries/${id}`) })) });
  const lines = details.flatMap((d) => (d.data ? d.data.lines.map((l) => ({ ...l, entryId: d.data!.id, entryNo: d.data!.entryNo })) : []));

  const toggleAll = (on: boolean) => setChecked(on ? new Set(viewRef.current.map((r) => r.key)) : new Set());
  const allChecked = rows.length > 0 && viewRef.current.length > 0 && viewRef.current.every((r) => checked.has(r.key));
  const columns: Column<Row>[] = [
    {
      key: 'chon', header: <input type="checkbox" title="Chọn tất cả đang hiện" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />, width: 44, noFilter: true, noSort: true,
      render: (r) => <input type="checkbox" checked={checked.has(r.key)} onClick={(e) => e.stopPropagation()} onChange={(e) => setChecked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.key); else n.delete(r.key); return n; })} />,
    },
    { key: 'year', header: 'Năm', type: 'number', width: 60, hidden: true },
    { key: 'docDate', header: 'Ngày chứng từ', type: 'date', width: 100 },
    { key: 'postingDate', header: 'Ngày ghi sổ', type: 'date', width: 100 },
    { key: 'docNo', header: 'Số chứng từ', type: 'code', width: 140 },
    { key: 'docTotal', header: 'Tổng tiền trên phiếu', type: 'money', width: 130, sum: true },
    { key: 'bank', header: 'Ngân hàng', type: 'code', width: 110 },
    { key: 'description', header: 'Diễn giải', width: 260 },
    { key: 'branchCode', header: 'Chi nhánh lập', width: 150, value: (r) => `${r.branchCode} - ${r.branchName}` },
    { key: 'totalDebit', header: 'Tổng nợ', type: 'money', width: 120, sum: true },
    { key: 'totalCredit', header: 'Tổng có', type: 'money', width: 120, sum: true },
    { key: 'diff', header: screen.diffLabel, title: screen.diffLabel, type: 'money', width: 120, sum: true, showZero: mode !== 'all' && mode !== 'unlinked', className: mode === 'unbalanced' || mode === 'source-diff' ? 'text-bad' : undefined },
    { key: 'stockValue', header: 'Tiền kho', type: 'money', width: 120, sum: true },
    { key: 'createdBy', header: 'UserID', width: 100, value: (r) => userText(r.createdBy) },
    { key: 'reasonCode', header: 'Lý do', type: 'code', width: 90 },
    { key: 'docTypeLabel', header: 'Kiểu', width: 160 },
    { key: 'invoiceNo', header: 'Số VAT', type: 'code', width: 100 },
    ...(mode === 'unlinked' ? [{ key: 'linkProblem', header: 'Tình trạng phiếu gốc', width: 260, className: 'text-bad' } as Column<Row>] : []),
    { key: 'entryNos', header: 'Số bút toán', type: 'code', width: 150, hidden: true },
  ];
  const lineCols: Column<(typeof lines)[number]>[] = [
    { key: 'entryNo', header: 'Số bút toán', type: 'code', width: 120 },
    { key: 'accountCode', header: 'Tài khoản', type: 'code', width: 90 },
    { key: 'accountName', header: 'Tên tài khoản', width: 200 },
    { key: 'debit', header: 'Nợ', type: 'money', width: 120, sum: true },
    { key: 'credit', header: 'Có', type: 'money', width: 120, sum: true },
    { key: 'partnerCode', header: 'Mã đối tượng', type: 'code', width: 110 },
    { key: 'partnerName', header: 'Tên đối tượng', width: 180 },
    { key: 'productSku', header: 'Mã hàng', type: 'code', width: 110 },
    { key: 'productName', header: 'Tên hàng', width: 180 },
    { key: 'costItem', header: 'Khoản mục', type: 'code', width: 90 },
    { key: 'department', header: 'Bộ phận', type: 'code', width: 90 },
    { key: 'contract', header: 'Hợp đồng', type: 'code', width: 90 },
    { key: 'employeeName', header: 'Nhân viên', width: 140, value: (l) => l.employeeName || l.employeeCode },
    { key: 'description', header: 'Ghi chú', width: 220 },
  ];

  const panel = (
    <>
      <SideField label="Từ ngày"><input type="date" className="input" value={df.from} onChange={(e) => setD({ from: e.target.value })} /></SideField>
      <SideField label="Đến ngày"><input type="date" className="input" value={df.to} min={df.from} onChange={(e) => setD({ to: e.target.value })} /></SideField>
      <SideField label="Tìm số chứng từ"><input className="input" value={df.docNo} onChange={(e) => setD({ docNo: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Số CT, số bút toán, số HĐ" /></SideField>
      <SideField label="Số tài khoản"><AccountPicker className="input" placeholder="" value={df.account} onChange={(account) => setD({ account })} /></SideField>
      <SideField label="Loại chứng từ">
        <select className="select input" value={df.docType} onChange={(e) => setD({ docType: e.target.value })}>
          <option value="">Tất cả</option>
          {DOC_TYPE_LIST.map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
        </select>
      </SideField>
      <span className="muted" style={{ fontSize: 12, marginTop: 2 }}>Chi nhánh</span>
      <BranchCheckList value={df.branchCodes} onChange={(branchCodes) => setD({ branchCodes })} onRestore={(branchCodes) => setD({ branchCodes })} />
      <div className="rp-actions">
        <button type="button" className="btn btn-primary" onClick={search} disabled={q.isFetching}><Search size={14} /> Tìm</button>
        <div className="rp-actions-row">
          {can('documents:write') && (
            <button type="button" className="btn btn-danger" onClick={doDelete} disabled={!checked.size || unpost.isPending} title="Bỏ định khoản các chứng từ đã tích: đảo bút toán, chứng từ về Chờ định khoản (ACC14)">
              <Trash2 size={14} /> Xoá{checked.size ? ` (${checked.size})` : ''}
            </button>
          )}
          <button type="button" className="btn" onClick={() => exportRef.current?.()} disabled={!rows.length}><FileSpreadsheet size={14} /> Xuất</button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <PageHeader title={screen.title} code={screen.code} subtitle={screen.subtitle} helpKey="chung-tu-ke-toan" />
      <ReportSideLayout panel={panel}>
        <ErrorBox error={q.error ? errorText(q.error) : unpost.error ? errorText(unpost.error) : null} />
        {notice && (
          <div className={`alert ${notice.failed ? 'alert-warn' : 'alert-ok'}`} style={{ marginBottom: 8 }}>
            Đã bỏ định khoản {notice.done} chứng từ — về "Chờ định khoản" ở ACC14.
            {notice.failed > 0 && <> Không làm được {notice.failed}: {notice.results.filter((x) => !x.ok).map((x) => `${x.docNo} (${x.message})`).join('; ')}</>}
          </div>
        )}
        <div className="card">
          {!searched ? <Empty text="Chọn điều kiện ở bảng bên trái rồi bấm Tìm." /> : q.isLoading ? <Loading /> : (
            <DataGrid
              storageKey={`${screen.code.toLowerCase()}-ctkt`}
              exportName={screen.title}
              exportRef={exportRef}
              viewRef={viewRef}
              rows={rows}
              rowKey={(r) => r.key}
              onSelect={setSel}
              onRowDoubleClick={(r) => (r.sourceDocumentId ? setOpenDoc(r.sourceDocumentId) : setOpenEntry(r.entryIds[0]!))}
              rowClassName={(r) => (checked.has(r.key) ? 'selected' : '')}
              groupable
              footerLabel="Tổng cộng"
              maxHeight="48vh"
              emptyText={mode === 'all' ? 'Không có chứng từ kế toán nào thoả điều kiện' : 'Không có chứng từ nào lệch — sổ khớp với điều kiện đã chọn'}
              note={q.data?.truncated ? 'chỉ hiện 20.000 chứng từ đầu, hãy thu hẹp khoảng ngày' : `${rows.length} chứng từ · bấm một dòng xem chi tiết hạch toán · bấm đúp mở phiếu gốc`}
              columns={columns}
            />
          )}
        </div>
        {sel && (
          <div className="card" style={{ marginTop: 8 }}>
            <div className="muted" style={{ padding: '6px 10px', fontSize: 13 }}>
              Chi tiết hạch toán — <b>{sel.docNo}</b> ({sel.docTypeLabel}, {date(sel.docDate)}{sel.sourceStatus ? `, phiếu gốc: ${STATUS_TEXT[sel.sourceStatus] ?? sel.sourceStatus}${sel.sourceVersion ? `, phiên bản ${sel.sourceVersion}` : ''}` : ''})
            </div>
            {details.some((d) => d.isLoading) ? <Loading /> : (
              <DataGrid storageKey="ctkt-chi-tiet" rows={lines} rowKey={(l) => `${l.entryId}-${l.lineNo}`} onRowDoubleClick={(l) => setOpenEntry(l.entryId)} footerLabel="Cộng" maxHeight="32vh" columns={lineCols} />
            )}
          </div>
        )}
      </ReportSideLayout>
      {openDoc && <DocumentDetail id={openDoc} onClose={() => setOpenDoc(null)} />}
      {openEntry && <EntryOpen id={openEntry} onClose={() => setOpenEntry(null)} />}
    </>
  );
}
