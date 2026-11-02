// [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: màn Lỗi theo module (DEV04) — module / chỗ hỏng nào lỗi nhiều nhất
/**
 * LỖI THEO MODULE (DEV04): core.devtools.module-errors. Câu kết luận trước (U1), rồi mỗi module một khối: chỗ hỏng (step / Kernel /
 * action / yêu cầu), số trace, mã lỗi, trace gần nhất (mở Tra mã). Hai loại kết quả tách hẳn (U2): lỗi kỹ thuật / từ chối đúng luật.
 * Bộ lọc trên địa chỉ (?window=&outcome=) — Kịch bản mở thẳng tới đây.
 */
import { useSearchParams } from 'react-router-dom';
import { devParams } from '@ketoan/contracts';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { errorText } from '@/lib/api';
import { useModuleErrors, type ModuleErrorsView } from '../api';
import { Answer, CopyCode, DevBanner, DevGuard, OutcomeTag, SourceOff, Src, when } from '../ui';

const KIND_LABEL = { step: 'bước', kernel: 'Kernel', action: 'action', request: 'yêu cầu' } as const;

export function LoiTheoModulePage() {
  const [params, setParams] = useSearchParams();
  const f = devParams('/dev/loi-theo-module', params);
  const q = useModuleErrors(f.window!, f.outcome!);
  const set = (k: string, v: string) => setParams({ ...f, [k]: v });
  const off = (q.error as { code?: string; details?: { backend?: string; reason?: string } } | null)?.code === 'NOT_READY';

  return (
    <DevGuard>
      <PageHeader title="Lỗi theo module" code="DEV04" helpKey="ban-dieu-tra" subtitle="Module nào, bước nào đang hỏng nhiều nhất — từ trace của đơn vị (≤ 50 trace mới nhất)" actions={
        <>
          <select className="select" value={f.outcome} onChange={(e) => set('outcome', e.target.value)} aria-label="Kết quả">
            <option value="error">Lỗi kỹ thuật</option><option value="rejected">Từ chối đúng luật</option>
          </select>
          <select className="select" value={f.window} onChange={(e) => set('window', e.target.value)} aria-label="Khoảng">
            <option value="1h">1 giờ</option><option value="6h">6 giờ</option><option value="24h">24 giờ</option><option value="7d">7 ngày</option>
          </select>
          <button type="button" className="btn" onClick={() => void q.refetch()}>Tải lại</button>
        </>
      } />
      <DevBanner />
      {q.isLoading ? <Loading /> : off ? <div className="card"><SourceOff name="Tempo" state={(q.error as { details?: { reason?: string } }).details?.reason === 'off' ? 'off' : 'down'} /></div>
        : q.error ? <ErrorBox error={errorText(q.error)} /> : <Body v={q.data!} />}
    </DevGuard>
  );
}

function Body({ v }: { v: ModuleErrorsView }) {
  const level = !v.traces ? 'ok' : v.outcome === 'error' ? 'bad' : 'rej';
  return (
    <>
      <Answer level={level}><ul>{v.lines.map((l, i) => <li key={i}>{l}</li>)}</ul></Answer>
      {v.modules.map((m) => (
        <div className="card dev-mod" key={m.module ?? '-'}>
          <div className="card-body dev-mod-head">
            <b>{m.module ?? '(không rõ module)'}</b> <span className="muted">{m.count} trace</span> <OutcomeTag outcome={v.outcome} />
          </div>
          <div className="table-wrap"><table className="grid">
            <thead><tr><th>Chỗ hỏng</th><th>Loại</th><th style={{ textAlign: 'right' }}>Trace</th><th>Mã lỗi</th><th>CSDL bên dưới</th><th>Gần nhất</th><th>Trace</th></tr></thead>
            <tbody>{m.places.map((p) => (
              <tr key={p.place}>
                <td><code>{p.place}</code></td>
                <td>{KIND_LABEL[p.kind]}</td>
                <td style={{ textAlign: 'right' }}>{p.count}</td>
                <td>{p.codes.map((c) => <span key={c.code} className="dev-code-chip"><code>{c.code}</code> {c.count}</span>)}</td>
                <td>{p.via ? <code>{p.via}</code> : null}</td>
                <td>{when(p.lastAt)}</td>
                <td><CopyCode value={p.traceId} short={8} to={`/dev/tra-ma?ma=${p.traceId}`} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      ))}
      <Src>nguồn: core.devtools.module-errors — Tempo, span khác ok của trace đơn vị (kể cả bước không mang mã đơn vị); chỗ hỏng chọn theo bậc step → Kernel → action → yêu cầu</Src>
    </>
  );
}
