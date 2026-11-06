/**
 * Hộp thoại ghi dùng chung của Role Editor: lý do (bắt buộc, ≥ 3 ký tự) và — khi máy chủ đòi — nhập lại mật khẩu của người thao tác.
 * Mật khẩu chỉ nằm trong state của hộp thoại này, không lưu ở đâu khác, và bị xoá ngay sau mỗi lần gửi (đúng hay sai).
 */
import { useState, type ReactNode } from 'react';
import { ErrorBox, Field, Modal, errorText } from '@bizcity/ui-kit';
import { needsPassword, validReason } from '../lib/matrix';

export interface WriteValues { reason: string; confirmPassword?: string }

interface Props {
  title: string;
  confirmLabel: string;
  /** Biết trước cần mật khẩu (vd Cho quyền rủi ro cao). Không biết trước thì hộp thoại tự hỏi khi máy chủ đòi. */
  needPassword?: boolean;
  /** Điều kiện của phần nhập thêm (children) để bật nút. */
  valid?: boolean;
  onSubmit: (v: WriteValues) => Promise<unknown>;
  onClose: () => void;
  children?: ReactNode;
}

export function WriteDialog({ title, confirmLabel, needPassword = false, valid = true, onSubmit, onClose, children }: Props) {
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [askPassword, setAskPassword] = useState(needPassword);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ reason: reason.trim(), ...(askPassword ? { confirmPassword: password } : {}) });
      onClose();
    } catch (err) {
      const msg = errorText(err);
      if (needsPassword(msg) && !askPassword) {
        setAskPassword(true);
        setError('Quyền rủi ro cao: nhập lại mật khẩu của bạn để xác nhận.');
      } else {
        setError(msg);
      }
    } finally {
      setPassword('');
      setBusy(false);
    }
  }

  const ready = valid && validReason(reason) && (!askPassword || password.length > 0) && !busy;
  return (
    <Modal title={title} onClose={onClose}
      footer={<button type="button" className="btn btn-primary" disabled={!ready} onClick={() => void submit()}>{busy ? 'Đang lưu…' : confirmLabel}</button>}>
      {children}
      <Field label="Lý do" full hint="Ghi vào nhật ký, tối thiểu 3 ký tự">
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {askPassword ? (
        <Field label="Mật khẩu của bạn" full hint="Chỉ dùng để xác nhận lần này, không được lưu">
          <input className="input" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      ) : null}
      {error ? <ErrorBox error={error} /> : null}
    </Modal>
  );
}
