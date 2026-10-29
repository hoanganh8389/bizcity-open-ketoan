/**
 * Chi nhánh (DM02). Mã chi nhánh phải khớp mã hệ thống bán hàng gửi sang (branchCode).
 * Lưới: Mã chi nhánh · Mô tả (tên gọi) · Ghi chú · Tên công ty · Số ĐKKD/MST · Địa chỉ · Điện thoại · Fax · Theo dõi;
 * thêm của phần mềm kế toán: Đơn vị hạch toán, Bộ phận.
 * Form: Thông tin cơ bản (Mã*, Mô tả, Ghi chú, Số ĐKKD/MST) · Thông tin in report (Tên công ty, Địa chỉ, Điện thoại, Fax) · Hạch toán
 *       · Website bán hàng (đang nối).
 * Cầu nối hệ thống bán hàng: qua KẾT NỐI CHÍNH (Định khoản tự động → Kết nối), cột Website / Tên website / Mã kho website
 * hiện website (blog_id) đang nối với từng chi nhánh — theo cấu hình phân cấp bên hệ thống bán hàng.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { ListPicker } from '@/components/pickers';

interface SourceSite { blogId: number; name: string; url: string; siteCode: string; branchCode: string | null; isMain: boolean; active: boolean }
interface BranchSites { connection: { code: string; name: string } | null; sites: SourceSite[]; error?: string }
type BranchRow = Branch & { siteIds: string; siteNames: string; siteCodes: string };

/** Website của hệ thống bán hàng (qua kết nối chính) — dùng chung cho lưới và form. */
function useBranchSites() {
  return useQuery({ queryKey: ['branch-sites'], queryFn: () => api.get<BranchSites>('/api/v1/branches/sites'), staleTime: 60_000 });
}

interface Branch {
  code: string; name: string; accountingUnitCode: string | null; departmentCode: string | null; address: string | null; externalRef: string | null; isActive: boolean;
  note: string; companyName: string; taxCode: string; phone: string; fax: string;
}

export function BranchesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const [editing, setEditing] = useState<(Partial<Branch> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<Branch | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const q = useQuery({ queryKey: ['branches'], queryFn: () => api.get<Branch[]>('/api/v1/branches') });
  const sites = useBranchSites();
  const byBranch = new Map<string, SourceSite[]>();
  for (const st of sites.data?.sites ?? []) if (st.branchCode) byBranch.set(st.branchCode, [...(byBranch.get(st.branchCode) ?? []), st]);
  const rows: BranchRow[] = (q.data ?? []).map((b) => {
    const list = byBranch.get(b.code) ?? [];
    return { ...b, siteIds: list.map((x) => x.blogId).join(', '), siteNames: list.map((x) => x.name).join(', '), siteCodes: list.map((x) => x.siteCode).filter(Boolean).join(', ') };
  });
  const linked = (sites.data?.sites ?? []).filter((x) => x.branchCode);
  const unknown = linked.filter((x) => !(q.data ?? []).some((b) => b.code === x.branchCode));
  const del = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/branches/${encodeURIComponent(code)}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['branches'] }); } });

  return (
    <>
      <PageHeader title="Chi nhánh" code="DM02" subtitle="Cửa hàng, kho, văn phòng — mọi bút toán gắn một chi nhánh" helpKey="chi-nhanh" />
      <div className="card">
        <CatalogToolbar
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, isActive: true, accountingUnitCode: sel?.accountingUnitCode ?? null })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá chi nhánh ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); }}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
        />
        <div className="muted" style={{ fontSize: 12, padding: '4px 8px' }}>
          {sites.isLoading ? 'Đang lấy danh sách website của hệ thống bán hàng…'
            : sites.data?.connection
              ? <>Kết nối chính: <b>{sites.data.connection.code}</b> — {sites.data.connection.name} · {sites.data.sites.length} website, {linked.length} đã nối chi nhánh
                {unknown.length ? <span className="text-bad"> · {unknown.length} website nối chi nhánh chưa có ở danh mục: {unknown.map((x) => `${x.branchCode} (blog ${x.blogId})`).join(', ')}</span> : null}
                {' '}<button type="button" className="btn btn-sm btn-ghost" onClick={() => void api.get('/api/v1/branches/sites', { refresh: '1' }).then(() => sites.refetch())}>Tải lại</button></>
              : null}
          {sites.data?.error ? <span className="text-bad"> {sites.data.error}</span> : null}
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey="dm02-v2"
            exportName="chi-nhanh"
            groupable
            exportRef={exportRef}
            rows={rows}
            rowKey={(b) => b.code}
            onSelect={setSel}
            onRowDoubleClick={(b) => canWrite && setEditing(b)}
            rowClassName={(b) => (b.isActive ? '' : 'muted')}
            footerLabel={false}
            columns={[
              { key: 'code', header: 'Mã chi nhánh', type: 'code', width: 130 },
              { key: 'name', header: 'Mô tả', width: 200 },
              { key: 'note', header: 'Ghi chú', width: 150 },
              { key: 'companyName', header: 'Tên công ty', width: 230 },
              { key: 'taxCode', header: 'Số ĐKKD/MST', type: 'code', width: 130 },
              { key: 'address', header: 'Địa chỉ', width: 260 },
              { key: 'phone', header: 'Điện thoại', type: 'code', width: 110 },
              { key: 'fax', header: 'Fax', type: 'code', width: 90, hidden: true },
              { key: 'isActive', header: 'Theo dõi', type: 'check', width: 70 },
              { key: 'accountingUnitCode', header: 'Đơn vị hạch toán', type: 'code', width: 120 },
              { key: 'departmentCode', header: 'Bộ phận', type: 'code', width: 100, render: (b) => b.departmentCode ?? <span className="text-bad">chưa gắn</span> },
              { key: 'externalRef', header: 'Mã tham chiếu nguồn', type: 'code', width: 120, hidden: true },
              { key: 'siteIds', header: 'Website (blog_id)', type: 'code', width: 110, title: 'Website bên hệ thống bán hàng đang nối với chi nhánh (qua kết nối chính)' },
              { key: 'siteNames', header: 'Tên website', width: 170 },
              { key: 'siteCodes', header: 'Mã kho website', type: 'code', width: 110 },
            ] satisfies Column<BranchRow>[]}
          />
        )}
      </div>
      {editing && <BranchForm value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function BranchForm({ value, onClose }: { value: Partial<Branch> & { isNew?: boolean }; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<Branch>) => setV((x) => ({ ...x, ...p }));
  // Đơn vị hạch toán đã dùng: chọn lại cho đúng mã; gõ mã mới là tạo đơn vị mới.
  const { data: all = [] } = useQuery({ queryKey: ['branches'], queryFn: () => api.get<Branch[]>('/api/v1/branches') });
  const sites = useBranchSites();
  const mine = (sites.data?.sites ?? []).filter((x) => x.branchCode && x.branchCode === value.code);
  const { data: departments = [] } = useQuery({ queryKey: ['dimensions', 'department'], queryFn: () => api.get<{ code: string; name: string; isActive: boolean }[]>('/api/v1/dimensions/department'), staleTime: 60_000 });
  const units = [...new Set(all.map((b) => b.accountingUnitCode).filter((c): c is string => Boolean(c)))].sort().map((code) => {
    const members = all.filter((b) => b.accountingUnitCode === code).map((b) => b.code);
    return { code, name: `${members.length} chi nhánh: ${members.slice(0, 6).join(', ')}${members.length > 6 ? '…' : ''}` };
  });
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: v.name, accountingUnitCode: v.accountingUnitCode || undefined, departmentCode: v.departmentCode || null, address: v.address ?? '', externalRef: v.externalRef || undefined,
        note: v.note ?? '', companyName: v.companyName ?? '', taxCode: v.taxCode ?? '', phone: v.phone ?? '', fax: v.fax ?? '',
      };
      const newCode = v.code?.trim();
      return value.isNew ? api.post('/api/v1/branches', { ...body, code: newCode })
        : api.patch(`/api/v1/branches/${encodeURIComponent(value.code!)}`, { ...body, isActive: v.isActive, ...(newCode && newCode !== value.code ? { newCode } : {}) });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['branches'] }); void qc.invalidateQueries({ queryKey: ['warehouses'] }); if (value.isNew || v.code?.trim() !== value.code) onClose(); else viewAgain[1](); },
  });
  const txt = (k: keyof Branch, label: string, full = false) => <Field label={label} full={full}><input className="input" value={String(v[k] ?? '')} onChange={(e) => set({ [k]: e.target.value } as Partial<Branch>)} /></Field>;
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} wide title="Thông tin chi nhánh" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !v.code?.trim() || !v.name?.trim()} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <fieldset className="fgroup">
        <legend>Thông tin cơ bản</legend>
        <Field label="Tên chi nhánh (điểm kinh doanh) (*)" hint={value.isNew ? 'Mã chi nhánh, khớp mã cửa hàng của hệ thống bán hàng' : 'Đổi mã khi shop lên Plus / Premium hoặc đóng (_OFF): chứng từ, sổ sách, kho giữ nguyên'}><input className="input mono" value={v.code ?? ''} onChange={(e) => set({ code: e.target.value })} autoFocus /></Field>
        {txt('name', 'Mô tả (*)')}
        {txt('note', 'Ghi chú')}
        {txt('taxCode', 'Số đăng ký kinh doanh/MST')}
        <Field label=" "><label className="checkbox"><input type="checkbox" checked={v.isActive !== false} onChange={(e) => set({ isActive: e.target.checked })} /> Theo dõi</label></Field>
      </fieldset>
      <fieldset className="fgroup">
        <legend>Thông tin in report</legend>
        {txt('companyName', 'Tên công ty', true)}
        {txt('address', 'Địa chỉ', true)}
        {txt('phone', 'Điện thoại')}
        {txt('fax', 'Fax')}
      </fieldset>
      <fieldset className="fgroup">
        <legend>Hạch toán</legend>
        <Field label="Đơn vị hạch toán" hint="Nhóm chi nhánh hạch toán chung (dùng cho giá vốn, nội bộ). Gõ mã mới là tạo đơn vị mới"><ListPicker strict={false} items={units} value={v.accountingUnitCode ?? ''} onChange={(accountingUnitCode) => set({ accountingUnitCode })} placeholder="Bấm để chọn" emptyText={units.length ? 'Không có đơn vị khớp — rời ô để tạo đơn vị mới với mã đang gõ' : 'Chưa có đơn vị nào — gõ mã mới để tạo'} /></Field>
        <Field label="Bộ phận" hint="Doanh thu, giá vốn, chi phí của chi nhánh ghi vào bộ phận này. Quy ước: BH + mã cửa hàng"><ListPicker strict={false} items={departments.filter((d) => d.isActive || d.code === v.departmentCode)} value={v.departmentCode ?? ''} onChange={(departmentCode) => set({ departmentCode: departmentCode || null })} placeholder={`Bấm để chọn (gợi ý BH${(v.code ?? '').slice(0, 5)})`} /></Field>
        {txt('externalRef', 'Mã tham chiếu ở hệ thống nguồn')}
      </fieldset>
      {!value.isNew && (
        <fieldset className="fgroup">
          <legend>Website bán hàng đang nối{sites.data?.connection ? ` (kết nối ${sites.data.connection.code})` : ''}</legend>
          <div className="full" style={{ fontSize: 13 }}>
            {sites.isLoading ? <span className="muted">Đang lấy…</span>
              : sites.data?.error ? <span className="text-bad">{sites.data.error}</span>
              : mine.length === 0 ? <span className="muted">Chưa có website nào nối với chi nhánh này (nối ở Cấu hình phân cấp multisite bên hệ thống bán hàng).</span>
              : (
                <table className="grid">
                  <thead><tr><th>Blog id</th><th>Tên website</th><th>Mã kho website</th><th>Địa chỉ</th></tr></thead>
                  <tbody>{mine.map((x) => (
                    <tr key={x.blogId}><td className="mono">{x.blogId}{x.isMain ? ' (site tổng)' : ''}</td><td>{x.name}{x.active ? '' : ' (ngừng)'}</td><td className="mono">{x.siteCode}</td>
                      <td><a href={x.url} target="_blank" rel="noreferrer">{x.url}</a></td></tr>
                  ))}</tbody>
                </table>
              )}
          </div>
        </fieldset>
      )}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}
