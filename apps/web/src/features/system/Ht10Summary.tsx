// [2026-11-11 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B6 (S034-10): dòng tổng đầu HT10 — năm con số, mỗi số đọc lại API của thẻ đó (cùng khoá cache), bấm mở đúng thẻ
/**
 * Một dòng nhìn cả Core (PHASE-034 · 00 §1). Không có API mới, không có số gõ tay:
 *   Tiêu chí   = mức gộp mọi tiêu chí của tru-cot.json (đạt 1 · một phần ½ · tài liệu ¼ · chưa 0)
 *   Nền móng   = mức gộp tín hiệu của 17 trụ cột (chạy được 1 · ở nhánh ½ · chưa có 0); kèm số trụ cột đạt
 *   Cổng       = trung bình `score` của mã kiểm (API tính: bốn ý ¼; CI / trigger: trụ cột + có kiểm) — PHASE-034 B3b
 *   Bộ máy     = trung bình mức các bộ máy có mốc (mốc xong / số mốc)
 *   Công cụ dev = trung bình tiêu chí T1..T6 đạt của chín công cụ
 * Thẻ nào lỗi thì ô đó hiện "—", các ô khác vẫn chạy.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { pillarScore, type PillarsBoard } from './PillarsPage';
import { ScoreBar } from './readiness';

type Tab = 'tieu-chi' | 'nen-mong' | 'cong-kiem' | 'bo-may' | 'nha-phat-trien';
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export function Ht10Summary({ onOpen, active }: { onOpen: (t: Tab) => void; active: Tab }) {
  const pillars = useQuery({ queryKey: ['system', 'pillars'], queryFn: () => api.get<PillarsBoard>('/api/v1/system/pillars'), staleTime: 5 * 60_000 });
  const found = useQuery({ queryKey: ['system', 'foundations'], queryFn: () => api.get<{ pillars: { status: string; signals: { state: 'co' | 'nhanh' | 'chua' }[] }[] }>('/api/v1/system/foundations'), staleTime: 5 * 60_000 });
  const gates = useQuery({ queryKey: ['system', 'gates'], queryFn: () => api.get<{ groups: { live: boolean; codes: { score: number }[] }[] }>('/api/v1/system/gates'), staleTime: 60_000 });
  const engines = useQuery({ queryKey: ['system', 'engines'], queryFn: () => api.get<{ engines: { pct: number | null }[] }>('/api/v1/system/engines'), staleTime: 5 * 60_000 });
  const tools = useQuery({ queryKey: ['system', 'dev-tools'], queryFn: () => api.get<{ criteria: Record<string, string>; tools: { met: number; pct: number }[] }>('/api/v1/system/dev-tools'), staleTime: 5 * 60_000 });

  const tiles: { key: Tab; label: string; pct: number | null; sub: string }[] = [];
  {
    const all = pillars.data?.pillars.flatMap((p) => p.criteria) ?? [];
    tiles.push({ key: 'tieu-chi', label: 'Tiêu chí', pct: pillars.data ? pillarScore(all).pct : null, sub: pillars.data ? `${all.filter((c) => c.status === 'dat').length}/${all.length} tiêu chí đạt` : '—' });
  }
  {
    const ps = found.data?.pillars ?? [];
    const sig = ps.flatMap((p) => p.signals);
    tiles.push({ key: 'nen-mong', label: 'Nền móng', pct: found.data ? avg(sig.map((s) => (s.state === 'co' ? 100 : s.state === 'nhanh' ? 50 : 0))) : null, sub: found.data ? `${ps.filter((p) => p.status === 'dat').length}/${ps.length} trụ cột đạt` : '—' });
  }
  {
    const cs = gates.data?.groups.flatMap((g) => g.codes) ?? [];
    tiles.push({ key: 'cong-kiem', label: 'Cổng & bộ kiểm', pct: gates.data ? avg(cs.map((c) => c.score)) : null, sub: gates.data ? `${gates.data.groups.filter((g) => g.live).length}/${gates.data.groups.length} cổng có sổ · ${cs.length} mã` : '—' });
  }
  {
    const es = engines.data?.engines ?? [];
    const m = es.filter((e) => e.pct != null).map((e) => e.pct as number);
    tiles.push({ key: 'bo-may', label: 'Bộ máy', pct: engines.data ? avg(m) : null, sub: engines.data ? `${m.filter((x) => x >= 80).length}/${es.length} bộ máy ≥ 80% · ${es.length - m.length} chưa có mốc` : '—' });
  }
  {
    const ts = tools.data?.tools ?? [];
    const n = Object.keys(tools.data?.criteria ?? {}).length;
    tiles.push({ key: 'nha-phat-trien', label: 'Công cụ dev', pct: tools.data ? avg(ts.map((t) => t.pct)) : null, sub: tools.data ? `${ts.filter((t) => t.met === n).length}/${ts.length} công cụ đủ ${n} tiêu chí` : '—' });
  }

  return (
    <div className="ht10-summary" role="list" aria-label="Mức hoàn thiện của Core"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, marginBottom: 10 }}>
      {tiles.map((t) => (
        <button key={t.key} type="button" role="listitem" className="card" onClick={() => onOpen(t.key)} title={`Mở thẻ ${t.label}`}
          style={{ textAlign: 'left', padding: '8px 10px', cursor: 'pointer', outline: active === t.key ? '2px solid var(--brand-600, #1e5bb8)' : undefined }}>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t.label}</div>
          {t.pct == null ? <div style={{ fontSize: 18, fontWeight: 700 }}>—</div> : <div style={{ margin: '4px 0' }}><ScoreBar pct={t.pct} title={`${t.label}: ${Math.round(t.pct)}%`} /></div>}
          <div className="muted" style={{ fontSize: 11 }}>{t.sub}</div>
        </button>
      ))}
    </div>
  );
}
