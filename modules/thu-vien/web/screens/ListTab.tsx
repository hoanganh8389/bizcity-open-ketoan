/** Danh sách: thẻ từng thư viện — loại, bản, ngày phát hành, chủ duyệt, số mục, số đã duyệt (26 §3). */
import { Empty, ErrorBox, Loading, errorText } from '@bizcity/ui-kit';
import { KIND_LABEL, attention, shortHash } from '../lib/thu-vien';
import { today, useLibraries } from './OverviewTab';

export function ListTab({ onOpen }: { onOpen: (id: string) => void }) {
  const q = useLibraries();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const list = q.data?.items ?? [];
  if (!list.length) return <Empty text="Chưa có thư viện nào." />;
  const d = today();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginTop: 12 }}>
      {list.map((l) => (
        <div key={l.id} className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div><code>{l.id}</code> <span className="badge badge-info">v{l.version}</span></div>
            <strong>{l.title}</strong>
            <div className="muted">{KIND_LABEL[l.kind] ?? l.kind} · {l.count.toLocaleString('vi-VN')} mục · phát hành {l.released}</div>
            <div>Đã duyệt <strong>{l.verified}/{l.count}</strong> · chủ duyệt: {l.owner}</div>
            <div className="muted" style={{ fontSize: 12 }}>băm {shortHash(l.contentHash)}</div>
            <div>{attention(l, d).map((a) => <span key={a} className="badge badge-warn" style={{ marginRight: 4 }}>{a}</span>)}</div>
            <div><button type="button" className="btn btn-primary btn-xs" onClick={() => onOpen(l.id)}>Mở</button></div>
          </div>
        </div>
      ))}
    </div>
  );
}
