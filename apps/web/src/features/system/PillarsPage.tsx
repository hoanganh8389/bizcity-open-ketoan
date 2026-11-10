// [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — HT10 "Trụ cột & mức đạt": ma trận trụ cột × tiêu chí × mức đạt của Core (ADR-0022, D026-6)
/**
 * TRỤ CỘT & MỨC ĐẠT (HT10). Một bảng cho hai người đọc:
 *   - kế toán: "Core bảo đảm điều gì, hôm nay đạt tới đâu, chỗ nào còn phải tự kiểm bằng tay";
 *   - dev: "kim chỉ nam — tiêu chí nào chưa đạt, bằng chứng ở đâu, việc tiếp theo (S026-*) là gì".
 * Nguồn: docs/standard/tru-cot.json (bizcity_pillars@1) qua GET /api/v1/system/pillars — thuộc bản dựng, không theo đơn vị.
 * Không có nút "đánh dấu đạt" (R-CONT-7): mức đạt đi theo bằng chứng (test / check), đổi bằng cách sửa code và tệp nguồn.
 * `PillarMatrix` dùng lại ở trang chủ phân hệ (thẻ "Trụ cột", lọc theo phân hệ) — cạnh thẻ "Quy trình".
 */
import { useEffect, useMemo, useState } from 'react';
import { useIsFetching, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { FoundationsBoard } from './FoundationsBoard';
// [2026-11-10 10:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B2 (S034-4): thanh mức đạt, báo thiếu tệp nguồn, thẻ "sắp có" dùng chung cho năm thẻ HT10
import { ScoreBar, SourceError } from './readiness';
// [2026-11-10 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3a (S034-5): thẻ Cổng & bộ kiểm có dữ liệu thật (GET /system/gates)
import { GatesBoard } from './GatesBoard';
// [2026-11-10 11:58 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B4 (S034-7): thẻ Bộ máy có dữ liệu thật (GET /system/engines)
import { EnginesBoard } from './EnginesBoard';
// [2026-11-11 12:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B5a (S034-8): thẻ Nhà phát triển có bảng tiến độ thật (GET /system/dev-tools)
import { DevToolsBoard } from './DevToolsBoard';
// [2026-11-11 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B6 (S034-10): dòng tổng năm con số ở đầu màn
import { Ht10Summary } from './Ht10Summary';

export type PillarStatus = 'dat' | 'mot-phan' | 'tai-lieu' | 'chua';
export interface PillarCriterion {
  id: string; text: string; status: PillarStatus; evidence: string; gap: string; next: string; phase: string; level: 'P0' | 'P1' | 'P2'; modules: string[];
}
export interface Pillar { id: string; key: string; role: string; title: string; one: string; criteria: PillarCriterion[] }
export interface PillarsBoard { contract: string; version: string; updated: string; doc: string; statuses: Record<PillarStatus, string>; pillars: Pillar[] }

export const STATUS_UI: Record<PillarStatus, { text: string; cls: string; weight: number }> = {
  dat: { text: 'Đạt', cls: 'badge-ok', weight: 1 },
  'mot-phan': { text: 'Một phần', cls: 'badge-warn', weight: 0.5 },
  'tai-lieu': { text: 'Mới tài liệu', cls: 'badge-info', weight: 0.25 },
  chua: { text: 'Chưa', cls: '', weight: 0 },
};

export const usePillars = () => useQuery({ queryKey: ['system', 'pillars'], queryFn: () => api.get<PillarsBoard>('/api/v1/system/pillars'), staleTime: 5 * 60_000 });

/** Mức đạt của một trụ cột: cộng trọng số từng tiêu chí (đạt 1 · một phần ½ · tài liệu ¼ · chưa 0). */
export function pillarScore(cs: PillarCriterion[]) {
  const n = cs.length || 1;
  const sum = cs.reduce((s, c) => s + STATUS_UI[c.status].weight, 0);
  const count = (st: PillarStatus) => cs.filter((c) => c.status === st).length;
  return { pct: Math.round((sum / n) * 100), dat: count('dat'), motPhan: count('mot-phan'), taiLieu: count('tai-lieu'), chua: count('chua') };
}

/** Ma trận trụ cột × tiêu chí. `module`: chỉ hiện tiêu chí gắn với phân hệ (không có tiêu chí nào thì hiện tất cả). */
export function PillarMatrix({ module, compact }: { module?: string; compact?: boolean }) {
  const q = usePillars();
  const [pick, setPick] = useState<string>('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const board = q.data;
  const pillars = useMemo(() => {
    if (!board) return [];
    const scoped = module ? board.pillars.map((p) => ({ ...p, criteria: p.criteria.filter((c) => c.modules.includes(module)) })).filter((p) => p.criteria.length) : board.pillars;
    return scoped.length ? scoped : board.pillars;
  }, [board, module]);
  if (q.isLoading) return <Loading />;
  if (q.error) return <SourceError error={q.error} file="docs/standard/tru-cot.json" />;
  if (!board) return null;
  const shown = pillars.filter((p) => !pick || p.key === pick);
  return (
    <div className="pillars">
      <div className="pillars-tiles" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 150 : 180}px, 1fr))`, gap: 8, marginBottom: 10 }}>
        {pillars.map((p) => {
          const s = pillarScore(p.criteria);
          const on = pick === p.key;
          return (
            <button key={p.key} type="button" className="card" onClick={() => setPick(on ? '' : p.key)} title={p.one}
              style={{ textAlign: 'left', padding: '8px 10px', cursor: 'pointer', outline: on ? '2px solid var(--brand-600, #1e5bb8)' : undefined, borderLeft: p.role === 'nền móng' ? '4px solid var(--brand-600, #1e5bb8)' : undefined }}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{p.role === 'nền móng' ? 'Nền móng' : `Trụ cột ${p.id}`}</div>
              <div style={{ fontWeight: 600, fontSize: compact ? 12.5 : 13, minHeight: compact ? 0 : 34 }}>{p.title}</div>
              <div style={{ marginTop: 4 }}><ScoreBar pct={s.pct} title={`${p.title}: ${s.pct}%`} /></div>
              <div className="muted" style={{ fontSize: 11 }}>{s.dat} đạt · {s.motPhan} một phần · {s.taiLieu + s.chua} chưa</div>
            </button>
          );
        })}
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <label className="muted"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> chỉ tiêu chí chưa đạt</label>
        {pick && <button type="button" className="btn btn-sm" onClick={() => setPick('')}>Xem mọi trụ cột</button>}
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>{board.contract} · {board.version} · cập nhật {board.updated} · mức đạt theo bằng chứng, không tích tay</span>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th style={{ width: 90 }}>Mã</th><th>Tiêu chí</th><th style={{ width: 96 }}>Mức</th>{!compact && <th>Bằng chứng</th>}<th>Khoảng cách</th><th style={{ width: 120 }}>Việc tiếp</th><th style={{ width: 50 }}>Ưu tiên</th></tr></thead>
          <tbody>
            {shown.map((p) => {
              const rows = p.criteria.filter((c) => !onlyOpen || c.status !== 'dat');
              if (!rows.length) return null;
              return [
                <tr key={`${p.key}-h`}><td colSpan={compact ? 6 : 7} style={{ background: 'var(--surface-2, #f2f6fb)', fontWeight: 700 }}>{p.role === 'nền móng' ? 'Nền móng' : `Trụ cột ${p.id}`} · {p.title} <span className="muted" style={{ fontWeight: 400 }}>— {p.one}</span></td></tr>,
                ...rows.map((c) => (
                  <tr key={c.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{c.id}</td>
                    <td>{c.text}</td>
                    <td><span className={`badge ${STATUS_UI[c.status].cls}`}>{STATUS_UI[c.status].text}</span></td>
                    {!compact && <td className="muted" style={{ fontSize: 12 }}>{c.evidence || '—'}</td>}
                    <td style={{ fontSize: 12 }}>{c.gap || <span className="muted">—</span>}</td>
                    <td style={{ fontSize: 12 }}>{c.next ? <span className="mono">{c.next}</span> : '—'}<div className="muted">{c.phase}</div></td>
                    <td><span className={`badge ${c.level === 'P0' ? 'badge-warn' : ''}`}>{c.level}</span></td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// [2026-11-05 11:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E1 (S029-30): HT10 thêm thẻ Nền móng (sáu năng lực lõi × 17 trụ cột, ADR-0028); thẻ Tiêu chí giữ nguyên bảng tru-cot.json
// [2026-11-10 10:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B2 (S034-4): năm thẻ theo thứ tự D034-10 (luật → nền → cổng → bộ máy → công cụ dev); ba thẻ mới hiện "sắp có" tới B3 / B4 / B5
const TABS = [
  { key: 'tieu-chi', label: 'Tiêu chí theo trụ cột', hint: 'Core bảo đảm điều gì — trụ cột × tiêu chí × mức đạt (tru-cot.json)' },
  { key: 'nen-mong', label: 'Nền móng', hint: 'Sáu năng lực lõi × bốn nhóm nền móng × 17 trụ cột × ECP — mức đạt theo tín hiệu kiểm chạy được' },
  { key: 'cong-kiem', label: 'Cổng & bộ kiểm', hint: 'Cổng A · B · Commit Guard · C · khoá kỳ · trigger CSDL · chẩn đoán · bộ kiểm CI — mỗi mã kiểm có cách sửa, test, trụ cột chưa' },
  { key: 'bo-may', label: 'Bộ máy', hint: 'Các engine của Core (Ghi sổ, Inventory, Document SDK, Workflow, Phân quyền, …) — hợp đồng, mã, mốc còn lại' },
  { key: 'nha-phat-trien', label: 'Nhà phát triển', hint: 'Công cụ DEV01..09 — mức hoàn thiện từng công cụ, chạy ngay tại đây' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function TabBody({ tab }: { tab: TabKey }) {
  switch (tab) {
    case 'nen-mong': return <FoundationsBoard />;
    case 'cong-kiem': return <GatesBoard />;
    case 'bo-may': return <EnginesBoard />;
    case 'nha-phat-trien': return <DevToolsBoard />;
    default: return <PillarMatrix />;
  }
}

export function PillarsPage() {
  const [sp, setSp] = useSearchParams();
  const xem = sp.get('xem');
  const tab: TabKey = TABS.some((t) => t.key === xem) ? (xem as TabKey) : 'tieu-chi';
  // [2026-11-11 03:55 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — S034-12: In cả năm thẻ — dựng cả năm thẻ nối nhau (mỗi thẻ sang trang mới), chờ dữ liệu tải xong rồi mở hộp in; in xong trở lại thẻ đang xem
  const [printAll, setPrintAll] = useState(false);
  const fetching = useIsFetching();
  useEffect(() => {
    if (!printAll || fetching > 0) return;
    const done = () => setPrintAll(false);
    window.addEventListener('afterprint', done, { once: true });
    const t = window.setTimeout(() => window.print(), 400);
    return () => { window.clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [printAll, fetching]);
  return (
    <div>
      <PageHeader title="Trụ cột & mức đạt" code="HT10" helpKey="tru-cot-muc-dat"
        actions={<button type="button" className="btn" onClick={() => setPrintAll(true)} disabled={printAll} title={printAll ? 'Đang dựng năm thẻ để in' : 'In cả năm thẻ nối nhau — phụ lục báo cáo kiểm chuẩn'}>In cả năm thẻ</button>}
        subtitle="Core bảo đảm điều gì và hôm nay đạt tới đâu — một bảng cho kế toán hiểu luật chạy, cho dev biết việc kế tiếp. Mức đạt đi theo bằng chứng (test / check), không ai tích tay." />
      {printAll ? (
        <>
          <div className="alert alert-info">Đang dựng năm thẻ để in… Hộp in tự mở khi dữ liệu tải xong. <button type="button" className="btn btn-sm" onClick={() => setPrintAll(false)}>Thôi</button></div>
          <Ht10Summary active={tab} onOpen={() => undefined} />
          {TABS.map((t, i) => (
            <section key={t.key} style={{ breakBefore: i ? 'page' : undefined, marginTop: i ? 16 : 0 }}>
              <h2 style={{ fontSize: 16, margin: '8px 0' }}>{i + 1}. {t.label}</h2>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{t.hint}</div>
              <TabBody tab={t.key} />
            </section>
          ))}
        </>
      ) : <>
      <Ht10Summary active={tab} onOpen={(k) => setSp(k === 'tieu-chi' ? {} : { xem: k }, { replace: true })} />
      <div className="tabs" role="tablist" style={{ marginBottom: 10 }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'active' : ''}`} title={t.hint}
            onClick={() => setSp(t.key === 'tieu-chi' ? {} : { xem: t.key }, { replace: true })}>{t.label}</button>
        ))}
      </div>
      <TabBody tab={tab} />
      </>}
    </div>
  );
}
