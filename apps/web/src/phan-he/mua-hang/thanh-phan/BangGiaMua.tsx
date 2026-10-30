/**
 * BẢNG "MẶT HÀNG & GIÁ MUA" — MỘT nơi cho "NCC bán mã nào, theo ĐVT nào, giá bao nhiêu" (bảng supplier_products):
 *   - theo NCC (hồ sơ NCC): mỗi dòng một mã × ĐVT — kèm mã đã từng mua mà chưa khai (bấm "Khai");
 *   - theo mã (form Mặt hàng → thẻ Mua hàng): mỗi dòng một NCC × ĐVT; NCC trống = giá chung mọi NCC.
 * ĐVT CHỌN trong danh sách ĐVT của mặt hàng (khai ở Danh mục mặt hàng), không gõ tay; tỉ lệ quy đổi lấy từ đó.
 * Giá hiện CẢ HAI: chưa thuế và gồm thuế (theo thuế suất đầu vào của mặt hàng) — gõ ô nào cũng được, ô kia tự quy đổi; lưu theo ô vừa gõ.
 * Sửa ngay trên bảng → "Lưu thay đổi"; mỗi dòng có người sửa + lúc sửa; lịch sử ở thẻ Nhật ký. Một nút XOÁ = xoá vĩnh viễn (hỏi lại);
 * đổi giá theo đợt thì thêm dòng mới với "Hiệu lực từ" mới. Lưu dòng trùng NCC × mã × ĐVT cùng giá với dòng đang có → nhắc trước.
 * Thêm nhanh: chọn mã / dán nhiều mã / nhập Excel (hướng dẫn cột + file mẫu + xem trước).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileUp, Pencil, Plus } from 'lucide-react';
import { TAX_RATE, defaultUnitFor, ratioOf, readTable, supplierItemsOf, type ProductUnit, type SupplierProduct } from '@ketoan/contracts/mua-hang';
import { Modal, NumInput } from '@/components/ui';
import { price as donGia, roundPrice } from '@/lib/format';
import { PartnerPicker } from '@/components/pickers';
import { errorText } from '@/lib/api';
import { purchaseApi, today, useNames, useSupplierBrands, type MhData } from '../du-lieu';
import { ChonMatHang } from './ChonMatHang';
import { ExcelGuide, type GuideColumn } from './ExcelGuide';
import { ProductEditor } from '../../../features/catalog/ProductsPage';
import { NccInfo } from './NccInfo';

type Row = SupplierProduct & { key: string; dirty?: boolean; fromHistory?: boolean; lastText?: string };
const dmy = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
let seq = 0;
const k = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

const COLS: GuideColumn[] = [
  { name: 'Mã hàng', required: true, aliases: 'Mã SP, SKU', example: '130181002', note: 'Mã trong danh mục mặt hàng (mã chưa có báo đỏ, không lưu)' },
  { name: 'ĐVT', aliases: 'Đơn vị tính', example: 'Thùng', note: 'Một ĐVT đã khai của mặt hàng (Hộp / Lốc / Thùng…); trống = ĐVT mua mặc định' },
  { name: 'Giá mua', aliases: 'Đơn giá, Giá', example: 258711, note: 'Giá mua cố định theo ĐVT trên; trống = chỉ khai NCC có bán' },
  { name: 'Gồm thuế', aliases: 'Giá gồm VAT', example: 'không', note: 'có / không (mặc định: giá chưa thuế)' },
  { name: 'Mã hàng NCC', aliases: 'Mã bên NCC', example: 'TH-ST110-D', note: 'Mã của NCC trên báo giá / hoá đơn' },
  { name: 'Tên hàng NCC', aliases: 'Tên bên NCC', example: 'Sữa tươi TH 110ml (thùng 48)', note: 'Tên NCC ghi trên báo giá / hoá đơn — để sau nhận diện hoá đơn tự động' },
  { name: 'Hiệu lực từ', aliases: 'Từ ngày', example: '01/11/2026', note: 'Đổi giá theo đợt: mỗi đợt một dòng' },
  { name: 'Ghi chú', example: '', note: 'Tuỳ ý' },
];
const SPEC: ['sku' | 'unit' | 'price' | 'vat' | 'nccSku' | 'nccName' | 'from' | 'note', string[]][] = [
  ['sku', ['ma hang', 'ma sp', 'sku']], ['unit', ['dvt', 'don vi tinh']], ['price', ['gia mua', 'don gia', 'gia']], ['vat', ['gom thue', 'gia gom vat']], ['nccSku', ['ma hang ncc', 'ma ben ncc']], ['nccName', ['ten hang ncc', 'ten ben ncc']], ['from', ['hieu luc tu', 'tu ngay']], ['note', ['ghi chu']],
];
const isoOf = (s: string) => { const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s.trim()); return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined; };

export function BangGiaMua({ partnerCode, sku, skuName, data, onChanged }: { partnerCode?: string; sku?: string; skuName?: string; data: MhData; onChanged?: () => void }) {
  const byPartner = Boolean(partnerCode);
  const names = useNames();
  const q = useQuery({ queryKey: ['mua-hang', 'supplier-products', partnerCode ?? '', sku ?? ''], queryFn: () => purchaseApi.supplierProducts(byPartner ? { partnerCode } : { sku }) });
  const [rows, setRows] = useState<Row[]>([]);
  const [units, setUnits] = useState<Record<string, ProductUnit[]>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Mở ra là XEM; bấm "Sửa bảng" mới sửa / thêm / bỏ dòng, Lưu xong về lại chế độ xem.
  const [edit, setEdit] = useState(false);
  const [find, setFind] = useState('');
  const [reset, setReset] = useState(0);
  // Mã chưa khai ĐVT: mở form mặt hàng (thẻ ĐVT) ngay tại bảng, khai xong tải lại ĐVT của mã.
  const [productSku, setProductSku] = useState<string | null>(null);
  const closeProduct = async () => { const sku = productSku; setProductSku(null); if (sku) { const u = await purchaseApi.units([sku]); setUnits((x) => ({ ...x, ...u })); } };
  const [pick, setPick] = useState(false);
  const nccBrands = useSupplierBrands(partnerCode);
  const [paste, setPaste] = useState(false);
  const [excel, setExcel] = useState(false);
  const hist = useMemo(() => (byPartner ? supplierItemsOf(partnerCode!, q.data?.rows ?? [], data.docs) : []), [byPartner, partnerCode, q.data, data.docs]);
  useEffect(() => {
    if (!q.data) return;
    setUnits((u) => ({ ...u, ...q.data.units }));
    const declared: Row[] = q.data.rows.filter((r) => byPartner || r.partnerCode).map((r) => ({ ...r, key: r.id ?? k() }));
    const fromHist: Row[] = hist.filter((h) => !h.declared).map((h) => ({ key: k(), partnerCode, sku: h.sku, unit: h.lastUnit ?? h.unit ?? '', price: null, priceIncludesVat: false, warnPct: 2, isActive: true, fromHistory: true, lastText: h.lastDate ? `${dmy(h.lastDate)} · ${h.lastQty?.toLocaleString('vi-VN')} ${h.lastUnit} × ${donGia(h.lastPrice)} (${h.lastIncludesVat ? 'gồm' : 'chưa'} thuế)` : '' }));
    setRows([...declared.map((r) => { const h = hist.find((x) => x.sku === r.sku); return { ...r, lastText: h?.lastDate ? `${dmy(h.lastDate)} · ${h.lastQty?.toLocaleString('vi-VN')} ${h.lastUnit} × ${donGia(h.lastPrice)} (${h.lastIncludesVat ? 'gồm' : 'chưa'} thuế)` : '' }; }), ...fromHist]);
    // Mã đã mua nhưng chưa khai giá: tải ĐVT luôn (bấm "Khai" là chọn được ĐVT, không hiện nhầm "Khai ĐVT").
    const miss = fromHist.map((r) => r.sku).filter((x) => x && !q.data.units[x]);
    if (miss.length) void purchaseApi.units(miss).then((u) => setUnits((x) => ({ ...x, ...u })));
  }, [q.data, hist, partnerCode, reset]);
  const loadUnits = async (skus: string[]) => { const miss = skus.filter((s) => s && !units[s]); if (miss.length) { const u = await purchaseApi.units(miss); setUnits((x) => ({ ...x, ...u })); return { ...units, ...u }; } return units; };
  const set = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p, dirty: true } : r)));
  const addRows = async (list: { sku: string; unit?: string; price?: number | null; priceIncludesVat?: boolean; nccSku?: string; nccName?: string; validFrom?: string; note?: string }[]) => {
    const u = await loadUnits(list.map((x) => x.sku));
    setRows((rs) => [...list.map((x) => ({ key: k(), partnerCode: byPartner ? partnerCode : null, sku: x.sku, unit: x.unit || defaultUnitFor(u[x.sku] ?? [], [], partnerCode ?? '', x.sku), price: x.price ?? null, priceIncludesVat: x.priceIncludesVat ?? false, warnPct: 2, nccSku: x.nccSku ?? '', nccName: x.nccName ?? '', validFrom: x.validFrom, note: x.note ?? '', isActive: true, dirty: true })), ...rs]);
  };
  const dirty = rows.filter((r) => r.dirty);
  const removeRow = async (r: Row) => {
    if (!r.id) { setRows((rs) => rs.filter((x) => x.key !== r.key)); return; }
    if (!window.confirm(`Xoá VĨNH VIỄN dòng giá ${r.partnerCode || 'giá chung'} · ${r.sku} · ${r.unit}${r.validFrom ? ` (hiệu lực từ ${dmy(r.validFrom)})` : ''}?
Không khôi phục được. Phiếu đã lập không bị ảnh hưởng.`)) return;
    try { await purchaseApi.deleteSupplierProduct(r.id); setRows((rs) => rs.filter((x) => x.key !== r.key)); setMsg({ ok: true, text: `Đã xoá dòng ${r.sku} · ${r.unit}.` }); onChanged?.(); }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  };
  const save = async (list = dirty) => {
    // Trùng: cùng NCC × mã × ĐVT, cùng giá với một dòng khác đang có → thường là khai lặp (mỗi đợt giá chỉ cần một dòng).
    const sig = (x: Row) => `${x.partnerCode ?? ''}|${x.sku}|${x.unit.toLowerCase()}|${x.price ?? ''}|${Boolean(x.priceIncludesVat)}`;
    const dup = list.filter((x) => x.price !== null && x.price !== undefined && rows.some((o) => o.key !== x.key && !o.fromHistory && sig(o) === sig(x)));
    if (dup.length && !window.confirm(`Trùng giá đợt trước: ${dup.map((x) => `${x.sku} · ${x.unit} · ${x.price!.toLocaleString('vi-VN')}`).join('; ')} — đã có dòng cùng NCC, cùng mã, cùng ĐVT, cùng giá.
Không cần thêm dòng (chỉ thêm khi đổi giá theo đợt). Vẫn lưu = thêm dòng mới, dòng cũ giữ nguyên?`)) return;
    // Dòng MỚI cùng NCC × mã × ĐVT với một dòng đã lưu mà không ghi "Hiệu lực từ": coi là đợt giá mới từ hôm nay — thêm dòng,
    // không ghi đè dòng cũ (mất ngày hết hiệu lực, ghi chú).
    const key3 = (x: Row) => `${x.partnerCode ?? ''}|${x.sku}|${x.unit.toLowerCase()}`;
    const homNay = today(); // ngày theo giờ máy (giờ VN), không theo UTC
    list = list.map((x) => (!x.id && !x.validFrom && rows.some((o) => o.id && key3(o) === key3(x)) ? { ...x, validFrom: homNay } : x));
    if (!byPartner && list.some((x) => !x.partnerCode)) { setMsg({ ok: false, text: 'Chọn nhà cung cấp cho mọi dòng (giá chung của sản phẩm khai ở khối "Giá mua tham khảo")' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await purchaseApi.saveSupplierProducts(list.map((x) => ({ id: x.id, partnerCode: x.partnerCode || null, sku: x.sku, unit: x.unit, isDefaultUnit: Boolean(x.isDefaultUnit), nccSku: x.nccSku ?? '', nccName: x.nccName ?? '', price: x.price ?? null, priceIncludesVat: x.priceIncludesVat, warnPct: x.warnPct, validFrom: x.validFrom || undefined, validTo: x.validTo || undefined, note: x.note ?? '', isActive: x.isActive })));
      setMsg({ ok: true, text: `Đã lưu: thêm ${r.added}, cập nhật ${r.updated} dòng.` });
      await q.refetch(); onChanged?.(); setEdit(false);
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };
  const unitSel = (r: Row) => {
    const us = units[r.sku] ?? [];
    return us.length ? (
      <select className="select input" style={{ width: 110 }} value={us.find((u) => u.unit.toLowerCase() === r.unit.toLowerCase())?.unit ?? ''} onChange={(e) => set(r.key, { unit: e.target.value })}>
        {!us.some((u) => u.unit.toLowerCase() === r.unit.toLowerCase()) && <option value="">— chọn —</option>}
        {us.map((u) => <option key={u.unit} value={u.unit}>{u.unit}{u.ratio !== 1 ? ` (×${u.ratio})` : ''}</option>)}
      </select>
    ) : <span className="mh-warn">{r.unit || 'chưa có ĐVT'} <button type="button" className="btn btn-xs" onClick={() => setProductSku(r.sku)} title="Khai ĐVT và tỉ lệ của mặt hàng ngay tại đây">Khai ĐVT</button></span>;
  };
  // Hiện cả dòng đã ngừng áp (từ trước) để xoá được; dòng ngừng áp hiện mờ.
  const active = rows;
  const skus = [...new Set(active.map((r) => r.sku))];
  const cat = useQuery({ queryKey: ['mua-hang', 'lookup', skus.join(',')], queryFn: () => purchaseApi.lookupProducts(skus), enabled: skus.length > 0 });
  // Thuế suất đầu vào của mặt hàng → quy đổi giá chưa thuế ↔ gồm thuế.
  const taxOf = (s: string) => cat.data?.find((c) => c.sku === s)?.taxInCode ?? 'V08';
  const rateOf = (s: string) => (TAX_RATE[taxOf(s)] ?? 0) / 100;
  const priceAs = (r: Row, inc: boolean) => (r.price === null || r.price === undefined ? null : Boolean(r.priceIncludesVat) === inc ? r.price : inc ? roundPrice(r.price * (1 + rateOf(r.sku))) : roundPrice(r.price / (1 + rateOf(r.sku))));
  // Mã chưa khai giá nhưng đã từng mua của NCC này: điền giá lần mua gần nhất (quy về ĐVT của dòng, giữ loại giá của phiếu đó).
  const lastFill = rows.filter((r) => (r.price === null || r.price === undefined) && hist.some((h) => h.sku === r.sku && h.lastPrice));
  const fillLast = () => setRows((rs) => rs.map((r) => {
    const h = hist.find((x) => x.sku === r.sku);
    if ((r.price !== null && r.price !== undefined) || !h?.lastPrice) return r;
    const us = units[r.sku] ?? [];
    const price = us.length ? roundPrice((h.lastPrice / (ratioOf(us, h.lastUnit) || 1)) * (ratioOf(us, r.unit) || 1)) : h.lastPrice;
    return { ...r, price, priceIncludesVat: Boolean(h.lastIncludesVat), fromHistory: false, dirty: true };
  }));
  const visible = active.filter((r) => !find || `${r.sku} ${r.nccSku ?? ''} ${r.nccName ?? ''} ${r.partnerCode ?? ''} ${cat.data?.find((c) => c.sku === r.sku)?.name ?? ''}`.toLowerCase().includes(find.toLowerCase()));
  return (
    <div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {active.length > 8 && <input className="input" style={{ width: 200 }} placeholder="Tìm mã / tên / mã NCC" value={find} onChange={(e) => setFind(e.target.value)} />}
        {active.length > 8 && <span className="muted" style={{ fontSize: 12 }}>{visible.length} / {active.length}</span>}
        {!edit ? <button className="btn btn-sm btn-primary" onClick={() => setEdit(true)}><Pencil size={13} /> Sửa bảng</button> : byPartner ? <>
          <button className="btn btn-sm btn-primary" onClick={() => setPick(true)}><Plus size={13} /> Thêm mã từ danh mục…</button>
          <button className="btn btn-sm" onClick={() => setPaste(true)}>Dán nhiều mã…</button>
          <button className="btn btn-sm" onClick={() => setExcel(true)}><FileUp size={13} /> Nhập Excel…</button>
          {lastFill.length > 0 && <button className="btn btn-sm" title="Mã chưa khai giá: lấy đơn giá lần mua gần nhất của NCC này (sửa lại được trước khi Lưu)" onClick={fillLast}>Điền giá lần mua gần nhất ({lastFill.length} mã)</button>}
          {rows.some((r) => r.fromHistory) && <button className="btn btn-sm" onClick={() => setRows((rs) => rs.map((r) => (r.fromHistory ? { ...r, fromHistory: false, dirty: true } : r)))}>Khai {rows.filter((r) => r.fromHistory).length} mã đã mua</button>}
        </> : <button className="btn btn-sm" onClick={() => setRows((rs) => [{ key: k(), partnerCode: null, sku: sku!, unit: defaultUnitFor(units[sku!] ?? [], [], '', sku!), price: null, priceIncludesVat: false, warnPct: 2, isActive: true, dirty: true }, ...rs])}><Plus size={13} /> Thêm nhà cung cấp</button>}
        {edit && <button className="btn btn-sm btn-primary" disabled={busy || !dirty.length} onClick={() => void save()}>Lưu thay đổi ({dirty.length})</button>}
        {edit && <button className="btn btn-sm" onClick={() => { setEdit(false); setMsg(null); setReset((x) => x + 1); }}>Huỷ sửa</button>}
        <span className="muted" style={{ fontSize: 12 }}>ĐVT chọn trong ĐVT của mặt hàng (×tỉ lệ về ĐVT nhỏ nhất). {byPartner ? 'Lập đơn / phiếu với NCC này dùng đúng ĐVT ghi trên dòng (NCC bán theo Thùng thì khai dòng ĐVT Thùng). Mã chưa khai ở đây thì dùng "Mua mặc định" của mặt hàng.' : 'Giá riêng từng NCC — NCC chưa khai giá thì phiếu nhập so với giá mua riêng của sản phẩm.'}</span>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ marginBottom: 8 }}>{msg.text}</div>}
      <fieldset disabled={!edit} className={edit ? '' : 'view-plain'} title={edit ? undefined : 'Bấm đúp hoặc nút "Sửa bảng" để sửa'} onDoubleClick={() => !edit && setEdit(true)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><div className="scroll-box" style={{ maxHeight: 480 }}>
        <table className="mh-mini" style={{ minWidth: 1050 }}>
          <thead><tr><th>STT</th>{byPartner ? <><th>Mã</th><th>Tên hàng</th></> : <th>Nhà cung cấp</th>}<th>ĐVT</th><th>Mã bên NCC</th><th title="Tên NCC ghi trên báo giá / hoá đơn — dùng nhận diện hoá đơn đầu vào">Tên hàng bên NCC</th><th title="Thuế suất GTGT đầu vào của mặt hàng (khai ở Danh mục mặt hàng)">Thuế</th><th className="num" title="Giá mua theo ĐVT của dòng, chưa thuế GTGT">Giá chưa thuế</th><th className="num" title="Giá mua theo ĐVT của dòng, gồm thuế GTGT — tự quy đổi từ giá chưa thuế và ngược lại">Giá gồm thuế</th><th>Hiệu lực từ</th><th>Đến</th>{byPartner && <th>Lần mua gần nhất</th>}<th title="Ghi chú mặt hàng của NCC — tự điền vào ghi chú dòng khi lập đơn đặt">Ghi chú</th><th>Sửa lần cuối</th><th /></tr></thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.key} className={r.dirty ? 'mh-row-pick' : r.fromHistory || !r.isActive ? 'muted' : ''}>
                <td>{i + 1}</td>
                {byPartner ? <><td className="mono">{r.sku}</td><td style={{ minWidth: 200 }}>{cat.data?.find((c) => c.sku === r.sku)?.name ?? ''}</td></>
                  : <td style={{ minWidth: 220 }}>{r.id ? (r.partnerCode ? <NccInfo code={r.partnerCode} /> : <b>Giá chung mọi NCC</b>) : <PartnerPicker value={r.partnerCode ?? ''} onChange={(c) => set(r.key, { partnerCode: c || null })} placeholder="Chọn nhà cung cấp" />}</td>}
                <td>{r.fromHistory ? r.unit : unitSel(r)}</td>
                
                <td><input className="input mono" style={{ width: 110 }} value={r.nccSku ?? ''} disabled={r.fromHistory} onChange={(e) => set(r.key, { nccSku: e.target.value })} /></td>
                <td><input className="input" style={{ width: 180 }} value={r.nccName ?? ''} placeholder="tên theo NCC" disabled={r.fromHistory} onChange={(e) => set(r.key, { nccName: e.target.value })} /></td>
                <td className="muted" style={{ fontSize: 12 }}>{cat.data ? `${TAX_RATE[taxOf(r.sku)] ?? 0}%` : ''}</td>
                {[false, true].map((inc) => { const v = priceAs(r, inc); return (
                  <td key={String(inc)}><NumInput style={{ width: 110, fontWeight: r.price !== null && r.price !== undefined && Boolean(r.priceIncludesVat) === inc ? 600 : undefined }}
                    title={r.price !== null && r.price !== undefined && Boolean(r.priceIncludesVat) !== inc ? `Tự quy đổi từ giá ${inc ? 'chưa' : 'gồm'} thuế (thuế ${TAX_RATE[taxOf(r.sku)] ?? 0}%)` : undefined}
                    value={v} placeholder="chưa khai" disabled={r.fromHistory} onChange={(n) => set(r.key, { price: n, priceIncludesVat: inc })} /></td>); })}
                <td><input className="input" type="date" style={{ width: 128 }} value={r.validFrom ?? ''} disabled={r.fromHistory} onChange={(e) => set(r.key, { validFrom: e.target.value || undefined })} /></td>
                <td><input className="input" type="date" style={{ width: 128 }} value={r.validTo ?? ''} disabled={r.fromHistory} onChange={(e) => set(r.key, { validTo: e.target.value || undefined })} /></td>
                {byPartner && <td style={{ fontSize: 11.5 }}>{r.lastText || <span className="muted">chưa mua</span>}</td>}
                <td><input className="input" style={{ width: 160 }} value={r.note ?? ''} placeholder="vd giao thứ 3" disabled={r.fromHistory} onChange={(e) => set(r.key, { note: e.target.value })} /></td>
                <td style={{ fontSize: 11 }}>{r.updatedBy ? `${r.updatedBy} · ${new Date(r.updatedAt!).toLocaleString('vi-VN', { hour12: false })}` : r.dirty ? <span className="mh-warn">chưa lưu</span> : ''}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{!edit ? (r.isActive ? null : <span className="muted" style={{ fontSize: 11 }}>ngừng áp</span>) : r.fromHistory ? <button className="btn btn-xs" title="Khai mã đã từng mua này vào bảng giá của NCC" onClick={() => set(r.key, { fromHistory: false })}>Khai</button> : <button className="btn btn-xs btn-danger" title={r.id ? 'Xoá vĩnh viễn dòng giá này (hỏi lại trước khi xoá; phiếu đã lập không ảnh hưởng)' : 'Bỏ dòng chưa lưu này'} onClick={() => void removeRow(r)}>Xoá</button>}</td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={16} className="muted">{q.isLoading ? 'Đang tải…' : byPartner ? 'NCC chưa có mặt hàng — thêm mã, dán nhiều mã hoặc nhập Excel.' : `Chưa NCC nào khai bán ${skuName ?? 'mã này'} — bấm "+ Thêm NCC / giá".`}</td></tr>}
          </tbody>
        </table>
      </div></fieldset>
      {productSku && <ProductEditor sku={productSku} startTab="units" startEditing onClose={() => void closeProduct()} />}
      {paste && <DanMa onClose={() => setPaste(false)} onAdd={(list) => { setPaste(false); void addRows(list); }} />}
      {pick && <ChonMatHang title="Thêm mã NCC bán — bấm vào dòng để thêm" prefer={nccBrands} existing={new Map(active.map((r) => [r.sku, 'đã có']))}
        onPick={(p) => void addRows([{ sku: p.sku }])} onPickAll={(ps) => void addRows(ps.map((p) => ({ sku: p.sku })))} onClose={() => setPick(false)} />}
      {excel && <NhapExcel partnerName={names.partnerName(partnerCode ?? '')} onClose={() => setExcel(false)} onAdd={(list) => { setExcel(false); void addRows(list); }} />}
    </div>
  );
}

/** Xem trước: mã có trong danh mục, ĐVT có ở mặt hàng. */
function usePreview(list: { sku: string; unit?: string }[]) {
  const q = useQuery({ queryKey: ['mua-hang', 'units', list.map((r) => r.sku).join(',')], queryFn: () => purchaseApi.units(list.map((r) => r.sku)), enabled: list.length > 0 });
  const check = (r: { sku: string; unit?: string }) => { const us = q.data?.[r.sku]; return !q.data ? '…' : !us?.length ? 'mã chưa có trong danh mục hàng' : r.unit && !us.some((u) => u.unit.toLowerCase() === r.unit!.toLowerCase()) ? `ĐVT "${r.unit}" không có (có: ${us.map((u) => u.unit).join(', ')})` : ''; };
  return { ready: Boolean(q.data), check, ok: list.filter((r, i) => q.data && !check(r) && list.findIndex((x) => x.sku === r.sku && (x.unit ?? '') === (r.unit ?? '')) === i) };
}
function PreviewTable({ list, check }: { list: { sku: string; unit?: string; price?: number | null; row?: number }[]; check: (r: { sku: string; unit?: string }) => string }) {
  return (
    <div className="full" style={{ maxHeight: 320, overflow: 'auto' }}>
      <table className="mh-mini"><thead><tr><th>Dòng</th><th>Mã</th><th>ĐVT</th><th className="num">Giá mua</th><th>Kiểm tra</th></tr></thead>
        <tbody>{list.map((r, i) => { const c = check(r); return <tr key={i} className={c && c !== '…' ? 'mh-row-bad' : ''}><td>{r.row ?? i + 1}</td><td className="mono">{r.sku}</td><td>{r.unit || <span className="muted">mua mặc định</span>}</td><td className="num">{r.price ? donGia(r.price) : ''}</td><td>{c ? <span className="mh-bad">{c}</span> : '✓'}</td></tr>; })}</tbody>
      </table>
    </div>
  );
}
function DanMa({ onClose, onAdd }: { onClose: () => void; onAdd: (l: { sku: string }[]) => void }) {
  const [text, setText] = useState('');
  const list = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean).map((sku) => ({ sku }));
  const p = usePreview(list);
  return (
    <Modal wide title="Thêm nhiều mã vào mặt hàng của NCC" onClose={onClose} footer={<><button className="btn btn-primary" disabled={!p.ok.length} onClick={() => onAdd(p.ok)}>Thêm {p.ok.length} mã hợp lệ vào bảng</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full"><textarea className="input" rows={5} style={{ width: '100%' }} placeholder="Dán danh sách mã — mỗi dòng một mã, hoặc cách nhau bằng dấu phẩy / khoảng trắng (copy cột mã từ Excel được)" value={text} onChange={(e) => setText(e.target.value)} /></div>
      {list.length > 0 && <><div className="full muted" style={{ fontSize: 12, margin: '6px 0' }}>Xem trước {list.length} mã — ĐVT lấy ĐVT mua mặc định của mặt hàng, sửa trên bảng rồi Lưu.</div><PreviewTable list={list} check={p.check} /></>}
    </Modal>
  );
}
function NhapExcel({ partnerName, onClose, onAdd }: { partnerName: string; onClose: () => void; onAdd: (l: { sku: string; unit?: string; price?: number | null; priceIncludesVat?: boolean; nccSku?: string; nccName?: string; validFrom?: string; note?: string }[]) => void }) {
  const [list, setList] = useState<{ sku: string; unit?: string; price?: number | null; priceIncludesVat?: boolean; nccSku?: string; nccName?: string; validFrom?: string; note?: string; row: number }[]>([]);
  const [file, setFile] = useState('');
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const p = usePreview(list);
  const pick = async (f: File) => {
    setErr(''); setFile(f.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      for (const name of wb.SheetNames) {
        const t = readTable(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: '' }), SPEC, 'sku');
        if (t.rows.length) { setList(t.rows.map((r) => ({ row: r.row, sku: r.sku, unit: r.unit || undefined, price: r.price === '' ? null : Number(String(r.price).replace(/\./g, '').replace(',', '.')) || null, priceIncludesVat: /^(c|co|có|x|1|true)/i.test(r.vat), nccSku: r.nccSku || undefined, nccName: r.nccName || undefined, validFrom: isoOf(r.from), note: r.note || undefined }))); return; }
      }
      throw new Error('Không thấy bảng có cột "Mã hàng"');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setList([]); }
  };
  return (
    <Modal wide title={`Nhập mặt hàng & giá mua của NCC ${partnerName} từ Excel`} onClose={onClose} footer={<><button className="btn btn-primary" disabled={!p.ok.length} onClick={() => onAdd(p.ok)}>Đưa {p.ok.length} dòng hợp lệ vào bảng</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full"><ExcelGuide columns={COLS} file="mau-mat-hang-gia-mua-ncc.xlsx" defaultOpen={!list.length} /></div>
      <div className="full mh-drop" style={{ marginTop: 8 }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void pick(f); }}>
        <FileUp size={18} /> <span>{file ? `Tệp: ${file}` : 'Kéo thả tệp Excel vào đây hoặc'}</span>
        <button type="button" className="btn btn-sm" onClick={() => input.current?.click()}>Chọn tệp…</button>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
      </div>
      {err && <div className="alert alert-bad full" style={{ marginTop: 6 }}>{err}</div>}
      {list.length > 0 && <><div className="full muted" style={{ fontSize: 12, margin: '6px 0' }}>Xem trước {list.length} dòng — dòng đỏ bỏ qua. Bấm đưa vào bảng, kiểm lại rồi "Lưu thay đổi".</div><PreviewTable list={list} check={p.check} /></>}
    </Modal>
  );
}
