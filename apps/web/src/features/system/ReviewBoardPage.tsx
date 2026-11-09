// [2026-11-02 10:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4: màn Hệ thống → Bàn đánh giá (HT08) theo bản mẫu đã duyệt — ba vai, checklist theo nhóm, bốn khối Hiện tượng · Vì sao · Cách khắc phục · Kiểm lại, biên bản in.
// [2026-11-09 10:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B1 / D032-13: HT08 đổi tên Bàn làm việc kế toán; thẻ Khoá thử hôm nay (mặc định) + thẻ Rà theo vai (bàn đánh giá cũ, giữ nguyên)
/**
 * BÀN LÀM VIỆC KẾ TOÁN (HT08; trước là Bàn đánh giá, PHASE-022 30-UI-UX; đổi tên theo PHASE-032 D032-13).
 * Thẻ Việc hôm nay: ViecHomNay.tsx (B2a). Thẻ Khoá thử hôm nay: KhoaThuHomNay.tsx (B1). Thẻ Rà theo vai: phần dưới. Dữ liệu: GET /api/v1/system/review-board?persona= (core.review.board, chỉ đọc).
 * Trạng thái luôn có chữ; không điểm %; "Chưa kiểm được" không tính là đạt; không nút sửa sổ / tắt kiểm / bỏ qua.
 * "Kiểm lại" chạy đúng một mã (core.review.recheck). "In biên bản" in khung biên bản (CSS @media print).
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Remedy } from '@ketoan/contracts';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { RemedyView } from '@/components/RemedyView';
import { KhoaThuHomNay } from './KhoaThuHomNay';
import { ViecHomNay } from './ViecHomNay';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';

type Persona = 'chief_accountant' | 'auditor' | 'tax_inspector';
type Status = 'ok' | 'warn' | 'error' | 'block_ok' | 'untested' | 'elsewhere';
interface BoardCase { id: string; title: string; level: string; status: Status; primary: boolean; detectors: string[]; count: number; sample: string[]; consequence: string; remedy: Remedy | null; remedyText: string; verifyCode: string | null; note: string | null }
interface Board {
  persona: Persona; label: string; intro: string; onlyTodo: boolean; generatedAt: string; counts: Record<Status, number>;
  groups: { key: string; label: string; cases: BoardCase[] }[];
  acknowledgements: { at: string; actor: string; context: string; codes: string[]; note: string | null }[];
  disclaimer: string;
}
interface Recheck { code: string; level: string; count: number; sample: string[] }

const PERSONAS: [Persona, string][] = [['chief_accountant', 'Kế toán trưởng'], ['auditor', 'Kiểm soát / ban kiểm soát'], ['tax_inspector', 'Thanh tra thuế — tự rà trước']];
const ST: Record<Status, { text: string; cls: string; icon: string }> = {
  error: { text: 'Lỗi', cls: 'badge-bad', icon: '✘' },
  warn: { text: 'Cảnh báo', cls: 'badge-warn', icon: '⚠' },
  ok: { text: 'Đạt', cls: 'badge-ok', icon: '✔' },
  block_ok: { text: 'Chặn đúng', cls: 'badge-info', icon: '⛔' },
  untested: { text: 'Chưa kiểm được', cls: 'badge-gray', icon: '○' },
  elsewhere: { text: 'Kiểm ở màn khác', cls: 'badge-gray', icon: '↗' },
};
const ORDER: Status[] = ['error', 'warn', 'ok', 'block_ok', 'untested', 'elsewhere'];
const actionable = (s: Status) => s === 'warn' || s === 'error';

// [2026-11-09 10:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2a: thẻ Việc hôm nay đứng đầu (thứ tự năm thẻ ở 70 §5)
const TABS = [['viec', 'Việc hôm nay'], ['khoa-thu', 'Khoá thử hôm nay'], ['ra-theo-vai', 'Rà theo vai']] as const;
type Tab = (typeof TABS)[number][0];

export function ReviewBoardPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some(([k]) => k === params.get('the')) ? (params.get('the') as Tab) : 'viec';
  return (
    <div className="rb">
      <PageHeader title="Bàn làm việc kế toán" code="HT08" subtitle="Xem hôm nay sổ đã khoá được chưa, còn việc gì, và cách sửa — không ghi gì vào sổ" />
      <div className="tabs" role="tablist" style={{ marginBottom: 12 }}>
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'tab active' : 'tab'} onClick={() => setParams(k === 'viec' ? {} : { the: k }, { replace: true })}>{l}</button>
        ))}
      </div>
      {tab === 'viec' ? <ViecHomNay /> : tab === 'khoa-thu' ? <KhoaThuHomNay /> : <RaTheoVai />}
    </div>
  );
}

function RaTheoVai() {
  const { user } = useAuth();
  const [persona, setPersona] = useState<Persona>('chief_accountant');
  const q = useQuery({ queryKey: ['review-board', persona], queryFn: () => api.get<Board>('/api/v1/system/review-board', { persona }) });
  const [onlyTodo, setOnlyTodo] = useState(true);
  useEffect(() => { if (q.data) setOnlyTodo(q.data.onlyTodo); }, [q.data?.persona]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = q.data;

  return (
    <div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <span className="muted" style={{ flex: 1 }}>Checklist giả định lỗi theo vai — mọi cảnh báo kèm cách khắc phục cụ thể</span>
        <><button type="button" className="btn" onClick={() => void q.refetch()} disabled={q.isFetching}>{q.isFetching ? 'Đang kiểm…' : 'Kiểm lại tất cả'}</button><button type="button" className="btn" onClick={() => window.print()} disabled={!b}>In biên bản</button></>
      </div>
      <div className="card card-body rb-head">
        <div className="rb-personas" role="radiogroup" aria-label="Vai">
          {PERSONAS.map(([k, l]) => (
            <label key={k} className={persona === k ? 'on' : undefined}><input type="radio" name="rb-persona" checked={persona === k} onChange={() => setPersona(k)} /> {l}</label>
          ))}
        </div>
        {b && <div className="muted">{b.intro} · Kiểm lúc {dateTime(b.generatedAt)}</div>}
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : b && (
        <>
          <div className="card card-body rb-counts">
            {ORDER.map((s) => <span key={s} className={`badge ${ST[s].cls}`}>{ST[s].icon} {b.counts[s] ?? 0} {ST[s].text.toLowerCase()}</span>)}
            <span className="rb-grow" />
            <label className="checkbox"><input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} /> Chỉ hiện việc cần làm</label>
          </div>

          <div className="rb-print-head">
            <b>BIÊN BẢN TỰ RÀ — Vai: {b.label}</b> · Đơn vị: {user?.tenant.name} · In lúc {dateTime(new Date().toISOString())}
            <div>Nguồn: tự chẩn đoán của đơn vị lúc {dateTime(b.generatedAt)}; danh mục giả định lỗi F22.</div>
          </div>

          <div className="card">
            {b.groups.map((g) => {
              const list = g.cases.filter((c) => !onlyTodo || actionable(c.status));
              if (!list.length) return null;
              const todo = g.cases.filter((c) => actionable(c.status)).length;
              return (
                <details key={g.key} className="rb-group" open>
                  <summary>{g.label} {todo > 0 && <span className="badge badge-warn">{todo} việc</span>}</summary>
                  {list.map((c) => <CaseRow key={c.id} c={c} />)}
                </details>
              );
            })}
            {b.groups.every((g) => g.cases.every((c) => onlyTodo && !actionable(c.status))) && <div className="card-body muted">Không có việc cần làm với vai này. Bỏ "Chỉ hiện việc cần làm" để xem mục đã đạt.</div>}
          </div>

          {persona === 'auditor' && b.acknowledgements.length > 0 && (
            <div className="card">
              <div className="card-body" style={{ paddingBottom: 0 }}><b>Các lần xác nhận cảnh báo gần đây</b> <span className="muted">(tiếp tục khi còn cảnh báo — bằng chứng)</span></div>
              <div className="table-wrap"><table className="grid">
                <thead><tr><th>Lúc</th><th>Người</th><th>Chứng từ / kỳ</th><th>Mã cảnh báo</th><th>Lý do</th></tr></thead>
                <tbody>{b.acknowledgements.map((a, i) => <tr key={i}><td>{dateTime(a.at)}</td><td>{a.actor}</td><td><code>{a.context}</code></td><td>{a.codes.join(', ')}</td><td>{a.note ?? '—'}</td></tr>)}</tbody>
              </table></div>
            </div>
          )}

          <table className="rb-print-table">
            <thead><tr><th>STT</th><th>Mã ca</th><th>Nội dung</th><th>Trạng thái</th><th>Phương án</th></tr></thead>
            <tbody>{b.groups.flatMap((g) => g.cases).map((c, i) => (
              <tr key={c.id}><td>{i + 1}</td><td>{c.id}</td><td>{c.title}</td><td>{ST[c.status].icon} {ST[c.status].text}{c.count ? ` (${c.count})` : ''}</td><td>{actionable(c.status) ? (c.remedy ? c.remedy.steps.map((s) => s.text).join(' → ') : c.remedyText) : c.note ?? ''}</td></tr>
            ))}</tbody>
          </table>
          <div className="rb-print-sign">Người lập ……………………      Kế toán trưởng ……………………      Trưởng ban kiểm soát ……………………</div>
          <p className="muted rb-foot">{b.disclaimer}</p>
        </>
      )}
    </div>
  );
}

function CaseRow({ c }: { c: BoardCase }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<Recheck | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const status: Status = fresh ? (fresh.level === 'error' ? 'error' : fresh.level === 'warn' || fresh.level === 'info' ? 'warn' : fresh.level === 'empty' ? 'untested' : 'ok') : c.status;
  const sample = fresh ? fresh.sample : c.sample;
  const count = fresh ? fresh.count : c.count;
  const doRecheck = async () => {
    if (!c.verifyCode) return;
    setBusy(true); setErr(null);
    try { setFresh(await api.get<Recheck>('/api/v1/system/review-board/recheck', { code: c.verifyCode })); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <div className="rb-case">
      <div className="rb-row">
        <span className={`badge ${ST[status].cls}`}>{ST[status].icon} {ST[status].text}</span>
        <code className="muted">{c.id}</code>
        <span className="rb-title">{c.title}</span>
        {count > 0 && <span className="muted">{count} chỗ</span>}
        {actionable(c.status) && <button type="button" className="btn btn-xs" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Ẩn' : 'Cách khắc phục'}</button>}
      </div>
      {!actionable(c.status) && c.note && <div className="muted rb-note">{c.note}</div>}
      {open && (
        <div className="rb-blocks">
          <div className="rb-blk"><b>Hiện tượng</b><div>{sample.length ? sample.map((s) => <code key={s} className="dev-code-chip">{s}</code>) : <span className="muted">—</span>}</div></div>
          <div className="rb-blk"><b>Vì sao</b><div>{c.consequence}</div></div>
          <div className="rb-blk"><b>Cách khắc phục</b><div>{c.remedy ? <RemedyView remedy={c.remedy} compact /> : <span>{c.remedyText}</span>}</div></div>
          <div className="rb-blk"><b>Kiểm lại</b><div>
            {c.verifyCode ? <button type="button" className="btn btn-xs btn-primary" disabled={busy} onClick={() => void doRecheck()}>{busy ? 'Đang kiểm…' : `Kiểm lại ${c.verifyCode}`}</button> : <span className="muted">mở lại màn ở bước cuối</span>}
            {fresh && <span className="muted"> · vừa kiểm: {ST[status].text.toLowerCase()}</span>}
            {Boolean(err) && <ErrorBox error={errorText(err)} />}
          </div></div>
        </div>
      )}
    </div>
  );
}
