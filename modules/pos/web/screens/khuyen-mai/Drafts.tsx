/**
 * Màn Chương trình khuyến mại (BH18), phiếu NT-BH-025: thẻ "Nháp / chờ duyệt" (gửi duyệt, duyệt → phát hành bằng quyền người duyệt,
 * từ chối kèm lý do, nhật ký), cảnh báo chương trình trùng, thẻ "Báo cáo khuyến mại" (chương trình × cửa hàng × kỳ, bấm xem đơn, Excel).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: nháp / duyệt / báo cáo khuyến mại (đóng góp)
import { useState } from 'react';
import { BranchCheckList, DataGrid, ErrorBox, Field, Loading, Modal, errorText, useApi, useCan, useMutation, useQuery, useQueryClient, type GridColumn } from '@bizcity/ui-kit';
import { Badge, M, time } from '../../lib';
import { DRAFT_STATUS_LABEL, KIND_BY_CONTRACT, KIND_INFO, LOG_LABEL, fromParams, fromQuota, type DraftStatus, type Form, type Quota } from './model';

export type Overlap = { key: string; source: 'published' | 'draft'; status: string; name: string; branches: string[]; from: string; to: string | null; skus: string[] | null };
export type Draft = {
  id: string; key: string; ruleContract: string; params: Record<string, unknown>; branchCodes: string[]; effectiveFrom: string; reason: string;
  quota: Quota | null; status: DraftStatus; source: string; sourceRef: string | null; createdBy: string; createdByName: string; createdAt: string;
  updatedAt: string; approvedByName: string; rejectReason: string; publishedVersion: number | null;
};
type LogRow = { action: string; actorName: string; actor: string; note: string; at: string };

/** Danh sách chương trình trùng (chỉ cảnh báo). */
export function OverlapList({ overlaps }: { overlaps: Overlap[] }) {
  if (!overlaps.length) return <span className="muted">Không có chương trình trùng mã hàng / cửa hàng / thời gian.</span>;
  return (
    <div className="card" style={{ padding: 8, borderColor: 'var(--warn, #d97706)' }}>
      <b>⚠ Trùng với {overlaps.length} chương trình (cùng mã hàng, cùng cửa hàng, giao thời gian) — vẫn lưu / duyệt được; lúc bán luật "áp riêng / ưu tiên" quyết định:</b>
      {overlaps.map((o) => (
        <div key={`${o.source}-${o.key}`}>
          • {o.name || o.key} ({o.key}; {o.branches.length ? o.branches.join(', ') : 'mọi cửa hàng'}; {o.from || '…'} – {o.to ?? 'không hạn'})
          {' '}<span className="muted">{o.source === 'published' ? 'đang áp' : 'chờ duyệt'}{o.skus ? ` · mã ${o.skus.slice(0, 5).join(', ')}${o.skus.length > 5 ? '…' : ''}` : ' · cả đơn'}</span>
        </div>
      ))}
    </div>
  );
}

/** Nháp → form để sửa (nội dung + ngày áp + ghi chú + hạn mức). */
export function draftToForm(d: Draft, today: string): Form | null {
  const f = fromParams(d.ruleContract, d.params, { key: d.key, branchCodes: d.branchCodes, today });
  return f && { ...f, effectiveFrom: d.effectiveFrom, reason: d.reason, ...fromQuota(d.quota) };
}

const quotaText = (q: Quota | null) => {
  if (!q) return '';
  const parts = [...(q.perBranch !== undefined ? [`${q.perBranch} / cửa hàng`] : []), ...Object.entries(q.branches ?? {}).map(([b, n]) => `${b}: ${n}`)];
  return parts.join(' · ');
};

const cols: GridColumn<Draft>[] = [
  { key: 'key', header: 'Mã', type: 'code', width: 140 },
  { key: 'kind', header: 'Loại', width: 200, value: (r) => (KIND_BY_CONTRACT[r.ruleContract] ? KIND_INFO[KIND_BY_CONTRACT[r.ruleContract]!].label : r.ruleContract) },
  { key: 'reason', header: 'Tên / ghi chú', width: 220 },
  { key: 'branchCodes', header: 'Cửa hàng', width: 130, value: (r) => r.branchCodes.join(', ') || 'Mọi cửa hàng' },
  { key: 'effectiveFrom', header: 'Áp từ', width: 100 },
  { key: 'quota', header: 'Hạn mức lượt', width: 140, value: (r) => quotaText(r.quota) },
  { key: 'status', header: 'Trạng thái', width: 150, value: (r) => DRAFT_STATUS_LABEL[r.status].label, render: (r) => <Badge map={DRAFT_STATUS_LABEL} value={r.status} /> },
  { key: 'createdByName', header: 'Người lập', width: 130, value: (r) => r.createdByName || r.createdBy },
  { key: 'source', header: 'Nguồn', width: 110, value: (r) => (r.source === 'migrate' ? 'Chuyển từ website' : 'Màn BH18') },
  { key: 'rejectReason', header: 'Lý do từ chối', width: 200 },
  { key: 'updatedAt', header: 'Sửa lúc', width: 110, value: (r) => r.updatedAt, render: (r) => time(r.updatedAt) },
];

/** Thẻ "Nháp / chờ duyệt". */
export function DraftsTab({ today, onEdit, onMsg }: { today: string; onEdit: (d: Draft) => void; onMsg: (m: string) => void }) {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const writable = can('settings:write');
  const approver = can('pos:promo-approve');
  const [status, setStatus] = useState<'' | DraftStatus>('');
  const [pick, setPick] = useState<Draft | null>(null);
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'log' | null>(null);
  const list = useQuery({ queryKey: ['km', 'drafts', status], queryFn: () => api.get<Draft[]>(`${M}/promo/drafts`, status ? { status } : {}) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['km'] });
  const submit = useMutation({
    mutationFn: (d: Draft) => api.put(`${M}/promo/drafts/${d.id}`, {
      key: d.key, ruleContract: d.ruleContract, params: d.params, branchCodes: d.branchCodes, effectiveFrom: d.effectiveFrom,
      ...(d.reason ? { reason: d.reason } : {}), quota: d.quota, submit: true,
    }),
    onSuccess: (_x, d) => { onMsg(`Đã gửi duyệt ${d.key}.`); void refresh(); },
  });
  const editable = pick && ['draft', 'pending', 'rejected'].includes(pick.status);
  return (
    <div>
      <div className="row" style={{ gap: 8, margin: '4px 0 8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as '' | DraftStatus)}>
          <option value="">Chưa phát hành (nháp, chờ duyệt, từ chối)</option>
          {(Object.keys(DRAFT_STATUS_LABEL) as DraftStatus[]).map((s) => <option key={s} value={s}>{DRAFT_STATUS_LABEL[s].label}</option>)}
        </select>
        {writable && <button type="button" className="btn" disabled={!editable} onClick={() => pick && onEdit(pick)}>Sửa nháp</button>}
        {writable && <button type="button" className="btn" disabled={!pick || !['draft', 'rejected'].includes(pick.status) || submit.isPending} onClick={() => pick && submit.mutate(pick)}>Gửi duyệt</button>}
        {approver && <button type="button" className="btn btn-primary" disabled={!pick || !['draft', 'pending', 'approved', 'rejected'].includes(pick.status)} title="Người lập không tự duyệt"
          onClick={() => setDialog('approve')}>{pick?.status === 'approved' ? 'Phát hành lại' : 'Duyệt'}</button>}
        {approver && <button type="button" className="btn" disabled={!pick || !['draft', 'pending', 'approved'].includes(pick.status)} onClick={() => setDialog('reject')}>Từ chối</button>}
        <button type="button" className="btn" disabled={!pick} onClick={() => setDialog('log')}>Nhật ký</button>
        {!approver && <span className="muted">Duyệt cần quyền "Duyệt khuyến mại" (chủ đơn vị, kế toán trưởng).</span>}
      </div>
      {submit.error && <ErrorBox error={errorText(submit.error)} />}
      {list.isLoading ? <Loading /> : list.error ? <ErrorBox error={errorText(list.error)} /> : (
        <DataGrid rows={list.data ?? []} columns={cols} rowKey={(r) => r.id} storageKey="pos.khuyen-mai.nhap" onRowClick={setPick}
          onRowDoubleClick={(r) => writable && ['draft', 'pending', 'rejected'].includes(r.status) && onEdit(r)}
          rowClassName={(r) => (r.id === pick?.id ? 'selected' : '')} emptyText="Không có bản nháp" exportName="khuyen-mai-nhap" exportTitle="Khuyến mại — nháp / chờ duyệt" />
      )}
      {pick && dialog === 'approve' && <ApproveDialog draft={pick} today={today} onClose={() => setDialog(null)} onDone={(m) => { setDialog(null); setPick(null); onMsg(m); void refresh(); }} />}
      {pick && dialog === 'reject' && <RejectDialog draft={pick} onClose={() => setDialog(null)} onDone={(m) => { setDialog(null); setPick(null); onMsg(m); void refresh(); }} />}
      {pick && dialog === 'log' && <LogDialog draft={pick} onClose={() => setDialog(null)} />}
    </div>
  );
}

/** Duyệt: hiện cảnh báo trùng → module ghi "đã duyệt" + hạn mức → màn phát hành vào sổ chính sách (quyền người duyệt) → ghi bản đã phát hành. */
function ApproveDialog({ draft, today, onClose, onDone }: { draft: Draft; today: string; onClose: () => void; onDone: (m: string) => void }) {
  const api = useApi();
  const [note, setNote] = useState('');
  const ov = useQuery({ queryKey: ['km', 'overlaps', draft.id], queryFn: () => api.get<Overlap[]>(`${M}/promo/drafts/${draft.id}/overlaps`) });
  const go = useMutation({
    mutationFn: async () => {
      const d = draft.status === 'approved' ? draft : await api.post<Draft>(`${M}/promo/drafts/${draft.id}/approve`, note.trim() ? { note: note.trim() } : {});
      const pub = await api.post<{ version: number }>('/api/v1/policies', {
        key: d.key, ruleContract: d.ruleContract, params: d.params, effectiveFrom: d.effectiveFrom,
        ...(d.branchCodes.length ? { scope: { branchCodes: d.branchCodes } } : {}), ...(d.reason ? { reason: d.reason } : {}),
      });
      await api.post(`${M}/promo/drafts/${draft.id}/published`, { version: pub.version });
      return pub.version;
    },
    onSuccess: (v) => onDone(`Đã duyệt và phát hành ${draft.key} (bản ${v}) — máy bán áp từ ${draft.effectiveFrom}.`),
  });
  return (
    <Modal wide title={`${draft.status === 'approved' ? 'Phát hành lại' : 'Duyệt'} khuyến mại ${draft.key}`} onClose={onClose} footer={<div className="row" style={{ gap: 8 }}>
      <button type="button" className="btn btn-primary" disabled={go.isPending} onClick={() => go.mutate()}>{draft.status === 'approved' ? 'Phát hành' : 'Duyệt và phát hành'}</button>
      <button type="button" className="btn" onClick={onClose}>Đóng</button></div>}>
      <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8 }}>
        <div>{draft.reason || draft.key} · {KIND_BY_CONTRACT[draft.ruleContract] ? KIND_INFO[KIND_BY_CONTRACT[draft.ruleContract]!].label : draft.ruleContract} ·
          {' '}{draft.branchCodes.join(', ') || 'mọi cửa hàng'} · áp từ {draft.effectiveFrom}{draft.effectiveFrom < today ? ' (lùi ngày)' : ''}
          {draft.quota ? ` · hạn mức ${quotaText(draft.quota)}` : ''} · người lập {draft.createdByName || draft.createdBy}</div>
        {ov.isLoading ? <Loading /> : ov.error ? <ErrorBox error={errorText(ov.error)} /> : <OverlapList overlaps={ov.data ?? []} />}
        {draft.status !== 'approved' && <Field label="Ghi chú duyệt"><input className="input" style={{ width: 420 }} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
        {go.error && <ErrorBox error={errorText(go.error)} />}
      </div>
    </Modal>
  );
}

function RejectDialog({ draft, onClose, onDone }: { draft: Draft; onClose: () => void; onDone: (m: string) => void }) {
  const api = useApi();
  const [reason, setReason] = useState('');
  const go = useMutation({ mutationFn: () => api.post(`${M}/promo/drafts/${draft.id}/reject`, { reason: reason.trim() }), onSuccess: () => onDone(`Đã từ chối ${draft.key}.`) });
  return (
    <Modal title={`Từ chối khuyến mại ${draft.key}`} onClose={onClose} footer={<div className="row" style={{ gap: 8 }}>
      <button type="button" className="btn btn-primary" disabled={!reason.trim() || go.isPending} onClick={() => go.mutate()}>Từ chối</button>
      <button type="button" className="btn" onClick={onClose}>Đóng</button></div>}>
      <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8 }}>
        <Field label="Lý do (*)" hint="Người lập thấy lý do, sửa rồi gửi duyệt lại"><input className="input" style={{ width: 420 }} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {go.error && <ErrorBox error={errorText(go.error)} />}
      </div>
    </Modal>
  );
}

function LogDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const api = useApi();
  const q = useQuery({ queryKey: ['km', 'draft', draft.id], queryFn: () => api.get<Draft & { log: LogRow[] }>(`${M}/promo/drafts/${draft.id}`) });
  const logCols: GridColumn<LogRow>[] = [
    { key: 'at', header: 'Lúc', width: 120, value: (r) => r.at, render: (r) => time(r.at) },
    { key: 'action', header: 'Việc', width: 130, value: (r) => LOG_LABEL[r.action] ?? r.action },
    { key: 'actorName', header: 'Người làm', width: 160, value: (r) => r.actorName || r.actor },
    { key: 'note', header: 'Ghi chú', width: 280 },
  ];
  return (
    <Modal wide title={`Nhật ký ${draft.key}`} onClose={onClose}>
      <div style={{ gridColumn: '1 / -1' }}>
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
          <DataGrid rows={q.data?.log ?? []} columns={logCols} rowKey={(r) => `${r.at}-${r.action}`} storageKey="pos.khuyen-mai.nhat-ky" exportName={`nhat-ky-${draft.key}`} />
        )}
      </div>
    </Modal>
  );
}

// ── Báo cáo khuyến mại đã dùng ─────────────────────────────────────────────────────────────────────────────────────────
type ReportRow = { key: string; name: string; branchCode: string; orders: number; released: number; discount: number; gifts: number; offlineOver: number; used: number; quota: number | null; left: number | null };
type UseRow = { source: string; refId: string; code: string; businessDate: string; discount: number; gifts: number; offlineOver: boolean; released: boolean; releaseReason: string };

const reportCols: GridColumn<ReportRow>[] = [
  { key: 'key', header: 'Mã chương trình', type: 'code', width: 140 },
  { key: 'name', header: 'Tên', width: 200 },
  { key: 'branchCode', header: 'Cửa hàng', type: 'code', width: 90 },
  { key: 'orders', header: 'Số đơn áp', type: 'number', sum: true, width: 90 },
  { key: 'discount', header: 'Tiền giảm', type: 'money', sum: true, width: 120 },
  { key: 'gifts', header: 'Số quà', type: 'qty', sum: true, width: 80 },
  { key: 'released', header: 'Đơn đã trả lượt', type: 'number', sum: true, width: 110 },
  { key: 'used', header: 'Lượt đang dùng', type: 'number', width: 100 },
  { key: 'quota', header: 'Hạn mức', type: 'number', width: 80 },
  { key: 'left', header: 'Còn', type: 'number', width: 70 },
  { key: 'offlineOver', header: 'Vượt khi mất mạng', type: 'number', sum: true, width: 120, hidden: true },
];
const useCols: GridColumn<UseRow>[] = [
  { key: 'code', header: 'Số phiếu', type: 'code', width: 130 },
  { key: 'source', header: 'Nguồn', width: 130, value: (r) => (r.source === 'pos' ? 'Máy bán' : 'Phiếu bán BH10') },
  { key: 'businessDate', header: 'Ngày bán', width: 100 },
  { key: 'discount', header: 'Tiền giảm', type: 'money', sum: true, width: 110 },
  { key: 'gifts', header: 'Số quà', type: 'qty', sum: true, width: 80 },
  { key: 'released', header: 'Trả lượt', width: 140, value: (r) => (r.released ? ({ return: 'Trả cả đơn', cancel: 'Huỷ đơn', unapprove: 'Bỏ duyệt' }[r.releaseReason] ?? 'Đã trả') : '') },
  { key: 'offlineOver', header: 'Ghi chú', width: 160, value: (r) => (r.offlineOver ? 'Mất mạng, vượt hạn mức' : '') },
];

export function PromoReportTab({ today }: { today: string }) {
  const api = useApi();
  const [draft, setDraft] = useState({ from: `${today.slice(0, 8)}01`, to: today, branches: '', key: '' });
  const [f, setF] = useState(draft);
  const [pick, setPick] = useState<ReportRow | null>(null);
  const q = useQuery({ queryKey: ['km', 'report', f], queryFn: () => api.get<ReportRow[]>(`${M}/promo/report`, Object.fromEntries(Object.entries(f).filter(([, v]) => v))) });
  const orders = useQuery({
    queryKey: ['km', 'report-orders', f, pick?.key, pick?.branchCode], enabled: Boolean(pick),
    queryFn: () => api.get<UseRow[]>(`${M}/promo/report/orders`, { key: pick!.key, branch: pick!.branchCode, from: f.from, to: f.to }),
  });
  return (
    <div>
      <div className="row" style={{ gap: 8, margin: '4px 0 8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Từ ngày"><input className="input" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field>
        <Field label="Đến ngày"><input className="input" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field>
        <Field label="Mã chương trình"><input className="input" value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} /></Field>
        <Field label="Cửa hàng"><BranchCheckList value={draft.branches} onChange={(branches) => setDraft({ ...draft, branches })} /></Field>
        <button type="button" className="btn btn-primary" onClick={() => { setPick(null); setF(draft); }}>Xem</button>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <DataGrid rows={q.data ?? []} columns={reportCols} rowKey={(r) => `${r.key}|${r.branchCode}`} storageKey="pos.khuyen-mai.bao-cao" onRowClick={setPick}
          rowClassName={(r) => (pick && r.key === pick.key && r.branchCode === pick.branchCode ? 'selected' : '')} maxHeight="44vh"
          emptyText="Không có đơn áp khuyến mại trong kỳ" exportName="bao-cao-khuyen-mai" exportTitle={`Báo cáo khuyến mại đã dùng ${f.from} – ${f.to}`} />
      )}
      <div className="card" style={{ marginTop: 8, padding: 8 }}>
        <b>Đơn đã áp · {pick ? `${pick.key} · ${pick.branchCode}` : 'bấm một dòng ở trên'}</b>
        {pick && (orders.isLoading ? <Loading /> : orders.error ? <ErrorBox error={errorText(orders.error)} /> : (
          <DataGrid rows={orders.data ?? []} columns={useCols} rowKey={(r) => `${r.source}-${r.refId}`} storageKey="pos.khuyen-mai.bao-cao.don" maxHeight="28vh"
            exportName={`khuyen-mai-${pick.key}-${pick.branchCode}`} exportTitle={`Đơn áp ${pick.key} ở ${pick.branchCode}`} />
        ))}
      </div>
      <p className="muted">Số đơn / tiền giảm / số quà tính các đơn còn tính lượt (không gồm đơn đã trả cả đơn, đã huỷ, phiếu đã bỏ duyệt). Lượt đang dùng / hạn mức / còn: mọi kỳ. Dữ liệu từ ngày cài bản NT-BH-025.</p>
    </div>
  );
}

