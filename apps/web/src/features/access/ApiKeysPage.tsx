/**
 * Khoá API cho hệ thống bên ngoài gửi chứng từ / đọc báo cáo. Khoá chỉ hiện đầy đủ một lần lúc tạo.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Field, Loading, Modal } from '@/components/ui';

interface ApiKey { id: string; name: string; keyPrefix: string; scopes: string[]; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }
const SCOPES: [string, string][] = [['documents:write', 'Gửi chứng từ'], ['reports:read', 'Đọc báo cáo, sổ sách'], ['catalog:write', 'Tạo/sửa danh mục (chi nhánh, đối tượng)']];

export function ApiKeysPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['api-keys'], queryFn: () => api.get<ApiKey[]>('/api/v1/api-keys') });
  const revoke = useMutation({ mutationFn: (id: string) => api.delete(`/api/v1/api-keys/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: ['api-keys'] }) });

  return (
    <>
      <PageHeader title="Khoá API" code="HT02" subtitle="Cho hệ thống bán hàng và ứng dụng khác kết nối" helpKey="khoa-api"
        actions={<><a className="btn" href="/api/docs" target="_blank" rel="noreferrer">Tài liệu API</a><button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Tạo khoá</button></>} />
      {fresh && (
        <div className="alert alert-ok" style={{ marginBottom: 14 }}>
          <b>Khoá mới (chỉ hiện lần này, hãy sao chép ngay):</b>
          <div className="row" style={{ marginTop: 6 }}>
            <code className="mono" style={{ fontSize: 14 }}>{fresh}</code>
            <button className="btn btn-sm" onClick={() => void navigator.clipboard.writeText(fresh)}><Copy size={14} /> Sao chép</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setFresh(null)}>Đã lưu, ẩn đi</button>
          </div>
        </div>
      )}
      <div className="card">
        <ErrorBox error={q.error ? errorText(q.error) : revoke.error ? errorText(revoke.error) : null} />
        {q.isLoading ? <Loading /> : !q.data?.length ? <Empty text="Chưa có khoá API nào" /> : (
          <table className="grid">
            <thead><tr><th>Tên</th><th>Khoá</th><th>Phạm vi</th><th>Dùng gần nhất</th><th>Tạo lúc</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>
              {q.data.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td className="mono">{k.keyPrefix}…</td>
                  <td>{k.scopes.map((s) => <span key={s} className="badge badge-info" style={{ marginRight: 4 }}>{SCOPES.find(([c]) => c === s)?.[1] ?? s}</span>)}</td>
                  <td className="muted">{dateTime(k.lastUsedAt)}</td>
                  <td className="muted">{dateTime(k.createdAt)}</td>
                  <td>{k.revokedAt ? <span className="badge badge-gray">Đã thu hồi</span> : <span className="badge badge-ok">Hiệu lực</span>}</td>
                  <td>{!k.revokedAt && <button className="btn btn-sm btn-danger" onClick={() => window.confirm(`Thu hồi khoá "${k.name}"? Hệ thống đang dùng khoá này sẽ ngừng kết nối được.`) && revoke.mutate(k.id)}>Thu hồi</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating && <KeyForm onClose={() => setCreating(false)} onCreated={(key) => { setFresh(key); setCreating(false); }} />}
    </>
  );
}

function KeyForm({ onClose, onCreated }: { onClose: () => void; onCreated: (key: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['documents:write', 'reports:read']);
  const save = useMutation({
    mutationFn: () => api.post<{ key: string }>('/api/v1/api-keys', { name, scopes }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['api-keys'] }); onCreated(r.key); },
  });
  const toggle = (s: string) => setScopes((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));
  return (
    <Modal title="Tạo khoá API" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={save.isPending || !name || !scopes.length} onClick={() => save.mutate()}>Tạo</button></>}>
      <Field label="Tên (để nhận biết)" full><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Hệ thống bán hàng" /></Field>
      <Field label="Phạm vi" full>
        {SCOPES.map(([s, l]) => <label key={s} className="checkbox"><input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} /> {l}</label>)}
      </Field>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}
