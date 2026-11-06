// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G4): chuông thông báo trên thanh trên cùng (notify.inapp)
// [2026-11-06 01:30 AM Nguyễn Văn Thủy] MENU — chuyển thông báo sang bảng ở thanh mép phải
/**
 * THÔNG BÁO: số chưa đọc trên icon thanh mép phải; mở bảng là danh sách (mới trước), bấm một dòng → mở màn của thông báo và đánh dấu đã đọc.
 * Tự làm mới 2 phút / lần; mở bảng thì làm mới ngay. Nguồn: GET /api/v1/notifications (core.notification.list).
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Item { id: string; source: string; title: string; body: string | null; link: string | null; createdAt: string; read: boolean }

export function useThongBao(open: boolean) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ items: Item[]; unread: number }>('/api/v1/notifications'), refetchInterval: 120_000, staleTime: 30_000, retry: false });
  useEffect(() => { if (open) void q.refetch(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const read = async (ids: string[]) => {
    if (!ids.length) return;
    await api.post('/api/v1/notifications/read', { ids }).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  return { items: q.data?.items ?? [], unread: q.data?.unread ?? 0, read };
}

export function ThongBaoPanel({ tb, onGo }: { tb: ReturnType<typeof useThongBao>; onGo: () => void }) {
  const nav = useNavigate();
  return (
    <div className="rail-scroll">
      {tb.unread > 0 && <div className="rail-sec-head"><b>{tb.unread} chưa đọc</b><button type="button" className="rail-link" onClick={() => void tb.read(tb.items.filter((i) => !i.read).map((i) => i.id))}>Đánh dấu đã đọc</button></div>}
      {!tb.items.length && <div className="rail-empty">Chưa có thông báo</div>}
      {tb.items.map((i) => (
        <button type="button" key={i.id} className="rail-tb" style={{ opacity: i.read ? 0.65 : 1 }}
          onClick={() => { void tb.read(i.read ? [] : [i.id]); if (i.link) { nav(i.link); onGo(); } }}>
          <span className="rail-tb-head">{!i.read && <span className="dol-dot" />} <b>{i.title}</b></span>
          {i.body && <span className="muted">{i.body}</span>}
          <small className="muted">{new Date(i.createdAt).toLocaleString('vi-VN')}</small>
        </button>
      ))}
    </div>
  );
}
