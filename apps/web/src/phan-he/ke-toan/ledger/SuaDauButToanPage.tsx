// [2026-11-10 12:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-16 (D004-14, D004-16): màn SC02 Sửa đầu bút toán theo bản mẫu mockups/sua-dau-but-toan.html (chủ duyệt 2026-11-09)
/**
 * Sửa đầu bút toán (SC02): mọi lần đổi thông tin đầu của bút toán đã ghi, qua ứng dụng hay ngoài ứng dụng (trigger 0089).
 * Bộ lọc nằm trên địa chỉ (?from=&to=&nguon=&cot=&butToan=&trangThai=). Cột content_hash ẩn mặc định (D004-16 điểm 4).
 * Nút xác nhận chỉ hiện với periods:lock (kế toán trưởng, D004-16 điểm 1); lần qua ứng dụng không cần xác nhận (điểm 3).
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, errorText } from '@/lib/api';
import { dateTime, date } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { Drawer, Empty, ErrorBox, Loading } from '@/components/ui';
import { EntryOpen } from '@/features/ledger/EntriesPage';

interface Change { column: string; before: unknown; after: unknown }
interface EditRow {
  auditId: string; at: string; entryId: string; entryNo: string; postingDate: string; docType: string; docKey: string | null;
  changes: Change[]; source: 'app' | 'db'; role: string | null; login: string | null; app: string | null; client: string | null; txid: string | null;
  ack: { by: string; at: string; reason: string | null } | null; needsAck: boolean;
}
interface EditsPage { items: EditRow[]; summary: { total: number; outside: number; unacked: number; topColumn: { column: string; count: number } | null } }

const COLUMNS = ['doc_no', 'invoice_no', 'reason_code', 'partner_id', 'description', 'content_hash', 'event_version', 'partner_name', 'partner_attr_id'];
const TECH = new Set(['content_hash']);
const PAGE_SIZE = 50;
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '(trống)' : String(v));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function SuaDauButToanPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [tech, setTech] = useState(false);
  const [open, setOpen] = useState<EditRow | null>(null);
  const [entryOpen, setEntryOpen] = useState<string | null>(null);
  const pick = (k: string, ok: (v: string) => boolean) => { const v = params.get(k) ?? ''; return ok(v) ? v : ''; };
  const f = {
    from: pick('from', (v) => DATE.test(v)),
    to: pick('to', (v) => DATE.test(v)),
    source: pick('nguon', (v) => v === 'app' || v === 'db'),
    column: pick('cot', (v) => COLUMNS.includes(v)),
    entry: pick('butToan', (v) => /^[\w./:-]{1,40}$/.test(v)),
    status: pick('trangThai', (v) => v === 'unacked' || v === 'acked'),
  };
  const setF = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); setPage(1); };

  const query = Object.fromEntries(Object.entries({ ...f, page, pageSize: PAGE_SIZE }).filter(([, v]) => v !== ''));
  const q = useQuery({
    queryKey: ['entry-edits', query],
    queryFn: () => api.getPage<EditsPage>('/api/v1/ledger/entry-edits', query as never),
    placeholderData: keepPreviousData,
    enabled: can('ledger:read'),
  });

  if (!can('ledger:read')) {
    return (<><PageHeader title="Sửa đầu bút toán" code="SC02" helpKey="sua-dau-but-toan" /><Empty text="Bạn không có quyền xem sổ cái (ledger:read). Nhờ quản trị đơn vị cấp quyền." /></>);
  }
  const data = q.data?.data;
  const total = Number(q.data?.meta?.total ?? 0);
  const visible = (c: Change) => tech || !TECH.has(c.column);
  const denied = q.error instanceof ApiError && q.error.status === 403;

  return (
    <>
      <PageHeader title="Sửa đầu bút toán" code="SC02" helpKey="sua-dau-but-toan"
        subtitle="Mọi lần đổi số chứng từ, số hoá đơn, lý do, đối tượng, diễn giải… của bút toán đã ghi — qua ứng dụng và ngoài ứng dụng"
        actions={<button type="button" className="btn" onClick={() => setTech((x) => !x)}>{tech ? 'Ẩn cột kỹ thuật' : 'Hiện cột kỹ thuật'}</button>} />

      {data && data.summary.unacked > 0 && (
        <div className="alert alert-warn" style={{ margin: 12 }}>
          <b>{data.summary.unacked} lần sửa ngoài ứng dụng chưa xác nhận.</b> Còn chưa xác nhận thì khoá kỳ bị chặn (kế toán trưởng ghi lý do thì vẫn khoá được).
        </div>
      )}
      {data && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '0 12px 12px' }}>
          <span className="badge badge-gray">{data.summary.total} lần sửa</span>
          <span className={`badge ${data.summary.outside ? 'badge-bad' : 'badge-ok'}`}>{data.summary.outside} ngoài ứng dụng</span>
          <span className={`badge ${data.summary.unacked ? 'badge-warn' : 'badge-ok'}`}>{data.summary.unacked} chưa xác nhận</span>
          {data.summary.topColumn && <span className="badge badge-info">sửa nhiều nhất: {data.summary.topColumn.column} ({data.summary.topColumn.count})</span>}
        </div>
      )}

      <div className="card" style={{ margin: '0 12px 12px' }}>
        <div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <label>Từ ngày<br /><input type="date" value={f.from} onChange={(e) => setF('from', e.target.value)} /></label>
          <label>Đến ngày<br /><input type="date" value={f.to} onChange={(e) => setF('to', e.target.value)} /></label>
          <label>Nguồn<br /><select value={f.source} onChange={(e) => setF('nguon', e.target.value)}><option value="">Tất cả</option><option value="app">Ứng dụng</option><option value="db">Ngoài ứng dụng</option></select></label>
          <label>Cột<br /><select value={f.column} onChange={(e) => setF('cot', e.target.value)}><option value="">Tất cả</option>{COLUMNS.filter((c) => tech || !TECH.has(c)).map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label>Số bút toán<br /><input value={f.entry} onChange={(e) => setF('butToan', e.target.value.trim())} placeholder="vd PT-2026-000187" /></label>
          <label>Trạng thái<br /><select value={f.status} onChange={(e) => setF('trangThai', e.target.value)}><option value="">Tất cả</option><option value="unacked">Chưa xác nhận</option><option value="acked">Đã xác nhận</option></select></label>
          <button type="button" className="btn" onClick={() => { setParams(new URLSearchParams(), { replace: true }); setPage(1); }}>Xoá lọc</button>
        </div>
      </div>

      {q.isLoading && <Loading text="Đang tải lần sửa đầu bút toán…" />}
      {denied && <Empty text="Bạn không có quyền xem mục này." />}
      {q.error && !denied && <ErrorBox error={errorText(q.error)} />}
      {data && data.items.length === 0 && <Empty text="Không có lần sửa đầu bút toán nào trong bộ lọc này. Thử bỏ bộ lọc hoặc chọn khoảng ngày khác." />}
      {data && data.items.length > 0 && (
        <div className="table-wrap" style={{ margin: '0 12px' }}>
          <table className="grid">
            <thead><tr><th>Giờ</th><th>Bút toán</th><th>Cột · trước → sau</th><th>Nguồn</th><th>Người / vai trò</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.auditId} onClick={() => setOpen(r)} style={{ cursor: 'pointer' }}>
                  <td>{dateTime(r.at)}</td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEntryOpen(r.entryId); }}>{r.entryNo}</a><br /><small>{date(r.postingDate)} · {r.docKey ?? r.docType}</small></td>
                  <td>{r.changes.filter(visible).map((c) => <div key={c.column}><code>{c.column}</code>: <s>{show(c.before)}</s> → <b>{show(c.after)}</b></div>)}
                    {r.changes.filter(visible).length === 0 && <small>chỉ cột kỹ thuật</small>}</td>
                  <td>{r.source === 'app' ? <span className="badge badge-ok">Ứng dụng</span> : <span className="badge badge-bad">Ngoài ứng dụng</span>}</td>
                  <td><code>{r.role ?? '—'}</code></td>
                  <td>{r.source === 'app' ? <span className="badge badge-gray">Đã khai báo</span> : r.ack ? <span className="badge badge-ok">Đã xác nhận</span> : <span className="badge badge-warn">Chưa xác nhận</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: 8 }}>
            <small>Hiện {data.items.length} / {total} dòng · mới nhất trước</small>
            <span><button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>{' '}
              <button type="button" className="btn" disabled={page * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Sau</button></span>
          </div>
        </div>
      )}

      {open && <EditDetail row={open} canAck={can('periods:lock')} tech={tech} onClose={() => setOpen(null)} />}
      {entryOpen && <EntryOpen id={entryOpen} onClose={() => setEntryOpen(null)} />}
    </>
  );
}

function EditDetail({ row, canAck, tech, onClose }: { row: EditRow; canAck: boolean; tech: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const ack = useMutation({
    mutationFn: () => api.post('/api/v1/ledger/entry-edits/ack', { entryId: row.entryId, txid: row.txid, reason: reason.trim() }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['entry-edits'] }); onClose(); },
  });
  return (
    <Drawer title={`Chi tiết · ${row.entryNo}`} onClose={onClose} narrow>
      <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 8px' }}>
        <dt>Chứng từ gốc</dt><dd>{row.docKey ?? '—'} · {row.docType}</dd>
        <dt>Giờ sửa</dt><dd>{dateTime(row.at)}</dd>
        <dt>Giao dịch</dt><dd><code>txid {row.txid ?? '—'}</code></dd>
        <dt>Vai trò</dt><dd><code>{row.role ?? '—'}</code> (đăng nhập: <code>{row.login ?? '—'}</code>)</dd>
        <dt>Ứng dụng / máy</dt><dd><code>{row.app || '—'} · {row.client ?? '—'}</code></dd>
      </dl>
      <div style={{ margin: '8px 0' }}>{row.changes.filter((c) => tech || !TECH.has(c.column)).map((c) => <div key={c.column}><code>{c.column}</code>: <s>{show(c.before)}</s> → <b>{show(c.after)}</b></div>)}</div>
      {row.source === 'app'
        ? <div className="alert alert-ok">Có nhật ký của ứng dụng cùng giao dịch: lần sửa này đi qua đường E2 của ứng dụng (đã khai báo), không cần xác nhận.</div>
        : <div className="alert alert-bad">Không có nhật ký của ứng dụng cùng giao dịch ⇒ lần sửa này <b>không đi qua ứng dụng</b>.</div>}
      {row.ack && <div className="alert alert-ok" style={{ marginTop: 8 }}>Đã xác nhận bởi <b>{row.ack.by}</b> lúc {dateTime(row.ack.at)}: {row.ack.reason}</div>}
      {row.needsAck && canAck && (
        <div style={{ marginTop: 12 }}>
          <label>Lý do xác nhận (ít nhất 10 ký tự)<br />
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} style={{ width: '100%' }} placeholder="vd: đã hỏi người sửa, đúng yêu cầu của kế toán trưởng" /></label>
          <ErrorBox error={ack.error ? errorText(ack.error) : null} />
          <button type="button" className="btn btn-primary" disabled={reason.trim().length < 10 || ack.isPending} onClick={() => ack.mutate()}>Xác nhận đã xem</button>
          <div><small>Xác nhận chỉ thêm một bản ghi mới, không sửa hay xoá dấu vết cũ.</small></div>
        </div>
      )}
      {row.needsAck && !canAck && <div style={{ marginTop: 12 }}><small>Kế toán trưởng (quyền khoá kỳ) xác nhận lần sửa này.</small></div>}
    </Drawer>
  );
}
