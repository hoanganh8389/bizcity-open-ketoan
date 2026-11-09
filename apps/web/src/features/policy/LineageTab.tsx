// [2026-11-09 02:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4b (S031-18): tab Truy vết — chứng từ → chính sách@bản, băm khớp / lệch, ngày ngoài hiệu lực
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { shortHash, type Lineage } from './api';

export function LineageTab({ initial }: { initial: string }) {
  const [doc, setDoc] = useState(initial);
  const [asked, setAsked] = useState(initial);
  const q = useQuery({
    queryKey: ['policy', 'lineage', asked],
    queryFn: () => api.get<Lineage>('/api/v1/policy-lineage', { docKey: asked }),
    enabled: asked.trim().length > 0, retry: false,
  });
  return (
    <div>
      <form className="row" style={{ gap: 8, marginBottom: 8 }} onSubmit={(e) => { e.preventDefault(); setAsked(doc.trim()); }}>
        <input className="input" placeholder="Khoá chứng từ (docKey), vd pos:CN01:HD0001" value={doc} onChange={(e) => setDoc(e.target.value)} style={{ maxWidth: 360 }} />
        <button type="submit" className="btn" disabled={!doc.trim()}>Truy vết</button>
      </form>
      {!asked ? <Empty text="Nhập khoá chứng từ để xem chứng từ này áp chính sách nào, bản nào" /> : q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : <Result d={q.data!} />}
    </div>
  );
}

function Result({ d }: { d: Lineage }) {
  const e = d.event;
  return (
    <div>
      <div className="card" style={{ padding: 10, marginBottom: 8 }}>
        <b className="mono">{e.docKey}</b> · {e.docType} · ngày {e.docDate ?? '—'} · nguồn {e.sourceSystem} · <span className="badge">{e.status}</span>
        {d.policyCheck?.checkedAt && <div className="muted" style={{ fontSize: 12 }}>Kiểm lúc nhận: {d.policyCheck.checkedAt} · chế độ {d.policyCheck.mode ?? '—'}</div>}
        {d.policyCheck?.findings?.map((f) => <span key={f.code} className="badge badge-warn" style={{ marginRight: 4 }} title={f.message}>{f.code}</span>)}
      </div>
      {d.refs.length === 0 ? <Empty text="Chứng từ này không gửi tham chiếu chính sách" /> : (
        <table className="grid">
          <thead><tr><th>Chính sách</th><th>Bản</th><th>Trong sổ đăng ký</th><th>Băm</th><th>Ngày chứng từ</th></tr></thead>
          <tbody>
            {d.refs.map((r) => (
              <tr key={`${r.key}-${r.version}`}>
                <td><b>{r.key}</b><div className="muted mono" style={{ fontSize: 11 }}>{r.policyId ?? ''}</div></td>
                <td>{r.version}</td>
                <td>{r.registered ? <span className="badge badge-ok">Có</span> : <span className="badge badge-warn">Không có</span>}</td>
                <td>{!r.registered ? '—' : r.hashMatches ? <span className="badge badge-ok">Khớp</span> : <span className="badge badge-warn" title={`gửi ${shortHash(r.sentHash)} ≠ sổ ${shortHash(r.registryHash)}`}>Lệch</span>}</td>
                <td>{r.covers == null ? '—' : r.covers ? <span className="badge badge-ok">Trong hiệu lực</span> : <span className="badge badge-warn">Ngoài hiệu lực ({r.effectiveFrom ?? 'từ đầu'} → {r.effectiveTo ?? 'nay'})</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
