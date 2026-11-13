/**
 * Chi nhánh (DM02). Mã chi nhánh phải khớp mã hệ thống bán hàng gửi sang (branchCode).
 * Lưới: Mã chi nhánh · Mô tả (tên gọi) · Ghi chú · Tên công ty · Số ĐKKD/MST · Địa chỉ · Điện thoại · Fax · Theo dõi;
 * thêm của phần mềm kế toán: Đơn vị hạch toán, Bộ phận.
 * Form: Thông tin cơ bản (Mã*, Mô tả, Ghi chú, Số ĐKKD/MST) · Thông tin in report (Tên công ty, Địa chỉ, Điện thoại, Fax) · Hạch toán
 *       · Website bán hàng (đang nối).
 * Cầu nối hệ thống bán hàng: qua KẾT NỐI CHÍNH (Định khoản tự động → Kết nối), cột Website / Tên website / Mã kho website
 * hiện website (blog_id) đang nối với từng chi nhánh — theo cấu hình phân cấp bên hệ thống bán hàng.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { CanhBao, ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapLoai } from '@/lib/nhapExcel';
import { ListPicker } from '@/components/pickers';
import { useDimension } from '@/components/voucher/lookups';
// [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — chi nhánh thuộc nút sơ đồ tổ chức: cột C1 / C2 / C3, ô chọn nút ở form
import { indexOrg, invalidateOrg, useOrgTree } from '@/lib/orgUnits';
import { CayDonVi, ChonSoDoToChuc } from '@/components/CayDonVi';

interface SourceSite { blogId: number; name: string; url: string; siteCode: string; branchCode: string | null; isMain: boolean; active: boolean }
interface BranchSites { connection: { code: string; name: string } | null; sites: SourceSite[]; error?: string }
type BranchRow = Branch & { siteIds: string; siteNames: string; siteCodes: string; c1: string; c2: string; c3: string };

/** Website của hệ thống bán hàng (qua kết nối chính) — dùng chung cho lưới và form. */
function useBranchSites() {
  return useQuery({ queryKey: ['branch-sites'], queryFn: () => api.get<BranchSites>('/api/v1/branches/sites'), staleTime: 60_000 });
}

interface Branch {
  code: string; name: string; accountingUnitCode: string | null; departmentCode: string | null; address: string | null; externalRef: string | null; isActive: boolean;
  note: string; companyName: string; taxCode: string; phone: string; fax: string;
  orgUnitCode: string | null; orgPath: string; validFrom?: string;
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
    // Đường dẫn Công ty\BAC\PT\PTO → cấp 1 / 2 / 3 (gốc Công ty không tính cấp).
    const seg = (b.orgPath ?? '').split('\\');
    return { ...b, siteIds: list.map((x) => x.blogId).join(', '), siteNames: list.map((x) => x.name).join(', '), siteCodes: list.map((x) => x.siteCode).filter(Boolean).join(', '), c1: seg[1] ?? '', c2: seg[2] ?? '', c3: seg[3] ?? '' };
  });
  // [2026-11-03 03:30 PM Nguyễn Văn Thủy] SDTC — cây sơ đồ tổ chức bên trái: bấm nút lọc chi nhánh trong nhánh đó
  const org = useOrgTree();
  const ix = useMemo(() => indexOrg(org.data), [org.data]);
  const [orgSel, setOrgSel] = useState<string | null>(null); // null = tất cả, '' = chưa gắn
  const inNode = orgSel ? ix.subtree(orgSel) : null;
  const shown = orgSel === null ? rows : orgSel === '' ? rows.filter((b) => !b.orgUnitCode) : rows.filter((b) => b.orgUnitCode && inNode!.has(b.orgUnitCode));
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
          extra={<NutNhapExcel loai={nhapLoai('chi-nhanh')!} disabled={!canWrite} />}
        />
        <div className="muted" style={{ fontSize: 12, padding: '4px 8px' }}>
          {sites.isLoading ? 'Đang lấy danh sách website của hệ thống bán hàng…'
            : sites.data?.connection
              ? <>Kết nối chính: <b>{sites.data.connection.code}</b> — {sites.data.connection.name} · {sites.data.sites.length} website, {linked.length} đã nối chi nhánh
                {unknown.length ? <span className="text-bad"> · {unknown.length} website nối chi nhánh chưa có ở danh mục: {unknown.map((x) => `${x.branchCode} (blog ${x.blogId})`).join(', ')}</span> : null}
                {' '}<button type="button" className="btn btn-sm btn-ghost" onClick={() => void api.get('/api/v1/branches/sites', { refresh: '1' }).then(() => sites.refetch())}>Tải lại</button></>
              : null}
          {/* [2026-11-13 Nguyễn Văn Thủy] lỗi kết nối hệ thống bán hàng: dấu ! nhỏ, rê chuột xem chi tiết (đóng góp) */}
          {sites.data?.error ? <> <CanhBao text={sites.data.error} /></> : null}
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 10, padding: '0 8px 8px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 4, margin: '2px 0 6px', alignItems: 'center' }}>
              <b style={{ flex: 1 }}>Sơ đồ tổ chức</b>
              <button type="button" className={`btn btn-xs${orgSel === null ? ' btn-primary' : ''}`} onClick={() => setOrgSel(null)}>Tất cả</button>
              <button type="button" className={`btn btn-xs${orgSel === '' ? ' btn-primary' : ''}`} title="Chi nhánh chưa gắn sơ đồ tổ chức" onClick={() => setOrgSel('')}>Chưa gắn ({rows.filter((b) => !b.orgUnitCode).length})</button>
            </div>
            <CayDonVi tree={org.data} selected={orgSel || null} onSelect={(n) => setOrgSel(n.level === 0 ? null : n.code)} height="calc(100vh - 330px)" openLevel={2} />
          </div>
          <div style={{ minWidth: 0 }}>
          <DataGrid
            storageKey="dm02-v2"
            exportName="chi-nhanh"
            groupable
            exportRef={exportRef}
            rows={shown}
            rowKey={(b) => b.code}
            onSelect={setSel}
            onRowDoubleClick={(b) => canWrite && setEditing(b)}
            rowClassName={(b) => (b.isActive ? '' : 'muted')}
            footerLabel={false}
            columns={[
              { key: 'code', header: 'Mã chi nhánh', type: 'code', width: 130 },
              { key: 'name', header: 'Tên chi nhánh', width: 200 },
              { key: 'note', header: 'Ghi chú', width: 150 },
              { key: 'companyName', header: 'Tên công ty', width: 230 },
              { key: 'taxCode', header: 'Số ĐKKD/MST', type: 'code', width: 130 },
              { key: 'address', header: 'Địa chỉ', width: 260 },
              { key: 'phone', header: 'Điện thoại', type: 'code', width: 110 },
              { key: 'isActive', header: 'Theo dõi', type: 'check', width: 70 },
              // [2026-11-13 Nguyễn Văn Thủy] một cột Thuộc cơ cấu thay C1/C2/C3; bỏ cột Bộ phận, Fax, Mã tham chiếu (đóng góp)
              { key: 'orgPath', header: 'Thuộc cơ cấu', width: 220, title: 'Vị trí trong Cơ cấu tổ chức', render: (b) => b.orgPath || <span className="text-bad">chưa gắn</span> },
              // [2026-11-13 Nguyễn Văn Thủy] ánh xạ phòng ban: chứng từ của chi nhánh tự mang phòng ban này (0129) (đóng góp)
              { key: 'departmentCode', header: 'Phòng ban', type: 'code', width: 110, title: 'Phòng ban của chi nhánh trên sơ đồ phòng ban: mọi chứng từ ghi cho chi nhánh tự mang phòng ban này. Trống thì chứng từ vào tài khoản theo dõi phòng ban bị chặn', render: (b) => b.departmentCode || <span className="text-bad">chưa gắn</span> },
              { key: 'siteIds', header: 'Website (blog_id)', type: 'code', width: 110, title: 'Website bên hệ thống bán hàng đang nối với chi nhánh (qua kết nối chính)' },
              { key: 'siteNames', header: 'Tên website', width: 170 },
              { key: 'siteCodes', header: 'Mã kho website', type: 'code', width: 110 },
            ] satisfies Column<BranchRow>[]}
          />
          </div>
          </div>
        )}
      </div>
      {editing && <BranchForm value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

// [2026-11-11 Nguyễn Văn Thủy] export + onSaved: thêm nhanh chi nhánh từ ô chọn chi nhánh trên phiếu (đóng góp)
export function BranchForm({ value, onClose, onSaved }: { value: Partial<Branch> & { isNew?: boolean }; onClose: () => void; /** Ghi xong (thêm mới): mã chi nhánh vừa thêm. */ onSaved?: (code: string) => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<Branch>) => setV((x) => ({ ...x, ...p }));
  const sites = useBranchSites();
  const mine = (sites.data?.sites ?? []).filter((x) => x.branchCode && x.branchCode === value.code);
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: v.name, accountingUnitCode: v.accountingUnitCode || undefined, ...(value.isNew ? {} : { departmentCode: v.departmentCode || null }), address: v.address ?? '', externalRef: v.externalRef || undefined,
        note: v.note ?? '', companyName: v.companyName ?? '', taxCode: v.taxCode ?? '', phone: v.phone ?? '', fax: v.fax ?? '',
      };
      const newCode = v.code?.trim();
      return value.isNew ? api.post('/api/v1/branches', { ...body, code: newCode })
        : api.patch(`/api/v1/branches/${encodeURIComponent(value.code!)}`, { ...body, isActive: v.isActive, ...(newCode && newCode !== value.code ? { newCode } : {}), ...((v.orgUnitCode ?? null) !== (value.orgUnitCode ?? null) ? { orgUnitCode: v.orgUnitCode || null, validFrom: v.validFrom || null } : {}) });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['branches'] }); void qc.invalidateQueries({ queryKey: ['warehouses'] }); invalidateOrg(qc); if (value.isNew) onSaved?.(v.code?.trim() ?? ''); if (value.isNew || v.code?.trim() !== value.code) onClose(); else viewAgain[1](); },
  });
  const txt = (k: keyof Branch, label: string, full = false) => <Field label={label} full={full}><input className="input" value={String(v[k] ?? '')} onChange={(e) => set({ [k]: e.target.value } as Partial<Branch>)} /></Field>;
  const deps = useDimension('department').filter((d) => d.isActive !== false || d.code === v.departmentCode).map((d) => ({ code: d.code, name: d.name }));
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} wide title="Thông tin chi nhánh" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !v.code?.trim() || !v.name?.trim()} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <fieldset className="fgroup">
        <legend>Thông tin cơ bản</legend>
        <Field label="Mã chi nhánh (*)" hint={value.isNew ? 'Mã chi nhánh, khớp mã cửa hàng của hệ thống bán hàng' : 'Đổi mã khi shop lên Plus / Premium hoặc đóng (_OFF): chứng từ, sổ sách, kho giữ nguyên'}><input className="input mono" value={v.code ?? ''} onChange={(e) => set({ code: e.target.value })} autoFocus /></Field>
        {txt('name', 'Tên chi nhánh (*)')}
        {txt('note', 'Ghi chú')}
        {txt('taxCode', 'MST')}
        {!value.isNew && (
          <Field label="Thuộc cơ cấu" hint="Nút trong Cơ cấu tổ chức (thường cấp Tỉnh)">
            <ChonSoDoToChuc value={v.orgUnitCode ?? null} onChange={(orgUnitCode) => set({ orgUnitCode })} />
          </Field>
        )}
        {/* [2026-11-13 Nguyễn Văn Thủy] đổi cơ cấu: chọn ngày có hiệu lực; chứng từ trước ngày giữ cơ cấu cũ (đóng góp) */}
        {!value.isNew && (v.orgUnitCode ?? null) !== (value.orgUnitCode ?? null) && (
          <Field label="Cơ cấu mới áp dụng từ ngày" tip="Chứng từ từ ngày này tính vào nút cơ cấu mới; chứng từ trước ngày này giữ nút cũ">
            <input className="input" type="date" value={v.validFrom ?? new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)} onChange={(e) => set({ validFrom: e.target.value })} />
          </Field>
        )}
        {!value.isNew && (
          <Field label="Phòng ban" tip="Phòng ban của chi nhánh trên sơ đồ phòng ban; chứng từ của chi nhánh tự mang phòng ban này. Chi nhánh mới tự có phòng ban riêng">
            <ListPicker value={v.departmentCode ?? ''} onChange={(c) => set({ departmentCode: c || null })} items={deps} />
          </Field>
        )}
        <Field label=" "><label className="checkbox"><input type="checkbox" checked={v.isActive !== false} onChange={(e) => set({ isActive: e.target.checked })} /> Theo dõi</label></Field>
      </fieldset>
      {/* [2026-11-13 Nguyễn Văn Thủy] bỏ ô Đơn vị hạch toán (khó hiểu, chưa chi nhánh nào dùng); dữ liệu cũ giữ nguyên (đóng góp) */}
      <fieldset className="fgroup">
        <legend>Thông tin in trên chứng từ</legend>
        {txt('companyName', 'Tên công ty', true)}
        {txt('address', 'Địa chỉ', true)}
        {txt('phone', 'Điện thoại')}
      </fieldset>
      {!value.isNew && (
        <fieldset className="fgroup">
          <legend>Website bán hàng đang nối{sites.data?.connection ? ` (kết nối ${sites.data.connection.code})` : ''}</legend>
          <div className="full" style={{ fontSize: 13 }}>
            {sites.isLoading ? <span className="muted">Đang lấy…</span>
              : sites.data?.error ? <CanhBao text={sites.data.error} />
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
