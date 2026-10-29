/**
 * DM Tài khoản (ACC1): lưới toàn bộ hệ thống tài khoản, mỗi cờ theo dõi / tính chất một cột ô tích.
 * Hai kiểu xem: dạng cây (mặc định, mở / thu nhánh) và dạng bảng; nhớ kiểu xem gần nhất theo người dùng.
 * Ô tìm theo số / tên và bộ lọc Cấp, Trạng thái, Sổ cái áp cho cả hai kiểu; dạng cây giữ đường dẫn tài khoản cha.
 * Thanh nút Thêm · Sửa · Xoá · Nạp · Xuất; bấm đúp dòng để sửa. Form chia ba nhóm:
 * Thông tin chung, Theo dõi chi tiết theo, Tính chất tài khoản.
 */
import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FilterX, ListTree, Table2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { AccountPicker } from '@/components/pickers';

interface Account {
  code: string; name: string; nameEn: string | null; parentCode: string | null; level: number; normalSide: string; isPosting: boolean;
  trackPartner: boolean; trackCostItem: boolean; trackDepartment: boolean; trackContract: boolean; trackEmployee: boolean; trackCase: boolean; trackProject: boolean; trackCapitalSource: boolean; trackCashflow: boolean;
  isForeignCurrency: boolean; trackProduct: boolean; trackInternalDebt: boolean; isVat: boolean; isDebt: boolean; isLoan: boolean; alwaysIncrease: boolean; isLedger: boolean; isCost: boolean;
  isActive: boolean;
}
type Flag = { [K in keyof Account]: Account[K] extends boolean ? K : never }[keyof Account];

const check = (key: Flag, header: string, width = 70, hidden = false): Column<Account> => ({ key, header, type: 'check', width, hidden });

const COLUMNS: Column<Account>[] = [
  { key: 'code', header: 'Số tài khoản', type: 'code', width: 90 },
  { key: 'parentCode', header: 'Tài khoản mẹ', type: 'code', width: 100 },
  { key: 'level', header: 'Cấp', type: 'number', width: 50 },
  { key: 'name', header: 'Tên tài khoản', width: 340, bold: (a) => !a.isPosting },
  { key: 'nameEn', header: 'Tên tài khoản EN', width: 220 },
  check('isForeignCurrency', 'Tài khoản FC', 90),
  check('trackDepartment', 'Bộ phận', 80),
  check('trackContract', 'Hợp đồng', 80),
  check('trackPartner', 'Đối tượng', 80),
  check('trackProduct', 'Sản phẩm', 75),
  check('trackCostItem', 'Khoản mục', 85),
  check('isVat', 'Acc VAT', 65),
  check('isDebt', 'Nợ', 50),
  check('isLoan', 'Vay', 50),
  { key: 'both', header: 'Lưỡng tính', type: 'check', width: 80, value: (a) => a.normalSide === 'both' },
  check('alwaysIncrease', 'Luôn tăng', 80),
  check('isLedger', 'Sổ cái', 65),
  check('isCost', 'Chi phí', 65),
  // Thêm của phần mềm: ẩn sẵn, bật ở nút "Cột".
  check('trackEmployee', 'Nhân viên', 80, true),
  check('trackCashflow', 'Lưu chuyển tiền tệ', 110, true),
  check('trackInternalDebt', 'Công nợ nội bộ', 100, true),
  check('trackCase', 'Vụ việc', 70, true),
  check('trackProject', 'Dự án', 70, true),
  check('trackCapitalSource', 'Nguồn vốn', 80, true),
  { key: 'normalSide', header: 'Số dư', width: 80, hidden: true, value: (a) => ({ debit: 'Dư Nợ', credit: 'Dư Có', both: 'Lưỡng tính' })[a.normalSide] ?? a.normalSide },
  { key: 'isPosting', header: 'Loại', width: 80, hidden: true, value: (a) => (a.isPosting ? 'Chi tiết' : 'Tổng hợp') },
  { key: 'isActive', header: 'Trạng thái', width: 110, value: (a) => (a.isActive ? 'Đang sử dụng' : 'Ngừng sử dụng') },
];

const VIEW_KEY = 'ketoan.acc1.view';
type View = 'tree' | 'table';
const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const readView = (user: string): View => { try { return localStorage.getItem(`${VIEW_KEY}.${user}`) === 'table' ? 'table' : 'tree'; } catch { return 'tree'; } };
const writeView = (user: string, v: View) => { try { localStorage.setItem(`${VIEW_KEY}.${user}`, v); } catch { /* chế độ riêng tư */ } };

export function AccountsPage() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const [editing, setEditing] = useState<Partial<Account> & { isNew?: boolean } | null>(null);
  const [sel, setSel] = useState<Account | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  // Dạng cây (mặc định) / dạng bảng, nhớ lựa chọn gần nhất theo từng người dùng.
  const [view, setViewState] = useState<View>(() => readView(user?.id ?? ''));
  const setView = (v: View) => { setViewState(v); writeView(user?.id ?? '', v); };
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'inactive'>('');
  const [ledger, setLedger] = useState<'' | 'yes' | 'no'>('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const q = useQuery({ queryKey: ['accounts', 'all'], queryFn: () => api.get<Account[]>('/api/v1/accounts', { includeInactive: true }) });
  const del = useMutation({
    mutationFn: (code: string) => api.delete(`/api/v1/accounts/${code}`),
    onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['accounts'] }); },
  });
  const remove = () => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá tài khoản ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); };

  const all = useMemo(() => [...(q.data ?? [])].sort((a, b) => a.code.localeCompare(b.code)), [q.data]);
  const filtering = Boolean(search.trim() || level || status || ledger);
  const clear = () => { setSearch(''); setLevel(''); setStatus(''); setLedger(''); };
  const levels = useMemo(() => [...new Set(all.map((a) => a.level))].sort((a, b) => a - b), [all]);
  /** Tài khoản khớp mọi điều kiện đang chọn. Số tài khoản: khớp phần đầu; tên: chứa từ khoá, không phân biệt hoa thường, dấu. */
  const matched = useMemo(() => {
    const k = fold(search.trim());
    return all.filter((a) => (!k || fold(a.code).startsWith(k) || fold(a.name).includes(k))
      && (!level || a.level === Number(level))
      && (!status || (status === 'active') === a.isActive)
      && (!ledger || (ledger === 'yes') === a.isLedger));
  }, [all, search, level, status, ledger]);

  const children = useMemo(() => {
    const m = new Map<string, Account[]>();
    for (const a of all) if (a.parentCode) m.set(a.parentCode, [...(m.get(a.parentCode) ?? []), a]);
    return m;
  }, [all]);
  // Dạng cây: tài khoản khớp cùng đường dẫn tài khoản cha; đang lọc thì mở sẵn mọi nhánh có kết quả.
  const tree = useMemo(() => {
    if (view !== 'tree') return { rows: [] as Account[], path: new Set<string>() };
    const byCode = new Map(all.map((a) => [a.code, a]));
    const keep = new Set<string>();
    const hit = new Set(matched.map((a) => a.code));
    for (const a of matched) { let c: string | null = a.code; while (c && !keep.has(c)) { keep.add(c); c = byCode.get(c)?.parentCode ?? null; } }
    const rows: Account[] = [];
    const walk = (list: Account[]) => {
      for (const a of list) {
        if (!keep.has(a.code)) continue;
        rows.push(a);
        if (filtering || open.has(a.code)) walk(children.get(a.code) ?? []);
      }
    };
    walk(all.filter((a) => !a.parentCode || !byCode.has(a.parentCode)));
    return { rows, path: new Set([...keep].filter((c) => !hit.has(c))) };
  }, [view, all, matched, children, open, filtering]);
  const toggle = (code: string) => setOpen((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  const columns: Column<Account>[] = view === 'table' ? COLUMNS : COLUMNS.map((c) => {
    const base = { ...c, noSort: true, noFilter: true };
    if (c.key !== 'name') return base;
    return {
      ...base,
      render: (a: Account) => {
        const kids = children.get(a.code)?.length ?? 0;
        const expanded = filtering || open.has(a.code);
        return (
          <span className="acc-tree" style={{ paddingLeft: (a.level - 1) * 18 }}>
            {kids ? (
              <button className="acc-caret" title={expanded ? 'Thu gọn' : 'Mở rộng'} disabled={filtering} onClick={(e) => { e.stopPropagation(); toggle(a.code); }}>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : <span className="acc-caret-gap" />}
            <span style={a.isPosting ? undefined : { fontWeight: 600 }}>{a.name}</span>
          </span>
        );
      },
    };
  });
  const rows = view === 'tree' ? tree.rows : matched;

  return (
    <>
      <PageHeader title="DM Tài khoản" code="ACC1" subtitle="Hệ thống tài khoản theo Thông tư 99/2025; chỉ tài khoản chi tiết (không có con) mới được ghi sổ" helpKey="tai-khoan" />
      <div className="card">
        <CatalogToolbar
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, normalSide: 'debit', isLedger: true, parentCode: sel?.isActive ? sel.code : undefined })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={remove}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
          extra={
            <div className="acc-seg" role="group" aria-label="Kiểu hiển thị">
              <button className={`btn btn-sm ${view === 'tree' ? 'active' : ''}`} onClick={() => setView('tree')}><ListTree size={14} /> Dạng cây</button>
              <button className={`btn btn-sm ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')}><Table2 size={14} /> Dạng bảng</button>
            </div>
          }
        />
        <div className="acc-filters">
          <input className="input" style={{ width: 260 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo số hoặc tên tài khoản" />
          <select className="select input" value={level} onChange={(e) => setLevel(e.target.value)} title="Cấp tài khoản">
            <option value="">Mọi cấp</option>{levels.map((l) => <option key={l} value={l}>Cấp {l}</option>)}
          </select>
          <select className="select input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} title="Trạng thái">
            <option value="">Mọi trạng thái</option><option value="active">Đang sử dụng</option><option value="inactive">Ngừng sử dụng</option>
          </select>
          <select className="select input" value={ledger} onChange={(e) => setLedger(e.target.value as typeof ledger)} title="Sổ cái">
            <option value="">Sổ cái: tất cả</option><option value="yes">Sổ cái: có</option><option value="no">Sổ cái: không</option>
          </select>
          {filtering && <button className="btn btn-sm" onClick={clear}><FilterX size={14} /> Xoá bộ lọc</button>}
          {view === 'tree' && !filtering && (
            <>
              <button className="btn btn-sm btn-ghost" onClick={() => setOpen(new Set(all.filter((a) => children.has(a.code)).map((a) => a.code)))}>Mở hết</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setOpen(new Set())}>Thu gọn hết</button>
            </>
          )}
          <span className="muted">{filtering ? `${matched.length} / ${all.length} tài khoản khớp` : `${all.length} tài khoản`}</span>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            key={view}
            storageKey="acc1-v3"
            exportName="danh-muc-tai-khoan"
            groupable={view === 'table'}
            exportRef={exportRef}
            rows={rows}
            rowKey={(a) => a.code}
            onSelect={setSel}
            onRowDoubleClick={(a) => canWrite && setEditing(a)}
            rowClassName={(a) => [a.isActive ? '' : 'muted', tree.path.has(a.code) ? 'acc-path' : ''].join(' ')}
            footerLabel={false}
            emptyText={all.length === 0 ? 'Chưa có dữ liệu tài khoản kế toán' : 'Không tìm thấy tài khoản phù hợp'}
            columns={columns}
          />
        )}
      </div>
      {editing && <AccountForm value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const TRACK: [Flag, string][] = [
  ['trackEmployee', 'Theo dõi theo nhân viên'],
  ['trackCashflow', 'Theo dõi theo mã lưu chuyển tiền tệ'],
  ['trackCostItem', 'Theo dõi chi tiết theo khoản mục (lý do)'],
  ['trackProduct', 'Theo dõi chi tiết theo sản phẩm'],
  ['trackPartner', 'Theo dõi chi tiết theo đối tượng công nợ'],
  ['trackContract', 'Theo dõi chi tiết theo hợp đồng'],
  ['trackDepartment', 'Theo dõi chi tiết theo bộ phận'],
  ['trackInternalDebt', 'Tài khoản công nợ nội bộ'],
];
const NATURE: [Flag, string][] = [
  ['isVat', 'Là tài khoản thuế giá trị gia tăng'],
  ['isDebt', 'Có ghi nhận công nợ'],
  ['alwaysIncrease', 'Tài khoản tài sản'],
  ['isLedger', 'Tài khoản sổ cái'],
  ['isCost', 'Tài khoản giá thành'],
];
const MORE: [Flag, string][] = [
  ['trackCase', 'Theo dõi theo vụ việc'],
  ['trackProject', 'Theo dõi theo dự án'],
  ['trackCapitalSource', 'Theo dõi theo nguồn vốn'],
  ['isLoan', 'Tài khoản vay'],
];
/**
 * Ô tích chỉ để phân loại (lưu, xuất Excel, lọc trên lưới; không đổi cách ghi sổ) hoặc chưa áp dụng — ghi chú
 * mờ cạnh ô để người dùng không tưởng tích vào là phần mềm làm khác đi.
 */
const NOTE: Partial<Record<Flag, string>> = {
  isDebt: 'bắt buộc chọn đối tượng',
  trackPartner: 'bắt buộc chọn đối tượng',
  isForeignCurrency: 'chưa áp dụng',
  trackCashflow: 'phân loại',
  trackProduct: 'phân loại',
  trackInternalDebt: 'phân loại',
  isVat: 'phân loại',
  alwaysIncrease: 'phân loại',
  isLedger: 'phân loại',
  isCost: 'phân loại',
  isLoan: 'phân loại',
};

const ALL_FLAGS: Flag[] = [...TRACK, ...NATURE, ...MORE].map(([k]) => k).concat('isForeignCurrency');

function AccountForm({ value, onClose }: { value: Partial<Account> & { isNew?: boolean }; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<Account>) => setV((x) => ({ ...x, ...p }));
  const box = (k: Flag, label: string) => (
    <label key={k} className="checkbox"><input type="checkbox" checked={Boolean(v[k])} onChange={(e) => set({ [k]: e.target.checked } as Partial<Account>)} /> <span>{label}{NOTE[k] && <span className="muted"> ({NOTE[k]})</span>}</span></label>
  );
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name: v.name, nameEn: v.nameEn || undefined, normalSide: v.normalSide };
      for (const k of ALL_FLAGS) body[k] = Boolean(v[k]);
      return value.isNew
        ? api.post('/api/v1/accounts', { ...body, code: v.code, parentCode: v.parentCode || undefined })
        : api.patch(`/api/v1/accounts/${value.code}`, { ...body, isActive: v.isActive });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['accounts'] }); if (value.isNew) onClose(); else viewAgain[1](); },
  });
  const both = v.normalSide === 'both';
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew}
      title="Thông tin tài khoản"
      onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !v.code || !v.name} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Đóng</button></>}
    >
      <fieldset className="fgroup">
        <legend>Thông tin chung</legend>
        <Field label="Số tài khoản (*)"><input className="input" value={v.code ?? ''} disabled={!value.isNew} onChange={(e) => set({ code: e.target.value.trim() })} /></Field>
        <Field label="Tài khoản mẹ" hint={value.isNew ? 'Số tài khoản con bắt đầu bằng số tài khoản mẹ' : undefined}>
          {value.isNew ? <AccountPicker value={v.parentCode ?? ''} onChange={(parentCode) => set({ parentCode })} placeholder="Trống = tài khoản cấp 1" /> : <input className="input" value={v.parentCode ?? ''} disabled />}
        </Field>
        <Field label="Tên tài khoản (*)" full><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Tên tiếng anh" full><input className="input" value={v.nameEn ?? ''} onChange={(e) => set({ nameEn: e.target.value })} /></Field>
        <div className="checks">{box('isForeignCurrency', 'Có hạch toán ngoại tệ')}</div>
      </fieldset>
      <fieldset className="fgroup">
        <legend>Theo dõi chi tiết theo</legend>
        <div className="checks">{TRACK.map(([k, l]) => box(k, l))}</div>
      </fieldset>
      <fieldset className="fgroup">
        <legend>Tính chất tài khoản</legend>
        <div className="checks">
          {box('isVat', NATURE[0]![1])}
          {box('isDebt', NATURE[1]![1])}
          <label className="checkbox"><input type="checkbox" checked={both} onChange={(e) => set({ normalSide: e.target.checked ? 'both' : 'debit' })} /> Tài khoản lưỡng tính</label>
          {NATURE.slice(2).map(([k, l]) => box(k, l))}
        </div>
        {!both && (
          <Field label="Số dư thường ở bên">
            <select className="select input" value={v.normalSide ?? 'debit'} onChange={(e) => set({ normalSide: e.target.value })}>
              <option value="debit">Nợ</option><option value="credit">Có</option>
            </select>
          </Field>
        )}
      </fieldset>
      <fieldset className="fgroup">
        <legend>Theo dõi thêm</legend>
        <div className="checks">
          {MORE.map(([k, l]) => box(k, l))}
          {!value.isNew && <label className="checkbox"><input type="checkbox" checked={v.isActive === false} onChange={(e) => set({ isActive: !e.target.checked })} /> Ngừng sử dụng</label>}
        </div>
      </fieldset>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}
