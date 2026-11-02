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
import { devParams, nhatKyFilter } from '@ketoan/contracts';
import { TRACE_RE, useLogs, type LogQuery } from '../api';
import { CopyCode, DevBanner, DevGuard, Src } from '../ui';
import { LogTable } from '../tra-ma/TraMaPage';

export function NhatKyPage() {
  const [params, setParams] = useSearchParams();
  // [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: bộ lọc đọc bằng devParams / nhatKyFilter chung (@ketoan/contracts) — Kịch bản điền sẵn đúng khuôn này
  const f = devParams('/dev/nhat-ky', params);
  const window_ = f.window as LogQuery['window'];
  const level = f.level ?? '';
  const q = params.get('q') ?? '';
  const traceId = params.get('traceId') ?? '';
  const [text, setText] = useState(q);
  const filter = nhatKyFilter(q);
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
