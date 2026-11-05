// [2026-11-05 11:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E1 (S029-30): thẻ Nền móng ở HT10 — sáu năng lực lõi, ma trận 17 trụ cột, ECP × trụ cột, tín hiệu kiểm (bản mẫu mockups/ma-tran-nen-mong.html, ADR-0028)
/**
 * NỀN MÓNG (thẻ trong HT10). Nguồn: docs/standard/nen-mong.json (bizcity_foundations@1) qua GET /api/v1/system/foundations.
 * Chỉ đọc: mức đạt đi theo tín hiệu chạy được (check / chẩn đoán / test) — SC-CORE-1 chặn ghi "đạt" khi còn tín hiệu "chưa có".
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ErrorBox, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { STATUS_UI, type PillarStatus } from './PillarsPage';

type SignalState = 'co' | 'nhanh' | 'chua';
interface Signal { kind: 'check' | 'diag' | 'test'; ref: string; state: SignalState }
interface Core { id: string; key: string; title: string; duty: string; layer: string; code: string[]; contracts: string[]; capabilities: string[]; devGets: string; sdk: string; status: PillarStatus; gap: string }
interface FPillar { id: string; group: string; core: string; title: string; status: PillarStatus; ecp: string[]; next: string; signals: Signal[] }
interface Lean { id: string; title: string; rule: string; enforcedBy: string }
interface Board { contract: string; version: string; updated: string; lean: Lean[]; cores: Core[]; groups: { id: string; title: string }[]; pillars: FPillar[]; ecp: { id: string; text: string }[] }

const SIGNAL_UI: Record<SignalState, { text: string; cls: string; color: string }> = {
  co: { text: 'chạy được', cls: 'badge-ok', color: 'var(--ok, #1a7f4b)' },
  nhanh: { text: 'ở nhánh', cls: 'badge-info', color: 'var(--brand-600, #6a3fb5)' },
  chua: { text: 'chưa có', cls: 'badge-bad', color: 'var(--bad, #c62828)' },
};
const VIEWS = [['cores', 'Sáu năng lực lõi'], ['matrix', 'Ma trận 17 trụ cột'], ['ecp', 'ECP × trụ cột'], ['signals', 'Tín hiệu kiểm'], ['lean', 'Tinh gọn & SDK']] as const;
type View = (typeof VIEWS)[number][0];

const count = (sigs: Signal[]) => ({ co: sigs.filter((s) => s.state === 'co').length, nhanh: sigs.filter((s) => s.state === 'nhanh').length, chua: sigs.filter((s) => s.state === 'chua').length, n: sigs.length });

function SignalBar({ sigs }: { sigs: Signal[] }) {
  const c = count(sigs);
  return (
    <div title={`${c.co} chạy được · ${c.nhanh} ở nhánh · ${c.chua} chưa có`} style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--line, #e6ebf2)', minWidth: 90 }}>
      {(['co', 'nhanh', 'chua'] as const).map((k) => <div key={k} style={{ width: `${c.n ? (c[k] / c.n) * 100 : 0}%`, background: SIGNAL_UI[k].color }} />)}
    </div>
  );
}
const Status = ({ s }: { s: PillarStatus }) => <span className={`badge ${STATUS_UI[s].cls}`}>{STATUS_UI[s].text}</span>;

export function FoundationsBoard() {
  const q = useQuery({ queryKey: ['system', 'foundations'], queryFn: () => api.get<Board>('/api/v1/system/foundations'), staleTime: 5 * 60_000 });
  const [view, setView] = useState<View>('cores');
  const [group, setGroup] = useState('');
  const [sel, setSel] = useState('');
  const [sigFilter, setSigFilter] = useState<SignalState | ''>('');
  const b = q.data;
  const allSig = useMemo(() => (b ? b.pillars.flatMap((p) => p.signals.map((s) => ({ ...s, pillar: p }))) : []), [b]);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  if (!b) return null;
  const coreName = (id: string) => (id === 'SDK' ? 'Bề mặt SDK' : b.cores.find((c) => c.id === id)?.title ?? id);
  const cols = [...b.cores.map((c) => c.id), 'SDK'];
  const tot = count(allSig);
  const picked = b.pillars.find((p) => p.id === sel);

  return (
    <div className="foundations">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, marginBottom: 10 }}>
        {[['Trụ cột đạt', `${b.pillars.filter((p) => p.status === 'dat').length} / ${b.pillars.length}`], ['Năng lực lõi đạt', `${b.cores.filter((c) => c.status === 'dat').length} / ${b.cores.length}`], ['Tín hiệu chạy được', `${tot.co} / ${tot.n}`], ['Tín hiệu chưa có', String(tot.chua)]].map(([k, v]) => (
          <div key={k} className="card" style={{ padding: '8px 10px' }}><div className="muted" style={{ fontSize: 12 }}>{k}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div></div>
        ))}
      </div>
      <div className="tabs" role="tablist" style={{ marginBottom: 10 }}>
        {VIEWS.map(([k, t]) => <button key={k} type="button" role="tab" className={`tab ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>{t}</button>)}
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>{b.contract} · {b.version} · cập nhật {b.updated} · SC-CORE-1 giữ khớp repo</span>
      </div>

      {view === 'cores' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
          {b.cores.map((c) => {
            const ps = b.pillars.filter((p) => p.core === c.id);
            const sigs = ps.flatMap((p) => p.signals);
            const n = count(sigs);
            return (
              <div key={c.id} className="card" style={{ padding: '10px 12px' }}>
                <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><span className="badge">{c.id}</span><b>{c.title}</b><Status s={c.status} /></div>
                <div style={{ margin: '6px 0' }}>{c.duty}</div>
                <SignalBar sigs={sigs} />
                <div className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>{n.co}/{n.n} tín hiệu chạy được · trụ cột {ps.map((p) => p.id).join(', ') || '—'}</div>
                <dl style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '2px 8px', fontSize: 12.5, margin: 0 }}>
                  <dt className="muted">Lớp</dt><dd style={{ margin: 0 }}>{c.layer}</dd>
                  <dt className="muted">Dev nhận sẵn</dt><dd style={{ margin: 0 }}>{c.devGets}</dd>
                  <dt className="muted">Gọi bằng</dt><dd className="mono" style={{ margin: 0, overflowWrap: 'anywhere' }}>{c.sdk}</dd>
                  <dt className="muted">Hợp đồng</dt><dd style={{ margin: 0 }}>{c.contracts.join(' · ')}</dd>
                  <dt className="muted">Mã</dt><dd className="mono" style={{ margin: 0, overflowWrap: 'anywhere' }}>{c.code.join(' · ')}</dd>
                  <dt className="muted">Khoảng cách</dt><dd style={{ margin: 0 }}>{c.gap}</dd>
                </dl>
              </div>
            );
          })}
        </div>
      )}

      {view === 'matrix' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 340px)', gap: 10, alignItems: 'start' }}>
          <div>
            <div className="row" style={{ gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <button type="button" className={`btn btn-sm ${!group ? 'btn-primary' : ''}`} onClick={() => setGroup('')}>Mọi nhóm</button>
              {b.groups.map((g) => <button key={g.id} type="button" className={`btn btn-sm ${group === g.id ? 'btn-primary' : ''}`} onClick={() => setGroup(g.id)} title={g.title}>{g.id}</button>)}
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>#</th><th>Trụ cột</th>{cols.map((c) => <th key={c} title={coreName(c)} style={{ textAlign: 'center' }}>{c}</th>)}<th>Mức</th><th>Tín hiệu</th><th>ECP</th></tr></thead>
                <tbody>
                  {b.groups.filter((g) => !group || g.id === group).flatMap((g) => [
                    <tr key={`g-${g.id}`}><td colSpan={cols.length + 5} style={{ background: 'var(--surface-2, #f2f6fb)', fontWeight: 700 }}>{g.id} · {g.title}</td></tr>,
                    ...b.pillars.filter((p) => p.group === g.id).map((p) => (
                      <tr key={p.id} onClick={() => setSel(p.id)} style={{ cursor: 'pointer', background: sel === p.id ? 'var(--brand-50, #e3edfb)' : undefined }}>
                        <td>{p.id}</td><td>{p.title}</td>
                        {cols.map((c) => <td key={c} style={{ textAlign: 'center' }}>{p.core === c ? '●' : ''}</td>)}
                        <td><Status s={p.status} /></td><td><SignalBar sigs={p.signals} /></td>
                        <td className="mono" style={{ fontSize: 11 }}>{p.ecp.map((e) => e.slice(4)).join(' ')}</td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card" style={{ padding: '10px 12px' }}>
            {!picked ? <div className="muted">Bấm một trụ cột để xem tín hiệu kiểm, nguyên tắc, việc kế tiếp.</div> : (
              <>
                <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><b>{picked.id} · {picked.title}</b><Status s={picked.status} /></div>
                <div className="muted" style={{ fontSize: 12, margin: '4px 0' }}>Năng lực lõi: {coreName(picked.core)} · việc kế tiếp <span className="mono">{picked.next}</span></div>
                <table className="grid" style={{ fontSize: 12 }}><tbody>
                  {picked.signals.map((s) => <tr key={s.kind + s.ref}><td><span className={`badge ${SIGNAL_UI[s.state].cls}`}>{SIGNAL_UI[s.state].text}</span></td><td className="muted">{s.kind}</td><td className="mono" style={{ overflowWrap: 'anywhere' }}>{s.ref}</td></tr>)}
                </tbody></table>
                <div style={{ marginTop: 6, fontSize: 12.5 }}>{picked.ecp.map((e) => <div key={e}><b>{e}</b> {b.ecp.find((x) => x.id === e)?.text}</div>)}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Mức chỉ lên "đạt" khi không còn tín hiệu "chưa có" (R-ECP-SCORE, SC-CORE-1).</div>
              </>
            )}
          </div>
        </div>
      )}

      {view === 'ecp' && (
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>ECP</th><th>Nguyên tắc</th>{b.pillars.map((p) => <th key={p.id} title={p.title} style={{ textAlign: 'center' }}>{p.id}</th>)}</tr></thead>
            <tbody>
              {b.ecp.map((e) => (
                <tr key={e.id}><td><b>{e.id}</b></td><td>{e.text}</td>{b.pillars.map((p) => <td key={p.id} style={{ textAlign: 'center' }}>{p.ecp.includes(e.id) ? '●' : ''}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'signals' && (
        <>
          <div className="row" style={{ gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            {([['', 'Tất cả'], ['co', 'Chạy được'], ['nhanh', 'Ở nhánh'], ['chua', 'Chưa có']] as const).map(([k, t]) => <button key={t} type="button" className={`btn btn-sm ${sigFilter === k ? 'btn-primary' : ''}`} onClick={() => setSigFilter(k)}>{t}</button>)}
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>Trạng thái</th><th>Loại</th><th>Tín hiệu</th><th>Trụ cột</th><th>Năng lực lõi</th></tr></thead>
              <tbody>
                {allSig.filter((s) => !sigFilter || s.state === sigFilter).map((s) => (
                  <tr key={s.pillar.id + s.kind + s.ref}><td><span className={`badge ${SIGNAL_UI[s.state].cls}`}>{SIGNAL_UI[s.state].text}</span></td><td>{s.kind}</td><td className="mono" style={{ overflowWrap: 'anywhere' }}>{s.ref}</td><td>{s.pillar.id} · {s.pillar.title}</td><td>{coreName(s.pillar.core)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'lean' && (
        <>
          <div className="table-wrap" style={{ marginBottom: 10 }}>
            <table className="grid">
              <thead><tr><th>Mã</th><th>Small Core, Strong Contracts</th><th>Nghĩa</th><th>Thi hành bằng</th></tr></thead>
              <tbody>{b.lean.map((l) => <tr key={l.id}><td><b>{l.id}</b></td><td>{l.title}</td><td>{l.rule}</td><td className="muted" style={{ fontSize: 12 }}>{l.enforcedBy}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>Năng lực lõi</th><th>Dev nhận sẵn, không tự xây lại</th><th>Gọi bằng</th><th>Mức</th></tr></thead>
              <tbody>{b.cores.map((c) => <tr key={c.id}><td><b>{c.id}</b> {c.title}</td><td>{c.devGets}</td><td className="mono" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{c.sdk}</td><td><Status s={c.status} /></td></tr>)}</tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>Continuity không phải một engine lưu trùng dữ liệu: là quy tắc và kiểm chứng chạy trên bảng sẵn có, chỉ lưu kết quả kiểm. Sáu năng lực lõi là thư viện, hợp đồng, capability trong Platform / Kernel — không phải sáu dịch vụ.</p>
        </>
      )}
    </div>
  );
}
