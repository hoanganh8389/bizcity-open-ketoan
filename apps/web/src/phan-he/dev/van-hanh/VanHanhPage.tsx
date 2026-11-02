// [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W5: màn Vận hành (DEV09) — sức khoẻ toàn hệ, cảnh báo đang bật, link bảng Grafana
/**
 * VẬN HÀNH (DEV09): chỉ mở ở chế độ Vận hành (Q019-2 — bản cài một đơn vị + DEVTOOLS_OPS=true + chủ đơn vị; core.devtools.status
 * báo `mode` và lý do chưa mở). Mười số đo theo danh sách PromQL cố định (cùng biểu thức các cảnh báo trong alerts.yml), cảnh báo
 * đang bật của Alertmanager, link 9 bảng Grafana. Link Grafana mở tab mới, Grafana tự đăng nhập riêng — không nhúng (D019-1).
 */
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { errorText } from '@/lib/api';
import { useDevStatus, useOpsAlerts, useOpsHealth, type OpsAlert, type OpsHealth } from '../api';
import { Answer, DevBanner, DevGuard, Src, when } from '../ui';

export function VanHanhPage() {
  const st = useDevStatus();
  const on = st.data?.mode === 'ops';
  const health = useOpsHealth(on);
  const alerts = useOpsAlerts(on);
  return (
    <DevGuard>
      <PageHeader title="Vận hành" code="DEV09" helpKey="ban-dieu-tra" subtitle="Sức khoẻ toàn hệ thống, cảnh báo đang bật — chỉ bản cài một đơn vị" actions={
        on && <button type="button" className="btn" onClick={() => { void health.refetch(); void alerts.refetch(); }}>Tải lại</button>
      } />
      <DevBanner />
      {st.isLoading ? <Loading /> : st.error ? <ErrorBox error={errorText(st.error)} /> : !on ? (
        <Answer level="warn" title="Chế độ Vận hành chưa mở">
          <p>{st.data?.opsBlocked ?? 'Bản cài chưa bật DEVTOOLS_OPS=true.'}</p>
          <p>Chế độ này chỉ dành cho <b>chủ đơn vị</b> ở bản cài có <b>đúng một đơn vị</b> và đặt <code>DEVTOOLS_OPS=true</code> (Q019-2). Bản cài nhiều đơn vị: người vận hành xem Prometheus / Grafana trực tiếp.</p>
        </Answer>
      ) : (
        <>
          {health.isLoading ? <Loading /> : health.error ? <ErrorBox error={errorText(health.error)} /> : <Health h={health.data!} />}
          {alerts.isLoading ? <Loading /> : alerts.error ? <ErrorBox error={errorText(alerts.error)} /> : <Alerts list={alerts.data!} />}
        </>
      )}
    </DevGuard>
  );
}

function fmt(unit: OpsHealth['probes'][number]['unit'], v: number | null): string {
  if (v === null || Number.isNaN(v)) return 'không có dữ liệu';
  if (unit === 'bool') return v >= 1 ? 'chạy' : 'KHÔNG chạy';
  if (unit === 'ratio') return `${Math.round(v * 1000) / 10}%`;
  if (unit === 'seconds') return v >= 3600 ? `${Math.round(v / 360) / 10} giờ` : v >= 60 ? `${Math.round(v / 6) / 10} phút` : `${Math.round(v * 100) / 100} giây`;
  return String(Math.round(v));
}

function Health({ h }: { h: OpsHealth }) {
  return (
    <>
      <Answer level={h.level} title={h.level === 'ok' ? 'Toàn hệ ổn' : 'Cần xem'}>
        <ul>{h.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>cập nhật {when(h.generatedAt)}</div>
      </Answer>
      <div className="dev-kpis">
        {h.probes.map((p) => (
          <div className="card kpi dev-kpi" key={p.key}>
            <div className="label">{p.label}</div>
            <div className={`value ${p.level === 'none' ? '' : p.level}`}>{fmt(p.unit, p.value)}</div>
            <div className="hint">cảnh báo <code>{p.alert}</code></div>
            {p.dashboard && <a className="dev-kpi-link" href={p.dashboard} target="_blank" rel="noopener noreferrer">Grafana ↗</a>}
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}><b>Bảng Grafana</b> <span className="muted">— mở tab mới, Grafana đăng nhập riêng</span></div>
        <div className="dev-links">
          {h.dashboards.map((d) => d.url
            ? <a key={d.uid} className="btn btn-sm" href={d.url} target="_blank" rel="noopener noreferrer">{d.title} ↗</a>
            : <span key={d.uid} className="btn btn-sm" aria-disabled="true" title="Chưa đặt DEVTOOLS_GRAFANA_URL">{d.title}</span>)}
        </div>
        <Src>nguồn: core.devtools.ops.health — Prometheus, danh sách PromQL cố định (không nhận tham số); link: DEVTOOLS_GRAFANA_URL</Src>
      </div>
    </>
  );
}

function Alerts({ list }: { list: OpsAlert[] }) {
  return (
    <div className="card">
      <div className="card-body" style={{ paddingBottom: 0 }}><b>Cảnh báo đang bật</b> <span className="muted">({list.length})</span></div>
      {!list.length ? <div className="empty">Không có cảnh báo nào đang bật.</div> : (
        <div className="table-wrap"><table className="grid">
          <thead><tr><th>Cảnh báo</th><th>Mức</th><th>Từ</th><th>Tóm tắt</th><th>Làm gì</th></tr></thead>
          <tbody>{list.map((a) => (
            <tr key={`${a.name}-${a.startsAt}`}>
              <td><code>{a.name}</code></td>
              <td>{a.severity === 'critical' ? <span className="dev-tag err">critical</span> : <span className="dev-tag rej">{a.severity || '—'}</span>}</td>
              <td>{when(a.startsAt)}</td>
              <td><b>{a.summary}</b><div className="muted" style={{ fontSize: 12 }}>{a.description}</div></td>
              <td><code>{a.runbook}</code>{a.dashboard && <> · <a href={a.dashboard} target="_blank" rel="noopener noreferrer">Grafana ↗</a></>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <Src>nguồn: core.devtools.ops.alerts — Alertmanager, cảnh báo đang bật (không tính đã tắt tiếng / bị ức chế)</Src>
    </div>
  );
}
