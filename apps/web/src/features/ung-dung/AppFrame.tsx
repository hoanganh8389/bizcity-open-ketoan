/**
 * Khung nhúng app ngoài tiến trình (ADR-0011 mức 2, BIZCITY-EXTENSION §3a). Không gửi phiên đăng nhập của Core vào iframe.
 *
 * Giao thức postMessage ĐÓNG (bizcity_extension@1):
 *   app → Core   bizcity.ready                       app sẵn sàng → Core gửi bizcity.context
 *                bizcity.navigate { path }            mở màn Core (chỉ đường dẫn trong, bắt đầu "/")
 *                bizcity.toast    { kind, text }      báo một dòng trên khung (kind: info | ok | bad)
 *                bizcity.resize   { height }          đổi chiều cao khung (200…10000 px)
 *   Core → app   bizcity.context  { version, ticket, expiresAt, tenant, branch, locale, theme }
 *                                                      vé ≤ 5 phút; app gửi vé + khoá API của nó tới
 *                                                      POST /api/v1/apps/ticket/exchange để biết người dùng đang mở
 * Hai chiều đều kiểm origin: chỉ nhận tin có event.origin = ui.origin của manifest VÀ event.source = chính iframe này;
 * gửi với targetOrigin = ui.origin (không bao giờ "*"). Loại tin khác bị bỏ qua.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useWorkBranch } from '@/lib/workBranch';

export type AppToast = { kind: 'info' | 'ok' | 'bad'; text: string };

/** Gửi lại vé trước khi vé cũ hết hạn (vé sống 5 phút). */
const REFRESH_MS = 4 * 60_000;

export function AppFrame({ appKey, label, origin, url, onToast }: { appKey: string; label: string; origin: string; url: string; onToast: (t: AppToast) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const branch = useWorkBranch();
  const [height, setHeight] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const sendContext = useCallback(async () => {
    const win = ref.current?.contentWindow;
    if (!win || !user) return;
    try {
      const t = await api.post<{ ticket: string; expiresAt: string }>(`/api/v1/apps/${appKey}/ticket`);
      win.postMessage({
        type: 'bizcity.context', version: 1, ticket: t.ticket, expiresAt: t.expiresAt,
        tenant: { code: user.tenant.code, name: user.tenant.name }, branch: branch || null, locale: 'vi-VN', theme: 'light',
      }, origin);
    } catch {
      onToast({ kind: 'bad', text: `Không lấy được vé cho ${label}: kết nối app có thể đã tắt.` });
    }
  }, [appKey, branch, label, onToast, origin, user]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== ref.current?.contentWindow) return;
      const m = e.data as { type?: unknown; path?: unknown; kind?: unknown; text?: unknown; height?: unknown } | null;
      if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
      switch (m.type) {
        case 'bizcity.ready':
          setReady(true);
          void sendContext();
          break;
        case 'bizcity.navigate':
          if (typeof m.path === 'string' && /^\/(?![/\\])/.test(m.path)) navigate(m.path);
          break;
        case 'bizcity.toast':
          if (typeof m.text === 'string' && m.text.trim()) {
            onToast({ kind: m.kind === 'ok' || m.kind === 'bad' ? m.kind : 'info', text: m.text.slice(0, 300) });
          }
          break;
        case 'bizcity.resize':
          if (typeof m.height === 'number' && Number.isFinite(m.height)) setHeight(Math.min(Math.max(Math.round(m.height), 200), 10_000));
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate, onToast, origin, sendContext]);

  // Đổi chi nhánh làm việc hoặc vé sắp hết hạn → gửi ngữ cảnh mới (chỉ sau khi app đã báo sẵn sàng).
  useEffect(() => {
    if (!ready) return undefined;
    void sendContext();
    const id = window.setInterval(() => void sendContext(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [ready, sendContext]);

  return (
    <iframe
      ref={ref}
      title={label}
      src={url}
      // Không allow-top-navigation, không allow-popups: app không điều hướng được trang Core, không mở cửa sổ mới.
      sandbox="allow-scripts allow-forms allow-same-origin"
      referrerPolicy="no-referrer"
      allow=""
      style={{ width: '100%', height: height ?? 'calc(100vh - 220px)', border: 0, borderRadius: 8, background: '#fff' }}
    />
  );
}
