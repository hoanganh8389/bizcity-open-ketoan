// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: thành phần dùng chung của Bàn điều tra — thẻ kết quả, dải nguồn, thời gian, cây span
/**
 * Thành phần dùng chung của phân hệ Nhà phát triển (20-KIEN-TRUC §4.3):
 *   U2  hai loại kết quả có CHỮ, không chỉ màu (từ chối đúng luật / lỗi kỹ thuật);
 *   U4  mã nào cũng chép được;
 *   U5  "chưa bật" khác "không có dữ liệu";
 *   U6  thời gian tương đối + tuyệt đối;
 *   U10 cây span đọc được ở khổ điện thoại.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Copy } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import type { Outcome, SourceState, SpanView } from './api';
import { useDevStatus } from './api';

export function OutcomeTag({ outcome }: { outcome: Outcome | string | undefined }) {
  if (outcome === 'error') return <span className="dev-tag err">lỗi kỹ thuật</span>;
  if (outcome === 'rejected') return <span className="dev-tag rej">từ chối đúng luật</span>;
  if (outcome === 'ok') return <span className="dev-tag ok">ok</span>;
  return <span className="dev-tag">{outcome ?? '—'}</span>;
}

export function KindTag({ kind }: { kind: 'rejected' | 'error' }) {
  return <OutcomeTag outcome={kind} />;
}

/** Khối kết luận đầu màn (U1): câu trả lời trước, dữ liệu sau. */
export function Answer({ level, title, children }: { level: 'ok' | 'warn' | 'bad' | 'rej'; title?: ReactNode; children: ReactNode }) {
  return <div className={`dev-answer ${level}`}>{title && <b>{title}</b>}{children}</div>;
}

/** Mã rút gọn bấm để chép (U4). */
export function CopyCode({ value, short = 12, to }: { value: string; short?: number; to?: string }) {
  const [ok, setOk] = useState(false);
  const text = value.length > short ? `${value.slice(0, short)}…` : value;
  const copy = () => {
    void navigator.clipboard?.writeText(value).then(() => { setOk(true); window.setTimeout(() => setOk(false), 1500); }, () => undefined);
  };
  return (
    <span className="dev-code" title={value}>
      {to ? <Link to={to}><code>{text}</code></Link> : <code>{text}</code>}
      <button type="button" className="dev-copy" onClick={copy} aria-label={`Chép ${value}`} title={ok ? 'Đã chép' : 'Chép'}><Copy size={11} /></button>
    </span>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
/** "3 phút trước (19:37:44)" — giờ máy người dùng (U6). */
export function when(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const s = Math.round((now - d.getTime()) / 1000);
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const rel = s < 45 ? 'vừa xong' : s < 3600 ? `${Math.round(s / 60)} phút trước` : s < 86400 ? `${Math.round(s / 3600)} giờ trước` : `${Math.round(s / 86400)} ngày trước`;
  return s >= 86400 ? `${rel} (${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${clock})` : `${rel} (${clock})`;
}

export function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const STATE_LABEL: Record<SourceState, string> = { up: '✓', off: 'chưa bật', down: 'không trả lời' };

/** Dải đầu màn: đơn vị đang xem + tình trạng nguồn (D019-2). Chế độ Vận hành: dải vàng. */
export function DevBanner() {
  const { user } = useAuth();
  const st = useDevStatus().data;
  const ops = st?.mode === 'ops';
  return (
    <div className={`dev-banner${ops ? ' ops' : ''}`}>
      {ops ? <><b>Chế độ Vận hành</b> — đang xem toàn hệ thống</> : <>Đơn vị: <b>{user?.tenant.name}</b> · chỉ thấy dữ liệu của đơn vị này</>}
      {st && <> · nguồn: Tempo {STATE_LABEL[st.sources.tempo]} · Loki {STATE_LABEL[st.sources.loki]} · CSDL ✓</>}
      {st?.opsBlocked && <span className="muted"> · {st.opsBlocked}</span>}
    </div>
  );
}

/** Nguồn chưa bật / không trả lời (U5) — khác "không có dữ liệu". */
export function SourceOff({ name, state }: { name: string; state: SourceState }) {
  return (
    <div className="dev-off">
      {state === 'off'
        ? <>Chưa bật {name} cho Bàn điều tra — đặt <code>DEVTOOLS_{name.toUpperCase()}_URL</code> (bộ giám sát đặt sẵn). Xem Sổ tay điều tra lỗi §0.</>
        : <>{name} không trả lời — xem Sổ tay điều tra lỗi TH-14.</>}
    </div>
  );
}

/** Màn của Bàn điều tra: người không có devtools:read thấy câu giải thích (API cũng trả 403). */
export function DevGuard({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  if (!can('devtools:read')) {
    return <div className="card card-body">Bàn điều tra dành cho <b>chủ đơn vị</b> và vai trò <b>Nhà phát triển</b>. Nhờ chủ đơn vị đổi vai trò ở màn Người dùng.</div>;
  }
  return <>{children}</>;
}

/** Cây span dạng thác: thụt lề theo cấp, thanh thời gian theo tỉ lệ; khổ hẹp ẩn thanh (U10). */
export function Waterfall({ spans, total, selected, onSelect }: { spans: SpanView[]; total: number; selected: string | null; onSelect: (id: string) => void }) {
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const depth = (s: SpanView): number => {
    let d = 0;
    let p = s.parentId ? byId.get(s.parentId) : undefined;
    while (p && d < 30) { d++; p = p.parentId ? byId.get(p.parentId) : undefined; }
    return d;
  };
  // Thứ tự cây: cha trước con, anh em theo thời gian bắt đầu.
  const kids = new Map<string | null, SpanView[]>();
  for (const s of spans) {
    const k = s.parentId && byId.has(s.parentId) ? s.parentId : null;
    kids.set(k, [...(kids.get(k) ?? []), s]);
  }
  const ordered: SpanView[] = [];
  const walk = (k: string | null) => { for (const s of (kids.get(k) ?? []).sort((a, b) => a.startMs - b.startMs)) { ordered.push(s); walk(s.spanId); } };
  walk(null);
  const t = total > 0 ? total : 1;
  return (
    <div className="dev-wf" role="list">
      {ordered.map((s) => (
        <button type="button" role="listitem" key={s.spanId} className={`dev-wf-row ${s.outcome}${selected === s.spanId ? ' on' : ''}`} onClick={() => onSelect(s.spanId)}>
          <span className="dev-wf-name" style={{ paddingLeft: depth(s) * 14 }}>
            {s.attributes['bizcity.layer'] === 'K' && <span className="dev-tag k">Kernel</span>}{s.name}
          </span>
          <span className="dev-wf-track"><span className="dev-wf-bar" style={{ left: `${(s.startMs / t) * 100}%`, width: `${Math.max(0.6, (s.durationMs / t) * 100)}%` }} /></span>
          <span className="dev-wf-dur">{s.durationMs < 1 ? s.durationMs.toFixed(2) : Math.round(s.durationMs)} ms</span>
        </button>
      ))}
    </div>
  );
}

/** Dòng "Nguồn" cuối khối — để người viết module biết dữ liệu đến từ đâu (bản mẫu §src). */
export function Src({ children }: { children: ReactNode }) {
  return <div className="dev-src">{children}</div>;
}
