// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: màn Tra mã (DEV02) — dán traceId / requestId → chuyện gì đã xảy ra, cây span, log, bằng chứng
/**
 * TRA MÃ (DEV02, 20-KIEN-TRUC §4): dán mã từ khay Mã tra cứu / thông báo lỗi.
 *   - 32 ký tự hex → traceId → core.devtools.trace; còn lại theo khuôn requestId → core.devtools.request (log → trace).
 *   - Khối "Chuyện gì đã xảy ra" trước (N3, U1), rồi ba thẻ: Cây span · Log cùng trace · Bằng chứng.
 *   - Địa chỉ giữ mã (?ma=…, &tab=…) để gửi link cho nhau; khay Mã tra cứu mở thẳng tới đây.
 *   - Phím `/` đưa con trỏ vào ô tra mã (U9).
 * Không có nút ghi nào (U8). Trace của đơn vị khác → "không tìm thấy" (D019-5).
 */
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { errorText } from '@/lib/api';
import { REQUEST_RE, TRACE_RE, useEvidence, useLogs, useRequest, useTrace, type LogLine, type TraceView } from '../api';
import { Answer, CopyCode, DevBanner, DevGuard, OutcomeTag, Src, Waterfall, clock, when } from '../ui';

type Tab = 'cay' | 'log' | 'bang-chung';

export function TraMaPage() {
  const [params, setParams] = useSearchParams();
  const raw = (params.get('ma') ?? params.get('traceId') ?? params.get('requestId') ?? '').trim();
  const [text, setText] = useState(raw);
  useEffect(() => setText(raw), [raw]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !t.closest('input, textarea, select, [contenteditable="true"]')) { e.preventDefault(); input.current?.focus(); input.current?.select(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isTrace = TRACE_RE.test(raw);
  const isRequest = !isTrace && REQUEST_RE.test(raw);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    setParams(v ? { ma: v } : {});
  };

  return (
    <DevGuard>
      <PageHeader title="Tra mã" code="DEV02" helpKey="ban-dieu-tra" subtitle="Dán traceId (32 ký tự) hoặc requestId (req-…) từ thông báo lỗi — phím tắt /" />
      <DevBanner />
      <form className="dev-search" onSubmit={submit}>
        <input ref={input} className="input mono" value={text} onChange={(e) => setText(e.target.value)} placeholder="vd 0904127dd2944f22c086c236c5ceb5af hoặc req-6d9697c3-8e44" aria-label="Mã tra cứu" autoFocus={!raw} spellCheck={false} />
        <button type="submit" className="btn btn-primary">Tra</button>
      </form>
      {raw && !isTrace && !isRequest && <ErrorBox error="Mã không đúng khuôn: traceId gồm 32 ký tự 0-9 a-f; requestId gồm chữ, số, . _ : - (vd req-1a2b3c4d)." />}
      {isTrace && <TraceResult traceId={raw.toLowerCase()} tab={(params.get('tab') as Tab) ?? 'cay'} onTab={(t) => setParams({ ma: raw, tab: t })} />}
      {isRequest && <RequestResult requestId={raw} />}
      {!raw && (
        <div className="card card-body muted" style={{ marginTop: 12 }}>
          Lấy mã ở khay <b>Mã tra cứu</b> góc dưới trái khi có lỗi (nút <b>Chép</b>), hoặc từ người dùng gửi. Không có mã? Xem <Link to="/dev/tong-quan">Tổng quan</Link> hoặc <Link to="/dev/nhat-ky">Nhật ký</Link>.
        </div>
      )}
    </DevGuard>
  );
}

function RequestResult({ requestId }: { requestId: string }) {
  const q = useRequest(requestId);
  if (q.isLoading) return <Loading text="Đang tìm yêu cầu trong nhật ký 24 giờ…" />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const r = q.data!;
  return (
    <>
      {r.trace
        ? <TraceBody key={r.trace.traceId} t={r.trace} tab="cay" onTab={() => undefined} logsOverride={r.logs} />
        : (
          <>
            <Answer level="warn" title="Có log, không có trace">
              <p>{r.traceMissing}</p>
              {r.traceId && <p>traceId của yêu cầu: <CopyCode value={r.traceId} short={32} /></p>}
            </Answer>
            <div className="card"><LogTable lines={r.logs} /></div>
          </>
        )}
    </>
  );
}

function TraceResult({ traceId, tab, onTab }: { traceId: string; tab: Tab; onTab: (t: Tab) => void }) {
  const q = useTrace(traceId);
  if (q.isLoading) return <Loading text="Đang đọc trace…" />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  return <TraceBody key={traceId} t={q.data!} tab={tab} onTab={onTab} />;
}

function TraceBody({ t, tab: tab0, onTab, logsOverride }: { t: TraceView; tab: Tab; onTab: (t: Tab) => void; logsOverride?: LogLine[] }) {
  const [tab, setTab] = useState<Tab>(tab0);
  const pick = (x: Tab) => { setTab(x); onTab(x); };
  const s = t.summary;
  const [sel, setSel] = useState<string | null>(s.stoppedAt?.spanId ?? t.spans[0]?.spanId ?? null);
  const span = t.spans.find((x) => x.spanId === sel) ?? null;
  const logs = useLogs(logsOverride ? null : { window: '24h', traceId: t.traceId });
  const ev = useEvidence({ traceId: t.traceId }, tab === 'bang-chung');
  const level = s.outcome === 'error' ? 'bad' : s.outcome === 'rejected' ? 'rej' : 'ok';
  const lines = logsOverride ?? logs.data?.lines ?? [];

  return (
    <>
      <Answer level={level} title="Chuyện gì đã xảy ra">
        <ul>
          <li><OutcomeTag outcome={s.outcome} /> {when(t.startedAt)} · {Math.round(t.durationMs * 10) / 10} ms · trace <CopyCode value={t.traceId} short={8} /></li>
          {s.lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
        {/* [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: tình huống khớp → màn Kịch bản (U7) */}
        {s.playbook && <Link to={`/dev/kich-ban?th=${s.playbook}`}>Làm gì tiếp — kịch bản {s.playbook} →</Link>}
      </Answer>
      <div className="dev-cols">
        <div className="card">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'cay'} className={`tab${tab === 'cay' ? ' active' : ''}`} onClick={() => pick('cay')}>Cây span ({t.spans.length})</button>
            <button type="button" role="tab" aria-selected={tab === 'log'} className={`tab${tab === 'log' ? ' active' : ''}`} onClick={() => pick('log')}>Log cùng trace{lines.length ? ` (${lines.length})` : ''}</button>
            <button type="button" role="tab" aria-selected={tab === 'bang-chung'} className={`tab${tab === 'bang-chung' ? ' active' : ''}`} onClick={() => pick('bang-chung')}>Bằng chứng{ev.data ? ` (${ev.data.length})` : ''}</button>
          </div>
          {tab === 'cay' && <>
            <Waterfall spans={t.spans} total={t.durationMs} selected={sel} onSelect={setSel} />
            <Src>nguồn: core.devtools.trace — Tempo, đã kiểm trace thuộc đơn vị; thuộc tính lọc theo danh sách cho phép</Src>
          </>}
          {tab === 'log' && <>
            {!logsOverride && logs.isLoading ? <Loading /> : !logsOverride && logs.error ? <ErrorBox error={errorText(logs.error)} /> : <LogTable lines={lines} hideTrace />}
            <Src>nguồn: core.devtools.logs — Loki, cùng traceId, 24 giờ gần nhất, trường theo danh sách cho phép</Src>
          </>}
          {tab === 'bang-chung' && <>
            {ev.isLoading ? <Loading /> : ev.error ? <ErrorBox error={errorText(ev.error)} /> : !ev.data?.length
              ? <div className="empty">Trace này không ghi bằng chứng (yêu cầu đọc, hoặc bị từ chối trước khi tới action ghi).</div>
              : (
                <div className="table-wrap"><table className="grid">
                  <thead><tr><th>Lúc</th><th>Action</th><th>Đối tượng</th><th>Người gọi</th><th>Kết quả</th></tr></thead>
                  <tbody>{ev.data.map((e) => (
                    <tr key={e.id}><td>{clock(e.at)}</td><td><code>{e.action}</code></td><td>{e.object.type}{e.object.id ? <> · <code>{e.object.id}</code></> : null}</td><td className="mono">{e.actor.kind}</td>
                      <td>{e.result.ok ? <OutcomeTag outcome="ok" /> : <><OutcomeTag outcome="rejected" /> <code>{e.result.code}</code></>}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            <Src>nguồn: core.devtools.evidence — audit_logs của đơn vị, chỉ cột mô tả (không dữ liệu trước / sau)</Src>
          </>}
        </div>
        <div className="card card-body dev-span">
          {span ? <>
            <h3>{span.name}</h3>
            <dl className="dev-kv">
              <dt>Kết quả</dt><dd><OutcomeTag outcome={span.outcome} /></dd>
              <dt>Loại</dt><dd>{span.kind}</dd>
              <dt>Bắt đầu</dt><dd>+{span.startMs} ms</dd>
              <dt>Thời gian</dt><dd>{span.durationMs} ms</dd>
              {Object.entries(span.attributes).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd><code>{String(v)}</code></dd></Fragment>)}
              {span.events.map((e, i) => <Fragment key={`ev-${i}`}><dt>sự kiện</dt><dd>{e.name}{e.exceptionType ? <> · <code>{e.exceptionType}</code></> : null}</dd></Fragment>)}
            </dl>
            <p className="muted" style={{ fontSize: 12 }}>Chế độ Đơn vị không hiện thông điệp / ngăn xếp lỗi (D019-7) — cần thì gửi mã cho vận hành.</p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <Link className="btn btn-sm" to={`/dev/nhat-ky?traceId=${t.traceId}`}>Log của trace</Link>
              {t.links.grafana && <a className="btn btn-sm" href={t.links.grafana} target="_blank" rel="noopener noreferrer">Mở trong Grafana ↗</a>}
            </div>
          </> : <div className="muted">Chọn một span bên trái.</div>}
        </div>
      </div>
    </>
  );
}

export function LogTable({ lines, hideTrace }: { lines: LogLine[]; hideTrace?: boolean }) {
  if (!lines.length) return <div className="empty">Không có dòng log nào khớp.</div>;
  return (
    <div className="table-wrap"><table className="grid">
      <thead><tr><th>Lúc</th><th>Mức</th><th>Sự việc / route</th><th>Mã</th><th style={{ textAlign: 'right' }}>ms</th>{!hideTrace && <th>Trace</th>}<th>Yêu cầu</th></tr></thead>
      <tbody>{lines.map((l, i) => (
        <tr key={`${l.time}-${i}`}>
          <td title={when(l.time)}>{clock(l.time)}</td>
          <td className={`dev-lv ${l.level}`}>{l.level}</td>
          <td>{l.route ? <><code>{l.method} {l.route}</code>{l.status ? <> · {l.status}</> : null}</> : l.evt ? <code>{l.evt}</code> : null}{l.docType ? <> · {l.docType}</> : null}{l.docKey ? <> · <code>{l.docKey}</code></> : null}{!l.route && !l.evt ? l.msg : null}{l.err?.type ? <> · <code>{l.err.type}</code></> : null}</td>
          <td>{l.errCode && <code>{l.errCode}</code>}</td>
          <td style={{ textAlign: 'right' }}>{l.ms ?? ''}</td>
          {!hideTrace && <td>{l.traceId && <CopyCode value={l.traceId} short={8} to={`/dev/tra-ma?ma=${l.traceId}`} />}</td>}
          <td>{l.reqId && <CopyCode value={l.reqId} short={14} to={`/dev/tra-ma?ma=${encodeURIComponent(l.reqId)}`} />}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}
