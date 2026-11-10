// [2026-11-10 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3a (S034-5): thẻ Cổng & bộ kiểm ở HT10 — mã kiểm theo cổng, mỗi mã có cách sửa / phương án chưa, kết quả lượt chẩn đoán gần nhất
/**
 * CỔNG & BỘ KIỂM (thẻ trong HT10). Nguồn: GET /api/v1/system/gates (bizcity_gates@1) — mã lấy từ sổ đăng ký trong mã, không gõ tay (D034-3).
 * Mức "đủ" của một mã ở bước này = có câu Cách sửa + có phương án khắc phục có cấu trúc (R-FIX-1). Test và trụ cột gắn với mã đo ở B3b.
 * Chỉ đọc (R-CONT-7). Mã chẩn đoán mở được ở Nhà phát triển → Toàn vẹn (DEV07).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { ScoreBar, SourceError } from './readiness';

interface GateCode {
  code: string; step: string; level: string; title: string; hasFix: boolean; hasRemedy: boolean; closeRef?: string;
  last?: { level: 'pass' | 'empty' | 'error' | 'warn' | 'info'; count: number; examined: number } | null;
}
interface GateGroup { key: string; title: string; runsAt: string; source: string; live: boolean; next?: string; codes: GateCode[] }
interface GatesBoardData { contract: string; lastRun: { id: string; layer: string; trigger: string; at: string } | null; groups: GateGroup[] }

const LEVEL_UI: Record<string, { text: string; cls: string }> = {
  block: { text: 'chặn', cls: 'badge-bad' }, error: { text: 'lỗi', cls: 'badge-bad' },
  warn: { text: 'cảnh báo', cls: 'badge-warn' }, info: { text: 'nhắc', cls: 'badge-info' },
};
const LAST_UI: Record<string, { text: string; cls: string }> = {
  pass: { text: 'đạt', cls: 'badge-ok' }, empty: { text: 'không có dữ liệu', cls: '' },
  error: { text: 'sai', cls: 'badge-bad' }, warn: { text: 'cảnh báo', cls: 'badge-warn' }, info: { text: 'nhắc', cls: 'badge-info' },
};

/** Mức đủ của một mã ở B3a: Cách sửa ½ + phương án có cấu trúc ½. */
const codeScore = (c: GateCode) => (c.hasFix ? 50 : 0) + (c.hasRemedy ? 50 : 0);
const gateScore = (cs: GateCode[]) => (cs.length ? cs.reduce((s, c) => s + codeScore(c), 0) / cs.length : 0);
const Yes = ({ on }: { on: boolean }) => (on ? <span style={{ color: 'var(--ok, #1a7f4b)' }}>✓</span> : <span className="muted">—</span>);

export function GatesBoard() {
  const q = useQuery({ queryKey: ['system', 'gates'], queryFn: () => api.get<GatesBoardData>('/api/v1/system/gates'), staleTime: 60_000 });
  const [pick, setPick] = useState('');
  const [onlyGap, setOnlyGap] = useState(false);
  const [text, setText] = useState('');
  const b = q.data;
  const totals = useMemo(() => {
    const all = b?.groups.flatMap((g) => g.codes) ?? [];
    return { n: all.length, fix: all.filter((c) => c.hasFix).length, remedy: all.filter((c) => c.hasRemedy).length, live: b?.groups.filter((g) => g.live).length ?? 0, groups: b?.groups.length ?? 0 };
  }, [b]);
  if (q.isLoading) return <Loading />;
  if (q.error) return <SourceError error={q.error} file="GET /api/v1/system/gates" />;
  if (!b) return null;
  const needle = text.trim().toLowerCase();
  const shown = b.groups.filter((g) => !pick || g.key === pick);

  return (
    <div className="gates">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, marginBottom: 10 }}>
        {[['Cổng có sổ chạy được', `${totals.live} / ${totals.groups}`], ['Mã kiểm', String(totals.n)], ['Có cách sửa', `${totals.fix} / ${totals.n}`], ['Có phương án có cấu trúc', `${totals.remedy} / ${totals.n}`]].map(([k, v]) => (
          <div key={k} className="card" style={{ padding: '8px 10px' }}><div className="muted" style={{ fontSize: 12 }}>{k}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div></div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 10 }}>
        {b.groups.map((g) => {
          const on = pick === g.key;
          const pct = gateScore(g.codes);
          return (
            <button key={g.key} type="button" className="card" onClick={() => setPick(on ? '' : g.key)} title={`${g.runsAt} · ${g.source}`}
              style={{ textAlign: 'left', padding: '8px 10px', cursor: 'pointer', outline: on ? '2px solid var(--brand-600, #1e5bb8)' : undefined, opacity: g.live ? 1 : 0.75 }}>
              <div style={{ fontWeight: 600, fontSize: 13, minHeight: 34 }}>{g.title}</div>
              {g.live ? (
                <>
                  <div style={{ marginTop: 4 }}><ScoreBar pct={pct} title={`${g.title}: ${Math.round(pct)}% đủ cách sửa + phương án`} /></div>
                  <div className="muted" style={{ fontSize: 11 }}>{g.codes.length} mã · {g.codes.filter((c) => c.hasFix).length} có cách sửa · {g.codes.filter((c) => c.hasRemedy).length} có phương án</div>
                </>
              ) : (
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}><span className="badge badge-info">chưa có sổ</span> {g.next}</div>
              )}
            </button>
          );
        })}
      </div>

      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 220 }} placeholder="Tìm mã / tiêu đề" value={text} onChange={(e) => setText(e.target.value)} />
        <label className="muted"><input type="checkbox" checked={onlyGap} onChange={(e) => setOnlyGap(e.target.checked)} /> chỉ mã còn thiếu cách sửa / phương án</label>
        {pick && <button type="button" className="btn btn-sm" onClick={() => setPick('')}>Xem mọi cổng</button>}
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {b.contract} · lượt chẩn đoán gần nhất: {b.lastRun ? `${b.lastRun.layer} · ${b.lastRun.trigger} · ${new Date(b.lastRun.at).toLocaleString('vi-VN')}` : 'chưa có'} · test và trụ cột của từng mã: bước B3b
        </span>
      </div>

      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th style={{ width: 150 }}>Mã</th><th style={{ width: 70 }}>Bậc</th><th style={{ width: 90 }}>Mức</th><th>Kiểm gì</th><th style={{ width: 70 }}>Cách sửa</th><th style={{ width: 80 }}>Phương án</th><th style={{ width: 80 }}>Khoá sổ</th><th style={{ width: 130 }}>Lượt gần nhất</th></tr></thead>
          <tbody>
            {shown.map((g) => {
              const rows = g.codes.filter((c) => (!onlyGap || !c.hasFix || !c.hasRemedy) && (!needle || c.code.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle)));
              if (g.live && !rows.length) return null;
              return [
                <tr key={`${g.key}-h`}><td colSpan={8} style={{ background: 'var(--surface-2, #f2f6fb)', fontWeight: 700 }}>{g.title} <span className="muted" style={{ fontWeight: 400 }}>— {g.runsAt} · <span className="mono" style={{ fontSize: 11 }}>{g.source}</span></span></td></tr>,
                ...(g.live ? rows.map((c) => (
                  <tr key={`${g.key}-${c.code}`}>
                    <td className="mono" style={{ fontSize: 12 }}>{g.key === 'diag' ? <Link to="/dev/toan-ven" title="Mở ở Nhà phát triển → Toàn vẹn (DEV07)">{c.code}</Link> : c.code}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{c.step}</td>
                    <td><span className={`badge ${LEVEL_UI[c.level]?.cls ?? ''}`}>{LEVEL_UI[c.level]?.text ?? c.level}</span></td>
                    <td>{c.title}</td>
                    <td style={{ textAlign: 'center' }}><Yes on={c.hasFix} /></td>
                    <td style={{ textAlign: 'center' }}><Yes on={c.hasRemedy} /></td>
                    <td className="mono" style={{ fontSize: 11 }}>{c.closeRef && c.closeRef !== 'none' ? c.closeRef : '—'}</td>
                    <td>{g.key !== 'diag' ? <span className="muted">—</span> : c.last ? <span className={`badge ${LAST_UI[c.last.level]?.cls ?? ''}`}>{LAST_UI[c.last.level]?.text ?? c.last.level}{c.last.count ? ` · ${c.last.count}` : ''}</span> : <span className="muted">chưa chạy</span>}</td>
                  </tr>
                )) : [
                  <tr key={`${g.key}-next`}><td colSpan={8} className="muted"><span className="badge badge-info">chưa có sổ</span> {g.next}</td></tr>,
                ]),
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>Thanh mức của mỗi cổng = trung bình các mã: có câu Cách sửa ½ + có phương án có cấu trúc (bước, màn, vai, kiểm lại) ½. Không ai tích "đạt" ở đây; mức đổi khi mã đổi.</p>
    </div>
  );
}
