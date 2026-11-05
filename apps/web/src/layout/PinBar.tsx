/**
 * Thanh trên cùng: hai mục cố định (Tổng quan, Báo cáo) và các màn người dùng đã ghim từ menu trái (nút ghim cạnh mỗi mục).
 * Bấm để mở; nút × bỏ ghim.
 */
import { NavLink } from 'react-router-dom';
import { BarChart3, Home, X } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { usePins } from './pins';

export function PinBar({ menu }: { menu: MenuItem[] }) {
  const { pins, toggle } = usePins();
  const flat = menu.flatMap((m) => [m, ...(m.children ?? [])]).filter((m) => m.path);
  const items = pins.map((k) => flat.find((m) => m.key === k)).filter((m): m is MenuItem => Boolean(m));
  return (
    <nav className="pinbar" aria-label="Menu cố định và chức năng đã ghim">
      <NavLink to="/" end className="pinbar-co-dinh"><Home size={15} /> Tổng quan</NavLink>
      <NavLink to="/bao-cao" className="pinbar-co-dinh"><BarChart3 size={15} /> Báo cáo</NavLink>
      {items.map((m) => (
        <span key={m.key} className="pinbar-item">
          <NavLink to={m.path!} end title={m.code ? `${m.label} (${m.code})` : m.label}>
            {m.label}{m.code && <small>{m.code}</small>}
          </NavLink>
          <button type="button" title="Bỏ ghim" onClick={() => toggle(m.key)}><X size={11} /></button>
        </span>
      ))}
    </nav>
  );
}
