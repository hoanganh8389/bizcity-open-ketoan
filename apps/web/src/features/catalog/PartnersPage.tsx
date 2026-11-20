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
import { useMaTrung } from '@/lib/maTrung';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText, ALL_ROWS } from '@/lib/api';
import { money } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { NutQuyTac } from '@/components/QuyTacDanhMuc';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { useThemTuDiaChi } from '@/lib/themNhanh';
import { Link } from 'react-router-dom';
import { DataGrid, type Column } from '@/components/DataGrid';
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G5): thẻ do module SDK cắm vào hồ sơ khách hàng (partner.detail.tab)
import { sdkSlots } from '../../phan-he/sdk-modules';
import { useEnabledModules } from '../../layout/useAppMenu';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { KpiDoiTuong } from '@/components/KpiDanhMuc';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapLoai } from '@/lib/nhapExcel';
import { ListPicker } from '@/components/pickers';
import { useBranches } from '@/components/filters';
import { flashSaved, savedNote, useCatalogWhy, useWarnAck, WarnAckBox, WhyPanel } from '@/components/WhyPanel';
// [2026-11-11 10:48 AM kiennt] HT03 — ô mã số thuế có tra cứu tách ra components/TaxCodeField (dùng chung với Thông tin đơn vị)
import { TaxCodeField } from '@/components/TaxCodeField';
import type { CatalogWarnAck } from '@ketoan/contracts';
import { CayDoiTuong, DonViCon, LichSuDoiTuong, LichSuThuocTinh, ODonViCha } from './DoiTuongChaCon';
import { ArrowLeft } from 'lucide-react';

interface Partner {
  code: string; name: string; kind: string; taxCode: string | null; address: string | null; email: string | null; phone: string | null;
  groupCode: string | null; isActive: boolean; paymentTermDays: number | null; creditLimit: number | null; note: string;
  contactName: string; bankAccountNo: string; bankAccountHolder: string; bankName: string; maxOpenDocs: number | null;
  mobile: string; fax: string; website: string; position: string; companyName: string; companyAddress: string; shortName: string;
  managerCode: string | null; branchCode: string | null; createdAt: string | null; createdBy: string; createdTime?: string | null; alsoKinds?: string[];
  birthDate: string | null; gender: string; alias: string; isProspect: boolean; customerType: string;
  uid?: string; parentCode?: string | null; parentName?: string | null; childCount?: number;
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
  const [editing, setEditingRaw] = useState<(Partial<Partner> & { isNew?: boolean }) | null>(null);
  /** Các hồ sơ đã đi qua khi mở đơn vị con / thêm con — nút Quay lại lùi về. */
  const [back, setBack] = useState<(Partial<Partner> & { isNew?: boolean })[]>([]);
  const setEditing = (v: (Partial<Partner> & { isNew?: boolean }) | null) => { setBack([]); setEditingRaw(v); };
  const [sel, setSel] = useState<Partner | null>(null);
  // [2026-11-13 Nguyễn Văn Thủy] kiểu xem: danh sách / cây cha – con (đóng góp)
  const [xem, setXem] = useState<'ds' | 'cay'>('ds');
  const exportRef = useRef<(() => void) | null>(null);
  const groups = useGroups();
  const employees = useEmployees();
  // ?them=1 (&loai=supplier): mở thẳng form thêm mới — nút Thêm nhanh, nút "+" chọn đối tượng ở trang quản trị.
  useThemTuDiaChi((p) => setEditing({ isNew: true, kind: fixedKind ?? (p.get('loai') === 'supplier' ? 'supplier' : 'customer'), isActive: true, groupCode: null }), canWrite);
  // [2026-11-16 kiennt] bỏ thanh lọc trên (tìm, nhóm, trạng thái): lọc theo từng cột ở bảng (đóng góp)
  const params = { page: 1, pageSize: ALL_ROWS, kind: fixedKind, status: 'all' };
  const q = useQuery({ queryKey: ['partners', params], queryFn: () => api.getPage<Partner[]>('/api/v1/partners', params), placeholderData: keepPreviousData });
  const groupName = (c: string | null) => (c ? groups.data?.find((g) => g.code === c)?.name ?? c : '');
  const empName = (c: string | null) => (c ? employees.data?.find((e) => e.code === c)?.name ?? c : '');
  const del = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/partners/${encodeURIComponent(code)}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['partners'] }); } });

  // [2026-11-16 kiennt] mặc định chỉ hiện Mã, Tên, Thuộc đơn vị cha, Nhóm, Tên công ty, Người tạo (DM13 thêm MST, Giới hạn nợ, ẩn Tên công ty); cột khác bật ở nút Cột (đóng góp)
  const columns: Column<Partner>[] = [
    // Mã NCC mở hồ sơ nhà cung cấp (hợp đồng, mặt hàng & giá mua, nhận hàng).
    { key: 'code', header: `Mã ${abbr}`, type: 'code', width: 120, render: (p) => (p.kind === 'supplier' || p.alsoKinds?.includes('supplier')
      ? <Link to={`/mua-hang/nha-cung-cap/${encodeURIComponent(p.code)}`} onClick={(e) => e.stopPropagation()} title="Mở hồ sơ nhà cung cấp: hợp đồng, mặt hàng và giá mua">{p.code}</Link> : p.code) },
    { key: 'name', header: `Tên ${abbr}`, width: 240 },
    // [2026-11-19 10:28 AM khanhtd] DM12/DM13 — đơn vị cha chưa có tên thì chỉ hiện mã, không thừa " - "
    { key: 'parentCode', header: 'Thuộc đơn vị cha', width: 200, title: 'Đơn vị mẹ của chi nhánh / đơn vị con; trống = đơn vị độc lập', value: (p) => [p.parentCode, p.parentName?.trim()].filter(Boolean).join(' - ') },
    { key: 'childCount', header: 'Số đơn vị con', type: 'number', width: 90, title: 'Số chi nhánh / đơn vị con trực tiếp', hidden: true },
    // [2026-11-11 Nguyễn Văn Thủy] cột Chức năng: lập chứng từ cho đối tượng ngay từ danh sách (đóng góp)
    { key: 'chuc-nang', header: 'Chức năng', width: 120, hidden: true, noFilter: true, noSort: true, value: () => '', render: (p) => {
      const to = p.kind === 'supplier' ? `/mua-hang/tong-hop?moi=receipt&ncc=${encodeURIComponent(p.code)}` : p.kind === 'customer' ? `/ban-hang/phieu-ban?them=1&kh=${encodeURIComponent(p.code)}` : null;
      return to ? <Link className="row-act" to={to} onClick={(e) => e.stopPropagation()} title={p.kind === 'supplier' ? 'Lập phiếu nhập mua của nhà cung cấp này' : 'Lập phiếu bán hàng cho khách này'}>{p.kind === 'supplier' ? 'Lập phiếu nhập' : 'Lập phiếu bán'}</Link> : null;
    } },
    { key: 'address', header: 'Địa chỉ NR', width: 220, hidden: true },
    // [2026-11-20 kiennt] NT-DM-016 — khách hàng: một cột Điện thoại (form ghi cùng số vào điện thoại / di động); NCC giữ Di động người liên hệ (đóng góp)
    { key: 'phone', header: 'Điện thoại', type: 'code', width: 110, hidden: true, value: (p) => (fixedKind === 'customer' ? p.phone || p.mobile || '' : p.phone ?? '') },
    ...(fixedKind === 'customer' ? [] : [{ key: 'mobile', header: fixedKind === 'supplier' ? 'Di động người liên hệ' : 'Di động', type: 'code', width: 110, hidden: true } as Column<Partner>]),
    { key: 'groupCode', header: `Nhóm ${abbr}`, width: 150, value: (p) => groupName(p.groupCode) },
    { key: 'contactName', header: 'Người đại diện', width: 150, hidden: true },
    { key: 'companyAddress', header: 'Địa chỉ cty', width: 220, hidden: true },
    { key: 'taxCode', header: 'MST', type: 'code', width: 120, hidden: fixedKind !== 'supplier' },
    { key: 'fax', header: 'Fax', type: 'code', width: 100, hidden: true },
    { key: 'email', header: 'Email', width: 170, hidden: true },
    { key: 'website', header: 'Website', width: 150, hidden: true },
    { key: 'position', header: 'Chức vụ', width: 120, hidden: true },
    { key: 'createdAt', header: `Ngày tạo ${abbr}`, type: 'date', width: 100, hidden: true },
    { key: 'isActive', header: 'Theo dõi', type: 'check', width: 70, hidden: true },
    { key: 'managerCode', header: 'Người QL', width: 150, value: (p) => empName(p.managerCode), hidden: true },
    { key: 'branchCode', header: 'Chi nhánh QL', type: 'code', width: 120, hidden: true },
    { key: 'note', header: 'Ghi chú', width: 180, hidden: true },
    { key: 'shortName', header: 'Tên viết tắt', width: 120, hidden: true },
    { key: 'companyName', header: 'Tên công ty', width: 220, hidden: fixedKind === 'supplier' },
    { key: 'bankAccountNo', header: 'Tài khoản NH', type: 'code', width: 130, hidden: true },
    { key: 'bankAccountHolder', header: 'Chủ TK', width: 160, hidden: true },
    { key: 'bankName', header: 'Mở tại', width: 180, hidden: true },
    { key: 'creditLimit', header: 'Giới hạn nợ', type: 'money', width: 120, hidden: fixedKind !== 'supplier' },
    { key: 'paymentTermDays', header: 'Giới hạn ngày nợ', type: 'number', width: 110, hidden: true },
    { key: 'maxOpenDocs', header: 'Giới hạn số phiếu nợ', type: 'number', width: 130, hidden: true },
    { key: 'createdBy', header: 'Người tạo', width: 120 },
    // Vai trò: hiện rõ đối tượng vừa là NCC vừa là khách hàng (cùng một mã nằm ở cả hai danh sách).
    { key: 'kind', header: 'Vai trò', width: 170, value: (p) => [KIND[p.kind] ?? p.kind, ...(p.alsoKinds ?? []).map((k) => KIND[k] ?? k)].join(' + '), hidden: Boolean(fixedKind) },
  ];

  return (
    <>
      <PageHeader actions={<NutQuyTac entity="partner" logEntity="partners" ten="đối tượng (khách hàng, nhà cung cấp, nhân viên)" />} title={screen?.title ?? 'Đối tượng'} code={screen?.code ?? 'DM03'} subtitle={screen?.subtitle ?? 'Khách hàng, nhà cung cấp, nhân viên, đơn vị nội bộ'} helpKey="doi-tuong" />
      {/* [2026-11-17 10:00 AM kiennt] DANH-MUC — Khách hàng (DM12), Nhà cung cấp (DM13) bỏ thẻ chỉ số nợ; Đối tượng (DM03) giữ nguyên (đóng góp) */}
      {!fixedKind && <KpiDoiTuong />}
      <div className="card">
        <CatalogToolbar
          trash={{ catalog: fixedKind ? `partners.${fixedKind}` : 'partners', title: fixedKind === 'customer' ? 'Khách hàng' : fixedKind === 'supplier' ? 'Nhà cung cấp' : 'Đối tượng', sel: sel ? { key: sel.code, label: sel.name } : null }}
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, kind: fixedKind ?? sel?.kind ?? 'customer', isActive: true, groupCode: sel?.groupCode ?? null })}
          // [2026-11-18 01:40 PM kiennt] NT-DM-006 — nút Nhân bản (đóng góp)
          onCopy={() => sel && setEditing({ ...sel, code: '', taxCode: '', isNew: true, isActive: true })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá đối tượng ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); }}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
          left={
            <span className="cc-xem">
              <button type="button" className={`btn btn-sm${xem === 'ds' ? ' btn-primary' : ''}`} onClick={() => setXem('ds')}>Danh sách</button>
              <button type="button" className={`btn btn-sm${xem === 'cay' ? ' btn-primary' : ''}`} title="Xem theo đơn vị mẹ → chi nhánh / đơn vị con" onClick={() => setXem('cay')}>Cây cha – con</button>
            </span>
          }
          extra={<NutNhapExcel loai={nhapLoai(fixedKind === 'supplier' ? 'nha-cung-cap' : 'khach-hang')!} disabled={!canWrite} />}
        />
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : xem === 'cay' ? <CayDoiTuong rows={q.data?.data ?? []} selected={sel?.code} onSelect={setSel} onOpen={(p) => setEditing(p)} /> : (
          <DataGrid
            storageKey={`${(screen?.code ?? 'DM03').toLowerCase()}-v3`}
            exportName={screen ? { customer: 'khach-hang', supplier: 'nha-cung-cap' }[fixedKind!] : 'doi-tuong'}
            groupable
            exportRef={exportRef}
            rows={q.data?.data ?? []}
            rowKey={(p) => p.code}
            onSelect={setSel}
            onRowDoubleClick={(p) => canWrite && setEditing(p)}
            rowClassName={(p) => (p.isActive ? '' : 'muted')}
            footerLabel={false}
            columns={columns}
          />
        )}
      </div>
      {editing && <PartnerForm key={editing.code ?? `moi-${editing.parentCode ?? ''}`} value={editing} groups={groups.data ?? []} employees={employees.data ?? []} onClose={() => setEditing(null)}
        onSwitch={(v) => { setBack((b) => [...b, editing]); setEditingRaw(v); }} onBack={back.length ? () => { setEditingRaw(back[back.length - 1]!); setBack((b) => b.slice(0, -1)); } : undefined} />}
    </>
  );
}

/** Đơn vị con mới của một đối tượng: cùng vai trò, nhóm; mã do máy cấp theo mã cha. */
const childOf = (p: Partial<Partner>): Partial<Partner> & { isNew: boolean } => ({ isNew: true, kind: p.kind, alsoKinds: p.alsoKinds, groupCode: p.groupCode ?? null, isActive: true, parentCode: p.code, parentName: p.name });

/** Gợi ý mã mới của API: theo dãy mã của nhóm, của loại, hoặc tiền tố mặc định. */
interface NextCode { code: string; basis: 'group' | 'kind' | 'default' | 'parent' | 'mst'; series: string | null; count: number }
const NOUN: Record<string, string> = { customer: 'khách hàng', supplier: 'nhà cung cấp', employee: 'nhân viên', internal: 'đơn vị nội bộ', other: 'đối tượng' };
/**
 * Form đối tượng DÙNG CHUNG — nơi duy nhất khai / sửa thông tin gốc của NCC (tên, MST, địa chỉ, nhóm, tài khoản, liên hệ).
 * Hồ sơ NCC (phân hệ Mua hàng) mở đúng form này. code trống = thêm mới.
 */
export function PartnerEditor({ code, kind = 'supplier', onClose, initial, onSaved }: { code?: string; kind?: 'customer' | 'supplier'; onClose: () => void; initial?: Partial<Partner>; onSaved?: (code: string) => void }) {
  const groups = useGroups();
  const employees = useEmployees();
  const q = useQuery({ queryKey: ['partner-one', code], queryFn: () => api.get<Partner[]>('/api/v1/partners', { search: code, status: 'all', pageSize: 50 }), enabled: Boolean(code) });
  if (code && !q.data) return null;
  const value = code ? q.data?.find((p) => p.code === code) : undefined;
  if (code && !value) return null;
  return <PartnerEditorBody value={value ?? { isNew: true, kind, isActive: true, groupCode: null, ...initial }} groups={groups.data ?? []} employees={employees.data ?? []} onClose={onClose} onSaved={onSaved} />;
}
/** Hồ sơ mở từ nơi khác (hồ sơ NCC…): mở đơn vị con / thêm đơn vị con ngay trong hộp thoại. */
function PartnerEditorBody({ value, ...rest }: { value: Partial<Partner> & { isNew?: boolean }; groups: Group[]; employees: Dim[]; onClose: () => void; onSaved?: (code: string) => void }) {
  const [cur, setCur] = useState(value);
  const [back, setBack] = useState<(Partial<Partner> & { isNew?: boolean })[]>([]);
  return <PartnerForm key={cur.code ?? `moi-${cur.parentCode ?? ''}`} value={cur} {...rest} onSwitch={(v) => { setBack((b) => [...b, cur]); setCur(v); }}
    onBack={back.length ? () => { setCur(back[back.length - 1]!); setBack((b) => b.slice(0, -1)); } : undefined} />;
}

/** Hôm nay theo giờ máy (YYYY-MM-DD) — giới hạn ô Hiệu lực từ ngày. */
const homNay = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const todayText = () => new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Form đối tượng theo màn "Khách hàng / Nhà cung cấp" của HTsoft (frmKhachhang2):
 *   - Thuộc kiểu, Thuộc nhóm, Mã bắt buộc; tạo mới: chọn nhóm (hoặc đổi kiểu) thì mã tự nhảy theo dãy mã của nhóm
 *     (GET /partners/next-code), trừ khi người dùng đã tự gõ mã; nút "Lấy mã mới" lấy lại;
 *   - tạo mới gõ Mobile / Telephone / Mã số thuế đã có ở đối tượng khác: hỏi có mở đối tượng đó để sửa không;
 *   - tạo mới gửi POST (mã trùng → báo lỗi, không ghi đè), sửa gửi PUT.
 */
function PartnerForm({ value, groups, employees, onClose, onSaved, onSwitch, onBack }: { value: Partial<Partner> & { isNew?: boolean }; groups: Group[]; employees: Dim[]; onClose: () => void; onSaved?: (code: string) => void; onSwitch?: (v: Partial<Partner> & { isNew?: boolean }) => void; onBack?: () => void }) {
  const qc = useQueryClient();
  const branches = useBranches().data ?? [];
  // Nhà cung cấp là doanh nghiệp: MỘT bộ tên / địa chỉ chính thức (đúng trên hoá đơn) — mở form lấy khối công ty trước.
  const [v, setV] = useState<Partial<Partner>>(() => {
    const x: Partial<Partner> = { kind: 'customer', isActive: true, ...value };
    return x.kind === 'supplier' ? { ...x, name: x.companyName || x.name, address: x.companyAddress || x.address } : x;
  });
  const [isNew, setIsNew] = useState(Boolean(value.isNew));
  // [2026-11-19 12:20 PM khanhtd] NT-DM-011 — đổi tên / MST / địa chỉ của đối tượng đã có: chọn ngày hiệu lực (≤ hôm nay; trống = hôm nay)
  const [goc] = useState(() => ({ name: (v.name ?? '').trim(), taxCode: (v.taxCode ?? '').trim(), address: (v.address ?? '').trim() }));
  const [validFrom, setValidFrom] = useState('');
  const [codeTouched, setCodeTouched] = useState(Boolean(value.code));
  const [codeHint, setCodeHint] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const [tab, setTab] = useState<string>('general');
  const enabledMods = useEnabledModules();
  const { can } = useAuth();
  const slotTabs = isNew ? [] : sdkSlots('partner.detail.tab').filter((s) => (!enabledMods || enabledMods.has(s.module)) && (!s.permission || can(s.permission)));
  const set = (p: Partial<Partner>) => setV((x) => ({ ...x, ...p }));
  const kind = v.kind ?? 'customer';
  const noun = NOUN[kind] ?? 'đối tượng';
  const choices = groups.filter((g) => (g.isActive && (g.kind === 'any' || g.kind === kind)) || g.code === v.groupCode);
  // [2026-11-19 08:49 AM khanhtd] ô Đơn vị cha: tìm trong nhóm cha của nhóm đang chọn; vai trò theo ô tích (tích cả hai = không lọc vai trò)
  const parentGroupCode = v.groupCode ? (groups.find((g) => g.code === v.groupCode)?.parentCode || v.groupCode) : null;
  const laNcc = kind === 'supplier' || (v.alsoKinds ?? []).includes('supplier');
  const laKh = kind === 'customer' || (v.alsoKinds ?? []).includes('customer');
  const parentKind: 'customer' | 'supplier' | undefined = laNcc && laKh ? undefined : laNcc ? 'supplier' : laKh ? 'customer' : undefined;
  const txt = (k: keyof Partner, label: string, full = false, mono = false, onBlur?: (val: string) => void) => (
    <Field label={label} full={full}><input className={`input ${mono ? 'mono' : ''}`} value={String(v[k] ?? '')} onChange={(e) => set({ [k]: e.target.value } as Partial<Partner>)} onBlur={onBlur ? (e) => onBlur(e.target.value.trim()) : undefined} /></Field>
  );

  // Mã mới theo nhóm / kiểu (như HTsoft: đổi nhóm thì sinh lại mã). Đổi nhóm liên tục: chỉ nhận kết quả của lần gọi sau cùng.
  const codeReq = useRef(0);
  const fetchCode = async (groupCode: string | null | undefined, k: string, force = false, parentCode = v.parentCode, taxCode = v.taxCode) => {
    if (!isNew || (codeTouched && !force)) return;
    const seq = ++codeReq.current;
    try {
      const r = await api.get<NextCode>('/api/v1/partners/next-code', { groupCode: groupCode || undefined, kind: k, parentCode: parentCode || undefined, taxCode: parentCode ? taxCode?.trim() || undefined : undefined });
      if (seq !== codeReq.current) return;
      setV((x) => ({ ...x, code: r.code }));
      setCodeTouched(false);
      setCodeHint(r.basis === 'parent' ? `Mã đơn vị con: mã cha + số thứ tự (${r.series})` : r.basis === 'mst' ? 'Mã đơn vị con lấy theo đuôi MST chi nhánh' : r.basis === 'group' ? `Nối dãy ${r.series} của nhóm (${r.count} mã)` : r.basis === 'kind' ? `Nối dãy ${r.series} của ${NOUN[k] ?? 'đối tượng'} (${r.count} mã)` : 'Chưa có dãy mã để nối, dùng tiền tố mặc định');
    } catch { /* không lấy được thì để người dùng tự gõ */ }
  };
  useEffect(() => { if (isNew && !value.code) void fetchCode(v.groupCode, kind, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changeKind = (k: string) => {
    const keepGroup = groups.some((g) => g.code === v.groupCode && (g.kind === 'any' || g.kind === k));
    const groupCode = keepGroup ? v.groupCode : null;
    set({ kind: k, groupCode });
    void fetchCode(groupCode, k);
  };
  // Đơn vị cha chọn trong nhóm cha của nhóm đang chọn: đổi nhóm thì bỏ đơn vị cha đang chọn.
  const changeGroup = (groupCode: string | null) => {
    const boCha = Boolean(v.parentCode) && groupCode !== v.groupCode;
    set({ groupCode, ...(boCha ? { parentCode: null, parentName: null } : {}) });
    void fetchCode(groupCode, kind, boCha, boCha ? null : v.parentCode);
  };
  // [2026-11-13 Nguyễn Văn Thủy] chọn đơn vị cha: thêm mới thì mã thành mã cha-00x, mang theo vai trò + nhóm của cha (đóng góp)
  const changeParent = async (parentCode: string | null) => {
    set({ parentCode, parentName: null });
    setSuggest(null);
    if (!parentCode) { if (isNew) void fetchCode(v.groupCode, kind, true, null); return; }
    const par = (await api.get<Partner[]>('/api/v1/partners', { search: parentCode, status: 'all', pageSize: 20 }).catch(() => [])).find((p) => p.code === parentCode);
    // [2026-11-19 08:49 AM khanhtd] vai trò giữ theo ô tích của người dùng (danh sách cha đã lọc theo vai trò), không chép vai trò của cha
    if (par) set({ parentName: par.name, ...(isNew ? { groupCode: v.groupCode || par.groupCode } : {}) });
    if (isNew) void fetchCode(v.groupCode || par?.groupCode, kind, true, parentCode);
  };
  /** MST chi nhánh (10 số-3 số) mà đã có đơn vị mang MST gốc: gợi ý gắn làm đơn vị con. */
  const [suggest, setSuggest] = useState<Partner | null>(null);
  const checkBranchMst = async (mst: string) => {
    const m = /^(\d{10})-\d{3}$/.exec(mst.trim());
    if (!m || v.parentCode) { setSuggest(null); return; }
    const found = (await api.get<Partner[]>('/api/v1/partners/lookup', { taxCode: m[1]!, exclude: v.code }).catch(() => []))[0];
    setSuggest(found && found.code !== v.code ? found : null);
  };

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
    if (isNew && v.parentCode && !(v.code ?? '').startsWith(`${v.parentCode}-`)) bad.push(`Mã đơn vị con phải bắt đầu bằng ${v.parentCode}-`);
    // Bắt buộc nhóm khi thêm mới (như HTsoft); đối tượng cũ chưa có nhóm (khách tự tạo từ máy bán hàng) vẫn sửa được.
    if (isNew && choices.length && !v.groupCode) bad.push('Thuộc nhóm');
    if (!v.code?.trim()) bad.push(`Mã ${noun}`);
    if (v.email?.trim() && !isEmail(v.email.trim())) bad.push('Email không hợp lệ');
    setInvalid(bad);
    return !bad.length;
  };

  const viewAgain = useViewAgain();
  // Khung Vì sao (PHASE-023): nhà cung cấp cần MST, MST sai định dạng, trùng tên — cảnh báo mềm, lưu phải ghi lý do.
  const doiThuocTinh = !isNew && ((v.name ?? '').trim() !== goc.name || (v.taxCode ?? '').trim() !== goc.taxCode || (v.address ?? '').trim() !== goc.address);
  const vf = doiThuocTinh && validFrom ? validFrom : undefined;
  const why = useCatalogWhy('/api/v1/partners/validate', { code: (v.code ?? '').trim(), name: v.name ?? '', kind, alsoKinds: (v.alsoKinds ?? []).filter((k) => k === 'customer' || k === 'supplier'), taxCode: v.taxCode?.trim() || null, validFrom: vf }, Boolean(v.code?.trim()));
  const ack = useWarnAck(why.findings);
  const save = useMutation({
    mutationFn: (warnAck?: CatalogWarnAck) => {
      const code = (v.code ?? '').trim();
      const body = {
        warnAck, validFrom: vf,
        name: v.name ?? '', kind, taxCode: v.taxCode?.trim() || undefined, address: v.address || undefined, email: v.email?.trim() || undefined, phone: v.phone?.trim() || undefined,
        groupCode: v.groupCode || null, isActive: v.isActive ?? true, paymentTermDays: v.paymentTermDays ?? null, creditLimit: v.creditLimit ?? null, note: v.note ?? '',
        contactName: v.contactName ?? '', bankAccountNo: v.bankAccountNo ?? '', bankAccountHolder: v.bankAccountHolder ?? '', bankName: v.bankName ?? '', maxOpenDocs: v.maxOpenDocs ?? null,
        mobile: v.mobile ?? '', fax: v.fax ?? '', website: v.website ?? '', position: v.position ?? '', shortName: v.shortName ?? '',
        companyName: kind === 'supplier' ? v.name ?? '' : v.companyName ?? '', companyAddress: kind === 'supplier' ? v.address ?? '' : v.companyAddress ?? '',
        managerCode: v.managerCode || null, branchCode: v.branchCode || null,
        birthDate: v.birthDate || null, gender: v.gender ?? '', alias: v.alias ?? '', isProspect: v.isProspect ?? false, customerType: v.customerType ?? '',
        alsoKinds: (v.alsoKinds ?? []).filter((k) => k !== kind && (k === 'customer' || k === 'supplier')),
        parentCode: v.parentCode || null,
      };
      return isNew ? api.post('/api/v1/partners', { code, ...body }) : api.put(`/api/v1/partners/${encodeURIComponent(code)}`, body);
    },
    onSuccess: () => {
      flashSaved(savedNote(why.findings));
      void qc.invalidateQueries({ queryKey: ['partners'] }); void qc.invalidateQueries({ queryKey: ['partner-groups'] });
      // Đang nằm trong khung của trang quản trị → báo mã đối tượng vừa lưu để bên đó chọn luôn.
      // Mở từ nút "+" NCC của phiếu nhập (cửa sổ riêng) → báo cửa sổ phiếu để tải lại NCC và chọn luôn.
      if (window.opener) window.opener.postMessage({ type: 'ketoan:partner-saved', code: (v.code ?? '').trim(), kind }, '*');
      // Mở từ nút + của ô chọn trên chứng từ: báo mã vừa thêm để ô tự điền.
      if (isNew) onSaved?.((v.code ?? '').trim());
      if (isNew) onClose(); else viewAgain[1]();
    },
  });
  const submit = () => { if (validate()) ack.request((a) => save.mutate(a)); };
  /** Mở một đối tượng khác (đơn vị con) ngay trong hộp thoại. */
  const openCode = async (c: string) => {
    const p = (await api.get<Partner[]>('/api/v1/partners', { search: c, status: 'all', pageSize: 20 }).catch(() => [])).find((x) => x.code === c);
    if (p) onSwitch?.(p);
  };
  const half = { gridColumn: 'span 2', alignSelf: 'start' } as const;

  return (
    <Modal viewAgain={viewAgain} viewFirst={!isNew} wide title="Khách hàng / Nhà cung cấp" onClose={onClose}
      footer={<>
        {onBack && <button type="button" className="btn" data-view-ok title="Lùi về hồ sơ vừa xem" onClick={onBack}><ArrowLeft size={14} /> Quay lại</button>}
        <label className="checkbox chk-explain"><input type="checkbox" checked={v.isActive ?? true} onChange={(e) => set({ isActive: e.target.checked })} /> <span><b>{kind === 'supplier' ? 'Đang giao dịch' : 'Theo dõi'}</b><small>{(v.isActive ?? true) ? 'Đang dùng — hiện trong ô chọn khi lập phiếu' : 'Ngừng — không hiện khi lập phiếu mới, số liệu cũ giữ nguyên'}</small></span></label>
        <span className="muted" data-view-ok style={{ marginRight: 'auto', fontSize: 12 }}>{isNew ? 'Tạo mới' : `Tạo bởi ${v.createdBy || '—'}${v.createdTime ? ` lúc ${new Date(v.createdTime).toLocaleString('vi-VN', { hour12: false })}` : v.createdAt ? ` ngày ${new Date(v.createdAt).toLocaleDateString('vi-VN')}` : ''}`}</span>
        <button className="btn btn-primary" disabled={save.isPending || why.blocked} onClick={submit}>{ack.label}</button><button className="btn" onClick={onClose}>Thoát</button>
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
      {/* [2026-11-19 08:49 AM khanhtd] đơn vị cha: đối tượng thuộc nhóm cha của nhóm đang chọn (nhóm không có cha thì cùng nhóm), lọc theo vai trò đã tích */}
      <ODonViCha value={v.parentCode} self={v.code} isNew={isNew} groupCode={parentGroupCode} kind={parentKind} onChange={(c) => void changeParent(c)} />
      {doiThuocTinh && <div className="alert full" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>Đang đổi <b>{[(v.taxCode ?? '').trim() !== goc.taxCode && 'MST', (v.name ?? '').trim() !== goc.name && 'tên', (v.address ?? '').trim() !== goc.address && 'địa chỉ'].filter(Boolean).join(', ')}</b>. Hiệu lực từ ngày</span>
        <input type="date" className="input" style={{ width: 160 }} value={validFrom} max={homNay()} onChange={(e) => setValidFrom(e.target.value)} title="Trống = từ hôm nay. Không chọn ngày sau hôm nay; phải sau ngày bắt đầu của phiên bản đang dùng" />
        <span className="muted" style={{ fontSize: 12 }}>Trống = từ hôm nay. Chứng từ đã lập không bị sửa; hoá đơn từ ngày này còn mang MST cũ được liệt kê để rà (mục Lịch sử MST, Bàn làm việc kế toán). Nhiều thay đổi ở các ngày khác nhau: ghi từng lần, ngày cũ trước.</span>
      </div>}
      {suggest && <div className="alert full" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span>MST <b className="mono">{v.taxCode}</b> là MST chi nhánh của <b>{suggest.code} - {suggest.name}</b> (MST {suggest.taxCode}). Gắn {noun} này làm đơn vị con?</span>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => void changeParent(suggest.code)}>Gắn làm đơn vị con</button>
        <button type="button" className="btn btn-sm" onClick={() => setSuggest(null)}>Không</button>
      </div>}
      {kind === 'supplier' && <NccFields v={v} set={set} txt={txt} choices={choices} isNew={isNew} codeHint={codeHint} noun={noun}
        changeGroup={changeGroup} fetchCode={() => void fetchCode(v.groupCode, kind, true)} setCode={(c) => { set({ code: c }); setCodeTouched(true); }} checkDuplicate={checkDuplicate} checkBranchMst={checkBranchMst} />}
      {kind !== 'supplier' && <div className="tabs full" role="tablist">
        <button role="tab" className={`tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>Thông tin chung</button>
        <button role="tab" className={`tab ${tab === 'trade' ? 'active' : ''}`} onClick={() => setTab('trade')}>Mua bán hàng</button>
        <button role="tab" className={`tab ${tab === 'internal' ? 'active' : ''}`} onClick={() => setTab('internal')}>Nội bộ quản lý</button>
        {slotTabs.map((s) => <button key={s.module} role="tab" className={`tab ${tab === `mod:${s.module}` ? 'active' : ''}`} onClick={() => setTab(`mod:${s.module}`)}>{s.label}</button>)}
        {!isNew && <button role="tab" data-view-ok className={`tab ${tab === 'family' ? 'active' : ''}`} onClick={() => setTab('family')}>Đơn vị con · Lịch sử</button>}
      </div>}
      {!isNew && (kind === 'supplier' || tab === 'family') && <>
        <DonViCon code={v.code ?? ''} onOpen={onSwitch ? (c) => void openCode(c) : undefined} onAdd={onSwitch ? () => onSwitch(childOf(v)) : undefined} />
        <LichSuThuocTinh code={v.code ?? ''} />
        <LichSuDoiTuong code={v.code ?? ''} />
      </>}
      {kind !== 'supplier' && slotTabs.filter((s) => tab === `mod:${s.module}`).map((s) => <s.component key={s.module} code={v.code ?? ''} name={v.name ?? ''} />)}
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
            {/* [2026-11-16 kiennt] một ô Di động thay cho Mobile + Telephone: ghi vào cả hai trường để tra cứu, máy bán hàng dùng chung (đóng góp) */}
            {/* [2026-11-20 kiennt] NT-DM-016 — đổi nhãn "Di động" → "Điện thoại" (vẫn ghi cả hai trường) (đóng góp) */}
            <Field label="Điện thoại"><input className="input mono" value={v.mobile || v.phone || ''} onChange={(e) => set({ mobile: e.target.value, phone: e.target.value })} onBlur={(e) => void checkDuplicate('phone', e.target.value.trim(), 'Số di động')} /></Field>
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
              onBlurCheck={(val) => { void checkDuplicate('taxCode', val, 'Mã số thuế'); void checkBranchMst(val); }}
              onFill={(f, overwrite) => set({
                taxCode: f.taxCode,
                ...(f.name && (overwrite || !v.companyName) ? { companyName: f.name } : {}),
                ...(f.address && (overwrite || !v.companyAddress) ? { companyAddress: f.address } : {}),
                ...(f.shortName && (overwrite || !v.shortName) ? { shortName: f.shortName } : {}),
                ...(!v.name && f.name ? { name: f.name } : {}),
                ...(f.representative && !v.contactName ? { contactName: f.representative } : {}),
              })}
              // [2026-11-19 10:43 AM khanhtd] DM12 — đổi MST: xoá thông tin đã điền theo MST cũ (ô đã sửa tay thì giữ)
              // [2026-11-19 11:05 AM khanhtd] DM12 — thêm mới: xoá hết khối công ty kể cả ô sửa tay; sửa đối tượng đã có: không xoá (đổi MST theo ngày hiệu lực)
              onClear={isNew ? (p) => set({
                companyName: '', companyAddress: '', shortName: '', contactName: '',
                ...(p.name && v.name === p.name ? { name: '' } : {}),
              }) : undefined} />
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
      <WhyPanel findings={why.findings} />
      <WarnAckBox ack={ack} />
      {invalid.length > 0 && <div className="alert alert-bad full">Chưa nhập đủ: {invalid.join(', ')}</div>}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}

/**
 * Form NHÀ CUNG CẤP (gọn — NCC là doanh nghiệp): một khối thông tin chính thức (tên, MST, địa chỉ đúng trên hoá đơn), liên hệ,
 * tài khoản ngân hàng. Không có các ô chỉ dành cho khách lẻ (ngày sinh, giới tính, khách tiềm năng, loại khách hàng, fax, alias)
 * và không khai hạn mức / hạn trả ở đây — khai ở Hồ sơ NCC → chính sách (một nơi, tránh lệch). Người tạo / ngày giờ tạo ở chân form.
 */
function NccFields({ v, set, txt, choices, isNew, codeHint, noun, changeGroup, fetchCode, setCode, checkDuplicate, checkBranchMst }: {
  v: Partial<Partner>; set: (p: Partial<Partner>) => void; txt: (k: keyof Partner, label: string, full?: boolean, mono?: boolean, onBlur?: (val: string) => void) => ReactNode;
  choices: Group[]; isNew: boolean; codeHint: string; noun: string; changeGroup: (g: string | null) => void; fetchCode: () => void; setCode: (c: string) => void;
  checkDuplicate: (field: 'phone' | 'taxCode', val: string, label: string) => Promise<void>;
  checkBranchMst?: (val: string) => Promise<void>;
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
        onBlurCheck={(val) => { void checkDuplicate('taxCode', val, 'Mã số thuế'); void checkBranchMst?.(val); }}
        onFill={(f, overwrite) => set({
          taxCode: f.taxCode,
          ...(f.name && (overwrite || !v.name) ? { name: f.name } : {}),
          ...(f.address && (overwrite || !v.address) ? { address: f.address } : {}),
          ...(f.shortName && (overwrite || !v.shortName) ? { shortName: f.shortName } : {}),
          ...(f.representative && !v.contactName ? { contactName: f.representative, position: v.position || 'Người đại diện theo pháp luật' } : {}),
        })}
        // [2026-11-19 10:43 AM khanhtd] DM13 — đổi MST: xoá thông tin đã điền theo MST cũ (ô đã sửa tay thì giữ)
        // [2026-11-19 11:05 AM khanhtd] DM13 — thêm mới: xoá hết tên / tên viết tắt / địa chỉ / người đại diện kể cả ô sửa tay; sửa NCC đã có: không xoá
        onClear={isNew ? () => set({
          name: '', address: '', shortName: '', contactName: '',
          ...(v.position === 'Người đại diện theo pháp luật' ? { position: '' } : {}),
        }) : undefined} />
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
  // [2026-11-17 07:28 PM kiennt] NT-DM-002 L01 — thêm nhóm trùng mã (cả mã trong thùng rác) thì báo, khoá Ghi (trước đây PUT ghi đè nhóm cũ);
  //   L06 — ô Nhóm cha bỏ các nhóm con, cháu của nhóm đang sửa (chống vòng cha – con) (đóng góp)
  const maTrung = useMaTrung({ isNew: editing?.isNew, code: editing?.code, list: groups.data, catalog: 'partner-groups' });
  const nhanhCon = useMemo(() => {
    const s = new Set<string>();
    const ma = editing?.code;
    if (!ma || editing?.isNew) return s;
    const ds = groups.data ?? [];
    for (let them = true; them;) { them = false; for (const g of ds) if (g.parentCode && (g.parentCode === ma || s.has(g.parentCode)) && !s.has(g.code)) { s.add(g.code); them = true; } }
    return s;
  }, [groups.data, editing?.code, editing?.isNew]);
  const del = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/partner-groups/${encodeURIComponent(code)}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['partner-groups'] }); } });
  const e = editing;
  return (
    <>
      <PageHeader actions={<NutQuyTac entity="partner" logEntity="partner-groups" ten="nhóm đối tượng" />} title="Nhóm đối tượng" code="DM08" subtitle="Nhóm khách hàng, nhà cung cấp dùng để lọc và gom báo cáo theo nhóm" helpKey="doi-tuong" />
      <div className="card">
        <CatalogToolbar
          trash={{ catalog: 'partner-groups', title: 'Nhóm khách hàng, nhà cung cấp', sel: sel ? { key: sel.code, label: sel.name } : null }}
          phai
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, kind: 'any', isActive: true })}
          // [2026-11-18 01:40 PM kiennt] NT-DM-006 — nút Nhân bản (đóng góp)
          onCopy={() => sel && setEditing({ ...sel, code: '', partners: 0, isNew: true, isActive: true })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá nhóm ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); }}
          onRefresh={() => groups.refetch()}
          onExport={() => exportRef.current?.()}
          // [2026-11-18 10:40 AM kiennt] NT-DM-005 — nút Nhập Excel (khứ hồi với tệp Xuất) (đóng góp)
          extra={canWrite && <NutNhapExcel loai={nhapLoai('nhom-doi-tuong')!} />}
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
              { key: 'active', header: 'Hoạt động', type: 'check', width: 85, value: (g) => g.isActive },
            ] satisfies Column<Group>[]} />
        )}
      </div>
      {e && (
        <Modal viewAgain={viewAgain} viewFirst={!e.isNew} title="Nhóm khách hàng" onClose={() => setEditing(null)}
          footer={<><button className="btn btn-primary" disabled={save.isPending || !e.code || !e.name || Boolean(maTrung)} title={maTrung || undefined} onClick={() => save.mutate(e)}>Ghi</button><button className="btn" onClick={() => setEditing(null)}>Thoát</button></>}>
          <Field label="Mã nhóm (*)" error={maTrung || null}><input className="input mono" value={e.code ?? ''} disabled={!e.isNew} onChange={(ev) => setEditing({ ...e, code: ev.target.value.trim() })} autoFocus /></Field>
          <Field label="Nhóm khách hàng (*)"><input className="input" value={e.name ?? ''} onChange={(ev) => setEditing({ ...e, name: ev.target.value })} /></Field>
          <Field label="Mô tả" full><input className="input" value={e.note ?? ''} onChange={(ev) => setEditing({ ...e, note: ev.target.value })} /></Field>
          <Field label="Dùng cho">
            <select className="select input" value={e.kind} onChange={(ev) => setEditing({ ...e, kind: ev.target.value })}>
              <option value="any">Mọi loại</option>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Nhóm cha"><ListPicker items={(groups.data ?? []).filter((g) => g.code !== e.code && !nhanhCon.has(g.code)).map((g) => ({ code: g.code, name: g.name }))} value={e.parentCode ?? ''} onChange={(parentCode) => setEditing({ ...e, parentCode: parentCode || null })} placeholder="Không có" /></Field>
          <Field label=" "><label className="checkbox"><input type="checkbox" checked={e.isActive ?? true} onChange={(ev) => setEditing({ ...e, isActive: ev.target.checked })} /> Đang dùng</label></Field>
          {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
        </Modal>
      )}
    </>
  );
}
