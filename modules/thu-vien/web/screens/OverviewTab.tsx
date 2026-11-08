/** Tổng quan (26 §9, lớp "thư viện"): số thư viện, số mục, % đã duyệt, độ tươi; bảng thư viện cần chú ý. Lớp "sử dụng" / "module" có ở B2. */
import { Empty, ErrorBox, Loading, errorText, useApi, useQuery } from '@bizcity/ui-kit';
import { KIND_LABEL, attention, freshnessDays, healthSummary, type LibrarySummary } from '../lib/thu-vien';

export const today = () => new Date().toISOString().slice(0, 10);

export function useLibraries() {
  const api = useApi();
  return useQuery({ queryKey: ['thu-vien', 'list'], queryFn: () => api.get<{ items: LibrarySummary[] }>('/api/v1/libraries') });
}

export function OverviewTab({ onOpen }: { onOpen: (id: string) => void }) {
  const q = useLibraries();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const list = q.data?.items ?? [];
  if (!list.length) return <Empty text="Chưa có thư viện nào (thư mục libraries/ trống hoặc mọi thư viện lệch băm — xem nhật ký máy chủ)." />;
  const d = today();
  const h = healthSummary(list, d);
  const tiles: [string | number, string][] = [
    [h.libraries, 'thư viện đang phục vụ'],
    [h.items.toLocaleString('vi-VN'), 'mục'],
    [`${h.verifiedPct} %`, 'mục Nhóm Lõi đã duyệt'],
    [h.unverifiedLibs, 'thư viện còn mục chưa duyệt'],
    [h.stale, 'thư viện có bản cuối > 6 tháng'],
  ];
  return (
    <div>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, margin: '12px 0' }}>
        {tiles.map(([v, l]) => (
          <div key={l} className="card"><div className="card-body"><div style={{ fontSize: 22, fontWeight: 700 }}>{v}</div><div className="muted">{l}</div></div></div>
        ))}
      </div>
      <p className="muted">
        Số lượt dùng thư viện (qua / cảnh báo / chặn theo module, kênh) và kết luận ĐẠT / KHÔNG ĐẠT theo module có ở đợt B2 — bảng
        <code> library_usage_daily</code> (PHASE-030 · 26 §8–§9). Màn này chưa vẽ số sử dụng.
      </p>
      <div className="card">
        <table className="grid">
          <thead><tr><th>Thư viện</th><th>Loại</th><th>Bản</th><th>Mục</th><th>Đã duyệt</th><th>Độ tươi</th><th>Cần chú ý</th><th /></tr></thead>
          <tbody>
            {list.map((l) => {
              const att = attention(l, d);
              return (
                <tr key={l.id}>
                  <td><code>{l.id}</code><div className="muted">{l.title}</div></td>
                  <td>{KIND_LABEL[l.kind] ?? l.kind}</td>
                  <td><span className="badge badge-info">v{l.version}</span></td>
                  <td>{l.count.toLocaleString('vi-VN')}</td>
                  <td>{l.verified}/{l.count}</td>
                  <td>{freshnessDays(l.released, d)} ngày</td>
                  <td>{att.length ? att.map((a) => <span key={a} className="badge badge-warn" style={{ marginRight: 4 }}>{a}</span>) : <span className="badge badge-ok">ổn</span>}</td>
                  <td><button type="button" className="btn btn-xs" onClick={() => onOpen(l.id)}>Mở</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
