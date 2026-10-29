/**
 * Danh mục chiều phân tích dùng chung một màn: Khoản mục (ACC24), Hợp đồng (ACC25), Bộ phận (ACC26), Nhóm CCDC (ACC19),
 * Nguồn vốn (ACC20), Mục đích sử dụng (ACC21), Nhân viên (DM04), Vụ việc (DM06), Dự án (DM07).
 * Thanh nút Thêm · Sửa · Xoá · Nạp · Xuất; lưới có hàng lọc, nhóm theo cột; bấm đúp dòng để sửa.
 * Cột lưới, nhãn form theo từng danh mục (META). Mã đã dùng không xoá được: bỏ tích "Theo dõi" để ngừng.
 * Hợp đồng có thêm: loại, hợp đồng gốc, khách hàng, nhân viên, ngày ký / kết thúc, giá trị, thuế nộp thay chủ nhà, lịch thanh toán.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { CONTRACT_TYPES, type DimensionKind } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { money } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { ListPicker, PartnerPicker } from '@/components/pickers';
import { useBranches } from '@/components/filters';

interface Extra {
  type?: string; signedDate?: string; endDate?: string; value?: number; partnerCode?: string; partnerName?: string; landlordTax?: boolean; employeeCode?: string; createdBy?: string;
  /** Bộ phận, nhân viên: địa chỉ, điện thoại; nhân viên thêm di động, email, chức vụ, chi nhánh làm việc, mã phòng ban, nhóm. */
  address?: string; phone?: string; mobile?: string; email?: string; position?: string; branchCode?: string; departmentCode?: string; group?: string;
}
interface Row { code: string; name: string; parentCode: string | null; note: string; isActive: boolean; extra: Extra }
type Draft = Partial<Row> & { isNew?: boolean };
interface Schedule { seq: number; dueDate: string; amount: number; taxAmount: number; description: string; status: 'pending' | 'paid' | 'cancelled'; paidDate: string | null; paidRef: string }

const TYPE_NAME = Object.fromEntries(CONTRACT_TYPES) as Record<string, string>;
interface Meta {
  title: string; code: string; subtitle: string; helpKey: string;
  /** Tiêu đề form thêm / sửa. */
  form: string;
  /** Nhãn mã cha trên form (bỏ trống: danh mục không có cấp cha). */
  parentLabel?: string;
  /** Tiêu đề cột: mã, tên, ghi chú, mã cha. */
  cols: { code: string; name: string; note: string; parent?: string };
  /** Form có ô "Theo dõi" (đang dùng); lưới có cột "Ẩn". */
  tracked: boolean;
}
const META: Record<DimensionKind, Meta> = {
  cost_item: { title: 'Khoản mục', code: 'ACC24', subtitle: 'Khoản mục chi phí dùng để phân tích chi phí trên từng dòng phiếu', helpKey: 'khoan-muc-bo-phan', form: 'Khoản mục', parentLabel: 'Khoản mục cha', cols: { code: 'Mã khoản mục', name: 'Tên khoản mục', note: 'Ghi chú', parent: 'Khoản mục cha' }, tracked: true },
  department: { title: 'Bộ phận', code: 'ACC26', subtitle: 'Phòng ban, bộ phận chịu chi phí hoặc tạo doanh thu; mỗi cửa hàng một bộ phận BH + mã cửa hàng', helpKey: 'khoan-muc-bo-phan', form: 'Phòng ban/ Bộ phận', parentLabel: 'Thuộc PB', cols: { code: 'Mã PB', name: 'Tên PB', note: 'Ghi chú', parent: 'Bộ phận trực thuộc' }, tracked: true },
  employee: { title: 'Danh mục nhân viên', code: 'DM04', subtitle: 'Nhân viên phụ trách bán hàng, thu tiền: dùng cho báo cáo công nợ theo nhân viên. Nhân viên lập phiếu trên hệ thống bán hàng được tự thêm.', helpKey: 'cong-no-theo-nhan-vien', form: 'Thông tin nhân viên', cols: { code: 'Mã NV', name: 'Tên NV', note: 'Ghi chú' }, tracked: true },
  case: { title: 'Danh mục vụ việc', code: 'DM06', subtitle: 'Vụ việc cần gom doanh thu, chi phí riêng (khai trương cửa hàng, sự kiện, sửa chữa lớn…)', helpKey: 'khoan-muc-bo-phan', form: 'Vụ việc', parentLabel: 'Vụ việc cha', cols: { code: 'Mã vụ việc', name: 'Tên vụ việc', note: 'Ghi chú', parent: 'Vụ việc cha' }, tracked: true },
  project: { title: 'Danh mục dự án', code: 'DM07', subtitle: 'Dự án đầu tư, xây dựng, triển khai cần theo dõi chi phí và nguồn vốn riêng', helpKey: 'khoan-muc-bo-phan', form: 'Dự án', parentLabel: 'Dự án cha', cols: { code: 'Mã dự án', name: 'Tên dự án', note: 'Ghi chú', parent: 'Dự án cha' }, tracked: true },
  capital_source: { title: 'Nguồn vốn', code: 'ACC20', subtitle: 'Nguồn tiền dùng cho chi phí, tài sản: vốn chủ sở hữu, vốn vay, vốn tài trợ…', helpKey: 'khoan-muc-bo-phan', form: 'Nguồn vốn', cols: { code: 'Mã', name: 'Tên', note: 'Mô tả' }, tracked: false },
  tool_group: { title: 'DM Nhóm công cụ dụng cụ', code: 'ACC19', subtitle: 'Nhóm thẻ công cụ dụng cụ, chi phí trả trước để lọc, gom báo cáo phân bổ', helpKey: 'tai-san', form: 'Nhóm công cụ dụng cụ', cols: { code: 'Mã nhóm', name: 'Tên nhóm', note: 'Mô tả' }, tracked: false },
  usage_purpose: { title: 'DM Mục đích sử dụng', code: 'ACC21', subtitle: 'Mục đích sử dụng tài sản, công cụ dụng cụ (bán hàng, quản lý, cho thuê…) ghi trên thẻ', helpKey: 'tai-san', form: 'Mục đích sử dụng', cols: { code: 'Mã', name: 'Tên', note: 'Mô tả' }, tracked: false },
  contract: { title: 'Hợp đồng', code: 'ACC25', subtitle: 'Hợp đồng thuê nhà, tín dụng, mua tài sản, nhà cung cấp…: theo dõi doanh thu, chi phí, công nợ và lịch thanh toán theo từng hợp đồng', helpKey: 'hop-dong', form: 'Thông tin hợp đồng', parentLabel: 'HĐ gốc', cols: { code: 'Số HĐ', name: 'Tên HĐ', note: 'Ghi chú', parent: 'Mã HĐ gốc' }, tracked: true },
};

const hiddenCol: Column<Row> = { key: 'hidden', header: 'Ẩn', type: 'check', width: 50, value: (r) => !r.isActive };

function columnsOf(kind: DimensionKind, employees: Map<string, string>): Column<Row>[] {
  const m = META[kind];
  const code: Column<Row> = { key: 'code', header: m.cols.code, type: 'code', width: 110 };
  const name: Column<Row> = { key: 'name', header: m.cols.name, width: 300 };
  const note: Column<Row> = { key: 'note', header: m.cols.note, width: 180 };
  const parent: Column<Row> = { key: 'parentCode', header: m.cols.parent ?? 'Thuộc', type: 'code', width: 130 };
  switch (kind) {
    case 'cost_item': return [code, name, note, parent, { ...hiddenCol, hidden: true }];
    case 'department': return [code, { ...name, width: 220 }, { key: 'address', header: 'Địa chỉ', width: 200, value: (r) => r.extra.address ?? '' }, { key: 'phone', header: 'Điện thoại', width: 110, value: (r) => r.extra.phone ?? '' }, note, hiddenCol, parent];
    case 'contract': return [
      { ...code, width: 120 }, { ...name, width: 240 },
      { key: 'partnerCode', header: 'Khách hàng', type: 'code', width: 110, value: (r) => r.extra.partnerCode ?? '' },
      { key: 'type', header: 'Loại HĐ', width: 120, value: (r) => TYPE_NAME[r.extra.type ?? ''] ?? '' },
      { key: 'employeeCode', header: 'Mã nhân viên', type: 'code', width: 100, value: (r) => r.extra.employeeCode ?? '' },
      { key: 'employeeName', header: 'Nhân viên', width: 150, value: (r) => employees.get(r.extra.employeeCode ?? '') ?? '' },
      parent,
      { key: 'partnerName', header: 'Tên khách hàng', width: 220, value: (r) => r.extra.partnerName ?? '' },
      { key: 'signedDate', header: 'Ngày ký', type: 'date', width: 95, value: (r) => r.extra.signedDate ?? '' },
      { key: 'createdBy', header: 'User tạo', width: 110, value: (r) => r.extra.createdBy ?? '' },
      hiddenCol,
      { key: 'endDate', header: 'Ngày kết thúc', type: 'date', width: 105, value: (r) => r.extra.endDate ?? '' },
      { key: 'value', header: 'Giá trị', type: 'money', width: 120, value: (r) => r.extra.value ?? 0 },
      note,
    ];
    case 'employee': {
      const x = (k: keyof Extra, header: string, width: number, type?: 'code'): Column<Row> => ({ key: k, header, width, type, value: (r) => String(r.extra[k] ?? '') });
      return [
        { ...code, width: 120 }, { ...name, width: 200 }, x('address', 'Địa chỉ', 200), x('phone', 'Điện thoại', 110, 'code'), x('mobile', 'Di động', 110, 'code'),
        x('position', 'Chức vụ', 140), x('email', 'Email', 170), { key: 'tracked', header: 'Theo dõi', type: 'check', width: 70, value: (r) => r.isActive },
        x('group', 'Nhóm NV', 120), x('branchCode', 'Chi nhánh làm việc', 130, 'code'), note, x('departmentCode', 'Mã phòng ban', 110, 'code'),
      ];
    }
    case 'capital_source': case 'tool_group': case 'usage_purpose': return [code, { ...name, width: 260 }, { ...note, width: 260 }];
    default: return [code, name, ...(m.parentLabel ? [parent] : []), note, hiddenCol];
  }
}

export function DimensionsPage({ kind }: { kind: DimensionKind }) {
  const meta = META[kind];
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [sel, setSel] = useState<Row | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const q = useQuery({ queryKey: ['dimensions', kind], queryFn: () => api.get<Row[]>(`/api/v1/dimensions/${kind}`) });
  const isContract = kind === 'contract';
  const employeesQ = useQuery({ queryKey: ['dimensions', 'employee'], queryFn: () => api.get<Row[]>('/api/v1/dimensions/employee'), enabled: isContract, staleTime: 60_000 });
  const employees = useMemo(() => new Map((employeesQ.data ?? []).map((e) => [e.code, e.name])), [employeesQ.data]);
  const columns = useMemo(() => columnsOf(kind, employees), [kind, employees]);
  const del = useMutation({
    mutationFn: (code: string) => api.delete(`/api/v1/dimensions/${kind}/${encodeURIComponent(code)}`),
    onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['dimensions', kind] }); },
  });
  const remove = () => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); };
  return (
    <>
      <PageHeader title={meta.title} code={meta.code} subtitle={meta.subtitle} helpKey={meta.helpKey} />
      <div className="card">
        <CatalogToolbar
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, isActive: true, extra: isContract ? { type: 'rent' } : {} })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={remove}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
        />
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey={`dim2-${kind}`}
            exportName={`danh-muc-${kind}`}
            groupable
            exportRef={exportRef}
            rows={q.data ?? []}
            rowKey={(r) => r.code}
            onSelect={setSel}
            onRowDoubleClick={(r) => canWrite && setEditing(r)}
            rowClassName={(r) => (r.isActive ? '' : 'muted')}
            footerLabel={false}
            emptyText={(q.data ?? []).length ? undefined : 'Chưa có mã nào. Khi danh mục còn trống, phiếu nhập chưa bắt buộc chọn chiều này.'}
            columns={columns}
          />
        )}
      </div>
      {editing && <DimensionForm kind={kind} value={editing} parents={q.data ?? []} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Sinh lịch thanh toán đều: từ ngày đầu, số kỳ, mỗi kỳ cách n tháng. */
function generate(first: string, periods: number, months: number, amount: number, tax: number): Schedule[] {
  const [y, m, d] = first.split('-').map(Number) as [number, number, number];
  return Array.from({ length: periods }, (_, i) => {
    const mm = m - 1 + i * months;
    const last = new Date(Date.UTC(y, mm + 1, 0)).getUTCDate();
    const due = new Date(Date.UTC(y, mm, Math.min(d, last))).toISOString().slice(0, 10);
    return { seq: i + 1, dueDate: due, amount, taxAmount: tax, description: `Kỳ ${i + 1}`, status: 'pending', paidDate: null, paidRef: '' };
  });
}

function DimensionForm({ kind, value, parents, onClose }: { kind: DimensionKind; value: Draft; parents: Row[]; onClose: () => void }) {
  const qc = useQueryClient();
  const meta = META[kind];
  const isContract = kind === 'contract';
  const [v, setV] = useState<Draft>({ ...value, extra: { ...value.extra } });
  const set = (p: Draft) => setV((x) => ({ ...x, ...p }));
  const setExtra = (p: Extra) => setV((x) => ({ ...x, extra: { ...x.extra, ...p } }));
  const employees = useQuery({ queryKey: ['dimensions', 'employee'], queryFn: () => api.get<Row[]>('/api/v1/dimensions/employee'), enabled: kind === 'contract', staleTime: 60_000 }).data ?? [];
  const branches = useBranches().data ?? [];
  const departments = useQuery({ queryKey: ['dimensions', 'department'], queryFn: () => api.get<Row[]>('/api/v1/dimensions/department'), enabled: kind === 'employee', staleTime: 60_000 }).data ?? [];
  const schedQ = useQuery({ queryKey: ['contract-schedules', value.code], queryFn: () => api.get<Schedule[]>(`/api/v1/contracts/${encodeURIComponent(value.code!)}/schedules`), enabled: isContract && !value.isNew });
  const [sched, setSched] = useState<Schedule[]>([]);
  const [schedDirty, setSchedDirty] = useState(false);
  useEffect(() => { if (schedQ.data) setSched(schedQ.data); }, [schedQ.data]);
  const [gen, setGen] = useState({ first: '', periods: '12', months: '1', amount: '', tax: '' });
  const code = (v.code ?? '').trim();
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: async () => {
      await api.put(`/api/v1/dimensions/${kind}/${encodeURIComponent(code)}`, { name: v.name, parentCode: v.parentCode || undefined, note: v.note ?? '', isActive: v.isActive !== false, extra: v.extra ?? {} });
      if (isContract && schedDirty) await api.put(`/api/v1/contracts/${encodeURIComponent(code)}/schedules`, { schedules: sched });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['dimensions', kind] }); void qc.invalidateQueries({ queryKey: ['contract-schedules'] }); if (value.isNew) onClose(); else viewAgain[1](); },
  });
  const setRow = (i: number, p: Partial<Schedule>) => { setSched((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x))); setSchedDirty(true); };
  const n = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;
  const total = sched.filter((x) => x.status !== 'cancelled').reduce((t, x) => t + x.amount, 0);
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} wide={isContract} title={meta.form} onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !code || !v.name?.trim()} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Đóng</button></>}>
      {isContract && <div className="field-title full">Thông tin chung hợp đồng</div>}
      <Field label="Mã (*)"><input className="input mono" value={v.code ?? ''} disabled={!value.isNew} onChange={(e) => set({ code: e.target.value.trim() })} autoFocus /></Field>
      <Field label="Tên" full={!isContract}><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label={kind === 'cost_item' || kind === 'department' ? 'Chi chú' : 'Ghi chú'} full={!isContract}><input className="input" value={v.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></Field>
      {isContract && (
        <>
          <Field label="Ngày ký HĐ"><input type="date" className="input" value={v.extra?.signedDate ?? ''} onChange={(e) => setExtra({ signedDate: e.target.value })} /></Field>
          <Field label="Giá trị"><input className="input num" inputMode="numeric" value={v.extra?.value ? money(v.extra.value) : ''} onChange={(e) => setExtra({ value: n(e.target.value) || undefined })} /></Field>
          <Field label="Nhân viên"><ListPicker items={employees.filter((e) => e.isActive || e.code === v.extra?.employeeCode).map((e) => ({ code: e.code, name: e.name }))} value={v.extra?.employeeCode ?? ''} onChange={(employeeCode) => setExtra({ employeeCode })} placeholder={employees.length ? 'Bấm để chọn' : 'Chưa khai danh mục'} /></Field>
        </>
      )}
      {meta.parentLabel && (
        <Field label={meta.parentLabel}>
          <ListPicker items={parents.filter((p) => p.code !== v.code).map((p) => ({ code: p.code, name: p.name }))} value={v.parentCode ?? ''} onChange={(parentCode) => set({ parentCode })} placeholder="Không" />
        </Field>
      )}
      {kind === 'department' && (
        <>
          <Field label="Địa chỉ"><input className="input" value={v.extra?.address ?? ''} onChange={(e) => setExtra({ address: e.target.value })} /></Field>
          <Field label="Điện thoại"><input className="input" value={v.extra?.phone ?? ''} onChange={(e) => setExtra({ phone: e.target.value })} /></Field>
        </>
      )}
      {kind === 'employee' && (
        <>
          <Field label="Địa chỉ" full><input className="input" value={v.extra?.address ?? ''} onChange={(e) => setExtra({ address: e.target.value })} /></Field>
          <Field label="Điện thoại"><input className="input" value={v.extra?.phone ?? ''} onChange={(e) => setExtra({ phone: e.target.value })} /></Field>
          <Field label="Di động"><input className="input" value={v.extra?.mobile ?? ''} onChange={(e) => setExtra({ mobile: e.target.value })} /></Field>
          <Field label="Email"><input className="input" value={v.extra?.email ?? ''} onChange={(e) => setExtra({ email: e.target.value })} /></Field>
          <Field label="Chức vụ"><input className="input" value={v.extra?.position ?? ''} onChange={(e) => setExtra({ position: e.target.value })} /></Field>
          <Field label="Nhóm"><input className="input" value={v.extra?.group ?? ''} onChange={(e) => setExtra({ group: e.target.value })} /></Field>
          <Field label="Làm việc tại CN"><ListPicker items={branches.map((b) => ({ code: b.code, name: b.name }))} value={v.extra?.branchCode ?? ''} onChange={(branchCode) => setExtra({ branchCode })} placeholder="Bấm để chọn" /></Field>
          <Field label="Mã phòng ban"><ListPicker items={departments.map((d) => ({ code: d.code, name: d.name }))} value={v.extra?.departmentCode ?? ''} onChange={(departmentCode) => setExtra({ departmentCode })} placeholder="Bấm để chọn" /></Field>
        </>
      )}
      {meta.tracked && <Field label=" "><label className="checkbox"><input type="checkbox" checked={v.isActive !== false} onChange={(e) => set({ isActive: e.target.checked })} /> Theo dõi</label></Field>}
      {isContract && (
        <>
          <Field label="Khách hàng"><PartnerPicker value={v.extra?.partnerCode ?? ''} onChange={(partnerCode) => setExtra({ partnerCode })} /></Field>
          <Field label="Loại hợp đồng">
            <select className="select input" value={v.extra?.type ?? ''} onChange={(e) => setExtra({ type: e.target.value })}>
              <option value="">— Chọn —</option>{CONTRACT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Ngày kết thúc"><input type="date" className="input" value={v.extra?.endDate ?? ''} onChange={(e) => setExtra({ endDate: e.target.value })} /></Field>
          {v.extra?.type === 'rent' && (
            <Field label="Thuế chủ nhà" hint="Đơn vị kê khai, nộp thay thuế GTGT, TNCN của cá nhân cho thuê">
              <label className="checkbox"><input type="checkbox" checked={Boolean(v.extra?.landlordTax)} onChange={(e) => setExtra({ landlordTax: e.target.checked })} /> Nộp thuế thay chủ nhà</label>
            </Field>
          )}
        </>
      )}
      {isContract && (
        <div className="full">
          <div className="field-title">Thông tin thanh toán {sched.length > 0 && <span className="muted">({sched.length} kỳ, tổng {money(total)})</span>}</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', margin: '6px 0' }}>
            <label className="sub-field"><span>Kỳ đầu đến hạn</span><input type="date" className="input" value={gen.first} onChange={(e) => setGen({ ...gen, first: e.target.value })} /></label>
            <label className="sub-field"><span>Số kỳ</span><input className="input num" style={{ width: 70 }} value={gen.periods} onChange={(e) => setGen({ ...gen, periods: e.target.value.replace(/\D/g, '') })} /></label>
            <label className="sub-field"><span>Mỗi kỳ (tháng)</span><input className="input num" style={{ width: 70 }} value={gen.months} onChange={(e) => setGen({ ...gen, months: e.target.value.replace(/\D/g, '') })} /></label>
            <label className="sub-field"><span>Số tiền mỗi kỳ</span><input className="input num" style={{ width: 140 }} value={gen.amount ? money(n(gen.amount)) : ''} onChange={(e) => setGen({ ...gen, amount: e.target.value })} /></label>
            <label className="sub-field"><span>Thuế nộp thay mỗi kỳ</span><input className="input num" style={{ width: 130 }} value={gen.tax ? money(n(gen.tax)) : ''} onChange={(e) => setGen({ ...gen, tax: e.target.value })} /></label>
            <button type="button" className="btn" disabled={!gen.first || !n(gen.periods) || !n(gen.amount)}
              onClick={() => { if (sched.some((x) => x.status === 'paid') && !window.confirm('Lịch hiện có kỳ đã trả. Sinh lại sẽ thay toàn bộ lịch. Tiếp tục?')) return; setSched(generate(gen.first, n(gen.periods), Math.max(1, n(gen.months)), n(gen.amount), n(gen.tax))); setSchedDirty(true); }}>
              Sinh lịch
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { const last = sched[sched.length - 1]; setSched([...sched, { seq: (last?.seq ?? 0) + 1, dueDate: last?.dueDate ?? '', amount: last?.amount ?? 0, taxAmount: last?.taxAmount ?? 0, description: '', status: 'pending', paidDate: null, paidRef: '' }]); setSchedDirty(true); }}>
              <Plus size={14} /> Thêm kỳ
            </button>
          </div>
          {sched.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 280 }}>
              <table className="grid">
                <thead><tr><th>Kỳ</th><th>Ngày đến hạn</th><th className="num">Số tiền</th><th className="num">Thuế nộp thay</th><th>Diễn giải</th><th>Trạng thái</th><th>Số phiếu đã trả</th><th /></tr></thead>
                <tbody>
                  {sched.map((x, i) => (
                    <tr key={i}>
                      <td className="num">{x.seq}</td>
                      <td><input type="date" className="input" value={x.dueDate} onChange={(e) => setRow(i, { dueDate: e.target.value })} /></td>
                      <td><input className="input num" style={{ width: 130 }} value={money(x.amount, { blankZero: false })} onChange={(e) => setRow(i, { amount: n(e.target.value) })} /></td>
                      <td><input className="input num" style={{ width: 120 }} value={money(x.taxAmount)} onChange={(e) => setRow(i, { taxAmount: n(e.target.value) })} /></td>
                      <td><input className="input" value={x.description} onChange={(e) => setRow(i, { description: e.target.value })} /></td>
                      <td>
                        <select className="select input" value={x.status} onChange={(e) => setRow(i, { status: e.target.value as Schedule['status'], paidDate: e.target.value === 'paid' ? new Date().toISOString().slice(0, 10) : null })}>
                          <option value="pending">Chưa trả</option><option value="paid">Đã trả</option><option value="cancelled">Huỷ</option>
                        </select>
                      </td>
                      <td><input className="input" style={{ width: 130 }} value={x.paidRef} disabled={x.status !== 'paid'} onChange={(e) => setRow(i, { paidRef: e.target.value })} /></td>
                      <td><button type="button" className="btn btn-sm btn-ghost" title="Xoá kỳ" onClick={() => { setSched((xs) => xs.filter((_, j) => j !== i)); setSchedDirty(true); }}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="muted" style={{ marginTop: 4 }}>Các kỳ chưa trả hiện ở màn <b>Lịch thanh toán hợp đồng</b> (nhắc hạn). Bấm Ghi để lưu cả hợp đồng và lịch.</div>
        </div>
      )}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}
