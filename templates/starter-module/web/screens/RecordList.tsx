/** Module mẫu — danh sách + lập mới. Chỉ dùng @bizcity/ui-kit (không import apps/web). API: /api/v1/m/mau-module/… */
import { useState } from 'react';
import { Empty, ErrorBox, Field, Loading, Modal, PageHeader, errorText, useApi, useCan, useMutation, useQuery, useQueryClient } from '@bizcity/ui-kit';

interface Row { id: string; title: string; note: string | null; createdAt: string }
const BASE = '/api/v1/m/mau-module';

export function RecordList() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const list = useQuery({ queryKey: ['mau-module', 'records', q], queryFn: () => api.get<{ items: Row[] }>(`${BASE}/records`, { q: q || undefined }) });
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const create = useMutation({
    mutationFn: () => api.post<{ id: string }>(`${BASE}/records`, { title, note: note || undefined }),
    onSuccess: () => { setOpen(false); setTitle(''); setNote(''); void qc.invalidateQueries({ queryKey: ['mau-module'] }); },
  });
  return (
    <div>
      <PageHeader title="Module mẫu" code="MM01" subtitle="Bản ghi của đơn vị"
        actions={can('mau-module:write') ? <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Thêm</button> : undefined} />
      <div className="card card-body">
        <input className="input" placeholder="Tìm theo tiêu đề" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.isLoading ? <Loading /> : list.error ? <ErrorBox error={errorText(list.error)} /> : !list.data?.items.length ? <Empty /> : (
        <div className="card">
          <table className="grid">
            <thead><tr><th>Tiêu đề</th><th>Ghi chú</th><th>Lúc lập</th></tr></thead>
            <tbody>{list.data.items.map((r) => <tr key={r.id}><td>{r.title}</td><td>{r.note ?? ''}</td><td>{new Date(r.createdAt).toLocaleString('vi-VN')}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {open && (
        <Modal title="Thêm bản ghi" onClose={() => setOpen(false)}
          footer={<button type="button" className="btn btn-primary" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Đang lưu…' : 'Lưu'}</button>}>
          <Field label="Tiêu đề"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Ghi chú" full><textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {create.error ? <ErrorBox error={errorText(create.error)} /> : null}
        </Modal>
      )}
    </div>
  );
}
