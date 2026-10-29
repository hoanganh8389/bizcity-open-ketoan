import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { useAuth, inFrame, askParentLogin } from '@/lib/auth';
import { api, errorText } from '@/lib/api';

export function LoginPage() {
  const { user, login } = useAuth();
  const [tenantCode, setTenant] = useState(() => {
    try { return localStorage.getItem('ketoan.tenant') ?? ''; } catch { return ''; }
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Hai cách đăng nhập, người dùng tự chọn (KHÔNG tự chuyển trang): (1) tài khoản ERP — mã đơn vị, email, mật khẩu (tài khoản
  // cấp cho kế toán); (2) nút "Đăng nhập bằng tài khoản trang quản trị" → sang hệ thống quản trị lấy vé, đang đăng nhập bên đó
  // là quay lại vào luôn. Nút chỉ hiện khi máy chủ đã cấu hình đăng nhập qua trang quản trị.
  const [ssoUrl, setSsoUrl] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    if (user) return;
    if (inFrame) { askParentLogin(); return; }
    void api.get<{ loginUrl: string | null }>('/api/v1/auth/wp-sso').then((r) => setSsoUrl(r.loginUrl)).catch(() => { /* không có thì chỉ đăng nhập bằng mật khẩu */ });
  }, [user]);
  const loginByAdmin = () => {
    if (!ssoUrl) return;
    setRedirecting(true);
    const back = window.location.origin + '/';
    window.location.href = ssoUrl + (ssoUrl.includes('?') ? '&' : '?') + 'return=' + encodeURIComponent(back);
  };

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(tenantCode.trim(), email.trim(), password);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="row">
          <span className="brand-logo" style={{ background: '#123a5e', width: 38, height: 38, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <BarChart3 size={20} color="#7cc4f2" />
          </span>
          <div>
            <h1>Đăng nhập ERP</h1>
            <div className="muted" style={{ fontSize: 13 }}>Sổ cái, chứng từ, báo cáo thuế</div>
          </div>
        </div>
        <div className="field">
          <label>Mã đơn vị</label>
          <input className="input" value={tenantCode} onChange={(e) => setTenant(e.target.value)} required autoComplete="organization" />
        </div>
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus />
        </div>
        <div className="field">
          <label>Mật khẩu</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        {error && <div className="alert alert-bad">{error}</div>}
        <button className="btn btn-primary" style={{ justifyContent: 'center', height: 38 }} disabled={busy || redirecting}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        {(ssoUrl || inFrame) && (
          <>
            <div className="muted" style={{ textAlign: 'center', fontSize: 12 }}>— hoặc —</div>
            <button type="button" className="btn" style={{ justifyContent: 'center', height: 38 }} disabled={busy || redirecting || inFrame} onClick={loginByAdmin}
              title="Dùng tài khoản trang quản trị bán hàng: đang đăng nhập bên đó thì vào luôn; quyền theo phân quyền ở trang quản trị">
              {inFrame || redirecting ? 'Đang chuyển sang trang quản trị…' : 'Đăng nhập bằng tài khoản trang quản trị'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
