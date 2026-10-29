/**
 * Ký xác nhận trên phiếu (KT-27): người lập phiếu, thủ quỹ, kế toán trưởng, giám đốc bấm "Ký" trong phần mềm.
 * Chữ ký gắn phiên bản phiếu; sửa phiếu thì chữ ký cũ hết hiệu lực (hiện "đã ký bản cũ"). Bản in ghi "Đã ký xác nhận".
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PenLine, X } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import type { SignatureInfo } from './VoucherPrint';

export const SIGN_ROLES: { role: SignatureInfo['role']; label: string }[] = [
  { role: 'preparer', label: 'Người lập phiếu' },
  { role: 'cashier', label: 'Thủ quỹ' },
  { role: 'chief_accountant', label: 'Kế toán trưởng' },
  { role: 'director', label: 'Giám đốc' },
];

export const useSignatures = (id?: string) =>
  useQuery({ queryKey: ['signatures', id], queryFn: () => api.get<SignatureInfo[]>(`/api/v1/documents/${id}/signatures`), enabled: Boolean(id) });

/** Vai người dùng hiện tại có thể ký (máy chủ kiểm lại). */
export function useSignableRoles(): SignatureInfo['role'][] {
  const { user, can } = useAuth();
  const role = user?.role;
  const out: SignatureInfo['role'][] = [];
  if (can('documents:write')) out.push('preparer', 'cashier');
  if (role === 'chief_accountant' || role === 'owner') out.push('chief_accountant');
  if (role === 'owner') out.push('director');
  return out;
}

export function SignaturePanel({ id, roles }: { id: string; roles: SignatureInfo['role'][] }) {
  const qc = useQueryClient();
  const q = useSignatures(id);
  const mine = useSignableRoles();
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['signatures', id] }); void qc.invalidateQueries({ queryKey: ['documents'] }); };
  const sign = useMutation({ mutationFn: (role: string) => api.post('/api/v1/signatures', { ids: [id], role }), onSuccess: refresh });
  const unsign = useMutation({ mutationFn: (role: string) => api.delete(`/api/v1/documents/${id}/signatures/${role}`), onSuccess: refresh });
  const err = sign.error ?? unsign.error;
  return (
    <div className="full" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '8px 12px' }}>
      <b>Ký xác nhận trên phiếu</b>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
        {SIGN_ROLES.filter((r) => roles.includes(r.role)).map((r) => {
          const s = q.data?.find((x) => x.role === r.role && x.valid);
          const old = !s && q.data?.find((x) => x.role === r.role && !x.valid);
          return (
            <div key={r.role} style={{ minWidth: 190 }}>
              <div className="muted" style={{ fontSize: 12 }}>{r.label}</div>
              {s ? (
                <div className="row" style={{ gap: 6 }}>
                  <span className="badge badge-ok">Đã ký</span>
                  <span>{s.signerName} · {dateTime(s.signedAt)}</span>
                  <button className="btn btn-sm" title="Huỷ chữ ký" disabled={unsign.isPending} onClick={() => window.confirm(`Huỷ chữ ký ${r.label.toLowerCase()}?`) && unsign.mutate(r.role)}><X size={12} /></button>
                </div>
              ) : (
                <div className="row" style={{ gap: 6 }}>
                  {old && <span className="muted" title={`${old.signerName} đã ký phiên bản ${old.version}`}>đã ký bản cũ</span>}
                  {mine.includes(r.role) ? <button className="btn btn-sm" disabled={sign.isPending} onClick={() => sign.mutate(r.role)}><PenLine size={12} /> Ký</button> : !old && <span className="muted">Chưa ký</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {err && <div className="alert alert-bad" style={{ marginTop: 6 }}>{errorText(err)}</div>}
    </div>
  );
}
