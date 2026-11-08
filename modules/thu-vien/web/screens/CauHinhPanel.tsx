/**
 * Thẻ Cấu hình của Chi tiết thư viện (B3b, PHASE-030 · 26 §7.1): cấu hình của đơn vị cho thư viện này — bật / tắt (thư viện tuỳ chọn),
 * đọc theo ngày chứng từ / hôm nay (thư viện tham số), hạ mức luật của thư viện, giá trị ghi đè có ngày hiệu lực. Mỗi lần lưu là một
 * phiên bản mới (chỉ thêm), lý do bắt buộc; ghi đè rơi vào kỳ đã khoá bị chặn. Không đổi thư viện gốc.
 */
import { useEffect, useState } from 'react';
import { ErrorBox, Field, Loading, errorText, useApi, useCan, useMutation, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { LEVEL_LABEL, showValue, type LibraryEnvelope, type LibraryConfig, type LibraryConfigVersion } from '../lib/thu-vien';

interface ConfigResult { library: { id: string; version: string; optional: boolean }; current: LibraryConfigVersion | null; history: LibraryConfigVersion[] }
interface Row { code: string; from: string; value: string; reason: string }

export function CauHinhPanel({ lib }: { lib: LibraryEnvelope & { optional?: boolean } }) {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['thu-vien', 'config', lib.id], queryFn: () => api.get<ConfigResult>(`/api/v1/libraries/${encodeURIComponent(lib.id)}/config`) });
  const [enabled, setEnabled] = useState(true);
  const [atPolicy, setAtPolicy] = useState<'docDate' | 'today'>('docDate');
  const [levels, setLevels] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [reason, setReason] = useState('');
  useEffect(() => {
    const c: LibraryConfig = q.data?.current?.config ?? {};
    setEnabled(c.enabled !== false);
    setAtPolicy(c.atPolicy ?? 'docDate');
    setLevels(c.ruleLevels ?? {});
    setRows(Object.entries(c.overrides ?? {}).flatMap(([code, l]) => l.map((o) => ({ code, from: o.from, value: String(o.value), reason: o.reason }))));
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => {
      const config: LibraryConfig = {};
      if (q.data?.library.optional) config.enabled = enabled;
      if (lib.kind === 'param') config.atPolicy = atPolicy;
      const rl = Object.fromEntries(Object.entries(levels).filter(([, v]) => v === 'warn' || v === 'info')) as Record<string, 'warn' | 'info'>;
      if (Object.keys(rl).length) config.ruleLevels = rl;
      const ov: NonNullable<LibraryConfig['overrides']> = {};
      for (const r of rows) {
        if (!r.code.trim()) continue;
        const n = Number(r.value.replace(',', '.'));
        (ov[r.code.trim()] ??= []).push({ from: r.from, value: r.value.trim() !== '' && !Number.isNaN(n) ? n : r.value, reason: r.reason });
      }
      if (Object.keys(ov).length) config.overrides = ov;
      return api.post(`/api/v1/libraries/${encodeURIComponent(lib.id)}/config`, { config, reason });
    },
    onSuccess: () => { setReason(''); void qc.invalidateQueries({ queryKey: ['thu-vien'] }); },
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const canWrite = can('settings:write');
  const rules = lib.rules ?? [];
  const cur = q.data!.current;
  return (
    <div className="card"><div className="card-body">
      <p className="muted" style={{ marginTop: 0 }}>
        Cấu hình của đơn vị cho thư viện này {cur ? <>— đang dùng phiên bản <strong>{cur.version}</strong> ({cur.createdBy}, {cur.createdAt.slice(0, 10)}: {cur.reason})</> : '— chưa cấu hình, dùng nguyên thư viện'}.
        Giá trị đơn vị ghi đè được bộ kiểm và ô chọn dùng trước giá trị thư viện tại ngày.{canWrite ? '' : ' Bạn chỉ xem được — đổi cấu hình cần quyền cấu hình.'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {q.data!.library.optional ? (
          <Field label="Dùng thư viện này" hint="Thư viện tuỳ chọn — tắt thì đơn vị không tra / kiểm theo thư viện này.">
            <label><input type="checkbox" checked={enabled} disabled={!canWrite} onChange={(e) => setEnabled(e.target.checked)} /> bật</label>
          </Field>
        ) : <Field label="Dùng thư viện này"><span className="badge badge-info">bắt buộc</span></Field>}
        {lib.kind === 'param' ? (
          <Field label="Đọc giá trị theo">
            <select className="input" value={atPolicy} disabled={!canWrite} onChange={(e) => setAtPolicy(e.target.value as 'docDate' | 'today')}>
              <option value="docDate">ngày chứng từ</option><option value="today">hôm nay</option>
            </select>
          </Field>
        ) : null}
      </div>

      {rules.length ? (<>
        <h4>Mức luật của thư viện (chỉ hạ)</h4>
        <table className="grid"><thead><tr><th>Mã</th><th>Mức gốc</th><th>Mức ở đơn vị</th></tr></thead>
          <tbody>{rules.map((r) => (
            <tr key={r.code}><td><code>{r.code}</code> {r.title}</td><td><span className={`badge ${LEVEL_LABEL[r.level].badge}`}>{LEVEL_LABEL[r.level].text}</span></td>
              <td>{r.level === 'info' ? <span className="muted">không hạ được</span> : (
                <select className="input" value={levels[r.code] ?? ''} disabled={!canWrite} onChange={(e) => setLevels({ ...levels, [r.code]: e.target.value })}>
                  <option value="">như gốc</option>
                  {r.level === 'block' ? <option value="warn">cảnh báo</option> : null}
                  <option value="info">nhắc</option>
                </select>
              )}</td></tr>
          ))}</tbody></table>
        <p className="muted">Bảy kiểm chuẩn <code>LIB-*</code> không hạ được (toàn vẹn dữ liệu).</p>
      </>) : null}

      {lib.kind === 'param' ? (<>
        <h4>Giá trị đơn vị ghi đè</h4>
        <table className="grid"><thead><tr><th>Mã mục</th><th>Từ ngày</th><th>Giá trị</th><th>Lý do / căn cứ</th>{canWrite ? <th /> : null}</tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}>
              <td><input className="input" value={r.code} disabled={!canWrite} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} placeholder="vd GIO_LAM_VIEC_NGAY" /></td>
              <td><input className="input" type="date" value={r.from} disabled={!canWrite} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} /></td>
              <td><input className="input" value={r.value} disabled={!canWrite} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} /></td>
              <td><input className="input" value={r.reason} disabled={!canWrite} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} /></td>
              {canWrite ? <td><button type="button" className="btn btn-xs" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Bỏ</button></td> : null}
            </tr>
          ))}</tbody></table>
        {canWrite ? <button type="button" className="btn btn-xs" style={{ marginTop: 6 }} onClick={() => setRows([...rows, { code: '', from: new Date().toISOString().slice(0, 10), value: '', reason: '' }])}>Thêm dòng ghi đè</button> : null}
        <p className="muted">Ghi đè tham số loại <strong>luật</strong> được phép nhưng bảng đánh giá sẽ nhắc; ngày rơi vào kỳ đã khoá bị chặn.</p>
      </>) : null}

      {canWrite ? (
        <div style={{ marginTop: 10 }}>
          <Field label="Lý do đổi" hint="Bắt buộc — lưu cùng phiên bản cấu hình."><input className="input" style={{ width: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <button type="button" className="btn btn-primary" disabled={reason.trim().length < 5 || save.isPending} onClick={() => save.mutate()}>Lưu phiên bản cấu hình mới</button>
          {save.error ? <ErrorBox error={errorText(save.error)} /> : null}
        </div>
      ) : null}

      {q.data!.history.length ? (<>
        <h4>Lịch sử</h4>
        <table className="grid"><thead><tr><th>Bản</th><th>Lúc</th><th>Người</th><th>Lý do</th><th>Ghi đè</th></tr></thead>
          <tbody>{q.data!.history.map((h) => (
            <tr key={h.version}><td>{h.version}</td><td>{h.createdAt.slice(0, 16).replace('T', ' ')}</td><td>{h.createdBy}</td><td>{h.reason}</td>
              <td className="muted">{Object.entries(h.config.overrides ?? {}).map(([c, l]) => `${c}: ${l.map((o) => `${showValue(o.value)} từ ${o.from}`).join(', ')}`).join('; ') || '—'}</td></tr>
          ))}</tbody></table>
      </>) : null}
    </div></div>
  );
}
