/**
 * Thẻ Căn cứ của Chi tiết thư viện (B3a, PHASE-030 · 26 §6): mỗi mục — căn cứ (liên kết mã trong vn.can-cu-phap-ly hay chuỗi tự do),
 * đơn vị đã xác nhận chưa (còn hiệu lực / hết hiệu lực vì mục đã đổi / đã gỡ). Người có settings:write xác nhận hoặc gỡ, lý do bắt buộc;
 * mỗi lần là một bằng chứng (core.library.attest). Không đổi thư viện gốc.
 */
import { useState } from 'react';
import { ErrorBox, Field, Loading, Modal, errorText, useApi, useCan, useMutation, useQuery, useQueryClient, type LibraryItemsResult } from '@bizcity/ui-kit';
import { attestationState, basisList, type Attestation, type LibraryEnvelope } from '../lib/thu-vien';

export function CanCuPanel({ lib }: { lib: LibraryEnvelope }) {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ code: string; name: string; revoke: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const items = useQuery({
    queryKey: ['thu-vien', 'items-all', lib.id],
    queryFn: () => api.get<LibraryItemsResult>(`/api/v1/libraries/${encodeURIComponent(lib.id)}/items`, { status: 'all', limit: 500 }),
  });
  const att = useQuery({
    queryKey: ['thu-vien', 'attestations', lib.id],
    queryFn: () => api.get<{ items: Attestation[] }>(`/api/v1/libraries/${encodeURIComponent(lib.id)}/attestations`),
  });
  const send = useMutation({
    mutationFn: (p: { code: string; revoke: boolean }) => api.post(`/api/v1/libraries/${encodeURIComponent(lib.id)}/attest`, { code: p.code, reason, revoke: p.revoke || undefined }),
    onSuccess: () => { setPending(null); setReason(''); void qc.invalidateQueries({ queryKey: ['thu-vien', 'attestations', lib.id] }); },
  });
  if (items.isLoading || att.isLoading) return <Loading />;
  if (items.error || att.error) return <ErrorBox error={errorText(items.error ?? att.error)} />;
  const byCode = new Map((att.data?.items ?? []).map((a) => [a.code, a]));
  const canWrite = can('settings:write');
  return (
    <div className="card"><div className="card-body">
      <p className="muted" style={{ marginTop: 0 }}>
        Căn cứ của từng mục và việc đơn vị đã đối chiếu chưa. Xác nhận của đơn vị không đổi trạng thái duyệt của thư viện (Nhóm Lõi duyệt ở bản
        phát hành); xác nhận <strong>hết hiệu lực</strong> khi bản thư viện mới đổi nội dung mục.
        {canWrite ? '' : ' Bạn chỉ xem được — xác nhận cần quyền cấu hình (kế toán trưởng / chủ đơn vị).'}
      </p>
      <table className="grid">
        <thead><tr><th>Mã</th><th>Tên</th><th>Căn cứ</th><th>Đơn vị xác nhận</th>{canWrite ? <th /> : null}</tr></thead>
        <tbody>{items.data!.rows.map((r) => {
          const code = String(r.value);
          const a = byCode.get(code);
          const st = attestationState(a);
          const basis = basisList(r.item);
          return (
            <tr key={code}>
              <td><code>{code}</code></td>
              <td>{String(r.item.name ?? r.label)}{r.deprecated ? <span className="badge badge-warn" style={{ marginLeft: 4 }}>ngừng dùng</span> : null}</td>
              <td>{basis.length ? basis.map((b, i) => (
                <div key={i}>{b.ref} {b.key ? <code className="muted">({b.key})</code> : <span className="badge badge-gray">chưa liên kết</span>}{b.verified ? null : <span className="muted"> · chưa duyệt</span>}</div>
              )) : <span className="muted">—</span>}</td>
              <td><span className={`badge ${st.badge}`}>{st.text}</span>{a ? <div className="muted" style={{ fontSize: 12 }}>{a.by} · {a.at.slice(0, 10)} · {a.reason}</div> : null}</td>
              {canWrite ? (
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn btn-xs" onClick={() => { setReason(''); setPending({ code, name: String(r.item.name ?? code), revoke: false }); }}>Xác nhận</button>
                  {a?.attested ? <button type="button" className="btn btn-xs" style={{ marginLeft: 4 }} onClick={() => { setReason(''); setPending({ code, name: String(r.item.name ?? code), revoke: true }); }}>Gỡ</button> : null}
                </td>
              ) : null}
            </tr>
          );
        })}</tbody>
      </table>
      {pending ? (
        <Modal
          title={`${pending.revoke ? 'Gỡ xác nhận' : 'Xác nhận đã đối chiếu'} — ${pending.name}`}
          onClose={() => setPending(null)}
          footer={<>
            <button type="button" className="btn" onClick={() => setPending(null)}>Huỷ</button>
            <button type="button" className="btn btn-primary" disabled={reason.trim().length < 5 || send.isPending} onClick={() => send.mutate({ code: pending.code, revoke: pending.revoke })}>{pending.revoke ? 'Gỡ' : 'Xác nhận'}</button>
          </>}
        >
          <Field label="Lý do / nơi đã đối chiếu" hint="Ít nhất 5 ký tự — lưu vào bằng chứng.">
            <textarea className="input" rows={3} style={{ width: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="vd: Đã đối chiếu văn bản hợp nhất trên Công báo ngày …" />
          </Field>
          {send.error ? <ErrorBox error={errorText(send.error)} /> : null}
        </Modal>
      ) : null}
    </div></div>
  );
}
