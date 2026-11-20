// [2026-11-20 Nguyễn Văn Thủy] Cơ cấu tổ chức (DM16) — Sơ đồ: sơ đồ bộ phận trong một đơn vị (kiểu sơ đồ tổ chức) và sơ đồ toàn cơ cấu. (đóng góp)
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Plus, Users, Warehouse as WarehouseIcon, X } from 'lucide-react';
import { ListPicker } from '@/components/pickers';
import { chonDonVi } from './HopThoai';
import { type BoPhan, type CC, type DonVi, iconDonVi, ngung, tenCap } from './du-lieu';

/* ------------------------------------------------------------------ sơ đồ bộ phận trong một đơn vị */

/**
 * Vẽ như sơ đồ tổ chức trên Excel: đơn vị ở đỉnh, chuỗi một con đi thẳng xuống, các nhánh trải ngang,
 * lớp cuối (bộ phận không có con) xếp dọc dưới cha. Màu nhạt dần theo cấp.
 */
export function SoDoBoPhan({ cc, u, onMo, onThem }: { cc: CC; u: DonVi; onMo?: (d: BoPhan) => void; onThem?: (cha: string | null) => void }) {
  const [hienNgung, setHienNgung] = useState(false);
  const [to, setTo] = useState(false);
  const khung = useRef<HTMLDivElement>(null);
  // Sơ đồ rộng hơn khung: cuộn sao cho đỉnh (đơn vị) nằm giữa.
  useEffect(() => { const k = khung.current; if (k) k.scrollLeft = Math.max(0, (k.scrollWidth - k.clientWidth) / 2); }, [u.code, hienNgung, to]);
  const ds = (cc.bpCua.get(u.code) ?? []).filter((x) => hienNgung || !ngung(x));
  const co = new Set(ds.map((d) => d.code));
  const con = (c: string) => (cc.bpCon.get(c) ?? []).filter((x) => co.has(x.code));
  const goc = cc.xepCay(ds).filter((d) => { const p = cc.chaBp(d); return !p || !co.has(p.code); });
  const macDinh = u.departmentCode;
  const o = (d: BoPhan, lv: number) => (
    <div role="button" tabIndex={0} className={`ccb-o lv${Math.min(lv, 3)}${ngung(d) ? ' muted' : ''}`} onClick={() => onMo?.(d)} onKeyDown={(e) => { if (e.key === 'Enter') onMo?.(d); }}
      title={`${d.name} (${d.code})${onMo ? ' · bấm để sửa' : ''}`}>
      <span className="ccb-ten">{d.name}</span>
      <span className="ccb-ma">{d.code}{d.code === macDinh && ' · mặc định'}</span>
      {onThem && <button type="button" className="ccb-them" title={`Thêm bộ phận con của ${d.name}`} onClick={(e) => { e.stopPropagation(); onThem(d.code); }}><Plus size={12} /></button>}
    </div>
  );
  const ngang = (kids: ReactNode[]) => (
    <div className="cc-hrow">
      {kids.map((k, i) => (
        <div key={i} className="cc-hcell">
          {kids.length > 1 && <div className="cc-hline ccs-net" style={{ left: i === 0 ? '50%' : 0, right: i === kids.length - 1 ? '50%' : 0 }} />}
          <div className="cc-hstem ccs-net" />
          {k}
        </div>
      ))}
    </div>
  );
  const ve = (d: BoPhan, lv: number, n = 0): ReactNode => {
    const k = n > 30 ? [] : con(d.code);
    if (!k.length) return o(d, lv);
    // Lớp cuối: các con đều không có con → xếp dọc dưới cha.
    if (k.every((x) => !con(x.code).length)) {
      return <div className="ccb-doc">{o(d, lv)}<ul className="ccb-la">{k.map((x) => <li key={x.code}>{o(x, lv + 1)}</li>)}</ul></div>;
    }
    return <><div className="cc-center">{o(d, lv)}</div><div className="cc-stem ccs-net" />{ngang(k.map((x) => ve(x, lv + 1, n + 1)))}</>;
  };
  return (
    <div className={`ccb${to ? ' ccb-full' : ''}`}>
      <div className="ccb-loc">
        <span className="muted">Bấm một ô để sửa, nút + để thêm bộ phận con. Bộ phận cha – con chỉ trong cùng đơn vị.</span>
        <label className="checkbox ccm-menu-o" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={hienNgung} onChange={(e) => setHienNgung(e.target.checked)} /> Hiện ngừng hoạt động</label>
        {onThem && <button type="button" className="btn btn-sm ccm-nut-them" onClick={() => onThem(null)}><Plus size={14} /> Thêm bộ phận</button>}
        <button type="button" className="btn btn-sm" onClick={() => setTo((x) => !x)} title={to ? 'Thu về khung chi tiết' : 'Xem sơ đồ toàn màn hình'}>{to ? <><X size={14} /> Thu nhỏ</> : 'Toàn màn hình'}</button>
      </div>
      {to && <div className="ccb-tieude">Sơ đồ bộ phận · {u.name} ({u.code})</div>}
      {!ds.length ? <div className="ccm-rong">{u.name} chưa có bộ phận.</div> : (
        <div ref={khung} className="cc-chart ccs-khung ccb-khung">
          <div className="cc-chart-in">
            <div className="cc-chart-root">
              <div className="cc-center"><div className="ccb-o goc"><span className="ccb-ten">{u.name}</span><span className="ccb-ma">{tenCap(u)} · {u.code}</span></div></div>
              <div className="cc-stem ccs-net" />
              {ngang(goc.map((d) => ve(d, 0)))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ sơ đồ */

export function SoDo({ cc, sel, onChon }: { cc: CC; sel: string | null; onChon: (c: string) => void }) {
  const [goc, setGoc] = useState('');
  const [h, setH] = useState({ kho: true, bp: false, ngung: false });
  const [thu, setThu] = useState<Set<string>>(new Set());
  const [moBp, setMoBp] = useState<Set<string>>(new Set());
  const latBp = (c: string) => setMoBp((s) => { const x = new Set(s); if (x.has(c)) x.delete(c); else x.add(c); return x; });
  const hien = (u: DonVi) => h.ngung || !ngung(u);
  const kidsOf = (c: string) => (cc.kids.get(c) ?? []).filter(hien);
  const lat = (c: string) => setThu((s) => { const x = new Set(s); if (x.has(c)) x.delete(c); else x.add(c); return x; });
  const oDv = (u: DonVi) => {
    const kids = kidsOf(u.code);
    const so = kids.length + (h.kho ? (cc.khoCua.get(u.code) ?? []).length : 0) + (h.bp ? (cc.bpCua.get(u.code) ?? []).length : 0);
    return (
      <div role="button" tabIndex={0} className={`ccs-o lv${Math.min(u.level, 5)}${sel === u.code ? ' on' : ''}${ngung(u) ? ' muted' : ''}`} onClick={() => onChon(u.code)} onKeyDown={(e) => { if (e.key === 'Enter') onChon(u.code); }} title={`${u.path} · bấm để xem chi tiết`}>
        <span className="ccs-o-ic">{iconDonVi(u, kids.length > 0)}</span>
        <span className="ccs-o-chu"><span className="ccs-o-loai">{tenCap(u)} · <span className="mono">{u.code}</span></span><span className="ccs-o-ten">{u.name}</span></span>
        {so > 0 && <button type="button" className="ccs-thu" title={thu.has(u.code) ? `Mở ${so} mục` : 'Thu nhánh'} onClick={(e) => { e.stopPropagation(); lat(u.code); }}>{thu.has(u.code) ? `+${so}` : <ChevronDown size={12} />}</button>}
      </div>
    );
  };
  const la = (ic: ReactNode, cls: string, ma: string, ten: string, nhan: string) => (
    <div className={`ccs-o ${cls}`}><span className="ccs-o-ic">{ic}</span><span className="ccs-o-chu"><span className="ccs-o-loai">{nhan} · <span className="mono">{ma}</span></span><span className="ccs-o-ten">{ten}</span></span></div>
  );
  // Bộ phận có con: thu gọn sẵn, bấm ô để mở / đóng (moBp), "Mở hết" mở tất cả.
  const bpNut = (d: BoPhan): ReactNode => {
    const con = (cc.bpCon.get(d.code) ?? []).filter((x) => h.ngung || !ngung(x));
    const mo = moBp.has(d.code);
    return (
      <div className="ccs-n">
        {con.length
          ? <div role="button" tabIndex={0} className="ccs-bp-nut" title={mo ? 'Thu nhánh' : `Mở ${con.length} bộ phận con`} onClick={() => latBp(d.code)} onKeyDown={(e) => { if (e.key === 'Enter') latBp(d.code); }}>
              {la(<Users />, 'k-phongban', d.code, d.name, `Bộ phận · ${con.length} con ${mo ? '▾' : '▸'}`)}
            </div>
          : la(<Users />, 'k-phongban', d.code, d.name, 'Bộ phận')}
        {mo && con.length > 0 && <ul className="ccs-con ccs-con-bp">{con.map((x) => <li key={x.code}>{bpNut(x)}</li>)}</ul>}
      </div>
    );
  };
  const cayDoc = (u: DonVi): ReactNode => {
    const kids = kidsOf(u.code);
    const kho = h.kho ? (cc.khoCua.get(u.code) ?? []).filter((x) => h.ngung || !ngung(x)) : [];
    const bp = h.bp ? (cc.bpCua.get(u.code) ?? []).filter((x) => h.ngung || !ngung(x)) : [];
    const co = !thu.has(u.code) && (kids.length || kho.length || bp.length);
    return (
      <div className="ccs-n">
        {oDv(u)}
        {co ? (
          <ul className="ccs-con">
            {kho.map((w) => <li key={`w${w.code}`}>{la(<WarehouseIcon />, 'k-kho', w.code, w.name, 'Phân kho')}</li>)}
            {bp.filter((d) => !cc.chaBp(d)).map((d) => <li key={`d${d.code}`}>{bpNut(d)}</li>)}
            {kids.map((x) => <li key={x.code}>{cayDoc(x)}</li>)}
          </ul>
        ) : null}
      </div>
    );
  };
  // Đơn vị vẽ ngang: phân kho + cây bộ phận của chính nó đặt ngay dưới ô (trước các đơn vị con).
  const rieng = (u: DonVi): ReactNode => {
    const kho = h.kho ? (cc.khoCua.get(u.code) ?? []).filter((x) => h.ngung || !ngung(x)) : [];
    const bp = h.bp ? (cc.bpCua.get(u.code) ?? []).filter((x) => (h.ngung || !ngung(x)) && !cc.chaBp(x)) : [];
    if (!kho.length && !bp.length) return null;
    return (
      <div className="cc-center"><div className="ccs-rieng">
        <div className="ccs-rieng-dau">Riêng của {u.name}: {kho.length ? `${kho.length} phân kho` : ''}{kho.length && bp.length ? ', ' : ''}{bp.length ? `${bp.length} bộ phận gốc` : ''}</div>
        <ul className="ccs-con">
          {kho.map((w) => <li key={`w${w.code}`}>{la(<WarehouseIcon />, 'k-kho', w.code, w.name, 'Phân kho')}</li>)}
          {bp.map((d) => <li key={`d${d.code}`}>{bpNut(d)}</li>)}
        </ul>
      </div></div>
    );
  };
  // Hai cấp trên cùng trải ngang, từ cấp 3 trở xuống cây thụt lề.
  const ve = (u: DonVi, d: number): ReactNode => {
    const kids = kidsOf(u.code);
    if (d >= 1 || !kids.some((x) => cc.kids.get(x.code)?.length) || thu.has(u.code)) return cayDoc(u);
    return (
      <>
        <div className="cc-center">{oDv(u)}</div>
        {rieng(u)}
        <div className="cc-stem ccs-net" />
        <div className="cc-hrow">
          {kids.map((x, i) => (
            <div key={x.code} className="cc-hcell">
              {kids.length > 1 && <div className="cc-hline ccs-net" style={{ left: i === 0 ? '50%' : 0, right: i === kids.length - 1 ? '50%' : 0 }} />}
              <div className="cc-hstem ccs-net" />
              {ve(x, d + 1)}
            </div>
          ))}
        </div>
      </>
    );
  };
  const gocU = goc ? cc.byCode.get(goc) : null;
  const roots = gocU ? [gocU] : cc.roots.filter(hien);
  return (
    <div className="ccm-the-trang ccs">
      <div className="ccs-loc">
        <span className="ccs-goc"><ListPicker items={chonDonVi(cc)} value={goc} onChange={setGoc} placeholder="Xem từ: toàn bộ (gõ để chọn một nhánh)" /></span>
        <label className="checkbox ccm-menu-o"><input type="checkbox" checked={h.kho} onChange={(e) => setH({ ...h, kho: e.target.checked })} /> Hiện phân kho</label>
        <label className="checkbox ccm-menu-o"><input type="checkbox" checked={h.bp} onChange={(e) => setH({ ...h, bp: e.target.checked })} /> Hiện bộ phận</label>
        <label className="checkbox ccm-menu-o"><input type="checkbox" checked={h.ngung} onChange={(e) => setH({ ...h, ngung: e.target.checked })} /> Hiện ngừng hoạt động</label>
        <button type="button" className="btn btn-sm" onClick={() => setThu(new Set(cc.units.filter((u) => u.level >= 3 && cc.kids.get(u.code)?.length).map((u) => u.code)))}>Thu gọn từ cấp 3</button>
        <button type="button" className="btn btn-sm" onClick={() => { setThu(new Set()); setMoBp(new Set(cc.bpCon.keys())); }}>Mở hết</button>
      </div>
      <div className="cc-chart ccs-khung">
        {roots.length ? <div className="cc-chart-in">{roots.map((r) => <div key={r.code} className="cc-chart-root">{ve(r, 0)}</div>)}</div> : <div className="ccm-rong">Chưa có đơn vị nào.</div>}
      </div>
    </div>
  );
}
