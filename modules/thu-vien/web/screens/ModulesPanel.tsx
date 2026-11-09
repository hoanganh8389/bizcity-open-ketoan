// [2026-11-09 01:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-51a (B5a, PHASE-030 · 26 §4.1 ④ / §9): lớp "Module" của Tổng quan HT14 — module nào khai libraries[], dùng thế nào 30 ngày, kết luận thời gian chạy
/**
 * Bảng module dùng thư viện (core.library.modules). Kết luận ở đây là phần THỜI GIAN CHẠY (manifest + cấu hình đơn vị + số đếm 30 ngày);
 * phần tĩnh — mã cứng trùng thư viện, khai mà không dùng — do SC-LIB-2 kiểm khi `npx bizcity module check <key>`.
 */
import { Empty, ErrorBox, Loading, errorText, useApi, useQuery } from '@bizcity/ui-kit';
import { MODULE_VERDICT_LABEL, usagePct, type ModulesReport } from '../lib/thu-vien';

export function ModulesPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const api = useApi();
  const q = useQuery({ queryKey: ['thu-vien', 'modules'], queryFn: () => api.get<ModulesReport>('/api/v1/libraries/modules') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={`Không đọc được bảng module: ${errorText(q.error)}`} />;
  const items = q.data?.items ?? [];
  if (!items.length) {
    return <Empty text="Chưa module nào khai libraries[] trong bizcity.module.json hoặc gọi ctx.libraries. Khai thư viện module dùng để module hiện ở đây với kết luận ĐẠT / KHÔNG ĐẠT." />;
  }
  return (
    <div className="card">
      <table className="grid">
        <thead><tr><th>Module</th><th>Thư viện đã khai</th><th>Lượt 30 ngày</th><th>Kết luận (thời gian chạy)</th></tr></thead>
        <tbody>{items.map((m) => {
          const v = MODULE_VERDICT_LABEL[m.verdict.status];
          const passPct = usagePct(m.usage.pass, m.usage);
          return (
            <tr key={m.module}>
              <td><code>{m.module}</code><div className="muted">{m.label}</div></td>
              <td>{m.libraries.length ? m.libraries.map((l) => (
                <div key={l.id}>
                  <button type="button" className="btn btn-xs" disabled={!l.exists} onClick={() => onOpen(l.id)}>{l.id}</button>
                  {l.required ? <span className="badge badge-info" style={{ marginLeft: 4 }}>bắt buộc</span> : null}
                  {!l.exists ? <span className="badge badge-bad" style={{ marginLeft: 4 }}>không có</span> : null}
                  {l.exists && !l.enabled ? <span className="badge badge-warn" style={{ marginLeft: 4 }}>đơn vị đã tắt</span> : null}
                  <span className="muted" style={{ marginLeft: 6 }}>{l.calls.toLocaleString('vi-VN')} lượt</span>
                </div>
              )) : <span className="muted">chưa khai</span>}</td>
              <td>{m.usage.total.toLocaleString('vi-VN')}{passPct === null ? '' : ` · ${passPct} % qua`}{m.usage.block ? ` · ${m.usage.block} chặn` : ''}{m.usage.deprecated ? ` · ${m.usage.deprecated} mã ngừng` : ''}</td>
              <td>
                <span className={`badge ${v.badge}`}>{v.text}</span>
                {m.verdict.reasons.map((r) => <div key={r} className="muted" style={{ fontSize: 12 }}>{r}</div>)}
              </td>
            </tr>
          );
        })}</tbody>
      </table>
      <p className="muted" style={{ padding: '0 12px' }}>
        Chỉ là phần thời gian chạy. Mã cứng trùng thư viện và thư viện khai mà không dùng do <code>SC-LIB-2</code> kiểm: <code>npx bizcity module check &lt;key&gt;</code>.
      </p>
    </div>
  );
}
