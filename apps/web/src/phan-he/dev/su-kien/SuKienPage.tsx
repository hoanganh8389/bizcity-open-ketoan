// [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: màn Sự kiện (DEV06) — nơi nhận nào đang dồn / chết; dùng lại GET /api/v1/system/events
/**
 * SỰ KIỆN (DEV06): tình trạng giao sự kiện miền theo nơi nhận (core.events.status — sẵn có). Câu kết luận trước: nơi nhận có việc
 * hết lượt thử (chết), việc chờ lâu. Bộ lọc ?xem=tat-ca|chet|cho. Không nút phát lại (U8): phát lại cần settings:write + bằng chứng,
 * làm qua POST /api/v1/system/events/replay sau khi sửa subscriber (Sổ tay TH-06).
 */
import { useSearchParams } from 'react-router-dom';
import { devParams } from '@ketoan/contracts';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { errorText } from '@/lib/api';
import { useEvents, type EventsStatus } from '../api';
import { Answer, DevBanner, DevGuard, Src, when } from '../ui';

/** Chờ quá 5 phút là dồn (cảnh báo OutboxBacklog dùng ngưỡng cùng cỡ). */
const STALE_MS = 5 * 60_000;

export function SuKienPage() {
  const [params, setParams] = useSearchParams();
  const f = devParams('/dev/su-kien', params);
  const q = useEvents();
  return (
    <DevGuard>
      <PageHeader title="Sự kiện" code="DEV06" helpKey="ban-dieu-tra" subtitle="Nơi nhận sự kiện nào đang dồn, nơi nào có việc giao đã hết lượt thử" actions={
        <>
          <select className="select" value={f.xem} onChange={(e) => setParams({ xem: e.target.value })} aria-label="Xem">
            <option value="tat-ca">Mọi nơi nhận</option><option value="chet">Có việc chết</option><option value="cho">Có việc đang chờ</option>
          </select>
          <button type="button" className="btn" onClick={() => void q.refetch()}>Tải lại</button>
        </>
      } />
      <DevBanner />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : <Body s={q.data!} xem={f.xem!} />}
    </DevGuard>
  );
}

function Body({ s, xem }: { s: EventsStatus; xem: string }) {
  const now = Date.now();
  const moduleOf = new Map(s.subscribers.map((x) => [x.id, x]));
  const dead = s.consumers.filter((c) => c.dead > 0);
  const stale = s.consumers.filter((c) => c.pending > 0 && c.oldestPendingAt && now - new Date(c.oldestPendingAt).getTime() > STALE_MS);
  const rows = s.consumers.filter((c) => (xem === 'chet' ? c.dead > 0 : xem === 'cho' ? c.pending > 0 : true));
  return (
    <>
      <Answer level={dead.length ? 'bad' : stale.length ? 'warn' : 'ok'}>
        <ul>
          {dead.map((c) => <li key={c.consumer}>{c.dead} việc giao đã hết lượt thử ở <code>{c.consumer}</code> — sửa subscriber của module {moduleOf.get(c.consumer)?.module ?? '?'}, rồi phát lại cho đúng nơi nhận này (Sổ tay TH-06).</li>)}
          {stale.map((c) => <li key={c.consumer}><code>{c.consumer}</code> có {c.pending} việc chờ, lâu nhất từ {when(c.oldestPendingAt)} — nơi nhận chậm hoặc đồng hồ giao không chạy.</li>)}
          {!dead.length && !stale.length && <li>Mọi nơi nhận đều giao kịp ({s.consumers.length} nơi nhận, {s.subscribers.length} subscriber đang đăng ký).</li>}
        </ul>
      </Answer>
      <div className="card">
        {!rows.length ? <div className="empty">Không có nơi nhận nào khớp bộ lọc.</div> : (
          <div className="table-wrap"><table className="grid">
            <thead><tr><th>Nơi nhận</th><th>Module</th><th>Nghe</th><th style={{ textAlign: 'right' }}>Chờ</th><th style={{ textAlign: 'right' }}>Xong</th><th style={{ textAlign: 'right' }}>Chết</th><th>Chờ lâu nhất</th></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.consumer}>
                <td><code>{c.consumer}</code></td>
                <td>{moduleOf.get(c.consumer)?.module ?? <span className="muted">không đăng ký trong tiến trình này</span>}</td>
                <td>{moduleOf.get(c.consumer)?.on.map((t) => <code key={t} className="dev-code-chip">{t}</code>)}</td>
                <td style={{ textAlign: 'right' }}>{c.pending}</td>
                <td style={{ textAlign: 'right' }}>{c.done}</td>
                <td style={{ textAlign: 'right' }}>{c.dead ? <b className="text-bad">{c.dead}</b> : 0}</td>
                <td>{c.oldestPendingAt ? when(c.oldestPendingAt) : '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <Src>nguồn: GET /api/v1/system/events (core.events.status) — việc giao của đơn vị theo nơi nhận; phát lại: POST /api/v1/system/events/replay (settings:write, có bằng chứng)</Src>
      </div>
    </>
  );
}
