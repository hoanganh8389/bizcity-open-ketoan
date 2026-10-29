/**
 * TỒN MAX / MIN CỦA MỘT MÃ tại một chi nhánh – kho — hộp nhanh trong form Mặt hàng (cùng bảng stock_levels với màn Tồn max MH16):
 *   chi nhánh / shop · kho (trống = kho mặc định) · tồn max (quan trọng) · tồn min (tuỳ chọn, thường cho kho) — nhập theo ĐVT
 *   quen dùng (ví dụ Thùng), lưu quy về ĐVT nhỏ nhất. Câu ví dụ bên dưới tự tính lại: tồn còn bao nhiêu thì chia / đặt thêm bao nhiêu.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ratioOf, type ProductUnit } from '@ketoan/contracts/mua-hang';
import { Field, Modal } from '@/components/ui';
import { errorText } from '@/lib/api';
import { purchaseApi } from '../du-lieu';
import { stockApi, useHierarchy, type LevelRow } from '../ton-max/api';

const n = (s: string) => { const v = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
const vn = (x: number) => x.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export function TonMinMaxForm({ sku, name, value, onClose, onSaved }: { sku: string; name: string; value?: LevelRow; onClose: () => void; onSaved: () => void }) {
  const h = useHierarchy();
  const uq = useQuery({ queryKey: ['mua-hang', 'units', sku], queryFn: () => purchaseApi.units([sku]) });
  const units: ProductUnit[] = useMemo(() => [...(uq.data?.[sku] ?? [])].sort((a, b) => a.ratio - b.ratio), [uq.data, sku]);
  const base = units.find((u) => u.ratio === 1)?.unit ?? 'ĐVT';
  const buyUnit = units.find((u) => u.isPurchaseDefault)?.unit ?? units.at(-1)?.unit ?? base;
  const [branch, setBranch] = useState(value?.branchCode ?? '');
  const [wh, setWh] = useState(value?.warehouseCode ?? '');
  const [unit, setUnit] = useState<string>('');
  const u = unit || buyUnit;
  const ratio = ratioOf(units, u) || 1;
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const minBase = min !== '' ? n(min) * ratio : value?.min ?? 0;
  const maxBase = max !== '' ? n(max) * ratio : value?.max ?? 0;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const node = (h.data?.branches ?? []).find((b) => b.code === branch);
  const isShop = node?.level === 'shop';
  const ex = Math.max(0, Math.floor(maxBase * 0.4));
  const bad = !branch ? 'Chọn chi nhánh / shop' : !maxBase ? 'Nhập tồn max' : minBase > maxBase ? 'Tồn min phải nhỏ hơn tồn max' : '';

  const save = async (remove = false) => {
    if (!remove && bad) { setErr(bad); return; }
    setBusy(true); setErr('');
    try { await stockApi.saveLevels([{ branchCode: branch, warehouseCode: wh, sku, max: remove ? 0 : maxBase, min: remove ? 0 : minBase, remove }]); onSaved(); }
    catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const unitSel = (
    <select className="select input" style={{ width: 150 }} value={u} onChange={(e) => setUnit(e.target.value)}>
      {units.map((x) => <option key={x.unit} value={x.unit}>{x.unit}{x.ratio !== 1 ? ` (= ${x.ratio} ${base})` : ''}</option>)}
    </select>
  );
  const branches = (h.data?.branches ?? []).filter((b) => b.isActive || b.code === branch);
  return (
    <Modal wide title={`Tồn max · ${sku} — ${name}`} onClose={onClose}
      footer={<>
        {value && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => void save(true)}>Xoá</button>}
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full alert alert-info" style={{ fontSize: 13 }}>
        <b>Tồn max</b> là mức hàng muốn có. Shop dưới max → màn <b>Chuyển hàng xuống shop (MH19)</b> tự đề xuất chia thêm; kho dưới max → <b>Phân tích đặt hàng (MH02)</b> tính cần nhập. Khai hàng loạt ở màn <b>Tồn max (MH16)</b>.
      </div>
      <Field label="Chi nhánh / shop">
        <select className="select input" style={{ minWidth: 260 }} value={branch} disabled={Boolean(value)} onChange={(e) => { setBranch(e.target.value); setWh(''); }}>
          <option value="">— chọn —</option>
          {branches.filter((b) => b.level === 'branch').map((p) => <optgroup key={p.code} label={`${p.code} · ${p.name}`}>
            <option value={p.code}>★ {p.code} · {p.name} (kho chi nhánh cha)</option>
            {branches.filter((s) => s.parentCode === p.code).map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}
          </optgroup>)}
          <optgroup label="Chưa xếp phân cấp">{branches.filter((b) => !b.level).map((b) => <option key={b.code} value={b.code}>{b.code} · {b.name}</option>)}</optgroup>
        </select>
      </Field>
      <Field label="Kho" hint="Trống = kho mặc định của chi nhánh (shop thường chỉ có một kho)">
        <select className="select input" style={{ width: 220 }} value={wh} disabled={Boolean(value)} onChange={(e) => setWh(e.target.value)}>
          <option value="">Kho mặc định</option>{(node?.warehouses ?? []).map((w) => <option key={w.code} value={w.code}>{w.code} · {w.name}</option>)}
        </select>
      </Field>
      <Field label="Nhập theo ĐVT" hint={`Lưu quy về ĐVT nhỏ nhất (${base})`}>{unitSel}</Field>
      <Field label={`Tồn max (${u})`} hint={`= ${vn(maxBase)} ${base}`}><input className="input num" style={{ width: 130 }} value={max !== '' ? max : value ? vn(value.max / ratio) : ''} placeholder={`vd 4 ${u}`} onChange={(e) => setMax(e.target.value)} autoFocus /></Field>
      <Field label={`Tồn min (${u}) — tuỳ chọn`} hint={`= ${vn(minBase)} ${base}`}><input className="input num" style={{ width: 130 }} value={min !== '' ? min : value?.min ? vn(value.min / ratio) : ''} placeholder="thường để trống" onChange={(e) => setMin(e.target.value)} /></Field>
      <div className="full">
        {bad ? <div className="alert alert-warn">{bad}</div> : (
          <div className="alert alert-ok" style={{ fontSize: 13 }}>
            <b>Phần mềm sẽ làm:</b> {isShop ? `shop ${node!.name}` : `kho ${node?.name ?? branch}`} giữ tới <b>{vn(maxBase)} {base}</b>{ratio > 1 ? ` (${vn(maxBase / ratio)} ${u})` : ''}.
            <br />Ví dụ: tồn còn {vn(ex)} {base} → {isShop ? 'đề xuất chuyển xuống' : 'tính vào SL cần nhập'} <b>{vn(maxBase - ex)} {base}</b> (trước khi trừ hàng đang đi đường{isShop ? ', làm tròn thùng' : ', đơn đang đặt'}).
          </div>
        )}
      </div>
      {err && <div className="full alert alert-bad">{err}</div>}
    </Modal>
  );
}
