// [2026-11-06 01:10 AM Nguyễn Văn Thủy] MENU — sơ đồ ít chữ của trang chủ nhóm: bước, đường nối, nút xổ, hàng Tiện ích (đóng góp)
/**
 * Vẽ sơ đồ từ layout/so-do-nhom.ts. Bấm hình hoặc nút để mở màn; bước có nhiều loại phiếu thì nút xổ danh sách.
 * Bước người dùng không có quyền thì ẩn, nên đường nối chỉ nối các bước còn lại.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import type { SoDo, SoDoNode } from '../../layout/so-do-nhom';
import { DANG_PHAT_TRIEN } from '../../layout/menu-gon';

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const C = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.FileText;
  return <C size={size} />;
}

/** Hình tờ phiếu có huy hiệu biểu tượng của bước. */
function Art({ icon }: { icon: string }) {
  return (
    <span className="sd-art" aria-hidden>
      <svg viewBox="0 0 76 88" width="76" height="88">
        <path className="sd-paper" d="M9 3h40l18 18v56a8 8 0 0 1-8 8H9a8 8 0 0 1-8-8V11a8 8 0 0 1 8-8z" />
        <path className="sd-fold" d="M49 3v14a4 4 0 0 0 4 4h14z" />
        <path className="sd-line" d="M14 34h38M14 46h38M14 58h22" />
      </svg>
      <span className="sd-badge"><Icon name={icon} size={18} /></span>
    </span>
  );
}

function Node({ n }: { n: SoDoNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const hasSub = (n.sub?.length ?? 0) > 1;
  // Bước chưa có màn: hiện mờ, ghi "đang phát triển".
  if (!n.path) return (
    <div className="sd-node soon" title="Đang phát triển, sẽ có ở bản sau">
      <Art icon={n.icon} />
      <div className="sd-btn-wrap"><span className="sd-btn"><Icon name={n.icon} size={15} /> {n.label}</span><small className="sd-soon">{DANG_PHAT_TRIEN}</small></div>
    </div>
  );
  return (
    <div className={`sd-node${open ? ' open' : ''}`} ref={box}>
      <Link to={n.path} title={`Mở ${n.label}`}><Art icon={n.icon} /></Link>
      <div className="sd-btn-wrap">
        {hasSub
          ? <button type="button" className="sd-btn" aria-expanded={open} title={`Chọn loại: ${n.sub!.map((s) => s.label).join(', ')}`} onClick={() => setOpen((v) => !v)}><Icon name={n.icon} size={15} /> {n.label} <Icons.ChevronDown size={14} /></button>
          : <Link className="sd-btn" to={n.path} title={`Mở ${n.label}`}><Icon name={n.icon} size={15} /> {n.label}</Link>}
        {open && <div className="sd-sub">{n.sub!.map((s) => <button key={s.label} type="button" onClick={() => { setOpen(false); navigate(s.path); }}>{s.label}</button>)}</div>}
      </div>
    </div>
  );
}

export function SoDoNhom({ soDo, canOpen, extra }: { soDo: SoDo; canOpen: (path: string) => boolean; extra?: ReactNode }) {
  const rows = soDo.rows
    .map((r) => r.map((n) => ({ ...n, sub: n.sub?.filter((s) => canOpen(s.path)) }))
      .filter((n) => !n.path || (n.sub ? n.sub.length > 0 : canOpen(n.path)))
      .map((n) => (n.path && n.sub && !canOpen(n.path) ? { ...n, path: n.sub[0]!.path } : n)))
    .filter((r) => r.length);
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const links = soDo.links.filter((l) => canOpen(l.path));
  const two = rows.length > 1;
  return (
    <>
      <div className="card sd-card">
        <div className="sd-title">{soDo.title}</div>
        <div className={`sd-rows${two ? ' two' : ''}`} style={{ ['--sd-n' as string]: cols }}>
          {rows.map((r, i) => (
            <div key={i} className={`sd-row${i === 0 ? ' top' : ' bot'}`}>
              {!two && r.length > 1 && <i className="sd-line-h" style={{ left: `${50 / cols}%`, right: `${100 - ((r.length - 0.5) * 100) / cols}%` }} />}
              {r.map((n) => <Node key={n.label} n={n} />)}
            </div>
          )).flatMap((el, i) => (two && i === 1 ? [<i key="bus" className="sd-bus" />, el] : [el]))}
        </div>
      </div>
      {(links.length > 0 || extra) && (
        <div className="card sd-links">
          <div>
            {links.map((l) => <Link key={l.path} to={l.path}><Icon name={l.icon} /> {l.label}</Link>)}
            {extra}
          </div>
        </div>
      )}
    </>
  );
}
