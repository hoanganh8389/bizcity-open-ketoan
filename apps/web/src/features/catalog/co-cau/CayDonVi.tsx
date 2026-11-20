// [2026-11-20 Nguyễn Văn Thủy] Cơ cấu tổ chức (DM16) — Cây đơn vị bên trái (tìm, lọc, mở / thu nhánh). (đóng góp)
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Filter, Search, X } from 'lucide-react';
import { plain } from '@/components/pickers';
import { type CC, type DonVi, iconDonVi, ngung, tenCap } from './du-lieu';

/* ------------------------------------------------------------------ cây trái */

export function CayDonVi({ cc, sel, onSel }: { cc: CC; sel: string | null; onSel: (c: string) => void }) {
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState(false);
  const [hienNgung, setHienNgung] = useState(false);
  const [mo, setMo] = useState<Set<string>>(() => new Set(cc.roots.flatMap((r) => [r.code, ...(cc.kids.get(r.code) ?? []).map((x) => x.code)])));
  useEffect(() => {
    if (!sel) return;
    const u = cc.byCode.get(sel);
    if (u) setMo((o) => { const s = new Set(o); for (const x of cc.pathOf(u).slice(0, -1)) s.add(x.code); return s; });
  }, [sel, cc]);
  const hien = (u: DonVi) => hienNgung || !ngung(u);
  const khop = useMemo(() => {
    const w = plain(q).split(/\s+/).filter(Boolean);
    if (!w.length) return null;
    const keep = new Set<string>();
    let dem = 0;
    for (const u of cc.units) {
      if (!hien(u) || !w.every((x) => plain(`${u.code} ${u.name} ${u.taxCode} ${u.levelLabel}`).includes(x))) continue;
      dem++;
      for (const x of cc.pathOf(u)) keep.add(x.code);
    }
    return { keep, dem };
  }, [q, cc, hienNgung]); // eslint-disable-line react-hooks/exhaustive-deps
  const out: ReactNode[] = [];
  const walk = (list: DonVi[], d: number) => {
    for (const u of list) {
      if (khop ? !khop.keep.has(u.code) : !hien(u)) continue;
      const kids = (cc.kids.get(u.code) ?? []).filter((x) => (khop ? khop.keep.has(x.code) : hien(x)));
      const o = khop ? true : mo.has(u.code);
      out.push(
        <div key={u.code} className={`ccm-node${sel === u.code ? ' on' : ''}${ngung(u) ? ' muted' : ''}${kids.length ? ' co-con' : ''}`} style={{ paddingLeft: 4 + d * 18 }} onClick={() => onSel(u.code)} title={`${tenCap(u)} · ${u.path}`}>
          <button type="button" className="ccm-tog" disabled={!kids.length} onClick={(e) => { e.stopPropagation(); setMo((x) => { const s = new Set(x); if (s.has(u.code)) s.delete(u.code); else s.add(u.code); return s; }); }}>
            {kids.length ? (o ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
          </button>
          <span className="ccm-cay-ic">{iconDonVi(u, kids.length > 0)}</span>
          <span className="ccm-ten">{u.name}</span>
          <span className="ccm-ma">({u.code})</span>
        </div>,
      );
      if (o) walk(kids, d + 1);
    }
  };
  walk(cc.roots, 0);
  return (
    <div className="ccm-the-trang ccm-cay-khung">
      <div className="ccm-cay-tim">
        <div className="ccm-tim"><Search size={15} /><input placeholder="Tìm mã, tên, MST, tên gọi cấp…" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button type="button" onClick={() => setQ('')} title="Xoá ô tìm"><X size={13} /></button>}</div>
        <span className="ccm-pop-o">
          <button type="button" className={`ccm-nut-vuong${hienNgung ? ' on' : ''}`} title="Bộ lọc" onClick={() => setLoc((x) => !x)}><Filter size={16} /></button>
          {loc && (
            <div className="ccm-menu" style={{ minWidth: 230 }}>
              <label className="checkbox ccm-menu-o"><input type="checkbox" checked={hienNgung} onChange={(e) => setHienNgung(e.target.checked)} /> Hiện đơn vị ngừng hoạt động</label>
              <button type="button" onClick={() => { setMo(new Set(cc.units.filter((u) => cc.kids.get(u.code)?.length).map((u) => u.code))); setLoc(false); }}>Mở hết</button>
              <button type="button" onClick={() => { setMo(new Set()); setLoc(false); }}>Thu gọn tất cả</button>
            </div>
          )}
        </span>
      </div>
      {khop && <div className="ccm-dem">{khop.dem ? `${khop.dem} kết quả` : 'Không tìm thấy'}</div>}
      <div className="ccm-cay">{out.length ? out : <div className="ccm-rong">Chưa có đơn vị nào.</div>}</div>
    </div>
  );
}
