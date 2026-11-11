/**
 * Ô chọn có gợi ý cho các mã hay phải nhớ: số tài khoản, mã đối tượng, mã hàng.
 *  - Bấm vào ô là hiện danh sách "mã — tên"; gõ số hoặc chữ (có dấu, không dấu đều được) để lọc.
 *  - ↑ ↓ chọn dòng, Enter lấy dòng đang chọn, Esc đóng. Rời ô thì lấy đúng chữ đang gõ (người quen vẫn gõ tay được).
 *  - Ô đã có mã thì hiện tên mờ bên cạnh để người mới biết mình đang chọn gì.
 *  - `multiple`: danh sách mã cách nhau dấu phẩy (ví dụ nhiều tài khoản tiền); chọn thêm là nối vào cuối.
 * `onChange` chỉ gọi khi người dùng chốt (chọn dòng, Enter, rời ô) — hợp với các bộ lọc báo cáo chạy lại khi đổi.
 * [2026-11-11 Nguyễn Văn Thủy] Thêm ngay tại chỗ (đóng góp): `onAdd` hiện nút + trong ô và dòng "+ Thêm mới (F9)" ở chân danh sách —
 * lập chứng từ thiếu khách / NCC / mặt hàng thì thêm luôn, ghi xong mã mới tự điền vào ô. `columns`: danh sách xổ dạng bảng có tiêu đề
 * (Mã · Tên · MST · Địa chỉ… / Mã · Tên · ĐVT · Tồn), mỗi dòng lấy ô thêm từ `PickOption.cells`.
 */
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { workBranch } from '@/lib/workBranch';

// Form thêm nhanh mở từ nút + của ô chọn (tải khi cần, tránh vòng import với màn danh mục).
const PartnerEditor = lazy(() => import('@/features/catalog/PartnersPage').then((m) => ({ default: m.PartnerEditor })));
const ProductEditor = lazy(() => import('@/features/catalog/ProductsPage').then((m) => ({ default: m.ProductEditor })));
/** Chữ gõ trong ô chọn là mã số thuế (10 hoặc 13 số, có thể có gạch) → điền vào ô MST; còn lại điền vào tên. */
const looksTaxCode = (t: string) => /^\d{10}(-?\d{3})?$/.test(t.trim());

export interface PickOption {
  code: string;
  name: string;
  /** Chữ nhỏ bên phải: "TK tổng hợp", ĐVT, mã số thuế… */
  hint?: string;
  /** Thụt lề theo cấp (tài khoản). */
  level?: number;
  /** In đậm (tài khoản tổng hợp). */
  strong?: boolean;
  /** Ô thêm sau Mã, Tên khi ô chọn có `columns` (MST, địa chỉ, tồn…). */
  cells?: (string | number | null | undefined)[];
}

/** Cột thêm của danh sách xổ dạng bảng: tiêu đề, bề rộng (px), căn phải cho số. */
export interface PickColumn { label: string; width: number; num?: boolean }

/** Bỏ dấu tiếng Việt để gõ "tien mat" vẫn ra "Tiền mặt". */
export const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

interface BaseProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  multiple?: boolean;
  autoFocus?: boolean;
  /** Không hiện tên mờ trong ô (màn đã hiện tên ở chỗ khác). */
  hideName?: boolean;
  /** Mã là số nội bộ (ID nhóm hàng…): khi không gõ, ô hiện tên, mã hiện mờ bên phải. */
  nameFirst?: boolean;
  /** Chỉ nhận mã có trong danh sách: gõ chữ không khớp rồi rời ô / Enter thì giữ giá trị cũ (không nhận chữ lạ làm mã). */
  strict?: boolean;
  /** Thêm mới ngay tại chỗ (nút + trong ô, F9, dòng cuối danh sách); nhận chữ đang gõ để điền sẵn. */
  onAdd?: (typed: string) => void;
  /** Chữ của dòng thêm mới, mặc định "Thêm mới". */
  addLabel?: string;
}

interface CodePickerProps extends BaseProps {
  /** Danh sách gợi ý theo chữ đang gõ (đã lọc sẵn hoặc lọc phía máy chủ). */
  options: PickOption[];
  /** Tên của mã đang chọn (hiện mờ trong ô). */
  nameOf: (code: string) => string | undefined;
  /** Báo chữ đang gõ để nguồn dữ liệu lọc theo. */
  onSearch?: (q: string) => void;
  loading?: boolean;
  emptyText?: string;
  title?: string;
  /** Danh sách xổ dạng bảng: tiêu đề Mã, Tên + các cột này (ô lấy từ PickOption.cells). */
  columns?: PickColumn[];
  /** Bề rộng cột Tên khi có `columns` (mặc định 240). */
  nameWidth?: number;
}

const MAX_SHOWN = 300;
const fmtCell = (v: string | number | null | undefined) => (typeof v === 'number' ? v.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : v ?? '');

export function CodePicker({ value, onChange, options, nameOf, onSearch, loading, emptyText, placeholder, className = 'input', style, disabled, multiple, autoFocus, title, hideName, nameFirst, strict, onAdd, addLabel = 'Thêm mới', columns, nameWidth = 240 }: CodePickerProps) {
  const [text, setTextState] = useState(value);
  // Giữ chữ mới nhất ngoài state: rời ô ngay sau khi chọn dòng vẫn đọc đúng mã vừa chọn.
  const textRef = useRef(value);
  const committed = useRef(value);
  const setText = (v: string) => { textRef.current = v; setTextState(v); };
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [hasFocus, setHasFocus] = useState(false);

  // Giá trị đổi từ bên ngoài (dán từ Excel, tự điền) khi ô đang focus: hiện ngay, rời ô không ghi đè bằng chữ cũ.
  useEffect(() => { const tuNgoai = value !== committed.current; committed.current = value; if (!focused.current || tuNgoai) setText(value); }, [value]);

  // Chữ dùng để lọc: cả ô, hoặc phần sau dấu phẩy cuối khi chọn nhiều.
  const query = multiple ? (text.split(',').pop() ?? '').trim() : text.trim();
  useEffect(() => { onSearch?.(query); }, [query, onSearch]);
  const shown = options.slice(0, MAX_SHOWN);
  useEffect(() => { setActive(0); }, [query]);

  const place = () => {
    const r = input.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const tableW = columns ? 110 + nameWidth + columns.reduce((n, c) => n + c.width, 0) + 24 + columns.length * 8 : 380;
    const width = Math.min(Math.max(r.width, tableW), window.innerWidth - 16);
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: below < 260 && r.top > below ? r.top : r.bottom, width, up: below < 260 && r.top > below });
  };
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const h = () => place();
    window.addEventListener('scroll', h, true);
    window.addEventListener('resize', h);
    return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', h); };
  }, [open]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const commit = (v: string) => {
    const clean = multiple ? v.split(',').map((s) => s.trim()).filter(Boolean).join(',') : v.trim();
    if (strict && !multiple && clean && nameOf(clean) === undefined) { setText(committed.current); return; }
    setText(clean);
    if (clean !== committed.current) { committed.current = clean; onChange(clean); }
  };
  const pick = (o: PickOption) => {
    if (multiple) {
      const parts = textRef.current.split(',').map((s) => s.trim());
      parts[parts.length - 1] = o.code;
      const next = [...new Set(parts.filter(Boolean))].join(',');
      setText(next + ',');
      commit(next);
      input.current?.focus();
      return;
    }
    commit(o.code);
    setOpen(false);
    input.current?.blur();
  };

  // Thêm mới: đóng danh sách, trả ô về giá trị cũ, mở form thêm (điền sẵn chữ đang gõ).
  const add = () => { if (!onAdd) return; const q = query; setOpen(false); setText(committed.current); input.current?.blur(); onAdd(q); };
  const grid = columns ? ({ display: 'grid', gridTemplateColumns: `110px ${nameWidth}px ${columns.map((c) => `${c.width}px`).join(' ')}`, columnGap: 8 } as CSSProperties) : undefined;

  const name = value && !multiple ? nameOf(value) : undefined;
  const showName = name && !hideName && !hasFocus && !open;
  const asName = Boolean(nameFirst && showName);

  return (
    <span className={`picker${onAdd && !disabled ? ' has-add' : ''}`} style={style} title={title ?? (name ? `${value} — ${name}` : undefined)}>
      <input
        ref={input}
        className={className}
        value={asName ? name : text}
        disabled={disabled}
        placeholder={placeholder}
        autoFocus={autoFocus}
        // Ô tìm-chọn: khai là ô tìm kiếm để trình duyệt không bật gợi ý tên đăng nhập / mật khẩu đã lưu.
        type="search"
        autoComplete="off"
        data-lpignore="true"
        data-form-type="other"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        // Bấm vào ô đã có giá trị: bôi đen sẵn để gõ là thay (không nối chữ mới vào sau mã cũ rồi tìm không ra).
        onFocus={() => { focused.current = true; setHasFocus(true); setOpen(true); if (!multiple) requestAnimationFrame(() => input.current?.select()); }}
        onClick={() => setOpen(true)}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onBlur={() => { focused.current = false; setHasFocus(false); setOpen(false); commit(textRef.current); }}
        onKeyDown={(e) => {
          if (e.key === 'F9' && onAdd) { e.preventDefault(); add(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') {
            e.preventDefault();
            // Gõ đúng một mã có sẵn thì lấy luôn mã đó, không lấy dòng gợi ý đầu.
            // Gõ nhanh / quét mã: danh sách gợi ý có thể chưa kịp lọc — mã có tên trong danh mục cũng tính là khớp.
            const exact = shown.find((o) => o.code === query) ?? (!multiple && query && nameOf(query) !== undefined ? { code: query } : undefined);
            if (open && query && !exact && shown[active]) pick(shown[active]);
            else { commit(textRef.current); setOpen(false); }
          } else if (e.key === 'Escape') {
            // Danh sách gợi ý đang mở: Esc chỉ đóng danh sách (không thoát cả phiếu đang nhập); Esc lần nữa mới tới hộp thoại.
            // preventDefault: ô type="search" — Chrome tự xoá chữ khi Esc (làm mất mã đang chọn lúc rời ô).
            e.preventDefault();
            if (open) e.stopPropagation();
            setOpen(false); setText(committed.current);
          }
          else if (e.key === 'Tab' && open && query && shown[active] && !shown.some((o) => o.code === query)) { pick(shown[active]); }
        }}
      />
      {showName && <span className="picker-name">{asName ? value : name}</span>}
      {onAdd && !disabled && <button type="button" tabIndex={-1} className="picker-add" title={`${addLabel} (F9)`} onMouseDown={(e) => e.preventDefault()} onClick={add}>+</button>}
      {open && pos && !disabled && createPortal(
        <div
          ref={list}
          className="picker-drop"
          role="listbox"
          style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top + 2 } : { top: pos.top + 2 }) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {columns && (
            <div className="picker-opt picker-head" style={grid}>
              <span>Mã</span><span>Tên</span>
              {columns.map((c) => <span key={c.label} className={c.num ? 'num' : undefined}>{c.label}</span>)}
            </div>
          )}
          {shown.map((o, i) => (
            <div
              key={o.code}
              data-i={i}
              role="option"
              aria-selected={i === active}
              className={`picker-opt ${i === active ? 'active' : ''} ${o.strong ? 'strong' : ''}`}
              style={{ ...grid, ...(o.level ? { paddingLeft: 8 + (o.level - 1) * 12 } : {}) }}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
            >
              <span className="mono picker-code">{o.code}</span>
              <span className="picker-label">{o.name}</span>
              {columns
                ? columns.map((c, k) => <span key={c.label} className={`picker-cell${c.num ? ' num' : ''}`} title={String(o.cells?.[k] ?? '')}>{fmtCell(o.cells?.[k])}</span>)
                : o.hint && <span className="picker-hint">{o.hint}</span>}
            </div>
          ))}
          {shown.length === 0 && <div className="picker-empty">{loading ? 'Đang tải…' : emptyText ?? 'Không tìm thấy'}</div>}
          {options.length > MAX_SHOWN && <div className="picker-empty">Còn {options.length - MAX_SHOWN} dòng nữa — gõ thêm để thu hẹp</div>}
          <div className="picker-foot">
            {onAdd && <button type="button" className="picker-foot-add" onClick={add}>+ {addLabel}{query && !shown.some((o) => o.code === query) ? ` "${query}"` : ''} (F9)</button>}
            <span>Gõ mã hoặc tên để lọc · ↑ ↓ chọn · Enter lấy · Esc đóng</span>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ Tài khoản */

export interface AccountRow { code: string; name: string; level: number; isPosting: boolean; isActive?: boolean; trackPartner?: boolean; isDebt?: boolean }

export function useAccountList() {
  return useQuery({ queryKey: ['accounts', 'picker'], queryFn: () => api.get<AccountRow[]>('/api/v1/accounts', {}), staleTime: 5 * 60_000 });
}

/**
 * Chọn số tài khoản.
 *  - `postingOnly`: chỉ tài khoản chi tiết (ghi sổ được) — dùng khi nhập phiếu, khai báo.
 *  - Bộ lọc báo cáo để mặc định: chọn được cả tài khoản tổng hợp (111 = cộng 1111, 1112…).
 */
export function AccountPicker({ postingOnly, ...p }: BaseProps & { postingOnly?: boolean }) {
  const { data = [], isLoading } = useAccountList();
  const [q, setQ] = useState('');
  const options = useMemo(() => {
    const s = plain(q);
    return data
      // [2026-11-11 Nguyễn Văn Thủy] ô chọn tài khoản ghi sổ bỏ tài khoản ngoài bảng (loại 0): máy chủ không nhận trên bút toán Nợ / Có (đóng góp)
      .filter((a) => (!postingOnly || (a.isPosting && !a.code.startsWith('0'))) && a.isActive !== false)
      .filter((a) => !s || a.code.startsWith(s) || plain(a.name).includes(s))
      .map<PickOption>((a) => ({ code: a.code, name: a.name, level: a.level, strong: !a.isPosting, hint: a.isPosting ? (a.trackPartner || a.isDebt ? 'theo đối tượng' : undefined) : 'TK tổng hợp' }));
  }, [data, q, postingOnly]);
  const names = useMemo(() => new Map(data.map((a) => [a.code, a.name])), [data]);
  return <CodePicker {...p} options={options} nameOf={(c) => names.get(c)} onSearch={setQ} loading={isLoading} emptyText="Không có tài khoản khớp" />;
}

/* ------------------------------------------------------------------ Đối tượng */

interface PartnerRow { code: string; name: string; taxCode?: string | null; address?: string | null; phone?: string | null; mobile?: string | null }

/**
 * Chọn khách hàng / nhà cung cấp — tìm theo mã, tên hoặc mã số thuế (tìm phía máy chủ).
 * `addKind`: cho thêm nhanh ngay tại chỗ (nút +, F9) — dùng trên form chứng từ; danh sách xổ dạng bảng Mã · Tên · MST · Địa chỉ · Điện thoại.
 */
export function PartnerPicker({ activeOnly, addKind, ...p }: BaseProps & { activeOnly?: boolean; addKind?: 'customer' | 'supplier' }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const { can } = useAuth();
  const qc = useQueryClient();
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  // activeOnly: chỉ đối tượng đang theo dõi (dùng khi lập phiếu); báo cáo thì tra cả đối tượng đã khoá.
  const list = useQuery({ queryKey: ['partners', 'picker', debounced, activeOnly], queryFn: () => api.get<PartnerRow[]>('/api/v1/partners', { search: debounced, pageSize: 30, status: activeOnly ? 'active' : 'all' }), staleTime: 60_000 });
  const current = useQuery({
    queryKey: ['partners', 'picker-name', p.value],
    enabled: Boolean(p.value) && !p.multiple,
    queryFn: () => api.get<PartnerRow[]>('/api/v1/partners', { search: p.value, pageSize: 5 }),
    staleTime: 5 * 60_000,
  });
  const wide = Boolean(addKind);
  const options = useMemo(() => (list.data ?? []).map<PickOption>((x) => ({ code: x.code, name: x.name, hint: x.taxCode ?? undefined, cells: [x.taxCode, x.address, x.mobile || x.phone] })), [list.data]);
  const canAdd = Boolean(addKind) && can('catalog:write');
  return (
    <>
      <CodePicker
        {...p}
        options={options}
        nameOf={(c) => current.data?.find((x) => x.code === c)?.name ?? list.data?.find((x) => x.code === c)?.name}
        onSearch={setQ}
        loading={list.isFetching}
        emptyText="Không có đối tượng khớp"
        columns={wide ? [{ label: 'Mã số thuế', width: 110 }, { label: 'Địa chỉ', width: 260 }, { label: 'Điện thoại', width: 100 }] : undefined}
        onAdd={canAdd ? (t) => setAdding(t) : undefined}
        addLabel={addKind === 'supplier' ? 'Thêm nhà cung cấp' : 'Thêm khách hàng'}
      />
      {adding !== null && addKind && (
        <Suspense fallback={null}>
          <PartnerEditor
            kind={addKind}
            initial={adding ? (looksTaxCode(adding) ? { taxCode: adding.trim() } : { name: adding.trim() }) : undefined}
            onSaved={(code) => { void qc.invalidateQueries({ queryKey: ['partners'] }); if (code) p.onChange(code); }}
            onClose={() => setAdding(null)}
          />
        </Suspense>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ Mặt hàng */

interface ItemRow { sku: string; name: string; unit: string; stock?: number | null }

/**
 * Chọn mã hàng — tìm theo mã hoặc tên trong danh mục hàng và các mã đã có phát sinh kho.
 * Danh sách xổ dạng bảng Mã · Tên · ĐVT · Tồn (tồn của chi nhánh đang làm việc, chưa chọn thì cộng mọi chi nhánh).
 * `canAdd`: thêm mặt hàng ngay tại chỗ (nút +, F9) — dùng trên dòng chứng từ.
 */
export function ItemPicker({ canAdd, ...p }: BaseProps & { canAdd?: boolean }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const { can } = useAuth();
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const branchCode = workBranch.get() || undefined;
  const list = useQuery({ queryKey: ['inventory-items', debounced, branchCode], queryFn: () => api.get<ItemRow[]>('/api/v1/inventory/items', { search: debounced, limit: 50, branchCode }), staleTime: 60_000 });
  const current = useQuery({ queryKey: ['inventory-items', 'name', p.value], enabled: Boolean(p.value), queryFn: () => api.get<ItemRow[]>('/api/v1/inventory/items', { search: p.value, limit: 5 }), staleTime: 5 * 60_000 });
  const options = useMemo(() => (list.data ?? []).map<PickOption>((x) => ({ code: x.sku, name: x.name, hint: x.unit || undefined, cells: [x.unit, x.stock ?? null] })), [list.data]);
  return (
    <>
      <CodePicker
        {...p}
        options={options}
        nameOf={(c) => current.data?.find((x) => x.sku === c)?.name ?? list.data?.find((x) => x.sku === c)?.name}
        onSearch={setQ}
        loading={list.isFetching}
        emptyText="Không có mặt hàng khớp"
        columns={[{ label: 'ĐVT', width: 70 }, { label: branchCode ? `Tồn (${branchCode})` : 'Tồn', width: 90, num: true }]}
        nameWidth={300}
        onAdd={canAdd && can('catalog:write') ? (t) => setAdding(t) : undefined}
        addLabel="Thêm mặt hàng"
      />
      {adding !== null && (
        <Suspense fallback={null}>
          <ProductEditor sku={null} initial={adding ? { name: adding.trim() } : undefined} onSaved={(sku) => { if (sku) p.onChange(sku); }} onClose={() => setAdding(null)} />
        </Suspense>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ Danh mục nhỏ (hình thức thanh toán, lý do, loại thuế…) */

/**
 * Chọn trong một danh sách có sẵn ở trình duyệt (vài chục tới vài nghìn dòng: lý do, thuế, nhãn, cây nhóm hàng…).
 * Tìm không dấu, nhiều từ theo thứ tự tuỳ ý ("etsuko sua tam" ra "… / ETSUKO / Sữa tắm, gội"); mặc định chỉ nhận giá
 * trị có trong danh sách (strict).
 */
export function ListPicker({ items, emptyText, strict = true, ...p }: BaseProps & { items: { code: string; name: string; hint?: string }[]; emptyText?: string }) {
  const [q, setQ] = useState('');
  const options = useMemo(() => {
    const words = plain(q).split(/\s+/).filter(Boolean);
    // Vừa bấm vào ô đang có giá trị (chữ chưa đổi): hiện đủ danh sách để chọn dòng khác, không lọc theo chính giá trị đó.
    if (!words.length || (p.value && q.trim() === p.value)) return items;
    const s = words.join(' ');
    const hit = items.filter((x) => { const t = `${plain(x.code)} ${plain(x.name)}`; return words.every((w) => t.includes(w)); });
    // Mã đúng / bắt đầu bằng chữ gõ lên đầu.
    return hit.sort((a, b) => Number(plain(b.code) === s) - Number(plain(a.code) === s) || Number(plain(b.code).startsWith(s)) - Number(plain(a.code).startsWith(s)));
  }, [items, q, p.value]);
  const names = useMemo(() => new Map(items.map((x) => [x.code, x.name])), [items]);
  return <CodePicker {...p} strict={strict} options={options} nameOf={(c) => names.get(c)} onSearch={setQ} emptyText={emptyText} />;
}
