/**
 * BẢNG MUA – TẶNG (chính sách "Khuyến mại mua X tặng Y" nhiều dòng): mỗi dòng "mua <SL> <ĐVT> mã A → tặng <SL> <ĐVT> mã B"
 * với ô tích Cộng dồn / Áp riêng của riêng dòng đó, cột "Nghĩa là" đọc thành câu (kèm quy đổi về ĐVT nhỏ nhất).
 *   - Thêm dòng trống, thêm nhiều mã từ danh mục, nhập Excel (có hướng dẫn cột + file mẫu + xem trước), xuất Excel;
 *   - ĐVT chọn trong ĐVT đã khai của mã (không gõ tay) — máy chủ ghi kèm tỉ lệ quy đổi khi lưu, phiếu ghi ĐVT nào cũng tính đúng.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileUp, Plus } from 'lucide-react';
import type { GiftItem, ProductUnit } from '@ketoan/contracts/mua-hang';
import { api } from '@/lib/api';
import { ItemPicker } from '@/components/pickers';
import { P, purchaseApi } from '../du-lieu';
import { ChonMatHang } from '../thanh-phan/ChonMatHang';
import { NhapExcelChung, xuatExcel, type ExcelImportSpec } from '../thanh-phan/NhapExcelChung';
import type { GuideColumn } from '../thanh-phan/ExcelGuide';

const vn = (n: number) => n.toLocaleString('vi-VN');
const lc = (u?: string) => (u ?? '').trim().toLowerCase();
const PAGE = 200;
type Units = Record<string, ProductUnit[]>;
/** ĐVT nhỏ nhất (tỉ lệ 1) và ĐVT mua mặc định của một mã. */
const baseOf = (us: ProductUnit[]) => us.find((u) => u.ratio === 1) ?? us[0];
const buyDefault = (us: ProductUnit[]) => us.find((u) => u.isPurchaseDefault) ?? us.find((u) => u.isDefault) ?? baseOf(us);

/** "Mua 1 Thùng (= 24 Lon) 140221001 → tặng 2 Lon cùng mã · mua 2 Thùng tặng 4 Lon · áp riêng". */
export function giftSentence(it: GiftItem, units: Units): string {
  const bu = units[it.sku] ?? [];
  const gs = it.giftSku || it.sku;
  const r = bu.find((u) => lc(u.unit) === lc(it.buyUnit))?.ratio ?? 1;
  const base = baseOf(bu);
  const conv = it.buyUnit && r !== 1 && base ? ` (= ${vn(it.buyQty * r)} ${base.unit})` : '';
  const getU = it.getUnit || it.buyUnit || 'ĐVT trên phiếu';
  const head = `Mua ${vn(it.buyQty || 0)} ${it.buyUnit || 'ĐVT trên phiếu'}${conv} ${it.sku || '?'} → tặng ${vn(it.getQty || 0)} ${getU} ${it.giftSku && it.giftSku !== it.sku ? gs : 'cùng mã'}`;
  const rep = it.repeat === false ? 'chỉ tặng một lần' : `cộng dồn: mua ${vn((it.buyQty || 0) * 2)} tặng ${vn((it.getQty || 0) * 2)}`;
  return `${head} · ${rep}${it.apply === 'exclusive' ? ' · áp riêng' : ''}`;
}

export function BangQuaTang({ items, onChange }: { items: GiftItem[]; onChange: (items: GiftItem[]) => void }) {
  const [find, setFind] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [pick, setPick] = useState(false);
  const [excel, setExcel] = useState(false);
  const skus = useMemo(() => [...new Set(items.flatMap((i) => [i.sku, i.giftSku ?? '']).filter(Boolean))], [items]);
  const units = useQuery({ queryKey: ['mua-hang', 'units-qua', skus.join(',')], enabled: skus.length > 0, staleTime: 60_000, queryFn: () => api.post<Units>(`${P}/units`, { skus }) });
  const U: Units = units.data ?? {};
  const names = useQuery({ queryKey: ['mua-hang', 'lookup-qua', skus.join(',')], queryFn: () => purchaseApi.lookupProducts(skus), enabled: skus.length > 0, staleTime: 60_000 });
  const nameOf = (s: string) => names.data?.find((p) => p.sku === s)?.name ?? '';
  const rows = items.map((it, idx) => ({ it, idx })).filter(({ it }) => !find || `${it.sku} ${it.giftSku ?? ''} ${nameOf(it.sku)} ${it.note ?? ''}`.toLowerCase().includes(find.toLowerCase()));
  const set = (idx: number, p: Partial<GiftItem>) => onChange(items.map((x, j) => (j === idx ? { ...x, ...p } : x)));
  // Chọn mã mua: điền sẵn ĐVT mua mặc định; mã tặng / ĐVT tặng chưa ghi thì tặng ĐVT nhỏ nhất của chính mã đó.
  const pickBuy = async (idx: number, sku: string) => {
    const us = (await purchaseApi.units([sku]))[sku] ?? [];
    const it = items[idx]!;
    set(idx, { sku, buyUnit: buyDefault(us)?.unit ?? '', ...(!it.giftSku ? { getUnit: baseOf(us)?.unit ?? '' } : {}) });
  };
  const pickGift = async (idx: number, sku: string) => {
    const us = sku ? (await purchaseApi.units([sku]))[sku] ?? [] : U[items[idx]!.sku] ?? [];
    set(idx, { giftSku: sku, getUnit: baseOf(us)?.unit ?? '' });
  };
  const blank = (): GiftItem => ({ sku: '', buyQty: 1, buyUnit: '', giftSku: '', getQty: 1, getUnit: '', repeat: true });
  const unitSel = (sku: string, value: string, on: (u: string) => void, emptyLabel: string) => {
    const us = U[sku] ?? [];
    const cur = us.find((u) => lc(u.unit) === lc(value))?.unit ?? value;
    return (
      <select className="select input" value={cur} onChange={(e) => on(e.target.value)} title="ĐVT đã khai của mã (Danh mục mặt hàng) — phần mềm quy về ĐVT nhỏ nhất khi tính">
        <option value="">{emptyLabel}</option>
        {cur && !us.some((u) => u.unit === cur) && <option value={cur}>{cur} (chưa khai)</option>}
        {us.map((u) => <option key={u.unit} value={u.unit}>{u.unit}{u.ratio !== 1 ? ` (= ${u.ratio} ${baseOf(us)?.unit ?? ''})` : ''}</option>)}
      </select>
    );
  };
  const exportXlsx = () => xuatExcel('mua-tang.xlsx', 'Mua tang', items.map((i) => ({
    'Mã hàng mua': i.sku, 'Tên hàng mua': nameOf(i.sku), 'SL mua': i.buyQty, 'ĐVT mua': i.buyUnit, 'Mã hàng tặng': i.giftSku ?? '', 'SL tặng': i.getQty, 'ĐVT tặng': i.getUnit,
    'Cộng dồn': i.repeat === false ? 'không' : 'có', 'Áp riêng': i.apply === 'exclusive' ? 'có' : 'không', 'Ghi chú': i.note ?? '', 'Nghĩa là': giftSentence(i, U),
  })));
  return (
    <div className="full ckma">
      <div className="ckma-bar">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => onChange([...items, blank()])}><Plus size={13} /> Thêm dòng</button>
        <button type="button" className="btn btn-sm" onClick={() => setPick(true)}>Thêm nhiều mã từ danh mục…</button>
        <input className="input" style={{ width: 200 }} placeholder="Lọc dòng: mã / tên / ghi chú" value={find} onChange={(e) => { setFind(e.target.value); setLimit(PAGE); }} />
        <span className="ckma-count"><b>{vn(items.length)}</b> dòng{find ? ` · đang lọc ${vn(rows.length)}` : ''}</span>
        <button type="button" className="btn btn-sm" onClick={() => setExcel(true)}><FileUp size={13} /> Nhập Excel…</button>
        <button type="button" className="btn btn-sm" disabled={!items.length} onClick={() => void exportXlsx()}><Download size={13} /> Xuất Excel</button>
      </div>
      <div className="ckma-scroll">
        <table className="mh-mini ckma-table">
          <thead><tr>
            <th style={{ width: 36 }}>STT</th><th style={{ width: 200 }}>Mua mã</th><th style={{ width: 70 }} className="num">SL mua</th><th style={{ width: 130 }}>ĐVT mua</th>
            <th style={{ width: 200 }}>Tặng mã (trống = chính mã mua)</th><th style={{ width: 70 }} className="num">SL tặng</th><th style={{ width: 130 }}>ĐVT tặng</th>
            <th style={{ width: 62 }} title="Đủ điều kiện mấy lần tặng mấy lần (mua 2 tặng 1 → mua 4 tặng 2). Bỏ tích = chỉ tặng một lần">Cộng dồn</th>
            <th style={{ width: 62 }} title="Mã nhận dòng này thì không nhận chương trình chiết khấu / khuyến mại nào khác">Áp riêng</th>
            <th>Nghĩa là</th><th style={{ width: 120 }}>Ghi chú</th><th style={{ width: 32 }} />
          </tr></thead>
          <tbody>
            {rows.slice(0, limit).map(({ it, idx }, k) => {
              const bad = !it.sku ? 'Chưa chọn mã mua' : !(it.buyQty > 0) || !(it.getQty > 0) ? 'SL mua / SL tặng phải lớn hơn 0' : '';
              return (
                <tr key={idx} className={bad ? 'mh-row-bad' : ''} title={bad}>
                  <td>{k + 1}</td>
                  <td><ItemPicker value={it.sku} onChange={(c) => void pickBuy(idx, c)} /></td>
                  <td><input className="input num" value={it.buyQty || ''} onChange={(e) => set(idx, { buyQty: Number(e.target.value.replace(',', '.')) || 0 })} /></td>
                  <td>{unitSel(it.sku, it.buyUnit, (u) => set(idx, { buyUnit: u }), 'ĐVT trên phiếu')}</td>
                  <td><ItemPicker value={it.giftSku ?? ''} onChange={(c) => void pickGift(idx, c)} /></td>
                  <td><input className="input num" value={it.getQty || ''} onChange={(e) => set(idx, { getQty: Number(e.target.value.replace(',', '.')) || 0 })} /></td>
                  <td>{unitSel(it.giftSku || it.sku, it.getUnit, (u) => set(idx, { getUnit: u }), 'như ĐVT mua')}</td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={it.repeat !== false} onChange={(e) => set(idx, { repeat: e.target.checked })} /></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={it.apply === 'exclusive'} onChange={(e) => set(idx, { apply: e.target.checked ? 'exclusive' : undefined })} /></td>
                  <td style={{ fontSize: 12 }}>{bad ? <span className="mh-bad">{bad}</span> : <>{giftSentence(it, U)}{nameOf(it.sku) ? <div className="muted">{nameOf(it.sku)}{it.giftSku && it.giftSku !== it.sku && nameOf(it.giftSku) ? ` → ${nameOf(it.giftSku)}` : ''}</div> : null}</>}</td>
                  <td><input className="input" value={it.note ?? ''} onChange={(e) => set(idx, { note: e.target.value || undefined })} /></td>
                  <td><button type="button" className="btn btn-xs" title="Bỏ dòng" onClick={() => onChange(items.filter((_, j) => j !== idx))}>×</button></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={12} className="muted">{find ? `Không có dòng khớp "${find}".` : 'Chưa có dòng nào — bấm "Thêm dòng", "Thêm nhiều mã từ danh mục…" hoặc "Nhập Excel…".'}</td></tr>}
          </tbody>
        </table>
        {rows.length > limit && <button type="button" className="btn btn-sm ckma-more" onClick={() => setLimit((x) => x + PAGE)}>Hiện thêm {Math.min(PAGE, rows.length - limit)} dòng</button>}
      </div>
      <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
        Mỗi dòng: mua đủ <b>SL mua</b> theo <b>ĐVT mua</b> thì được tặng <b>SL tặng</b> theo <b>ĐVT tặng</b>. Phiếu ghi ĐVT khác vẫn tính đúng (quy về ĐVT nhỏ nhất: mua 1 Thùng = 24 Lon thì phiếu 6 Lốc × 4 Lon cũng đủ).
        <b> ☑ Cộng dồn</b>: đủ mấy lần tặng mấy lần; bỏ tích = chỉ tặng một lần. <b>☑ Áp riêng</b>: mã nhận dòng này thì không nhận chương trình khác.
        Một mã nhiều dòng (vd mua 1 Thùng tặng 2 Lon, mua 5 Thùng tặng 1 bình) thì các dòng áp đồng thời — muốn chỉ lấy dòng lợi nhất thì tích Áp riêng.
      </div>
      {pick && <ChonMatHang title="Thêm mã vào bảng mua – tặng — bấm vào dòng để thêm" initial="" existing={new Map(items.map((i) => [i.sku, 'đã có']))} onClose={() => setPick(false)}
        onPick={(p) => { onChange([...items, { ...blank(), sku: p.sku }]); }}
        onPickAll={(ps) => onChange([...items, ...ps.map((p) => ({ ...blank(), sku: p.sku }))])} />}
      {excel && <NhapExcelChung<K, GiftItem> s={NHAP} onClose={() => setExcel(false)} onAdd={(list) => { setExcel(false); onChange([...items.filter((i) => i.sku), ...list]); }} />}
    </div>
  );
}

type K = 'sku' | 'buyQty' | 'buyUnit' | 'giftSku' | 'getQty' | 'getUnit' | 'repeat' | 'apply' | 'note';
const COLS: GuideColumn[] = [
  { name: 'Mã hàng mua', required: true, aliases: 'Mã hàng, Mã SP', example: '140221001', note: 'Mã trong danh mục mặt hàng' },
  { name: 'SL mua', required: true, aliases: 'Mua', example: 1, note: 'Mua đủ số này (theo ĐVT mua) thì được tặng' },
  { name: 'ĐVT mua', example: 'Thùng', note: 'Một ĐVT đã khai của mã (Lon / Lốc / Thùng…); trống = theo ĐVT trên phiếu' },
  { name: 'Mã hàng tặng', aliases: 'Mã tặng, Hàng tặng', example: '', note: 'Trống = tặng chính mã mua' },
  { name: 'SL tặng', required: true, aliases: 'Tặng', example: 2, note: 'Số được tặng (theo ĐVT tặng) mỗi lần đủ điều kiện' },
  { name: 'ĐVT tặng', example: 'Lon', note: 'ĐVT đã khai của mã tặng; trống = như ĐVT mua' },
  { name: 'Cộng dồn', example: 'có', note: '"có" (mặc định) = đủ mấy lần tặng mấy lần; "không" = chỉ tặng một lần' },
  { name: 'Áp riêng', example: 'không', note: '"có" = mã nhận dòng này thì không nhận chương trình khác' },
  { name: 'Ghi chú', example: 'CTKM tháng 11', note: 'Tuỳ ý' },
];
const SPEC: [K, string[]][] = [
  ['sku', ['ma hang mua', 'ma hang', 'ma sp']], ['buyQty', ['sl mua', 'mua']], ['buyUnit', ['dvt mua']], ['giftSku', ['ma hang tang', 'ma tang', 'hang tang']],
  ['getQty', ['sl tang', 'tang']], ['getUnit', ['dvt tang']], ['repeat', ['cong don']], ['apply', ['ap rieng']], ['note', ['ghi chu']],
];
const no = (v: string) => /^(khong|không|0|no|false|x?k)$/i.test(v.trim());
const yes = (v: string) => /^(co|có|x|1|yes|true)$/i.test(v.trim());
const num = (v: string) => Number(String(v).replace(/\s/g, '').replace(',', '.'));
const NHAP: ExcelImportSpec<K, GiftItem> = {
  title: 'Nhập bảng mua – tặng từ Excel', file: 'mau-mua-tang.xlsx', keyField: 'sku', columns: COLS, spec: SPEC,
  map: (r) => {
    const buyQty = num(r.buyQty), getQty = num(r.getQty);
    if (!(buyQty > 0)) return { error: `SL mua "${r.buyQty}" không hợp lệ` };
    if (!(getQty > 0)) return { error: `SL tặng "${r.getQty}" không hợp lệ` };
    return { value: { sku: r.sku.trim(), buyQty, buyUnit: r.buyUnit.trim(), giftSku: r.giftSku.trim(), getQty, getUnit: r.getUnit.trim(), repeat: !no(r.repeat), ...(yes(r.apply) ? { apply: 'exclusive' as const } : {}), ...(r.note.trim() ? { note: r.note.trim() } : {}) } };
  },
  check: async (list) => {
    const skus = [...new Set(list.flatMap((x) => [x.sku, x.giftSku ?? '']).filter(Boolean))];
    const units = await api.post<Units>(`${P}/units`, { skus });
    const has = (s: string, u: string) => !u || (units[s] ?? []).some((x) => lc(x.unit) === lc(u));
    return list.map((x) => {
      if (!units[x.sku]?.length) return 'mã mua chưa có trong danh mục';
      if (!has(x.sku, x.buyUnit)) return `ĐVT mua "${x.buyUnit}" chưa khai cho mã (có: ${units[x.sku]!.map((u) => u.unit).join(', ')})`;
      const g = x.giftSku || x.sku;
      if (x.giftSku && !units[x.giftSku]?.length) return 'mã tặng chưa có trong danh mục';
      if (!has(g, x.getUnit)) return `ĐVT tặng "${x.getUnit}" chưa khai cho mã ${g}`;
      return undefined;
    });
  },
  head: ['Mua mã', 'SL', 'ĐVT', 'Tặng mã', 'SL', 'ĐVT', 'Cộng dồn', 'Áp riêng'],
  cells: (x) => [x.sku, vn(x.buyQty), x.buyUnit || '(trên phiếu)', x.giftSku || '(cùng mã)', vn(x.getQty), x.getUnit || '(như ĐVT mua)', x.repeat === false ? 'không' : 'có', x.apply ? 'có' : ''],
  note: 'Đưa vào là thêm dòng vào cuối bảng. Ghi chính sách để lưu.',
};
