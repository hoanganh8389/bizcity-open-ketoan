/**
 * Kỳ kế toán và khoá sổ (ACC2).
 *  - Tab "Đóng / mở kỳ": lưới chi nhánh × loại chứng từ của một kỳ; tick ô để khoá, bỏ tick để mở.
 *    Bấm tên chi nhánh để đảo cả hàng, bấm tên loại chứng từ để đảo cả cột (trên các chi nhánh đang hiện).
 *    "Đóng kỳ" khoá mọi ô của các chi nhánh đang hiện. Mở khoá bắt buộc ghi lý do.
 *    Có bảng kiểm trước khi khoá: chứng từ lỗi, lệch, chưa tính giá vốn, chưa kết chuyển…
 *  - Tab "Danh sách kỳ": khai kỳ cả năm; xem và mở các dòng khoá (kể cả khoá chung mọi chi nhánh / mọi loại).
 *  - Tab "Nhật ký": ai khoá, ai mở, lúc nào, lý do.
 *  - Tab "Khoá theo ngày": khoá dữ liệu đến ngày, chỉ sửa trong N ngày, chỉ lập phiếu hôm nay, cấm kế toán viên huỷ.
 *    Chủ đơn vị, kế toán trưởng không bị các luật này chặn (khoá kỳ vẫn áp cho mọi người).
 * Kỳ là tháng dương lịch; tự tạo khi có chứng từ, hoặc khai trước cả năm.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Lock, Unlock } from 'lucide-react';
import { DOC_TYPE_GROUPS, DOC_TYPE_LABELS, type DocType } from '@ketoan/contracts';
import { api, ApiError, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, dateTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { BranchSelect } from '@/components/filters';
import { Empty, ErrorBox, Field, Loading, Modal, Money } from '@/components/ui';

interface LockRow { id: string; branch: string | null; docType: string; lockedBy: string; lockedAt: string }
interface Period { id: string; year: number; month: number; startDate: string; endDate: string; locks: LockRow[] }
interface Grid { branches: { code: string; name: string; isActive: boolean }[]; locks: LockRow[] }
interface CheckItem { key: string; label: string; count: number; amount?: number; detail?: string; link: string }
interface LockEvent { id: string; period: string; branch: string | null; docType: string; action: 'lock' | 'unlock'; reason: string | null; actorName: string; createdAt: string }

const typeLabel = (t: string) => (t === '*' ? 'mọi loại chứng từ' : DOC_TYPE_LABELS[t as DocType] ?? t);
const ALL_TYPES = DOC_TYPE_GROUPS.flatMap((g) => g.types);
/** Danh sách mã dài: hiện 12 mã đầu, còn lại ghi "và N chi nhánh khác" (di chuột để xem đủ). */
const shortList = (s: string, max = 12) => { const a = s.split(', '); return a.length <= max ? s : `${a.slice(0, max).join(', ')} và ${a.length - max} chi nhánh khác`; };

export function PeriodsPage() {
  const now = new Date();
  const [tab, setTab] = useState<'grid' | 'list' | 'log' | 'date'>('grid');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  return (
    <>
      <PageHeader title="Đóng / mở kỳ kế toán" code="ACC2" subtitle="Khoá kỳ theo chi nhánh và loại chứng từ để chặn thêm, sửa, huỷ chứng từ" helpKey="ky-ke-toan" />
      <div className="card">
        <div className="tabs" role="tablist">
          <button role="tab" className={`tab ${tab === 'grid' ? 'active' : ''}`} onClick={() => setTab('grid')}>Đóng / mở kỳ</button>
          <button role="tab" className={`tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>Danh sách kỳ</button>
          <button role="tab" className={`tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>Nhật ký khoá / mở</button>
          <button role="tab" className={`tab ${tab === 'date' ? 'active' : ''}`} onClick={() => setTab('date')}>Khoá theo ngày</button>
        </div>
        {tab === 'date' ? <DateLockTab /> : <div className="filters">
          <div className="field"><label>Năm</label><input className="input w-sm" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
          {tab !== 'list' && (
            <div className="field"><label>Tháng</label>
              <select className="select input w-sm" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
              </select>
            </div>
          )}
        </div>}
        {tab === 'grid' ? <GridTab year={year} month={month} /> : tab === 'list' ? <ListTab year={year} /> : tab === 'log' ? <LogTab year={year} month={month} /> : null}
      </div>
    </>
  );
}

/* ----------------------------------------------------------------------------------------------- */

function GridTab({ year, month }: { year: number; month: number }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const editable = can('periods:lock');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Map<string, boolean>>(new Map());
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['lock-grid', year, month], queryFn: () => api.get<Grid>('/api/v1/periods/lock-grid', { year, month }) });
  const check = useQuery({ queryKey: ['period-check', year, month], queryFn: () => api.get<CheckItem[]>('/api/v1/periods/check', { year, month }) });

  // Khoá theo ô (chi nhánh + loại cụ thể) và khoá chung (mọi chi nhánh và/hoặc mọi loại).
  const { exact, general } = useMemo(() => {
    const exact = new Set<string>();
    const general: LockRow[] = [];
    for (const l of q.data?.locks ?? []) {
      if (l.branch && l.docType !== '*') exact.add(`${l.branch}|${l.docType}`);
      else general.push(l);
    }
    return { exact, general };
  }, [q.data]);
  useEffect(() => { setDraft(new Map()); setDone(null); }, [q.data]);

  const coveredByGeneral = (branch: string, type: string) =>
    general.find((l) => (l.branch === null || l.branch === branch) && (l.docType === '*' || l.docType === type));
  const key = (b: string, t: string) => `${b}|${t}`;
  const value = (b: string, t: string) => draft.get(key(b, t)) ?? exact.has(key(b, t));
  const branches = (q.data?.branches ?? []).filter((b) => {
    const s = search.trim().toLowerCase();
    return !s || b.code.toLowerCase().includes(s) || b.name.toLowerCase().includes(s);
  });

  const setMany = (cells: [string, string][], v: boolean) => setDraft((d) => {
    const n = new Map(d);
    for (const [b, t] of cells) {
      if (coveredByGeneral(b, t)) continue;
      if (exact.has(key(b, t)) === v) n.delete(key(b, t)); else n.set(key(b, t), v);
    }
    return n;
  });
  const toggleRow = (b: string) => { const all = ALL_TYPES.every((t) => value(b, t)); setMany(ALL_TYPES.map((t) => [b, t]), !all); };
  const toggleCol = (t: string) => { const all = branches.every((b) => value(b.code, t)); setMany(branches.map((b) => [b.code, t]), !all); };
  const closeAll = () => setMany(branches.flatMap((b) => ALL_TYPES.map((t) => [b.code, t] as [string, string])), true);

  const changes = [...draft.entries()].map(([k, locked]) => { const [branchCode, docType] = k.split('|'); return { branchCode: branchCode!, docType: docType!, locked }; });
  const unlocks = changes.filter((c) => !c.locked).length;
  const save = useMutation({
    mutationFn: (a: { reason: string; accept?: string }) =>
      api.put<{ locked: number; unlocked: number }>('/api/v1/periods/locks', { year, month, changes, reason: a.reason, acceptDiagnostics: a.accept }),
    // Bị chặn vì lỗi toàn vẹn sổ (R-DIAG-4): đóng hộp lý do mở khoá, hiện khối chấp nhận ở lưới.
    onError: (e) => { if (isDiagBlock(e)) setAsking(false); },
    onSuccess: (r) => {
      setAsking(false);
      setDone(`Đã khoá ${r.locked} ô, mở ${r.unlocked} ô.`);
      void qc.invalidateQueries({ queryKey: ['lock-grid'] });
      void qc.invalidateQueries({ queryKey: ['periods'] });
      void qc.invalidateQueries({ queryKey: ['lock-events'] });
    },
  });
  const warnings = (check.data ?? []).filter((c) => c.count > 0);

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div className="field"><label>Tìm chi nhánh</label><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mã hoặc tên" /></div>
        {editable && (
          <>
            <div className="row" style={{ gap: 8, alignSelf: 'flex-end' }}>
              <button className="btn" onClick={closeAll} title="Tick mọi ô của các chi nhánh đang hiện, rồi bấm Ghi">
                <Lock size={16} /> Đóng kỳ
              </button>
              <button className="btn" disabled={!changes.length} onClick={() => setDraft(new Map())}>Bỏ thay đổi</button>
              <button className="btn btn-primary" disabled={!changes.length || save.isPending}
                onClick={() => (unlocks ? setAsking(true) : save.mutate({ reason: '' }))}>Ghi{changes.length ? ` (${changes.length} ô)` : ''}</button>
            </div>
          </>
        )}
      </div>

      <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
        <b>Bảng kiểm trước khi khoá tháng {month}/{year}</b>
        {check.isLoading ? <Loading /> : check.error ? <ErrorBox error={errorText(check.error)} /> : !warnings.length ? (
          <div className="muted" style={{ marginTop: 4 }}>Không có vấn đề nào cần xử lý.</div>
        ) : (
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {warnings.map((w) => (
              <li key={w.key}>
                <span className="text-bad">{w.label}: {w.count}</span>
                {w.amount ? <> · <Money value={w.amount} /></> : null}
                {w.detail ? <span className="muted" title={w.detail}> ({shortList(w.detail)})</span> : null}
                {' '}<a href={w.link}>Xem</a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {general.length > 0 && (
        <div className="alert" style={{ marginBottom: 10 }}>
          Đang có khoá chung: {general.map((l) => `${l.branch ?? 'mọi chi nhánh'} · ${typeLabel(l.docType)}`).join('; ')}. Các ô thuộc khoá chung không đổi được ở lưới; mở ở tab "Danh sách kỳ".
        </div>
      )}
      <ErrorBox error={q.error ? errorText(q.error) : save.error && !asking && !isDiagBlock(save.error) ? errorText(save.error) : null} />
      <AcceptDiagnostics error={save.error} pending={save.isPending} onAccept={(accept) => save.mutate({ reason: save.variables?.reason ?? '', accept })} />
      {done && <div className="muted" style={{ marginBottom: 8 }}>{done}</div>}

      {q.isLoading ? <Loading /> : !branches.length ? <Empty text="Không có chi nhánh" /> : (
        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 380px)' }}>
          <table className="grid" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ minWidth: 180 }}>Chi nhánh</th>
                {DOC_TYPE_GROUPS.map((g) => <th key={g.label} colSpan={g.types.length} style={{ textAlign: 'center' }}>{g.label}</th>)}
              </tr>
              <tr>
                {ALL_TYPES.map((t) => (
                  <th key={t} style={{ textAlign: 'center', maxWidth: 76, whiteSpace: 'normal', fontWeight: 500, cursor: editable ? 'pointer' : undefined }}
                    title={editable ? 'Bấm để khoá / mở cả cột' : undefined} onClick={editable ? () => toggleCol(t) : undefined}>
                    {DOC_TYPE_LABELS[t]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => {
                const lockedCount = ALL_TYPES.filter((t) => value(b.code, t) || coveredByGeneral(b.code, t)).length;
                return (
                  <tr key={b.code}>
                    <td style={{ cursor: editable ? 'pointer' : undefined, whiteSpace: 'nowrap' }} title={editable ? 'Bấm để khoá / mở cả hàng' : undefined} onClick={editable ? () => toggleRow(b.code) : undefined}>
                      <span className="mono">{b.code}</span> <span className="muted">{b.name}</span>
                      {lockedCount === ALL_TYPES.length && <span className="badge badge-warn" style={{ marginLeft: 6 }}>Đã đóng</span>}
                    </td>
                    {ALL_TYPES.map((t) => {
                      const g = coveredByGeneral(b.code, t);
                      const changed = draft.has(key(b.code, t));
                      return (
                        <td key={t} style={{ textAlign: 'center', background: changed ? '#fff7e0' : undefined }}>
                          <input type="checkbox" checked={Boolean(g) || value(b.code, t)} disabled={!editable || Boolean(g)}
                            title={g ? `Khoá chung bởi ${g.lockedBy}` : undefined}
                            onChange={(e) => setMany([[b.code, t]], e.target.checked)} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {asking && <ReasonDialog count={unlocks} pending={save.isPending} error={save.error ? errorText(save.error) : null} onClose={() => setAsking(false)} onOk={(r) => save.mutate({ reason: r })} />}
    </div>
  );
}

function ReasonDialog({ count, pending, error, onClose, onOk }: { count: number; pending: boolean; error: string | null; onClose: () => void; onOk: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title="Lý do mở khoá" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Huỷ</button><button className="btn btn-primary" disabled={pending || reason.trim().length < 3} onClick={() => onOk(reason.trim())}>Mở khoá</button></>}>
      <Field label={`Mở khoá ${count} ô. Lý do (*)`} full hint="Ghi vào nhật ký khoá / mở, ví dụ: sửa hoá đơn ngày 12 theo yêu cầu kế toán trưởng">
        <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
      {error && <div className="alert alert-bad full">{error}</div>}
    </Modal>
  );
}

/* ----------------------------------------------------------------------------------------------- */

function ListTab({ year }: { year: number }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [locking, setLocking] = useState(false);
  const q = useQuery({ queryKey: ['periods', year], queryFn: () => api.get<Period[]>('/api/v1/periods', { year }) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['periods'] }); void qc.invalidateQueries({ queryKey: ['lock-grid'] }); void qc.invalidateQueries({ queryKey: ['lock-events'] }); };
  const unlock = useMutation({ mutationFn: (a: { id: string; reason: string }) => api.delete(`/api/v1/periods/locks/${a.id}?reason=${encodeURIComponent(a.reason)}`), onSuccess: refresh });
  const create = useMutation({ mutationFn: () => api.post('/api/v1/periods', { year }), onSuccess: refresh });
  const askUnlock = (id: string) => {
    const reason = window.prompt('Lý do mở khoá (bắt buộc):');
    if (reason && reason.trim().length >= 3) unlock.mutate({ id, reason: reason.trim() });
    else if (reason !== null) window.alert('Cần ghi lý do ít nhất 3 ký tự.');
  };
  return (
    <div style={{ padding: '0 16px 16px' }}>
      {can('periods:lock') && (
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <button className="btn" disabled={create.isPending} onClick={() => window.confirm(`Khai đủ 12 kỳ kế toán của năm ${year}?`) && create.mutate()}><CalendarPlus size={16} /> Khai kỳ năm {year}</button>
          <button className="btn" onClick={() => setLocking(true)}><Lock size={16} /> Khoá chung</button>
        </div>
      )}
      <ErrorBox error={q.error ? errorText(q.error) : unlock.error ? errorText(unlock.error) : create.error ? errorText(create.error) : null} />
      {q.isLoading ? <Loading /> : !q.data?.length ? <Empty text="Chưa có kỳ nào trong năm này" /> : (
        <table className="grid">
          <thead><tr><th>Kỳ</th><th>Từ ngày</th><th>Đến ngày</th><th>Khoá sổ</th></tr></thead>
          <tbody>
            {q.data.map((p) => {
              const general = p.locks.filter((l) => !l.branch || l.docType === '*');
              const cells = p.locks.length - general.length;
              return (
                <tr key={p.id}>
                  <td>Tháng {p.month}/{p.year}</td><td>{date(p.startDate)}</td><td>{date(p.endDate)}</td>
                  <td>
                    {p.locks.length === 0 && <span className="badge badge-ok">Đang mở</span>}
                    {cells > 0 && <div className="row" style={{ marginBottom: 4 }}><span className="badge badge-warn">Đã khoá</span><span>{cells} ô (chi nhánh × loại chứng từ) — xem ở tab "Đóng / mở kỳ"</span></div>}
                    {general.map((l) => (
                      <div key={l.id} className="row" style={{ marginBottom: 4 }}>
                        <span className="badge badge-warn">Khoá chung</span>
                        <span>{l.branch ?? 'mọi chi nhánh'} · {typeLabel(l.docType)}</span>
                        <span className="muted">{l.lockedBy} · {dateTime(l.lockedAt)}</span>
                        {can('periods:lock') && <button className="btn btn-sm" onClick={() => askUnlock(l.id)}><Unlock size={14} /> Mở khoá</button>}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {locking && <LockForm initial={{ year, month: new Date().getMonth() + 1 }} onClose={() => setLocking(false)} onDone={refresh} />}
    </div>
  );
}

interface DiagBlock { diagnostics: { runId: string; errors: { code: string; title: string; count: number; sample: string[]; fix: string }[] } }
/** API chặn khoá kỳ vì sổ trong kỳ có lỗi toàn vẹn (R-DIAG-4, CONFLICT kèm details.diagnostics). */
const isDiagBlock = (e: unknown): e is ApiError => e instanceof ApiError && !!(e.details as Partial<DiagBlock> | undefined)?.diagnostics;

/** Khối hiện lỗi toàn vẹn sổ + ô lý do chấp nhận: ghi lý do (≥ 10 ký tự) rồi khoá lại; lý do vào nhật ký khoá kèm số lượt chẩn đoán. */
function AcceptDiagnostics({ error, pending, onAccept }: { error: unknown; pending: boolean; onAccept: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  if (!isDiagBlock(error)) return null;
  const d = (error.details as DiagBlock).diagnostics;
  return (
    <div className="alert alert-bad full" style={{ marginBottom: 10 }}>
      <div>{error.message}</div>
      <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
        {d.errors.map((x) => <li key={x.code}><b>{x.code}</b> ×{x.count}: {x.title}. {x.fix}{x.sample.length ? ` (vd ${x.sample.slice(0, 5).join(', ')})` : ''}</li>)}
      </ul>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: 240 }}>
          <label>Lý do chấp nhận (ít nhất 10 ký tự, ghi vào nhật ký khoá, lượt chẩn đoán #{d.runId})</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button className="btn" disabled={pending || reason.trim().length < 10} onClick={() => onAccept(reason.trim())}>Vẫn khoá, chấp nhận lỗi</button>
      </div>
    </div>
  );
}

function LockForm({ initial, onClose, onDone }: { initial: { year: number; month: number }; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ ...initial, branchCode: '', docType: '*' });
  const save = useMutation({
    mutationFn: (accept?: string) => api.post('/api/v1/periods/locks', { ...v, branchCode: v.branchCode || undefined, acceptDiagnostics: accept }),
    onSuccess: () => { onDone(); onClose(); },
  });
  return (
    <Modal title="Khoá chung" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate(undefined)}>Khoá</button></>}>
      <div className="full muted">Khoá chung áp cho mọi chi nhánh và/hoặc mọi loại chứng từ, kể cả chi nhánh mở sau này.</div>
      <Field label="Tháng"><input className="input" type="number" min={1} max={12} value={v.month} onChange={(e) => setV({ ...v, month: Number(e.target.value) })} /></Field>
      <Field label="Năm"><input className="input" type="number" value={v.year} onChange={(e) => setV({ ...v, year: Number(e.target.value) })} /></Field>
      <Field label="Loại chứng từ"><select className="select input" value={v.docType} onChange={(e) => setV({ ...v, docType: e.target.value })}><option value="*">Mọi loại</option>{ALL_TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}</select></Field>
      <div className="full"><BranchSelect multiple={false} value={v.branchCode} onChange={(branchCode) => setV({ ...v, branchCode })} label="Chi nhánh (trống = mọi chi nhánh)" /></div>
      {save.error && !isDiagBlock(save.error) && <div className="alert alert-bad full">{errorText(save.error)}</div>}
      <AcceptDiagnostics error={save.error} pending={save.isPending} onAccept={(accept) => save.mutate(accept)} />
    </Modal>
  );
}

/* ----------------------------------------------------------------------------------------------- */

function LogTab({ year, month }: { year: number; month: number }) {
  const q = useQuery({ queryKey: ['lock-events', year, month], queryFn: () => api.get<LockEvent[]>('/api/v1/periods/lock-events', { year, month }) });
  return (
    <div style={{ padding: '0 16px 16px' }}>
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading ? <Loading /> : !q.data?.length ? <Empty text="Chưa có lần khoá / mở nào trong tháng này" /> : (
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Lúc</th><th>Người làm</th><th>Việc</th><th>Kỳ</th><th>Chi nhánh</th><th>Loại chứng từ</th><th>Lý do</th></tr></thead>
            <tbody>
              {q.data.map((e) => (
                <tr key={e.id}>
                  <td>{dateTime(e.createdAt)}</td><td>{e.actorName}</td>
                  <td>{e.action === 'lock' ? <span className="badge badge-warn">Khoá</span> : <span className="badge badge-ok">Mở khoá</span>}</td>
                  <td>{e.period}</td><td>{e.branch ?? 'mọi chi nhánh'}</td><td>{typeLabel(e.docType)}</td><td>{e.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */

interface DataLock { lockUntil: string | null; editWithinDays: number; todayOnly: boolean; noCancelForAccountant: boolean; today: string; bypass: boolean }

function DateLockTab() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const editable = can('settings:write');
  const q = useQuery({ queryKey: ['data-lock'], queryFn: () => api.get<DataLock>('/api/v1/settings/data-lock') });
  const [v, setV] = useState<DataLock | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (q.data) setV(q.data); }, [q.data]);
  const set = (p: Partial<DataLock>) => { setSaved(false); setV((x) => (x ? { ...x, ...p } : x)); };
  const save = useMutation({
    mutationFn: () => api.put<DataLock>('/api/v1/settings/data-lock', { lockUntil: v!.lockUntil || null, editWithinDays: v!.editWithinDays, todayOnly: v!.todayOnly, noCancelForAccountant: v!.noCancelForAccountant }),
    onSuccess: () => { setSaved(true); void qc.invalidateQueries({ queryKey: ['data-lock'] }); },
  });
  return (
    <div style={{ padding: 16 }}>
      <div className="muted" style={{ marginBottom: 12 }}>
        Các luật dưới đây chặn kế toán viên. Chủ đơn vị, kế toán trưởng và chứng từ gửi sang qua khoá API không bị chặn; khoá kỳ ở tab "Đóng / mở kỳ" vẫn áp cho mọi người.
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : save.error ? errorText(save.error) : null} />
      {!v ? <Loading /> : (
        <div className="form-grid">
          <Field label="Khoá dữ liệu đến ngày" hint="Chứng từ có ngày đến hết ngày này thì không lập, sửa, huỷ được. Bỏ trống = không khoá">
            <input type="date" className="input" value={v.lockUntil ?? ''} disabled={!editable} onChange={(e) => set({ lockUntil: e.target.value || null })} />
          </Field>
          <Field label="Chỉ sửa chứng từ trong (ngày)" hint="Chỉ lập, sửa, huỷ chứng từ có ngày trong số ngày gần nhất này. 0 = không giới hạn">
            <input className="input num" inputMode="numeric" value={v.editWithinDays} disabled={!editable} onChange={(e) => set({ editWithinDays: Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0) })} />
          </Field>
          <Field label="Ngày chứng từ" full>
            <label className="checkbox"><input type="checkbox" checked={v.todayOnly} disabled={!editable} onChange={(e) => set({ todayOnly: e.target.checked })} /> Kế toán viên chỉ được lập, sửa phiếu đúng ngày hôm nay (không lập phiếu ngày quá khứ hay tương lai)</label>
          </Field>
          <Field label="Huỷ phiếu" full>
            <label className="checkbox"><input type="checkbox" checked={v.noCancelForAccountant} disabled={!editable} onChange={(e) => set({ noCancelForAccountant: e.target.checked })} /> Kế toán viên không được huỷ phiếu (vẫn sửa được); huỷ phiếu cần kế toán trưởng</label>
          </Field>
          {editable && (
            <div className="full row" style={{ gap: 10 }}>
              <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Ghi</button>
              {saved && <span className="muted">Đã ghi.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
