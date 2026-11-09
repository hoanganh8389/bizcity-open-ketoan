/**
 * Tổng quan (26 §9): lớp "thư viện" (số mục, % duyệt, độ tươi) và lớp "sử dụng" (B2 — core.library.usage, 30 ngày: qua / cảnh báo /
 * chặn theo thư viện, theo nguồn, mã phát hiện nhiều nhất, mã lạ). Kết luận ĐẠT / KHÔNG ĐẠT theo module cần độ phủ trường khai
 * trong manifest — có ở B5; ở đây chỉ hiện điều số liệu chứng minh được.
 */
import { Empty, ErrorBox, Loading, errorText, useApi, useQuery } from '@bizcity/ui-kit';
import { ModulesPanel } from './ModulesPanel';
import {
  KIND_LABEL, attention, freshnessDays, healthSummary, sourceStatus, usagePct, usageTotal,
  type LibrarySummary, type UsageCounts, type UsageReport,
} from '../lib/thu-vien';

export const today = () => new Date().toISOString().slice(0, 10);

export function useLibraries() {
  const api = useApi();
  return useQuery({ queryKey: ['thu-vien', 'list'], queryFn: () => api.get<{ items: LibrarySummary[] }>('/api/v1/libraries') });
}

function useUsage() {
  const api = useApi();
  return useQuery({ queryKey: ['thu-vien', 'usage'], queryFn: () => api.get<UsageReport>('/api/v1/libraries/usage') });
}

const LEVEL: Record<'pass' | 'warn' | 'block', { badge: string; text: string }> = {
  pass: { badge: 'badge-ok', text: 'qua' }, warn: { badge: 'badge-warn', text: '⚠ cảnh báo' }, block: { badge: 'badge-bad', text: '✘ chặn' },
};

/** Thanh qua / cảnh báo / chặn (màu kèm số — không dựa riêng vào màu). */
function UsageBar({ u }: { u: UsageCounts }) {
  const t = usageTotal(u);
  if (!t) return <span className="muted">chưa có lượt</span>;
  const w = (n: number) => `${(n * 100) / t}%`;
  return (
    <div title={`${u.pass} qua · ${u.warn} cảnh báo · ${u.block} chặn`}>
      <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', background: '#eef1f5', minWidth: 120 }}>
        <i style={{ width: w(u.pass), background: '#1a7f4b' }} /><i style={{ width: w(u.warn), background: '#b26a00' }} /><i style={{ width: w(u.block), background: '#c62828' }} />
      </div>
      <span className="muted" style={{ fontSize: 12 }}>{t.toLocaleString('vi-VN')} lượt · {usagePct(u.pass, u)} % qua{u.block ? ` · ${u.block} chặn` : ''}</span>
    </div>
  );
}

export function OverviewTab({ onOpen }: { onOpen: (id: string) => void }) {
  const q = useLibraries();
  const usage = useUsage();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const list = q.data?.items ?? [];
  if (!list.length) return <Empty text="Chưa có thư viện nào (thư mục libraries/ trống hoặc mọi thư viện lệch băm — xem nhật ký máy chủ)." />;
  const d = today();
  const h = healthSummary(list, d);
  const u = usage.data;
  const total = u?.total ?? { pass: 0, warn: 0, block: 0 };
  const passPct = usagePct(total.pass, total);
  const tiles: [string | number, string][] = [
    [h.libraries, 'thư viện đang phục vụ'],
    [h.items.toLocaleString('vi-VN'), 'mục'],
    [`${h.verifiedPct} %`, 'mục Nhóm Lõi đã duyệt'],
    [usageTotal(total).toLocaleString('vi-VN'), 'lượt kiểm 30 ngày'],
    [passPct === null ? '—' : `${passPct} %`, 'lượt qua thư viện'],
    [h.unverifiedLibs, 'thư viện còn mục chưa duyệt'],
  ];
  const byLib = new Map((u?.byLibrary ?? []).map((r) => [r.libraryId, r]));
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, margin: '12px 0' }}>
        {tiles.map(([v, l]) => (
          <div key={l} className="card"><div className="card-body"><div style={{ fontSize: 22, fontWeight: 700 }}>{v}</div><div className="muted">{l}</div></div></div>
        ))}
      </div>
      {usage.error ? <ErrorBox error={`Không đọc được số liệu sử dụng: ${errorText(usage.error)}`} /> : null}

      <h3>Theo thư viện</h3>
      <div className="card">
        <table className="grid">
          <thead><tr><th>Thư viện</th><th>Loại</th><th>Bản</th><th>Mục</th><th>Đã duyệt</th><th>Độ tươi</th><th>Lượt 30 ngày</th><th>Cần chú ý</th><th /></tr></thead>
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
                  <td>{usage.isLoading ? '…' : <UsageBar u={byLib.get(l.id) ?? { pass: 0, warn: 0, block: 0 }} />}</td>
                  <td>{att.length ? att.map((a) => <span key={a} className="badge badge-warn" style={{ marginRight: 4 }}>{a}</span>) : <span className="badge badge-ok">ổn</span>}</td>
                  <td><button type="button" className="btn btn-xs" onClick={() => onOpen(l.id)}>Mở</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>Theo nguồn (module / kênh)</h3>
      {!u?.bySource.length ? <p className="muted">Chưa nguồn nào gọi bộ kiểm trong 30 ngày. Module / app gửi <code>source</code> khi gọi <code>POST /api/v1/libraries/:id/validate</code> để hiện ở đây.</p> : (
        <div className="card">
          <table className="grid">
            <thead><tr><th>Nguồn</th><th>Thư viện</th><th>Kết quả 30 ngày</th><th>Tình trạng</th></tr></thead>
            <tbody>{u.bySource.map((s) => {
              const st = sourceStatus(s);
              return (
                <tr key={`${s.source}|${s.libraryId}`}>
                  <td><code>{s.source}</code></td><td><code>{s.libraryId}</code></td><td><UsageBar u={s} /></td>
                  <td><span className={`badge ${st.badge}`}>{st.text}</span></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      <h3>Theo module — kết luận</h3>
      <ModulesPanel onOpen={onOpen} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginTop: 12 }}>
        <div className="card"><div className="card-body">
          <h3 style={{ marginTop: 0 }}>Mã phát hiện nhiều nhất</h3>
          {!u?.topFindings.length ? <p className="muted">Chưa có.</p> : (
            <table className="grid"><thead><tr><th>Mã</th><th>Mức</th><th>Thư viện</th><th>Lượt</th></tr></thead>
              <tbody>{u.topFindings.map((f) => (
                <tr key={`${f.code}|${f.libraryId}|${f.outcome}`}><td><code>{f.code}</code></td><td><span className={`badge ${LEVEL[f.outcome].badge}`}>{LEVEL[f.outcome].text}</span></td><td><code>{f.libraryId}</code></td><td>{f.count.toLocaleString('vi-VN')}</td></tr>
              ))}</tbody></table>
          )}
        </div></div>
        <div className="card"><div className="card-body">
          <h3 style={{ marginTop: 0 }}>Mã lạ — ứng viên bổ sung thư viện</h3>
          <p className="muted" style={{ marginTop: 0 }}>Lượt nhập mã không có trong thư viện (<code>LIB-UNKNOWN-001</code>). Chỉ đếm — không lưu chữ người nhập.</p>
          {!u?.unknown.length ? <p className="muted">Chưa có.</p> : (
            <table className="grid"><thead><tr><th>Thư viện</th><th>Nguồn</th><th>Lượt</th></tr></thead>
              <tbody>{u.unknown.map((x) => <tr key={`${x.libraryId}|${x.source}`}><td><code>{x.libraryId}</code></td><td><code>{x.source}</code></td><td>{x.count.toLocaleString('vi-VN')}</td></tr>)}</tbody></table>
          )}
        </div></div>
      </div>
    </div>
  );
}
