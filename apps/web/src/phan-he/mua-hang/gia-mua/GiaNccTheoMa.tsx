// [2026-11-12 Nguyễn Văn Thủy] giá mua theo NCC ở form mặt hàng: nhóm theo NCC, 3 đợt giá gần nhất, + Giá mới, hộp khai giá, lịch sử thay đổi (đóng góp)
/**
 * GIÁ MUA THEO NHÀ CUNG CẤP (form Mặt hàng → thẻ Mua hàng). Cùng bảng supplier_products với hồ sơ NCC.
 *   - Mỗi NCC một khối: 3 đợt giá gần nhất (mới nhất trên cùng), các đợt cũ hơn bấm "Xem thêm".
 *   - "+ Giá mới" của NCC: thêm đợt giá mới (điền sẵn ĐVT, mã / tên bên NCC, hiệu lực từ hôm nay); bấm một dòng để sửa / xoá.
 *   - "+ Thêm nhà cung cấp": hộp khai chọn NCC ngay trong hộp.
 *   - Lịch sử thay đổi: mọi lần thêm / sửa / xoá giá của mã này (ai, lúc nào, trước → sau).
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { TAX_RATE, type SupplierProduct } from '@bizcity/mua-hang-domain';
import { Field, Modal, NumInput } from '@/components/ui';
import { PartnerPicker } from '@/components/pickers';
import { errorText } from '@/lib/api';
import { price as donGia, roundPrice } from '@/lib/format';
import { purchaseApi, today, useNames } from '../du-lieu';

const dmy = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const SHOW = 3;
type Form = Partial<SupplierProduct> & { partnerCode: string | null; unit: string };

export function GiaNccTheoMa({ sku, name, onChanged }: { sku: string; name: string; onChanged?: () => void }) {
  const qc = useQueryClient();
  const names = useNames();
  const q = useQuery({ queryKey: ['mua-hang', 'supplier-products', 'by-ncc', sku], queryFn: () => purchaseApi.supplierProducts({ sku, all: true }) });
  const cat = useQuery({ queryKey: ['mua-hang', 'lookup', sku], queryFn: () => purchaseApi.lookupProducts([sku]) });
  const log = useQuery({ queryKey: ['mua-hang', 'sp-log', sku], queryFn: () => purchaseApi.history({ event: 'supplier_products', sku }) });
  const [open, setOpen] = useState<Form | null>(null);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [showLog, setShowLog] = useState(false);
  const units = q.data?.units[sku] ?? [];
  const rate = (TAX_RATE[cat.data?.[0]?.taxInCode ?? 'V08'] ?? 0) / 100;
  const asPrice = (r: SupplierProduct, inc: boolean) => (r.price === null || r.price === undefined ? null : Boolean(r.priceIncludesVat) === inc ? r.price : inc ? roundPrice(r.price * (1 + rate)) : roundPrice(r.price / (1 + rate)));

  // Nhóm theo NCC (dòng giá chung không có NCC xếp cuối); trong nhóm: hiệu lực từ mới nhất trước.
  const groups = useMemo(() => {
    const m = new Map<string, SupplierProduct[]>();
    for (const r of (q.data?.rows ?? []).filter((x) => x.partnerCode)) { const key = r.partnerCode ?? ''; m.set(key, [...(m.get(key) ?? []), r]); }
    for (const list of m.values()) list.sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? '') || Number(b.id) - Number(a.id));
    return [...m.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || a[0].localeCompare(b[0]));
  }, [q.data]);

  const d0 = today();
  const live = (r: SupplierProduct) => r.isActive && (!r.validFrom || r.validFrom <= d0) && (!r.validTo || r.validTo >= d0);
  const refresh = () => { void q.refetch(); void log.refetch(); void qc.invalidateQueries({ queryKey: ['mua-hang', 'supplier-products'] }); onChanged?.(); };
  const newFor = (pc: string | null, last?: SupplierProduct): Form => ({ partnerCode: pc, sku, unit: last?.unit ?? units.find((u) => u.isPurchaseDefault)?.unit ?? units[0]?.unit ?? '', nccSku: last?.nccSku ?? '', nccName: last?.nccName ?? '', price: null, priceIncludesVat: last?.priceIncludesVat ?? false, validFrom: d0, note: '', isActive: true });

  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(newFor(null))} disabled={!units.length} title={units.length ? 'Khai giá mua của một nhà cung cấp cho mã này' : 'Mặt hàng chưa có ĐVT: khai ở thẻ Đơn vị tính trước'}><Plus size={13} /> Thêm nhà cung cấp</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm" onClick={() => setShowLog((x) => !x)}>{showLog ? 'Ẩn lịch sử' : `Lịch sử thay đổi${log.data?.length ? ` (${log.data.length})` : ''}`}</button>
      </div>
      {q.isLoading && <div className="muted">Đang tải…</div>}
      {!q.isLoading && !groups.length && <div className="muted">Chưa nhà cung cấp nào khai giá {name}. Bấm <b>Thêm nhà cung cấp</b>.</div>}
      {groups.map(([pc, list]) => {
        const shown = more[pc] ? list : list.slice(0, SHOW);
        return (
          <div key={pc || '-'} className="ncc-gia">
            <div className="ncc-gia-head">
              <b title={pc}>{pc ? names.partnerName(pc) || pc : 'Giá chung mọi nhà cung cấp'}</b>
              {pc && <span className="muted mono" style={{ fontSize: 11.5 }}>{pc}</span>}
              <span style={{ flex: 1 }} />
              <button type="button" className="btn btn-xs" onClick={() => setOpen(newFor(pc || null, list[0]))} title="Thêm đợt giá mới cho nhà cung cấp này (giữ các đợt cũ)"><Plus size={12} /> Giá mới</button>
            </div>
            <table className="mh-mini">
              <thead><tr><th title="Đơn vị tính của giá">ĐVT</th><th className="num" title="Giá mua theo ĐVT, chưa thuế GTGT">Giá chưa thuế</th><th className="num" title="Giá mua theo ĐVT, gồm thuế GTGT">Giá gồm thuế</th><th title="Khoảng ngày áp dụng giá">Hiệu lực</th><th title="Mã / tên hàng nhà cung cấp ghi trên hoá đơn">Bên NCC</th><th>Ghi chú</th><th title="Người sửa, lúc sửa">Sửa lần cuối</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className={`row-click${live(r) ? '' : ' muted'}`} onClick={() => setOpen({ ...r, partnerCode: r.partnerCode ?? null })} title="Bấm để sửa / xoá">
                    <td>{r.unit}</td>
                    <td className="num">{asPrice(r, false) !== null ? donGia(asPrice(r, false)!) : <span className="muted">chưa khai</span>}</td>
                    <td className="num">{asPrice(r, true) !== null ? donGia(asPrice(r, true)!) : ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.validFrom || r.validTo ? `${dmy(r.validFrom) || '…'} → ${dmy(r.validTo) || 'nay'}` : 'mọi ngày'}{live(r) ? <span className="badge badge-ok" style={{ marginLeft: 6, fontSize: 10.5 }}>đang áp</span> : !r.isActive ? <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10.5 }}>ngừng</span> : null}</td>
                    <td style={{ fontSize: 12 }}>{[r.nccSku, r.nccName].filter(Boolean).join(' · ')}</td>
                    <td style={{ fontSize: 12 }}>{r.note}</td>
                    <td className="muted" style={{ fontSize: 11 }}>{r.updatedBy ? `${r.updatedBy} · ${new Date(r.updatedAt!).toLocaleString('vi-VN', { hour12: false })}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length > SHOW && <button type="button" className="link" style={{ fontSize: 12, marginTop: 4 }} onClick={() => setMore((m) => ({ ...m, [pc]: !m[pc] }))}>{more[pc] ? 'Thu gọn' : `Xem thêm ${list.length - SHOW} đợt giá cũ`}</button>}
          </div>
        );
      })}
      {showLog && (
        <div className="ncc-gia" style={{ marginTop: 10 }}>
          <div className="ncc-gia-head"><b>Lịch sử thay đổi</b><span className="muted" style={{ fontSize: 12 }}>mới nhất trên cùng</span></div>
          <table className="mh-mini">
            <thead><tr><th>Lúc</th><th>Người</th><th>Nhà cung cấp</th><th>Thay đổi</th></tr></thead>
            <tbody>
              {(log.data ?? []).flatMap((e, i) => {
                const d = e.data as { partnerCode?: string; changes?: { sku: string; text: string }[]; rows?: string[] };
                const items = d.changes ? d.changes.filter((c) => c.sku === sku).map((c) => c.text) : (d.rows ?? []).filter((x) => String(x).startsWith(`${sku} `)).map((x) => String(x).slice(sku.length + 1));
                return items.map((t, j) => <tr key={`${i}-${j}`}><td style={{ whiteSpace: 'nowrap' }}>{new Date(e.ts).toLocaleString('vi-VN', { hour12: false })}</td><td>{e.user}</td><td>{d.partnerCode ? names.partnerName(d.partnerCode) || d.partnerCode : 'Giá chung'}</td><td style={{ fontSize: 12 }}>{t}</td></tr>);
              })}
              {!log.isLoading && !(log.data ?? []).length && <tr><td colSpan={4} className="muted">Chưa có thay đổi.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {open && <HopGia v={open} units={units} rate={rate} onClose={() => setOpen(null)} onDone={() => { setOpen(null); refresh(); }} />}
    </div>
  );
}

function HopGia({ v: init, units, rate, onClose, onDone }: { v: Form; units: { unit: string; ratio: number }[]; rate: number; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState<Form>(init);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Form>) => setV((x) => ({ ...x, ...p }));
  const isNew = !v.id;
  const pAs = (inc: boolean) => (v.price === null || v.price === undefined ? null : Boolean(v.priceIncludesVat) === inc ? v.price : inc ? roundPrice(v.price * (1 + rate)) : roundPrice(v.price / (1 + rate)));
  const save = async () => {
    if (!v.partnerCode && isNew) { setErr('Chọn nhà cung cấp'); return; }
    if (!v.unit) { setErr('Chọn ĐVT'); return; }
    setBusy(true); setErr('');
    try {
      await purchaseApi.saveSupplierProducts([{ id: v.id, partnerCode: v.partnerCode, sku: v.sku, unit: v.unit, nccSku: v.nccSku ?? '', nccName: v.nccName ?? '', price: v.price ?? null, priceIncludesVat: Boolean(v.priceIncludesVat), warnPct: v.warnPct ?? 2, validFrom: v.validFrom || undefined, validTo: v.validTo || undefined, note: v.note ?? '', isActive: v.isActive ?? true }]);
      onDone();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!v.id || !window.confirm('Xoá đợt giá này? Phiếu đã lập không bị ảnh hưởng.')) return;
    setBusy(true);
    try { await purchaseApi.deleteSupplierProduct(v.id); onDone(); } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  return (
    <Modal title={isNew ? 'Khai giá mua' : 'Sửa giá mua'} onClose={onClose}
      footer={<>
        {!isNew && <button className="btn" style={{ marginRight: 'auto' }} disabled={busy} onClick={() => void del()}>Xoá</button>}
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>Ghi</button>
        <button className="btn" onClick={onClose}>Thoát</button>
      </>}>
      {err && <div className="alert alert-bad full">{err}</div>}
      <Field label="Nhà cung cấp (*)" full>
        {isNew && init.partnerCode === null ? <PartnerPicker value={v.partnerCode ?? ''} onChange={(c) => set({ partnerCode: c || null })} placeholder="Gõ mã, tên hoặc MST để tìm" addKind="supplier" /> : <input className="input" readOnly value={v.partnerCode ?? 'Giá chung'} />}
      </Field>
      <Field label="ĐVT (*)">
        <select className="select input" value={v.unit} onChange={(e) => set({ unit: e.target.value })}>
          {units.map((u) => <option key={u.unit} value={u.unit}>{u.unit}{u.ratio !== 1 ? ` (×${u.ratio})` : ''}</option>)}
        </select>
      </Field>
      <Field label="Thuế suất"><input className="input" readOnly value={`${Math.round(rate * 100)}%`} /></Field>
      <Field label="Giá chưa thuế" tip="Gõ ô nào cũng được, ô kia tự quy đổi"><NumInput value={pAs(false)} onChange={(n) => set({ price: n, priceIncludesVat: false })} /></Field>
      <Field label="Giá gồm thuế"><NumInput value={pAs(true)} onChange={(n) => set({ price: n, priceIncludesVat: true })} /></Field>
      <Field label="Hiệu lực từ"><input className="input" type="date" value={v.validFrom ?? ''} onChange={(e) => set({ validFrom: e.target.value || undefined })} /></Field>
      <Field label="Đến" tip="Trống = tới khi có giá mới"><input className="input" type="date" value={v.validTo ?? ''} onChange={(e) => set({ validTo: e.target.value || undefined })} /></Field>
      <Field label="Mã hàng bên NCC"><input className="input mono" value={v.nccSku ?? ''} onChange={(e) => set({ nccSku: e.target.value })} /></Field>
      <Field label="Tên hàng bên NCC"><input className="input" value={v.nccName ?? ''} onChange={(e) => set({ nccName: e.target.value })} placeholder="Tên NCC ghi trên hoá đơn" /></Field>
      <Field label="Ghi chú" full><input className="input" value={v.note ?? ''} maxLength={300} onChange={(e) => set({ note: e.target.value })} /></Field>
      {!isNew && <label className="checkbox full" style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={v.isActive === false} onChange={(e) => set({ isActive: !e.target.checked })} /><span>Ngừng áp giá này</span></label>}
    </Modal>
  );
}
