/**
 * Ô tìm chức năng trên thanh trên cùng: gõ mã ("65", "ACC65") hoặc một phần tên ("thuế ra"),
 * dùng phím ↑ ↓ để chọn, Enter để mở. Phím tắt: Ctrl + K.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { flattenMenu } from './menu';

/** Bỏ dấu tiếng Việt và viết thường để tìm không phân biệt dấu. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function MenuSearch({ items }: { items: MenuItem[] }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => flattenMenu(items), [items]);

  const hits = useMemo(() => {
    const q = fold(text.trim());
    if (!q) return [];
    const digits = /^\d+$/.test(q);
    return all
      .filter((x) => {
        const code = fold(x.code ?? '');
        // Chỉ gõ số: khớp đúng phần số của mã (gõ "6" ra ACC6, không ra ACC65).
        return digits ? code.replace(/^\D+/, '') === q || code.replace(/^\D+/, '').startsWith(q) : code.includes(q) || fold(x.label).includes(q);
      })
      .sort((a, b) => (digits ? (a.code ?? '').length - (b.code ?? '').length : 0))
      .slice(0, 8);
  }, [all, text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); input.current?.select(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (path: string) => { navigate(path); setText(''); setOpen(false); input.current?.blur(); };

  return (
    <label className="menu-search" title="Tìm chức năng theo mã hoặc tên (Ctrl+K)">
      <Search size={14} />
      <input
        ref={input}
        value={text}
        placeholder="Tìm chức năng (Ctrl+K)"
        aria-label="Tìm chức năng theo mã hoặc tên"
        // Trình duyệt hay tự điền (tên đăng nhập đã lưu…) vào ô đầu trang lúc tải → tắt tự điền, và chỉ mở danh sách khi
        // người dùng đang đứng trong ô (chữ do trình duyệt điền lúc chưa bấm vào ô thì bỏ qua).
        type="search" name="tim-chuc-nang" autoComplete="off" autoCorrect="off" spellCheck={false} data-lpignore="true" data-form-type="other"
        onChange={(e) => { if (document.activeElement !== e.currentTarget) { setText(''); return; } setText(e.target.value); setOpen(true); setIndex(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, hits.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' && hits[index]) go(hits[index].path);
          if (e.key === 'Escape') { setText(''); setOpen(false); }
        }}
      />
      {open && text.trim() && document.activeElement === input.current && (
        <div className="menu-search-drop">
          {hits.length === 0 && <div className="none">Không thấy chức năng nào</div>}
          {hits.map((h, i) => (
            <button key={h.path} className={i === index ? 'active' : ''} onMouseDown={(e) => { e.preventDefault(); go(h.path); }} onMouseEnter={() => setIndex(i)}>
              <span className="code">{h.code}</span>
              <span>{h.label}</span>
              <span className="group">{h.group}</span>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}
