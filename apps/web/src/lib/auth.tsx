/**
 * Trạng thái đăng nhập dùng chung cho toàn giao diện.
 *   const { user, login, logout, can } = useAuth();
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokenStore } from './api';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  tenant: { id: string; code: string; name: string };
  permissions: string[];
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (tenantCode: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Tải lại thông tin phiên (sau khi đổi tên đơn vị, vai trò…). */
  reload: () => Promise<void>;
  /** Có quyền không (ví dụ can('catalog:write')). */
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/** Đang mở trong khung của trang quản trị. */
export const inFrame = (() => { try { return window.parent !== window; } catch { return true; } })();

/** Xin trang quản trị cấp vé đăng nhập mới (phiên hết hạn / chưa đăng nhập) — trang quản trị nạp lại khung kèm vé. */
export function askParentLogin(): void {
  if (inFrame) window.parent.postMessage({ type: 'ketoan:need-login', path: window.location.pathname + window.location.search }, '*');
}

/** Vé đăng nhập trên địa chỉ (#sso=…) do trang quản trị gắn khi mở khung; lấy ra rồi xoá khỏi địa chỉ. */
function takeSsoTicket(): string | null {
  // _t: tham số chống lưu đệm trang quản trị gắn khi mở khung — bỏ khỏi địa chỉ.
  const q = new URLSearchParams(window.location.search);
  const hadT = q.has('_t');
  q.delete('_t');
  const search = q.toString() ? '?' + q.toString() : '';
  const m = /(?:^#|&)sso=([^&]+)/.exec(window.location.hash);
  if (!m) {
    if (hadT) history.replaceState(null, '', window.location.pathname + search + window.location.hash);
    return null;
  }
  history.replaceState(null, '', window.location.pathname + search);
  return decodeURIComponent(m[1] ?? '');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const ticket = takeSsoTicket();
    if (ticket) {
      try {
        const res = await api.post<{ token: string }>('/api/v1/auth/wp-sso', { ticket });
        tokenStore.set(res.token);
      } catch {
        tokenStore.clear();
      }
    }
    if (!tokenStore.get()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api.get<SessionUser>('/api/v1/auth/me'));
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
    const onLogout = () => { setUser(null); askParentLogin(); };
    window.addEventListener('ketoan:logout', onLogout);
    return () => window.removeEventListener('ketoan:logout', onLogout);
  }, [loadMe]);

  const login = useCallback(async (tenantCode: string, email: string, password: string) => {
    const res = await api.post<{ token: string }>('/api/v1/auth/login', { tenantCode, email, password });
    tokenStore.set(res.token);
    try { localStorage.setItem('ketoan.tenant', tenantCode); } catch { /* bỏ qua */ }
    await loadMe();
  }, [loadMe]);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const can = useCallback((p: string) => Boolean(user?.permissions.includes(p)), [user]);

  return <AuthContext.Provider value={{ user, loading, login, logout, can, reload: loadMe }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
