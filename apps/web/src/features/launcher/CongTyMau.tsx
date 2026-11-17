// [2026-11-17 11:21 AM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-7 (B5a, chữ chốt PHASE-036 · 00 §14): biểu ngữ vàng cố định đầu trang khi đang ở Công ty Mẫu (tenants.is_sample)
/**
 * Công ty Mẫu (dữ liệu hư cấu): dải vàng cố định đầu trang — người dùng luôn biết số trên màn là hư cấu.
 * "Bắt đầu với công ty của bạn" = đăng xuất, trang đăng nhập để trống mã đơn vị (gõ mã đơn vị thật).
 * Sự kiện `ketoan:open-sample` (detail.code): module Thiết lập nhanh (TI15) xin mở Công ty Mẫu — khung điền sẵn mã đơn vị mẫu ở trang
 * đăng nhập, đăng xuất thật (xoá vé) rồi tải lại trang (bộ đệm dữ liệu không sang đơn vị khác). Module không chạm vé đăng nhập.
 * Đọc core.setup.status (isSample) — máy chủ mới là nơi chặn gửi ra ngoài (SAMPLE_TENANT), dải này chỉ để thấy.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface SetupStatus { isSample?: boolean }

export function CongTyMau() {
  const { logout } = useAuth();
  useEffect(() => {
    const open = (e: Event) => {
      const code = (e as CustomEvent<{ code?: string }>).detail?.code;
      if (!code || !/^[A-Za-z0-9_-]{1,64}$/.test(code)) return;
      try { localStorage.setItem('ketoan.tenant', code); } catch { /* trình duyệt chặn lưu: người dùng gõ mã đơn vị */ }
      logout();
      window.location.assign('/');
    };
    window.addEventListener('ketoan:open-sample', open);
    return () => window.removeEventListener('ketoan:open-sample', open);
  }, [logout]);
  const q = useQuery({ queryKey: ['setup-status'], queryFn: () => api.get<SetupStatus>('/api/v1/setup/status'), staleTime: 60_000, retry: false });
  if (!q.data?.isSample) return null;
  const batDau = () => {
    try { localStorage.setItem('ketoan.tenant', ''); } catch { /* trình duyệt chặn lưu: trang đăng nhập giữ mã cũ, người dùng tự sửa */ }
    logout();
    // tải lại cả trang: bộ đệm dữ liệu (react-query) của Công ty Mẫu không được sang đơn vị đăng nhập sau
    window.location.assign('/');
  };
  return (
    <div role="status" style={{ position: 'sticky', top: 0, zIndex: 999, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '6px 12px', background: '#fef3c7', color: '#713f12', borderBottom: '1px solid #fcd34d', fontSize: 13 }}>
      <span><b>Bạn đang xem Công ty Mẫu</b> — số liệu hư cấu, không gửi được ra ngoài.</span>
      <button type="button" className="btn btn-xs" onClick={batDau}>Bắt đầu với công ty của bạn</button>
    </div>
  );
}
