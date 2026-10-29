/**
 * Hộp đổi mật khẩu của chính người đang đăng nhập (mở từ thanh trên cùng).
 * Đổi mật khẩu = mọi máy KHÁC đang đăng nhập tài khoản này bị đăng xuất (trong khoảng 1 phút); máy này nhận vé mới, làm tiếp.
 * Nút "Đăng xuất các thiết bị khác": đá các máy khác ra mà không cần đổi mật khẩu (vd tài khoản lỡ gửi nhiều người).
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorText, tokenStore } from '@/lib/api';
import { Field, Modal } from '@/components/ui';

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [again, setAgain] = useState('');
  const save = useMutation({
    mutationFn: () => api.post<{ changed: boolean; token: string }>('/api/v1/auth/change-password', { currentPassword, newPassword }),
    onSuccess: (r) => { if (r.token) tokenStore.set(r.token); },
  });
  const others = useMutation({
    mutationFn: () => api.post<{ token: string }>('/api/v1/auth/logout-others'),
    onSuccess: (r) => { if (r.token) tokenStore.set(r.token); },
  });
  const mismatch = again !== '' && again !== newPassword;
  return (
    <Modal title="Đổi mật khẩu" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={save.isPending || save.isSuccess || !currentPassword || newPassword.length < 8 || again !== newPassword} onClick={() => save.mutate()}>Đổi mật khẩu</button></>}>
      <Field label="Mật khẩu hiện tại" full><input className="input" type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} autoFocus /></Field>
      <Field label="Mật khẩu mới" hint="Tối thiểu 8 ký tự"><input className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNext(e.target.value)} /></Field>
      <Field label="Nhập lại mật khẩu mới"><input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
      {mismatch && <div className="alert alert-bad full">Hai lần nhập mật khẩu mới chưa giống nhau</div>}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
      {save.isSuccess && <div className="alert alert-ok full">Đã đổi mật khẩu. Các máy khác đang đăng nhập tài khoản này sẽ tự đăng xuất trong khoảng 1 phút; máy này vẫn làm việc bình thường.</div>}
      <div className="full muted" style={{ fontSize: 12 }}>Đổi mật khẩu sẽ đăng xuất mọi máy khác đang dùng tài khoản này.</div>
      <div className="full" style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" disabled={others.isPending || others.isSuccess}
          onClick={() => { if (window.confirm('Đăng xuất mọi máy khác đang đăng nhập tài khoản này? Máy này vẫn giữ đăng nhập.')) others.mutate(); }}>
          {others.isPending ? 'Đang đăng xuất…' : 'Đăng xuất các thiết bị khác'}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>Không đổi mật khẩu — chỉ đá các máy khác ra (vd tài khoản đã gửi cho nhiều người).</span>
        {others.isSuccess && <div className="alert alert-ok" style={{ width: '100%', margin: 0 }}>Đã đăng xuất các thiết bị khác (tự thoát trong khoảng 1 phút).</div>}
        {others.error && <div className="alert alert-bad" style={{ width: '100%', margin: 0 }}>{errorText(others.error)}</div>}
      </div>
    </Modal>
  );
}
