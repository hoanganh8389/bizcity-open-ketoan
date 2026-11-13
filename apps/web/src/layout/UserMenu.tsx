// [2026-11-06 03:40 AM Nguyễn Văn Thủy] MENU — gom tên, đổi mật khẩu, đăng xuất vào một avatar trên thanh trên cùng (đóng góp)
import { useEffect, useRef, useState } from 'react';
import { KeyRound, LogOut, Palette } from 'lucide-react';
import { giaoDien, MAU_GOC } from '@/lib/giaoDien';
import { ROLE_LABELS, type Role } from '@ketoan/contracts';
import { useAuth } from '@/lib/auth';

/** Hai chữ đầu của hai từ cuối trong tên, dùng chung cho avatar. */
export const initialsOf = (name: string) => name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase() || 'ERP';

export function UserMenu({ onChangePassword }: { onChangePassword: () => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [mau, setMau] = useState(() => giaoDien.get().id);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const name = user?.fullName ?? '';
  const role = ROLE_LABELS[user?.role as Role] ?? user?.role;
  return (
    <div className="tk" ref={box}>
      <button type="button" className="tk-avatar" title={name} aria-label={`Tài khoản ${name}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>{initialsOf(name)}</button>
      {open && (
        <div className="tk-pop" role="menu">
          <div className="tk-info">
            <span className="tk-avatar big">{initialsOf(name)}</span>
            <div><b>{name}</b><small>{user?.email}</small><small>{role}</small></div>
          </div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onChangePassword(); }}><KeyRound size={16} /> Đổi mật khẩu</button>
          {/* [2026-11-11 Nguyễn Văn Thủy] chọn màu gốc của giao diện (lib/giaoDien.ts MAU_GOC), nhớ trên máy (đóng góp) */}
          <div className="tk-mau" title="Màu giao diện, nhớ trên máy này">
            <Palette size={16} /> Màu
            {MAU_GOC.map((m) => (
              <button key={m.id} type="button" role="menuitemradio" aria-checked={mau === m.id} title={m.ten} className={mau === m.id ? 'on' : ''}
                style={{ background: `linear-gradient(135deg, ${m.nav} 50%, ${m.base} 50%)` }} onClick={() => { giaoDien.set(m.id); setMau(m.id); }} />
            ))}
          </div>
          <button type="button" role="menuitem" onClick={logout}><LogOut size={16} /> Đăng xuất</button>
        </div>
      )}
    </div>
  );
}
