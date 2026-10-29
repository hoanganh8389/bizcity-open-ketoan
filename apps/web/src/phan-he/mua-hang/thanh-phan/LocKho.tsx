/**
 * LỌC CHI NHÁNH → PHÂN KHO (danh sách chứng từ): tích chi nhánh, bên dưới hiện các phân kho của chi nhánh đã tích để tích tiếp
 * (giống bảng lọc báo cáo nhập xuất tồn ACC83). Không tích gì = tất cả. Chứng từ chưa ghi kho được tính là kho mặc định của chi nhánh.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useHierarchy } from '../ton-max/api';

export interface KhoFilter { branches: string[]; warehouses: string[] }

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Kho của chứng từ để lọc: ghi kho thì kho đó, không thì kho mặc định của chi nhánh. */
export function useKhoOf() {
  const h = useHierarchy();
  return useMemo(() => {
    const def = new Map((h.data?.branches ?? []).map((b) => [b.code, (b.warehouses.find((w) => w.isDefault) ?? (b.warehouses.length === 1 ? b.warehouses[0] : undefined))?.code ?? '']));
    const name = new Map((h.data?.branches ?? []).flatMap((b) => b.warehouses.map((w) => [w.code, w.name] as const)));
    return { khoOf: (branchCode: string, warehouseCode?: string) => warehouseCode || def.get(branchCode) || '', khoName: (code: string) => name.get(code) ?? '' };
  }, [h.data]);
}

export const matchKho = (f: KhoFilter, branchCode: string, kho: string) => (!f.branches.length || f.branches.includes(branchCode)) && (!f.warehouses.length || f.warehouses.includes(kho));

export function LocKho({ value, onChange }: { value: KhoFilter; onChange: (v: KhoFilter) => void }) {
  const h = useHierarchy();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const branches = h.data?.branches ?? [];
  const q = plain(text.trim());
  const shown = branches.filter((b) => !q || plain(`${b.code} ${b.name}`).includes(q));
  const whs = branches.filter((b) => value.branches.includes(b.code)).flatMap((b) => b.warehouses.map((w) => ({ ...w, branch: b.code })));
  const tog = (arr: string[], x: string) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);
  const summary = !value.branches.length ? 'Mọi chi nhánh, mọi kho'
    : `${value.branches.length === 1 ? value.branches[0] : `${value.branches.length} chi nhánh`}${value.warehouses.length ? ` · ${value.warehouses.length === 1 ? value.warehouses[0] : `${value.warehouses.length} kho`}` : ' · mọi kho'}`;
  return (
    <div className="multi" ref={box} style={{ position: 'relative' }}>
      <button type="button" className="select input multi-btn" style={{ minWidth: 220 }} onClick={() => setOpen(!open)} title="Lọc theo chi nhánh rồi phân kho"><span>{summary}</span><ChevronDown size={14} /></button>
      {open && (
        <div className="multi-drop" style={{ width: 360 }}>
          <div className="multi-tools">
            <input className="input" placeholder="Tìm mã, tên chi nhánh…" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            <button type="button" className="btn btn-sm" onClick={() => onChange({ branches: [], warehouses: [] })}>Tất cả</button>
          </div>
          <div className="multi-list" style={{ maxHeight: 220 }}>
            {shown.slice(0, 300).map((b) => (
              <label key={b.code} className="checkbox">
                <input type="checkbox" checked={value.branches.includes(b.code)} onChange={() => {
                  const nb = tog(value.branches, b.code);
                  // Bỏ tích chi nhánh thì bỏ luôn các kho của chi nhánh đó.
                  onChange({ branches: nb, warehouses: value.warehouses.filter((w) => branches.some((x) => nb.includes(x.code) && x.warehouses.some((y) => y.code === w))) });
                }} /> <span className="mono">{b.code}</span> {b.name}
              </label>
            ))}
          </div>
          <div className="multi-foot" style={{ display: 'block' }}>
            <b>Phân kho</b> {!value.branches.length && <span className="muted">— tích chi nhánh để chọn kho</span>}
            {!!whs.length && <div className="multi-list" style={{ maxHeight: 160 }}>
              {whs.map((w) => (
                <label key={w.code} className="checkbox"><input type="checkbox" checked={value.warehouses.includes(w.code)} onChange={() => onChange({ ...value, warehouses: tog(value.warehouses, w.code) })} />
                  <span className="mono">{w.code}</span> {w.name}{w.isDefault ? <span className="muted"> (mặc định)</span> : ''}{value.branches.length > 1 ? <span className="muted"> · {w.branch}</span> : ''}</label>
              ))}
            </div>}
            {!!value.branches.length && !whs.length && <div className="muted">Chi nhánh đã tích chưa khai kho (DM12) — chứng từ tính vào kho mặc định.</div>}
            {!!value.branches.length && !!whs.length && <div className="muted" style={{ fontSize: 11 }}>Không tích kho nào = mọi kho của chi nhánh đã tích.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
