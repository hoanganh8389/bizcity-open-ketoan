// [2026-11-09 02:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4b (S031-18): tab Chờ kế toán xem — hàng việc policy_review + Đánh dấu đã xem (W2c)
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useReviewItems } from './api';

export function ReviewTab({ onOpenLineage }: { onOpenLineage: (docNo: string) => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const r = useReviewItems();
  const [note, setNote] = useState('');
  const ack = useMutation({
    mutationFn: (eventId: string) => api.post(`/api/v1/queue/policy-review/${eventId}/ack`, note.trim() ? { note: note.trim() } : {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['policy', 'review'] }); void qc.invalidateQueries({ queryKey: ['queue'] }); },
  });
  const canAck = can('documents:write');
  if (r.isLoading) return <Loading />;
  if (r.error) return <ErrorBox error={errorText(r.error)} />;
  const items = r.data!.items;
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>Chứng từ đã ghi sổ nhưng chính sách đi kèm có điểm cần xem. Xem xong, bấm <b>Đánh dấu đã xem</b> — việc đóng lại và để lại một dòng bằng chứng. Chứng từ không bị sửa.</p>
      {ack.error && <ErrorBox error={errorText(ack.error)} />}
      {canAck && items.length > 0 && <div className="row" style={{ marginBottom: 6 }}><input className="input" placeholder="Ghi chú cho lần đánh dấu (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} style={{ maxWidth: 360 }} /></div>}
      {items.length === 0 ? <Empty text="Không có chứng từ nào chờ xem chính sách" /> : (
        <table className="grid">
          <thead><tr><th>Chứng từ</th><th>Ngày</th><th>Chi nhánh</th><th className="num">Tuổi (ngày)</th><th /></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.sourceId}>
                <td className="mono">{i.docNo}</td><td>{i.docDate ?? '—'}</td><td>{i.branchCode ?? '—'}</td><td className="num">{i.ageDays}</td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="btn btn-sm" onClick={() => onOpenLineage(i.docRef)}>Truy vết</button>{' '}
                  {canAck && <button type="button" className="btn btn-sm" disabled={ack.isPending} onClick={() => ack.mutate(i.sourceId)}>Đánh dấu đã xem</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
