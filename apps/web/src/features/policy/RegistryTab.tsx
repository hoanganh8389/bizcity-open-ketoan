// [2026-11-09 02:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4b (S031-18): tab Chính sách — các bản theo thời gian, hiệu lực, phạm vi, băm, chứng từ đã áp
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { shortHash, useRegistry, type ApplicationRow, type RegistryPolicy } from './api';

const range = (a: string | null, b: string | null) => `${a ?? 'từ đầu'} → ${b ?? 'nay'}`;

function Applications({ policyId, version }: { policyId: string; version: number }) {
  const [cursor, setCursor] = useState<number[]>([]);
  const cur = cursor.at(-1);
  const q = useQuery({
    queryKey: ['policy', 'apps', policyId, version, cur],
    queryFn: () => api.get<{ items: ApplicationRow[]; next: number | null }>(`/api/v1/policy-registry/${encodeURIComponent(policyId)}/applications`, { version, limit: 20, ...(cur ? { cursor: cur } : {}) }),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const d = q.data!;
  return (
    <div style={{ marginTop: 6 }}>
      {d.items.length === 0 ? <Empty text="Chưa chứng từ nào gửi tham chiếu tới bản này" /> : (
        <table className="grid">
          <thead><tr><th>Chứng từ</th><th>Ngày</th><th>Nguồn</th><th>Kết quả kiểm</th></tr></thead>
          <tbody>
            {d.items.map((r) => (
              <tr key={r.eventId}>
                <td className="mono">{r.docKey}</td><td>{r.docDate ?? '—'}</td><td>{r.sourceSystem}</td>
                <td>{r.ok ? <span className="badge badge-ok">Đạt</span> : r.codes.map((c) => <span key={c} className="badge badge-warn" style={{ marginRight: 4 }}>{c}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <button type="button" className="btn btn-sm" disabled={!cursor.length} onClick={() => setCursor(cursor.slice(0, -1))}>Trang trước</button>
        <button type="button" className="btn btn-sm" disabled={d.next == null} onClick={() => setCursor([...cursor, d.next!])}>Trang sau</button>
      </div>
    </div>
  );
}

function Detail({ p }: { p: RegistryPolicy }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="card" style={{ padding: 10, marginBottom: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b>{p.policyKey}</b><span className="muted mono" style={{ fontSize: 12 }}>{p.policyId}</span>
        <span className="badge">{p.ruleContract}</span><span className="badge">{p.ownerModule}</span>
        {p.current != null ? <span className="badge badge-ok">Đang áp: bản {p.current}</span> : <span className="badge badge-warn">Hôm nay không có bản nào hiệu lực</span>}
        {p.gaps.length > 0 && <span className="badge badge-warn" title={p.gaps.map((g) => `${g.from} → ${g.to}`).join('; ')}>Khoảng trống {p.gaps.length}</span>}
        {p.expiresOn && <span className="badge badge-warn">Hết hạn {p.expiresOn}</span>}
      </div>
      <table className="grid" style={{ marginTop: 6 }}>
        <thead><tr><th style={{ width: 60 }}>Bản</th><th>Hiệu lực (theo ngày chứng từ)</th><th>Trạng thái</th><th>Băm</th><th className="num">Chứng từ đã áp</th><th>Người phát hành</th><th>Lý do</th></tr></thead>
        <tbody>
          {p.versions.map((v) => (
            <tr key={v.version}>
              <td><b>{v.version}</b></td><td>{range(v.effectiveFrom, v.effectiveTo)}</td>
              <td><span className={`badge ${v.status === 'published' ? 'badge-ok' : ''}`}>{v.status === 'published' ? 'Đã phát hành' : 'Đã ngừng'}</span></td>
              <td className="mono" title={v.contentHash}>{shortHash(v.contentHash)}</td>
              <td className="num">{v.applied > 0 ? <button type="button" className="btn btn-sm" onClick={() => setOpen(open === v.version ? null : v.version)}>{v.applied}</button> : 0}</td>
              <td className="muted">{v.publishedBy}</td><td className="muted">{v.reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {open != null && <Applications policyId={p.policyId} version={open} />}
    </div>
  );
}

export function RegistryTab() {
  const [q, setQ] = useState('');
  const r = useRegistry(q);
  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <input className="input" placeholder="Tìm theo mã chính sách…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        <span className="muted" style={{ fontSize: 12 }}>Chỉ đọc. Phát hành bản mới đi qua module chủ hoặc API.</span>
      </div>
      {r.isLoading ? <Loading /> : r.error ? <ErrorBox error={errorText(r.error)} /> : r.data!.items.length === 0
        ? <Empty text={q ? 'Không có chính sách khớp từ khoá' : 'Chưa có chính sách nào được phát hành'} />
        : r.data!.items.map((p) => <Detail key={p.policyId} p={p} />)}
    </div>
  );
}
