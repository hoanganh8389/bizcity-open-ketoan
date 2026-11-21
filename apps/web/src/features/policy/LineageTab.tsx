// [2026-11-09 02:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4b (S031-18): tab Truy vết — chứng từ → chính sách@bản, băm khớp / lệch, ngày ngoài hiệu lực
// [2026-11-21 10:00 AM Võ Hoàng] PHASE-031 — S031-23: tab Truy vết đọc làn `policy` của bizcity_lineage@1 (GET /api/v1/lineage/policy) — thêm người phát hành, căn cứ, kết quả L4b, dòng chứng từ, dòng sổ; người không có ledger:read vẫn xem bản rút gọn cũ
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LineagePolicyVerdict, PolicyLineage } from '@ketoan/contracts';
import { Empty, ErrorBox, Loading, Money } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { shortHash, type Lineage } from './api';

export function LineageTab({ initial }: { initial: string }) {
  const { can } = useAuth();
  const full = can('ledger:read');
  const [doc, setDoc] = useState(initial);
  const [asked, setAsked] = useState(initial);
  const enabled = asked.trim().length > 0;
  const q = useQuery({
    queryKey: ['policy', 'lineage', asked],
    queryFn: () => api.get<Lineage>('/api/v1/policy-lineage', { docKey: asked }),
    enabled: enabled && !full, retry: false,
  });
  const qf = useQuery({
    queryKey: ['policy', 'lineage-full', asked],
    queryFn: () => api.get<PolicyLineage>('/api/v1/lineage/policy', { docKey: asked }),
    enabled: enabled && full, retry: false,
  });
  const cur = full ? qf : q;
  return (
    <div>
      <form className="row" style={{ gap: 8, marginBottom: 8 }} onSubmit={(e) => { e.preventDefault(); setAsked(doc.trim()); }}>
        <input className="input" placeholder="Khoá chứng từ (docKey), vd pos:CN01:HD0001" value={doc} onChange={(e) => setDoc(e.target.value)} style={{ maxWidth: 360 }} />
        <button type="submit" className="btn" disabled={!doc.trim()}>Truy vết</button>
      </form>
      {!asked ? <Empty text="Nhập khoá chứng từ để xem chứng từ này áp chính sách nào, bản nào" />
        : cur.isLoading ? <Loading /> : cur.error ? <ErrorBox error={errorText(cur.error)} />
          : full ? <FullResult d={qf.data!} /> : <Result d={q.data!} />}
    </div>
  );
}

const VERDICT: Record<LineagePolicyVerdict, { text: string; cls: string }> = {
  pass: { text: 'L4b đạt', cls: 'badge-ok' },
  warn: { text: 'L4b cảnh báo', cls: 'badge-warn' },
  none: { text: 'chưa kiểm', cls: '' },
};

/** Chuỗi ngược đầy đủ (bizcity_lineage@1 0.4.0, làn policy): sự việc → chính sách@bản → phát hành; dòng chứng từ; dòng sổ. */
function FullResult({ d }: { d: PolicyLineage }) {
  const e = d.event;
  const v = VERDICT[d.check.verdict];
  return (
    <div>
      <div className="card" style={{ padding: 10, marginBottom: 8 }}>
        <b className="mono">{e.docKey}</b> · {e.docNo} · {e.docType} · ngày {e.docDate ?? '—'} · chi nhánh {e.branch || '—'} · nguồn {e.sourceSystem} · <span className="badge">{e.status}</span>
        {' '}<span className={`badge ${v.cls}`}>{v.text}</span>
        {d.check.codes.map((c) => <span key={c} className="badge badge-warn" style={{ marginLeft: 4 }}>{c}</span>)}
        {d.check.checkedAt && <div className="muted" style={{ fontSize: 12 }}>Kiểm lúc nhận: {dateTime(d.check.checkedAt)} · chế độ {d.check.mode ?? '—'}</div>}
      </div>
      {d.notes.map((n, i) => <div key={i} className="alert alert-warn" style={{ margin: '4px 0' }}>{n}</div>)}
      {d.refs.length > 0 && (
        <table className="grid" style={{ marginBottom: 8 }}>
          <thead><tr><th>Chính sách</th><th>Bản</th><th>Trong sổ đăng ký</th><th>Băm</th><th>Ngày chứng từ</th><th>Phát hành</th><th>Căn cứ</th><th>L4b</th></tr></thead>
          <tbody>
            {d.refs.map((r) => (
              <tr key={`${r.key}-${r.version}`}>
                <td><b>{r.key}</b><div className="muted mono" style={{ fontSize: 11 }}>{r.policyId ?? ''}{r.ruleContract ? ` · ${r.ruleContract}` : ''}</div>{r.lines.length > 0 && <div className="muted" style={{ fontSize: 11 }}>dòng {r.lines.join(', ')}</div>}</td>
                <td>{r.version}</td>
                <td>{r.registered ? <span className="badge badge-ok">Có{r.status === 'retired' ? ' · đã ngừng' : ''}</span> : <span className="badge badge-warn">Không có</span>}</td>
                <td>{!r.registered ? '—' : r.hashMatches === null ? <span className="muted">nguồn không gửi</span> : r.hashMatches ? <span className="badge badge-ok">Khớp</span> : <span className="badge badge-warn" title={`gửi ${shortHash(r.sentHash ?? '')} ≠ sổ ${shortHash(r.registryHash)}`}>Lệch</span>}</td>
                <td>{r.covers == null ? '—' : r.covers ? <span className="badge badge-ok">Trong hiệu lực</span> : <span className="badge badge-warn">Ngoài hiệu lực ({r.effectiveFrom ?? 'từ đầu'} → {r.effectiveTo ?? 'nay'})</span>}</td>
                <td>{r.publishedBy ?? '—'}{r.publishedAt && <div className="muted" style={{ fontSize: 11 }}>{dateTime(r.publishedAt)}</div>}{r.reason && <div className="muted" style={{ fontSize: 11 }}>{r.reason}</div>}</td>
                <td>{r.legalRef ?? '—'}</td>
                <td><span className={`badge ${VERDICT[r.verdict].cls}`}>{VERDICT[r.verdict].text}</span>{r.codes.map((c) => <div key={c} className="muted" style={{ fontSize: 11 }}>{c}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {d.lines.length > 0 && (
        <>
          <h4 style={{ margin: '8px 0 4px' }}>Dòng chứng từ</h4>
          <table className="grid" style={{ marginBottom: 8 }}>
            <thead><tr><th>Dòng</th><th>Mã hàng</th><th className="num">Số lượng</th><th>Chính sách của dòng</th></tr></thead>
            <tbody>{d.lines.map((l) => (
              <tr key={l.lineNo}><td>{l.lineKey ?? l.lineNo}</td><td>{l.sku}{l.isGift && <span className="badge" style={{ marginLeft: 4 }}>quà</span>}</td><td className="num">{l.qty.toLocaleString('vi-VN')}</td>
                <td>{l.policy ? <>{l.isGift ? 'tặng theo ' : 'theo '}<b>{l.policy.key}@{l.policy.version}</b>{l.policy.line ? <span className="muted"> ({l.policy.line})</span> : null}</> : <span className="muted">—</span>}</td></tr>
            ))}</tbody>
          </table>
        </>
      )}
      {d.entries.length > 0 && (
        <>
          <h4 style={{ margin: '8px 0 4px' }}>Dòng sổ của sự việc</h4>
          <table className="grid">
            <thead><tr><th>Bút toán</th><th>Ngày</th><th>Tài khoản</th><th className="num">Nợ</th><th className="num">Có</th><th>Mã hàng</th><th>Chính sách nghiệp vụ</th><th>Bản chính sách định khoản</th></tr></thead>
            <tbody>{d.entries.map((x, i) => (
              <tr key={i}><td>{x.entryNo}{x.status !== 'posted' ? <span className="muted"> ({x.status === 'reversed' ? 'đã đảo' : 'bút toán đảo'})</span> : null}</td><td>{x.postingDate}</td><td>{x.account}</td>
                <td className="num"><Money value={x.debit} /></td><td className="num"><Money value={x.credit} /></td><td>{x.sku ?? ''}</td>
                <td>{x.policy ? `${x.policy.key}@${x.policy.version}` : <span className="muted">—</span>}</td><td>{x.postingPolicyVersion ?? '—'}</td></tr>
            ))}</tbody>
          </table>
        </>
      )}
    </div>
  );
}

/** Bản rút gọn cho người chỉ có catalog:read (không xem được dòng sổ). */
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
