// [2026-11-19 Nguyễn Văn Thủy] chi tiết một lần lỗi cho dev (docs/nghiep-vu/25): mã tra cứu, màn, API, mã HTTP, câu gốc, mã lỗi kèm vì sao / cách sửa,
// nút mở log máy chủ trong Grafana (Loki) theo mã tra cứu; nút Chép đủ thông tin để báo lỗi (đóng góp)
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';

export type DongLoi = {
  id: string; at: string;
  data: {
    entity: string; key: string; action: string; ok: boolean; draft?: boolean; source?: 'form' | 'server'; screen?: string;
    method?: string; path?: string; status?: number; message?: string;
    failed: { code: string; level: string; title: string; field?: string }[]; user: string; requestId?: string;
  };
};
type Rule = { code: string; preview: { why: string; howTo?: string } };

/** Grafana Explore: log máy chủ (Loki, service api) chứa mã tra cứu. Đổi địa chỉ Grafana bằng VITE_GRAFANA_URL. */
export function grafanaLink(requestId: string, at: string) {
  const base = (import.meta.env.VITE_GRAFANA_URL as string | undefined) || `${window.location.protocol}//${window.location.hostname}:3000`;
  const t = Date.parse(at);
  const panes = { a: { datasource: 'loki', queries: [{ refId: 'A', expr: `{service="api"} |= "${requestId}"`, datasource: { type: 'loki', uid: 'loki' } }],
    range: { from: String(t - 10 * 60_000), to: String(t + 10 * 60_000) } } };
  return `${base}/explore?schemaVersion=1&orgId=1&panes=${encodeURIComponent(JSON.stringify(panes))}`;
}

export function vanBanLoi(r: DongLoi, ruleOf?: (c: string) => Rule | undefined) {
  const d = r.data;
  return [
    `Lúc: ${new Date(r.at).toLocaleString('vi-VN', { hour12: false })}`, `Người làm: ${d.user}`,
    `Nguồn: ${d.source === 'form' ? 'Form tự chặn (chưa gửi máy chủ)' : 'Máy chủ'}`,
    d.screen ? `Màn: ${d.screen}` : '', d.path ? `API: ${d.method ?? ''} ${d.path} → ${d.status ?? ''}` : '', `Đối tượng: ${d.entity}${d.key ? ` · bản ghi ${d.key}` : ''}`,
    d.message ? `Câu gốc: ${d.message}` : '',
    'Lỗi:', ...d.failed.map((f) => { const x = ruleOf?.(f.code); return `- ${f.code} (${f.level}): ${f.title}${x?.preview.howTo ? ` | Cách sửa: ${x.preview.howTo}` : ''}`; }),
    d.requestId ? `Mã tra cứu: ${d.requestId}` : '',
  ].filter(Boolean).join('\n');
}

/** Bộ quy tắc mọi danh mục (để hiện vì sao / cách sửa theo mã). */
export function useMoiQuyTac() {
  const q = useQuery({ queryKey: ['catalog-rules', 'all'], staleTime: 5 * 60_000, queryFn: async () => (await api.get<{ items: Rule[] }>('/api/v1/catalog-rules')).items });
  const m = new Map((q.data ?? []).map((r) => [r.code, r]));
  return (c: string) => m.get(c);
}

export function ChiTietLoi({ r }: { r: DongLoi }) {
  const ruleOf = useMoiQuyTac();
  const [daChep, setDaChep] = useState(false);
  const d = r.data;
  const o = (label: string, v?: string | number | null) => (v === undefined || v === null || v === '' ? null : <><dt>{label}</dt><dd>{v}</dd></>);
  return (
    <div className="ctl">
      <dl className="ctl-dl">
        {o('Lúc', new Date(r.at).toLocaleString('vi-VN', { hour12: false }))}
        {o('Người làm', d.user)}
        {o('Nguồn', d.source === 'form' ? 'Form tự chặn trên trình duyệt (chưa gửi máy chủ)' : 'Máy chủ')}
        {o('Màn', d.screen)}
        {o('API', d.path ? `${d.method ?? ''} ${d.path}` : undefined)}
        {o('Mã HTTP', d.status)}
        {o('Đối tượng', `${d.entity}${d.key ? ` · bản ghi ${d.key}` : ''}`)}
        {o('Câu gốc', d.message)}
        {o('Mã tra cứu', d.requestId)}
      </dl>
      <table className="mh-mini" style={{ marginTop: 6 }}>
        <thead><tr><th style={{ width: 130 }}>Mã lỗi</th><th>Báo</th><th>Vì sao</th><th>Cách sửa</th></tr></thead>
        <tbody>{d.failed.map((f, i) => { const x = ruleOf(f.code); return (
          <tr key={i}><td className="mono" style={{ color: f.level === 'block' ? 'var(--bad)' : undefined }}>{f.code}</td><td>{f.title}</td>
            <td className="muted" style={{ fontSize: 12 }}>{x?.preview.why ?? (f.code.startsWith('FORM') || !x ? 'Chưa có mã chi tiết — cần khai quy tắc (docs/nghiep-vu/25 §6)' : '')}</td>
            <td className="muted" style={{ fontSize: 12 }}>{x?.preview.howTo ?? ''}</td></tr>); })}</tbody>
      </table>
      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <button type="button" className="btn btn-xs" onClick={() => { void navigator.clipboard?.writeText(vanBanLoi(r, ruleOf)); setDaChep(true); setTimeout(() => setDaChep(false), 1500); }}><Copy size={12} /> {daChep ? 'Đã chép' : 'Chép đủ thông tin'}</button>
        {d.requestId && d.source !== 'form' && <a className="btn btn-xs" href={grafanaLink(d.requestId, r.at)} target="_blank" rel="noreferrer" title="Mở log máy chủ của lần lưu này trong Grafana (Loki) — cho dev"><ExternalLink size={12} /> Log máy chủ (Grafana)</a>}
      </div>
    </div>
  );
}
