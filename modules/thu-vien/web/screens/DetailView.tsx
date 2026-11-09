/**
 * Chi tiết thư viện (26 §3): Mục (ô chọn thật LibraryPicker + bảng theo ngày / nhóm / chữ) · Phiên bản · Luật · Kiểm thử
 * (gọi đúng bộ kiểm của máy chủ core.library.validate) · Căn cứ (B3a: căn cứ từng mục, đơn vị xác nhận) · Cấu hình, Đề xuất (B3b). Nơi dùng có ở B5.
 */
import { useState } from 'react';
import { Empty, ErrorBox, Field, LibraryPicker, Loading, errorText, useApi, useMutation, useQuery, type LibraryItemsResult } from '@bizcity/ui-kit';
import { LEVEL_LABEL, conditionText, parseTestInput, shortHash, showValue, type LibraryEnvelope } from '../lib/thu-vien';
import { today, useLibraries } from './OverviewTab';
import { CanCuPanel } from './CanCuPanel';
import { CauHinhPanel } from './CauHinhPanel';
import { DeXuatPanel } from './DeXuatPanel';

type Sub = 'muc' | 'phien-ban' | 'luat' | 'can-cu' | 'cau-hinh' | 'de-xuat' | 'kiem';
const SUBS: { key: Sub; label: string }[] = [
  { key: 'muc', label: 'Mục' }, { key: 'phien-ban', label: 'Phiên bản' }, { key: 'luat', label: 'Luật' }, { key: 'can-cu', label: 'Căn cứ' }, { key: 'cau-hinh', label: 'Cấu hình' }, { key: 'de-xuat', label: 'Đề xuất' }, { key: 'kiem', label: 'Kiểm thử' },
];

interface Suggestion { value: unknown; label: string; why: string; confidence: string }
interface Finding { code: string; level: 'block' | 'warn' | 'info'; path: string; message: string; got?: unknown; expected?: unknown; suggestions: Suggestion[] }
interface ValidateResult { ok: boolean; library: { id: string; version: string; hash: string }; at: string; resolved?: string; value?: unknown; findings: Finding[] }

export function DetailView({ libId, onPick }: { libId: string | null; onPick: (id: string) => void }) {
  const libs = useLibraries();
  const id = libId ?? libs.data?.items[0]?.id ?? null;
  const [sub, setSub] = useState<Sub>('muc');
  const api = useApi();
  const env = useQuery({
    queryKey: ['thu-vien', 'get', id],
    queryFn: () => api.get<{ library: LibraryEnvelope; readme: string | null }>(`/api/v1/libraries/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
  if (libs.isLoading || (id && env.isLoading)) return <Loading />;
  if (libs.error) return <ErrorBox error={errorText(libs.error)} />;
  if (!id) return <Empty text="Chưa có thư viện nào." />;
  if (env.error) return <ErrorBox error={errorText(env.error)} />;
  const lib = env.data!.library;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {libs.data!.items.map((l) => (
          <button key={l.id} type="button" className={`btn btn-xs${l.id === id ? ' btn-primary' : ''}`} onClick={() => onPick(l.id)}>{l.id}</button>
        ))}
      </div>
      <h3 style={{ margin: '4px 0' }}><code>{lib.id}</code> · {lib.title} <span className="badge badge-info">v{lib.version}</span></h3>
      <p className="muted" style={{ margin: '0 0 8px' }}>
        {lib.description} · chủ duyệt: {lib.owner} · nguồn: {lib.sources.map((s) => s.title).join('; ')}
        {lib.generatedBy ? <> · sinh bằng <code>{lib.generatedBy}</code></> : null}
      </p>
      <div className="tabs">
        {SUBS.map((s) => (
          <button key={s.key} type="button" className={`tab${sub === s.key ? ' active' : ''}`} onClick={() => setSub(s.key)}>{s.label}</button>
        ))}
      </div>
      {sub === 'muc' ? <ItemsPanel lib={lib} /> : sub === 'phien-ban' ? <VersionsPanel lib={lib} /> : sub === 'luat' ? <RulesPanel lib={lib} /> : sub === 'can-cu' ? <CanCuPanel lib={lib} /> : sub === 'cau-hinh' ? <CauHinhPanel lib={lib} /> : sub === 'de-xuat' ? <DeXuatPanel lib={lib} /> : <TestPanel lib={lib} />}
      {env.data!.readme ? (
        <details style={{ marginTop: 12 }}><summary>Hướng dẫn của thư viện (README)</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{env.data!.readme}</pre></details>
      ) : null}
    </div>
  );
}

function ItemsPanel({ lib }: { lib: LibraryEnvelope }) {
  const api = useApi();
  const [at, setAt] = useState(today());
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const items = useQuery({
    queryKey: ['thu-vien', 'items', lib.id, at, q],
    queryFn: () => api.get<LibraryItemsResult>(`/api/v1/libraries/${encodeURIComponent(lib.id)}/items`, { at, q: q || undefined, limit: 200 }),
  });
  return (
    <div className="card"><div className="card-body">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 10 }}>
        <Field label="Ô chọn (LibraryPicker)" hint="Ô chọn mọi màn dùng chung; gõ không dấu cũng được."><LibraryPicker library={lib.id} value={picked} onChange={(v) => setPicked(v)} at={at} /></Field>
        <Field label="Ngày đọc giá trị"><input className="input" type="date" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <Field label="Lọc"><input className="input" value={q} placeholder="mã, tên…" onChange={(e) => setQ(e.target.value)} /></Field>
      </div>
      {items.isLoading ? <Loading /> : items.error ? <ErrorBox error={errorText(items.error)} /> : (
        <>
          <p className="muted">{items.data!.total} mục{lib.kind === 'param' ? ` có hiệu lực tại ${items.data!.at}` : ''} · hiện {items.data!.rows.length}</p>
          <table className="grid">
            <thead><tr><th>Mã</th><th>Tên</th><th>Nhóm</th>{lib.selector.showValueAt ? <th>Giá trị tại ngày</th> : null}<th>Duyệt</th><th>Ghi chú</th></tr></thead>
            <tbody>
              {items.data!.rows.map((r) => (
                <tr key={String(r.value)}>
                  <td><code>{String(r.value)}</code></td>
                  <td>{String(r.item.name ?? r.label)}</td>
                  <td>{r.group ?? '—'}</td>
                  {lib.selector.showValueAt ? <td>{showValue(r.valueAt)}</td> : null}
                  <td>{r.verified ? <span className="badge badge-ok">đã duyệt</span> : <span className="badge badge-gray">chưa duyệt</span>}</td>
                  <td className="muted">{r.hint ?? ''}{r.deprecated ? ' · ngừng dùng' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div></div>
  );
}

function VersionsPanel({ lib }: { lib: LibraryEnvelope }) {
  return (
    <div className="card"><div className="card-body">
      <table className="grid">
        <thead><tr><th>Bản</th><th>Ngày</th><th>Băm nội dung</th><th>Thay đổi</th></tr></thead>
        <tbody>{lib.changelog.map((c) => (
          <tr key={c.version}><td><span className="badge badge-info">{c.version}</span></td><td>{c.date}</td><td><code title={c.hash}>{shortHash(c.hash)}</code></td><td>{c.notes}</td></tr>
        ))}</tbody>
      </table>
      <p className="muted">Bản đã phát hành không sửa (băm cố định). Chứng từ ghi <code>{lib.id}:&lt;mã&gt;@{lib.version}</code> trong bằng chứng nên tính lại đúng giá trị cũ.</p>
    </div></div>
  );
}

function RulesPanel({ lib }: { lib: LibraryEnvelope }) {
  const rules = lib.rules ?? [];
  return (
    <div className="card"><div className="card-body">
      <p className="muted">Bảy kiểm chuẩn <code>LIB-*</code> chạy cho mọi thư viện (tra nghĩa ở trang Tra mã phát hiện, cổng L). Luật riêng của thư viện này:</p>
      {!rules.length ? <Empty text="Thư viện không có luật riêng." /> : (
        <table className="grid">
          <thead><tr><th>Mã</th><th>Mức</th><th>Khi nào</th><th>Vì sao</th><th>Cách sửa</th></tr></thead>
          <tbody>{rules.map((r) => (
            <tr key={r.code}>
              <td><code>{r.code}</code><div>{r.title}</div></td>
              <td><span className={`badge ${LEVEL_LABEL[r.level].badge}`}>{LEVEL_LABEL[r.level].text}</span></td>
              <td>{conditionText(r.when)}</td>
              <td>{r.why}</td>
              <td>{r.fix ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div></div>
  );
}

function TestPanel({ lib }: { lib: LibraryEnvelope }) {
  const api = useApi();
  const [code, setCode] = useState('');
  const [value, setValue] = useState('');
  const [at, setAt] = useState(today());
  const [override, setOverride] = useState(false);
  const run = useMutation({
    mutationFn: () => api.post<{ results: ValidateResult[] }>(`/api/v1/libraries/${encodeURIComponent(lib.id)}/validate`, { input: parseTestInput(code, value, override), at }),
  });
  const res = run.data?.results[0];
  return (
    <div className="card"><div className="card-body">
      <p className="muted">Chạy đúng bộ kiểm của máy chủ (<code>core.library.validate</code>) — không ghi gì. Core gợi ý, người dùng quyết.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <Field label="Mã"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="vd LUONG_CO_SO" /></Field>
        <Field label="Giá trị (tuỳ chọn)" hint="số, chữ, hoặc {…} để kiểm khuôn dữ liệu"><input className="input" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <Field label="Ngày chứng từ"><input className="input" type="date" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <Field label="Ghi đè"><label><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> đơn vị ghi đè giá trị</label></Field>
      </div>
      <button type="button" className="btn btn-primary" disabled={!code.trim() || run.isPending} onClick={() => run.mutate()}>Kiểm</button>
      {run.error ? <ErrorBox error={errorText(run.error)} /> : null}
      {res ? (
        <div style={{ marginTop: 10 }}>
          <div>
            <span className={`badge ${res.ok ? 'badge-ok' : 'badge-bad'}`}>{res.ok ? 'qua' : 'không qua'}</span>{' '}
            <span className="muted">{res.library.id}@{res.library.version} · tại {res.at}{res.resolved ? ` · mã chuẩn: ${res.resolved}` : ''}{res.value !== undefined ? ` · giá trị thư viện: ${showValue(res.value)}` : ''}</span>
          </div>
          {res.findings.length ? res.findings.map((f, i) => (
            <div key={i} className="card" style={{ marginTop: 6 }}><div className="card-body">
              <code>{f.code}</code> <span className={`badge ${LEVEL_LABEL[f.level].badge}`}>{LEVEL_LABEL[f.level].text}</span> {f.message}
              {f.suggestions.length ? (
                <div style={{ marginTop: 4 }}>
                  {f.suggestions.map((s, j) => (
                    <button key={j} type="button" className="btn btn-xs" style={{ marginRight: 6 }} title={s.why}
                      onClick={() => { if (f.path === 'code') setCode(String(s.value)); else setValue(String(s.value)); }}>
                      ↳ {s.label} <span className="muted">({s.why})</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div></div>
          )) : <p className="muted">Không có phát hiện.</p>}
        </div>
      ) : null}
    </div></div>
  );
}
