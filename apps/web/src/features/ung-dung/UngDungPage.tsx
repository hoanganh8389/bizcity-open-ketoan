/**
 * Ứng dụng kết nối (ADR-0011 mức 2): app ngoài tiến trình cài trong bản này; chủ đơn vị kết nối (đồng ý phạm vi), tắt / bật,
 * đồng ý phạm vi mới, xoay khoá. Khoá API và bí mật webhook chỉ hiện MỘT lần, như khoá API thường.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { SCOPE_LABELS, useApps, type AppDto } from './useApps';

type Secrets = { label: string; apiKey: string; webhookSecret: string | null };

function SecretRow({ name, value }: { name: string; value: string }) {
  return (
    <div className="row" style={{ marginTop: 6 }}>
      <span style={{ minWidth: 130 }}>{name}</span>
      <code className="mono" style={{ fontSize: 13 }}>{value}</code>
      <button className="btn btn-sm" onClick={() => void navigator.clipboard.writeText(value)}><Copy size={14} /> Sao chép</button>
    </div>
  );
}

export function UngDungPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const admin = can('users:write');
  const q = useApps();
  const [fresh, setFresh] = useState<Secrets | null>(null);
  const act = useMutation({
    mutationFn: ({ app, op }: { app: AppDto; op: 'install' | 'enable' | 'disable' | 'scope' | 'rotate' }) =>
      api.post<{ apiKey?: string; webhookSecret?: string | null }>(`/api/v1/apps/${app.key}/${op}`).then((r) => ({ r, app })),
    onSuccess: ({ r, app }) => {
      if (r.apiKey) setFresh({ label: app.label, apiKey: r.apiKey, webhookSecret: r.webhookSecret ?? null });
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
  });
  const scopeText = (list: string[]) => list.map((s) => `• ${SCOPE_LABELS[s] ?? s}`).join('\n') || '• (không xin quyền)';
  const install = (a: AppDto) => {
    const msg = `Kết nối app "${a.label}" với đơn vị?\n\nApp được:\n${scopeText(a.scopes)}${a.events.length ? `\n\nApp nhận sự kiện:\n${a.events.map((e) => `• ${e}`).join('\n')}` : ''}\n\nApp chạy ngoài phần mềm, chỉ gọi qua API bằng khoá riêng; chứng từ app nộp mang mã của app.`;
    if (window.confirm(msg)) act.mutate({ app: a, op: 'install' });
  };

  return (
    <>
      <PageHeader title="Ứng dụng kết nối" code="TI13" subtitle="App chạy riêng, kết nối qua API, webhook và khung nhúng" helpKey="ung-dung" />
      {fresh && (
        <div className="alert alert-ok" style={{ marginBottom: 14 }}>
          <b>Khoá của {fresh.label} (chỉ hiện lần này): nhập vào cấu hình của app rồi ẩn đi.</b>
          <SecretRow name="Khoá API" value={fresh.apiKey} />
          {fresh.webhookSecret && <SecretRow name="Bí mật webhook" value={fresh.webhookSecret} />}
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} onClick={() => setFresh(null)}>Đã lưu, ẩn đi</button>
        </div>
      )}
      <div className="card">
        <ErrorBox error={q.error ? errorText(q.error) : act.error ? errorText(act.error) : null} />
        {q.isLoading ? <Loading /> : !q.data?.length ? (
          <Empty text="Bản cài này chưa cài app ngoài nào. Người quản trị bản cài thêm manifest app vào apps/api/src/ung-dung/ rồi dựng lại." />
        ) : (
          <table className="grid">
            <thead><tr><th>App</th><th>Quyền xin</th><th>Sự kiện</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>
              {q.data.map((a) => {
                const inst = a.installation;
                return (
                  <tr key={a.key}>
                    <td>
                      <b>{a.label}</b> <span className="muted">{a.version}</span>
                      <div className="muted" style={{ fontSize: 12 }}>{a.description}</div>
                      {a.ui && <div className="muted" style={{ fontSize: 12 }}>Giao diện: {a.ui.origin}</div>}
                    </td>
                    <td>{a.scopes.map((s) => <span key={s} className="badge badge-info" style={{ marginRight: 4 }}>{SCOPE_LABELS[s] ?? s}</span>)}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{a.events.join(', ') || '—'}</td>
                    <td>
                      {!inst ? <span className="badge badge-gray">Chưa kết nối</span>
                        : inst.status === 'active' ? <span className="badge badge-ok">Đang bật</span> : <span className="badge badge-gray">Đang tắt</span>}
                      {inst && <div className="muted" style={{ fontSize: 12 }}>Từ {dateTime(inst.installedAt)}</div>}
                      {inst?.scopeChanged && <div className="badge badge-warn" style={{ marginTop: 4 }}>App xin phạm vi mới</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {inst?.status === 'active' && a.ui && <Link className="btn btn-sm" to={`/ung-dung/${a.key}`}>Mở</Link>}
                      {admin && !inst && <button className="btn btn-sm btn-primary" disabled={act.isPending} onClick={() => install(a)}>Kết nối</button>}
                      {admin && inst?.status === 'active' && (
                        <button className="btn btn-sm btn-danger" disabled={act.isPending}
                          onClick={() => window.confirm(`Tắt "${a.label}"? Khoá của app bị từ chối, webhook ngừng. Dữ liệu và bút toán app đã nộp giữ nguyên.`) && act.mutate({ app: a, op: 'disable' })}>Tắt</button>
                      )}
                      {admin && inst?.status === 'disabled' && <button className="btn btn-sm" disabled={act.isPending} onClick={() => act.mutate({ app: a, op: 'enable' })}>Bật lại</button>}
                      {admin && inst?.scopeChanged && (
                        <button className="btn btn-sm" disabled={act.isPending}
                          onClick={() => window.confirm(`Đồng ý phạm vi mới của "${a.label}"?\n\n${scopeText(a.scopes)}`) && act.mutate({ app: a, op: 'scope' })}>Đồng ý phạm vi mới</button>
                      )}
                      {admin && inst && (
                        <button className="btn btn-sm btn-ghost" disabled={act.isPending}
                          onClick={() => window.confirm(`Xoay khoá "${a.label}"? Khoá API và bí mật webhook cũ hết hiệu lực ngay; cần nhập khoá mới vào app.`) && act.mutate({ app: a, op: 'rotate' })}>Xoay khoá</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
