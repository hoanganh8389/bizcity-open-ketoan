/**
 * Tài sản cố định, công cụ dụng cụ, chi phí trả trước:
 *   AssetsPage           danh sách thẻ + thêm / sửa / ghi giảm / nhập từ Excel (ACC28, ACC30 TSCĐ; ACC22 CCDC; ACC23 chi phí trả trước)
 *   AssetCategoriesPage  loại tài sản (ACC37)
 *   AssetEventsPage      đánh giá lại (ACC32), điều chuyển (ACC33), kiểm kê (ACC35)
 *   DepreciationPage     tính khấu hao, phân bổ trong tháng, sửa tay số trích (ACC31)
 *   AssetRegisterPage    sổ tài sản / bảng tính khấu hao, phân bổ (ACC29, ACC27, ACC42, ACC85)
 * In (assetPrint.tsx): thẻ TSCĐ S23-DN / thẻ CCDC / thẻ chi phí trả trước, biên bản thanh lý 02-TSCĐ — tích nhiều thẻ ở
 * danh sách, hoặc nút In trong hộp thẻ.
 */
import { shrinkImage } from '../../../features/system/TenantPage';
import { PlanDialog, PostingDialog } from './AssetPosting';
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { date, defaultFrom, defaultTo, money, periodFrom } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange, useBranches, SearchFilter, searchRows, BranchPicker } from '@/components/filters';
import { Empty, ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { AccountPicker, ListPicker } from '@/components/pickers';
import { downloadTemplate, readAssetFile, type ParsedRow } from './assetImport';
import { PrintButton } from '@/components/print';
import { assetTemplates, loadAssetCards } from './assetPrint';
import { registerTemplates, type RegisterSheet } from './mauIn/soTaiSan';

export type AssetKind = 'fixed_asset' | 'tool' | 'prepaid';
const KIND_LABEL: Record<AssetKind, string> = { fixed_asset: 'Tài sản cố định', tool: 'Công cụ dụng cụ', prepaid: 'Chi phí trả trước' };
const STATUS_LABEL: Record<string, string> = { in_use: 'Đang dùng', stopped: 'Tạm ngừng trích', disposed: 'Đã ghi giảm' };
const AUDIT_RESULT: Record<string, string> = { ok: 'Còn, đang dùng tốt', damaged: 'Hỏng, cần sửa chữa', unused: 'Không dùng đến', missing: 'Thiếu, không tìm thấy' };
const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const parseMoney = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(/[^\d-]/g, '')));

interface Category { code: string; name: string; kind: AssetKind; kindLabel: string; assetAccount: string | null; depreciationAccount: string; expenseAccount: string; usefulLifeMonths: number | null; parentCode: string | null; isActive: boolean }
interface Allocation { percent: number; branchCode: string | null; expenseAccount: string; costItemCode: string | null; departmentCode: string | null; contractCode: string | null }
interface Asset {
  code: string; name: string; kind: AssetKind; kindLabel: string; categoryCode: string | null; categoryName: string | null; branchCode: string; branchName: string;
  unit: string; quantity: number; acquiredDate: string | null; startDate: string; originalCost: number; currentCost: number; depreciableAmount: number | null; usefulLifeMonths: number;
  monthlyAmount: number | null; openingAccumulated: number; openingAsOf: string | null; openingRemainingMonths: number | null;
  assetAccount: string | null; depreciationAccount: string; expenseAccount: string; costItemCode: string | null; departmentCode: string | null; contractCode: string | null;
  toolGroupCode?: string | null; usagePurposeCode?: string | null;
  specs?: { name: string; value: string }[]; hasPhoto?: boolean;
  allocations: Allocation[]; status: string; disposedDate: string | null; note: string; accumulated: number; remaining: number; lastPeriod: string | null;
}
interface AssetEvent {
  id: string; kind: 'revaluation' | 'transfer' | 'audit' | 'increase' | 'decrease'; kindLabel: string; date: string; docNo: string; note: string; createdBy: string; assetCode: string; assetName: string; assetKind: string; branchCode: string;
  costDelta?: number; accumulatedDelta?: number; remainingMonths?: number | null; monthlyAmount?: number | null; fromBranchCode?: string; toBranchCode?: string; postings?: { branchCode: string; docNo: string }[]; result?: string; resultLabel?: string; actualQuantity?: number | null; bookQuantity?: number;
}
interface Dim { code: string; name: string; isActive: boolean }

const useCategories = () => useQuery({ queryKey: ['asset-categories'], queryFn: () => api.get<Category[]>('/api/v1/asset-categories'), staleTime: 60_000 });
const useDim = (kind: string) => useQuery({ queryKey: ['dimensions', kind], queryFn: () => api.get<Dim[]>(`/api/v1/dimensions/${kind}`), staleTime: 60_000 });
const useAssets = (kind?: AssetKind) => useQuery({ queryKey: ['assets', kind ?? 'all'], queryFn: () => api.get<Asset[]>('/api/v1/assets', { kind }) });

const META: Record<AssetKind, { title: string; code: string; subtitle: string; credit: string }> = {
  fixed_asset: { title: 'Tài sản cố định', code: 'ACC28', subtitle: 'Thẻ tài sản cố định: nguyên giá, thời gian khấu hao, khấu hao luỹ kế, phân bổ chi phí, ghi giảm', credit: 'TK hao mòn' },
  tool: { title: 'Công cụ dụng cụ', code: 'ACC22', subtitle: 'Công cụ dụng cụ đã xuất dùng, phân bổ dần vào chi phí theo số tháng', credit: 'TK chờ phân bổ' },
  prepaid: { title: 'Chi phí trả trước', code: 'ACC23', subtitle: 'Khoản đã trả trước (thuê nhà, bảo hiểm, phần mềm…) phân bổ dần theo số tháng', credit: 'TK chờ phân bổ' },
};

/* ------------------------------------------------------------------ Danh sách thẻ */
export function AssetsPage({ kind, decrease = false }: { kind: AssetKind; decrease?: boolean }) {
  const meta = decrease
    ? { ...META[kind], title: 'Giảm tài sản cố định', code: 'ACC30', subtitle: 'Thanh lý, nhượng bán, mất mát: chọn tài sản, ghi ngày ghi giảm; khấu hao trích tới hết ngày trước ngày đó' }
    : META[kind];
  const { can } = useAuth();
  const [editing, setEditing] = useState<Partial<Asset> & { isNew?: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const [showDisposed, setShowDisposed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const q = useAssets(kind);
  const rows = (q.data ?? []).filter((r) => !decrease || (showDisposed ? r.status === 'disposed' : r.status !== 'disposed'));
  const picked = rows.filter((r) => selected.has(r.code));
  return (
    <>
      <PageHeader title={meta.title} code={meta.code} subtitle={meta.subtitle} helpKey="tai-san"
        actions={decrease ? undefined : can('catalog:write') ? <>
          <button className="btn" onClick={() => setImporting(true)}><Upload size={16} /> Nhập từ Excel</button>
          <button className="btn btn-primary" onClick={() => setEditing({ isNew: true, kind, status: 'in_use', quantity: 1, allocations: [] })}><Plus size={16} /> Thêm</button>
        </> : undefined} />
      <div className="card">
        {decrease && (
          <div className="filters">
            <label className="checkbox"><input type="radio" checked={!showDisposed} onChange={() => setShowDisposed(false)} /> Tài sản đang dùng (chọn để ghi giảm)</label>
            <label className="checkbox"><input type="radio" checked={showDisposed} onChange={() => setShowDisposed(true)} /> Tài sản đã ghi giảm</label>
          </div>
        )}
        <div className="vf-toolbar">
          <PrintButton bare screen={meta.code} templates={assetTemplates(kind, decrease ? 'first' : false)} disabled={!picked.length} label={picked.length ? `In ${picked.length} thẻ đã chọn` : 'In (tích chọn thẻ)'} getDocs={() => loadAssetCards(picked)} />
        </div>
        <div className="card-body" style={{ paddingTop: 10, paddingBottom: 6 }}>
          <p className="muted" style={{ margin: 0 }}>
            {decrease
              ? 'Bấm vào tài sản, đổi Trạng thái thành "Đã ghi giảm" và ghi Ngày ghi giảm, rồi Ghi. Sau đó lập phiếu kế toán ghi giảm: Nợ 2141 (hao mòn luỹ kế), Nợ 811 (giá trị còn lại) / Có 211x; thu tiền thanh lý (nếu có): Nợ 111, 112 / Có 711, 33311.'
              : kind === 'fixed_asset'
              ? 'Ghi tăng tài sản (Nợ 211x, 1331 / Có 331, 112…) lập bằng phiếu kế toán hoặc phiếu chi; thẻ ở đây dùng để trích khấu hao hằng tháng. Thanh lý, nhượng bán: sửa thẻ, chọn "Đã ghi giảm" kèm ngày, rồi lập phiếu kế toán ghi giảm (Nợ 2141, Nợ 811 / Có 211x). Đánh giá lại, điều chuyển, kiểm kê: mở thẻ, phần Lịch sử.'
              : 'Xuất công cụ dụng cụ dùng hoặc trả trước (Nợ 242x / Có 153, 111, 331…) lập bằng phiếu; thẻ ở đây dùng để phân bổ dần vào chi phí hằng tháng. Phân bổ tới 12 tháng dùng 2421x, trên 12 tháng dùng 2422x.'}
          </p>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : rows.length === 0 ? <Empty text={decrease ? 'Không có tài sản nào' : 'Chưa có thẻ nào. Bấm Thêm, hoặc Nhập từ Excel để chuyển cả danh sách tài sản sang.'} /> : (
          <DataGrid
            storageKey={`assets-${kind}${decrease ? '-giam' : ''}`}
            rows={rows}
            rowKey={(r) => r.code}
            onRowClick={(r) => setEditing(r)}
            columns={[
              {
                key: 'pick', noFilter: true, noSort: true, width: 46, value: () => '',
                header: <label className="checkbox" title="Chọn tất cả"><input type="checkbox" checked={rows.length > 0 && rows.every((r) => selected.has(r.code))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.code)) : new Set())} /> Chọn</label>,
                render: (r) => <input type="checkbox" checked={selected.has(r.code)} onClick={(e) => e.stopPropagation()} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.code); else n.delete(r.code); return n; })} />,
              },
              { key: 'code', header: 'Mã', type: 'code' },
              { key: 'name', header: 'Tên' },
              { key: 'categoryName', header: 'Loại' },
              { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
              { key: 'startDate', header: 'Bắt đầu trích', type: 'date' },
              { key: 'usefulLifeMonths', header: 'Số tháng', type: 'number' },
              { key: 'currentCost', header: 'Nguyên giá', type: 'money', sum: true },
              { key: 'accumulated', header: kind === 'fixed_asset' ? 'Hao mòn luỹ kế' : 'Đã phân bổ', type: 'money', sum: true },
              { key: 'remaining', header: 'Còn lại', type: 'money', sum: true },
              ...(decrease ? [{ key: 'disposedDate', header: 'Ngày ghi giảm', type: 'date' } as Column<Asset>] : []),
              { key: 'lastPeriod', header: 'Trích tới tháng', type: 'code' },
              { key: 'expenseAccount', header: 'TK chi phí', type: 'code', value: (r) => (r.allocations.length ? r.allocations.map((l) => l.expenseAccount).join(', ') : r.expenseAccount) },
              { key: 'depreciationAccount', header: meta.credit, type: 'code' },
              { key: 'status', header: 'Trạng thái', value: (r) => STATUS_LABEL[r.status] ?? r.status, render: (r) => <span className={`badge ${r.status === 'in_use' ? 'badge-ok' : 'badge-gray'}`}>{STATUS_LABEL[r.status] ?? r.status}</span> },
            ] satisfies Column<Asset>[]}
          />
        )}
      </div>
      {editing && <AssetForm value={editing} kind={kind} printScreen={meta.code} onClose={() => setEditing(null)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </>
  );
}

function AssetForm({ value, kind, printScreen, onClose }: { value: Partial<Asset> & { isNew?: boolean }; kind: AssetKind; printScreen: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const readOnly = !can('catalog:write');
  const [v, setV] = useState(value);
  const [eventKind, setEventKind] = useState<'revaluation' | 'transfer' | 'audit' | null>(null);
  const [posting, setPosting] = useState<'increase' | 'decrease' | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const set = (p: Partial<Asset>) => setV((x) => ({ ...x, ...p }));
  const { data: branches = [] } = useBranches();
  const { data: categories = [] } = useCategories();
  const { data: costItems = [] } = useDim('cost_item');
  const { data: departments = [] } = useDim('department');
  const { data: toolGroups = [] } = useDim('tool_group');
  const { data: usagePurposes = [] } = useDim('usage_purpose');
  const events = useQuery({ queryKey: ['asset-events', value.code], enabled: !value.isNew, queryFn: () => api.get<AssetEvent[]>('/api/v1/asset-events', { assetCode: value.code }) });
  const cats = categories.filter((c) => c.kind === kind && (c.isActive || c.code === v.categoryCode));
  const branchItems = branches.map((b) => ({ code: b.code, name: b.name }));
  const pickCategory = (code: string) => {
    const c = categories.find((x) => x.code === code);
    set({ categoryCode: code || null, ...(c && value.isNew ? { assetAccount: c.assetAccount, depreciationAccount: c.depreciationAccount, expenseAccount: c.expenseAccount, usefulLifeMonths: v.usefulLifeMonths || c.usefulLifeMonths || undefined } : {}) });
  };
  const base = v.depreciableAmount || v.originalCost;
  const monthly = v.monthlyAmount || (base && v.usefulLifeMonths ? Math.round(base / v.usefulLifeMonths) : 0);
  const allocations = v.allocations ?? [];
  const allocTotal = allocations.reduce((s, a) => s + Number(a.percent || 0), 0);
  const setAlloc = (i: number, p: Partial<Allocation>) => set({ allocations: allocations.map((a, j) => (j === i ? { ...a, ...p } : a)) });
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: v.code, name: v.name, kind, categoryCode: v.categoryCode || null, branchCode: v.branchCode || branches.find((b) => b.isActive)?.code, unit: v.unit ?? '', quantity: v.quantity ?? 1,
        acquiredDate: v.acquiredDate || null, startDate: v.startDate, originalCost: v.originalCost, depreciableAmount: v.depreciableAmount || null, usefulLifeMonths: v.usefulLifeMonths,
        monthlyAmount: v.monthlyAmount || null, openingAccumulated: v.openingAccumulated ?? 0, openingAsOf: v.openingAsOf || null,
        openingRemainingMonths: v.openingRemainingMonths ?? null, assetAccount: v.assetAccount || null, depreciationAccount: v.depreciationAccount, expenseAccount: v.expenseAccount,
        costItemCode: v.costItemCode || null, departmentCode: v.departmentCode || null, contractCode: v.contractCode || null,
        toolGroupCode: v.toolGroupCode || null, usagePurposeCode: v.usagePurposeCode || null,
        specs: (v.specs ?? []).filter((s) => s.name.trim() && s.value.trim()),
        allocations: allocations.filter((a) => a.expenseAccount && a.percent).map((a) => ({ ...a, percent: Number(a.percent) })),
        status: v.status, disposedDate: v.disposedDate || null, note: v.note ?? '',
      };
      return value.isNew ? api.post('/api/v1/assets', body) : api.put(`/api/v1/assets/${value.code}`, body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['assets'] }); if (value.isNew) onClose(); else viewAgain[1](); },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/v1/assets/${value.code}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['assets'] }); onClose(); },
  });
  const num = (s: string) => parseMoney(s);
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew && !readOnly} wide title={value.isNew ? `Thêm ${KIND_LABEL[kind].toLowerCase()}` : `${KIND_LABEL[kind]} ${value.code}`} onClose={onClose}
      footer={<>
        {!value.isNew && !readOnly && <button data-view-ok className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={remove.isPending} onClick={() => window.confirm('Xoá thẻ này? Chỉ xoá được thẻ chưa trích tháng nào.') && remove.mutate()}>Xoá thẻ</button>}
        {!value.isNew && value.code && <span data-view-ok><PrintButton screen={printScreen} templates={assetTemplates(kind, value.status === 'disposed' ? 'first' : false)} title="In thẻ theo nội dung đã ghi" getDocs={() => loadAssetCards([value as Asset])} /></span>}
        <button className="btn" onClick={onClose}>Đóng</button>
        {!readOnly && <button className="btn btn-primary" disabled={save.isPending || !v.code || !v.name || !v.startDate || !v.originalCost || !v.usefulLifeMonths || !v.depreciationAccount || !v.expenseAccount || (allocations.length > 0 && Math.abs(allocTotal - 100) > 0.001)} onClick={() => save.mutate()}>Ghi</button>}
      </>}>
      <Field label="Mã thẻ (*)"><input className="input mono" value={v.code ?? ''} disabled={!value.isNew} onChange={(e) => set({ code: e.target.value.trim() })} autoFocus={value.isNew} /></Field>
      <Field label="Tên (*)" full><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Loại tài sản" hint="Chọn loại để điền sẵn tài khoản và số tháng">
        <ListPicker items={cats.map((c) => ({ code: c.code, name: c.name }))} value={v.categoryCode ?? ''} onChange={pickCategory} placeholder="Bấm để chọn" />
      </Field>
      <Field label="Chi nhánh đang dùng" hint={value.isNew ? undefined : 'Đổi chi nhánh bằng Điều chuyển ở phần Lịch sử'}>
        <BranchPicker activeOnly value={v.branchCode ?? branches.find((b) => b.isActive)?.code ?? ''} disabled={!value.isNew} onChange={(branchCode) => set({ branchCode })} />
      </Field>
      <Field label="Đơn vị tính / số lượng">
        <div className="row" style={{ gap: 6 }}>
          <input className="input" style={{ width: 90 }} value={v.unit ?? ''} onChange={(e) => set({ unit: e.target.value })} placeholder="Cái" />
          <input className="input num" style={{ width: 80 }} inputMode="numeric" value={v.quantity ?? 1} onChange={(e) => set({ quantity: num(e.target.value) ?? 1 })} />
        </div>
      </Field>
      <Field label="Ngày ghi tăng"><input type="date" className="input" value={v.acquiredDate ?? ''} onChange={(e) => set({ acquiredDate: e.target.value || null })} /></Field>
      <Field label="Ngày bắt đầu trích (*)" hint="Tháng đầu trích theo số ngày còn lại"><input type="date" className="input" value={v.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value })} /></Field>
      <Field label="Nguyên giá (*)"><input className="input num" inputMode="numeric" value={v.originalCost ? money(v.originalCost) : ''} onChange={(e) => set({ originalCost: num(e.target.value) })} /></Field>
      <Field label="Giá trị tính khấu hao" hint="Trống = nguyên giá"><input className="input num" inputMode="numeric" value={v.depreciableAmount ? money(v.depreciableAmount) : ''} onChange={(e) => set({ depreciableAmount: num(e.target.value) ?? null })} /></Field>
      <Field label={kind === 'fixed_asset' ? 'Số tháng khấu hao (*)' : 'Số tháng phân bổ (*)'} hint={kind === 'fixed_asset' ? 'Theo khung Phụ lục I Thông tư 45/2013/TT-BTC' : undefined}>
        <input className="input num" inputMode="numeric" value={v.usefulLifeMonths ?? ''} onChange={(e) => set({ usefulLifeMonths: num(e.target.value) })} />
      </Field>
      <Field label="Mức trích mỗi tháng" hint={`Trống = giá trị tính khấu hao ÷ số tháng${monthly ? ` = ${money(monthly)}` : ''}`}>
        <input className="input num" inputMode="numeric" value={v.monthlyAmount ? money(v.monthlyAmount, { decimals: true }) : ''} onChange={(e) => set({ monthlyAmount: e.target.value.trim() ? Number(e.target.value.replace(/\./g, '').replace(',', '.')) || null : null })} placeholder={monthly ? money(monthly) : ''} />
      </Field>
      <Field label="Luỹ kế đã trích trước khi dùng phần mềm" hint="Tài sản chuyển từ sổ cũ"><input className="input num" inputMode="numeric" value={v.openingAccumulated ? money(v.openingAccumulated) : ''} onChange={(e) => set({ openingAccumulated: num(e.target.value) ?? 0 })} /></Field>
      <Field label="Luỹ kế tính tới ngày"><input type="date" className="input" value={v.openingAsOf ?? ''} onChange={(e) => set({ openingAsOf: e.target.value || null })} /></Field>
      <Field label="Số tháng còn lại (sau ngày trên)" hint="Hết số tháng này thì trích nốt phần còn lại"><input className="input num" inputMode="numeric" value={v.openingRemainingMonths ?? ''} onChange={(e) => set({ openingRemainingMonths: e.target.value === '' ? null : num(e.target.value) ?? null })} /></Field>
      {kind === 'fixed_asset' && <Field label="TK nguyên giá (*)"><AccountPicker postingOnly value={v.assetAccount ?? ''} onChange={(assetAccount) => set({ assetAccount })} placeholder="211x, 213x" /></Field>}
      <Field label={kind === 'fixed_asset' ? 'TK hao mòn (*)' : 'TK chờ phân bổ (*)'}><AccountPicker postingOnly value={v.depreciationAccount ?? ''} onChange={(depreciationAccount) => set({ depreciationAccount })} placeholder={kind === 'fixed_asset' ? '2141, 2143' : '24218, 24228'} /></Field>
      <Field label="TK chi phí (*)"><AccountPicker postingOnly value={v.expenseAccount ?? ''} onChange={(expenseAccount) => set({ expenseAccount })} placeholder="6424, 6414, 64231…" /></Field>
      <Field label="Khoản mục"><ListPicker items={costItems.filter((d) => d.isActive || d.code === v.costItemCode)} value={v.costItemCode ?? ''} onChange={(costItemCode) => set({ costItemCode })} placeholder={costItems.length ? 'Bấm để chọn' : 'Chưa khai danh mục'} /></Field>
      <Field label="Bộ phận"><ListPicker items={departments.filter((d) => d.isActive || d.code === v.departmentCode)} value={v.departmentCode ?? ''} onChange={(departmentCode) => set({ departmentCode })} placeholder={departments.length ? 'Bấm để chọn' : 'Chưa khai danh mục'} /></Field>
      {kind !== 'fixed_asset' && <Field label="Nhóm công cụ dụng cụ"><ListPicker items={toolGroups.filter((d) => d.isActive || d.code === v.toolGroupCode)} value={v.toolGroupCode ?? ''} onChange={(toolGroupCode) => set({ toolGroupCode })} placeholder={toolGroups.length ? 'Bấm để chọn' : 'Chưa khai danh mục'} /></Field>}
      <Field label="Mục đích sử dụng"><ListPicker items={usagePurposes.filter((d) => d.isActive || d.code === v.usagePurposeCode)} value={v.usagePurposeCode ?? ''} onChange={(usagePurposeCode) => set({ usagePurposeCode })} placeholder={usagePurposes.length ? 'Bấm để chọn' : 'Chưa khai danh mục'} /></Field>
      <Field label="Trạng thái">
        <select className="select input" value={v.status ?? 'in_use'} onChange={(e) => set({ status: e.target.value })}>
          {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      {v.status === 'disposed' && <Field label="Ngày ghi giảm (*)" hint="Trích tới hết ngày trước ngày này"><input type="date" className="input" value={v.disposedDate ?? ''} onChange={(e) => set({ disposedDate: e.target.value || null })} /></Field>}
      <Field label="Ghi chú" full><input className="input" value={v.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></Field>

      <div className="full">
        <label className="field-title">Phân bổ chi phí cho nhiều nơi <span className="muted">(trống = toàn bộ vào TK chi phí, khoản mục, bộ phận ở trên, chi nhánh đang dùng)</span></label>
        {allocations.length > 0 && (
          <table className="grid voucher-lines" style={{ marginTop: 4 }}>
            <thead><tr><th style={{ width: 90 }} className="num">Tỷ lệ %</th><th style={{ width: 200 }}>Chi nhánh chịu chi phí</th><th style={{ width: 180 }}>TK chi phí</th><th>Khoản mục</th><th>Bộ phận</th><th style={{ width: 36 }} /></tr></thead>
            <tbody>
              {allocations.map((a, i) => (
                <tr key={i}>
                  <td><input className="input num" value={a.percent ?? ''} onChange={(e) => setAlloc(i, { percent: Number(e.target.value.replace(',', '.')) || 0 })} /></td>
                  <td><ListPicker items={branchItems} value={a.branchCode ?? ''} onChange={(branchCode) => setAlloc(i, { branchCode: branchCode || null })} placeholder="Chi nhánh đang dùng" /></td>
                  <td><AccountPicker postingOnly value={a.expenseAccount} onChange={(expenseAccount) => setAlloc(i, { expenseAccount })} /></td>
                  <td><ListPicker items={costItems} value={a.costItemCode ?? ''} onChange={(costItemCode) => setAlloc(i, { costItemCode: costItemCode || null })} /></td>
                  <td><ListPicker items={departments} value={a.departmentCode ?? ''} onChange={(departmentCode) => setAlloc(i, { departmentCode: departmentCode || null })} /></td>
                  <td><button className="btn btn-sm btn-ghost" title="Xoá dòng" onClick={() => set({ allocations: allocations.filter((_, j) => j !== i) })}><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row" style={{ marginTop: 6, gap: 10 }}>
          {!readOnly && <button className="btn btn-sm" onClick={() => set({ allocations: [...allocations, { percent: allocations.length ? Math.max(0, 100 - allocTotal) : 100, branchCode: null, expenseAccount: v.expenseAccount ?? '', costItemCode: null, departmentCode: null, contractCode: null }] })}><Plus size={14} /> Thêm dòng phân bổ</button>}
          {allocations.length > 0 && <span className={Math.abs(allocTotal - 100) > 0.001 ? 'text-bad' : 'muted'}>Tổng tỷ lệ: {allocTotal}%{Math.abs(allocTotal - 100) > 0.001 ? ' — phải bằng 100%' : ''}</span>}
        </div>
      </div>

      <SpecsEditor specs={v.specs ?? []} readOnly={readOnly} onChange={(specs) => set({ specs })} />
      {!value.isNew && value.code && <PhotoBox code={value.code} readOnly={readOnly} />}
      {!value.isNew && (
        <div className="full">
          <div className="muted" style={{ marginBottom: 6 }}>
            Đã trích: <b>{money(value.accumulated ?? 0)}</b> · còn lại <b>{money(value.remaining ?? 0)}</b>{value.lastPeriod ? ` · trích tới tháng ${value.lastPeriod.slice(5)}/${value.lastPeriod.slice(0, 4)}` : ''}
          </div>
          <label className="field-title">Lịch sử</label>
          {events.data?.length ? (
            <table className="grid" style={{ marginTop: 4 }}>
              <thead><tr><th style={{ width: 100 }}>Ngày</th><th style={{ width: 120 }}>Nghiệp vụ</th><th style={{ width: 100 }}>Số phiếu</th><th>Nội dung</th></tr></thead>
              <tbody>{events.data.map((e) => <tr key={e.id}><td>{date(e.date)}</td><td>{e.kindLabel}</td><td className="mono">{e.docNo}</td><td>{eventText(e)}</td></tr>)}</tbody>
            </table>
          ) : <div className="muted">Chưa có đánh giá lại, điều chuyển, kiểm kê.</div>}
          {!readOnly && (
            <div className="row" style={{ marginTop: 6, gap: 6 }}>
              <button className="btn btn-sm" onClick={() => setEventKind('revaluation')}>Đánh giá lại</button>
              <button className="btn btn-sm" onClick={() => setEventKind('transfer')}>Điều chuyển</button>
              <button className="btn btn-sm" onClick={() => setEventKind('audit')}>Kiểm kê</button>
              <button className="btn btn-sm" onClick={() => setPosting('increase')} title="Lập phiếu kế toán ghi tăng: Nợ TK nguyên giá / chờ phân bổ, Có TK đối ứng">Hạch toán ghi tăng</button>
              <button className="btn btn-sm" onClick={() => setPosting('decrease')} title="Lập phiếu kế toán ghi giảm, thanh lý, nhượng bán; chuyển thẻ sang đã ghi giảm">Ghi giảm / thanh lý</button>
            </div>
          )}
          <div className="row" style={{ marginTop: 6 }}><button className="btn btn-sm" onClick={() => setShowPlan(true)}>Lịch khấu hao / phân bổ</button></div>
        </div>
      )}
      <ErrorBox error={save.error ? errorText(save.error) : remove.error ? errorText(remove.error) : null} />
      {eventKind && value.code && <EventDialog kind={eventKind} assetCode={value.code} onClose={() => setEventKind(null)} />}
      {posting && value.code && <PostingDialog code={value.code} kind={posting} onClose={() => setPosting(null)} />}
      {showPlan && value.code && <PlanDialog code={value.code} onClose={() => setShowPlan(false)} />}
    </Modal>
  );
}

/** Thông số kỹ thuật của thẻ: danh sách tên – giá trị, gợi ý sẵn vài tên hay dùng. */
const SPEC_NAMES = ['Kích thước', 'Điện năng tiêu thụ', 'Model', 'Số khung / số máy', 'Biển số', 'Năm sản xuất', 'Nước sản xuất', 'Bảo hành đến'];
function SpecsEditor({ specs, readOnly, onChange }: { specs: { name: string; value: string }[]; readOnly: boolean; onChange: (s: { name: string; value: string }[]) => void }) {
  const set = (i: number, p: Partial<{ name: string; value: string }>) => onChange(specs.map((s, j) => (j === i ? { ...s, ...p } : s)));
  return (
    <div className="full">
      <label className="field-title">Thông số kỹ thuật</label>
      <datalist id="spec-names">{SPEC_NAMES.map((n) => <option key={n} value={n} />)}</datalist>
      {specs.length > 0 && (
        <table className="grid" style={{ marginTop: 4 }}>
          <tbody>
            {specs.map((s, i) => (
              <tr key={i}>
                <td style={{ width: 220 }}><input className="input" list="spec-names" value={s.name} disabled={readOnly} onChange={(e) => set(i, { name: e.target.value })} placeholder="Tên thông số" /></td>
                <td><input className="input" value={s.value} disabled={readOnly} onChange={(e) => set(i, { value: e.target.value })} placeholder="Giá trị" /></td>
                <td style={{ width: 40 }}>{!readOnly && <button className="btn btn-sm" title="Bỏ" onClick={() => onChange(specs.filter((_, j) => j !== i))}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!readOnly && <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => onChange([...specs, { name: specs.length ? '' : 'Kích thước', value: '' }])}><Plus size={14} /> Thêm thông số</button>}
      {readOnly && !specs.length && <div className="muted">Chưa khai thông số.</div>}
    </div>
  );
}

/** Ảnh thẻ tài sản: chọn ảnh (thu nhỏ về 800 điểm ảnh) là ghi luôn. */
function PhotoBox({ code, readOnly }: { code: string; readOnly: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['asset-photo', code], queryFn: () => api.get<{ photo: string | null }>(`/api/v1/assets/${encodeURIComponent(code)}/photo`) });
  const save = useMutation({
    mutationFn: (photo: string | null) => api.put(`/api/v1/assets/${encodeURIComponent(code)}/photo`, { photo }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['asset-photo', code] }); void qc.invalidateQueries({ queryKey: ['assets'] }); },
  });
  const [err, setErr] = useState<string | null>(null);
  const photo = q.data?.photo;
  return (
    <div className="full">
      <label className="field-title">Ảnh tài sản</label>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start', marginTop: 4 }}>
        <div style={{ width: 220, height: 150, border: '1px dashed var(--line)', borderRadius: 6, display: 'grid', placeItems: 'center', background: '#fff', overflow: 'hidden' }}>
          {photo ? <a href={photo} target="_blank" rel="noreferrer"><img src={photo} alt={code} style={{ maxWidth: 216, maxHeight: 146 }} /></a> : <span className="muted">Chưa có ảnh</span>}
        </div>
        {!readOnly && (
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="btn btn-sm">
              Chọn ảnh…
              <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
                onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setErr(null); try { save.mutate(await shrinkImage(f, 800)); } catch (x) { setErr((x as Error).message); } }} />
            </label>
            {photo && <button className="btn btn-sm" disabled={save.isPending} onClick={() => window.confirm('Bỏ ảnh của thẻ này?') && save.mutate(null)}>Bỏ ảnh</button>}
            <span className="muted" style={{ fontSize: 12 }}>Ảnh tự thu nhỏ trước khi lưu.</span>
          </div>
        )}
      </div>
      <ErrorBox error={err ?? (save.error ? errorText(save.error) : null)} />
    </div>
  );
}

function eventText(e: AssetEvent): string {
  if (e.kind === 'increase' || e.kind === 'decrease') return `Phiếu kế toán ${e.docNo}${e.note ? ` — ${e.note}` : ''}`;
  if (e.kind === 'transfer') return `Từ ${e.fromBranchCode} sang ${e.toBranchCode}${e.note ? ` — ${e.note}` : ''}`;
  if (e.kind === 'audit') return `${e.resultLabel ?? ''}${e.actualQuantity !== null && e.actualQuantity !== undefined ? ` · thực tế ${e.actualQuantity}/${e.bookQuantity ?? ''}` : ''}${e.note ? ` — ${e.note}` : ''}`;
  const parts = [];
  if (e.costDelta) parts.push(`nguyên giá ${e.costDelta > 0 ? '+' : ''}${money(e.costDelta)}`);
  if (e.accumulatedDelta) parts.push(`luỹ kế ${e.accumulatedDelta > 0 ? '+' : ''}${money(e.accumulatedDelta)}`);
  if (e.remainingMonths) parts.push(`còn ${e.remainingMonths} tháng`);
  if (e.monthlyAmount) parts.push(`mức tháng ${money(e.monthlyAmount)}`);
  return parts.join(', ') + (e.note ? ` — ${e.note}` : '');
}

/** Thêm một sự kiện cho tài sản: đánh giá lại, điều chuyển, kiểm kê. */
function EventDialog({ kind, assetCode, onClose }: { kind: AssetEvent['kind']; assetCode?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: branches = [] } = useBranches();
  const assets = useAssets();
  const [f, setF] = useState({ assetCode: assetCode ?? '', date: today(), docNo: '', note: '', costDelta: '', accumulatedDelta: '', remainingMonths: '', monthlyAmount: '', toBranchCode: '', result: 'ok', actualQuantity: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = useMutation({
    mutationFn: () => api.post(`/api/v1/assets/${encodeURIComponent(f.assetCode)}/events`, {
      kind, date: f.date, docNo: f.docNo, note: f.note,
      ...(kind === 'revaluation' ? { costDelta: parseMoney(f.costDelta) ?? 0, accumulatedDelta: parseMoney(f.accumulatedDelta) ?? 0, remainingMonths: f.remainingMonths ? Number(f.remainingMonths) : null, monthlyAmount: parseMoney(f.monthlyAmount) ?? null } : {}),
      ...(kind === 'transfer' ? { toBranchCode: f.toBranchCode } : {}),
      ...(kind === 'audit' ? { result: f.result, actualQuantity: f.actualQuantity === '' ? null : Number(f.actualQuantity) } : {}),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['asset-events'] }); void qc.invalidateQueries({ queryKey: ['assets'] }); onClose(); },
  });
  const title = kind === 'revaluation' ? 'Đánh giá lại tài sản' : kind === 'transfer' ? 'Điều chuyển tài sản' : 'Kiểm kê tài sản';
  return (
    <Modal title={title} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={save.isPending || !f.assetCode || !f.date} onClick={() => save.mutate()}>Ghi</button></>}>
      <Field label="Tài sản" full>
        <ListPicker items={(assets.data ?? []).map((a) => ({ code: a.code, name: `${a.name} (${a.branchCode})` }))} value={f.assetCode} disabled={Boolean(assetCode)} onChange={(c) => set({ assetCode: c })} placeholder="Bấm để chọn tài sản" />
      </Field>
      <Field label="Ngày"><input type="date" className="input" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>
      <Field label="Số phiếu / biên bản"><input className="input mono" value={f.docNo} onChange={(e) => set({ docNo: e.target.value })} /></Field>
      {kind === 'revaluation' && <>
        <Field label="Chênh lệch nguyên giá" hint="Tăng ghi số dương, giảm ghi số âm"><input className="input num" value={f.costDelta} onChange={(e) => set({ costDelta: e.target.value })} /></Field>
        <Field label="Chênh lệch luỹ kế khấu hao"><input className="input num" value={f.accumulatedDelta} onChange={(e) => set({ accumulatedDelta: e.target.value })} /></Field>
        <Field label="Số tháng còn phải trích" hint="Tính từ tháng đánh giá lại; trống = giữ thời gian cũ"><input className="input num" value={f.remainingMonths} onChange={(e) => set({ remainingMonths: e.target.value.replace(/\D/g, '') })} /></Field>
        <Field label="Mức trích tháng mới" hint="Trống = phần còn lại ÷ số tháng còn lại"><input className="input num" value={f.monthlyAmount} onChange={(e) => set({ monthlyAmount: e.target.value })} /></Field>
        <div className="full muted">Có hiệu lực từ tháng đánh giá lại. Bút toán chênh lệch (Nợ / Có 211, 214, 412…) lập bằng phiếu kế toán.</div>
      </>}
      {kind === 'transfer' && <>
        <Field label="Chi nhánh nhận">
          <BranchPicker activeOnly value={f.toBranchCode} onChange={(toBranchCode) => set({ toBranchCode })} />
        </Field>
        <div className="full muted">Tháng điều chuyển, số trích được chia cho hai chi nhánh theo số ngày dùng ở mỗi nơi. Dòng phân bổ đã chỉ định chi nhánh chịu chi phí thì không đổi.</div>
      </>}
      {kind === 'audit' && <>
        <Field label="Kết quả">
          <select className="select input" value={f.result} onChange={(e) => set({ result: e.target.value })}>{Object.entries(AUDIT_RESULT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field label="Số lượng thực tế"><input className="input num" value={f.actualQuantity} onChange={(e) => set({ actualQuantity: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
      </>}
      <Field label="Ghi chú" full><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
    </Modal>
  );
}

/* ------------------------------------------------------------------ Nhập từ Excel */
function ImportDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [createBranches, setCreateBranches] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  type ImportResult = { created: number; updated: number; dryRun?: boolean; errors: { row: number; code: string; problems: string[] }[]; warnings: { row: number; code: string; warnings: string[] }[] };
  const run = useMutation({
    mutationFn: (dryRun: boolean) => api.post<ImportResult>('/api/v1/assets/import', { assets: rows!.map((r) => r.data), createBranches, dryRun }),
    onSuccess: (r) => { if (!r.errors.length && !r.dryRun) void qc.invalidateQueries({ queryKey: ['assets'] }); },
  });
  const checked = Boolean(run.data?.dryRun && !run.data.errors.length);
  const done = Boolean(run.data && !run.data.dryRun && !run.data.errors.length);
  const warnings = run.data?.warnings ?? [];
  const localErrors = rows?.filter((r) => r.problems.length) ?? [];
  const serverErrors = run.data?.errors ?? [];
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setReadError(null); run.reset();
    try {
      const r = await readAssetFile(file);
      setRows(r.rows); setUnknown(r.unknownHeaders); setFileName(file.name);
    } catch (e) { setReadError(`Không đọc được tệp: ${(e as Error).message}`); }
  };
  const summary = useMemo(() => {
    if (!rows) return null;
    const by: Record<string, number> = {};
    for (const r of rows) by[String(r.data.kind)] = (by[String(r.data.kind)] ?? 0) + 1;
    return { total: rows.length, cost: rows.reduce((s, r) => s + Number(r.data.originalCost ?? 0), 0), acc: rows.reduce((s, r) => s + Number(r.data.openingAccumulated ?? 0), 0), by };
  }, [rows]);
  return (
    <Modal wide title="Nhập tài sản từ Excel" onClose={onClose}
      footer={<>
        <button className="btn" style={{ marginRight: 'auto' }} onClick={() => void downloadTemplate()}><Download size={16} /> Tải tệp mẫu</button>
        <button className="btn" onClick={onClose}>Đóng</button>
        <button className="btn" disabled={!rows?.length || localErrors.length > 0 || run.isPending || done} onClick={() => run.mutate(true)}>Kiểm tra</button>
        <button className="btn btn-primary" disabled={!checked || run.isPending || done} onClick={() => run.mutate(false)} title={checked ? '' : 'Bấm Kiểm tra trước'}>{run.isPending ? 'Đang xử lý…' : `Nhập ${rows?.length ?? 0} thẻ`}</button>
      </>}>
      <div className="full">
        <p className="muted" style={{ marginTop: 0 }}>
          Chọn tệp .xlsx hoặc .csv theo tệp mẫu (một dòng một tài sản, gồm cả công cụ dụng cụ và chi phí trả trước). Tài sản chuyển sổ ghi luỹ kế đã khấu hao, tính tới ngày và số tháng còn lại:
          phần mềm trích từ tháng sau ngày đó. Bấm <b>Kiểm tra</b> trước (chưa ghi gì), không có lỗi thì bấm <b>Nhập</b>. Có dòng sai thì không ghi dòng nào. Mã đã có mà chưa trích tháng nào thì được cập nhật.
        </p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void pick(e.target.files?.[0])} />
        <label className="checkbox" style={{ marginLeft: 16 }}><input type="checkbox" checked={createBranches} onChange={(e) => setCreateBranches(e.target.checked)} /> Chi nhánh chưa có thì tự tạo</label>
        {readError && <div className="alert alert-bad" style={{ marginTop: 8 }}>{readError}</div>}
        {unknown.length > 0 && <div className="alert alert-warn" style={{ marginTop: 8 }}>Cột không nhận ra (bỏ qua): {unknown.join(', ')}</div>}
        {summary && (
          <div style={{ marginTop: 10 }}>
            <b>{fileName}</b>: {summary.total} dòng ({Object.entries(summary.by).map(([k, n]) => `${KIND_LABEL[k as AssetKind] ?? k}: ${n}`).join(', ')}) · nguyên giá {money(summary.cost)} · luỹ kế đầu {money(summary.acc)}
          </div>
        )}
        {checked && <div className="alert alert-ok" style={{ marginTop: 8 }}>Kiểm tra xong: không có lỗi{warnings.length ? `, ${warnings.length} thẻ cần xem lại (bên dưới)` : ''}. Bấm "Nhập" để ghi.</div>}
        {done && <div className="alert alert-ok" style={{ marginTop: 8 }}>Đã nhập: tạo mới {run.data!.created}, cập nhật {run.data!.updated} thẻ.</div>}
        {warnings.length > 0 && (
          <div style={{ marginTop: 8, maxHeight: 220, overflow: 'auto' }}>
            <div className="alert alert-warn">{warnings.length} thẻ có số liệu cần xem lại (vẫn nhập được, phần mềm nhận đúng số trong tệp):</div>
            <table className="grid" style={{ marginTop: 6 }}>
              <thead><tr><th style={{ width: 70 }}>Dòng</th><th style={{ width: 130 }}>Mã</th><th>Cần xem lại</th></tr></thead>
              <tbody>{warnings.map((w) => <tr key={`w${w.row}`}><td>{(rows?.[w.row - 1]?.row) ?? w.row}</td><td className="mono">{w.code}</td><td>{w.warnings.join('; ')}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {(localErrors.length > 0 || serverErrors.length > 0) && (
          <div style={{ marginTop: 8, maxHeight: 260, overflow: 'auto' }}>
            <div className="alert alert-bad">Có {localErrors.length || serverErrors.length} dòng cần sửa trong tệp (chưa ghi dòng nào):</div>
            <table className="grid" style={{ marginTop: 6 }}>
              <thead><tr><th style={{ width: 70 }}>Dòng</th><th style={{ width: 130 }}>Mã</th><th>Lỗi</th></tr></thead>
              <tbody>
                {localErrors.map((r) => <tr key={`l${r.row}`}><td>{r.row}</td><td className="mono">{String(r.data.code ?? '')}</td><td>{r.problems.join('; ')}</td></tr>)}
                {serverErrors.map((r) => <tr key={`s${r.row}`}><td>{(rows?.[r.row - 1]?.row) ?? r.row}</td><td className="mono">{r.code}</td><td>{r.problems.join('; ')}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
        <ErrorBox error={run.error ? errorText(run.error) : null} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Loại tài sản */
export function AssetCategoriesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const [editing, setEditing] = useState<Partial<Category> & { isNew?: boolean } | null>(null);
  const [sel, setSel] = useState<Category | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const q = useCategories();
  const del = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/asset-categories/${encodeURIComponent(code)}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['asset-categories'] }); } });
  return (
    <>
      <PageHeader title="Loại tài sản" code="ACC37" subtitle="Tài khoản và số tháng ngầm định khi thêm thẻ tài sản, công cụ dụng cụ, chi phí trả trước" helpKey="tai-san" />
      <div className="card">
        <CatalogToolbar
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, kind: 'fixed_asset', isActive: true, parentCode: sel?.parentCode ?? null })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá loại ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); }}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
        />
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid storageKey="acc37-v2" exportName="loai-tai-san" groupable exportRef={exportRef} rows={q.data ?? []} rowKey={(r) => r.code}
            onSelect={setSel} onRowDoubleClick={(r) => canWrite && setEditing(r)} rowClassName={(r) => (r.isActive ? '' : 'muted')} footerLabel={false}
            columns={[
              { key: 'code', header: 'Mã loại TS', type: 'code', width: 150 },
              { key: 'name', header: 'Tên loại TS', width: 280 },
              { key: 'assetAccount', header: 'Tài khoản nguyên giá', type: 'code', width: 150 },
              { key: 'depreciationAccount', header: 'Tài khoản khấu hao', type: 'code', width: 140 },
              { key: 'hidden', header: 'Ẩn', type: 'check', width: 50, value: (r) => !r.isActive },
              { key: 'parentCode', header: 'Loại cha', type: 'code', width: 120 },
              { key: 'kindLabel', header: 'Nhóm', width: 150, hidden: true },
              { key: 'expenseAccount', header: 'TK chi phí', type: 'code', width: 100, hidden: true },
              { key: 'usefulLifeMonths', header: 'Số tháng', type: 'number', width: 80, hidden: true },
            ] satisfies Column<Category>[]} />
        )}
      </div>
      {editing && <CategoryForm value={editing} parents={q.data ?? []} onClose={() => setEditing(null)} />}
    </>
  );
}

function CategoryForm({ value, parents, onClose }: { value: Partial<Category> & { isNew?: boolean }; parents: Category[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<Category>) => setV((x) => ({ ...x, ...p }));
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => {
      const body = { code: v.code, name: v.name, kind: v.kind, assetAccount: v.kind === 'fixed_asset' ? v.assetAccount || null : null, depreciationAccount: v.depreciationAccount, expenseAccount: v.expenseAccount, usefulLifeMonths: v.usefulLifeMonths || null, parentCode: v.parentCode || null, isActive: v.isActive ?? true };
      return value.isNew ? api.post('/api/v1/asset-categories', body) : api.patch(`/api/v1/asset-categories/${value.code}`, body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['asset-categories'] }); if (value.isNew) onClose(); else viewAgain[1](); },
  });
  const isGroup = !value.isNew && parents.some((p) => p.parentCode === value.code);
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} title="Loại tài sản" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !v.code || !v.name || !v.depreciationAccount || !v.expenseAccount} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Đóng</button></>}>
      <Field label="Mã (*)"><input className="input mono" value={v.code ?? ''} disabled={!value.isNew} onChange={(e) => set({ code: e.target.value.trim() })} /></Field>
      <Field label="Tên" full><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Loại cha"><ListPicker items={parents.filter((p) => p.code !== v.code).map((p) => ({ code: p.code, name: p.name }))} value={v.parentCode ?? ''} onChange={(parentCode) => set({ parentCode })} placeholder="Không" /></Field>
      <Field label=" "><label className="checkbox"><input type="checkbox" checked={v.isActive !== false} onChange={(e) => set({ isActive: e.target.checked })} /> Theo dõi</label></Field>
      {v.kind === 'fixed_asset' && <Field label="Tài khoản nguyên giá"><AccountPicker postingOnly={!isGroup} value={v.assetAccount ?? ''} onChange={(assetAccount) => set({ assetAccount })} /></Field>}
      <Field label={v.kind === 'fixed_asset' ? 'Tài khoản khấu hao' : 'Tài khoản chờ phân bổ'}><AccountPicker postingOnly={!isGroup} value={v.depreciationAccount ?? ''} onChange={(depreciationAccount) => set({ depreciationAccount })} /></Field>
      <Field label="Nhóm">
        <select className="select input" value={v.kind} onChange={(e) => set({ kind: e.target.value as AssetKind })}>
          {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="Tài khoản chi phí"><AccountPicker postingOnly={!isGroup} value={v.expenseAccount ?? ''} onChange={(expenseAccount) => set({ expenseAccount })} /></Field>
      <Field label="Số tháng ngầm định"><input className="input num" inputMode="numeric" value={v.usefulLifeMonths ?? ''} onChange={(e) => set({ usefulLifeMonths: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} /></Field>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
    </Modal>
  );
}

/* ------------------------------------------------------------------ ACC32, ACC33, ACC35 */
type EventPageKind = 'revaluation' | 'transfer' | 'audit';
const EVENT_META: Record<EventPageKind, { title: string; code: string; subtitle: string }> = {
  revaluation: { title: 'Đánh giá lại tài sản', code: 'ACC32', subtitle: 'Điều chỉnh nguyên giá, khấu hao luỹ kế, thời gian sử dụng còn lại; mức trích mới tính từ tháng đánh giá lại' },
  transfer: { title: 'Điều chuyển tài sản', code: 'ACC33', subtitle: 'Chuyển tài sản giữa chi nhánh; tháng điều chuyển chia số trích theo ngày cho hai nơi' },
  audit: { title: 'Kiểm kê tài sản', code: 'ACC35', subtitle: 'Ghi kết quả kiểm kê từng tài sản: còn, hỏng, không dùng, thiếu' },
};

export function AssetEventsPage({ kind }: { kind: EventPageKind }) {
  const meta = EVENT_META[kind];
  const qc = useQueryClient();
  const { can } = useAuth();
  const [f, setF] = useState({ from: `${new Date().getFullYear()}-01-01`, to: defaultTo() });
  const [adding, setAdding] = useState(false);
  const [posting, setPosting] = useState<AssetEvent | null>(null);
  const q = useQuery({ queryKey: ['asset-events', kind, f], queryFn: () => api.get<AssetEvent[]>('/api/v1/asset-events', { kind, ...f }) });
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/api/v1/asset-events/${id}`), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['asset-events'] }); void qc.invalidateQueries({ queryKey: ['assets'] }); } });
  const cols: Column<AssetEvent>[] = [
    { key: 'date', header: 'Ngày', type: 'date' },
    { key: 'docNo', header: 'Số phiếu', type: 'code' },
    { key: 'assetCode', header: 'Mã tài sản', type: 'code' },
    { key: 'assetName', header: 'Tên tài sản' },
    ...(kind === 'revaluation' ? ([
      { key: 'costDelta', header: 'Chênh lệch nguyên giá', type: 'money', sum: true },
      { key: 'accumulatedDelta', header: 'Chênh lệch luỹ kế', type: 'money', sum: true },
      { key: 'remainingMonths', header: 'Số tháng còn lại', type: 'number' },
      { key: 'monthlyAmount', header: 'Mức tháng mới', type: 'money' },
    ] satisfies Column<AssetEvent>[]) : kind === 'transfer' ? ([
      { key: 'fromBranchCode', header: 'Từ chi nhánh', type: 'code' },
      { key: 'toBranchCode', header: 'Đến chi nhánh', type: 'code' },
      {
        key: 'postings', header: 'Hạch toán', noFilter: true, value: (r) => (r.postings ?? []).map((p) => p.docNo).join(', '),
        render: (r) => r.postings?.length
          ? <span className="mono">{r.postings.map((p) => p.docNo).join(', ')}</span>
          : can('documents:write') ? <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setPosting(r); }}>Hạch toán…</button> : null,
      },
    ] satisfies Column<AssetEvent>[]) : ([
      { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
      { key: 'resultLabel', header: 'Kết quả' },
      { key: 'bookQuantity', header: 'SL sổ', type: 'number' },
      { key: 'actualQuantity', header: 'SL thực tế', type: 'number' },
    ] satisfies Column<AssetEvent>[])),
    { key: 'note', header: 'Ghi chú' },
    ...(can('catalog:write') ? [{ key: 'del', header: '', noFilter: true, noSort: true, value: () => '', render: (r: AssetEvent) => <button className="btn btn-sm btn-ghost" title="Xoá" onClick={(e) => { e.stopPropagation(); if (window.confirm(kind === 'transfer' ? 'Xoá lần điều chuyển này? Tài sản trở về chi nhánh cũ.' : 'Xoá dòng này?')) del.mutate(r.id); }}><Trash2 size={15} /></button> } as Column<AssetEvent>] : []),
  ];
  return (
    <>
      <PageHeader title={meta.title} code={meta.code} subtitle={meta.subtitle} helpKey="tai-san"
        actions={can('catalog:write') && <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Thêm</button>} />
      <FilterLayout
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => setF({ from, to })} />
          </>
        }
      >
        <div className="card">
          {kind === 'revaluation' && <div className="card-body muted" style={{ paddingTop: 0 }}>Nghiệp vụ này không tự ghi sổ cái: bút toán (nếu có) lập bằng phiếu kế toán. Phần mềm dùng số liệu ở đây để tính khấu hao các tháng sau.</div>}
          {kind === 'transfer' && <div className="card-body muted" style={{ paddingTop: 0 }}>Điều chuyển trong cùng đơn vị hạch toán không ghi sổ: tháng điều chuyển chia số trích theo ngày cho hai nơi. Điều chuyển sang đơn vị hạch toán khác: bấm <b>Hạch toán…</b> để lập phiếu kế toán ở cả bên giao và bên nhận (qua phải thu / phải trả nội bộ).</div>}
          <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
          {q.isLoading ? <Loading /> : !q.data?.length ? <Empty text="Chưa có dòng nào trong khoảng ngày này" /> : <DataGrid storageKey={meta.code.toLowerCase()} rows={q.data} rowKey={(r) => r.id} columns={cols} />}
        </div>
      </FilterLayout>
      {adding && <EventDialog kind={kind} onClose={() => setAdding(false)} />}
      {posting && <TransferPostingDialog event={posting} onClose={() => setPosting(null)} />}
    </>
  );
}

interface TransferSuggestion {
  date: string; sameUnit: boolean; warnings: string[]; accumulated: number; remaining: number; posted: { docNo: string }[];
  asset: { code: string; name: string; cost: number }; from: { code: string; name: string }; to: { code: string; name: string };
  parts: { side: 'out' | 'in'; branchCode: string; description: string; lines: { debitAccount: string; creditAccount: string; amount: number; description: string; partnerCode?: string }[] }[];
}

/** FA-004: hạch toán một lần điều chuyển sang đơn vị hạch toán khác — hai phiếu kế toán, mỗi bên một phiếu. */
function TransferPostingDialog({ event, onClose }: { event: AssetEvent; onClose: () => void }) {
  const qc = useQueryClient();
  const [docDate, setDocDate] = useState(event.date);
  const q = useQuery({ queryKey: ['asset-transfer-posting', event.id], queryFn: () => api.get<TransferSuggestion>(`/api/v1/asset-events/${event.id}/transfer-posting`) });
  const save = useMutation({
    mutationFn: () => api.post(`/api/v1/asset-events/${event.id}/transfer-posting`, { docDate }),
    onSuccess: () => { for (const k of [['asset-events'], ['documents'], ['asset-transfer-posting']]) void qc.invalidateQueries({ queryKey: k }); onClose(); },
  });
  const s = q.data;
  const canPost = s && !s.sameUnit && !s.posted.length && s.parts.some((p) => p.lines.length);
  return (
    <Modal wide title={`Hạch toán điều chuyển ${event.assetCode} — ${event.fromBranchCode} → ${event.toBranchCode}`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Đóng</button>
        <button className="btn btn-primary" disabled={!canPost || save.isPending} onClick={() => save.mutate()}>Lập 2 phiếu kế toán</button>
      </>}>
      <div className="field"><label>Ngày hạch toán</label><input type="date" className="input" value={docDate} onChange={(e) => setDocDate(e.target.value || event.date)} /></div>
      <ErrorBox error={q.error ? errorText(q.error) : save.error ? errorText(save.error) : null} />
      {q.isLoading || !s ? <Loading /> : (
        <div className="full">
          <p style={{ margin: '4px 0 8px' }}>
            {s.asset.name}: nguyên giá <b>{money(s.asset.cost)}</b> · luỹ kế đến tháng trước điều chuyển <b>{money(s.accumulated)}</b> · còn lại <b>{money(s.remaining)}</b>
          </p>
          {s.warnings.map((w) => <div key={w} className="alert alert-warn" style={{ marginBottom: 6 }}>{w}</div>)}
          {!s.sameUnit && s.parts.map((p) => (
            <div key={p.side} style={{ marginTop: 8 }}>
              <b>{p.side === 'out' ? 'Bên giao' : 'Bên nhận'} — chi nhánh {p.branchCode}</b> <span className="muted">· {p.description}</span>
              {p.lines.length ? (
                <table className="grid" style={{ marginTop: 4 }}>
                  <thead><tr><th>Nợ</th><th>Có</th><th>Đối tượng</th><th>Diễn giải</th><th className="num">Số tiền</th></tr></thead>
                  <tbody>{p.lines.map((l, i) => <tr key={i}><td className="mono">{l.debitAccount}</td><td className="mono">{l.creditAccount}</td><td className="mono">{l.partnerCode ?? ''}</td><td>{l.description}</td><td className="num">{money(l.amount)}</td></tr>)}</tbody>
                </table>
              ) : <div className="muted">Không có dòng nào.</div>}
            </div>
          ))}
          <p className="muted" style={{ marginTop: 10 }}>Phiếu ghi vào sổ nhật ký chung. Cần sửa số thì huỷ phiếu và lập phiếu kế toán tay.</p>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ ACC31 tính khấu hao, phân bổ */
interface RunResult {
  period: string;
  total: number; catchUpTotal: number; catchUpAssets: number; items: { code: string; name: string; kind: string; branchCode: string; amount: number; catchUp: number; overridden: boolean }[]; branches: { branchCode: string; status: string; docNo?: string; total: number }[]; missing: { assetCode: string; firstMissing: string; months: number }[];
}

export function DepreciationPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [period, setPeriod] = useState(thisMonth());
  const [override, setOverride] = useState<RegisterRow | null>(null);
  const [catchUp, setCatchUp] = useState(false);
  const run = useMutation({
    mutationFn: () => api.post<RunResult>('/api/v1/assets/depreciation', { period, catchUp }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['assets'] }); void qc.invalidateQueries({ queryKey: ['asset-register'] }); },
  });
  const mm = `${period.slice(5)}/${period.slice(0, 4)}`;
  const preview = useQuery({ queryKey: ['asset-register', 'month', period], queryFn: () => api.get<RegisterData>('/api/v1/assets/register', { from: `${period}-01`, to: lastDay(period) }) });
  return (
    <>
      <PageHeader title="Tính khấu hao, phân bổ" code="ACC31" subtitle="Khấu hao tài sản cố định, phân bổ công cụ dụng cụ và chi phí trả trước trong tháng; ghi sổ một chứng từ cho mỗi chi nhánh" helpKey="tai-san"
        actions={can('periods:lock') && <button className="btn btn-primary" disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? 'Đang tính…' : `Tính tháng ${mm}`}</button>} />
      <div className="card">
        <div className="filters">
          <div className="field"><label>Tháng</label><input type="month" className="input w-md" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} /></div>
          <label className="checkbox" style={{ marginBottom: 8 }} title="Thẻ còn tháng trước chưa trích (thường do chuyển sổ): tính từng tháng thiếu và ghi dồn vào tháng này"><input type="checkbox" checked={catchUp} onChange={(e) => setCatchUp(e.target.checked)} /> Dồn các tháng chưa trích vào tháng này</label>
        </div>
        <div className="card-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
          <p className="muted" style={{ margin: 0 }}>
            Đường thẳng: mức tháng = giá trị tính khấu hao ÷ số tháng; tháng đầu, tháng ghi giảm tính theo số ngày; tháng cuối trích nốt phần còn lại; làm tròn đồng. Ghi sổ ngày cuối tháng:
            <b> Nợ TK chi phí / Có TK hao mòn (214x) hoặc chờ phân bổ (242x)</b>, chia theo dòng phân bổ của thẻ, ghi vào sổ nhật ký chung.
            Tính lại bao nhiêu lần cũng được: bút toán cũ tự ghi số âm. <b>Bấm một dòng để sửa tay số trích của tháng</b> (kèm lý do), rồi tính lại.
            Thứ tự cuối tháng: <b>tính giá vốn → tính khấu hao, phân bổ → kết chuyển → khoá sổ</b>.
          </p>
        </div>
        <ErrorBox error={run.error ? errorText(run.error) : preview.error ? errorText(preview.error) : null} />
        {run.data && (
          <div className="card-body">
            {[run.data].map((b) => (
              <div key="kq" style={{ marginBottom: 8 }}>
                Đã ghi sổ: {b.items.length} thẻ · tổng trích <b>{money(b.total)}</b>
                {b.items.some((i) => i.overridden) && <span className="muted"> · {b.items.filter((i) => i.overridden).length} thẻ sửa tay</span>}
                {b.catchUpTotal > 0 && <span> · trong đó trích bổ sung các tháng chưa trích của {b.catchUpAssets} thẻ: <b>{money(b.catchUpTotal)}</b></span>}
                {b.branches.length > 0 && <span className="muted"> ({b.branches.map((x) => `${x.branchCode}: ${money(x.total)}`).join('; ')})</span>}
                {b.missing.length > 0 && <div className="alert alert-warn" style={{ marginTop: 6 }}>Có {b.missing.length} thẻ còn tháng trước chưa trích (ví dụ {b.missing.slice(0, 3).map((m) => `${m.assetCode}: ${m.months} tháng từ ${m.firstMissing.slice(5)}/${m.firstMissing.slice(0, 4)}`).join(', ')}). Tính lần lượt các tháng đó, hoặc đánh dấu "Dồn các tháng chưa trích vào tháng này" rồi tính lại.</div>}
              </div>
            ))}
          </div>
        )}
        {preview.isLoading ? <Loading /> : !preview.data?.rows.length ? <Empty text="Chưa có thẻ tài sản nào đang trích trong tháng này" /> : (
          <RegisterGrid data={preview.data} storageKey="acc31" onRowClick={can('periods:lock') ? setOverride : undefined} />
        )}
      </div>
      {override && <OverrideDialog row={override} period={period} onClose={() => setOverride(null)} />}
    </>
  );
}

function OverrideDialog({ row, period, onClose }: { row: RegisterRow; period: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(row.overridden ? money(row.charge) : '');
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: (clear: boolean) => api.put(`/api/v1/assets/${encodeURIComponent(row.code)}/override`, { period, amount: clear ? null : parseMoney(amount) ?? 0, reason }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['asset-register'] }); onClose(); },
  });
  return (
    <Modal title={`Sửa tay số trích tháng ${period.slice(5)}/${period.slice(0, 4)} — ${row.code}`} onClose={onClose}
      footer={<>
        {row.overridden && <button className="btn" style={{ marginRight: 'auto' }} disabled={save.isPending} onClick={() => save.mutate(true)}>Bỏ sửa tay</button>}
        <button className="btn" onClick={onClose}>Đóng</button>
        <button className="btn btn-primary" disabled={save.isPending || amount === '' || !reason.trim()} onClick={() => save.mutate(false)}>Ghi</button>
      </>}>
      <div className="full">{row.name} · số đang tính: <b>{money(row.charge)}</b></div>
      <Field label="Số trích tháng này"><input className="input num" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
      <Field label="Lý do (*)" full><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: tài sản tạm dừng sửa chữa nửa tháng" /></Field>
      <div className="full muted">Ghi xong bấm "Tính tháng" lại để áp dụng.</div>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
    </Modal>
  );
}

const lastDay = (period: string) => new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ Sổ tài sản */
interface RegisterRow {
  code: string; name: string; kind: AssetKind; kindLabel: string; categoryName: string; branchCode: string; unit: string; quantity: number; startDate: string; usefulLifeMonths: number;
  assetAccount: string; depreciationAccount: string; expenseAccount: string; status: string; disposedDate: string | null; increased: boolean; decreased: boolean; overridden: boolean;
  originalCost: number; costAdjust: number; opening: number; charge: number; adjust: number; closing: number; remaining: number;
}
interface RegisterData { rows: RegisterRow[]; totals: { originalCost: number; opening: number; charge: number; adjust: number; closing: number; remaining: number } }

function RegisterGrid({ data, storageKey, onRowClick }: { data: RegisterData; storageKey: string; onRowClick?: (r: RegisterRow) => void }) {
  return (
    <DataGrid
      storageKey={storageKey}
      rows={data.rows}
      rowKey={(r) => r.code}
      onRowClick={onRowClick}
      columns={[
        { key: 'kindLabel', header: 'Nhóm' },
        { key: 'code', header: 'Mã', type: 'code' },
        { key: 'name', header: 'Tên' },
        { key: 'categoryName', header: 'Loại', hidden: true },
        { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
        { key: 'startDate', header: 'Bắt đầu trích', type: 'date' },
        { key: 'usefulLifeMonths', header: 'Số tháng', type: 'number' },
        { key: 'originalCost', header: 'Nguyên giá', type: 'money', sum: true },
        { key: 'costAdjust', header: 'Đánh giá lại NG', type: 'money', sum: true, hidden: true },
        { key: 'opening', header: 'Luỹ kế đầu kỳ', type: 'money', sum: true },
        { key: 'charge', header: 'Trích trong kỳ', type: 'money', sum: true, bold: true },
        { key: 'adjust', header: 'Điều chỉnh luỹ kế', type: 'money', sum: true, hidden: true },
        { key: 'closing', header: 'Luỹ kế cuối kỳ', type: 'money', sum: true },
        { key: 'remaining', header: 'Giá trị còn lại', type: 'money', sum: true },
        { key: 'expenseAccount', header: 'TK chi phí', type: 'code' },
        { key: 'depreciationAccount', header: 'TK ghi Có', type: 'code' },
        { key: 'status', header: 'Tình trạng', value: (r) => (r.overridden ? 'Sửa tay' : r.decreased ? 'Giảm trong kỳ' : r.increased ? 'Tăng trong kỳ' : STATUS_LABEL[r.status] ?? r.status) },
      ] satisfies Column<RegisterRow>[]}
    />
  );
}

export interface RegisterPreset { title: string; code: string; subtitle: string; kind?: AssetKind }

export function AssetRegisterPage({ preset }: { preset: RegisterPreset }) {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '', kind: preset.kind ?? '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['asset-register', f], queryFn: () => api.get<RegisterData>('/api/v1/assets/register', { ...f, kind: f.kind || undefined }) });
  const d = q.data;
  // Báo cáo phân bổ chi phí cần tên tài khoản chi phí: nạp khi bấm In.
  const sheet = async (): Promise<RegisterSheet[]> => {
    if (!d) return [];
    const accountNames = preset.code === 'ACC27'
      ? Object.fromEntries((await api.get<{ code: string; name: string }[]>('/api/v1/accounts', {}).catch(() => [])).map((a) => [a.code, a.name]))
      : undefined;
    return [{ code: preset.code, title: preset.title, from: f.from, to: f.to, branchCodes: f.branchCodes, kind: f.kind, rows: d.rows, accountNames }];
  };
  return (
    <>
      <PageHeader title={preset.title} code={preset.code} subtitle={preset.subtitle} helpKey="tai-san" />
      <FilterLayout
        print={<PrintButton screen={preset.code} templates={registerTemplates(preset.code)} disabled={!d?.rows.length} getDocs={sheet} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <div className="field">
              <label>Nhóm</label>
              <select className="select input w-md" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
                <option value="">Tất cả</option>
                {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !q.data?.rows.length ? <Empty /> : <RegisterGrid data={q.data} storageKey={preset.code.toLowerCase()} />}
        </div>
      </FilterLayout>
    </>
  );
}
