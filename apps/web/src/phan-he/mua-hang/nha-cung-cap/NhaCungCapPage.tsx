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
import { DataGrid, type Column } from '@/components/DataGrid';
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
  const rows = (q.data ?? []).filter((r) => (group === '-' ? !r.groupCode : !inGroup || (r.groupCode !== null && inGroup.has(r.groupCode)))).map((r, i) => ({ ...r, stt: i + 1 }));
  const soon = (d?: string) => d && d >= today() && d <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const open = (code: string) => navigate(`/mua-hang/nha-cung-cap/${encodeURIComponent(code)}`);
  const columns: Column<SupplierRow & { stt: number }>[] = [
    { key: 'stt', header: 'STT', type: 'number', width: 50 },
    { key: 'code', header: 'Mã NCC', type: 'code', width: 100, render: (r) => <Link to={`/mua-hang/nha-cung-cap/${encodeURIComponent(r.code)}`}>{r.code}</Link>, value: (r) => r.code },
    { key: 'name', header: 'Nhà cung cấp', width: 260, bold: true },
    { key: 'groupCode', header: 'Nhóm NCC', width: 150, value: (r) => groupName(r.groupCode) },
    { key: 'taxCode', header: 'MST', type: 'code', width: 110 },
    { key: 'phone', header: 'SĐT', type: 'code', width: 110, value: (r) => r.phone ?? '' },
    { key: 'address', header: 'Địa chỉ', width: 260, value: (r) => r.address ?? '', render: (r) => <span title={r.address ?? ''}>{r.address}</span> },
    { key: 'debt', header: 'Nợ phải trả', type: 'money', width: 120, sum: true },
    { key: 'overdue', header: 'Quá hạn', type: 'money', width: 110, sum: true, className: 'mh-bad' },
    { key: 'dueSoon', header: 'Sắp đến hạn', type: 'money', width: 110, sum: true },
    { key: 'creditLimit', header: 'Hạn mức', type: 'money', width: 120, value: (r) => r.creditLimit ?? undefined },
    { key: 'used', header: 'Đã dùng hạn mức', width: 130, value: (r) => (r.creditLimit ? Math.round((r.creditUsed / r.creditLimit) * 100) : undefined), render: (r) => r.creditLimit ? <span className={r.creditUsed > r.creditLimit ? 'mh-bad' : r.creditUsed > r.creditLimit * 0.9 ? 'mh-warn' : ''}>{Math.round((r.creditUsed / r.creditLimit) * 100)}% · còn {vnd(r.creditLimit - r.creditUsed)}</span> : <span className="muted">—</span> },
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
          <span className="muted" style={{ fontSize: 12 }}>{rows.length} nhà cung cấp · bấm đúp một dòng để mở hồ sơ</span>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid storageKey="mh-ncc-v1" exportName="nha-cung-cap-mua-hang" exportTitle="NHÀ CUNG CẤP MUA HÀNG" rows={rows} rowKey={(r) => r.code} columns={columns}
            onRowDoubleClick={(r) => open(r.code)} rowClassName={(r) => (r.overdue > 0 ? 'mh-row-warn' : '')} footerLabel="Cộng" emptyText={group ? `Không có nhà cung cấp ${group === '-' ? 'chưa có nhóm' : `thuộc nhóm ${groupName(group)}`}${scope === 'active' ? ' đang giao dịch — thử tab "Mọi nhà cung cấp"' : ''}` : 'Chưa có nhà cung cấp đang giao dịch — gõ mã / tên NCC ở ô bên trên để mở hồ sơ và khai báo'} />
        )}
      </div>
      {adding && <PartnerEditor kind="supplier" onClose={() => { setAdding(false); void q.refetch(); }} />}
    </>
  );
}
