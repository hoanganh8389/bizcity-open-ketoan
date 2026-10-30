/**
 * Yêu cầu thanh toán (CN05): đề nghị chi → duyệt một / hai cấp → lập phiếu chi hoặc báo nợ.
 *  - Lập: chọn đối tượng, tick các khoản phải trả đang mở (số đề nghị từng khoản), hoặc nhập khoản chi chưa ghi công nợ.
 *  - Duyệt: người có quyền duyệt bấm Duyệt / Từ chối (kèm lý do). Yêu cầu vượt ngưỡng cần thêm cấp 2.
 *  - Chi: chọn tài khoản tiền và ngày → phần mềm lập phiếu chi (111) hoặc báo nợ (112), ghi sổ, trừ vào các khoản đã chọn.
 *  - In: giấy đề nghị thanh toán 05-TT, uỷ nhiệm chi (paymentRequestPrint.tsx) — trong hộp yêu cầu, hoặc tích nhiều dòng ở danh sách.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, errorText, newIdempotencyKey } from '@/lib/api';
import { date, dateTime, money, today } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { useBranches, BranchPicker } from '@/components/filters';
import { Empty, ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker, PartnerPicker } from '@/components/pickers';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import type { DebtItem } from '@/lib/debts';
import { PrintButton } from '@/components/print';
import { PAYMENT_REQUEST_TEMPLATES } from './paymentRequestPrint';

interface ReqItem { debtItemId: string; docNo: string; accountCode: string; amount: number }
interface Req {
  id: string; requestNo: string; requestDate: string; branchCode: string; partnerCode: string; partnerName: string; partnerBank: { accountNo: string; holder: string; bankName: string };
  amount: number; dueDate: string | null; method: 'cash' | 'bank'; debitAccount: string | null; description: string; sourceRef: string; items: ReqItem[];
  status: string; statusLabel: string; levelsRequired: number; createdBy: string; createdByName: string; submittedAt: string | null;
  approved1By: string | null; approved1At: string | null; approved2By: string | null; approved2At: string | null; rejectedBy: string | null; rejectedReason: string;
  paidDocumentId: string | null; paidDocNo: string | null;
}
interface Account { code: string; name: string }
const STATUS: [string, string][] = [['', 'Tất cả'], ['pending', 'Đang chờ duyệt'], ['draft', 'Nháp'], ['approved', 'Đã duyệt, chờ chi'], ['paid', 'Đã chi'], ['rejected', 'Bị từ chối'], ['cancelled', 'Đã huỷ']];
const parseAmount = (s: string): number => Number(s.replace(/[.,\s]/g, '')) || 0;

export function PaymentRequestsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [editing, setEditing] = useState<Partial<Req> | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const q = useQuery({ queryKey: ['payment-requests', status, partnerCode], queryFn: () => api.get<Req[]>('/api/v1/payment-requests', { status: status || undefined, partnerCode: partnerCode || undefined }) });
  const settings = useQuery({ queryKey: ['payment-request-settings'], queryFn: () => api.get<{ secondLevelFrom: number | null }>('/api/v1/payment-request-settings') });
  const saveSettings = useMutation({ mutationFn: (secondLevelFrom: number | null) => api.put('/api/v1/payment-request-settings', { secondLevelFrom }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['payment-request-settings'] }) });
  const editThreshold = () => {
    const cur = settings.data?.secondLevelFrom;
    const s = window.prompt('Số tiền từ bao nhiêu thì cần cấp duyệt thứ hai? (để trống = mọi yêu cầu chỉ một cấp)', cur ? String(cur) : '');
    if (s !== null) saveSettings.mutate(parseAmount(s) || null);
  };
  const rows = q.data ?? [];
  const picked = rows.filter((r) => selected.has(r.id));
  return (
    <>
      <PageHeader title="Yêu cầu thanh toán" code="CN05" subtitle="Đề nghị chi tiền cho nhà cung cấp, chủ nhà…: lập, duyệt, rồi lập phiếu chi / báo nợ từ yêu cầu đã duyệt" helpKey="yeu-cau-thanh-toan"
        actions={can('documents:write') ? <button className="btn btn-primary" onClick={() => setEditing({ requestDate: today(), method: 'bank', items: [] })}><Plus size={16} /> Lập yêu cầu</button> : undefined} />
      <div className="card">
        <div className="filters">
          <div className="field"><label>Trạng thái</label><select className="select input" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label>Đối tượng</label><PartnerPicker value={partnerCode} onChange={setPartnerCode} placeholder="Tất cả" /></div>
          <div className="field">
            <label>In</label>
            <div className="row" style={{ height: 34 }}><PrintButton screen="CN05" templates={PAYMENT_REQUEST_TEMPLATES} disabled={!picked.length} label={picked.length ? `In ${picked.length} yêu cầu đã chọn` : 'In (tích chọn dòng)'} getDocs={() => picked} /></div>
          </div>
          <div className="field" style={{ marginLeft: 'auto' }}>
            <label>Cấp duyệt thứ hai</label>
            <div className="row" style={{ height: 34 }}>
              <span className="muted">{settings.data?.secondLevelFrom ? `Từ ${money(settings.data.secondLevelFrom)} trở lên` : 'Không dùng (một cấp)'}</span>
              {can('settings:write') && <button className="btn btn-sm" onClick={editThreshold}>Đổi</button>}
            </div>
          </div>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : saveSettings.error ? errorText(saveSettings.error) : null} />
        {q.isLoading ? <Loading /> : !q.data?.length ? <Empty text="Chưa có yêu cầu thanh toán nào" /> : (
          <DataGrid storageKey="cn05" rows={q.data} rowKey={(r) => r.id} onRowClick={(r) => setEditing(r)}
            columns={[
              {
                key: 'pick', noFilter: true, noSort: true, width: 46, value: () => '',
                header: <label className="checkbox" title="Chọn tất cả"><input type="checkbox" checked={rows.length > 0 && rows.every((r) => selected.has(r.id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /> Chọn</label>,
                render: (r) => <input type="checkbox" checked={selected.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />,
              },
              { key: 'requestDate', header: 'Ngày', type: 'date' },
              { key: 'requestNo', header: 'Số yêu cầu', type: 'code' },
              { key: 'partnerCode', header: 'Mã đối tượng', type: 'code' },
              { key: 'partnerName', header: 'Tên đối tượng' },
              { key: 'description', header: 'Nội dung' },
              { key: 'dueDate', header: 'Hạn chi', type: 'date' },
              { key: 'amount', header: 'Số tiền', type: 'money', sum: true },
              { key: 'statusLabel', header: 'Trạng thái', render: (r) => <span className={`badge ${r.status === 'paid' ? 'badge-ok' : r.status === 'rejected' || r.status === 'cancelled' ? 'badge-gray' : 'badge-warn'}`}>{r.statusLabel}{r.status === 'submitted' && r.levelsRequired === 2 ? ' (2 cấp)' : ''}</span> },
              { key: 'createdByName', header: 'Người lập' },
              { key: 'approved', header: 'Người duyệt', value: (r) => [r.approved1By, r.approved2By].filter(Boolean).join(', ') },
              { key: 'paidDocNo', header: 'Phiếu chi', type: 'code', render: (r) => (r.paidDocumentId ? <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setDocId(r.paidDocumentId); }}>{r.paidDocNo}</button> : '') },
              { key: 'branchCode', header: 'Chi nhánh', type: 'code', hidden: true },
              { key: 'sourceRef', header: 'Chứng từ nguồn', hidden: true },
            ] satisfies Column<Req>[]} />
        )}
      </div>
      {editing && <RequestForm value={editing} onClose={() => { setEditing(null); void qc.invalidateQueries({ queryKey: ['payment-requests'] }); }} onOpenDoc={setDocId} />}
      {docId && <DocumentDetail id={docId} onClose={() => setDocId(null)} />}
    </>
  );
}

function RequestForm({ value, onClose, onOpenDoc }: { value: Partial<Req>; onClose: () => void; onOpenDoc: (id: string) => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data: branches } = useBranches();
  const isNew = !value.id;
  const editable = isNew || value.status === 'draft' || value.status === 'rejected';
  const [v, setV] = useState({
    requestDate: value.requestDate ?? today(), branchCode: value.branchCode ?? '', partnerCode: value.partnerCode ?? '', dueDate: value.dueDate ?? '', method: value.method ?? 'bank',
    description: value.description ?? '', sourceRef: value.sourceRef ?? '', amount: value.items?.length ? '' : value.amount ? money(value.amount) : '', debitAccount: value.debitAccount ?? '',
  });
  const [picked, setPicked] = useState<Record<string, string>>(Object.fromEntries((value.items ?? []).map((i) => [i.debtItemId, money(i.amount)])));
  const [pay, setPay] = useState({ docDate: today(), moneyAccount: '' });
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const branchCode = v.branchCode || branches?.find((b) => b.isActive)?.code || '';
  const open = useQuery({
    queryKey: ['debt-items', 'request', v.partnerCode],
    queryFn: () => api.get<DebtItem[]>('/api/v1/debt-items', { partnerCode: v.partnerCode, side: 'credit', status: 'open', pageSize: 500 }),
    enabled: editable && v.partnerCode.length >= 2,
  });
  const moneyAccounts = useQuery({ queryKey: ['accounts', 'posting'], queryFn: () => api.get<Account[]>('/api/v1/accounts', { postingOnly: true }), staleTime: 60_000, enabled: value.status === 'approved' });
  const items = Object.entries(picked).map(([debtItemId, s]) => ({ debtItemId, amount: parseAmount(s) })).filter((i) => i.amount > 0);
  const total = items.length ? items.reduce((s, i) => s + i.amount, 0) : parseAmount(v.amount);
  const body = (submit: boolean) => ({
    requestDate: v.requestDate, branchCode, partnerCode: v.partnerCode, dueDate: v.dueDate || undefined, method: v.method, description: v.description, sourceRef: v.sourceRef,
    items, amount: items.length ? undefined : parseAmount(v.amount) || undefined, debitAccount: items.length ? undefined : v.debitAccount || undefined, submit,
  });
  const done = () => { void qc.invalidateQueries({ queryKey: ['payment-requests'] }); void qc.invalidateQueries({ queryKey: ['debt-items'] }); onClose(); };
  const viewAgain = useViewAgain();
  // Một khoá chống gửi lặp cho mỗi lần mở form: bấm đúp Ghi / Chi, hay gửi lại sau lỗi mạng không tạo yêu cầu, phiếu chi trùng.
  const [createKey] = useState(newIdempotencyKey);
  const [payKey] = useState(newIdempotencyKey);
  // Sửa rồi Ghi (không trình duyệt): ở lại, quay về chế độ xem. Thêm mới / trình duyệt: đóng như cũ.
  const save = useMutation({ mutationFn: (submit: boolean) => (isNew ? api.post('/api/v1/payment-requests', body(submit), { idempotencyKey: createKey }) : api.put(`/api/v1/payment-requests/${value.id}`, body(submit))),
    onSuccess: (_r, submit) => { if (isNew || submit) done(); else { void qc.invalidateQueries({ queryKey: ['payment-requests'] }); void qc.invalidateQueries({ queryKey: ['debt-items'] }); viewAgain[1](); } } });
  const act = useMutation({ mutationFn: (a: { action: string; body?: unknown }) => api.post(`/api/v1/payment-requests/${value.id}/${a.action}`, a.body ?? {}, a.action === 'pay' ? { idempotencyKey: payKey } : undefined), onSuccess: done });
  const canApprove = (value.status === 'submitted' && can('payments:approve')) || (value.status === 'approved1' && can('payments:approve-final'));
  const error = save.error ?? act.error;
  return (
    <Modal viewAgain={viewAgain} viewFirst={!isNew} wide title={isNew ? 'Lập yêu cầu thanh toán' : `Yêu cầu thanh toán ${value.requestNo} — ${value.statusLabel}`} onClose={onClose}
      footer={<>
        {!isNew && !['paid', 'cancelled'].includes(value.status ?? '') && can('documents:write') && <button data-view-ok className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={act.isPending} onClick={() => window.confirm('Huỷ yêu cầu thanh toán này?') && act.mutate({ action: 'cancel' })}>Huỷ yêu cầu</button>}
        {!isNew && value.requestNo && <span data-view-ok><PrintButton screen="CN05" templates={PAYMENT_REQUEST_TEMPLATES} title="In yêu cầu theo nội dung đã lưu" getDocs={() => [value as Req]} /></span>}
        <button className="btn" onClick={onClose}>Đóng</button>
        {editable && can('documents:write') && <button className="btn" disabled={save.isPending || !v.partnerCode || !(total > 0)} onClick={() => save.mutate(false)}>Lưu nháp</button>}
        {editable && can('documents:write') && <button className="btn btn-primary" disabled={save.isPending || !v.partnerCode || !(total > 0)} onClick={() => save.mutate(true)}>Gửi duyệt</button>}
        {canApprove && <button className="btn" disabled={act.isPending} onClick={() => { const reason = window.prompt('Lý do từ chối:'); if (reason) act.mutate({ action: 'reject', body: { reason } }); }}>Từ chối</button>}
        {canApprove && <button className="btn btn-primary" disabled={act.isPending} onClick={() => act.mutate({ action: 'approve' })}>Duyệt{value.status === 'approved1' ? ' cấp 2' : value.levelsRequired === 2 ? ' cấp 1' : ''}</button>}
        {value.status === 'approved' && can('documents:write') && <button className="btn btn-primary" disabled={act.isPending || !pay.moneyAccount} onClick={() => act.mutate({ action: 'pay', body: pay })}>Lập phiếu {pay.moneyAccount.startsWith('112') ? 'báo nợ' : 'chi'}</button>}
      </>}>
      <Field label="Ngày yêu cầu"><input type="date" className="input" value={v.requestDate} disabled={!editable} onChange={(e) => set({ requestDate: e.target.value })} /></Field>
      <Field label="Chi nhánh">
        <BranchPicker activeOnly value={branchCode} disabled={!editable} onChange={(c) => set({ branchCode: c })} />
      </Field>
      <Field label="Đối tượng nhận tiền" hint={value.partnerName}><PartnerPicker activeOnly={isNew} disabled={!editable} value={v.partnerCode} onChange={(partnerCode) => { set({ partnerCode }); setPicked({}); }} placeholder="Gõ mã, tên hoặc mã số thuế" /></Field>
      <Field label="Hạn chi"><input type="date" className="input" value={v.dueDate} disabled={!editable} onChange={(e) => set({ dueDate: e.target.value })} /></Field>
      <Field label="Hình thức">
        <select className="select input" value={v.method} disabled={!editable} onChange={(e) => set({ method: e.target.value as 'cash' | 'bank' })}><option value="bank">Chuyển khoản</option><option value="cash">Tiền mặt</option></select>
      </Field>
      <Field label="Chứng từ nguồn" hint="Số hợp đồng, đơn đặt hàng, báo giá…"><input className="input" value={v.sourceRef} disabled={!editable} onChange={(e) => set({ sourceRef: e.target.value })} /></Field>
      <Field label="Nội dung" full><input className="input" value={v.description} disabled={!editable} onChange={(e) => set({ description: e.target.value })} /></Field>
      {value.partnerBank?.accountNo && <div className="full muted">Tài khoản nhận: <b className="mono">{value.partnerBank.accountNo}</b> — {value.partnerBank.holder} — {value.partnerBank.bankName}</div>}

      <div className="full">
        <h3 style={{ fontSize: 14, margin: '6px 0' }}>Các khoản phải trả đề nghị thanh toán</h3>
        {!editable ? (
          value.items?.length ? (
            <table className="grid">
              <thead><tr><th>Số chứng từ</th><th>TK</th><th className="num">Số đề nghị</th></tr></thead>
              <tbody>{value.items.map((i) => <tr key={i.debtItemId}><td className="mono">{i.docNo}</td><td className="mono">{i.accountCode}</td><td className="num">{money(i.amount)}</td></tr>)}</tbody>
            </table>
          ) : <div className="muted">Khoản chi chưa ghi công nợ — ghi Nợ tài khoản <b className="mono">{value.debitAccount}</b>.</div>
        ) : !v.partnerCode ? <div className="muted">Chọn đối tượng để xem các khoản phải trả đang mở.</div> : open.isLoading ? <Loading /> : !open.data?.length ? <div className="muted">Đối tượng không có khoản phải trả nào đang mở. Nhập khoản chi chưa ghi công nợ ở dưới.</div> : (
          <div style={{ maxHeight: '28vh', overflow: 'auto' }}>
            <table className="grid">
              <thead><tr><th>Hạn TT</th><th>Ngày CT</th><th>Số chứng từ</th><th>TK</th><th>Diễn giải</th><th className="num">Còn lại</th><th className="num" style={{ width: 170 }}>Đề nghị trả</th></tr></thead>
              <tbody>
                {open.data.map((i) => (
                  <tr key={i.id}>
                    <td className={i.overdueDays ? 'text-bad' : undefined}>{date(i.dueDate)}</td><td>{date(i.docDate)}</td><td className="mono">{i.docNo}</td><td className="mono">{i.accountCode}</td><td>{i.description}</td><td className="num">{money(i.remaining)}</td>
                    <td><input className="input num" inputMode="numeric" value={picked[i.id] ?? ''} placeholder="0" onChange={(e) => setPicked((p) => ({ ...p, [i.id]: e.target.value }))} onFocus={() => !picked[i.id] && setPicked((p) => ({ ...p, [i.id]: money(i.remaining) }))} onBlur={() => setPicked((p) => ({ ...p, [i.id]: parseAmount(p[i.id] ?? '') ? money(Math.min(parseAmount(p[i.id] ?? ''), i.remaining)) : '' }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editable && !items.length && (
        <>
          <Field label="Số tiền (khoản chưa ghi công nợ)"><input className="input num" inputMode="numeric" value={v.amount} onChange={(e) => set({ amount: e.target.value })} onBlur={() => set({ amount: parseAmount(v.amount) ? money(parseAmount(v.amount)) : '' })} /></Field>
          <Field label="TK ghi Nợ khi chi" hint="Chi phí, trả trước, phải trả…"><AccountPicker postingOnly className="input mono" value={v.debitAccount} onChange={(debitAccount) => set({ debitAccount })} /></Field>
        </>
      )}
      <div className="full">Tổng đề nghị: <b>{money(total, { blankZero: false })}</b></div>

      {!isNew && (
        <div className="full muted">
          Người lập: {value.createdByName}{value.submittedAt ? ` · gửi duyệt ${dateTime(value.submittedAt)}` : ''}
          {value.approved1By ? ` · duyệt${value.levelsRequired === 2 ? ' cấp 1' : ''}: ${value.approved1By} ${dateTime(value.approved1At)}` : ''}
          {value.approved2By ? ` · duyệt cấp 2: ${value.approved2By} ${dateTime(value.approved2At)}` : ''}
          {value.status === 'rejected' ? ` · ${value.rejectedBy} từ chối: ${value.rejectedReason}` : ''}
          {value.paidDocumentId ? <> · đã chi bằng phiếu <button className="btn btn-sm" onClick={() => onOpenDoc(value.paidDocumentId!)}>{value.paidDocNo}</button></> : null}
        </div>
      )}
      {value.status === 'approved' && can('documents:write') && (
        <>
          <Field label="Ngày chi"><input type="date" className="input" value={pay.docDate} onChange={(e) => setPay((p) => ({ ...p, docDate: e.target.value }))} /></Field>
          <Field label="Chi từ tài khoản tiền" hint="111… lập phiếu chi; 112… lập phiếu báo nợ">
            <select className="select input" value={pay.moneyAccount} onChange={(e) => setPay((p) => ({ ...p, moneyAccount: e.target.value }))}>
              <option value="">— Chọn tài khoản tiền —</option>
              {(moneyAccounts.data ?? []).filter((a) => a.code.startsWith(value.method === 'cash' ? '111' : '112')).map((a) => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
            </select>
          </Field>
        </>
      )}
      {error && <div className="alert alert-bad full">{errorText(error)}</div>}
    </Modal>
  );
}
