/**
 * NHÀ CUNG CẤP MUA HÀNG (MH01) — cửa vào của phân hệ: mua hàng đi từ NCC. Mỗi NCC một dòng: nợ theo sổ, quá hạn, sắp đến hạn,
 * hạn mức đã dùng, điều khoản thanh toán bằng chữ, số chính sách, hợp đồng còn hiệu lực, lần nhập gần nhất, mua tháng này,
 * đơn đang mở, tệp đính kèm. Lọc / sắp xếp từng cột, xuất Excel. Bấm đúp (hoặc bấm mã) → Hồ sơ NCC.
 * Mặc định: NCC đang giao dịch (có chính sách / chứng từ / công nợ / tệp); "Mọi NCC" hiện cả danh mục nhà cung cấp.
 * Lọc theo nhóm NCC (DM08): chọn một nhóm thì lấy cả NCC của các nhóm con; "(Chưa có nhóm)" = NCC chưa gán nhóm.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column, type RowKind } from '@/components/DataGrid';
import { ListPicker, PartnerPicker } from '@/components/pickers';
import { api, errorText } from '@/lib/api';
import { purchaseApi, today, vnd, type SupplierRow } from '../du-lieu';
import { dmy } from '../chung';
import { PartnerEditor } from '../../../features/catalog/PartnersPage';
import '../mua-hang.css';

export function NhaCungCapPage() {
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const [pick, setPick] = useState('');
  const [group, setGroup] = useState('');
  // [2026-11-13 Nguyễn Văn Thủy] gộp theo đơn vị mẹ: mỗi nhóm cha – con một dòng cộng, các đơn vị bên dưới (đóng góp)
  const [gop, setGop] = useState(false);
  const q = useQuery({ queryKey: ['mua-hang', 'suppliers', scope], queryFn: () => purchaseApi.suppliers(scope) });
  const groups = useQuery({ queryKey: ['partner-groups'], queryFn: () => api.get<{ code: string; name: string; parentCode: string | null; kind: string; isActive: boolean }[]>('/api/v1/partner-groups'), staleTime: 60_000 });
  const groupList = groups.data ?? [];
  const groupName = (c: string | null) => (c ? groupList.find((g) => g.code === c)?.name ?? c : '');
  // Nhóm đã chọn + mọi nhóm con (nhóm đối tượng là cây).
  const inGroup = useMemo(() => {
    if (!group || group === '-') return null;
    const set = new Set([group]);
    for (let added = true; added;) { added = false; for (const g of groupList) if (g.parentCode && set.has(g.parentCode) && !set.has(g.code)) { set.add(g.code); added = true; } }
    return set;
  }, [group, groupList]);
  /** _kind 'subtotal' = dòng đơn vị trong nhóm (bung ra), không cộng vào dòng Cộng; _members = số đơn vị của nhóm (dòng đơn vị mẹ). */
  type Row = SupplierRow & { stt: number; _kind?: RowKind; _depth?: number; _members?: number; _own?: boolean };
  const flat = (q.data ?? []).filter((r) => (group === '-' ? !r.groupCode : !inGroup || (r.groupCode !== null && inGroup.has(r.groupCode))));
  const families = useMemo(() => { const m = new Map<string, SupplierRow[]>(); for (const r of flat) if ((r.rootCode && r.rootCode !== r.code) || flat.some((x) => x.rootCode === r.code && x.code !== r.code)) m.set(r.rootCode ?? r.code, [...(m.get(r.rootCode ?? r.code) ?? []), r]); return m; }, [flat]);
  const depthOf = (r: SupplierRow) => { let d = 0, c: SupplierRow | undefined = r; while (c?.parentCode && d < 10) { d++; c = flat.find((x) => x.code === c!.parentCode); } return d; };
  // [2026-11-13 Nguyễn Văn Thủy] xem theo nhóm: một dòng / nhóm (số = tổng cả nhóm), bấm "+n chi nhánh" bung từng đơn vị (đóng góp)
  const [bung, setBung] = useState<Set<string>>(new Set());
  const toggle = (c: string) => setBung((o) => { const x = new Set(o); if (x.has(c)) x.delete(c); else x.add(c); return x; });
  const rows: Row[] = useMemo(() => {
    if (!gop) return flat.map((r, i) => ({ ...r, stt: i + 1 }));
    const out: Row[] = []; const done = new Set<string>(); let n = 0;
    for (const r of flat) {
      if (done.has(r.code)) continue;
      const fam = families.get(r.rootCode ?? r.code);
      if (!fam) { out.push({ ...r, stt: ++n }); done.add(r.code); continue; }
      const root = flat.find((x) => x.code === (r.rootCode ?? r.code)) ?? fam[0]!;
      const sum = (k: 'debt' | 'overdue' | 'dueSoon' | 'monthPurchase' | 'documents' | 'openOrders' | 'advance') => fam.reduce((s, x) => s + (x[k] ?? 0), 0);
      const pool = fam.find((x) => x.creditPool === root.code) ?? (root.creditLimit ? root : undefined);
      out.push({ ...root, stt: ++n, debt: sum('debt'), advance: sum('advance'), overdue: sum('overdue'), dueSoon: sum('dueSoon'), monthPurchase: sum('monthPurchase'), documents: sum('documents'), openOrders: sum('openOrders'),
        creditLimit: pool ? pool.creditLimit : root.creditLimit, creditUsed: pool ? pool.creditUsed : root.creditUsed, _members: fam.length });
      fam.forEach((x) => done.add(x.code));
      if (bung.has(root.code)) {
        const ordered = [...fam].sort((a, b) => (a.code === root.code ? -1 : b.code === root.code ? 1 : a.code.localeCompare(b.code)));
        for (const x of ordered) out.push({ ...x, stt: 0, _kind: 'subtotal', _depth: depthOf(x) + 1, _own: x.code === root.code });
      }
    }
    return out;
  }, [gop, flat, families, bung]); // eslint-disable-line react-hooks/exhaustive-deps
  const soon = (d?: string) => d && d >= today() && d <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const open = (code: string) => navigate(`/mua-hang/nha-cung-cap/${encodeURIComponent(code)}`);
  const columns: Column<Row>[] = [
    { key: 'stt', header: 'STT', type: 'number', width: 50, render: (r) => (r._kind ? '' : r.stt) },
    { key: 'code', header: 'Mã NCC', type: 'code', width: 140, render: (r) => <span style={{ paddingLeft: (r._depth ?? 0) * 14 }}>{(r._depth ?? 0) > 0 && <span className="muted">└ </span>}<Link to={`/mua-hang/nha-cung-cap/${encodeURIComponent(r.code)}`}>{r.code}</Link></span>, value: (r) => r.code },
    { key: 'name', header: 'Nhà cung cấp', width: 300, bold: (r) => !r._kind, value: (r) => r.name,
      render: (r) => <span>{r.name}{r._own && <span className="muted"> (đơn vị mẹ)</span>}{r._members && r._members > 1 ? (
        <button type="button" className="mh-nhom-tag" title={bung.has(r.code) ? 'Thu lại' : 'Số trên dòng này là tổng cả nhóm — bấm để xem từng đơn vị'} onClick={(e) => { e.stopPropagation(); toggle(r.code); }}>
          +{r._members - 1} chi nhánh {bung.has(r.code) ? '▾' : '▸'}</button>) : null}</span> },
    { key: 'parentCode', header: 'Thuộc đơn vị cha', type: 'code', width: 120, title: 'Đơn vị mẹ của chi nhánh NCC (Danh mục → Nhà cung cấp → Cây cha – con)', value: (r) => r.parentCode ?? '' },
    { key: 'groupCode', header: 'Nhóm NCC', width: 150, value: (r) => groupName(r.groupCode) },
    { key: 'taxCode', header: 'MST', type: 'code', width: 110 },
    { key: 'phone', header: 'SĐT', type: 'code', width: 110, value: (r) => r.phone ?? '' },
    { key: 'address', header: 'Địa chỉ', width: 260, value: (r) => r.address ?? '', render: (r) => <span title={r.address ?? ''}>{r.address}</span> },
    { key: 'debt', header: 'Nợ phải trả', type: 'money', width: 120, sum: true },
    { key: 'overdue', header: 'Quá hạn', type: 'money', width: 110, sum: true, className: 'mh-bad' },
    { key: 'dueSoon', header: 'Sắp đến hạn', type: 'money', width: 110, sum: true },
    { key: 'creditLimit', header: 'Hạn mức', type: 'money', width: 120, value: (r) => r.creditLimit ?? undefined },
    { key: 'used', header: 'Đã dùng hạn mức', width: 150, title: 'Hạn mức khai ở đơn vị mẹ, tích "Áp cho cả đơn vị con": cả nhóm dùng chung — số đã dùng là của cả nhóm', value: (r) => (r.creditLimit ? Math.round((r.creditUsed / r.creditLimit) * 100) : undefined), render: (r) => r.creditLimit ? <span className={r.creditUsed > r.creditLimit ? 'mh-bad' : r.creditUsed > r.creditLimit * 0.9 ? 'mh-warn' : ''} title={r.creditPool ? `Hạn mức chung cả nhóm ${r.creditPool}` : undefined}>{Math.round((r.creditUsed / r.creditLimit) * 100)}% · còn {vnd(r.creditLimit - r.creditUsed)}{r.creditPool ? ' · chung nhóm' : ''}</span> : <span className="muted">—</span> },
    { key: 'term', header: 'Điều khoản thanh toán', width: 280, render: (r) => r.term || <span className="muted">chưa khai</span>, value: (r) => r.term },
    { key: 'policies', header: 'Số chính sách', type: 'number', width: 90 },
    { key: 'contractTo', header: 'Hợp đồng đến', width: 110, value: (r) => dmy(r.contractTo), render: (r) => r.contractTo ? <span className={r.contractTo < today() ? 'mh-bad' : soon(r.contractTo) ? 'mh-warn' : ''}>{dmy(r.contractTo)}</span> : r.contractNo ? 'không thời hạn' : <span className="muted">—</span> },
    { key: 'openOrders', header: 'Đơn đang mở', type: 'number', width: 90 },
    { key: 'lastReceipt', header: 'Nhập gần nhất', width: 100, value: (r) => dmy(r.lastReceipt) },
    { key: 'monthPurchase', header: 'Mua tháng này', type: 'money', width: 120, sum: true },
    { key: 'documents', header: 'Chứng từ', type: 'number', width: 80 },
    { key: 'attachments', header: 'Tệp', type: 'number', width: 60 },
    { key: 'createdBy', header: 'Người tạo', width: 120, value: (r) => r.createdBy ?? '' },
    { key: 'createdAt', header: 'Ngày giờ tạo', width: 140, value: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString('vi-VN', { hour12: false }) : '') },
  ];
  return (
    <>
      <PageHeader title="Nhà cung cấp mua hàng" code="MH01" helpKey="mua-hang-nha-cung-cap" subtitle="Mua hàng đi từ nhà cung cấp — bấm một NCC để xem và khai mọi thứ của NCC đó: hợp đồng, hạn mức, hạn trả, chiết khấu, thưởng, giá, mặt hàng, chứng từ, tệp" />
      <div className="card">
        <div className="row" style={{ gap: 8, padding: '8px 12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="tabs" style={{ margin: 0 }}>
            <button className={`tab ${scope === 'active' ? 'active' : ''}`} onClick={() => setScope('active')}>Đang giao dịch</button>
            <button className={`tab ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>Mọi nhà cung cấp</button>
          </div>
          <div style={{ width: 220 }}>
            <ListPicker className="input" items={[{ code: '-', name: '(Chưa có nhóm)' }, ...groupList.filter((g) => g.isActive && (g.kind === 'any' || g.kind === 'supplier')).map((g) => ({ code: g.code, name: g.name }))]}
              value={group} onChange={(c) => setGroup(c)} placeholder="Tất cả nhóm NCC" />
          </div>
          <div style={{ width: 280 }}><PartnerPicker value={pick} onChange={(c) => { setPick(c); if (c) open(c); }} placeholder="Mở NCC: gõ mã hoặc tên" /></div>
          <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>+ Thêm nhà cung cấp</button>
          <label className="checkbox" title="Nhà cung cấp có đơn vị mẹ và chi nhánh: mỗi nhóm một dòng, số nợ là tổng cả nhóm; bấm '+ chi nhánh' để xem từng đơn vị"><input type="checkbox" checked={gop} onChange={(e) => setGop(e.target.checked)} /> Xem theo nhóm mẹ – chi nhánh{families.size ? ` (${families.size} nhóm)` : ''}</label>
          <span className="muted" style={{ fontSize: 12 }}>{flat.length} nhà cung cấp · bấm đúp một dòng để mở hồ sơ</span>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid storageKey="mh-ncc-v2" rowKind={(r) => r._kind ?? 'data'} exportName="nha-cung-cap-mua-hang" exportTitle="NHÀ CUNG CẤP MUA HÀNG" rows={rows} rowKey={(r) => (r._kind ? `con:${r.code}` : r.code)} columns={columns}
            onRowDoubleClick={(r) => open(r.code)} rowClassName={(r) => (r._kind ? 'mh-ncc-con' : r.overdue > 0 ? 'mh-row-warn' : '')} footerLabel="Cộng" emptyText={group ? `Không có nhà cung cấp ${group === '-' ? 'chưa có nhóm' : `thuộc nhóm ${groupName(group)}`}${scope === 'active' ? ' đang giao dịch — thử tab "Mọi nhà cung cấp"' : ''}` : 'Chưa có nhà cung cấp đang giao dịch — gõ mã / tên NCC ở ô bên trên để mở hồ sơ và khai báo'} />
        )}
      </div>
      {adding && <PartnerEditor kind="supplier" onClose={() => { setAdding(false); void q.refetch(); }} />}
    </>
  );
}
