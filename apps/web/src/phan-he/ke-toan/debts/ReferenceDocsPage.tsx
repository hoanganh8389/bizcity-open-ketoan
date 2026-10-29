/**
 * Chứng từ nguồn (CN06): đơn đặt hàng, báo giá, phiếu nhập / xuất… do hệ thống mua hàng, bán hàng gửi sang.
 * Chỉ để tham chiếu: kế toán chọn một chứng từ nguồn khi lập phiếu đặt cọc, ghi tăng / giảm công nợ
 * (ReferencePicker) để điền sẵn đối tượng, số tiền, hạn thanh toán. Không ghi sổ.
 */
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REFERENCE_DOC_KINDS } from '@ketoan/contracts';
import { api, errorText, ALL_ROWS } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Loading, Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { PartnerPicker } from '@/components/pickers';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';

export interface ReferenceDoc {
  id: string; kind: string; kindLabel: string; docKey: string; docNo: string; docDate: string; partnerCode: string; partnerName: string; branchCode: string;
  total: number; dueDate: string | null; description: string; sourceSystem: string; status: 'open' | 'used' | 'closed'; usedDocumentId: string | null; usedDocNo: string | null;
}
const STATUS: Record<string, string> = { open: 'Chưa dùng', used: 'Đã lập phiếu', closed: 'Đã đóng' };

function useReferenceDocs(params: Record<string, string | number | undefined>) {
  return useQuery({ queryKey: ['reference-documents', params], queryFn: () => api.getPage<ReferenceDoc[]>('/api/v1/reference-documents', params), placeholderData: keepPreviousData });
}

export function ReferenceDocsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({ kind: '', status: 'open', partnerCode: '', search: '', page: 1 });
  const [docId, setDocId] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch, page: patch.page ?? 1 }));
  const q = useReferenceDocs({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')), pageSize: ALL_ROWS });
  const mark = useMutation({ mutationFn: (a: { id: string; status: string }) => api.patch(`/api/v1/reference-documents/${a.id}`, { status: a.status }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['reference-documents'] }) });
  return (
    <>
      <PageHeader title="Chứng từ nguồn" code="CN06" subtitle="Đơn đặt hàng, báo giá, phiếu nhập / xuất nhận từ hệ thống mua hàng, bán hàng; dùng để lập phiếu công nợ, không ghi sổ" helpKey="phieu-cong-no" />
      <div className="card">
        <div className="filters">
          <div className="field">
            <label>Loại</label>
            <select className="select input" value={f.kind} onChange={(e) => set({ kind: e.target.value })}><option value="">Tất cả</option>{Object.entries(REFERENCE_DOC_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
          <div className="field">
            <label>Trạng thái</label>
            <select className="select input" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="open">Chưa dùng</option><option value="used">Đã lập phiếu</option><option value="closed">Đã đóng</option><option value="all">Tất cả</option></select>
          </div>
          <div className="field"><label>Đối tượng</label><PartnerPicker value={f.partnerCode} onChange={(partnerCode) => set({ partnerCode })} placeholder="Tất cả" /></div>
          <div className="field"><label>Tìm số chứng từ, nội dung</label><input className="input w-lg" value={f.search} onChange={(e) => set({ search: e.target.value })} /></div>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : mark.error ? errorText(mark.error) : null} />
        {q.isLoading ? <Loading /> : !q.data?.data.length ? <Empty text="Chưa có chứng từ nguồn. Hệ thống mua hàng, bán hàng gửi sang qua API (PUT /api/v1/reference-documents)." /> : (
          <DataGrid storageKey="cn06" rows={q.data.data} rowKey={(r) => r.id} footerLabel={false} 
            columns={[
              { key: 'docDate', header: 'Ngày', type: 'date' },
              { key: 'kindLabel', header: 'Loại' },
              { key: 'docNo', header: 'Số chứng từ', type: 'code' },
              { key: 'partnerCode', header: 'Mã đối tượng', type: 'code' },
              { key: 'partnerName', header: 'Tên đối tượng' },
              { key: 'description', header: 'Nội dung' },
              { key: 'total', header: 'Giá trị', type: 'money' },
              { key: 'dueDate', header: 'Hạn TT', type: 'date' },
              { key: 'status', header: 'Trạng thái', value: (r) => STATUS[r.status] ?? r.status },
              { key: 'usedDocNo', header: 'Phiếu đã lập', type: 'code', render: (r) => (r.usedDocumentId ? <button className="btn btn-sm" onClick={() => setDocId(r.usedDocumentId)}>{r.usedDocNo}</button> : '') },
              { key: 'branchCode', header: 'Chi nhánh', type: 'code', hidden: true },
              { key: 'sourceSystem', header: 'Hệ thống gửi', hidden: true },
              { key: 'action', header: '', noFilter: true, noSort: true, render: (r) => can('documents:write') && (r.status === 'open' ? <button className="btn btn-sm" onClick={() => mark.mutate({ id: r.id, status: 'closed' })}>Đóng</button> : <button className="btn btn-sm" onClick={() => mark.mutate({ id: r.id, status: 'open' })}>Mở lại</button>) },
            ] satisfies Column<ReferenceDoc>[]} />
        )}
      </div>
      {docId && <DocumentDetail id={docId} onClose={() => setDocId(null)} />}
    </>
  );
}

/** Hộp chọn một chứng từ nguồn chưa dùng (lọc theo các loại phù hợp với phiếu đang lập). */
export function ReferencePicker({ kinds, partnerCode, onPick, onClose }: { kinds: string[]; partnerCode?: string; onPick: (d: ReferenceDoc) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const q = useReferenceDocs({ kind: kinds.join(','), status: 'open', partnerCode: partnerCode || undefined, search: search || undefined, pageSize: ALL_ROWS });
  return (
    <Modal wide title="Chọn chứng từ nguồn" onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      <div className="full"><input className="input" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm số chứng từ, nội dung" /></div>
      <div className="full">
        {q.isLoading ? <Loading /> : !q.data?.data.length ? <div className="muted">Không có chứng từ nguồn chưa dùng nào khớp{partnerCode ? ` của đối tượng ${partnerCode}` : ''}.</div> : (
          <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
            <table className="grid">
              <thead><tr><th>Ngày</th><th>Loại</th><th>Số chứng từ</th><th>Đối tượng</th><th>Nội dung</th><th className="num">Giá trị</th><th>Hạn TT</th><th /></tr></thead>
              <tbody>
                {q.data.data.map((d) => (
                  <tr key={d.id} className="clickable" onClick={() => onPick(d)}>
                    <td>{date(d.docDate)}</td><td>{d.kindLabel}</td><td className="mono">{d.docNo}</td><td>{d.partnerCode} {d.partnerName}</td><td>{d.description}</td><td className="num">{money(d.total)}</td><td>{d.dueDate ? date(d.dueDate) : ''}</td>
                    <td><button className="btn btn-sm btn-primary">Chọn</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
