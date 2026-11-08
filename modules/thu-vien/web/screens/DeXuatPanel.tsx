/**
 * Thẻ Đề xuất của Chi tiết thư viện (B3b, PHASE-030 · 26 §5): đơn vị gửi Nhóm Lõi đề xuất thêm mục, sửa giá trị, căn cứ, báo sai, ngừng dùng.
 * Trạng thái gửi → nhận → đã vào bản | từ chối; người gửi rút được. Không đổi thư viện gốc; cần giá trị ngay thì ghi đè ở thẻ Cấu hình.
 */
import { useState } from 'react';
import { ErrorBox, Field, Loading, errorText, useApi, useCan, useMutation, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { PROPOSAL_KIND_LABEL, PROPOSAL_STATUS_LABEL, type LibraryEnvelope, type Proposal } from '../lib/thu-vien';

export function DeXuatPanel({ lib }: { lib: LibraryEnvelope }) {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['thu-vien', 'proposals', lib.id], queryFn: () => api.get<{ items: Proposal[] }>('/api/v1/libraries/proposals', { library: lib.id }) });
  const [kind, setKind] = useState<Proposal['kind']>('sua-gia-tri');
  const [itemCode, setItemCode] = useState('');
  const [content, setContent] = useState('');
  const [basisKey, setBasisKey] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['thu-vien', 'proposals', lib.id] });
  const send = useMutation({
    mutationFn: () => api.post(`/api/v1/libraries/${encodeURIComponent(lib.id)}/proposals`, {
      kind, content, ...(itemCode.trim() ? { itemCode: itemCode.trim() } : {}), ...(basisKey.trim() ? { basisKey: basisKey.trim() } : {}),
    }),
    onSuccess: () => { setContent(''); setItemCode(''); setBasisKey(''); void refresh(); },
  });
  const move = useMutation({
    mutationFn: (p: { id: string; status: Proposal['status']; resolvedVersion?: string }) => api.post(`/api/v1/libraries/proposals/${p.id}/status`, { status: p.status, ...(p.resolvedVersion ? { resolvedVersion: p.resolvedVersion } : {}) }),
    onSuccess: () => void refresh(),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const canWrite = can('catalog:write');
  const canResolve = can('settings:write');
  return (
    <div className="card"><div className="card-body">
      <p className="muted" style={{ marginTop: 0 }}>Đề xuất gửi Nhóm Lõi; thư viện gốc chỉ đổi ở bản phát hành sau. Cần dùng giá trị khác ngay thì ghi đè ở thẻ Cấu hình. Không ghi dữ liệu khách hay số tiền chứng từ vào đề xuất.</p>
      <table className="grid">
        <thead><tr><th>Số</th><th>Loại</th><th>Mục</th><th>Nội dung</th><th>Căn cứ</th><th>Người gửi</th><th>Trạng thái</th><th /></tr></thead>
        <tbody>{q.data!.items.map((p) => (
          <tr key={p.id}>
            <td>{p.id}</td><td>{PROPOSAL_KIND_LABEL[p.kind]}</td><td>{p.itemCode ? <code>{p.itemCode}</code> : '—'}</td><td>{p.content}</td>
            <td>{p.basisKey ? <code>{p.basisKey}</code> : '—'}</td><td>{p.createdBy} · {p.createdAt.slice(0, 10)}</td>
            <td><span className={`badge ${PROPOSAL_STATUS_LABEL[p.status].badge}`}>{PROPOSAL_STATUS_LABEL[p.status].text}{p.resolvedVersion ? ` ${p.resolvedVersion}` : ''}</span>{p.statusNote ? <div className="muted">{p.statusNote}</div> : null}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              {canWrite && (p.status === 'gui' || p.status === 'nhan') ? <button type="button" className="btn btn-xs" onClick={() => move.mutate({ id: p.id, status: 'rut' })}>Rút</button> : null}
              {canResolve && p.status === 'gui' ? <button type="button" className="btn btn-xs" style={{ marginLeft: 4 }} onClick={() => move.mutate({ id: p.id, status: 'nhan' })}>Nhận</button> : null}
              {canResolve && p.status === 'nhan' ? <button type="button" className="btn btn-xs" style={{ marginLeft: 4 }} onClick={() => { const v = window.prompt('Bản thư viện đã đưa vào (vd 1.1.0)'); if (v) move.mutate({ id: p.id, status: 'da-vao', resolvedVersion: v.trim() }); }}>Đã vào bản</button> : null}
              {canResolve && (p.status === 'gui' || p.status === 'nhan') ? <button type="button" className="btn btn-xs" style={{ marginLeft: 4 }} onClick={() => move.mutate({ id: p.id, status: 'tu-choi' })}>Từ chối</button> : null}
            </td>
          </tr>
        ))}</tbody>
      </table>
      {!q.data!.items.length ? <p className="muted">Chưa có đề xuất nào cho thư viện này.</p> : null}
      {move.error ? <ErrorBox error={errorText(move.error)} /> : null}
      {canWrite ? (<>
        <h4>Gửi đề xuất mới</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <Field label="Loại"><select className="input" value={kind} onChange={(e) => setKind(e.target.value as Proposal['kind'])}>
            {Object.entries(PROPOSAL_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></Field>
          <Field label="Mã mục" hint={kind === 'them-muc' ? 'Để trống khi thêm mục mới.' : 'Bắt buộc.'}><input className="input" value={itemCode} onChange={(e) => setItemCode(e.target.value)} /></Field>
          <Field label="Căn cứ (tuỳ chọn)" hint="Mã / bí danh trong vn.can-cu-phap-ly, vd TT99."><input className="input" value={basisKey} onChange={(e) => setBasisKey(e.target.value)} /></Field>
        </div>
        <Field label="Nội dung" full><textarea className="input" rows={3} style={{ width: '100%' }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="vd: thêm 2026-09-01, 2026-09-02 — nghỉ Quốc khánh theo thông báo …" /></Field>
        <button type="button" className="btn btn-primary" disabled={content.trim().length < 5 || send.isPending} onClick={() => send.mutate()}>Gửi đề xuất</button>
        {send.error ? <ErrorBox error={errorText(send.error)} /> : null}
      </>) : null}
    </div></div>
  );
}
