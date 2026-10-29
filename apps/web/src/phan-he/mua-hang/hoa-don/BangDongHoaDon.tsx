/**
 * Bảng dòng hàng của hoá đơn NCC — bên trái là cách NCC ghi (mã / tên / ĐVT / SL / giá / thuế), bên phải là mã + ĐVT bên mình.
 * Dòng chưa nhận diện: hiện các gợi ý (điểm giống tên, cùng quy cách) — bấm gợi ý là chọn, hoặc tự chọn mã. Chọn xong, lưu hoá đơn
 * thì phần mềm HỌC cách ghi này của NCC: lần sau tự nhận đúng mã.
 */
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { unitFor, type InvoiceLine, type ProductUnit } from '@ketoan/contracts/mua-hang';
import { api } from '@/lib/api';
import { ItemPicker } from '@/components/pickers';
import { P, vnd } from '../du-lieu';
import { MATCH_LABEL, invoiceApi } from './api';

const q = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 4 });

/** Thành tiền, tiền thuế của dòng gõ tay: SL × đơn giá − CK; thuế = thành tiền × thuế suất. */
const recalc = (l: InvoiceLine): InvoiceLine => {
  const amount = l.isGift ? 0 : Math.round(l.qty * l.price - (l.discountAmount || 0));
  return { ...l, amount, taxAmount: l.taxRate ? Math.round((amount * l.taxRate) / 100) : 0 };
};
export const blankLine = (n: number): InvoiceLine => ({ lineNo: n, nccSku: '', nccName: '', nccUnit: '', qty: 1, price: 0, discountAmount: 0, amount: 0, taxRate: 8, taxAmount: 0, isGift: false, sku: null, unit: null, matchSource: 'none' });

export function BangDongHoaDon({ lines, onChange, readOnly, editNcc, partnerCode = '', names = {} }: { lines: InvoiceLine[]; onChange?: (lines: InvoiceLine[]) => void; readOnly?: boolean; editNcc?: boolean; partnerCode?: string; names?: Record<string, string> }) {
  const latest = useRef(lines);
  latest.current = lines;
  // Gõ tay: dòng chưa có mã, chưa tra (candidates chưa có) → dừng gõ 0,5 giây thì hỏi máy chủ nhận diện. Cách ghi đã học / đã khai
  // → tự điền mã; không chắc → gợi ý. Sửa tên / mã / ĐVT NCC thì xoá kết quả cũ để tra lại.
  const pending = lines.map((l, i) => ({ l, i })).filter(({ l }) => !l.sku && l.candidates === undefined && (l.nccName.trim().length >= 3 || l.nccSku.trim().length >= 2));
  const pendingKey = `${partnerCode}|${pending.map(({ l, i }) => `${i}:${l.nccSku}:${l.nccName}:${l.nccUnit}`).join('|')}`;
  useEffect(() => {
    if (readOnly || !onChange || !pending.length) return;
    const t = setTimeout(() => {
      const asked = pending.map(({ l, i }) => ({ i, nccSku: l.nccSku, nccName: l.nccName, nccUnit: l.nccUnit }));
      void invoiceApi.prepare(partnerCode, [{ no: 'goi-y', lines: asked.map((a) => ({ nccSku: a.nccSku, nccName: a.nccName || a.nccSku, nccUnit: a.nccUnit, qty: 1 })) }]).then((res) => {
        const got = res[0]?.lines ?? [];
        const cur = latest.current;
        onChange(cur.map((l, k) => {
          const j = asked.findIndex((a) => a.i === k);
          const r = got[j];
          // Người dùng đã gõ tiếp / đã chọn mã trong lúc chờ → bỏ kết quả cũ.
          if (j < 0 || !r || l.sku || l.nccSku !== asked[j]!.nccSku || l.nccName !== asked[j]!.nccName || l.nccUnit !== asked[j]!.nccUnit) return l;
          return r.sku ? { ...l, sku: r.sku, unit: r.unit, matchSource: r.matchSource, candidates: [] } : { ...l, candidates: r.candidates ?? [] };
        }));
      }).catch(() => undefined);
    }, 500);
    return () => clearTimeout(t);
  }, [pendingKey, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const skus = [...new Set(lines.map((l) => l.sku).filter(Boolean) as string[])].sort();
  const units = useQuery({ queryKey: ['mua-hang', 'units', skus.join(',')], enabled: skus.length > 0, staleTime: 60_000, queryFn: () => api.post<Record<string, ProductUnit[]>>(`${P}/units`, { skus }) });
  // Chọn mã xong mà chưa có ĐVT: ĐVT NCC ghi trùng ĐVT đã khai của mã thì tự điền (không trùng thì để người dùng chọn — không đoán).
  useEffect(() => {
    if (readOnly || !units.data || !onChange) return;
    let changed = false;
    const next = lines.map((l) => {
      if (!l.sku || l.unit) return l;
      const u = unitFor(units.data![l.sku], l.nccUnit);
      if (!u) return l;
      changed = true;
      return { ...l, unit: u };
    });
    if (changed) onChange(next);
  }, [units.data, lines, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (i: number, patch: Partial<InvoiceLine>) => onChange?.(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const setCalc = (i: number, patch: Partial<InvoiceLine>) => onChange?.(lines.map((l, k) => (k === i ? recalc({ ...l, ...patch }) : l)));
  const num = (v: string) => Number(v.replace(/\./g, '').replace(',', '.')) || 0;
  const ed = !readOnly && editNcc;
  const txt = (i: number, k: 'nccSku' | 'nccName' | 'nccUnit', w: number) => <input className="input" style={{ width: w, height: 28 }} value={lines[i]![k]} onChange={(e) => set(i, { [k]: e.target.value, candidates: undefined })} />;
  const nb = (i: number, k: 'qty' | 'price' | 'discountAmount', w = 90) => <input className="input num" style={{ width: w, height: 28 }} value={lines[i]![k] || ''} onChange={(e) => setCalc(i, { [k]: num(e.target.value) })} />;
  const choose = (i: number, sku: string, unit?: string) => set(i, { sku: sku || null, unit: sku ? unit ?? null : null, matchSource: sku ? 'manual' : 'none' });
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="mh-mini" style={{ minWidth: 1100 }}>
        <thead>
          <tr>
            <th>#</th><th>Mã NCC</th><th>Tên hàng (NCC ghi)</th><th>ĐVT NCC</th><th className="num">SL</th><th className="num">Đơn giá chưa thuế</th><th className="num">CK</th><th className="num">Thành tiền</th><th className="num">Thuế</th>
            <th style={{ minWidth: 300 }}>Mã hàng bên mình</th><th>ĐVT bên mình</th><th>Nhận diện</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const us = l.sku ? units.data?.[l.sku] ?? [] : [];
            return (
              <tr key={i} style={!l.sku ? { background: 'var(--warn-bg, #fff7e6)' } : undefined}>
                <td>{l.lineNo}</td>
                {ed ? <>
                  <td>{txt(i, 'nccSku', 90)}</td>
                  <td>{txt(i, 'nccName', 240)}<label style={{ fontSize: 11, marginLeft: 4 }}><input type="checkbox" checked={l.isGift} onChange={(e) => setCalc(i, { isGift: e.target.checked })} /> tặng</label></td>
                  <td>{txt(i, 'nccUnit', 60)}</td>
                  <td className="num">{nb(i, 'qty', 70)}</td>
                  <td className="num">{nb(i, 'price', 100)}</td>
                  <td className="num">{nb(i, 'discountAmount', 80)}</td>
                  <td className="num">{vnd(l.amount)}</td>
                  <td className="num"><select className="select input" style={{ height: 28 }} value={l.taxRate === null ? 'kct' : String(l.taxRate)} onChange={(e) => setCalc(i, { taxRate: e.target.value === 'kct' ? null : Number(e.target.value) })}>
                    {['0', '5', '8', '10'].map((r) => <option key={r} value={r}>{r}%</option>)}<option value="kct">KCT</option></select></td>
                </> : <>
                  <td className="mono">{l.nccSku}</td>
                  <td title={l.nccName} style={{ maxWidth: 300 }}>{l.nccName}{l.isGift && <span className="badge badge-info" style={{ marginLeft: 4 }}>Tặng</span>}</td>
                  <td>{l.nccUnit}</td>
                  <td className="num">{q(l.qty)}</td>
                  <td className="num">{l.isGift ? '0' : q(l.price)}</td>
                  <td className="num">{l.discountAmount ? vnd(l.discountAmount) : ''}</td>
                  <td className="num">{vnd(l.amount)}</td>
                  <td className="num">{l.taxRate === null ? 'KCT' : `${l.taxRate}%`}</td>
                </>}
                <td>
                  {readOnly ? (l.sku ? <span><b className="mono">{l.sku}</b> {names[l.sku] ?? ''}</span> : <span className="mh-bad">chưa chọn mã</span>) : (
                    <>
                      <ItemPicker value={l.sku ?? ''} onChange={(v) => choose(i, v)} placeholder="Chọn mã bên mình…" />
                      {!l.sku && !!l.candidates?.length && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {l.candidates.map((c) => (
                            <button key={c.sku} type="button" className="btn btn-xs" title={`${c.why} — bấm để chọn`} onClick={() => choose(i, c.sku, c.unit)}>
                              {c.sku} · {c.name} <span className={c.score >= 0.75 ? 'mh-ok' : 'muted'}>{Math.round(c.score * 100)}%</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {!l.sku && l.candidates === undefined && (l.nccName.trim().length >= 3 || l.nccSku.trim().length >= 2) && <div className="muted" style={{ fontSize: 11 }}>Đang tìm gợi ý…</div>}
                      {!l.sku && l.candidates !== undefined && !l.candidates.length && <div className="muted" style={{ fontSize: 11 }}>Không có gợi ý — tìm theo tên / mã ở ô trên, hoặc khai mặt hàng mới ở DM10</div>}
                    </>
                  )}
                </td>
                <td>
                  {readOnly || !l.sku ? (l.unit ?? '') : (
                    <select className="select input" style={{ height: 28, ...(l.unit ? {} : { borderColor: 'var(--bad, #d33)' }) }} value={l.unit ?? ''} onChange={(e) => set(i, { unit: e.target.value, matchSource: 'manual' })} title="ĐVT bên mình tương ứng ĐVT NCC ghi (quy đổi theo tỉ lệ đã khai)">
                      {!us.some((u) => u.unit === l.unit) && <option value={l.unit ?? ''}>{l.unit || `— chọn ĐVT${l.nccUnit ? ` ứng với "${l.nccUnit}"` : ''} —`}</option>}
                      {us.map((u) => <option key={u.unit} value={u.unit}>{u.unit}{u.ratio !== 1 ? ` (= ${u.ratio})` : ''}</option>)}
                    </select>
                  )}
                </td>
                <td><span className={`badge ${l.sku ? (l.matchSource === 'manual' ? 'badge-info' : 'badge-ok') : 'badge-bad'}`}>{MATCH_LABEL[l.sku ? l.matchSource : 'none']}</span>
                  {ed && <button type="button" className="btn btn-xs" style={{ marginLeft: 4 }} title="Bỏ dòng" onClick={() => onChange?.(lines.filter((_, k) => k !== i).map((x, k) => ({ ...x, lineNo: k + 1 })))}>✕</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {ed && <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => onChange?.([...lines, blankLine(lines.length + 1)])}>+ Thêm dòng</button>}
    </div>
  );
}
