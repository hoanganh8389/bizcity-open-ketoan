// [2026-11-10 11:58 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B4 (S034-7): thẻ Bộ máy ở HT10 — 13 bộ máy, mức đo từ mốc việc, khung bên xem mốc / hợp đồng / mã kiểm phát ra
/**
 * BỘ MÁY (thẻ trong HT10). Nguồn: GET /api/v1/system/engines (bizcity_engines@1 = docs/standard/bo-may.json + bảng việc).
 * Mức của bộ máy = mốc xong 1 · chờ đủ tín hiệu ½ / số mốc — không ai gõ (D034-5, R-CONT-7). Bộ máy chưa có mốc hiện "chưa có mốc".
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { ScoreBar, SourceError } from './readiness';

interface Milestone { task: string; title: string | null; phase: string | null; column: string; file: string | null; line: number | null }
interface Engine {
  id: string; key: string; title: string; layer: string; duty: string; code: string[]; contracts: string[]; adr: string[];
  core: string; pillars: string[]; emits: string[]; plannedEmits?: string[]; tests: string[]; sdk: string;
  milestones: Milestone[]; pct: number | null; done: number;
}
interface EnginesData { contract: string; version: string; updated: string; layers: Record<string, string>; boardLoaded: boolean; engines: Engine[] }

const COLUMN_UI: Record<string, { text: string; cls: string }> = {
  done: { text: 'xong', cls: 'badge-ok' }, partial: { text: 'chờ đủ tín hiệu', cls: 'badge-warn' }, doing: { text: 'đang làm', cls: 'badge-info' },
  merging: { text: 'chờ merge', cls: 'badge-info' }, blocked: { text: 'bị chặn', cls: 'badge-bad' }, todo: { text: 'chưa làm', cls: '' },
  paused: { text: 'hoãn', cls: '' }, unknown: { text: 'không thấy', cls: 'badge-bad' },
};
const LAYER_TEXT: Record<string, string> = { kernel: 'Kernel', platform: 'Platform', package: 'Gói riêng' };

export function EnginesBoard() {
  const q = useQuery({ queryKey: ['system', 'engines'], queryFn: () => api.get<EnginesData>('/api/v1/system/engines'), staleTime: 5 * 60_000 });
  const [layer, setLayer] = useState('');
  const [sel, setSel] = useState('');
  const b = q.data;
  if (q.isLoading) return <Loading />;
  if (q.error) return <SourceError error={q.error} file="docs/standard/bo-may.json" />;
  if (!b) return null;
  const shown = b.engines.filter((e) => !layer || e.layer === layer);
  const picked = b.engines.find((e) => e.id === sel);
  const all = b.engines.flatMap((e) => e.milestones);
  const measured = b.engines.filter((e) => e.pct != null);

  return (
    <div className="engines">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, marginBottom: 10 }}>
        {[['Bộ máy', String(b.engines.length)], ['Bộ máy ≥ 80%', `${measured.filter((e) => (e.pct ?? 0) >= 80).length} / ${measured.length}`], ['Mốc xong', `${all.filter((m) => m.column === 'done').length} / ${all.length}`], ['Chưa có mốc', String(b.engines.length - measured.length)]].map(([k, v]) => (
          <div key={k} className="card" style={{ padding: '8px 10px' }}><div className="muted" style={{ fontSize: 12 }}>{k}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div></div>
        ))}
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className={`btn btn-sm ${!layer ? 'btn-primary' : ''}`} onClick={() => setLayer('')}>Mọi lớp</button>
        {Object.entries(b.layers).map(([k, t]) => <button key={k} type="button" className={`btn btn-sm ${layer === k ? 'btn-primary' : ''}`} title={t} onClick={() => setLayer(k)}>{LAYER_TEXT[k] ?? k}</button>)}
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>{b.contract} · {b.version} · cập nhật {b.updated} · mức = mốc xong / số mốc (bảng việc){b.boardLoaded ? '' : ' · ⚠ bản cài thiếu bảng việc'}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: picked ? 'minmax(0, 1fr) minmax(300px, 380px)' : '1fr', gap: 10, alignItems: 'start' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {shown.map((e) => (
            <button key={e.id} type="button" className="card" onClick={() => setSel(sel === e.id ? '' : e.id)} title={e.duty}
              style={{ textAlign: 'left', padding: '8px 10px', cursor: 'pointer', outline: sel === e.id ? '2px solid var(--brand-600, #1e5bb8)' : undefined }}>
              <div className="row" style={{ gap: 6, alignItems: 'center' }}><span className="badge">{e.id}</span><span className="muted" style={{ fontSize: 11 }}>{LAYER_TEXT[e.layer] ?? e.layer}</span></div>
              <div style={{ fontWeight: 600, fontSize: 13, margin: '4px 0', minHeight: 34 }}>{e.title}</div>
              {e.pct == null ? <div className="muted" style={{ fontSize: 12 }}><span className="badge badge-info">chưa có mốc</span> chưa có việc nào trong kế hoạch phase</div>
                : <><ScoreBar pct={e.pct} title={`${e.title}: ${e.pct}%`} /><div className="muted" style={{ fontSize: 11 }}>{e.done}/{e.milestones.length} mốc xong · {e.contracts.join(' · ') || 'chưa có hợp đồng'}</div></>}
            </button>
          ))}
        </div>
        {picked && (
          <div className="card" style={{ padding: '10px 12px' }}>
            <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><b>{picked.id} · {picked.title}</b><button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setSel('')}>Đóng</button></div>
            <div style={{ margin: '6px 0', fontSize: 13 }}>{picked.duty}</div>
            <dl style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '2px 8px', fontSize: 12.5, margin: '0 0 8px' }}>
              <dt className="muted">Gọi bằng</dt><dd style={{ margin: 0 }}>{picked.sdk}</dd>
              <dt className="muted">Hợp đồng</dt><dd style={{ margin: 0 }}>{picked.contracts.join(' · ') || '—'}{picked.adr.length ? ` · ${picked.adr.join(', ')}` : ''}</dd>
              <dt className="muted">Mã</dt><dd className="mono" style={{ margin: 0, overflowWrap: 'anywhere' }}>{picked.code.join(' · ')}</dd>
              <dt className="muted">Test</dt><dd className="mono" style={{ margin: 0, overflowWrap: 'anywhere' }}>{picked.tests.join(' · ') || <span className="muted">chưa có test riêng</span>}</dd>
              <dt className="muted">Phục vụ</dt><dd style={{ margin: 0 }}>năng lực lõi {picked.core} · trụ cột {picked.pillars.join(', ')}</dd>
              <dt className="muted">Mã kiểm</dt><dd style={{ margin: 0 }}>
                {picked.emits.length ? <Link to="/he-thong/tru-cot?xem=cong-kiem" className="mono" style={{ fontSize: 12 }}>{picked.emits.join(' · ')}</Link> : <span className="muted">—</span>}
                {picked.plannedEmits?.length ? <div className="muted mono" style={{ fontSize: 11 }}>dự kiến: {picked.plannedEmits.join(' · ')}</div> : null}
              </dd>
            </dl>
            <table className="grid" style={{ fontSize: 12 }}>
              <thead><tr><th>Mốc</th><th>Việc</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {picked.milestones.length ? picked.milestones.map((m) => (
                  <tr key={m.task}><td className="mono">{m.task}</td><td>{m.title ?? <span className="muted">không thấy trong bảng việc</span>}<div className="muted">{m.phase}</div></td>
                    <td><span className={`badge ${COLUMN_UI[m.column]?.cls ?? ''}`}>{COLUMN_UI[m.column]?.text ?? m.column}</span></td></tr>
                )) : <tr><td colSpan={3} className="muted">Chưa có mốc trong kế hoạch phase nào — đây là khoảng trống, không phải "xong".</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>Bộ máy là phần tính hoặc quyết định thay người, có hợp đồng, module gọi vào chứ không tự viết lại (LEAN-1). Mức đổi khi checklist của phase đổi — không ai tích tay.</p>
    </div>
  );
}
