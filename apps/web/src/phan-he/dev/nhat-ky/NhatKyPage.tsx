// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: màn Nhật ký (DEV03) — log kỹ thuật của đơn vị, bộ lọc ít, không ô truy vấn tự do
/**
 * NHẬT KÝ (DEV03): dòng log mới nhất của đơn vị (core.devtools.logs). Bộ lọc ít và đóng (D019-4): khoảng (≤ 24 giờ), mức, một ô
 * "mã lỗi / evt / route" — máy đoán loại theo khuôn (bắt đầu bằng / là route; VIẾT_HOA là mã lỗi; còn lại là evt). Không có ô
 * LogQL. Bộ lọc nằm trên địa chỉ (?window=&level=&q=&traceId=) để gửi link cho nhau; Tra mã / Tổng quan mở thẳng tới đây.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { errorText } from '@/lib/api';
import { TRACE_RE, useLogs, type LogQuery } from '../api';
import { CopyCode, DevBanner, DevGuard, Src } from '../ui';
import { LogTable } from '../tra-ma/TraMaPage';

/** Ô lọc chung → đúng một bộ lọc của API; sai khuôn → null (báo người dùng, không gửi). */
export function parseFilter(q: string): Pick<LogQuery, 'errCode' | 'evt' | 'route'> | null {
  const v = q.trim();
  if (!v) return {};
  if (v.startsWith('/')) return /^\/[A-Za-z0-9/_:.-]{0,200}$/.test(v) ? { route: v } : null;
  if (/^[A-Z][A-Z0-9_]{1,63}$/.test(v)) return { errCode: v };
  if (/^[a-z0-9][a-z0-9._-]{0,63}$/.test(v)) return { evt: v };
  return null;
}

export function NhatKyPage() {
  const [params, setParams] = useSearchParams();
  const window_ = (['1h', '6h', '24h'].includes(params.get('window') ?? '') ? params.get('window') : '1h') as LogQuery['window'];
  const level = params.get('level') ?? '';
  const q = params.get('q') ?? '';
  const traceId = params.get('traceId') ?? '';
  const [text, setText] = useState(q);
  const filter = parseFilter(q);
  const query: LogQuery | null = filter && (!traceId || TRACE_RE.test(traceId))
    ? { window: window_, ...(level ? { level } : {}), ...filter, ...(traceId ? { traceId: traceId.toLowerCase() } : {}) }
    : null;
  const logs = useLogs(query);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next);
  };

  return (
    <DevGuard>
      <PageHeader title="Nhật ký" code="DEV03" helpKey="ban-dieu-tra" subtitle="Log kỹ thuật của đơn vị mình · tối đa 24 giờ, 200 dòng mới nhất mỗi lần" />
      <DevBanner />
      <form className="dev-search" onSubmit={(e) => { e.preventDefault(); set('q', text.trim()); }}>
        <select className="select" value={window_} onChange={(e) => set('window', e.target.value)} aria-label="Khoảng">
          <option value="1h">1 giờ</option><option value="6h">6 giờ</option><option value="24h">24 giờ</option>
        </select>
        <select className="select" value={level} onChange={(e) => set('level', e.target.value)} aria-label="Mức">
          <option value="">mọi mức</option><option value="error">error</option><option value="warn">warn</option><option value="info">info</option>
        </select>
        <input className="input mono" value={text} onChange={(e) => setText(e.target.value)} placeholder="mã lỗi, evt, route… vd PERIOD_LOCKED, bizcity.devtools.query, /api/v1/vouchers" aria-label="Lọc" spellCheck={false} />
        <button type="submit" className="btn btn-primary">Lọc</button>
        <button type="button" className="btn" onClick={() => void logs.refetch()} disabled={!query}>Tải lại</button>
      </form>
      {traceId && <div className="dev-chip">Chỉ log của trace <CopyCode value={traceId} short={8} to={`/dev/tra-ma?ma=${traceId}`} /> <button type="button" className="btn btn-xs btn-ghost" onClick={() => set('traceId', '')}>bỏ</button></div>}
      {!filter && <ErrorBox error="Ô lọc nhận một trong ba: mã lỗi VIẾT_HOA (PERIOD_LOCKED), evt chữ thường (bizcity.ledger.posted), hoặc route bắt đầu bằng / (/api/v1/vouchers)." />}
      <div className="card">
        {logs.isLoading && query ? <Loading /> : logs.error ? <ErrorBox error={errorText(logs.error)} /> : <LogTable lines={logs.data?.lines ?? []} />}
        <Src>nguồn: core.devtools.logs — Loki, bộ lọc đơn vị do máy chủ gắn; trường theo danh sách cho phép</Src>
      </div>
    </DevGuard>
  );
}
