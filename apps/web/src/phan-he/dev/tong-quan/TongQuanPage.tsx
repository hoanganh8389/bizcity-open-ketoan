// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: màn Tổng quan (DEV01) — câu kết luận trước, sáu ô, trace lỗi gần đây
/**
 * TỔNG QUAN (DEV01): core.devtools.summary. Câu kết luận trước (U1); sáu ô, ô nào cũng dẫn sang màn chi tiết; bảng trace có kết
 * quả khác ok gần đây (mở Tra mã). Nguồn nào chưa bật thì ô đó nói rõ (U5) — phần đọc CSDL (sự kiện, tự chẩn đoán) vẫn có.
 */
import { Link, useSearchParams } from 'react-router-dom';
import { devParams } from '@ketoan/contracts';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { errorText } from '@/lib/api';
import { useSummary, type DevSummary } from '../api';
import { Answer, CopyCode, DevBanner, DevGuard, OutcomeTag, SourceOff, Src, when } from '../ui';

export function TongQuanPage() {
  // [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: khoảng trên địa chỉ (?window=24h) — Kịch bản TH-03, TH-08 mở 24 giờ
  const [params, setParams] = useSearchParams();
  const win = devParams('/dev/tong-quan', params).window as '1h' | '24h';
  const setWin = (w: '1h' | '24h') => setParams(w === '1h' ? {} : { window: w });
  const q = useSummary(win);
  return (
    <DevGuard>
      <PageHeader title="Tổng quan" code="DEV01" helpKey="ban-dieu-tra" subtitle="Đơn vị mình có lỗi gì, ở đâu — từ log, trace và sổ" actions={
        <>
          <select className="select" value={win} onChange={(e) => setWin(e.target.value as '1h' | '24h')} aria-label="Khoảng"><option value="1h">1 giờ qua</option><option value="24h">24 giờ qua</option></select>
          <button type="button" className="btn" onClick={() => void q.refetch()}>Tải lại</button>
        </>
      } />
      <DevBanner />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : <Body s={q.data!} />}
    </DevGuard>
  );
}

function Body({ s }: { s: DevSummary }) {
  const label = s.window === '1h' ? '1 giờ' : '24 giờ';
  const firstError = s.recent.traces.find((t) => t.attributes['bizcity.outcome'] === 'error') ?? s.recent.traces[0];
  return (
    <>
      <Answer level={s.level} title={s.level === 'ok' ? 'Ổn' : 'Cần xem'}>
        <ul>{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        {firstError && <Link to={`/dev/tra-ma?ma=${firstError.traceId}`}>Mở trace mới nhất →</Link>}
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>cập nhật {when(s.generatedAt)}</div>
      </Answer>
      <div className="dev-kpis">
        <Kpi title="Lỗi kỹ thuật" value={s.errors.state === 'up' ? s.errors.error : '—'} tone={s.errors.error ? 'bad' : 'ok'} hint={s.errors.state === 'up' ? `${label} · ${s.errors.byCode.filter((c) => c.kind === 'error').map((c) => `${c.code} ${c.count}`).join(' · ') || 'không có'}` : 'Loki chưa bật'} to="/dev/nhat-ky?level=error" />
        <Kpi title="Từ chối đúng luật" value={s.errors.state === 'up' ? s.errors.rejected : '—'} tone={s.errors.rejected ? 'warn' : 'ok'} hint={s.errors.byCode.filter((c) => c.kind === 'rejected').slice(0, 3).map((c) => `${c.code} ${c.count}`).join(' · ') || 'không phải sự cố'} to="/dev/nhat-ky?level=warn" />
        <Kpi title="Yêu cầu chậm > 1 s" value={s.slow.state === 'up' ? s.slow.count : '—'} tone={s.slow.count ? 'warn' : 'ok'} hint={s.slow.state === 'up' ? label : 'Loki chưa bật'} to="/dev/nhat-ky" />
        <Kpi title="Sự kiện chết" value={s.events.dead} tone={s.events.dead ? 'warn' : 'ok'} hint={s.events.deadConsumers.join(', ') || 'không có'} />
        <Kpi title="Sự kiện đang chờ" value={s.events.pending} tone="ok" hint={s.events.oldestPendingAt ? `chờ lâu nhất từ ${when(s.events.oldestPendingAt)}` : 'không có'} />
        <Kpi title="Tự chẩn đoán sổ (L3)" value={!s.diagnostics ? '—' : s.diagnostics.errorCount ? `${s.diagnostics.errorCount} lỗi` : 'ĐẠT'} tone={s.diagnostics?.errorCount ? 'bad' : 'ok'} hint={s.diagnostics ? when(s.diagnostics.at) : 'chưa chạy lần nào'} />
      </div>
      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}><b>Trace có lỗi / bị từ chối gần đây</b></div>
        {s.recent.state !== 'up' ? <SourceOff name="Tempo" state={s.recent.state} /> : !s.recent.traces.length ? <div className="empty">Không có trace nào có kết quả khác ok trong {label} qua.</div> : (
          <div className="table-wrap"><table className="grid">
            <thead><tr><th>Lúc</th><th>Yêu cầu</th><th>Kết quả</th><th>Module</th><th>Mã</th><th style={{ textAlign: 'right' }}>ms</th><th>Trace</th></tr></thead>
            <tbody>{s.recent.traces.map((t) => (
              <tr key={t.traceId}>
                <td>{when(t.startedAt)}</td>
                <td><code>{t.rootName.replace(/^HTTP /, '')}</code></td>
                <td><OutcomeTag outcome={String(t.attributes['bizcity.outcome'] ?? '')} /></td>
                <td>{String(t.attributes['bizcity.module'] ?? '')}</td>
                <td>{t.attributes['bizcity.error.code'] ? <code>{String(t.attributes['bizcity.error.code'])}</code> : null}</td>
                <td style={{ textAlign: 'right' }}>{t.durationMs}</td>
                <td><CopyCode value={t.traceId} short={8} to={`/dev/tra-ma?ma=${t.traceId}`} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <Src>nguồn: core.devtools.summary — Loki (lỗi theo mã, yêu cầu chậm), Tempo (trace lỗi), CSDL (sự kiện, tự chẩn đoán); bộ lọc đơn vị do máy chủ gắn</Src>
      </div>
    </>
  );
}

function Kpi({ title, value, tone, hint, to }: { title: string; value: number | string; tone: 'ok' | 'warn' | 'bad'; hint: string; to?: string }) {
  return (
    <div className="card kpi dev-kpi">
      <div className="label">{title}</div>
      <div className={`value ${tone}`}>{value}</div>
      <div className="hint">{hint}</div>
      {to && <Link to={to} className="dev-kpi-link">xem →</Link>}
    </div>
  );
}
