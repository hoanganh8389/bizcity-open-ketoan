// [2026-11-15 Nguyễn Văn Thủy] Cây nhóm hàng tách khỏi màn Mặt hàng – Tài khoản (đã bỏ) để danh mục mặt hàng dùng tiếp (đóng góp)
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { plain } from '@/components/pickers';

export interface ItemClass { code: string; name: string; parentCode: string | null; products: number }

export function GroupTree({ classes, value, onChange, leafOnly, autoFocus }: { classes: ItemClass[]; value: string | null; onChange: (code: string | null) => void; leafOnly?: boolean; autoFocus?: boolean }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const children = useMemo(() => {
    const m = new Map<string, ItemClass[]>();
    const codes = new Set(classes.map((c) => c.code));
    for (const c of classes) {
      const p = c.parentCode && codes.has(c.parentCode) && c.parentCode !== c.code ? c.parentCode : '';
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push(c);
    }
    for (const l of m.values()) l.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return m;
  }, [classes]);
  const s = plain(q.trim());
  // Đang tìm: chỉ hiện nhóm khớp (tên / mã, không dấu) và các nhóm cha dẫn tới nó; nhóm khớp hiện cả nhánh con bên dưới.
  const shown = useMemo(() => {
    if (!s) return null;
    const keep = new Set<string>(); // được hiện: nhóm khớp, nhóm cha dẫn tới nó, nhánh con của nó
    const path = new Set<string>(); // nhóm khớp và nhóm cha dẫn tới nó — mở sẵn tới đây
    const visit = (c: ItemClass, seen: Set<string>): boolean => {
      if (seen.has(c.code)) return false; // dữ liệu lỗi có vòng cha – con
      seen.add(c.code);
      const self = plain(c.name).includes(s) || plain(c.code).includes(s);
      const kids = children.get(c.code) ?? [];
      let any = false;
      for (const k of kids) if (visit(k, seen)) any = true;
      if (self) { const all = (x: ItemClass) => { if (keep.has(x.code)) return; keep.add(x.code); (children.get(x.code) ?? []).forEach(all); }; all(c); }
      if (self || any) { keep.add(c.code); path.add(c.code); }
      return self || any;
    };
    for (const c of children.get('') ?? []) visit(c, new Set());
    return { keep, path };
  }, [s, children]);
  const node = (c: ItemClass, depth: number): ReactNode => {
    if (shown && !shown.keep.has(c.code)) return null;
    const kids = children.get(c.code) ?? [];
    // Đang tìm: mở sẵn đường tới nhóm khớp; nhóm con của nhóm khớp vẫn bấm mũi tên mở được.
    const isOpen = open.has(c.code) || Boolean(shown && kids.some((k) => shown.path.has(k.code)));
    return (
      <div key={c.code}>
        <div className={`tree-node ${value === c.code ? 'active' : ''}`} style={{ paddingLeft: 4 + depth * 14 }} onClick={() => { if (leafOnly && kids.length) setOpen((o) => { const n = new Set(o); if (n.has(c.code)) n.delete(c.code); else n.add(c.code); return n; }); else onChange(c.code); }}>
          <span className="tree-toggle" onClick={(e) => { e.stopPropagation(); setOpen((o) => { const n = new Set(o); if (n.has(c.code)) n.delete(c.code); else n.add(c.code); return n; }); }}>
            {kids.length ? (isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}
          </span>
          <span className="tree-label">{c.name}</span>
          {c.products > 0 && <span className="muted tree-n">{c.products}</span>}
        </div>
        {isOpen && kids.map((k) => node(k, depth + 1))}
      </div>
    );
  };
  return (
    <div className="tree">
      <input className="input" style={{ height: 28, marginBottom: 6 }} value={q} autoFocus={autoFocus} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhóm…" />
      {!leafOnly && <div className={`tree-node ${value === null ? 'active' : ''}`} onClick={() => onChange(null)}><span className="tree-toggle" /><b>Nhóm hàng</b></div>}
      {(children.get('') ?? []).map((c) => node(c, 1))}
      {shown && !shown.keep.size && <div className="muted" style={{ padding: '6px 4px', fontSize: 12.5 }}>Không có nhóm nào khớp "{q.trim()}"</div>}
    </div>
  );
}

