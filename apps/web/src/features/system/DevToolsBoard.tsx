// [2026-11-11 12:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B5a (S034-8): thẻ Nhà phát triển ở HT10 — bảng tiến độ công cụ DEV01..09 × T1..T6, mở công cụ
/**
 * NHÀ PHÁT TRIỂN (thẻ trong HT10). Nguồn: GET /api/v1/system/dev-tools (bizcity_devtools@1). Tiêu chí T1..T6 sinh từ repo (scripts/cong-cu-dev.mjs),
 * SC-DEV-2 giữ khớp — không ai tích tay (R-CONT-7). Bảng ai cũng xem được; mở công cụ cần quyền devtools:read (màn công cụ tự chặn, D034-7).
 * Chạy công cụ ngay trong thẻ này (thẻ con nhúng màn) là bước B5b — chờ S018-21 nhả apps/web/src/phan-he/dev/**.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { ScoreBar, SourceError } from './readiness';

interface Criterion { state: 'co' | 'chua'; ev: string }
interface Tool { code: string; label: string; path: string; api: string[]; sources: string[]; singleInstall?: boolean; criteria: Record<string, Criterion>; met: number; pct: number }
interface DevToolsData { contract: string; version: string; updated: string; criteria: Record<string, string>; tools: Tool[] }

export function DevToolsBoard() {
  const q = useQuery({ queryKey: ['system', 'dev-tools'], queryFn: () => api.get<DevToolsData>('/api/v1/system/dev-tools'), staleTime: 5 * 60_000 });
  const b = q.data;
  if (q.isLoading) return <Loading />;
  if (q.error) return <SourceError error={q.error} file="docs/standard/cong-cu-dev.json" />;
  if (!b) return null;
  const keys = Object.keys(b.criteria);
  const tools = [...b.tools].sort((x, y) => x.code.localeCompare(y.code));
  const per = (k: string) => tools.filter((t) => t.criteria[k]?.state === 'co').length;

  return (
    <div className="dev-tools-board">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 10 }}>
        <div className="card" style={{ padding: '8px 10px' }}><div className="muted" style={{ fontSize: 12 }}>Công cụ đủ 6 tiêu chí</div><div style={{ fontSize: 20, fontWeight: 700 }}>{tools.filter((t) => t.met === keys.length).length} / {tools.length}</div></div>
        {keys.map((k) => (
          <div key={k} className="card" style={{ padding: '8px 10px' }} title={b.criteria[k]}><div className="muted" style={{ fontSize: 12 }}>{k} · {b.criteria[k]}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{per(k)} / {tools.length}</div></div>
        ))}
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Mã</th><th>Công cụ</th>
              {keys.map((k) => <th key={k} title={b.criteria[k]} style={{ textAlign: 'center', width: 44 }}>{k}</th>)}
              <th>Nguồn</th><th style={{ width: 150 }}>Mức</th><th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {tools.map((t) => (
              <tr key={t.code}>
                <td className="mono" style={{ fontSize: 12 }}>{t.code}</td>
                <td>{t.label}<div className="muted mono" style={{ fontSize: 11 }}>{t.api.length ? `${t.api.length} API` : 'không có API riêng'}</div></td>
                {keys.map((k) => {
                  const c = t.criteria[k];
                  return <td key={k} style={{ textAlign: 'center' }} title={`${b.criteria[k]}: ${c?.ev ?? '—'}`}>{c?.state === 'co' ? <span style={{ color: 'var(--ok, #1a7f4b)' }}>✓</span> : <span style={{ color: 'var(--bad, #c62828)' }}>✗</span>}</td>;
                })}
                <td style={{ fontSize: 12 }}>{t.sources.length ? t.sources.join(' · ') : <span className="muted">—</span>}{t.singleInstall ? <div className="muted" style={{ fontSize: 11 }}>bản cài một đơn vị</div> : null}</td>
                <td><ScoreBar pct={t.pct} title={`${t.label}: ${t.met}/${keys.length} tiêu chí`} /></td>
                <td><Link className="btn btn-sm" to={t.path} title="Mở công cụ (cần quyền Nhà phát triển)">Mở ▸</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>
        Rê chuột lên ✓ / ✗ để xem bằng chứng. Tiêu chí sinh từ mã (node scripts/cong-cu-dev.mjs), phép kiểm SC-DEV-2 báo khi bảng lệch mã — không ai tích tay.
        Mở công cụ cần quyền <b>Nhà phát triển</b>. Chạy công cụ ngay trong thẻ này là bước sau (B5b).
      </p>
    </div>
  );
}
