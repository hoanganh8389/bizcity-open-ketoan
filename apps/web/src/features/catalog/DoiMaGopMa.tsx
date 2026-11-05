// [2026-11-05 02:20 PM Nguyễn Văn Thủy] PHASE-026 — S026-23 (docs/core/06-xuong-ca-dinh-danh.md): đổi mã, gộp mã, lịch sử trên form mặt hàng (đóng góp)
/**
 * Người dùng làm việc bằng mã; định danh nằm ở phía sau. Đổi mã hay gộp mã đều giữ nguyên sổ cũ.
 *   Đổi mã: POST /api/v1/items/rename-code
 *   Gộp mã: xem trước POST /api/v1/items/merge-preview, rồi POST /api/v1/items/merge
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ItemHistory } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';

interface MergePreview {
  fromSku: string; toSku: string; canMerge: boolean;
  blocks: { code: string; text: string }[];
  stock: { branchId: string; warehouseCode: string | null; qty: number }[];
  ledgerLines: number; movements: number; children: number; unitConflicts: number;
}

const MIN_REASON = 5;

export function DoiMaModal({ sku, onClose, onDone }: { sku: string; onClose: () => void; onDone: (newSku: string) => void }) {
  const [newSku, setNewSku] = useState('');
  const [reason, setReason] = useState('');
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => api.post<{ toSku: string }>('/api/v1/items/rename-code', { sku, newSku: newSku.trim(), reason: reason.trim() }),
    onSuccess: (r) => { onDone(r.toSku); void qc.invalidateQueries(); },   // đóng form trước, không tải lại mã vừa đổi
  });
  const ok = newSku.trim() && newSku.trim() !== sku && reason.trim().length >= MIN_REASON;
  return (
    <Modal title={`Đổi mã hàng ${sku}`} onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={!ok || save.isPending} title="Có hiệu lực từ hôm nay" onClick={() => save.mutate()}>Đổi mã</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
      <p className="muted full" style={{ gridColumn: '1 / -1' }}>Có hiệu lực từ hôm nay. Sổ và chứng từ cũ vẫn ghi mã {sku}; đơn vị tính, bảng giá, giá nhà cung cấp, tồn max chuyển sang mã mới. Chứng từ gửi mã {sku} vào vẫn ghi đúng mặt hàng này.</p>
      <Field full label="Mã mới (*)"><input value={newSku} autoFocus maxLength={64} title="Mã hàng mới, chưa từng dùng cho mặt hàng khác" onChange={(e) => setNewSku(e.target.value)} /></Field>
      <Field full label="Lý do (*)" hint={`Ít nhất ${MIN_REASON} ký tự`}><input value={reason} maxLength={500} title="Hiện ở thẻ Lịch sử của mặt hàng" onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}

export function GopMaModal({ sku, onClose, onDone }: { sku: string; onClose: () => void; onDone: () => void }) {
  const [toSku, setToSku] = useState('');
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState('');
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ['merge-preview', sku, checked],
    queryFn: () => api.post<MergePreview>('/api/v1/items/merge-preview', { from: { sku }, to: { sku: checked } }),
    enabled: Boolean(checked), retry: false,
  });
  const merge = useMutation({
    mutationFn: () => api.post('/api/v1/items/merge', { from: { sku }, to: { sku: checked }, reason: reason.trim() }),
    onSuccess: () => { onDone(); void qc.invalidateQueries(); },
  });
  const p = preview.data;
  const ok = Boolean(p?.canMerge) && checked === toSku.trim() && reason.trim().length >= MIN_REASON;
  return (
    <Modal title={`Gộp mã ${sku} vào mặt hàng khác`} onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={!ok || merge.isPending} title="Mã này ngừng dùng từ hôm nay và trỏ sang mặt hàng giữ lại" onClick={() => merge.mutate()}>Gộp mã</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <ErrorBox error={merge.error ? errorText(merge.error) : preview.error ? errorText(preview.error) : null} />
      <p className="muted full" style={{ gridColumn: '1 / -1' }}>Mã {sku} ngừng dùng từ hôm nay và trỏ sang mặt hàng giữ lại. Sổ và chứng từ cũ giữ nguyên, không dòng nào bị sửa.</p>
      <Field full label="Mã mặt hàng giữ lại (*)">
        <div className="row" style={{ gap: 6 }}>
          <input value={toSku} autoFocus maxLength={160} title="Mã của mặt hàng sẽ nhận mã này" onChange={(e) => setToSku(e.target.value)} />
          <button type="button" className="btn" disabled={!toSku.trim()} title="Kiểm tra trước khi gộp, chưa ghi gì" onClick={() => setChecked(toSku.trim())}>Kiểm tra</button>
        </div>
      </Field>
      {preview.isFetching && <Loading />}
      {p && checked === toSku.trim() && (
        <div className="full" style={{ gridColumn: '1 / -1', margin: '8px 0' }}>
          {p.blocks.map((b) => <div key={b.code} className="alert alert-error" title={b.code}>{b.text}</div>)}
          {p.stock.length > 0 && <div className="muted" title="Số lượng còn lại theo kho">Tồn còn lại: {p.stock.map((s) => `${s.warehouseCode || 'kho mặc định'}: ${s.qty}`).join('; ')}</div>}
          <div className="muted" title="Các dòng này giữ nguyên mã và định danh cũ">Giữ nguyên {p.ledgerLines} dòng sổ, {p.movements} dòng kho. Chuyển {p.children} mã con sang {p.toSku}.</div>
          {p.unitConflicts > 0 && <div className="muted" title="Cùng đơn vị tính nhưng khác tỉ lệ quy đổi">{p.unitConflicts} đơn vị tính khác tỉ lệ: giữ theo {p.toSku}.</div>}
        </div>
      )}
      <Field full label="Lý do (*)" hint={`Ít nhất ${MIN_REASON} ký tự`}><input value={reason} maxLength={500} title="Hiện ở thẻ Lịch sử của mặt hàng" onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}

export function LichSuMatHang({ sku }: { sku: string }) {
  const h = useQuery({ queryKey: ['lineage-history', sku], queryFn: () => api.get<ItemHistory>(`/api/v1/lineage/items/${encodeURIComponent(sku)}/history`) });
  if (h.isLoading) return <Loading />;
  if (h.error) return <ErrorBox error={errorText(h.error)} />;
  return (
    <fieldset className="fgroup">
      <legend>Lịch sử thay đổi</legend>
      <table className="table">
        <thead><tr><th title="Lúc thao tác">Lúc</th><th title="Ngày thay đổi có hiệu lực">Hiệu lực từ</th><th title="Người hoặc hệ thống thực hiện">Người</th><th title="Thay đổi gì">Nội dung</th></tr></thead>
        <tbody>{h.data?.entries.map((e, i) => (
          <tr key={i}><td>{new Date(e.at).toLocaleString('vi-VN')}</td><td>{e.effectiveFrom ?? ''}</td><td>{e.by}</td><td>{e.text}</td></tr>
        ))}</tbody>
      </table>
      {h.data?.truncated && <div className="muted">Chỉ hiện các thay đổi gần nhất.</div>}
    </fieldset>
  );
}
