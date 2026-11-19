/**
 * BH14 thẻ "Yêu cầu trả quá hạn" (phiếu NT-BH-030 Q2): yêu cầu máy bán gửi khi khách trả quá hạn; người có quyền "Duyệt trả quá hạn"
 * (pos:return-approve — mặc định kế toán trưởng, chủ đơn vị) duyệt / từ chối kèm lý do; người gửi không tự duyệt. Dưới: dòng xin trả + nhật ký.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: màn duyệt yêu cầu trả quá hạn (đóng góp)
import { useState } from 'react';
import { DataGrid, ErrorBox, Field, Loading, Modal, errorText, useApi, useCan, useMutation, useQueryClient, type GridColumn } from '@bizcity/ui-kit';
import { Badge, M, RangeLayout, time, usePage, useRange } from '../lib';

type Status = 'pending' | 'approved' | 'rejected' | 'used';
type Line = { lineId: string; sku: string; name: string; unitName: string; qty: number; condition: 'good' | 'bad'; refund: number };
type LogRow = { action: string; actor: string; actorName: string; note: string; at: string };
type Row = {
  id: string; orderCode: string; orderBranchCode: string; orderDate: string; branchCode: string; status: Status; customer: { name: string; phone: string };
  lines: Line[]; refundTotal: number; reason: string; note: string; deadline: string; requestedByName: string; requestedBy: string; requestedAt: string;
  decidedByName: string; decidedAt: string | null; decisionNote: string; rejectReason: string; log: LogRow[];
};

const STATUS: Record<Status, { label: string; tone: string }> = {
  pending: { label: 'Chờ duyệt', tone: 'warn' }, approved: { label: 'Đã duyệt', tone: 'ok' }, rejected: { label: 'Bị từ chối', tone: 'bad' }, used: { label: 'Đã lập phiếu trả', tone: 'gray' },
};
const LOG: Record<string, string> = { submit: 'Gửi yêu cầu', approve: 'Duyệt', reject: 'Từ chối', use: 'Lập phiếu trả' };

const cols: GridColumn<Row>[] = [
  { key: 'requestedAt', header: 'Gửi lúc', width: 110, value: (r) => r.requestedAt, render: (r) => time(r.requestedAt) },
  { key: 'status', header: 'Trạng thái', width: 120, value: (r) => STATUS[r.status].label, render: (r) => <Badge map={STATUS} value={r.status} /> },
  { key: 'branchCode', header: 'Cửa hàng nhận', type: 'code', width: 100 },
  { key: 'orderCode', header: 'Đơn gốc', type: 'code', width: 130 },
  { key: 'orderBranchCode', header: 'Cửa hàng bán', type: 'code', width: 100 },
  { key: 'orderDate', header: 'Ngày bán', width: 95 },
  { key: 'deadline', header: 'Hạn trả', width: 95 },
  { key: 'customer', header: 'Khách', width: 150, value: (r) => [r.customer?.name, r.customer?.phone].filter(Boolean).join(' · ') },
  { key: 'refundTotal', header: 'Tiền hoàn', type: 'money', sum: true, width: 110 },
  { key: 'reason', header: 'Lý do khách trả', width: 200 },
  { key: 'requestedByName', header: 'Người gửi', width: 130, value: (r) => r.requestedByName || r.requestedBy },
  { key: 'decidedByName', header: 'Người duyệt / từ chối', width: 150 },
  { key: 'decision', header: 'Ghi chú duyệt / lý do từ chối', width: 220, value: (r) => r.rejectReason || r.decisionNote },
];
const lineCols: GridColumn<Line>[] = [
  { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 },
  { key: 'name', header: 'Tên hàng', width: 240 },
  { key: 'qty', header: 'SL trả', type: 'qty', width: 70 },
  { key: 'unitName', header: 'ĐVT', width: 70 },
  { key: 'condition', header: 'Tình trạng', width: 110, value: (l) => (l.condition === 'bad' ? 'Lỗi – hết hạn' : 'Nguyên vẹn') },
  { key: 'refund', header: 'Tiền hoàn', type: 'money', sum: true, width: 110 },
];
const logCols: GridColumn<LogRow>[] = [
  { key: 'at', header: 'Lúc', width: 110, value: (r) => r.at, render: (r) => time(r.at) },
  { key: 'action', header: 'Việc', width: 120, value: (r) => LOG[r.action] ?? r.action },
  { key: 'actorName', header: 'Người làm', width: 150, value: (r) => r.actorName || r.actor },
  { key: 'note', header: 'Lý do / ghi chú', width: 260 },
];

export function YeuCauTraQuaHan() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const approver = can('pos:return-approve');
  const r = useRange({ status: 'pending' });
  const [pick, setPick] = useState<Row | null>(null);
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [msg, setMsg] = useState('');
  const q = usePage<Row[]>('return-approvals', '/admin/return-approvals', { ...r.applied, pageSize: 500 });
  const done = (m: string) => { setDialog(null); setPick(null); setMsg(m); void qc.invalidateQueries({ queryKey: ['pos-admin', 'return-approvals'] }); };
  const status = (
    <label className="rp-field">
      <span>Trạng thái</span>
      <select className="input" value={r.draft.status ?? ''} onChange={(e) => r.setDraft({ ...r.draft, status: e.target.value })}>
        <option value="">Tất cả</option>
        {(Object.keys(STATUS) as Status[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
      </select>
    </label>
  );
  return (
    <RangeLayout r={r} id="pos-tra-qua-han" more={status}>
      <div className="row" style={{ gap: 8, margin: '4px 0 8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {approver && <button type="button" className="btn btn-primary" disabled={pick?.status !== 'pending'} title="Người gửi không tự duyệt" onClick={() => setDialog('approve')}>Duyệt</button>}
        {approver && <button type="button" className="btn" disabled={pick?.status !== 'pending'} onClick={() => setDialog('reject')}>Từ chối</button>}
        {!approver && <span className="muted">Duyệt cần quyền "Duyệt trả quá hạn" (kế toán trưởng, chủ đơn vị).</span>}
        {msg && <span className="muted">{msg}</span>}
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <>
          <DataGrid rows={q.data?.data ?? []} columns={cols} rowKey={(x) => x.id} storageKey="pos.tra-qua-han" onRowClick={setPick}
            rowClassName={(x) => (x.id === pick?.id ? 'selected' : '')} emptyText="Không có yêu cầu trả quá hạn" maxHeight="42vh"
            exportName="yeu-cau-tra-qua-han" exportTitle="Yêu cầu trả hàng quá hạn" />
          <div className="card" style={{ marginTop: 8, padding: 8, display: 'grid', gap: 8 }}>
            <b>Chi tiết · {pick ? `${pick.orderCode} → ${pick.branchCode}${pick.note ? ` · ${pick.note}` : ''}` : 'bấm một yêu cầu ở trên'}</b>
            {pick && <DataGrid rows={pick.lines} columns={lineCols} rowKey={(l) => `${l.lineId}-${l.condition}`} storageKey="pos.tra-qua-han.dong" maxHeight="24vh" />}
            {pick && <DataGrid rows={pick.log} columns={logCols} rowKey={(l) => `${l.at}-${l.action}`} storageKey="pos.tra-qua-han.nhat-ky" maxHeight="18vh" />}
          </div>
        </>
      )}
      {pick && dialog && <DecideDialog row={pick} kind={dialog} onClose={() => setDialog(null)} onDone={done} api={api} />}
    </RangeLayout>
  );
}

function DecideDialog({ row, kind, onClose, onDone, api }: { row: Row; kind: 'approve' | 'reject'; onClose: () => void; onDone: (m: string) => void; api: ReturnType<typeof useApi> }) {
  const [text, setText] = useState('');
  const go = useMutation({
    mutationFn: () => api.post(`${M}/return-approvals/${row.id}/${kind}`, kind === 'approve' ? (text.trim() ? { note: text.trim() } : {}) : { reason: text.trim() }),
    onSuccess: () => onDone(kind === 'approve' ? `Đã duyệt trả quá hạn đơn ${row.orderCode} — máy bán lập được phiếu trả.` : `Đã từ chối trả quá hạn đơn ${row.orderCode}.`),
  });
  return (
    <Modal title={`${kind === 'approve' ? 'Duyệt' : 'Từ chối'} trả quá hạn đơn ${row.orderCode}`} onClose={onClose} footer={<div className="row" style={{ gap: 8 }}>
      <button type="button" className="btn btn-primary" disabled={go.isPending || (kind === 'reject' && !text.trim())} onClick={() => go.mutate()}>{kind === 'approve' ? 'Duyệt' : 'Từ chối'}</button>
      <button type="button" className="btn" onClick={onClose}>Đóng</button></div>}>
      <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8 }}>
        <div>Bán {row.orderDate} ở {row.orderBranchCode}, hạn trả {row.deadline} · trả ở {row.branchCode} · {row.lines.length} dòng, hoàn {new Intl.NumberFormat('vi-VN').format(row.refundTotal)} đ · lý do: {row.reason} · người gửi {row.requestedByName || row.requestedBy}</div>
        <Field label={kind === 'approve' ? 'Ghi chú duyệt' : 'Lý do từ chối (*)'} hint={kind === 'reject' ? 'Thu ngân thấy lý do trên máy bán' : 'Máy bán lập phiếu trả đúng các dòng đã duyệt'}>
          <input className="input" style={{ width: 420 }} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {go.error && <ErrorBox error={errorText(go.error)} />}
      </div>
    </Modal>
  );
}
