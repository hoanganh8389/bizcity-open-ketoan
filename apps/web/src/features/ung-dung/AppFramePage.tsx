/**
 * Trang nhúng một app ngoài tiến trình: /ung-dung/<key> (ADR-0011 mức 2). App phải đang kết nối và có ui.origin.
 */
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { AppFrame, type AppToast } from './AppFrame';
import { useApps } from './useApps';

export function AppFramePage() {
  const { key = '' } = useParams();
  const q = useApps();
  const [toast, setToast] = useState<AppToast | null>(null);
  const onToast = useCallback((t: AppToast) => setToast(t), []);
  const app = q.data?.find((a) => a.key === key);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  if (!app) return <div className="alert alert-bad">Bản cài này không có app "{key}".</div>;
  if (!app.ui) return <div className="alert alert-info">App {app.label} không có giao diện nhúng.</div>;
  if (app.installation?.status !== 'active') {
    return <div className="alert alert-info">App {app.label} chưa kết nối hoặc đang tắt cho đơn vị. Xem <Link to="/tien-ich/ung-dung">Ứng dụng kết nối</Link>.</div>;
  }
  return (
    <>
      <PageHeader title={app.label} subtitle={`${app.description} · chạy tại ${app.ui.origin}`} />
      {toast && (
        <div className={`alert ${toast.kind === 'ok' ? 'alert-ok' : toast.kind === 'bad' ? 'alert-bad' : 'alert-info'}`} style={{ marginBottom: 10 }}>
          <b>{app.label}:</b> {toast.text}
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: 8 }} onClick={() => setToast(null)}>Ẩn</button>
        </div>
      )}
      <div className="card" style={{ padding: 0 }}>
        <AppFrame appKey={app.key} label={app.label} origin={app.ui.origin} url={`${app.ui.origin}${app.ui.entry}`} onToast={onToast} />
      </div>
    </>
  );
}
