// [2026-11-09 10:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2a (S032-27 phần hiện việc, S032-39 thẻ 1): Việc hôm nay trên Bàn làm việc kế toán — tự chẩn đoán L3 khi mở thẻ, việc theo người làm, lời kế toán, Kiểm lại
/**
 * VIỆC HÔM NAY (PHASE-032 · 00 §6a bước B2a). Chỉ giao diện, dùng API có sẵn:
 *   GET /api/v1/system/diagnostics?layer=L3          tự chẩn đoán toàn vẹn sổ (READ ONLY, R-DIAG-2); lượt chạy được lưu làm bằng chứng
 *   GET /api/v1/system/review-board/recheck?code=    kiểm lại đúng một mã sau khi sửa
 * Mức theo đúng khoá thật hôm nay (R-DIAG-4): lỗi (error) → khoá kỳ phải ghi lý do; cảnh báo (warn) → nên xử lý; info → để biết.
 * Lịch chạy 01:00 mỗi đêm, mã điều kiện khoá sổ và kỳ kiểm ngày / tuần là bước B2c (cần chữ chốt trường DiagCheck).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REMEDY_ROLE_LABELS, type Remedy } from '@ketoan/contracts';
import { ErrorBox, Loading } from '@/components/ui';
import { RemedyView } from '@/components/RemedyView';
import { api, errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';

type Outcome = 'pass' | 'empty' | 'info' | 'warn' | 'error';
interface DiagResult { code: string; level: Outcome; title: string; fix: string; remedy?: Remedy; examined: number; count: number; sample: string[] }
interface DiagRun { runId: string; at: string; summary: Record<Outcome, number>; checks: DiagResult[]; nightly?: boolean }
interface RunRow { id: string; layer: string; trigger: string; at: string }
interface RunDetail { id: string; at: string; summary: Record<Outcome, number>; checks: DiagResult[] }
// [2026-11-09 11:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2c-1: có lượt tự kiểm đêm nay (trigger schedule) thì đọc lượt đó, không chạy lại
const localDay = (v: string | Date) => { const d = new Date(v); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
async function loadToday(force: boolean): Promise<DiagRun> {
  if (!force) {
    const runs = await api.get<RunRow[]>('/api/v1/system/diagnostics/runs', { limit: 10 });
    const night = runs.find((x) => x.layer === 'L3' && x.trigger === 'schedule' && localDay(x.at) === localDay(new Date()));
    if (night) {
      const d = await api.get<RunDetail>(`/api/v1/system/diagnostics/runs/${night.id}`);
      return { runId: d.id, at: d.at, summary: d.summary, checks: d.checks, nightly: true };
    }
  }
  return api.get<DiagRun>('/api/v1/system/diagnostics', { layer: 'L3' });
}
interface Recheck { code: string; level: Outcome; count: number; sample: string[] }

type Level = 'reason' | 'todo' | 'note' | 'pass';
const LV: Record<Level, { text: string; cls: string; icon: string }> = {
  reason: { text: 'Phải ghi lý do khi khoá', cls: 'badge-bad', icon: '✎' },
  todo: { text: 'Nên xử lý', cls: 'badge-warn', icon: '⚠' },
  note: { text: 'Để biết', cls: 'badge-info', icon: 'ℹ' },
  pass: { text: 'Đạt', cls: 'badge-ok', icon: '✔' },
};
const levelOf = (o: Outcome): Level => (o === 'error' ? 'reason' : o === 'warn' ? 'todo' : o === 'info' ? 'note' : 'pass');
const ORDER: Level[] = ['reason', 'todo', 'note'];
/** Phép kiểm còn báo cả trường hợp hợp lệ — nói thẳng với kế toán, sửa ở bước đã ghi. */
// [2026-11-09 11:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2b: TRANSIT_NONZERO đã hết báo sai, bỏ ghi chú
const KNOWN_NOISE: Record<string, string> = {};
const ownerOf = (c: DiagResult) => c.remedy?.owner ?? 'accountant';
const ownerLabel = (o: string) => {
  const s = REMEDY_ROLE_LABELS[o as keyof typeof REMEDY_ROLE_LABELS] ?? o;
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function ViecHomNay() {
  const [force, setForce] = useState(0);
  const q = useQuery({
    queryKey: ['viec-hom-nay', force],
    staleTime: 5 * 60_000,
    queryFn: () => loadToday(force > 0),
  });
  const [showPass, setShowPass] = useState(false);
  const r = q.data;
  const todo = (r?.checks ?? []).filter((c) => levelOf(c.level) !== 'pass').sort((a, b) => ORDER.indexOf(levelOf(a.level)) - ORDER.indexOf(levelOf(b.level)));
  const passed = (r?.checks ?? []).filter((c) => c.level === 'pass');
  const empty = (r?.checks ?? []).filter((c) => c.level === 'empty');
  const owners = [...new Set(todo.map(ownerOf))];
  const nReason = todo.filter((c) => c.level === 'error').length;

  return (
    <div>
      <div className="card card-body rb-head">
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn" onClick={() => (force ? void q.refetch() : setForce(1))} disabled={q.isFetching}>{q.isFetching ? 'Đang kiểm sổ…' : 'Kiểm lại tất cả'}</button>
          <span className="muted">Phần mềm tự kiểm toàn bộ sổ lúc 01:00 mỗi đêm; chưa có lượt đêm nay thì kiểm ngay khi mở thẻ. Chỉ đọc, không sửa gì trong sổ.</span>
        </div>
      </div>

      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : r && (
        <>
          <div className="card card-body" role="status" aria-live="polite">
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {todo.length ? `${todo.length} việc cần xem hôm nay` : '✔ Hôm nay không có việc nào cần xử lý'}
            </div>
            <div style={{ marginTop: 4 }}>
              {nReason > 0 && <div>{nReason} việc là <b>lỗi toàn vẹn sổ</b>: nếu chưa sửa thì khi khoá kỳ phải ghi lý do chấp nhận.</div>}
              <div className="muted">{passed.length} phép kiểm đạt{empty.length ? ` · ${empty.length} phép kiểm chưa có dữ liệu để kiểm` : ''} · {r.nightly ? 'Phần mềm tự kiểm đêm qua lúc' : 'Kiểm lúc'} {dateTime(r.at)}</div>
            </div>
          </div>

          {owners.map((o) => (
            <div className="card" key={o}>
              <details className="rb-group" open>
                <summary>Việc của {ownerLabel(o)} <span className="badge badge-warn">{todo.filter((c) => ownerOf(c) === o).length} việc</span></summary>
                {todo.filter((c) => ownerOf(c) === o).map((c) => <Row key={c.code} c={c} />)}
              </details>
            </div>
          ))}

          <div className="card">
            <details className="rb-group" open={showPass} onToggle={(e) => setShowPass((e.target as HTMLDetailsElement).open)}>
              <summary>Đã kiểm, đạt ({passed.length})</summary>
              {showPass && passed.map((c) => (
                <div className="rb-case" key={c.code}><div className="rb-row"><span className={`badge ${LV.pass.cls}`}>{LV.pass.icon} {LV.pass.text}</span><span className="rb-title">{c.title}</span></div></div>
              ))}
            </details>
          </div>
          <p className="muted rb-foot">Cho người làm phần mềm: lượt tự chẩn đoán #{r.runId} (tầng L3{r.nightly ? ', lịch đêm core.diagnostics-nightly' : ''}), lưu ở lịch sử chẩn đoán.</p>
        </>
      )}
    </div>
  );
}

function Row({ c }: { c: DiagResult }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<Recheck | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const level = levelOf(fresh ? fresh.level : c.level);
  const count = fresh ? fresh.count : c.count;
  const sample = fresh ? fresh.sample : c.sample;
  const recheck = async () => {
    setBusy(true); setErr(null);
    try { setFresh(await api.get<Recheck>('/api/v1/system/review-board/recheck', { code: c.code })); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <div className="rb-case">
      <div className="rb-row">
        <span className={`badge ${LV[level].cls}`}>{LV[level].icon} {LV[level].text}</span>
        <span className="rb-title">{c.title}</span>
        {count > 0 && <span className="muted">{count} chỗ</span>}
        <button type="button" className="btn btn-xs" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Ẩn' : 'Cách khắc phục'}</button>
        <button type="button" className="btn btn-xs" disabled={busy} onClick={() => void recheck()}>{busy ? 'Đang kiểm…' : 'Kiểm lại'}</button>
        {fresh && <span className="muted">vừa kiểm: {LV[level].text.toLowerCase()}</span>}
      </div>
      {KNOWN_NOISE[c.code] && <div className="muted rb-note">ℹ {KNOWN_NOISE[c.code]}</div>}
      {Boolean(err) && <ErrorBox error={errorText(err)} />}
      {open && (
        <div className="rb-blocks">
          <div className="rb-blk"><b>Chỗ bị</b><div>{sample.length ? sample.slice(0, 12).map((s) => <code key={s} className="dev-code-chip">{s}</code>) : <span className="muted">—</span>}{sample.length > 12 ? ` +${sample.length - 12}` : ''}</div></div>
          <div className="rb-blk"><b>Vì sao</b><div>{c.fix}</div></div>
          <div className="rb-blk"><b>Cách khắc phục</b><div>{c.remedy ? <RemedyView remedy={c.remedy} compact /> : <span className="muted">—</span>}</div></div>
        </div>
      )}
    </div>
  );
}
