// [2026-11-06 01:30 AM Nguyễn Văn Thủy] MENU — thanh mép phải: icon cố định, bấm mở bảng, đưa chuột ra ngoài tự thu (đóng góp)
/**
 * THANH MÉP PHẢI: các icon luôn hiện ở mọi màn, có dấu cảnh báo, bấm mới mở bảng.
 *  - Thêm công cụ mới: thêm một phần tử vào `panels`.
 *  - Nút thu nhỏ hoặc đưa chuột ra ngoài bảng thì bảng thu về icon; đang gõ dở hoặc đã ghim thì giữ nguyên.
 *  - Nội dung đi theo nhóm đang làm (`active`), đổi nhóm là việc và lối tắt đổi theo.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, ListChecks, PanelRightClose, Pin, PinOff, Sparkles, type LucideIcon } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { ThongBaoPanel, useThongBao } from '../ThongBao';
import type { GonGroup } from '../menu-gon';
import { TroLyPanel } from './TroLyPanel';
import { ViecPanel } from './ViecPanel';
import { useViec, viecOf } from './useViec';

const PIN_KEY = 'ketoan.rail.pin';
const CLOSE_DELAY = 350;
const readPin = () => { try { return localStorage.getItem(PIN_KEY) === '1'; } catch { return false; } };

interface Panel { key: string; label: string; icon: LucideIcon; hint: string; /** Bảng có màu riêng (Trợ lý). */ ai?: boolean; badge?: { text: string; tone: 'bad' | 'warn' | 'info' } | null; body: ReactNode }

export function RightRail({ menu, groups, active, assistant }: { menu: MenuItem[]; groups: GonGroup[]; active?: GonGroup; assistant: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pinned, setPinned] = useState(readPin);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const viec = useViec();
  const tb = useThongBao(open === 'thong-bao');

  const close = () => setOpen(null);
  // Bấm một việc, một màn: mở màn đó và thu bảng để nhường chỗ (đã ghim thì giữ).
  const onGo = () => { if (!pinned) close(); };
  const togglePin = () => setPinned((v) => { try { localStorage.setItem(PIN_KEY, v ? '0' : '1'); } catch { /* chế độ riêng tư */ } return !v; });

  // Đang gõ dở trong bảng thì không tự thu kẻo mất chỗ đang gõ.
  const busy = () => { const el = document.activeElement; return el instanceof HTMLInputElement && Boolean(el.value) && Boolean(root.current?.contains(el)); };
  const stopTimer = () => window.clearTimeout(timer.current);
  const onLeave = () => { if (pinned || !open) return; stopTimer(); timer.current = window.setTimeout(() => { if (!busy()) close(); }, CLOSE_DELAY); };
  useEffect(() => stopTimer, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!pinned && !root.current?.contains(t) && !t.closest('.modal-mask, .help-drawer')) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, pinned]);
  // Trang Trợ lý gọi mở bảng.
  useEffect(() => {
    const show = () => setOpen('tro-ly');
    window.addEventListener('troly:open', show);
    return () => window.removeEventListener('troly:open', show);
  }, []);

  const mine = viecOf(viec.items, active?.key);
  const loi = mine.filter((v) => v.level === 'error').length;
  const panels: Panel[] = [
    {
      key: 'viec', label: 'Việc cần làm', icon: ListChecks,
      hint: mine.length ? `Việc cần làm${active ? ` · ${active.label}` : ''}: ${mine.length} việc${loi ? `, ${loi} cần xử lý gấp` : ''}` : 'Việc cần làm',
      badge: loi ? { text: '!', tone: 'bad' } : mine.length ? { text: String(mine.length), tone: 'warn' } : null,
      body: <ViecPanel items={viec.items} loading={viec.loading} group={active} groups={groups} onRefresh={viec.refresh} onGo={onGo} />,
    },
    ...(assistant ? [{
      key: 'tro-ly', label: 'Trợ lý', icon: Sparkles, ai: true, hint: 'Trợ lý: việc nên làm, lối tắt, tìm màn và hướng dẫn',
      body: <TroLyPanel menu={menu} items={viec.items} group={active} onShowViec={() => setOpen('viec')} onGo={onGo} />,
    }] : []),
    {
      key: 'thong-bao', label: 'Thông báo', icon: Bell, hint: tb.unread ? `Thông báo: ${tb.unread} chưa đọc` : 'Thông báo',
      badge: tb.unread ? { text: String(tb.unread), tone: 'info' } : null,
      body: <ThongBaoPanel tb={tb} onGo={onGo} />,
    },
  ];
  const cur = panels.find((p) => p.key === open);

  return (
    <div className="rail" ref={root} onMouseEnter={stopTimer} onMouseLeave={onLeave}>
      <div className="rail-icons" role="toolbar" aria-label="Công cụ mép phải">
        {panels.map((p) => (
          <button key={p.key} type="button" className={`rail-btn${p.ai ? ' ai' : ''}${open === p.key ? ' active' : ''}`} title={p.hint} aria-label={p.hint} aria-pressed={open === p.key} onClick={() => setOpen((o) => (o === p.key ? null : p.key))}>
            <p.icon size={19} />
            {p.badge && <span key={`${active?.key}:${p.badge.text}`} className={`rail-badge ${p.badge.tone}`}>{p.badge.text}</span>}
          </button>
        ))}
      </div>
      {cur && (
        <aside className={`rail-panel${cur.ai ? ' ai' : ''}`} aria-label={cur.label}>
          <div className="rail-head">
            <cur.icon size={17} />
            <b>{cur.label}</b>
            <button type="button" className="rail-mini" title={pinned ? 'Bỏ ghim: đưa chuột ra ngoài sẽ tự thu' : 'Ghim: giữ bảng mở khi đưa chuột ra ngoài'} aria-pressed={pinned} onClick={togglePin}>{pinned ? <PinOff size={15} /> : <Pin size={15} />}</button>
            <button type="button" className="rail-mini" title="Thu nhỏ về thanh mép phải" onClick={close}><PanelRightClose size={16} /></button>
          </div>
          {cur.body}
        </aside>
      )}
    </div>
  );
}
