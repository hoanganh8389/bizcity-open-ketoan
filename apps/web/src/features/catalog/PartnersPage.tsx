/**
 * Đối tượng (DM03: khách hàng, nhà cung cấp, nhân viên, nội bộ…) và nhóm đối tượng (DM08).
 * Lưới theo thứ tự cột của danh mục khách hàng: Mã KH, Tên KH, Địa chỉ NR, Điện thoại, Di động, Nhóm KH, Người đại diện,
 * Địa chỉ cty, MST, Fax, Email, Website, Chức vụ, Ngày tạo KH, Theo dõi, Người QL, Chi nhánh QL, Ghi chú, Tên viết tắt,
 * Tên công ty, Tài khoản NH, Chủ TK, Mở tại, Giới hạn nợ, Giới hạn ngày nợ, Giới hạn số phiếu nợ, Người tạo.
 * Form theo màn "Khách hàng / Nhà cung cấp" HTsoft: Thuộc kiểu ở đầu; ba thẻ Thông tin chung · Mua bán hàng (công nợ, tài khoản)
 * · Nội bộ quản lý; mã tự nhảy theo dãy mã của nhóm, tạo mới trùng mã bị chặn, hỏi khi số điện thoại / MST đã có.
 * Đối tượng tự tạo khi chứng từ gửi kèm thông tin khách, hoặc đồng bộ qua API (PUT /api/v1/partners);
 * chứng từ gửi sang không ghi đè thông tin kế toán bổ sung.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText, ALL_ROWS } from '@/lib/api';
import { money } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { ListPicker } from '@/components/pickers';
import { useBranches } from '@/components/filters';

interface Partner {
  code: string; name: string; kind: string; taxCode: string | null; address: string | null; email: string | null; phone: string | null;
  groupCode: string | null; isActive: boolean; paymentTermDays: number | null; creditLimit: number | null; note: string;
  contactName: string; bankAccountNo: string; bankAccountHolder: string; bankName: string; maxOpenDocs: number | null;
  mobile: string; fax: string; website: string; position: string; companyName: string; companyAddress: string; shortName: string;
  managerCode: string | null; branchCode: string | null; createdAt: string | null; createdBy: string; createdTime?: string | null; alsoKinds?: string[];
  birthDate: string | null; gender: string; alias: string; isProspect: boolean; customerType: string;
}
interface Group { code: string; name: string; parentCode: string | null; kind: string; note: string; isActive: boolean; partners: number }
interface Dim { code: string; name: string; isActive: boolean }
const KIND: Record<string, string> = { customer: 'Khách hàng', supplier: 'Nhà cung cấp', employee: 'Nhân viên', internal: 'Nội bộ', other: 'Khác' };
const useGroups = () => useQuery({ queryKey: ['partner-groups'], queryFn: () => api.get<Group[]>('/api/v1/partner-groups'), staleTime: 60_000 });
const useEmployees = () => useQuery({ queryKey: ['dimensions', 'employee'], queryFn: () => api.get<Dim[]>('/api/v1/dimensions/employee'), staleTime: 60_000 });
const num = (s: string) => { const v = s.replace(/[^\d]/g, ''); return v === '' ? null : Number(v); };

/** Màn tách riêng theo kiểu đối tượng: tiêu đề, mã màn, chữ viết tắt trên tên cột. */
const SCREENS: Record<string, { title: string; code: string; subtitle: string; abbr: string }> = {
  customer: { title: 'Khách hàng', code: 'DM12', subtitle: 'Đối tượng kiểu khách hàng: khách mua buôn, khách lẻ, cửa hàng đối tác', abbr: 'KH' },
  supplier: { title: 'Nhà cung cấp', code: 'DM13', subtitle: 'Đối tượng kiểu nhà cung cấp: NCC hàng hoá, tài sản / dịch vụ, chủ nhà, cơ quan nhà nước', abbr: 'NCC' },
};

/**
 * Danh sách đối tượng. fixedKind: màn tách riêng một kiểu (Khách hàng DM12, Nhà cung cấp DM13) — chỉ hiện
 * đối tượng kiểu đó, lọc nhóm theo kiểu, thêm mới mặc định "Thuộc kiểu" là kiểu của màn.
 */
export function PartnersPage({ fixedKind }: { fixedKind?: 'customer' | 'supplier' } = {}) {
  const screen = fixedKind ? SCREENS[fixedKind] : undefined;
  const abbr = screen?.abbr ?? 'KH';
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [f, setF] = useState({ groupCode: '', kind: fixedKind ?? '', status: 'all' });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<(Partial<Partner> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<Partner | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const groups = useGroups();
  const employees = useEmployees();
  // ?them=1: mở thẳng form thêm mới (nút "+" chọn đối tượng ở trang quản trị).
  useEffect(() => {
    if (canWrite && new URLSearchParams(window.location.search).get('them') === '1') {
      setEditing({ isNew: true, kind: fixedKind ?? 'customer', isActive: true, groupCode: null });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const params = { search: applied, page, pageSize: ALL_ROWS, groupCode: f.groupCode || undefined, kind: f.kind || undefined, status: f.status };
  const q = useQuery({ queryKey: ['partners', params], queryFn: () => api.getPage<Partner[]>('/api/v1/partners', params), placeholderData: keepPreviousData });
  const groupChoices = (groups.data ?? []).filter((g) => !fixedKind || g.kind === 'any' || g.kind === fixedKind);
  const groupName = (c: string | null) => (c ? groups.data?.find((g) => g.code === c)?.name ?? c : '');
  const empName = (c: string | null) => (c ? employees.data?.find((e) => e.code === c)?.name ?? c : '');
  const set = (patch: Partial<typeof f>) => { setF((x) => ({ ...x, ...patch })); setPage(1); };
  const del = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/partners/${encodeURIComponent(code)}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['partners'] }); } });

  const columns: Column<Partner>[] = [
    { key: 'code', header: `Mã ${abbr}`, type: 'code', width: 120 },
    { key: 'name', header: `Tên ${abbr}`, width: 240 },
    { key: 'address', header: 'Địa chỉ NR', width: 220 },
    { key: 'phone', header: 'Điện thoại', type: 'code', width: 110 },
    { key: 'mobile', header: 'Di động', type: 'code', width: 110 },
    { key: 'groupCode', header: `Nhóm ${abbr}`, width: 150, value: (p) => groupName(p.groupCode) },
    { key: 'contactName', header: 'Người đại diện', width: 150 },
    { key: 'companyAddress', header: 'Địa chỉ cty', width: 220 },
    { key: 'taxCode', header: 'MST', type: 'code', width: 120 },
    { key: 'fax', header: 'Fax', type: 'code', width: 100 },
    { key: 'email', header: 'Email', width: 170 },
    { key: 'website', header: 'Website', width: 150 },
    { key: 'position', header: 'Chức vụ', width: 120 },
    { key: 'createdAt', header: `Ngày tạo ${abbr}`, type: 'date', width: 100 },
    { key: 'isActive', header: 'Theo dõi', type: 'check', width: 70 },
    { key: 'managerCode', header: 'Người QL', width: 150, value: (p) => empName(p.managerCode) },
    { key: 'branchCode', header: 'Chi nhánh QL', type: 'code', width: 120 },
    { key: 'note', header: 'Ghi chú', width: 180 },
    { key: 'shortName', header: 'Tên viết tắt', width: 120 },
    { key: 'companyName', header: 'Tên công ty', width: 220 },
    { key: 'bankAccountNo', header: 'Tài khoản NH', type: 'code', width: 130 },
    { key: 'bankAccountHolder', header: 'Chủ TK', width: 160 },
    { key: 'bankName', header: 'Mở tại', width: 180 },
    { key: 'creditLimit', header: 'Giới hạn nợ', type: 'money', width: 120 },
    { key: 'paymentTermDays', header: 'Giới hạn ngày nợ', type: 'number', width: 110 },
    { key: 'maxOpenDocs', header: 'Giới hạn số phiếu nợ', type: 'number', width: 130 },
    { key: 'createdBy', header: 'Người tạo', width: 120 },
    // Vai trò: hiện rõ đối tượng vừa là NCC vừa là khách hàng (cùng một mã nằm ở cả hai danh sách).
    { key: 'kind', header: 'Vai trò', width: 170, value: (p) => [KIND[p.kind] ?? p.kind, ...(p.alsoKinds ?? []).map((k) => KIND[k] ?? k)].join(' + ') },
  ];

  return (
    <>
      <PageHeader title={screen?.title ?? 'Đối tượng'} code={screen?.code ?? 'DM03'} subtitle={screen?.subtitle ?? 'Khách hàng, nhà cung cấp, nhân viên, đơn vị nội bộ'} helpKey="doi-tuong" />
      <div className="card">
        <CatalogToolbar
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, kind: fixedKind ?? sel?.kind ?? 'customer', isActive: true, groupCode: sel?.groupCode ?? null })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá đối tượng ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); }}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
          extra={
            <>
              <span className="spacer" />
              <form className="row" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); setPage(1); }}>
                <input className="input" style={{ width: 230, height: 30 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm nhanh: mã, tên, MST, điện thoại" />
                <button className="btn btn-sm" type="submit">Tìm</button>
              </form>
              <ListPicker className="input w-md" items={[{ code: '-', name: '(Chưa có nhóm)' }, ...groupChoices.map((g) => ({ code: g.code, name: g.name }))]} value={f.groupCode} onChange={(groupCode) => set({ groupCode })} placeholder="Tất cả nhóm" />
              {!fixedKind && (
                <select className="select input" style={{ height: 30 }} value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
                  <option value="">Mọi loại</option>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              )}
              <select className="select input" style={{ height: 30 }} value={f.status} onChange={(e) => set({ status: e.target.value })}>
                <option value="all">Tất cả</option><option value="active">Đang theo dõi</option><option value="inactive">Đã khoá</option>
              </select>
            </>
          }
        />
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey={`${(screen?.code ?? 'DM03').toLowerCase()}-v2`}
            exportName={screen ? { customer: 'khach-hang', supplier: 'nha-cung-cap' }[fixedKind!] : 'doi-tuong'}
            groupable
            exportRef={exportRef}
            rows={q.data?.data ?? []}
            rowKey={(p) => p.code}
            onSelect={setSel}
            onRowDoubleClick={(p) => canWrite && setEditing(p)}
            rowClassName={(p) => (p.isActive ? '' : 'muted')}
            footerLabel={false}
            note="tìm nhanh, lọc ở trên tải lại từ máy chủ"
            columns={columns}
          />
        )}
      </div>
      {editing && <PartnerForm value={editing} groups={groups.data ?? []} employees={employees.data ?? []} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Gợi ý mã mới của API: theo dãy mã của nhóm, của loại, hoặc tiền tố mặc định. */
interface NextCode { code: string; basis: 'group' | 'kind' | 'default'; series: string | null; count: number }
const NOUN: Record<string, string> = { customer: 'khách hàng', supplier: 'nhà cung cấp', employee: 'nhân viên', internal: 'đơn vị nội bộ', other: 'đối tượng' };
/**
 * Form đối tượng DÙNG CHUNG — nơi duy nhất khai / sửa thông tin gốc của NCC (tên, MST, địa chỉ, nhóm, tài khoản, liên hệ).
 * Hồ sơ NCC (phân hệ Mua hàng) mở đúng form này. code trống = thêm mới.
 */
export function PartnerEditor({ code, kind = 'supplier', onClose }: { code?: string; kind?: 'customer' | 'supplier'; onClose: () => void }) {
  const groups = useGroups();
  const employees = useEmployees();
  const q = useQuery({ queryKey: ['partner-one', code], queryFn: () => api.get<Partner[]>('/api/v1/partners', { search: code, status: 'all', pageSize: 50 }), enabled: Boolean(code) });
  if (code && !q.data) return null;
  const value = code ? q.data?.find((p) => p.code === code) : undefined;
  if (code && !value) return null;
  return <PartnerForm value={value ?? { isNew: true, kind, isActive: true, groupCode: null }} groups={groups.data ?? []} employees={employees.data ?? []} onClose={onClose} />;
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const todayText = () => new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Form đối tượng theo màn "Khách hàng / Nhà cung cấp" của HTsoft (frmKhachhang2):
 *   - Thuộc kiểu, Thuộc nhóm, Mã bắt buộc; tạo mới: chọn nhóm (hoặc đổi kiểu) thì mã tự nhảy theo dãy mã của nhóm
 *     (GET /partners/next-code), trừ khi người dùng đã tự gõ mã; nút "Lấy mã mới" lấy lại;
 *   - tạo mới gõ Mobile / Telephone / Mã số thuế đã có ở đối tượng khác: hỏi có mở đối tượng đó để sửa không;
 *   - tạo mới gửi POST (mã trùng → báo lỗi, không ghi đè), sửa gửi PUT.
 */
function PartnerForm({ value, groups, employees, onClose }: { value: Partial<Partner> & { isNew?: boolean }; groups: Group[]; employees: Dim[]; onClose: () => void }) {
  const qc = useQueryClient();
  const branches = useBranches().data ?? [];
  // Nhà cung cấp là doanh nghiệp: MỘT bộ tên / địa chỉ chính thức (đúng trên hoá đơn) — mở form lấy khối công ty trước.
  const [v, setV] = useState<Partial<Partner>>(() => {
    const x: Partial<Partner> = { kind: 'customer', isActive: true, ...value };
    return x.kind === 'supplier' ? { ...x, name: x.companyName || x.name, address: x.companyAddress || x.address } : x;
  });
  const [isNew, setIsNew] = useState(Boolean(value.isNew));
  const [codeTouched, setCodeTouched] = useState(Boolean(value.code));
  const [codeHint, setCodeHint] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const [tab, setTab] = useState<'general' | 'trade' | 'internal'>('general');
  const set = (p: Partial<Partner>) => setV((x) => ({ ...x, ...p }));
  const kind = v.kind ?? 'customer';
  const noun = NOUN[kind] ?? 'đối tượng';
  const choices = groups.filter((g) => (g.isActive && (g.kind === 'any' || g.kind === kind)) || g.code === v.groupCode);
  const txt = (k: keyof Partner, label: string, full = false, mono = false, onBlur?: (val: string) => void) => (
    <Field label={label} full={full}><input className={`input ${mono ? 'mono' : ''}`} value={String(v[k] ?? '')} onChange={(e) => set({ [k]: e.target.value } as Partial<Partner>)} onBlur={onBlur ? (e) => onBlur(e.target.value.trim()) : undefined} /></Field>
  );

  // Mã mới theo nhóm / kiểu (như HTsoft: đổi nhóm thì sinh lại mã). Đổi nhóm liên tục: chỉ nhận kết quả của lần gọi sau cùng.
  const codeReq = useRef(0);
  const fetchCode = async (groupCode: string | null | undefined, k: string, force = false) => {
    if (!isNew || (codeTouched && !force)) return;
    const seq = ++codeReq.current;
    try {
      const r = await api.get<NextCode>('/api/v1/partners/next-code', { groupCode: groupCode || undefined, kind: k });
      if (seq !== codeReq.current) return;
      setV((x) => ({ ...x, code: r.code }));
      setCodeTouched(false);
      setCodeHint(r.basis === 'group' ? `Nối dãy ${r.series} của nhóm (${r.count} mã)` : r.basis === 'kind' ? `Nối dãy ${r.series} của ${NOUN[k] ?? 'đối tượng'} (${r.count} mã)` : 'Chưa có dãy mã để nối, dùng tiền tố mặc định');
    } catch { /* không lấy được thì để người dùng tự gõ */ }
  };
  useEffect(() => { if (isNew && !value.code) void fetchCode(v.groupCode, kind, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changeKind = (k: string) => {
    const keepGroup = groups.some((g) => g.code === v.groupCode && (g.kind === 'any' || g.kind === k));
    const groupCode = keepGroup ? v.groupCode : null;
    set({ kind: k, groupCode });
    void fetchCode(groupCode, k);
  };
  const changeGroup = (groupCode: string | null) => { set({ groupCode }); void fetchCode(groupCode, kind); };

  // Đã có đối tượng dùng số điện thoại / mã số thuế này: hỏi mở đối tượng đó (SearchKhachHangByCallerID / ByMST của HTsoft).
  const checkDuplicate = async (field: 'phone' | 'taxCode', val: string, label: string) => {
    // Mã số thuế là duy nhất: đang sửa đối tượng đã có mà đổi sang MST của đối tượng khác thì báo ngay (Ghi sẽ bị từ chối).
    if (!isNew && field === 'taxCode' && val && val !== (value.taxCode ?? '').trim()) {
      const other = (await api.get<Partner[]>('/api/v1/partners/lookup', { taxCode: val, exclude: v.code }).catch(() => []))[0];
      if (other) window.alert(`Mã số thuế ${val} đã có ở ${NOUN[other.kind] ?? 'đối tượng'} ${other.code} - ${other.name}. Mỗi mã số thuế chỉ dùng cho một đối tượng.`);
      return;
    }
    if (!isNew || !val) return;
    const found = await api.get<Partner[]>('/api/v1/partners/lookup', { [field]: val }).catch(() => []);
    const p = found[0];
    if (p && window.confirm(`${label} ${val} đã có ở ${NOUN[p.kind] ?? 'đối tượng'} ${p.code} - ${p.name}. Mở ${p.code} để sửa?`)) {
      setV(p);
      setIsNew(false);
      setCodeHint('');
    }
  };

  const validate = () => {
    const bad: string[] = [];
    if (!v.kind) bad.push('Thuộc kiểu');
    // Bắt buộc nhóm khi thêm mới (như HTsoft); đối tượng cũ chưa có nhóm (khách tự tạo từ máy bán hàng) vẫn sửa được.
    if (isNew && choices.length && !v.groupCode) bad.push('Thuộc nhóm');
    if (!v.code?.trim()) bad.push(`Mã ${noun}`);
    if (v.email?.trim() && !isEmail(v.email.trim())) bad.push('Email không hợp lệ');
    setInvalid(bad);
    return !bad.length;
  };

  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => {
      const code = (v.code ?? '').trim();
      const body = {
        name: v.name ?? '', kind, taxCode: v.taxCode?.trim() || undefined, address: v.address || undefined, email: v.email?.trim() || undefined, phone: v.phone?.trim() || undefined,
        groupCode: v.groupCode || null, isActive: v.isActive ?? true, paymentTermDays: v.paymentTermDays ?? null, creditLimit: v.creditLimit ?? null, note: v.note ?? '',
        contactName: v.contactName ?? '', bankAccountNo: v.bankAccountNo ?? '', bankAccountHolder: v.bankAccountHolder ?? '', bankName: v.bankName ?? '', maxOpenDocs: v.maxOpenDocs ?? null,
        mobile: v.mobile ?? '', fax: v.fax ?? '', website: v.website ?? '', position: v.position ?? '', shortName: v.shortName ?? '',
        companyName: kind === 'supplier' ? v.name ?? '' : v.companyName ?? '', companyAddress: kind === 'supplier' ? v.address ?? '' : v.companyAddress ?? '',
        managerCode: v.managerCode || null, branchCode: v.branchCode || null,
        birthDate: v.birthDate || null, gender: v.gender ?? '', alias: v.alias ?? '', isProspect: v.isProspect ?? false, customerType: v.customerType ?? '',
        alsoKinds: (v.alsoKinds ?? []).filter((k) => k !== kind && (k === 'customer' || k === 'supplier')),
      };
      return isNew ? api.post('/api/v1/partners', { code, ...body }) : api.put(`/api/v1/partners/${encodeURIComponent(code)}`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['partners'] }); void qc.invalidateQueries({ queryKey: ['partner-groups'] });
      // Đang nằm trong khung của trang quản trị → báo mã đối tượng vừa lưu để bên đó chọn luôn.
      // Mở từ nút "+" NCC của phiếu nhập (cửa sổ riêng) → báo cửa sổ phiếu để tải lại NCC và chọn luôn.
      if (window.opener) window.opener.postMessage({ type: 'ketoan:partner-saved', code: (v.code ?? '').trim(), kind }, '*');
      if (isNew) onClose(); else viewAgain[1]();
    },
  });
  const submit = () => { if (validate()) save.mutate(); };
  const half = { gridColumn: 'span 2', alignSelf: 'start' } as const;

  return (
    <Modal viewAgain={viewAgain} viewFirst={!isNew} wide title="Khách hàng / Nhà cung cấp" onClose={onClose}
      footer={<>
        <label className="checkbox chk-explain"><input type="checkbox" checked={v.isActive ?? true} onChange={(e) => set({ isActive: e.target.checked })} /> <span><b>{kind === 'supplier' ? 'Đang giao dịch' : 'Theo dõi'}</b><small>{(v.isActive ?? true) ? 'Đang dùng — hiện trong ô chọn khi lập phiếu' : 'Ngừng — không hiện khi lập phiếu mới, số liệu cũ giữ nguyên'}</small></span></label>
        <span className="muted" data-view-ok style={{ marginRight: 'auto', fontSize: 12 }}>{isNew ? 'Tạo mới' : `Tạo bởi ${v.createdBy || '—'}${v.createdTime ? ` lúc ${new Date(v.createdTime).toLocaleString('vi-VN', { hour12: false })}` : v.createdAt ? ` ngày ${new Date(v.createdAt).toLocaleDateString('vi-VN')}` : ''}`}</span>
        <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button>
      </>}>
      <div className="full row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface-2, #eef1f5)', padding: '6px 10px', borderRadius: 6 }}>
        {(() => {
          // VAI TRÒ — một chỗ, nói thẳng: Nhà cung cấp (bán cho mình) / Khách hàng (mua của mình), tích một hoặc cả hai.
          // Lưu: kind = vai trò chính (có NCC thì NCC), also_kinds = vai trò thêm. Loại khác (nhân viên, nội bộ…) chọn riêng.
          const sup = kind === 'supplier' || (v.alsoKinds ?? []).includes('supplier');
          const cus = kind === 'customer' || (v.alsoKinds ?? []).includes('customer');
          const setRoles = (s2: boolean, c2: boolean) => {
            if (!s2 && !c2) return; // phải có ít nhất một vai trò
            const k = s2 ? 'supplier' : 'customer';
            if (k !== kind) changeKind(k);
            set({ kind: k, alsoKinds: s2 && c2 ? ['customer'] : [] });
          };
          const role = (on: boolean, label: string, what: string, onChange: (x: boolean) => void) => (
            <label className={`role-chk ${on ? 'on' : ''}`}><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /> <span><b>{label}</b><small>{what}</small></span></label>
          );
          const other = kind !== 'supplier' && kind !== 'customer';
          return <>
            <b>Đối tượng này là <span className="neg">*</span></b>
            {role(sup && !other, 'Nhà cung cấp', 'bán hàng cho mình — dùng ở phiếu mua', (x) => (other ? (changeKind('supplier'), set({ kind: 'supplier', alsoKinds: [] })) : setRoles(x, cus)))}
            {role(cus && !other, 'Khách hàng', 'mua hàng của mình — dùng ở phiếu bán', (x) => (other ? (changeKind('customer'), set({ kind: 'customer', alsoKinds: [] })) : setRoles(sup, x)))}
            <select className="select input" style={{ width: 170 }} value={other ? kind : ''} title="Đối tượng không phải khách hàng / nhà cung cấp" onChange={(e) => { if (e.target.value) { changeKind(e.target.value); set({ kind: e.target.value, alsoKinds: [] }); } }}>
              <option value="">Loại khác…</option>{Object.entries(KIND).filter(([k]) => k !== 'customer' && k !== 'supplier').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {sup && cus && !other && <span className="role-note">Vừa bán vừa mua: hiện ở cả danh sách nhà cung cấp và khách hàng (cùng một mã); công nợ phải trả (331) và phải thu (131) theo dõi riêng</span>}
          </>;
        })()}
        {!isNew && <span className="muted">Sửa {noun} {v.code}</span>}
      </div>
      {kind === 'supplier' && <NccFields v={v} set={set} txt={txt} choices={choices} isNew={isNew} codeHint={codeHint} noun={noun}
        changeGroup={changeGroup} fetchCode={() => void fetchCode(v.groupCode, kind, true)} setCode={(c) => { set({ code: c }); setCodeTouched(true); }} checkDuplicate={checkDuplicate} />}
      {kind !== 'supplier' && <div className="tabs full" role="tablist">
        <button role="tab" className={`tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>Thông tin chung</button>
        <button role="tab" className={`tab ${tab === 'trade' ? 'active' : ''}`} onClick={() => setTab('trade')}>Mua bán hàng</button>
        <button role="tab" className={`tab ${tab === 'internal' ? 'active' : ''}`} onClick={() => setTab('internal')}>Nội bộ quản lý</button>
      </div>}
      {kind !== 'supplier' && tab === 'general' && (
        <>
          <div style={{ ...half, display: 'grid', gap: 8 }}>
            <Field label="Ngày tạo KH"><input className="input" value={v.createdAt ? new Date(v.createdAt).toLocaleDateString('vi-VN') : todayText()} disabled /></Field>
            <Field label="Thuộc nhóm (*)"><ListPicker items={choices.map((g) => ({ code: g.code, name: g.name }))} value={v.groupCode ?? ''} onChange={(g) => changeGroup(g || null)} placeholder="Bấm để chọn" emptyText={`Chưa có nhóm cho ${noun}`} /></Field>
            <Field label={`Mã ${noun} (*)`} hint={isNew ? codeHint : undefined}>
              <div className="row" style={{ gap: 6 }}>
                <input className="input mono" style={{ flex: 1 }} value={v.code ?? ''} disabled={!isNew} onChange={(e) => { set({ code: e.target.value }); setCodeTouched(true); }} />
                {isNew && <button type="button" className="btn btn-sm" title="Lấy mã kế tiếp theo dãy mã của nhóm" onClick={() => void fetchCode(v.groupCode, kind, true)}>↻ Lấy mã mới</button>}
              </div>
            </Field>
          </div>
          <div style={{ ...half, display: 'grid', gap: 8 }}>
            <label className="checkbox chk-explain"><input type="checkbox" checked={v.isProspect ?? false} onChange={(e) => set({ isProspect: e.target.checked })} /> <span><b>Khách hàng tiềm năng</b><small>Khách chưa mua lần nào — để chăm sóc, tiếp thị; bỏ tích khi khách đã mua</small></span></label>
            <Field label="Ghi chú"><textarea className="input" rows={4} value={v.note ?? ''} onChange={(e) => set({ note: e.target.value })} style={{ resize: 'vertical', minHeight: 86 }} /></Field>
          </div>
          <fieldset className="fgroup" style={half}>
            <legend>Thông tin cá nhân</legend>
            <Field label={`Tên ${noun}`} full><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} autoFocus={!isNew} /></Field>
            {txt('address', 'Địa chỉ NR', true)}
            {txt('mobile', 'Mobile', false, true, (val) => void checkDuplicate('phone', val, 'Số di động'))}
            {txt('phone', 'Telephone', false, true, (val) => void checkDuplicate('phone', val, 'Số điện thoại'))}
            <Field label="Ngày sinh"><input type="date" className="input" value={v.birthDate ?? ''} onChange={(e) => set({ birthDate: e.target.value || null })} /></Field>
            <Field label="Giới tính">
              <select className="select input" value={v.gender ?? ''} onChange={(e) => set({ gender: e.target.value })}><option value="">—</option><option value="male">Nam</option><option value="female">Nữ</option></select>
            </Field>
            {txt('email', 'Email')}
            <Field label="Loại khách hàng">
              <select className="select input" value={v.customerType ?? ''} onChange={(e) => set({ customerType: e.target.value })}><option value="">—</option><option value="personal">KH cá nhân</option><option value="business">KH doanh nghiệp</option></select>
            </Field>
          </fieldset>
          <fieldset className="fgroup" style={half}>
            <legend>Thông tin công ty</legend>
            <TaxCodeField value={v.taxCode ?? ''} onChange={(taxCode) => set({ taxCode })} autoWhenEmpty={isNew && !v.companyName} excludeCode={isNew ? undefined : v.code}
              onBlurCheck={(val) => void checkDuplicate('taxCode', val, 'Mã số thuế')}
              onFill={(f, overwrite) => set({
                taxCode: f.taxCode,
                ...(f.name && (overwrite || !v.companyName) ? { companyName: f.name } : {}),
                ...(f.address && (overwrite || !v.companyAddress) ? { companyAddress: f.address } : {}),
                ...(f.shortName && (overwrite || !v.shortName) ? { shortName: f.shortName } : {}),
                ...(!v.name && f.name ? { name: f.name } : {}),
                ...(f.representative && !v.contactName ? { contactName: f.representative } : {}),
              })} />
            {txt('companyName', 'Tên công ty', true)}
            {txt('shortName', 'Tên viết tắt')}
            {txt('alias', 'Alias')}
            {txt('companyAddress', 'Địa chỉ Cty', true)}
            {txt('fax', 'Fax', false, true)}
            {txt('website', 'Website', true)}
            {txt('contactName', 'Người đại diện')}
            {txt('position', 'Chức vụ')}
          </fieldset>
        </>
      )}
      {kind !== 'supplier' && tab === 'trade' && (
        <>
          <fieldset className="fgroup">
            <legend>Công nợ</legend>
            <Field label="Giới hạn nợ (VND)" hint="Trống = không giới hạn; báo cáo tuổi nợ cảnh báo khi vượt">
              <input className="input num" inputMode="numeric" value={v.creditLimit === null || v.creditLimit === undefined ? '' : money(v.creditLimit, { blankZero: false })} onChange={(e) => set({ creditLimit: num(e.target.value) })} />
            </Field>
            <Field label="Giới hạn ngày nợ" hint="Hạn thanh toán; trống = dùng hạn chung trên báo cáo tuổi nợ">
              <input className="input num" inputMode="numeric" value={v.paymentTermDays ?? ''} onChange={(e) => set({ paymentTermDays: num(e.target.value) })} />
            </Field>
            <Field label="Giới hạn số phiếu nợ" hint="Trống = không giới hạn">
              <input className="input num" inputMode="numeric" value={v.maxOpenDocs ?? ''} onChange={(e) => set({ maxOpenDocs: num(e.target.value) })} />
            </Field>
          </fieldset>
          <fieldset className="fgroup">
            <legend>Tài khoản</legend>
            {txt('bankAccountNo', 'Số TK', false, true)}
            {txt('bankAccountHolder', 'Chủ TK')}
            {txt('bankName', 'Mở tại', true)}
          </fieldset>
        </>
      )}
      {kind !== 'supplier' && tab === 'internal' && (
        <>
          <fieldset className="fgroup">
            <legend>Thông tin nội bộ quản lý</legend>
            <Field label="Người quản lý"><ListPicker items={employees.filter((e) => e.isActive || e.code === v.managerCode).map((e) => ({ code: e.code, name: e.name }))} value={v.managerCode ?? ''} onChange={(managerCode) => set({ managerCode: managerCode || null })} placeholder="Bấm để chọn" /></Field>
            <Field label="Chi nhánh quản lý"><ListPicker items={branches.map((b) => ({ code: b.code, name: b.name }))} value={v.branchCode ?? ''} onChange={(branchCode) => set({ branchCode: branchCode || null })} placeholder="Bấm để chọn" /></Field>
          </fieldset>
          <fieldset className="fgroup">
            <legend>Tạo và sửa thông tin khách hàng</legend>
            <Field label="User tạo"><input className="input" value={v.createdBy ?? ''} disabled /></Field>
            <Field label="Ngày tạo"><input className="input" value={v.createdAt ?? ''} disabled /></Field>
          </fieldset>
        </>
      )}
      {invalid.length > 0 && <div className="alert alert-bad full">Chưa nhập đủ: {invalid.join(', ')}</div>}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}

interface TaxCompany { taxCode: string; name: string; internationalName: string; shortName: string; address: string; representative: string; status: string; active: boolean | null; industry: string; registeredAt: string; source: string }
interface TaxLookup { found: boolean; company: TaxCompany | null; existing: Partner[]; cached: boolean }
type TaxFill = { taxCode: string; name: string; shortName: string; address: string; representative: string };

/**
 * Ô MÃ SỐ THUẾ có tra cứu: gõ MST rồi bấm "Lấy thông tin" (hoặc Enter) → máy chủ tra doanh nghiệp (doanhnghiep.vn / VietQR,
 * dữ liệu Cục Thuế) → điền tên trên hoá đơn, địa chỉ đăng ký, tên viết tắt, người đại diện. Bấm nút = ghi đè các ô đó theo kết quả;
 * tự tra khi rời ô (thêm mới, chưa có tên) = chỉ điền ô đang trống. Báo trạng thái ngừng hoạt động và MST đã có ở đối tượng khác.
 */
function TaxCodeField({ value, onChange, onFill, autoWhenEmpty, onBlurCheck, excludeCode }: {
  value: string; onChange: (v: string) => void; onFill: (f: TaxFill, overwrite: boolean) => void; autoWhenEmpty: boolean; onBlurCheck?: (v: string) => void; excludeCode?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<TaxLookup | null>(null);
  const [err, setErr] = useState('');
  const last = useRef('');
  const run = async (overwrite: boolean) => {
    const mst = value.trim();
    if (!mst) { setErr('Nhập mã số thuế trước'); return; }
    setBusy(true); setErr(''); last.current = mst;
    try {
      const r = await api.get<TaxLookup>(`/api/v1/partners/tax-lookup/${encodeURIComponent(mst)}`);
      setRes(r);
      if (r.company) onFill({ taxCode: r.company.taxCode, name: r.company.name, shortName: r.company.shortName, address: r.company.address, representative: r.company.representative }, overwrite);
    } catch (e) { setRes(null); setErr(errorText(e)); } finally { setBusy(false); }
  };
  const dup = (res?.existing ?? []).filter((p) => p.code !== excludeCode);
  const c = res?.company;
  return (
    <Field label="Mã số thuế — nhập rồi bấm Lấy thông tin" full>
      <div className="row" style={{ gap: 6 }}>
        <input className="input mono" style={{ flex: 1 }} value={value} placeholder="vd 0104076740 — tự điền tên, địa chỉ theo Cục Thuế"
          onChange={(e) => { onChange(e.target.value); setRes(null); setErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run(true); } }}
          onBlur={(e) => {
            const val = e.target.value.trim();
            onBlurCheck?.(val);
            if (autoWhenEmpty && val && val !== last.current && /^[\d\s.-]{10,16}$/.test(val)) void run(false);
          }} />
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || !value.trim()} onClick={() => void run(true)} title="Tra cứu doanh nghiệp theo mã số thuế và điền tên, địa chỉ, tên viết tắt, người đại diện">
          {busy ? 'Đang tra…' : 'Lấy thông tin'}
        </button>
      </div>
      {err && <span style={{ fontSize: 12, color: 'var(--bad, #dc2626)' }}>{err}</span>}
      {res && !c && <span className="muted" style={{ fontSize: 12 }}>Không tìm thấy doanh nghiệp có mã số thuế này — kiểm tra lại MST hoặc nhập tay.</span>}
      {c && (
        <span style={{ fontSize: 12, color: c.active === false ? 'var(--bad, #dc2626)' : 'var(--ok, #15803d)' }}>
          {c.active === false ? '⚠ ' : '✓ '}{c.name}{c.status ? ` — ${c.status}` : ''}{c.active === false ? ' (kiểm tra trước khi giao dịch)' : ''}
          {c.industry ? ` · ngành: ${c.industry}` : ''}{c.registeredAt ? ` · thành lập ${c.registeredAt.split('-').reverse().join('/')}` : ''}
          <span className="muted"> · nguồn {c.source === 'vietqr' ? 'Cục Thuế (qua VietQR)' : c.source}</span>
        </span>
      )}
      {dup.length > 0 && <span style={{ fontSize: 12, color: 'var(--bad, #dc2626)' }}>Mã số thuế này đã có ở: {dup.map((p) => `${p.code} - ${p.name}`).join('; ')} — mỗi MST chỉ dùng cho một đối tượng.</span>}
    </Field>
  );
}

/**
 * Form NHÀ CUNG CẤP (gọn — NCC là doanh nghiệp): một khối thông tin chính thức (tên, MST, địa chỉ đúng trên hoá đơn), liên hệ,
 * tài khoản ngân hàng. Không có các ô chỉ dành cho khách lẻ (ngày sinh, giới tính, khách tiềm năng, loại khách hàng, fax, alias)
 * và không khai hạn mức / hạn trả ở đây — khai ở Hồ sơ NCC → chính sách (một nơi, tránh lệch). Người tạo / ngày giờ tạo ở chân form.
 */
function NccFields({ v, set, txt, choices, isNew, codeHint, noun, changeGroup, fetchCode, setCode, checkDuplicate }: {
  v: Partial<Partner>; set: (p: Partial<Partner>) => void; txt: (k: keyof Partner, label: string, full?: boolean, mono?: boolean, onBlur?: (val: string) => void) => ReactNode;
  choices: Group[]; isNew: boolean; codeHint: string; noun: string; changeGroup: (g: string | null) => void; fetchCode: () => void; setCode: (c: string) => void;
  checkDuplicate: (field: 'phone' | 'taxCode', val: string, label: string) => Promise<void>;
}) {
  return <>
    <fieldset className="fgroup full">
      <legend>Thông tin nhà cung cấp (đúng như trên hoá đơn)</legend>
      <Field label="Thuộc nhóm (*)"><ListPicker items={choices.map((g) => ({ code: g.code, name: g.name }))} value={v.groupCode ?? ''} onChange={(g) => changeGroup(g || null)} placeholder="Bấm để chọn" emptyText={`Chưa có nhóm cho ${noun}`} /></Field>
      <Field label={`Mã ${noun} (*)`} hint={isNew ? codeHint : undefined}>
        <div className="row" style={{ gap: 6 }}>
          <input className="input mono" style={{ flex: 1 }} value={v.code ?? ''} disabled={!isNew} onChange={(e) => setCode(e.target.value)} />
          {isNew && <button type="button" className="btn btn-sm" title="Lấy mã kế tiếp theo dãy mã của nhóm" onClick={fetchCode}>↻ Lấy mã mới</button>}
        </div>
      </Field>
      <TaxCodeField value={v.taxCode ?? ''} onChange={(taxCode) => set({ taxCode })} autoWhenEmpty={isNew && !v.name} excludeCode={isNew ? undefined : v.code}
        onBlurCheck={(val) => void checkDuplicate('taxCode', val, 'Mã số thuế')}
        onFill={(f, overwrite) => set({
          taxCode: f.taxCode,
          ...(f.name && (overwrite || !v.name) ? { name: f.name } : {}),
          ...(f.address && (overwrite || !v.address) ? { address: f.address } : {}),
          ...(f.shortName && (overwrite || !v.shortName) ? { shortName: f.shortName } : {}),
          ...(f.representative && !v.contactName ? { contactName: f.representative, position: v.position || 'Người đại diện theo pháp luật' } : {}),
        })} />
      <Field label="Tên nhà cung cấp (tên công ty trên hoá đơn) (*)" full><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} autoFocus={!isNew} /></Field>
      {txt('shortName', 'Tên viết tắt')}
      {txt('address', 'Địa chỉ (theo đăng ký kinh doanh / hoá đơn)', true)}
      {txt('phone', 'Điện thoại', false, true, (val) => void checkDuplicate('phone', val, 'Số điện thoại'))}
      {txt('email', 'Email')}
      {txt('contactName', 'Người liên hệ / đại diện')}
      {txt('position', 'Chức vụ')}
      {txt('mobile', 'Di động người liên hệ', false, true)}
      {txt('website', 'Website')}
    </fieldset>
    <fieldset className="fgroup full">
      <legend>Tài khoản ngân hàng (trả tiền NCC)</legend>
      {txt('bankAccountNo', 'Số tài khoản', false, true)}
      {txt('bankAccountHolder', 'Chủ tài khoản')}
      {txt('bankName', 'Mở tại ngân hàng', true)}
    </fieldset>
    <Field label="Ghi chú" full><textarea className="input" rows={2} value={v.note ?? ''} onChange={(e) => set({ note: e.target.value })} style={{ resize: 'vertical' }} /></Field>
    <div className="full muted" style={{ fontSize: 12 }}>Hạn mức công nợ, hạn thanh toán, chiết khấu, hợp đồng, tệp đính kèm: khai ở <b>Hồ sơ nhà cung cấp</b> (Mua hàng → Nhà cung cấp → bấm vào NCC) — một nơi cho mọi điều kiện mua.</div>
  </>;
}

/** Danh mục nhóm đối tượng (DM08): Mã nhóm KH · Tên nhóm KH · Ghi chú. */
export function PartnerGroupsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const groups = useGroups();
  const [editing, setEditing] = useState<(Partial<Group> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<Group | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: (g: Partial<Group>) => api.put(`/api/v1/partner-groups/${encodeURIComponent(g.code ?? '')}`, { name: g.name ?? '', parentCode: g.parentCode || undefined, kind: g.kind ?? 'any', note: g.note ?? '', isActive: g.isActive ?? true }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['partner-groups'] }); if (editing?.isNew) setEditing(null); else viewAgain[1](); },
  });
  const del = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/partner-groups/${encodeURIComponent(code)}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['partner-groups'] }); } });
  const e = editing;
  return (
    <>
      <PageHeader title="Nhóm đối tượng" code="DM08" subtitle="Nhóm khách hàng, nhà cung cấp dùng để lọc và gom báo cáo theo nhóm" helpKey="doi-tuong" />
      <div className="card">
        <CatalogToolbar
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, kind: 'any', isActive: true })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá nhóm ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); }}
          onRefresh={() => groups.refetch()}
          onExport={() => exportRef.current?.()}
        />
        <ErrorBox error={groups.error ? errorText(groups.error) : del.error ? errorText(del.error) : null} />
        {groups.isLoading ? <Loading /> : (
          <DataGrid storageKey="dm08-v2" exportName="nhom-doi-tuong" groupable exportRef={exportRef} rows={groups.data ?? []} rowKey={(g) => g.code}
            onSelect={setSel} onRowDoubleClick={(g) => canWrite && setEditing(g)} rowClassName={(g) => (g.isActive ? '' : 'muted')} footerLabel={false}
            columns={[
              { key: 'code', header: 'Mã nhóm KH', type: 'code', width: 120 },
              { key: 'name', header: 'Tên nhóm KH', width: 300 },
              { key: 'note', header: 'Ghi chú', width: 260 },
              { key: 'parentCode', header: 'Nhóm cha', type: 'code', width: 100 },
              { key: 'kind', header: 'Dùng cho', width: 110, value: (g) => (g.kind === 'any' ? 'Mọi loại' : KIND[g.kind] ?? g.kind) },
              { key: 'partners', header: 'Số đối tượng', type: 'number', width: 100 },
              { key: 'inactive', header: 'Ngừng dùng', type: 'check', width: 85, hidden: true, value: (g) => !g.isActive },
            ] satisfies Column<Group>[]} />
        )}
      </div>
      {e && (
        <Modal viewAgain={viewAgain} viewFirst={!e.isNew} title="Nhóm khách hàng" onClose={() => setEditing(null)}
          footer={<><button className="btn btn-primary" disabled={save.isPending || !e.code || !e.name} onClick={() => save.mutate(e)}>Ghi</button><button className="btn" onClick={() => setEditing(null)}>Thoát</button></>}>
          <Field label="Mã nhóm (*)"><input className="input mono" value={e.code ?? ''} disabled={!e.isNew} onChange={(ev) => setEditing({ ...e, code: ev.target.value.trim() })} autoFocus /></Field>
          <Field label="Nhóm khách hàng (*)"><input className="input" value={e.name ?? ''} onChange={(ev) => setEditing({ ...e, name: ev.target.value })} /></Field>
          <Field label="Mô tả" full><input className="input" value={e.note ?? ''} onChange={(ev) => setEditing({ ...e, note: ev.target.value })} /></Field>
          <Field label="Dùng cho">
            <select className="select input" value={e.kind} onChange={(ev) => setEditing({ ...e, kind: ev.target.value })}>
              <option value="any">Mọi loại</option>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Nhóm cha"><ListPicker items={(groups.data ?? []).filter((g) => g.code !== e.code).map((g) => ({ code: g.code, name: g.name }))} value={e.parentCode ?? ''} onChange={(parentCode) => setEditing({ ...e, parentCode: parentCode || null })} placeholder="Không có" /></Field>
          <Field label=" "><label className="checkbox"><input type="checkbox" checked={e.isActive ?? true} onChange={(ev) => setEditing({ ...e, isActive: ev.target.checked })} /> Đang dùng</label></Field>
          {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
        </Modal>
      )}
    </>
  );
}
