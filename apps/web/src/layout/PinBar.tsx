/**
 * Thanh chức năng ghim trên cùng: các màn hay dùng người dùng đã ghim từ menu trái (nút ghim cạnh mỗi mục).
 * Bấm để mở; nút × bỏ ghim; chưa ghim gì thì hiện gợi ý.
 */
import { NavLink } from 'react-router-dom';
import { Pin, X } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { usePins } from './pins';

export function PinBar({ menu }: { menu: MenuItem[] }) {
  const { pins, toggle } = usePins();
  const flat = menu.flatMap((m) => [m, ...(m.children ?? [])]).filter((m) => m.path);
  const items = pins.map((k) => flat.find((m) => m.key === k)).filter((m): m is MenuItem => Boolean(m));
  return (
    <nav className="pinbar" aria-label="Chức năng đã ghim">
      {items.length === 0 ? (
        <span className="pinbar-hint"><Pin size={12} /> Ghim màn hay dùng: bấm biểu tượng ghim cạnh mục ở menu bên trái</span>
      ) : (
        items.map((m) => (
          <span key={m.key} className="pinbar-item">
            <NavLink to={m.path!} end title={m.code ? `${m.label} (${m.code})` : m.label}>
              {m.label}{m.code && <small>{m.code}</small>}
            </NavLink>
            <button type="button" title="Bỏ ghim" onClick={() => toggle(m.key)}><X size={11} /></button>
          </span>
        ))
      )}
    </nav>
  );
}
