/**
 * THỬ API (API01) — gọi thử mọi endpoint ngay trên giao diện, không cần Postman.
 *   - Danh sách endpoint đọc từ tài liệu OpenAPI máy chủ tự sinh (GET /api/docs/json), nhóm theo chủ đề, tìm theo đường dẫn / mô tả.
 *   - Chọn endpoint: điền tham số đường dẫn, tham số truy vấn, thân JSON (dựng sẵn khung theo khuôn của endpoint).
 *   - Xác thực: phiên đăng nhập hiện tại (Bearer) hoặc khoá API (X-Api-Key) — thử đúng như hệ thống ngoài gọi vào.
 *   - Kết quả: mã trạng thái, thời gian, JSON trả về; chép lệnh curl; nhớ 20 lần gửi gần nhất (theo máy).
 * Endpoint mới bạn phụ trách API viết (có schema zod) tự hiện ở đây, không phải khai thêm.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tokenStore } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';

type Json = Record<string, unknown>;
interface Op { id: string; method: string; path: string; tag: string; summary: string; params: { name: string; in: string; required?: boolean; description?: string }[]; body?: Json; isPublic: boolean }
interface Result { status: number; ms: number; text: string; at: string; method: string; url: string }

const METHOD_COLOR: Record<string, string> = { GET: '#0f9d58', POST: '#1f66a3', PUT: '#e8710a', PATCH: '#7b1fa2', DELETE: '#d93025' };
const HISTORY = 'ketoan.thu-api.history';
const readHistory = (): Result[] => { try { return JSON.parse(localStorage.getItem(HISTORY) ?? '[]') as Result[]; } catch { return []; } };

/** Khung JSON mẫu theo JSON schema (độ sâu tối đa 4). */
function example(s: unknown, depth = 0): unknown {
  const sc = (s ?? {}) as Json;
  if (depth > 4) return null;
  if (sc.example !== undefined) return sc.example;
  if (Array.isArray(sc.enum)) return sc.enum[0];
  if (sc.default !== undefined) return sc.default;
  const alt = (sc.anyOf ?? sc.oneOf ?? sc.allOf) as unknown[] | undefined;
  if (alt?.length) return example(alt.find((x) => (x as Json).type !== 'null') ?? alt[0], depth);
  const type = Array.isArray(sc.type) ? (sc.type as string[]).find((t) => t !== 'null') : sc.type;
  if (type === 'object' || sc.properties) {
    const out: Json = {};
    for (const [k, v] of Object.entries((sc.properties ?? {}) as Json)) out[k] = example(v, depth + 1);
    return out;
  }
  if (type === 'array') return [example(sc.items, depth + 1)];
  if (type === 'integer' || type === 'number') return 0;
  if (type === 'boolean') return false;
  if (sc.format === 'date') return new Date().toISOString().slice(0, 10);
  return '';
}

function parseOps(doc: Json): Op[] {
  const out: Op[] = [];
  for (const [path, item] of Object.entries((doc.paths ?? {}) as Json)) {
    for (const [m, raw] of Object.entries(item as Json)) {
      const op = raw as Json;
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(m)) continue;
      const content = ((op.requestBody as Json | undefined)?.content as Json | undefined)?.['application/json'] as Json | undefined;
      out.push({
        id: `${m.toUpperCase()} ${path}`, method: m.toUpperCase(), path, tag: ((op.tags as string[] | undefined) ?? ['Khác'])[0]!,
        summary: String(op.summary ?? ''), params: ((op.parameters ?? []) as Op['params']).filter((p) => p.in === 'path' || p.in === 'query'),
        body: content?.schema as Json | undefined, isPublic: Array.isArray(op.security) && (op.security as unknown[]).length === 0,
      });
    }
  }
  // Nhóm add-in xuống cuối; còn lại theo tên chủ đề, đường dẫn.
  const addin = (o: Op) => (o.path.includes('/addins/') ? 1 : 0);
  return out.sort((a, b) => addin(a) - addin(b) || a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path));
}

export function ThuApiPage() {
  const spec = useQuery({ queryKey: ['openapi'], queryFn: async () => (await (await fetch('/api/docs/json')).json()) as Json, staleTime: 60_000 });
  const ops = useMemo(() => (spec.data ? parseOps(spec.data) : []), [spec.data]);
  const [search, setSearch] = useState('');
  const [cur, setCur] = useState<Op | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [auth, setAuth] = useState<'session' | 'key'>('session');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>(readHistory);

  const shown = ops.filter((o) => !search || `${o.method} ${o.path} ${o.summary} ${o.tag}`.toLowerCase().includes(search.toLowerCase()));
  const groups = shown.reduce<Record<string, Op[]>>((g, o) => ({ ...g, [o.tag]: [...(g[o.tag] ?? []), o] }), {});
  const choose = (o: Op) => { setCur(o); setParams({}); setRes(null); setBody(o.body ? JSON.stringify(example(o.body), null, 2) : ''); };

  const url = () => {
    if (!cur) return '';
    let p = cur.path.replace(/\{(\w+)\}|:(\w+)/g, (_m, a, b) => encodeURIComponent(params[a ?? b] ?? ''));
    const qs = cur.params.filter((x) => x.in === 'query' && params[x.name]).map((x) => `${encodeURIComponent(x.name)}=${encodeURIComponent(params[x.name]!)}`).join('&');
    if (qs) p += `?${qs}`;
    return p;
  };
  const headers = (): Record<string, string> => ({
    accept: 'application/json',
    ...(cur && cur.method !== 'GET' && body.trim() ? { 'content-type': 'application/json' } : {}),
    ...(auth === 'key' ? { 'x-api-key': apiKey } : { authorization: `Bearer ${tokenStore.get() ?? ''}` }),
  });
  const send = async () => {
    if (!cur) return;
    if (cur.method !== 'GET' && body.trim()) { try { JSON.parse(body); } catch (e) { setRes({ status: 0, ms: 0, text: `JSON gửi đi không hợp lệ: ${(e as Error).message}`, at: '', method: cur.method, url: url() }); return; } }
    setBusy(true);
    const t0 = performance.now();
    try {
      const r = await fetch(url(), { method: cur.method, headers: headers(), body: cur.method !== 'GET' && body.trim() ? body : undefined });
      let text = await r.text();
      try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* không phải JSON */ }
      const out = { status: r.status, ms: Math.round(performance.now() - t0), text, at: new Date().toLocaleTimeString('vi-VN'), method: cur.method, url: url() };
      setRes(out);
      const h = [out, ...history].slice(0, 20).map((x) => ({ ...x, text: x.text.slice(0, 2000) }));
      setHistory(h);
      try { localStorage.setItem(HISTORY, JSON.stringify(h)); } catch { /* bỏ qua */ }
    } catch (e) {
      setRes({ status: 0, ms: Math.round(performance.now() - t0), text: `Không gọi được: ${(e as Error).message}`, at: '', method: cur.method, url: url() });
    } finally { setBusy(false); }
  };
  const curl = () => {
    if (!cur) return '';
    const h = Object.entries(headers()).map(([k, v]) => `-H '${k}: ${k === 'authorization' ? 'Bearer <token>' : k === 'x-api-key' ? '<khoá API>' : v}'`).join(' ');
    return `curl -X ${cur.method} '${window.location.origin}${url()}' ${h}${cur.method !== 'GET' && body.trim() ? ` -d '${body.replace(/'/g, "'\\''").replace(/\s*\n\s*/g, ' ')}'` : ''}`;
  };

  return (
    <>
      <PageHeader title="Thử API" code="API01" helpKey="thu-api" subtitle={`${ops.length} endpoint — chọn bên trái, điền tham số, bấm Gửi. Tài liệu đầy đủ: /api/docs`} />
      <ErrorBox error={spec.error ? 'Không đọc được tài liệu API (/api/docs/json)' : null} />
      {spec.isLoading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
          <div className="card" style={{ maxHeight: '78vh', overflow: 'auto' }}>
            <div style={{ padding: 8, position: 'sticky', top: 0, background: 'var(--surface)' }}>
              <input className="input" style={{ width: '100%' }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm: đường dẫn, mô tả, chủ đề" />
            </div>
            {Object.entries(groups).map(([tag, list]) => (
              <div key={tag}>
                <div className="module-home-section" style={{ padding: '8px 10px 2px' }}>{tag}</div>
                {list.map((o) => (
                  <button key={o.id} type="button" onClick={() => choose(o)} title={o.summary}
                    style={{ display: 'flex', gap: 6, width: '100%', textAlign: 'left', border: 0, padding: '4px 10px', cursor: 'pointer', fontSize: 12, background: cur?.id === o.id ? 'var(--brand-100)' : 'transparent' }}>
                    <b style={{ color: METHOD_COLOR[o.method], width: 46, flex: 'none' }}>{o.method}</b>
                    <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.path.replace('/api/v1', '')}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div>
            {!cur ? (
              <div className="card card-body muted">
                Chọn một endpoint bên trái để thử. Mọi phản hồi theo khuôn <code>{'{ ok, data | error }'}</code>.
                {history.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <b>Gửi gần đây</b>
                    {history.map((h, i) => <div key={i} className="mono" style={{ fontSize: 12 }}>{h.at} · <b style={{ color: METHOD_COLOR[h.method] }}>{h.method}</b> {h.url} → {h.status} ({h.ms} ms)</div>)}
                  </div>
                )}
              </div>
            ) : (
              <div className="card card-body">
                <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ color: METHOD_COLOR[cur.method] }}>{cur.method}</b>
                  <span className="mono" style={{ flex: 1 }}>{url()}</span>
                  {cur.isPublic && <span className="muted" style={{ fontSize: 12 }}>công khai (không cần đăng nhập)</span>}
                </div>
                <div className="muted" style={{ margin: '4px 0 10px' }}>{cur.summary}</div>
                {cur.params.length > 0 && (
                  <table className="grid-table" style={{ width: '100%', marginBottom: 10 }}>
                    <thead><tr><th style={{ width: 180 }}>Tham số</th><th style={{ width: 80 }}>Ở</th><th>Giá trị</th></tr></thead>
                    <tbody>
                      {cur.params.map((p) => (
                        <tr key={p.in + p.name}>
                          <td className="mono">{p.name}{p.required && <span className="neg"> *</span>}</td>
                          <td className="muted">{p.in === 'path' ? 'đường dẫn' : 'truy vấn'}</td>
                          <td><input className="input" style={{ width: '100%' }} value={params[p.name] ?? ''} placeholder={p.description ?? ''} onChange={(e) => setParams((x) => ({ ...x, [p.name]: e.target.value }))} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {cur.method !== 'GET' && (
                  <>
                    <div className="row" style={{ justifyContent: 'space-between' }}><b>Thân JSON gửi đi</b>{cur.body && <button type="button" className="btn btn-xs" onClick={() => setBody(JSON.stringify(example(cur.body), null, 2))}>Dựng lại khung mẫu</button>}</div>
                    <textarea className="input mono" style={{ width: '100%', minHeight: 180, fontSize: 12 }} value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />
                  </>
                )}
                <div className="row" style={{ gap: 8, alignItems: 'center', margin: '10px 0', flexWrap: 'wrap' }}>
                  <label className="checkbox"><input type="radio" checked={auth === 'session'} onChange={() => setAuth('session')} /> Phiên đăng nhập của tôi</label>
                  <label className="checkbox"><input type="radio" checked={auth === 'key'} onChange={() => setAuth('key')} /> Khoá API</label>
                  {auth === 'key' && <input className="input mono" style={{ width: 280 }} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="kt_… (Hệ thống → Khoá API)" />}
                  <span className="spacer" style={{ flex: 1 }} />
                  <button type="button" className="btn btn-sm" onClick={() => void navigator.clipboard?.writeText(curl())}>Chép lệnh curl</button>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void send()}>{busy ? 'Đang gửi…' : 'Gửi'}</button>
                </div>
                {cur.method !== 'GET' && <div className="alert alert-info" style={{ fontSize: 12 }}>Lệnh POST / PUT / DELETE ghi THẬT vào dữ liệu của đơn vị đang đăng nhập — thử trên bản test.</div>}
                {res && (
                  <div>
                    <div className="row" style={{ gap: 10 }}>
                      <b style={{ color: res.status >= 200 && res.status < 300 ? 'var(--good, #0f9d58)' : 'var(--bad, #d93025)' }}>{res.status || 'Lỗi'}</b>
                      <span className="muted">{res.ms} ms</span>
                      <button type="button" className="btn btn-xs" onClick={() => void navigator.clipboard?.writeText(res.text)}>Chép kết quả</button>
                    </div>
                    <pre className="mono" style={{ background: 'var(--line-soft, #f4f6f9)', padding: 10, borderRadius: 6, maxHeight: 420, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap' }}>{res.text}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
