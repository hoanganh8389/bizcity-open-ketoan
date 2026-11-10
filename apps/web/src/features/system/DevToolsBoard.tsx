// [2026-11-11 03:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B5b (S034-9, D034-12): "Chạy ở đây" — thẻ con ?cong-cu=DEVxx nhúng nguyên màn DEV (không sửa phan-he/dev), cần devtools:read
// [2026-11-11 12:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B5a (S034-8): thẻ Nhà phát triển ở HT10 — bảng tiến độ công cụ DEV01..09 × T1..T6, mở công cụ
/**
 * NHÀ PHÁT TRIỂN (thẻ trong HT10). Nguồn: GET /api/v1/system/dev-tools (bizcity_devtools@1). Tiêu chí T1..T6 sinh từ repo (scripts/cong-cu-dev.mjs),
 * SC-DEV-2 giữ khớp — không ai tích tay (R-CONT-7). Bảng ai cũng xem được; mở công cụ cần quyền devtools:read (màn công cụ tự chặn, D034-7).
 * "Chạy ở đây" (B5b, D034-12): thẻ con ?cong-cu=DEVxx nhúng NGUYÊN component màn DEV (kèm PageHeader, DevGuard) — HT10 chỉ import, không sửa
 * apps/web/src/phan-he/dev/**. Màn DEV đọc tham số ma / q / tab, không trùng xem / cong-cu của HT10.
 */
import type { ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { TongQuanPage } from '@/phan-he/dev/tong-quan/TongQuanPage';
import { TraMaPage } from '@/phan-he/dev/tra-ma/TraMaPage';
import { NhatKyPage } from '@/phan-he/dev/nhat-ky/NhatKyPage';
import { LoiTheoModulePage } from '@/phan-he/dev/loi-theo-module/LoiTheoModulePage';
import { GhiSoPage } from '@/phan-he/dev/ghi-so/GhiSoPage';
import { SuKienPage } from '@/phan-he/dev/su-kien/SuKienPage';
import { ToanVenPage } from '@/phan-he/dev/toan-ven/ToanVenPage';
import { KichBanPage } from '@/phan-he/dev/kich-ban/KichBanPage';
import { VanHanhPage } from '@/phan-he/dev/van-hanh/VanHanhPage';
import { ScoreBar, SourceError } from './readiness';

interface Criterion { state: 'co' | 'chua'; ev: string }
interface Tool { code: string; label: string; path: string; api: string[]; sources: string[]; singleInstall?: boolean; criteria: Record<string, Criterion>; met: number; pct: number }
/** Màn của từng công cụ — đúng component mà menu Nhà phát triển mở (apps/web/src/phan-he/dev/routes.tsx). */
const TOOL_PAGES: Record<string, ComponentType> = {
  DEV01: TongQuanPage, DEV02: TraMaPage, DEV03: NhatKyPage, DEV04: LoiTheoModulePage, DEV05: GhiSoPage,
  DEV06: SuKienPage, DEV07: ToanVenPage, DEV08: KichBanPage, DEV09: VanHanhPage,
};

interface DevToolsData { contract: string; version: string; updated: string; criteria: Record<string, string>; tools: Tool[] }

export function DevToolsBoard() {
  const q = useQuery({ queryKey: ['system', 'dev-tools'], queryFn: () => api.get<DevToolsData>('/api/v1/system/dev-tools'), staleTime: 5 * 60_000 });
  const [sp, setSp] = useSearchParams();
  const { can } = useAuth();
  const mayRun = can('devtools:read');
  const running = sp.get('cong-cu') ?? '';
  const open = (code: string) => { const n = new URLSearchParams(sp); if (code) n.set('cong-cu', code); else n.delete('cong-cu'); setSp(n, { replace: true }); };
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
              <th>Nguồn</th><th style={{ width: 150 }}>Mức</th><th style={{ width: 170 }} />
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
                <td style={{ whiteSpace: 'nowrap' }}>
                  {mayRun && TOOL_PAGES[t.code] && <button type="button" className={`btn btn-sm ${running === t.code ? 'btn-primary' : ''}`} onClick={() => open(running === t.code ? '' : t.code)} title="Chạy công cụ ngay trong thẻ này">{running === t.code ? 'Đang chạy' : 'Chạy ở đây'}</button>}{' '}
                  <Link className="btn btn-sm" to={t.path} title="Mở màn riêng của công cụ (cần quyền Nhà phát triển)">Mở ↗</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {running && TOOL_PAGES[running] && (() => {
        const Page = TOOL_PAGES[running];
        const t = tools.find((x) => x.code === running);
        return (
          <div className="card" style={{ padding: '8px 10px', marginTop: 10 }}>
            <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <b>▾ {running} {t?.label}</b><span className="muted" style={{ fontSize: 12 }}>chạy ở đây · đúng màn của menu Nhà phát triển</span>
              <span className="spacer" />
              {t && <Link className="btn btn-sm" to={t.path}>Mở màn riêng ↗</Link>}
              <button type="button" className="btn btn-sm" onClick={() => open('')}>Đóng</button>
            </div>
            {mayRun ? <Page /> : <div className="muted">Cần quyền <b>Nhà phát triển</b> để chạy công cụ.</div>}
          </div>
        );
      })()}
      {!mayRun && <p className="muted" style={{ fontSize: 12.5 }}>Bạn xem được bảng tiến độ; <b>chạy công cụ</b> cần quyền Nhà phát triển (chủ đơn vị đổi vai trò ở màn Người dùng).</p>}
      <p className="muted" style={{ fontSize: 12.5 }}>
        Rê chuột lên ✓ / ✗ để xem bằng chứng. Tiêu chí sinh từ mã (node scripts/cong-cu-dev.mjs), phép kiểm SC-DEV-2 báo khi bảng lệch mã — không ai tích tay.
        <b>Chạy ở đây</b> mở công cụ ngay dưới bảng; <b>Mở ↗</b> sang màn riêng. Cả hai cần quyền <b>Nhà phát triển</b>.
      </p>
    </div>
  );
}
