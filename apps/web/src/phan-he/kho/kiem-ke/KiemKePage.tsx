// [2026-11-12 03:30 PM kiennt] NT-KHO-002 — màn danh sách biên bản kiểm kê kho (KHO02)
/**
 * Kiểm kê kho (KHO02) — danh sách biên bản kiểm kê; mở biên bản để nhập số kiểm kê, ghi nhận chênh lệch, xác minh, quyết định.
 * API: /api/v1/kho/kiem-ke. + Thêm: chi nhánh đang làm việc điền sẵn, ngày hôm nay.
 */
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { errorText } from '@/lib/api';
import { today } from '@/lib/format';
import { workBranch } from '@/lib/workBranch';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { DateRange } from '@/components/filters';
import { DataGrid } from '@/components/DataGrid';
import { ErrorBox, Loading } from '@/components/ui';
import { STATUS_CLASS, kkApi, qty, type KkDoc } from './api';
import { BienBanKiemKe } from './BienBanKiemKe';
import './kiem-ke.css';
import { useThaoTac } from '@/lib/manHinh';

const monthStart = () => `${today().slice(0, 8)}01`;
const emptyDoc = (): KkDoc => ({
  id: '', docNo: '', countDate: today(), branchCode: workBranch.get() || '', warehouseCode: '', quarantineWarehouse: '', purpose: '', conclusion: '',
  members: [], lines: [], status: 'draft', causes: [], verifyNote: '', decisionNo: '', decisionDate: null, decisionSigner: '', decisionReasons: {},
});

export function KiemKePage() {
  const tt = useThaoTac('kho.kiem-ke'); // [2026-11-13 05:30 PM kiennt] PHAN-QUYEN — bản thử: nút Thêm theo thao tác màn KHO02 (đóng góp)
  const qc = useQueryClient();
  const [f, setF] = useState({ from: monthStart(), to: today(), search: '' });
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<KkDoc | null>(null);
  const [editing, setEditing] = useState<KkDoc | null>(null);
  const [formKey, setFormKey] = useState(0);
  const exportRef = useRef<(() => void) | null>(null);
  const params = { from: f.from, to: f.to, ...(f.search ? { search: f.search } : {}) };
  const q = useQuery({ queryKey: ['kho-kiem-ke', params], queryFn: () => kkApi.list(params) });
  const open = async (row: KkDoc) => { setEditing(await kkApi.get(row.id)); setFormKey((k) => k + 1); };
  const rows = q.data ?? [];
  return (
    <div className="page">
      <PageHeader title="Kiểm kê kho" code="KHO02" helpKey="kiem-ke-kho"
        subtitle="Biên bản kiểm kê theo mặt hàng × lô → ghi nhận chênh lệch (1381 / 3381, hàng kém phẩm chất sang kho cách ly) → xác minh → quyết định xử lý." />
      <FilterLayout onSearch={() => setF((o) => ({ ...o, search: search.trim() }))}
        filters={
          <form className="rp-form" onSubmit={(e) => { e.preventDefault(); setF((o) => ({ ...o, search: search.trim() })); }}>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => setF((o) => ({ ...o, from, to }))} remember={false} />
            <div className="field"><label>Số biên bản / kho</label><input className="input" placeholder="Số biên bản, chi nhánh, kho, mục đích" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          </form>
        }>
        <div className="card">
          <div className="row ck-toolbar">
            {tt.them && <button className="btn btn-sm btn-primary" onClick={() => { setEditing(emptyDoc()); setFormKey((k) => k + 1); }} title="Lập biên bản kiểm kê mới — chi nhánh đang làm việc, ngày hôm nay">+ Thêm</button>}
            <button className="btn btn-sm" disabled={!sel} onClick={() => sel && void open(sel)}>Mở</button>
            <button className="btn btn-sm" onClick={() => void q.refetch()}>Nạp</button>
            <button className="btn btn-sm" onClick={() => exportRef.current?.()}>Xuất Excel</button>
          </div>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : (
            <DataGrid storageKey="kho02-kiem-ke-v1" exportName={`kiem-ke-${f.from}-${f.to}`} exportRef={exportRef}
              rows={rows} rowKey={(r) => r.id} onSelect={setSel} onRowDoubleClick={(r) => void open(r)} maxHeight="calc(100vh - 360px)" footerLabel="Cộng"
              emptyText='Chưa có biên bản kiểm kê trong khoảng này — bấm "+ Thêm"'
              columns={[
                { key: 'countDate', header: 'Ngày', title: 'Ngày kiểm kê', type: 'date', width: 95 },
                { key: 'docNo', header: 'Số biên bản', type: 'code', width: 115 },
                { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 100 },
                { key: 'warehouseCode', header: 'Kho kiểm', type: 'code', width: 95 },
                { key: 'lineCount', header: 'Số dòng', type: 'number', width: 70 },
                { key: 'shortage', header: 'Thiếu', title: 'Tổng số lượng thiếu (sổ > kiểm kê)', type: 'number', width: 85, sum: true, value: (r) => r.totals?.shortage ?? 0 },
                { key: 'surplus', header: 'Thừa', title: 'Tổng số lượng thừa (kiểm kê > sổ)', type: 'number', width: 85, sum: true, value: (r) => r.totals?.surplus ?? 0 },
                { key: 'poor', header: 'Kém / mất PC', title: 'Số lượng kém / mất phẩm chất chuyển kho cách ly', type: 'number', width: 95, sum: true, value: (r) => r.totals?.poorQty ?? 0 },
                { key: 'status', header: 'Trạng thái', width: 160, value: (r) => r.statusText ?? '', render: (r) => <span className={`badge ${STATUS_CLASS[r.status]}`}>{r.statusText}</span> },
                { key: 'decisionNo', header: 'Quyết định', type: 'code', width: 110 },
                { key: 'purpose', header: 'Mục đích', width: 220 },
                { key: 'createdBy', header: 'Người lập', width: 120, hidden: true },
              ]} />
          )}
          {sel && <div className="muted ck-sel">Đang chọn {sel.docNo}: {sel.branchCode} · {sel.warehouseCode || 'kho mặc định'} · thiếu {qty(sel.totals?.shortage)} · thừa {qty(sel.totals?.surplus)}</div>}
        </div>
      </FilterLayout>
      {editing && <BienBanKiemKe key={formKey} value={editing} onClose={() => setEditing(null)} onChanged={(d) => { setSel(d); void qc.invalidateQueries({ queryKey: ['kho-kiem-ke'] }); }} />}
    </div>
  );
}
