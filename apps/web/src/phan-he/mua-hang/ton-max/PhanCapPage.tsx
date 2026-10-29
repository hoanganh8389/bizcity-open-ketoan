/**
 * PHÂN CẤP CHI NHÁNH – SHOP (MH15): chi nhánh cha (kho tổng, mua hàng về rồi chia xuống shop) → shop con. Chỉ 2 cấp.
 *   Cột trái: chi nhánh chưa xếp (ô tìm riêng, chọn cha, hoặc đặt làm chi nhánh cha). Cột phải: cây chi nhánh cha → shop (kéo thả shop
 *   sang cha khác, bỏ khỏi cha). "Tự xếp theo mã": xx000 là chi nhánh cha, mã cùng 2 số đầu là shop. Nhập / xuất Excel.
 * Thay đổi gom lại, bấm "Lưu phân cấp" mới ghi.
 */
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileDown, FileUp, Wand2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { errorText } from '@/lib/api';
import { NhapExcelChung } from '../thanh-phan/NhapExcelChung';
import { fold, stockApi, useHierarchy, type BranchNode } from './api';
import './ton-max.css';

type Edit = { level: BranchNode['level']; parentCode: string | null };
const LEVEL_TEXT: Record<BranchNode['level'], string> = { branch: 'Chi nhánh cha', shop: 'Shop', '': 'Chưa xếp' };

export function PhanCapPage() {
  const qc = useQueryClient();
  const h = useHierarchy();
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [q, setQ] = useState('');
  const [qLoose, setQLoose] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState('');
  const [over, setOver] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [imp, setImp] = useState(false);
  const nodes = useMemo(() => (h.data?.branches ?? []).map((b) => (edits[b.code] ? { ...b, ...edits[b.code] } : b)), [h.data, edits]);
  const hit = (b: BranchNode, text: string) => !text || fold(`${b.code} ${b.name}`).includes(fold(text));
  const match = (b: BranchNode) => hit(b, q);
  const parents = nodes.filter((b) => b.level === 'branch');
  const loose = nodes.filter((b) => b.level === '' || (b.level === 'shop' && !parents.some((p) => p.code === b.parentCode)));
  const kids = (p: string) => nodes.filter((b) => b.level === 'shop' && b.parentCode === p);
  const dirty = Object.keys(edits).length;
  const set = (code: string, e: Edit) => setEdits((x) => ({ ...x, [code]: e }));
  const makeParent = (code: string) => set(code, { level: 'branch', parentCode: null });
  const moveTo = (code: string, parent: string | null) => set(code, parent ? { level: 'shop', parentCode: parent } : { level: '', parentCode: null });

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      // Chi nhánh cha trước (để shop trỏ vào được), rồi shop, rồi chưa xếp.
      const order = { branch: 0, shop: 1, '': 2 } as const;
      const items = Object.entries(edits).map(([code, e]) => ({ code, ...e })).sort((a, b) => order[a.level] - order[b.level]);
      const r = await stockApi.saveHierarchy(items);
      setEdits({}); setMsg({ ok: true, text: `Đã lưu ${r.saved} chi nhánh.` });
      await qc.invalidateQueries({ queryKey: ['ton-max'] });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };
  const auto = async (overwrite: boolean) => {
    if (overwrite && !window.confirm('Xếp lại TẤT CẢ theo mã (kể cả chi nhánh đã xếp tay)?')) return;
    setBusy(true); setMsg(null);
    try { const r = await stockApi.autoArrange(overwrite); setEdits({}); setMsg({ ok: true, text: r.saved ? `Đã xếp ${r.saved} chi nhánh theo mã.` : 'Không có chi nhánh nào cần xếp thêm.' }); await qc.invalidateQueries({ queryKey: ['ton-max'] }); }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };
  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = [['Mã chi nhánh', 'Tên', 'Cấp', 'Mã chi nhánh cha', 'Kho']];
    for (const b of nodes) rows.push([b.code, b.name, LEVEL_TEXT[b.level], b.parentCode ?? '', b.warehouses.map((w) => w.code).join(', ')]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 36 }, { wch: 14 }, { wch: 16 }, { wch: 40 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Phan cap'); XLSX.writeFile(wb, 'phan-cap-chi-nhanh-shop.xlsx');
  };

  const nodeCard = (b: BranchNode, act: React.ReactNode) => (
    <div key={b.code} className="tm-node" draggable={b.level !== 'branch'} onDragStart={() => setDrag(b.code)} onDragEnd={() => { setDrag(''); setOver(''); }}>
      <div className={`ico ${b.level || 'none'}`}>{b.level === 'branch' ? 'CN' : b.level === 'shop' ? 'S' : '?'}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}{edits[b.code] && <span className="tm-chip warn" style={{ marginLeft: 6 }}>đổi</span>}{!b.isActive && <span className="tm-chip bad" style={{ marginLeft: 6 }}>ngừng</span>}</div>
        <div className="meta"><span className="mono">{b.code}</span> · {b.warehouses.length ? `${b.warehouses.length} kho` : <span className="mh-bad">chưa có kho</span>}</div>
      </div>
      <div className="act">{act}</div>
    </div>
  );

  return (
    <>
      <PageHeader title="Phân cấp chi nhánh – shop" code="MH15" helpKey="mua-hang-phan-cap" subtitle="Chi nhánh cha (kho tổng, nơi mua hàng) → các shop con. Tồn max, chia hàng xuống shop và công thức đặt mua đều đi theo cây này" />
      <div className="card">
        <div className="tm-bar">
          <input className="input" type="search" placeholder="Tìm trong cây chi nhánh cha → shop…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
          <button className="btn btn-sm" disabled={busy} onClick={() => void auto(false)} title="Mã xx000 = chi nhánh cha; mã 5 số cùng 2 số đầu = shop. Chỉ xếp các chi nhánh chưa xếp"><Wand2 size={14} /> Tự xếp theo mã</button>
          <button className="btn btn-sm" onClick={() => setImp(true)}><FileUp size={14} /> Nhập Excel</button>
          <button className="btn btn-sm" onClick={() => void exportExcel()}><FileDown size={14} /> Xuất Excel</button>
          <button className="btn btn-sm" onClick={() => setOpen(Object.fromEntries(parents.map((p) => [p.code, true])))}>Mở hết</button>
          <button className="btn btn-sm" onClick={() => setOpen({})}>Thu gọn</button>
          <Link className="btn btn-sm" to="/danh-muc/chi-nhanh" title="Thêm / sửa chi nhánh, shop (mã, tên, công ty, MST)">Chi nhánh (DM02) →</Link>
          <Link className="btn btn-sm" to="/danh-muc/kho" title="Kho của từng chi nhánh, kho mặc định — shop chưa có kho thì khai ở đây">Danh mục kho (DM12) →</Link>
          <span className="grow" />
          {dirty > 0 && <span className="mh-warn">{dirty} thay đổi chưa lưu</span>}
          {dirty > 0 && <button className="btn btn-sm" onClick={() => setEdits({})}>Bỏ thay đổi</button>}
          <button className="btn btn-primary" disabled={!dirty || busy} onClick={() => void save()}>Lưu phân cấp</button>
        </div>
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
        <ErrorBox error={h.error ? errorText(h.error) : null} />
        {h.isLoading ? <Loading /> : (
          <div className="tm-tree">
            <section className="tm-col" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) moveTo(drag, null); }}>
              <header>Chưa xếp <span className="badge">{loose.filter((b) => hit(b, qLoose)).length}</span></header>
              <div className="find"><input className="input" type="search" placeholder="Tìm mã / tên chi nhánh…" value={qLoose} onChange={(e) => setQLoose(e.target.value)} /></div>
              <div className="body">
                {!loose.length && <div className="muted" style={{ fontSize: 12.5 }}>Mọi chi nhánh đã có chỗ. Kéo một shop vào đây để bỏ khỏi chi nhánh cha.</div>}
                {loose.length > 0 && !loose.some((b) => hit(b, qLoose)) && <div className="muted" style={{ fontSize: 12.5 }}>Không có chi nhánh nào khớp "{qLoose}".</div>}
                {loose.filter((b) => hit(b, qLoose)).map((b) => nodeCard(b, <>
                  <select className="select input" style={{ width: 130, height: 28, fontSize: 12 }} value="" onChange={(e) => { if (e.target.value === '__parent') makeParent(b.code); else if (e.target.value) moveTo(b.code, e.target.value); }}>
                    <option value="">Xếp vào…</option>
                    <option value="__parent">★ Làm chi nhánh cha</option>
                    {parents.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
                  </select>
                </>))}
              </div>
            </section>
            <section className="tm-col">
              <header>Cây chi nhánh cha → shop</header>
              <div className="body">
                {!parents.length && <div className="alert alert-info">Chưa có chi nhánh cha. Bấm <b>Tự xếp theo mã</b>, hoặc ở cột trái chọn <b>★ Làm chi nhánh cha</b>.</div>}
                {parents.map((p) => {
                  const ks = kids(p.code);
                  const shown = ks.filter((k) => match(k) || match(p));
                  if (q && !shown.length && !match(p)) return null;
                  const isOpen = open[p.code] || Boolean(q);
                  return (
                    <div key={p.code} className={`tm-branch${over === p.code ? ' drop' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(p.code); }} onDragLeave={() => setOver('')} onDrop={() => { if (drag && drag !== p.code) moveTo(drag, p.code); setOver(''); }}>
                      <div className="head" onClick={() => setOpen({ ...open, [p.code]: !isOpen })}>
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <div className="ico branch" style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, background: '#f59e0b' }}>CN</div>
                        <div><b>{p.name}</b> <span className="mono muted">{p.code}</span>{edits[p.code] && <span className="tm-chip warn" style={{ marginLeft: 6 }}>đổi</span>}
                          <div className="tm-wh">{p.warehouses.map((w) => `${w.code}${w.isDefault ? ' (mặc định)' : ''}`).join(' · ') || 'chưa có kho'}</div></div>
                        <span className="tm-chip info" style={{ marginLeft: 'auto' }}>{ks.length} shop</span>
                        <button className="btn btn-xs" title="Thôi làm chi nhánh cha (phải chuyển hết shop đi trước)" onClick={(e) => { e.stopPropagation(); if (ks.length) { setMsg({ ok: false, text: `${p.name} còn ${ks.length} shop — kéo các shop sang chi nhánh khác trước` }); return; } moveTo(p.code, null); }}>Bỏ cấp cha</button>
                      </div>
                      {isOpen && <div className="kids">
                        {shown.map((k) => nodeCard(k, <button className="btn btn-xs" title="Bỏ khỏi chi nhánh cha" onClick={() => moveTo(k.code, null)}>✕</button>))}
                        {!ks.length && <div className="muted" style={{ fontSize: 12 }}>Kéo shop từ cột trái vào đây.</div>}
                      </div>}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
      {imp && <NhapExcelChung<'code' | 'level' | 'parent', { code: string; level: BranchNode['level']; parent: string }> onClose={() => setImp(false)} onAdd={(list) => {
        setImp(false);
        setEdits((x) => ({ ...x, ...Object.fromEntries(list.map((r) => [r.code, { level: r.level, parentCode: r.level === 'shop' ? r.parent : null }])) }));
        setMsg({ ok: true, text: `Đã đưa ${list.length} dòng vào — kiểm lại rồi bấm "Lưu phân cấp".` });
      }} s={{
        title: 'Nhập phân cấp từ Excel', file: 'mau-phan-cap-chi-nhanh.xlsx', keyField: 'code',
        columns: [
          { name: 'Mã chi nhánh', required: true, aliases: 'Mã CN, Mã shop', example: '08001', note: 'Mã chi nhánh đã có ở danh mục chi nhánh' },
          { name: 'Cấp', required: true, aliases: 'Loại', example: 'Shop', note: '"Chi nhánh cha" hoặc "Shop" (để trống = chưa xếp)' },
          { name: 'Mã chi nhánh cha', aliases: 'Chi nhánh cha, Cha', example: '08000', note: 'Bắt buộc với Shop' },
        ],
        spec: [['code', ['ma chi nhanh', 'ma cn', 'ma shop']], ['level', ['cap', 'loai']], ['parent', ['ma chi nhanh cha', 'chi nhanh cha', 'cha']]],
        map: (r) => {
          const code = String(r.code).trim(), lv = fold(String(r.level ?? '')).trim(), parent = String(r.parent ?? '').trim();
          if (!nodes.some((b) => b.code === code)) return { error: `không có chi nhánh ${code}` };
          const level: BranchNode['level'] = lv.includes('cha') || lv === 'branch' ? 'branch' : lv.includes('shop') || lv.includes('cua hang') ? 'shop' : '';
          if (level === 'shop' && !parent) return { error: 'Shop phải có mã chi nhánh cha' };
          if (level === 'shop' && !nodes.some((b) => b.code === parent)) return { error: `không có chi nhánh cha ${parent}` };
          return { value: { code, level, parent } };
        },
        head: ['Mã', 'Cấp', 'Chi nhánh cha'], cells: (x) => [x.code, LEVEL_TEXT[x.level], x.parent],
        note: 'Chi nhánh cha trong tệp được xếp trước, shop sau. Chỉ 2 cấp: chi nhánh cha không có cha.',
      }} />}
    </>
  );
}
