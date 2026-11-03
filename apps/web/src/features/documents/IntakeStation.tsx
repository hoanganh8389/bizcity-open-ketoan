/**
 * Trạm kiểm tra đầu vào (PHASE-021 W3, ACC14) — ba thẻ đọc bể chờ, cạnh Chờ / Lỗi định khoản:
 *   Cần sửa      : chứng từ cửa nạp từ chối (mục `open`), điểm thấp trước;
 *   Đã xử lý     : mục đã đóng 7 ngày gần nhất (nguồn gửi lại đúng, nộp lại, chấp nhận, bỏ);
 *   Thử của tôi  : kết quả Kiểm thử đã lưu của người đang xem.
 * Khung chi tiết: câu kết luận → lỗi theo lớp (bấm trường nhảy tới ô, Vì sao / Sửa ở nguồn / Bài học) → chứng từ (ô hoặc JSON;
 * sửa thành bản vá chồng lên nguyên văn, bắt buộc lý do) → Kiểm thử · Nộp lại · Chấp nhận cảnh báo · Bỏ → lịch sử lần thử, so hai lần.
 * Mọi luật ở máy chủ (core.intake.*): màn không tự quyết lỗi nào chặn, không tự áp bản vá.
 */
import { useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DOC_TYPE_LABELS, INTAKE_CATALOG, type DocType, type IntakeCode, type IntakeFinding } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getLesson } from '@/help/guides';
import { DataGrid, type Column } from '@/components/DataGrid';
import { RemedyView } from '@/components/RemedyView';
import { Drawer, Empty, ErrorBox, Loading, Modal } from '@/components/ui';
import { dateTimeShort } from '@/components/voucher/VoucherListPage';

export type IntakeTab = 'inbox' | 'resolved' | 'trial';

interface InboxRow {
  id: string; received_at: string; last_seen_at: string; channel: string; source_system: string | null; actor: string; app_key: string | null;
  doc_key: string | null; doc_type: string | null; version: number | null; score: number; attempt_no: number; status: string;
  event_id: string | null; resolved_at: string | null; codes: string[]; patch_count: number; accepted_codes: string[];
}
interface PatchEntry { at: string; by: string; reason: string; score: number; codes: string[]; fixed: string[]; added: string[] }
interface InboxItem extends Omit<InboxRow, 'codes' | 'patch_count'> {
  payload_raw: unknown; current: unknown; findings: IntakeFinding[]; patches: PatchEntry[];
  door_error: { code: string; message: string } | null; resolution_note: string | null; resolved_by: string | null;
}

const LAYERS: [IntakeFinding['layer'], string][] = [['L1', 'Khuôn'], ['L2', 'Số học'], ['L3', 'Danh mục'], ['L4', 'Nghiệp vụ'], ['L5', 'Định khoản']];
const STATUS_TEXT: Record<string, string> = { open: 'Cần sửa', trial: 'Thử', resubmitted: 'Đã nộp lại', fixed_at_source: 'Nguồn đã sửa', accepted: 'Chấp nhận cảnh báo', dismissed: 'Đã bỏ' };
const CHANNEL_TEXT: Record<string, string> = { api: 'API', batch: 'nạp lô', submit: 'nộp có biên nhận', app: 'app', connector: 'kết nối', mcp: 'MCP', trial: 'Kiểm thử' };
const sourceText = (r: Pick<InboxRow, 'app_key' | 'source_system' | 'channel'>) => (r.app_key ? `app: ${r.app_key}` : r.source_system === 'manual' ? 'Nhập tay' : r.source_system ?? CHANNEL_TEXT[r.channel] ?? r.channel);
const typeText = (t: string | null) => (t ? DOC_TYPE_LABELS[t as DocType] ?? t : '—');

/** Ô chứng từ thường gặp; ô của phát hiện (đường khác) được thêm tự động. */
const BASE_FIELDS: [string, string][] = [
  ['docNo', 'Số chứng từ'], ['docDate', 'Ngày chứng từ'], ['branchCode', 'Chi nhánh'], ['version', 'Phiên bản'],
  ['partner.code', 'Mã đối tượng'], ['partner.taxCode', 'MST đối tượng'], ['invoice.no', 'Số hoá đơn'], ['invoice.date', 'Ngày hoá đơn'],
  ['totals.beforeTax', 'Tiền trước thuế'], ['totals.tax', 'Tổng thuế'], ['totals.total', 'Tổng thanh toán'],
];
/** `lines[2].qty` → `/lines/2/qty` (JSON Pointer cho bản vá RFC 6902). */
const pointer = (path: string) => `/${path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).map((k) => k.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
function getAt(doc: unknown, path: string): { found: boolean; value: unknown } {
  let cur: unknown = doc;
  for (const k of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (!cur || typeof cur !== 'object' || !(k in (cur as object))) return { found: false, value: undefined };
    cur = (cur as Record<string, unknown>)[k];
  }
  return { found: true, value: cur };
}
const shown = (v: unknown) => (v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v));
const severityClass = (s: IntakeFinding['severity']) => (s === 'block' ? 'text-bad' : s === 'warn' ? 'text-warn' : 'muted');

/** Danh sách mục bể cho một thẻ. */
export function IntakeList({ tab }: { tab: IntakeTab }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const params = tab === 'inbox' ? { status: 'open' } : tab === 'trial' ? { status: 'trial', mine: '1' } : { closed: '1', closedDays: '7' };
  const q = useQuery({ queryKey: ['intake', tab], queryFn: () => api.get<InboxRow[]>('/api/v1/intake', { ...params, limit: 200 }) });
  const rows = useMemo(() => {
    const r = [...(q.data ?? [])];
    return tab === 'inbox' ? r.sort((a, b) => a.score - b.score || b.last_seen_at.localeCompare(a.last_seen_at)) : r;
  }, [q.data, tab]);
  const columns: Column<InboxRow>[] = [
    { key: 'score', header: 'Điểm', value: (r) => r.score, render: (r) => <b className={r.score === 0 ? 'text-bad' : r.score < 100 ? 'text-warn' : 'text-ok'}>{r.score}</b> },
    { key: 'doc', header: 'Chứng từ', value: (r) => r.doc_key ?? `#${r.id}` },
    { key: 'type', header: 'Loại', value: (r) => typeText(r.doc_type) },
    { key: 'source', header: 'Nguồn', value: (r) => sourceText(r) },
    { key: 'attempt', header: 'Lần', value: (r) => r.attempt_no + r.patch_count, render: (r) => <>{r.attempt_no}{r.patch_count ? ` + ${r.patch_count} sửa` : ''}</> },
    { key: 'codes', header: 'Mã phát hiện', value: (r) => r.codes.join(' '), render: (r) => <span style={{ fontSize: 12 }}>{r.codes.map((c) => <code key={c} className={severityClass(INTAKE_CATALOG[c as IntakeCode]?.severity ?? 'hint')} style={{ marginRight: 4 }}>{c}</code>)}</span> },
    ...(tab === 'resolved' ? [{ key: 'status', header: 'Kết quả', value: (r: InboxRow) => STATUS_TEXT[r.status] ?? r.status } as Column<InboxRow>] : []),
    { key: 'at', header: tab === 'resolved' ? 'Đóng lúc' : 'Lần gần nhất', value: (r) => dateTimeShort((tab === 'resolved' ? r.resolved_at : r.last_seen_at) ?? r.received_at) },
  ];
  return (
    <>
      {tab === 'inbox' && <div className="muted" style={{ margin: '4px 0', fontSize: 12 }}>Chứng từ cửa nạp đã từ chối, chưa vào sổ. Ưu tiên sửa ở nguồn rồi gửi lại (mục tự đóng); sửa tại bể khi nguồn không sửa được — chứng từ sẽ mang dấu "sửa tại bể".</div>}
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading ? <Loading /> : rows.length === 0 ? (
        <Empty text={tab === 'inbox' ? 'Không có chứng từ nào cần sửa' : tab === 'trial' ? 'Bạn chưa lưu lần Kiểm thử nào' : 'Không có mục nào đóng trong 7 ngày qua'} />
      ) : (
        <DataGrid storageKey={`acc14-intake-${tab}`} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => setOpenId(r.id)} columns={columns} exportName={`ACC14-be-cho-${tab}`} />
      )}
      {openId && <IntakeDetail id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

/** Khung chi tiết một mục bể. */
function IntakeDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['intake-item', id], queryFn: () => api.get<InboxItem>(`/api/v1/intake/${id}`) });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [trial, setTrial] = useState<{ findings: IntakeFinding[]; score: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lesson, setLesson] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'accept' | 'dismiss' | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['intake'] }); void qc.invalidateQueries({ queryKey: ['intake-item', id] }); };

  const item = q.data;
  const open = item?.status === 'open';
  const findings = trial?.findings ?? item?.findings ?? [];
  const fields = useMemo(() => {
    const out = new Map(BASE_FIELDS);
    for (const f of item?.findings ?? []) if (f.path && !out.has(f.path)) {
      const v = getAt(item?.current, f.path).value;
      if (v === undefined || v === null || typeof v !== 'object') out.set(f.path, f.path);
    }
    return [...out.entries()];
  }, [item]);
  const findingAt = (path: string) => findings.filter((f) => f.path === path).sort((a, b) => (a.severity === 'block' ? -1 : b.severity === 'block' ? 1 : 0))[0];

  /** Bản vá từ ô đã sửa (giá trị cũ là số → gửi số), hoặc thay cả chứng từ khi sửa JSON. */
  const ops = (): { op: 'add' | 'replace'; path: string; value: unknown }[] => {
    if (jsonMode && jsonText !== null) return [{ op: 'replace', path: '', value: JSON.parse(jsonText) }];
    return Object.entries(edits).flatMap(([path, text]) => {
      const cur = getAt(item?.current, path);
      if (shown(cur.value) === text) return [];
      const value = typeof cur.value === 'number' && text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : text;
      return [{ op: cur.found ? 'replace' as const : 'add' as const, path: pointer(path), value }];
    });
  };
  const changed = (() => { try { return ops().length > 0; } catch { return true; } })();

  const check = useMutation({
    mutationFn: async () => {
      if (!changed) return { kind: 'dry' as const, out: await api.post<{ findings: IntakeFinding[]; score: number }>('/api/v1/intake/preflight', { document: item!.current }) };
      return { kind: 'patch' as const, out: await api.post<{ findings: IntakeFinding[]; score: number; fixed: string[]; added: string[] }>(`/api/v1/intake/${id}/patch`, { ops: ops(), reason }) };
    },
    onSuccess: ({ kind, out }) => {
      if (kind === 'dry') { setTrial(out); setNotice(`Kiểm thử (không lưu): điểm ${out.score}/100.`); return; }
      const o = out as { score: number; fixed: string[]; added: string[] };
      setTrial(null); setEdits({}); setJsonText(null);
      setNotice(`Đã ghi bản vá. Điểm ${o.score}/100${o.fixed.length ? ` · hết: ${o.fixed.join(', ')}` : ''}${o.added.length ? ` · mới: ${o.added.join(', ')}` : ''}.`);
      refresh();
    },
  });
  const resubmit = useMutation({
    mutationFn: () => api.post<{ status: 'blocked' | 'resubmitted' | 'accepted'; score: number; docKey?: string }>(`/api/v1/intake/${id}/resubmit`, {}),
    onSuccess: (r) => {
      refresh();
      if (r.status === 'blocked') { setNotice(`Chưa nộp: còn lỗi chặn (điểm ${r.score}/100). Sửa các lỗi đỏ rồi nộp lại.`); return; }
      void qc.invalidateQueries({ queryKey: ['documents'] });
      setNotice(`Đã nộp lại: chứng từ ${r.docKey} vào cửa nạp${r.status === 'accepted' ? ' (có cảnh báo đã chấp nhận)' : ''}.`);
    },
  });
  const err = check.error ?? resubmit.error;

  if (q.isLoading || !item) return <Modal title="Mục bể chờ" onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>{q.error ? <ErrorBox error={errorText(q.error)} /> : <Loading />}</Modal>;

  const nBlock = findings.filter((f) => f.severity === 'block').length;
  const nWarn = findings.filter((f) => f.severity === 'warn' && !item.accepted_codes.includes(f.code)).length;
  const score = trial?.score ?? item.score;
  const docNo = shown(getAt(item.current, 'docNo').value) || item.doc_key || `#${item.id}`;
  const summary = item.status !== 'open' && item.status !== 'trial'
    ? `Chứng từ ${docNo}: ${STATUS_TEXT[item.status] ?? item.status}${item.resolution_note ? ` — ${item.resolution_note}` : ''}.`
    : `Chứng từ ${docNo} chưa vào sổ: ${nBlock ? `${nBlock} lỗi phải sửa` : 'không còn lỗi chặn'}${nWarn ? `, ${nWarn} cảnh báo` : ''}. Điểm ${score}/100.`;
  const acceptable = findings.filter((f) => f.severity === 'warn' && INTAKE_CATALOG[f.code]?.acceptable && !item.accepted_codes.includes(f.code));

  return (
    <Modal wide title={`Trạm kiểm tra · mục bể #${item.id}`} onClose={onClose}
      footer={<>
        {open && <>
          <button className="btn" disabled={check.isPending || (changed && reason.trim().length < 3)} title={changed ? 'Ghi bản vá (cần lý do) rồi kiểm lại' : 'Kiểm lại chứng từ hiện tại, không lưu'} onClick={() => check.mutate()}>{check.isPending ? 'Đang kiểm…' : changed ? 'Kiểm thử (ghi bản vá)' : 'Kiểm thử'}</button>
          <button className="btn btn-primary" disabled={resubmit.isPending || changed || !!item.app_key} title={item.app_key ? 'Mục của app: sửa ở app rồi gửi lại' : changed ? 'Kiểm thử để ghi bản vá trước' : 'Nộp chứng từ (nguyên văn + bản vá) qua cửa nạp'} onClick={() => resubmit.mutate()}>Nộp lại</button>
          {acceptable.length > 0 && can('documents:edit-all') && <button className="btn" onClick={() => setDialog('accept')}>Chấp nhận cảnh báo…</button>}
          {can('documents:edit-all') && <button className="btn" onClick={() => setDialog('dismiss')}>Bỏ mục…</button>}
        </>}
        <button className="btn" onClick={onClose}>Đóng</button>
      </>}>
      <div className={`alert ${nBlock && open ? 'alert-error' : 'alert-ok'}`} style={{ marginBottom: 6 }}><b>{summary}</b></div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        Nguồn {sourceText(item)} · docKey {item.doc_key ?? '—'} · nhận lần đầu {dateTimeShort(item.received_at)}, lần gần nhất {dateTimeShort(item.last_seen_at)} (lần {item.attempt_no})
        {item.door_error && <> · cửa nạp: <code>{item.door_error.code}</code></>}
        {item.app_key && <> · <b>mục của app {item.app_key}: sửa ở app rồi gửi lại</b></>}
      </div>
      {notice && <div className="alert alert-ok" style={{ margin: '6px 0' }}>{notice}</div>}
      <ErrorBox error={err ? errorText(err) : null} />

      {trial && <div className="muted" style={{ fontSize: 12 }}>Đang xem kết quả Kiểm thử (chưa lưu).</div>}
      {LAYERS.map(([layer, label]) => {
        const fs = findings.filter((f) => f.layer === layer);
        if (!fs.length) return null;
        return (
          <div key={layer} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600, margin: '6px 0 2px' }}>{label} ({layer})</div>
            {fs.map((f, i) => (
              <div key={`${f.code}-${i}`} className="card" style={{ padding: 8, marginBottom: 4 }}>
                <div>
                  <b className={severityClass(f.severity)}>{f.title}</b> <code>{f.code}</code>
                  {item.accepted_codes.includes(f.code) && <span className="text-ok"> · đã chấp nhận</span>}
                  {f.path && <button type="button" className="btn btn-xs" style={{ marginLeft: 6 }} onClick={() => { setJsonMode(false); setTimeout(() => inputs.current[f.path!]?.focus(), 0); }}>{fields.find(([p]) => p === f.path)?.[1] ?? f.path} →</button>}
                  <button type="button" className="btn btn-xs" style={{ marginLeft: 6 }} onClick={() => setLesson(f.code)}>Bài học</button>
                </div>
                {(f.got !== undefined || f.expected) && <div style={{ fontSize: 12 }}>Đã gửi <code>{shown(f.got)}</code>{f.expected && <> · Đúng phải là <code>{f.expected}</code></>}</div>}
                <div style={{ fontSize: 12 }}><b>Vì sao:</b> {f.why}</div>
                <div style={{ fontSize: 12 }}><b>Sửa ở nguồn:</b> {f.fix}</div>
                {f.remedy && <RemedyView remedy={f.remedy} compact />}
              </div>
            ))}
          </div>
        );
      })}
      {!findings.length && <div className="muted">Không có phát hiện.</div>}

      <div style={{ fontWeight: 600, margin: '10px 0 4px' }}>
        Chứng từ {item.patches.length > 0 && <span className="text-warn" style={{ fontWeight: 400, fontSize: 12 }}> · đã sửa tại bể {item.patches.length} lần (lệch nguồn; nguyên văn không đổi)</span>}
        <button type="button" className="btn btn-xs" style={{ marginLeft: 8 }} onClick={() => { setJsonMode(!jsonMode); setJsonText(null); }}>{jsonMode ? 'Xem dạng ô' : 'Xem JSON'}</button>
      </div>
      {jsonMode ? (
        <textarea className="input full" rows={14} style={{ fontFamily: 'monospace', fontSize: 12 }} readOnly={!open}
          value={jsonText ?? JSON.stringify(item.current, null, 2)} onChange={(e) => setJsonText(e.target.value)} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
          {fields.map(([path, label]) => {
            const f = findingAt(path);
            const value = edits[path] ?? shown(getAt(item.current, path).value);
            const border = f?.severity === 'block' ? 'var(--bad, #c62828)' : f?.severity === 'warn' ? 'var(--warn, #b26a00)' : edits[path] !== undefined ? 'var(--accent, #1565c0)' : undefined;
            return (
              <div className="field" key={path}>
                <label>{label}</label>
                <input className="input" ref={(el) => { inputs.current[path] = el; }} readOnly={!open} value={value}
                  style={border ? { borderColor: border, borderStyle: edits[path] !== undefined ? 'dashed' : 'solid' } : undefined}
                  onChange={(e) => setEdits((x) => ({ ...x, [path]: e.target.value }))} />
              </div>
            );
          })}
        </div>
      )}
      {open && changed && (
        <div className="field" style={{ marginTop: 6 }}>
          <label>Lý do sửa tại bể (bắt buộc)</label>
          <input className="input full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vd: đối chiếu hoá đơn giấy, nguồn không sửa được" />
        </div>
      )}

      <History item={item} />

      {lesson && <LessonDrawer code={lesson} onClose={() => setLesson(null)} />}
      {dialog === 'accept' && <AcceptDialog id={id} codes={acceptable.map((f) => f.code)} onClose={() => setDialog(null)} onDone={(n) => { setDialog(null); setNotice(n); refresh(); }} />}
      {dialog === 'dismiss' && <DismissDialog id={id} onClose={() => setDialog(null)} onDone={() => { setDialog(null); refresh(); onClose(); }} />}
    </Modal>
  );
}

/** Lịch sử lần thử: nguồn gửi + từng bản vá; chọn hai dòng để so mã. */
function History({ item }: { item: InboxItem }) {
  const rows = useMemo(() => {
    const p = item.patches;
    // Mã lúc nguồn gửi = mã sau bản vá đầu, bỏ mã mới, thêm mã đã hết (máy chủ chỉ giữ phát hiện mới nhất).
    const initial = p.length ? [...new Set([...p[0]!.codes.filter((c) => !p[0]!.added.includes(c)), ...p[0]!.fixed])] : item.findings.map((f) => f.code);
    return [
      { key: 'src', label: `1–${item.attempt_no} · nguồn gửi`, at: item.last_seen_at, who: sourceText(item), score: p.length ? null : item.score, codes: initial, note: '' },
      ...p.map((x, i) => ({ key: `p${i}`, label: `${i + 1} · sửa tại bể`, at: x.at, who: x.by, score: x.score as number | null, codes: x.codes, note: x.reason })),
    ];
  }, [item]);
  const [pick, setPick] = useState<string[]>([]);
  const toggle = (k: string) => setPick((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k].slice(-2)));
  const [a, b] = pick.map((k) => rows.find((r) => r.key === k)!).sort((x, y) => rows.indexOf(x) - rows.indexOf(y));
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Lịch sử lần thử</div>
      <table className="grid full">
        <thead><tr><th>So</th><th>Lần</th><th>Lúc</th><th>Ai / nguồn</th><th>Điểm</th><th>Mã</th><th>Lý do</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td><input type="checkbox" checked={pick.includes(r.key)} onChange={() => toggle(r.key)} /></td>
              <td>{r.label}</td><td>{dateTimeShort(r.at)}</td><td>{r.who}</td><td>{r.score ?? '—'}</td>
              <td style={{ fontSize: 12 }}>{r.codes.join(' ') || '—'}</td><td style={{ fontSize: 12 }}>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {a && b && (
        <div style={{ fontSize: 12, marginTop: 4 }}>
          {a.label} → {b.label}: hết <b className="text-ok">{a.codes.filter((c) => !b.codes.includes(c)).join(', ') || '—'}</b> · mới <b className="text-bad">{b.codes.filter((c) => !a.codes.includes(c)).join(', ') || '—'}</b>
        </div>
      )}
    </div>
  );
}

function LessonDrawer({ code, onClose }: { code: string; onClose: () => void }) {
  const html = useMemo(() => marked.parse(getLesson(code) ?? `# ${code}\n\nChưa có trang bài học \`docs/huong-dan/loi-dau-vao/${code}.md\`.`, { async: false }) as string, [code]);
  return (
    <Drawer title={`Bài học ${code}`} onClose={onClose} narrow>
      {/* Nội dung lấy từ tài liệu trong mã nguồn (không phải dữ liệu người dùng nhập). */}
      <div className="doc" dangerouslySetInnerHTML={{ __html: html }} />
    </Drawer>
  );
}

function AcceptDialog({ id, codes, onClose, onDone }: { id: string; codes: IntakeCode[]; onClose: () => void; onDone: (notice: string) => void }) {
  const [chosen, setChosen] = useState<string[]>(codes);
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.post<{ acceptedCodes: string[]; score: number }>(`/api/v1/intake/${id}/accept`, { codes: chosen, reason }),
    onSuccess: (r) => onDone(`Đã chấp nhận ${r.acceptedCodes.join(', ')}. Điểm ${r.score}/100 — bấm Nộp lại để vào sổ.`),
  });
  return (
    <Modal title="Chấp nhận cảnh báo" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={!chosen.length || reason.trim().length < 3 || m.isPending} onClick={() => m.mutate()}>Chấp nhận</button><button className="btn" onClick={onClose}>Huỷ</button></>}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Chỉ cảnh báo danh mục cho phép mới chấp nhận được; lỗi chặn luôn phải sửa. Lý do được ghi vào bằng chứng.</div>
      {codes.map((c) => (
        <label key={c} style={{ display: 'block' }}>
          <input type="checkbox" checked={chosen.includes(c)} onChange={() => setChosen((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))} /> <code>{c}</code> {INTAKE_CATALOG[c].title}
        </label>
      ))}
      <div className="field" style={{ marginTop: 6 }}><label>Lý do (bắt buộc)</label><input className="input full" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <ErrorBox error={m.error ? errorText(m.error) : null} />
    </Modal>
  );
}

function DismissDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const m = useMutation({ mutationFn: () => api.post(`/api/v1/intake/${id}/dismiss`, { reason }), onSuccess: onDone });
  return (
    <Modal title="Bỏ mục bể chờ" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={reason.trim().length < 3 || m.isPending} onClick={() => m.mutate()}>Bỏ mục</button><button className="btn" onClick={onClose}>Huỷ</button></>}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Chứng từ không vào sổ. Dùng khi nguồn đã huỷ phiếu hoặc mục gửi nhầm.</div>
      <div className="field"><label>Lý do (bắt buộc)</label><input className="input full" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <ErrorBox error={m.error ? errorText(m.error) : null} />
    </Modal>
  );
}
