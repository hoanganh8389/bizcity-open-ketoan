// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G4): chuông thông báo trên thanh trên cùng (notify.inapp)
/**
 * THÔNG BÁO: chuông + số chưa đọc; bấm mở danh sách (mới trước), bấm một dòng → mở màn của thông báo và đánh dấu đã đọc.
 * Tự làm mới 2 phút / lần; mở chuông thì làm mới ngay. Nguồn: GET /api/v1/notifications (core.notification.list).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';

interface Item { id: string; source: string; title: string; body: string | null; link: string | null; createdAt: string; read: boolean }

export function ThongBao() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ items: Item[]; unread: number }>('/api/v1/notifications'), refetchInterval: 120_000, staleTime: 60_000, retry: false });
  useEffect(() => { if (open) void q.refetch(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const read = async (ids: string[]) => {
    if (!ids.length) return;
    await api.post('/api/v1/notifications/read', { ids }).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const items = q.data?.items ?? [];
  const unread = q.data?.unread ?? 0;
  return (
    <div className="dol" ref={box}>
      <button type="button" className="dol-btn" onClick={() => setOpen(!open)} title="Thông báo" aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`}>
        <Bell size={15} /> {unread > 0 && <span className="dol-badge">{unread}</span>}
      </button>
      {open && (
        <div className="dol-pop">
          <div className="dol-sum"><b>Thông báo</b>{unread > 0 && <button type="button" className="btn btn-xs" style={{ marginLeft: 'auto' }} onClick={() => void read(items.filter((i) => !i.read).map((i) => i.id))}>Đánh dấu đã đọc hết</button>}</div>
          <div className="dol-list">
            {!items.length && <div className="muted" style={{ padding: 8 }}>Chưa có thông báo.</div>}
            {items.map((i) => (
              <button type="button" key={i.id} className="dol-acc" style={{ display: 'block', width: '100%', textAlign: 'left', opacity: i.read ? 0.65 : 1 }}
                onClick={() => { void read(i.read ? [] : [i.id]); if (i.link) { setOpen(false); nav(i.link); } }}>
                <div className="dol-acc-head">{!i.read && <span className="dol-dot" />} <b>{i.title}</b> <small>{new Date(i.createdAt).toLocaleString('vi-VN')}</small></div>
                {i.body && <div className="muted">{i.body}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
