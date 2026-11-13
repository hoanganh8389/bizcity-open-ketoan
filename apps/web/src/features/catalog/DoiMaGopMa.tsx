// [2026-11-05 02:20 PM Nguyễn Văn Thủy] PHASE-026 — S026-23 (docs/core/06-xuong-ca-dinh-danh.md): đổi mã, gộp mã, lịch sử trên form mặt hàng (đóng góp)
/**
 * Người dùng làm việc bằng mã; định danh nằm ở phía sau. Đổi mã hay gộp mã đều giữ nguyên sổ cũ.
 *   Đổi mã: POST /api/v1/items/rename-code
 *   Gộp mã: xem trước POST /api/v1/items/merge-preview, rồi POST /api/v1/items/merge
 */
import './lich-su.css';
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

// [2026-11-12 Nguyễn Văn Thủy] lịch sử mặt hàng dạng dòng thời gian: gom theo ngày, mỗi thay đổi một dòng, cũ → mới (đóng góp)
const ai = (by: string) => (by.startsWith('system:') ? 'Hệ thống' : by.replace(/^user:/, 'Người dùng #'));
/** "Sửa khai báo: tên: A → B; đơn vị tính: X → Y" → tiêu đề + từng thay đổi. */
function tachNoiDung(text: string): { head: string; items: string[] } {
  const m = /^([^:]{2,40}):\s(.*)$/s.exec(text);
  if (m && /;|→|=/.test(m[2]!)) return { head: m[1]!, items: m[2]!.split(/;\s+/).filter(Boolean) };
  return { head: '', items: [text] };
}
function DongThayDoi({ s }: { s: string }) {
  const k = s.indexOf(': ');
  const label = k > 0 && k < 40 ? s.slice(0, k) : '';
  const rest = label ? s.slice(k + 2) : s;
  const [a, b] = rest.split(' → ');
  return (
    <li>
      {label && <span className="ls-k">{label}</span>}
      {b !== undefined ? <><span className="ls-old">{a}</span><span className="ls-arrow">→</span><b>{b}</b></> : <span>{rest.replace(/ = /g, ': ')}</span>}
    </li>
  );
}
export function LichSuMatHang({ sku }: { sku: string }) {
  const h = useQuery({ queryKey: ['lineage-history', sku], queryFn: () => api.get<ItemHistory>(`/api/v1/lineage/items/${encodeURIComponent(sku)}/history`) });
  if (h.isLoading) return <Loading />;
  if (h.error) return <ErrorBox error={errorText(h.error)} />;
  const days = new Map<string, NonNullable<typeof h.data>['entries']>();
  for (const e of h.data?.entries ?? []) { const d = new Date(e.at).toLocaleDateString('vi-VN'); days.set(d, [...(days.get(d) ?? []), e]); }
  return (
    <div className="ls-wrap full">
      {!days.size && <div className="muted">Chưa có thay đổi.</div>}
      {[...days.entries()].map(([d, list]) => (
        <section key={d} className="ls-day">
          <div className="ls-date">{d}</div>
          {list.map((e, i) => {
            const t = tachNoiDung(e.text);
            return (
              <div key={i} className="ls-row">
                <div className="ls-meta"><span className="ls-time">{new Date(e.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span><span className="ls-by" title={e.by}>{ai(e.by)}</span></div>
                <div className="ls-body">
                  {t.head && <div className="ls-head">{t.head}{e.effectiveFrom ? <span className="muted"> · hiệu lực từ {e.effectiveFrom}</span> : null}</div>}
                  <ul>{t.items.map((x, j) => <DongThayDoi key={j} s={x} />)}</ul>
                </div>
              </div>
            );
          })}
        </section>
      ))}
      {h.data?.truncated && <div className="muted" style={{ fontSize: 12 }}>Chỉ hiện các thay đổi gần nhất.</div>}
    </div>
  );
}
