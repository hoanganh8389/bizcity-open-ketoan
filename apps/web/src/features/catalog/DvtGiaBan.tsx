/**
 * Hai thẻ của form Mặt hàng (tách riêng cho rõ — ĐVT là cấu hình kho / mua / bán chung; giá bán là cấu hình bán hàng):
 *   DvtQuyDoi — thẻ "Đơn vị tính": khai theo ĐVT trung gian như NCC nói ("1 Thùng = 12 Lốc"), phần mềm tự ra tỉ lệ về ĐVT nhỏ
 *               nhất (48 Lon) — chỉ tỉ lệ này được lưu (product_units.ratio). Dải tóm tắt "1 Thùng = 12 Lốc = 48 Lon".
 *   GiaBan    — thẻ "Giá bán": mỗi bảng giá một DÒNG, mỗi ĐVT một CỘT; ô trống hiện giá gợi ý theo tỉ lệ (bấm "lấy");
 *               dòng chi nhánh có % chênh so với giá công ty; dán cả dòng số từ Excel.
 * Giá MUA không nằm ở đây: thẻ "Mua hàng" (giá mua riêng của sản phẩm + giá theo từng NCC).
 * Phép tính dùng chung ở @ketoan/contracts (dvt.ts) — không viết lại ở chỗ khác.
 */
import { useState, type ClipboardEvent } from 'react';
import { chainText, refOf, sortUnits, suggestPrice, unitProblems } from '@ketoan/contracts';
import { UnitNameInput } from './UnitNameInput';
import { useUnitNames } from './UnitNamesPage';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { Field, Modal } from '@/components/ui';
import { useBranches } from '@/components/filters';
import './dvt-gia-ban.css';

export interface UnitRow { unit: string; ratio: number; isDefault: boolean; isPurchaseDefault?: boolean; weightKg: number | null; note: string }
export interface PriceRow { priceListCode: string; unit: string; price: number | null; isDefaultUnit: boolean; note: string }
export interface PriceListLite { code: string; name: string; isCompany: boolean; isActive: boolean; branchCodes: string[] }

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toLocaleString('vi-VN'));
const num = (s: string): number | null => { const t = s.replace(/\./g, '').replace(/\s/g, '').replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
const QUICK = ['Lốc', 'Lốc_4', 'Lốc_6', 'Thùng', 'Hộp', 'Lon', 'Gói', 'Chai', 'Vỉ', 'Túi'];

type Props = {
  units: UnitRow[]; prices: PriceRow[]; lists: PriceListLite[]; shown: string[]; setShown: (f: (x: string[]) => string[]) => void;
  onUnit: (i: number, p: Partial<UnitRow>) => void; onAdd: (u: UnitRow) => void; onRemove: (i: number) => void; setPrice: (list: string, unit: string, price: number | null) => void;
};

/** Thẻ "Đơn vị tính": ĐVT & quy đổi. */
export function DvtQuyDoi({ units, onUnit, onAdd, onRemove }: Pick<Props, 'units' | 'onUnit' | 'onAdd' | 'onRemove'>) {
  const names = useUnitNames().data ?? [];
  // ĐVT trung gian người dùng chọn cho từng dòng (chỉ để khai / hiển thị; lưu vẫn là tỉ lệ về ĐVT nhỏ nhất).
  const [refs, setRefs] = useState<Record<number, string>>({});
  const base = units.find((u) => Number(u.ratio) === 1);
  const prob = unitProblems(units);
  const sorted = sortUnits(units);
  const chain = chainText(units);
  const used = new Set(units.map((u) => u.unit.trim().toLowerCase()));
  const quick = QUICK.filter((q) => !used.has(q.toLowerCase()) && names.some((n) => n.name === q && n.isActive)).slice(0, 6);
  const largest = sorted[sorted.length - 1];
  // ĐVT mới (chưa có quy đổi) mặc định khai theo ĐVT lớn nhất đang có: thêm "Thùng" sau "Lốc" là "1 Thùng = … Lốc".
  const refFor = (i: number) => { const u = units[i]!; const want = refs[i] && units.find((x) => x.unit === refs[i] && x.ratio > 0 && x !== u); return want || (u.ratio > 0 ? refOf(units, u) : sortUnits(units.filter((x) => x !== u)).at(-1)) || base; };
  return (
    <div className="full blk-stack">
      {/* Đơn vị tính & quy đổi */}
      <section className="blk blk-blue">
        <header>
          <div><b>Đơn vị tính & quy đổi</b><span>Khai như nhà cung cấp nói: "1 Thùng = 12 Lốc". Tồn kho luôn tính theo ĐVT nhỏ nhất.</span></div>
          {chain && <div className="dvt-chain" title="Quy đổi từ ĐVT lớn nhất về ĐVT nhỏ nhất">{chain.split(' = ').map((p, i) => <span key={i}>{i > 0 && <i>=</i>}<b>{p}</b></span>)}</div>}
        </header>
        <div className="dvt-rows">
          <table className="dvt-units">
          <thead><tr><th style={{ width: 86 }} /><th style={{ width: 220 }}>Tên ĐVT</th><th>Quy đổi</th><th style={{ width: 90 }}>Bán chính</th><th style={{ width: 44 }} /></tr></thead>
          <tbody>
          {units.map((u, i) => {
            const isBase = u === base;
            const ref = isBase ? undefined : refFor(i);
            const qty = ref && u.ratio > 0 ? Math.round((u.ratio / ref.ratio) * 1e6) / 1e6 : null;
            const refChoices = units.filter((x, j) => j !== i && x.unit.trim() && x.ratio > 0 && (!(u.ratio > 0) || x.ratio < u.ratio));
            return (
              <tr key={i} className={`${isBase ? 'is-base' : ''} ${prob.rows[i] ? 'is-bad' : ''}`}>
                <td>{isBase ? <em className="dvt-badge">Nhỏ nhất</em> : <em className="dvt-no">{i + 1}</em>}</td>
                <td><UnitNameInput value={u.unit} onChange={(v) => onUnit(i, { unit: v })} exclude={units.filter((_, j) => j !== i).map((x) => x.unit)} placeholder={isBase || i === 0 ? 'Chọn: Lon, Hộp…' : 'Chọn: Lốc, Thùng…'} invalid={Boolean(prob.rows[i])} /></td>
                <td><div className="dvt-conv">
                  {isBase ? <span className="muted">Đơn vị nhỏ nhất · tồn kho tính theo ĐVT này</span> : <>
                    <span className="dvt-eq">1 {u.unit || 'ĐVT'} =</span>
                    <input className="input num dvt-qty" value={qty ?? ''} placeholder="SL" onChange={(e) => { const n = num(e.target.value); onUnit(i, { ratio: n && ref ? Math.round(n * ref.ratio * 1e6) / 1e6 : 0 }); }} />
                    <select className="select input dvt-ref" value={ref?.unit ?? ''} onChange={(e) => { const r = units.find((x) => x.unit === e.target.value); setRefs((x) => ({ ...x, [i]: e.target.value })); if (r && qty) onUnit(i, { ratio: Math.round(qty * r.ratio * 1e6) / 1e6 }); }}>
                      {refChoices.map((x) => <option key={x.unit} value={x.unit}>{x.unit}</option>)}
                    </select>
                    {ref && base && ref !== base && u.ratio > 0 && <span className="dvt-to">= {fmt(u.ratio)} {base.unit}</span>}
                  </>}
                  {prob.rows[i] && <small className="mh-bad">{prob.rows[i]}</small>}
                </div></td>
                <td className="c"><label className={`dvt-pill ${u.isDefault ? 'on' : ''}`}><input type="radio" name="dvt-chinh" checked={u.isDefault} onChange={() => onUnit(i, { isDefault: true })} />Bán</label></td>
                <td>{units.length > 1 && !isBase && <button type="button" className="btn btn-xs" title="Bỏ ĐVT này (giá của ĐVT bỏ theo)" onClick={() => { setRefs({}); onRemove(i); }}>×</button>}</td>
              </tr>
            );
          })}
          </tbody>
          </table>
        </div>
        {prob.general.map((g) => <div key={g} className="mh-bad" style={{ fontSize: 12 }}>{g}</div>)}
        <div className="dvt-add">
          <span className="muted">Thêm ĐVT:</span>
          {quick.map((q) => <button key={q} type="button" className="btn btn-xs dvt-chip" onClick={() => onAdd({ unit: q, ratio: 0, isDefault: false, weightKg: null, note: '' })}>+ {q}</button>)}
          <button type="button" className="btn btn-xs" onClick={() => onAdd({ unit: '', ratio: base ? 0 : 1, isDefault: !units.length, weightKg: null, note: '' })}>+ ĐVT khác…</button>
          {largest && largest !== base && <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>ĐVT mới mặc định quy đổi theo {largest.unit}</span>}
        </div>
      </section>
    </div>
  );
}

/** Thẻ "Giá bán": bảng giá công ty / chi nhánh theo từng ĐVT (cấu hình bán hàng). */
// [2026-11-12 Nguyễn Văn Thủy] hàng chính chỉ khai bảng giá công ty (luôn bán theo giá công ty) (đóng góp)
export function GiaBan({ units, prices, lists, shown: shownAll, setShown, setPrice, onlyCompany }: Pick<Props, 'units' | 'prices' | 'lists' | 'shown' | 'setShown' | 'setPrice'> & { onlyCompany?: boolean }) {
  // [2026-11-12 Nguyễn Văn Thủy] chỉ khai giá ĐVT bán chính (đã chọn ở thẻ Đơn vị tính), không gợi ý quy đổi (đóng góp)
  const all = sortUnits(units);
  const main = all.find((u) => u.isDefault) ?? all[0];
  const sorted = main ? [main] : [];
  const priceOf = (list: string, unit: string) => prices.find((p) => p.priceListCode === list && p.unit === unit)?.price;
  const rowPrices = (list: string) => sorted.map((u) => ({ unit: u.unit, price: priceOf(list, u.unit) }));
  const company = lists.find((l) => l.isCompany);
  const shown = onlyCompany ? shownAll.filter((c) => c === company?.code) : shownAll;
  const [adding, setAdding] = useState(false);
  const listName = new Map(lists.map((l) => [l.code, l]));
  const hidden = lists.filter((l) => l.isActive && !shown.includes(l.code));
  /** Dán từ Excel: nhiều số cách nhau bằng Tab / xuống dòng → điền sang phải (ĐVT) và xuống dưới (bảng giá). */
  const paste = (e: ClipboardEvent<HTMLInputElement>, row: number, col: number) => {
    const text = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    text.trim().split(/\r?\n/).forEach((line, dr) => line.split('\t').forEach((cell, dc) => {
      const list = shown[row + dr], u = sorted[col + dc];
      if (list && u) setPrice(list, u.unit, num(cell));
    }));
  };
  return (
    <div className="full blk-stack">
      {/* Giá bán theo bảng giá */}
      <section className="blk blk-green">
        <header>
          <div><b>Giá bán theo bảng giá</b><span>Giá đã gồm thuế, theo ĐVT bán chính{main ? ` (${main.unit})` : ''}. Đổi ĐVT bán chính ở thẻ Đơn vị tính.</span></div>
        </header>
        {!sorted.length ? <div className="muted" style={{ padding: 8 }}>Khai ĐVT ở thẻ Đơn vị tính trước.</div> : !company ? <div className="muted" style={{ padding: 8 }}>Chưa có bảng giá công ty — khai ở màn Bảng giá bán.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dvt-price">
              <thead><tr><th>Bảng giá</th>{sorted.map((u) => <th key={u.unit} className="num">{u.unit}{u.ratio !== 1 && <small> ×{fmt(u.ratio)}</small>}</th>)}<th /></tr></thead>
              <tbody>
                {shown.map((code, row) => {
                  const l = listName.get(code);
                  const known = rowPrices(code);
                  const sug = sorted.map((u) => (priceOf(code, u.unit) === null || priceOf(code, u.unit) === undefined ? suggestPrice(sorted, known, u.unit) : undefined));
                  const nSug = sug.filter((x) => x !== undefined).length;
                  return (
                    <tr key={code} className={l?.isCompany ? 'is-company' : ''}>
                      <td className="dvt-list"><b>{l?.name ?? code}</b>{l?.isCompany ? <span className="dvt-tag">Công ty</span> : <small>{l?.branchCodes.length ? `${l.branchCodes.length} chi nhánh` : 'chưa gán chi nhánh'}</small>}</td>
                      {sorted.map((u, col) => {
                        const p = priceOf(code, u.unit);
                        const c = company && !l?.isCompany ? priceOf(company.code, u.unit) : undefined;
                        const diff = p && c ? Math.round(((p - c) / c) * 1000) / 10 : null;
                        return (
                          <td key={u.unit}>
                            <input className="input num" value={fmt(p)} placeholder={sug[col] !== undefined ? `≈ ${fmt(sug[col])}` : ''} onChange={(e) => setPrice(code, u.unit, num(e.target.value))} onPaste={(e) => paste(e, row, col)} />
                            {sug[col] !== undefined ? <button type="button" className="dvt-sug" onClick={() => setPrice(code, u.unit, sug[col]!)} title="Theo tỉ lệ quy đổi từ ĐVT đã có giá">lấy {fmt(sug[col])}</button>
                              : diff !== null && diff !== 0 ? <small className={diff < 0 ? 'dvt-down' : 'dvt-up'}>{diff > 0 ? '+' : ''}{diff}% so với công ty</small> : null}
                          </td>
                        );
                      })}
                      <td className="dvt-act">
                        {nSug > 1 && <button type="button" className="btn btn-xs" onClick={() => sorted.forEach((u, col) => sug[col] !== undefined && setPrice(code, u.unit, sug[col]!))}>Lấy cả {nSug} giá gợi ý</button>}
                        {!l?.isCompany && <>
                          <button type="button" className="btn btn-xs" title="Điền các ô trống bằng giá công ty" onClick={() => sorted.forEach((u) => { const cp = company ? priceOf(company.code, u.unit) : undefined; if ((priceOf(code, u.unit) === null || priceOf(code, u.unit) === undefined) && cp) setPrice(code, u.unit, cp); })}>Lấy giá công ty</button>
                          <button type="button" className="btn btn-xs" title="Ẩn dòng (giá đã khai vẫn giữ; xoá giá thì xoá số trong ô)" onClick={() => setShown((x) => x.filter((c) => c !== code))}>Ẩn</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {onlyCompany && company && sorted.length > 0 && <div className="muted" style={{ fontSize: 12, padding: '6px 0' }}>Hàng chính: chỉ khai giá bảng giá công ty.</div>}
        {!onlyCompany && company && sorted.length > 0 && (
          <div className="dvt-add">
            <select className="select input" style={{ height: 30, width: 'auto' }} value="" onChange={(e) => { const c = e.target.value; if (c === '__new') setAdding(true); else if (c) setShown((x) => [...x, c]); }}>
              <option value="">+ Thêm giá riêng cho bảng giá chi nhánh…</option>
              <option value="__new">＋ Thêm bảng giá mới…</option>
              {hidden.map((l) => <option key={l.code} value={l.code}>{l.name}{l.branchCodes.length ? ` (${l.branchCodes.length} chi nhánh)` : ''}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 12 }}>Hàng chính chỉ bán theo giá công ty; hàng thường ưu tiên giá chi nhánh rồi tới giá công ty.</span>
          </div>
        )}
      </section>
      {adding && <ThemBangGia onClose={() => setAdding(false)} onDone={(code) => { setAdding(false); setShown((x) => [...x, code]); }} />}
    </div>
  );
}

// [2026-11-12 Nguyễn Văn Thủy] thêm nhanh bảng giá mới ngay ở thẻ Giá bán, chọn luôn chi nhánh áp dụng (đóng góp)
function ThemBangGia({ onClose, onDone }: { onClose: () => void; onDone: (code: string) => void }) {
  const qc = useQueryClient();
  const branches = (useBranches().data ?? []).filter((b) => b.isActive);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [find, setFind] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const t = find.trim().toLowerCase();
  const shown = branches.filter((b) => !t || b.code.toLowerCase().includes(t) || b.name.toLowerCase().includes(t));
  const toggle = (c: string) => setPicked((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));
  const save = async () => {
    const c = (code.trim() || name.trim());
    if (!c || !name.trim()) { setErr('Nhập tên bảng giá'); return; }
    setBusy(true); setErr('');
    try {
      await api.put(`/api/v1/catalog/price-lists/${encodeURIComponent(c)}`, { name: name.trim(), isCompany: false, isActive: true, note: '' });
      if (picked.length) await api.put(`/api/v1/catalog/price-lists/${encodeURIComponent(c)}/branches`, { branchCodes: picked });
      await qc.invalidateQueries({ queryKey: ['price-lists'] });
      onDone(c);
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  return (
    <Modal wide title="Thêm bảng giá mới" onClose={onClose} footer={<><button className="btn btn-primary" disabled={busy} onClick={() => void save()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      {err && <div className="alert alert-bad full">{err}</div>}
      <Field label="Tên bảng giá (*)"><input className="input" value={name} maxLength={200} autoFocus onChange={(e) => setName(e.target.value)} placeholder="vd BG Hải Dương" /></Field>
      <Field label="Mã bảng giá" tip="Trống = lấy theo tên"><input className="input mono" value={code} maxLength={64} onChange={(e) => setCode(e.target.value)} placeholder={name || 'theo tên'} /></Field>
      <Field label={`Chi nhánh áp dụng (${picked.length})`} full>
        <div className="row" style={{ gap: 6, marginBottom: 6 }}>
          <input className="input" style={{ flex: 1 }} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Gõ mã / tên chi nhánh để lọc" />
          <button type="button" className="btn btn-sm" onClick={() => setPicked((x) => [...new Set([...x, ...shown.map((b) => b.code)])])}>Chọn hết đang hiện</button>
          <button type="button" className="btn btn-sm" onClick={() => setPicked([])}>Bỏ hết</button>
        </div>
        <div style={{ maxHeight: 240, overflow: 'auto', columns: 3, border: '1px solid var(--line, #e3e7ee)', borderRadius: 6, padding: 6 }}>
          {shown.map((b) => <label key={b.code} className="checkbox" style={{ display: 'flex', gap: 6, padding: '2px 0', breakInside: 'avoid' }}><input type="checkbox" checked={picked.includes(b.code)} onChange={() => toggle(b.code)} /><span><span className="mono">{b.code}</span> {b.name}</span></label>)}
          {!shown.length && <span className="muted">Không có chi nhánh khớp.</span>}
        </div>
      </Field>
    </Modal>
  );
}
