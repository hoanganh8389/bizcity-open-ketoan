/**
 * Ô chọn TÊN ĐVT từ Danh mục đơn vị tính (DM15): gõ để lọc, ↑ ↓ chọn, Enter lấy, Esc đóng.
 * Gõ tên chưa có thì dòng cuối "Thêm mới …" — lưu mặt hàng xong tên tự vào danh mục. Viết khác hoa thường thì lấy đúng tên
 * trong danh mục ("hộp" → "Hộp"). Tên đã dùng ở dòng khác của cùng mặt hàng không hiện.
 */
import { useMemo, useRef, useState } from 'react';
import { useUnitNames } from './UnitNamesPage';

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

export function UnitNameInput({ value, onChange, exclude = [], placeholder, invalid }: { value: string; onChange: (v: string) => void; exclude?: string[]; placeholder?: string; invalid?: boolean }) {
  const all = useUnitNames().data ?? [];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const q = text ?? value;
  const ex = new Set(exclude.map((x) => x.trim().toLowerCase()).filter(Boolean));
  const list = useMemo(() => all.filter((n) => n.isActive && !ex.has(n.name.toLowerCase()) && (!q || plain(n.name).includes(plain(q))))
    .sort((a, b) => b.products - a.products || a.name.localeCompare(b.name, 'vi')).slice(0, 40), [all, q, exclude.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const exact = all.find((n) => n.name.toLowerCase() === q.trim().toLowerCase());
  const options = [...list.map((n) => ({ name: n.name, hint: n.products ? `${n.products} mặt hàng dùng` : '' })), ...(q.trim() && !exact ? [{ name: q.trim().replace(/\s+/g, ' '), hint: 'Thêm mới vào danh mục', isNew: true }] : [])];
  const pick = (name: string) => { onChange(all.find((n) => n.name.toLowerCase() === name.toLowerCase())?.name ?? name); setText(null); setOpen(false); };
  return (
    <div className="unit-pick" ref={box} onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) { if (text !== null) pick(text.trim() || value); setOpen(false); } }}>
      <input className={`input ${invalid ? 'input-bad' : ''}`} value={q} placeholder={placeholder} onFocus={() => { setOpen(true); setHi(0); }}
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, options.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && open && options[hi]) { e.preventDefault(); pick(options[hi]!.name); }
          else if (e.key === 'Escape') { setOpen(false); setText(null); }
        }} />
      <span className="unit-pick-caret">▾</span>
      {open && options.length > 0 && (
        <div className="unit-pick-drop" role="listbox">
          {options.map((o, i) => (
            <button type="button" key={o.name + i} role="option" className={`unit-pick-opt ${i === hi ? 'on' : ''} ${'isNew' in o ? 'new' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.name)} onMouseEnter={() => setHi(i)}>
              <span>{'isNew' in o ? `＋ ${o.name}` : o.name}</span>{o.hint && <small>{o.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
