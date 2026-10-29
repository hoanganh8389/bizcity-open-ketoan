/**
 * Ô lọc dùng chung: kỳ xem (chọn nhanh + từ ngày, đến ngày), chi nhánh (chọn một hoặc nhiều).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ListPicker } from './pickers';
import { ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { PERIOD_PRESETS, rememberPeriod } from '@/lib/format';
import { useFilterPanel } from './filterPanel';
import { PanelBranchList } from './ReportPanel';

/**
 * Khoảng ngày kèm ô "Kỳ" chọn nhanh (tháng này, tháng trước, quý, năm…).
 * Kỳ vừa chọn được nhớ lại để các báo cáo mở sau dùng cùng kỳ.
 */
export function DateRange({ from, to, onChange, remember = true }: { from: string; to: string; onChange: (from: string, to: string) => void; remember?: boolean }) {
  const preset = PERIOD_PRESETS.find((p) => { const [a, b] = p.range(); return a === from && b === to; })?.key ?? '';
  // remember={false}: màn nhập phiếu có khoảng ngày riêng, không lấy và không ghi đè kỳ của báo cáo.
  const change = (a: string, b: string) => { if (remember) rememberPeriod(a, b); onChange(a, b); };
  return (
    <>
      <div className="field">
        <label>Kỳ</label>
        <select className="select input" style={{ width: 130 }} value={preset} onChange={(e) => { const p = PERIOD_PRESETS.find((x) => x.key === e.target.value); if (p) change(...p.range()); }}>
          <option value="">Tuỳ chọn</option>
          {PERIOD_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Từ ngày</label>
        <input type="date" className="input w-md" value={from} onChange={(e) => change(e.target.value, to)} />
      </div>
      <div className="field">
        <label>Đến ngày</label>
        <input type="date" className="input w-md" value={to} min={from} onChange={(e) => change(from, e.target.value)} />
      </div>
    </>
  );
}

export interface BranchOption { code: string; name: string; isActive: boolean }

export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => api.get<BranchOption[]>('/api/v1/branches'), staleTime: 60_000 });
}

/**
 * Chọn chi nhánh.
 *  - Mặc định chọn được NHIỀU chi nhánh: `value` là các mã cách nhau dấu phẩy, rỗng = tất cả.
 *  - `multiple={false}`: chỉ chọn một (dùng ở màn danh sách chứng từ, phiếu).
 */
/** warehouses: màn có lọc theo kho — trong bảng lọc hiện thêm ô "Mã kho" dưới danh sách chi nhánh. */
export function BranchSelect({ value, onChange, label = 'Chi nhánh', multiple = true, warehouses }: { value: string; onChange: (v: string) => void; label?: string; multiple?: boolean; warehouses?: { value: string; onChange: (v: string) => void } }) {
  const { data = [] } = useBranches();
  // Trong bảng lọc bên trái: danh sách tích chọn, áp dụng khi bấm Tìm kiếm.
  const inPanel = useFilterPanel() !== null;
  if (multiple && inPanel) return <PanelBranchList value={value} onChange={onChange} warehouses={warehouses} />;
  if (!multiple) {
    return (
      <div className="field">
        <label>{label}</label>
        <BranchPicker value={value} onChange={onChange} placeholder="Tất cả chi nhánh" className="input w-lg" />
      </div>
    );
  }
  return <BranchMultiSelect value={value} onChange={onChange} label={label} branches={data} />;
}

/**
 * Ô chọn MỘT chi nhánh: gõ mã hoặc tên để tìm (hàng trăm chi nhánh), ô hiện "mã" kèm tên mờ.
 *  - activeOnly: chỉ chi nhánh đang dùng (vẫn giữ chi nhánh đang chọn dù đã ngừng).
 *  - placeholder: chữ khi để trống (ví dụ "Tất cả chi nhánh", "Dùng chung").
 */
export function BranchPicker({ value, onChange, placeholder = 'Gõ mã hoặc tên chi nhánh', activeOnly = false, disabled, className, style }: {
  value: string; onChange: (v: string) => void; placeholder?: string; activeOnly?: boolean; disabled?: boolean; className?: string; style?: React.CSSProperties;
}) {
  const { data = [] } = useBranches();
  const items = useMemo(() => data.filter((b) => !activeOnly || b.isActive || b.code === value).map((b) => ({ code: b.code, name: b.isActive ? b.name : `${b.name} (ngừng)` })), [data, activeOnly, value]);
  return <ListPicker items={items} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} className={className} style={style} emptyText="Không thấy chi nhánh nào" />;
}

export function BranchMultiSelect({ value, onChange, label, branches }: { value: string; onChange: (v: string) => void; label: string; branches: BranchOption[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const picked = useMemo(() => (value ? value.split(',') : []), [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = (code: string) => onChange((picked.includes(code) ? picked.filter((c) => c !== code) : [...picked, code]).join(','));
  const q = text.trim().toLowerCase();
  const shown = branches.filter((b) => !q || b.code.toLowerCase().includes(q) || b.name.toLowerCase().includes(q));
  const summary = picked.length === 0 ? 'Tất cả chi nhánh' : picked.length === 1 ? `${picked[0]} — ${branches.find((b) => b.code === picked[0])?.name ?? ''}` : `${picked.length} chi nhánh: ${picked.join(', ')}`;

  return (
    <div className="field multi" ref={box}>
      <label>{label}</label>
      <button type="button" className="select input w-lg multi-btn" onClick={() => setOpen((x) => !x)} aria-haspopup="listbox" aria-expanded={open} title={summary}>
        <span>{summary}</span><ChevronDown size={14} />
      </button>
      {open && (
        <div className="multi-drop" role="listbox" aria-multiselectable="true">
          <div className="multi-tools">
            <input className="input" placeholder="Tìm mã hoặc tên…" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            <button type="button" className="btn btn-sm" onClick={() => onChange('')}>Tất cả</button>
            {shown.length < branches.length && shown.length > 0 && <button type="button" className="btn btn-sm" onClick={() => onChange([...new Set([...picked, ...shown.map((b) => b.code)])].join(','))}>Chọn các dòng tìm thấy</button>}
          </div>
          <div className="multi-list">
            {shown.map((b) => (
              <label key={b.code} className="checkbox">
                <input type="checkbox" checked={picked.includes(b.code)} onChange={() => toggle(b.code)} />
                <span className="mono">{b.code}</span> {b.name}{!b.isActive && <span className="muted"> (ngừng)</span>}
              </label>
            ))}
            {shown.length === 0 && <div className="muted" style={{ padding: 8 }}>Không thấy chi nhánh nào</div>}
          </div>
          <div className="multi-foot">{picked.length === 0 ? 'Chưa đánh dấu chi nhánh nào = xem tất cả' : `Đang chọn ${picked.length} chi nhánh`}</div>
        </div>
      )}
    </div>
  );
}

/** Ô tìm nhanh trên danh mục (lọc phía trình duyệt). */
export function SearchFilter({ value, onChange, placeholder = 'Mã, tên' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="field"><label>Tìm</label><input className="input w-lg" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>;
}

/** Lọc dòng theo chuỗi tìm (không phân biệt hoa thường, khớp một phần). */
export function searchRows<T>(rows: T[] | undefined, q: string, text: (r: T) => string): T[] {
  const s = q.trim().toLowerCase();
  return (rows ?? []).filter((r) => !s || text(r).toLowerCase().includes(s));
}
