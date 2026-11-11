/**
 * Báo cáo hàng hoá, lãi lỗ theo cửa hàng:
 *   BH04 Lãi gộp — doanh thu thuần − giá vốn theo mặt hàng, nhóm hàng, cửa hàng, khách…
 *   HH01 Bảng kê chuyển kho — chi nhánh xuất → nhận, đã nhận, còn trên đường.
 *   KQ01 Kết quả kinh doanh theo cửa hàng — từ sổ cái, theo bộ phận (cửa hàng) hoặc chi nhánh.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { date, defaultFrom, defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading, Money } from '@/components/ui';
import { ChonNhomHang, useLocNhomHang } from '@/components/CayNhomHang';
import { DataGrid, type Column } from '@/components/DataGrid';
import { KindSelect, ScopeSelect } from '../../../components/salesFilters';
import { PrintButton } from '@/components/print';
import { PNL_TEMPLATES, PROFIT_TEMPLATES, TRANSFER_TEMPLATES } from './mauIn/baoCaoHang';

/* ------------------------------------------------------------------ BH04 lãi gộp */
type GroupBy = 'product' | 'itemGroup1' | 'itemGroup2' | 'itemGroup3' | 'itemType' | 'branch' | 'department' | 'customer' | 'customerGroup' | 'month';
const GROUPS: { key: GroupBy; tab: string; keyHead: string; labelHead?: string; extraHead?: string }[] = [
  { key: 'product', tab: 'Theo mặt hàng', keyHead: 'Mã hàng', labelHead: 'Tên hàng', extraHead: 'ĐVT' },
  // [2026-11-03 02:40 PM Nguyễn Văn Thủy] NHOM — lãi gộp theo cây nhóm hàng cấp 1 / 2 / 3, thay 3 thẻ ngành / nhãn / nhóm rời
  { key: 'itemGroup1', tab: 'Theo nhóm cấp 1', keyHead: 'Mã nhóm', labelHead: 'Nhóm hàng cấp 1' },
  { key: 'itemGroup2', tab: 'Theo nhóm cấp 2', keyHead: 'Mã nhóm', labelHead: 'Nhóm hàng cấp 2' },
  { key: 'itemGroup3', tab: 'Theo nhóm cấp 3', keyHead: 'Mã nhóm', labelHead: 'Nhóm hàng cấp 3' },
  { key: 'itemType', tab: 'Theo loại hàng', keyHead: 'Mã loại', labelHead: 'Loại hàng' },
  { key: 'branch', tab: 'Theo chi nhánh', keyHead: 'Mã chi nhánh', labelHead: 'Tên chi nhánh' },
  { key: 'department', tab: 'Theo bộ phận (cửa hàng)', keyHead: 'Mã bộ phận', labelHead: 'Bộ phận' },
  { key: 'customer', tab: 'Theo khách hàng', keyHead: 'Mã khách', labelHead: 'Tên khách', extraHead: 'Mã số thuế' },
  { key: 'customerGroup', tab: 'Theo nhóm khách', keyHead: 'Mã nhóm', labelHead: 'Nhóm khách' },
  { key: 'month', tab: 'Theo tháng', keyHead: 'Tháng' },
];
interface ProfitRow { key: string; label: string; extra: string; qty: number; revenue: number; cost: number; giftCost: number; gross: number; margin: number | null; uncosted: number }
interface ProfitData { rows: ProfitRow[]; totals: Omit<ProfitRow, 'key' | 'label' | 'extra' | 'uncosted'>; uncosted: number }

export function GrossProfitPage() {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '', warehouseCodes: '', groups: '', kind: 'all', scope: 'all', groupBy: 'product' as GroupBy });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['gross-profit', f], queryFn: () => api.get<ProfitData>('/api/v1/reports/gross-profit', f) });
  const d = q.data;
  const g = GROUPS.find((x) => x.key === f.groupBy)!;
  const cols: Column<ProfitRow>[] = [
    { key: 'key', header: g.keyHead, type: f.groupBy === 'month' ? undefined : 'code', value: (r) => (f.groupBy === 'month' ? r.label : r.key || '(chưa phân loại)') },
    ...(g.labelHead ? [{ key: 'label', header: g.labelHead } as Column<ProfitRow>] : []),
    ...(g.extraHead ? [{ key: 'extra', header: g.extraHead } as Column<ProfitRow>] : []),
    { key: 'qty', header: 'Số lượng', type: 'qty', sum: true },
    { key: 'revenue', header: 'Doanh thu thuần', type: 'money', sum: true },
    { key: 'cost', header: 'Giá vốn', type: 'money', sum: true },
    { key: 'giftCost', header: 'Trong đó giá vốn hàng tặng', type: 'money', sum: true, hidden: true },
    { key: 'gross', header: 'Lãi gộp', type: 'money', sum: true, bold: true, render: (r) => <span className={r.gross < 0 ? 'text-bad' : ''}><Money value={r.gross} blankZero={false} /></span> },
    { key: 'margin', header: '% lãi gộp', type: 'number', value: (r) => r.margin ?? null, render: (r) => (r.margin === null ? '' : <span className={r.margin < 0 ? 'text-bad' : ''}>{r.margin}%</span>) },
    { key: 'uncosted', header: 'Dòng chưa có giá vốn', type: 'number', hidden: !d?.uncosted },
  ];
  return (
    <>
      <PageHeader title="Lãi gộp" code="BH04" subtitle="Doanh thu thuần (sau chiết khấu, trừ hàng trả lại) trừ giá vốn, theo mặt hàng, nhóm hàng, cửa hàng, khách hàng" helpKey="lai-gop" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen="BH04" templates={PROFIT_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ from: f.from, to: f.to, branchCodes: f.branchCodes, groupBy: f.groupBy, tab: g.tab, keyHead: g.keyHead, labelHead: g.labelHead, extraHead: g.extraHead, rows: d.rows, totals: d.totals }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} warehouses={{ value: f.warehouseCodes, onChange: (warehouseCodes) => set({ warehouseCodes }) }} />
            <ChonNhomHang value={f.groups} onChange={(groups) => set({ groups })} />
            <KindSelect value={f.kind} onChange={(kind) => set({ kind })} />
            <ScopeSelect value={f.scope} onChange={(scope) => set({ scope })} />
          </>
        }
      >
        {d && (
          <div className="kpis">
            <div className="card kpi"><div className="label">Doanh thu thuần</div><div className="value"><Money value={d.totals.revenue} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Giá vốn</div><div className="value"><Money value={d.totals.cost} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Lãi gộp{d.totals.margin !== null ? ` (${d.totals.margin}%)` : ''}</div><div className={`value ${d.totals.gross < 0 ? 'text-bad' : ''}`}><Money value={d.totals.gross} blankZero={false} /></div></div>
          </div>
        )}
        <div className="card">
          <div className="tabs" role="tablist">
            {GROUPS.map((x) => <button key={x.key} role="tab" className={`tab ${f.groupBy === x.key ? 'active' : ''}`} onClick={() => set({ groupBy: x.key })}>{x.tab}</button>)}
          </div>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {d && d.uncosted > 0 && <div className="card-body muted">Có {d.uncosted.toLocaleString('vi-VN')} dòng bán chưa có giá vốn (tháng chưa tính giá vốn): lãi gộp đang cao hơn thực tế. Vào <b>Tính giá vốn (ACC49)</b> để tính.</div>}
          {q.isLoading ? <Loading /> : !d?.rows.length ? <Empty text="Không có hàng bán trong khoảng này" /> : (
            <DataGrid storageKey={`bh04-${f.groupBy}`} rows={d.rows} rowKey={(r) => r.key} columns={cols} exportName={`lai-gop-${f.groupBy}-${f.from}-${f.to}`} exportTitle={`Lãi gộp ${g.tab.toLowerCase()} từ ${date(f.from)} đến ${date(f.to)}`} />
          )}
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ HH01 bảng kê chuyển kho */
interface TransferRow { eventId: string; docNo: string; outDate: string | null; inDate: string | null; fromBranch: string; toBranch: string; sku: string; name: string; unit: string; outQty: number; outValue: number; inQty: number; pendingQty: number; status: 'received' | 'partial' | 'pending'; uncosted: number }
const STATUS: Record<string, string> = { received: 'Đã nhận', partial: 'Nhận một phần', pending: 'Đang trên đường' };

export function StockTransfersPage() {
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '', status: 'all' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['stock-transfers', f], queryFn: () => api.get<{ rows: TransferRow[]; totals: { outValue: number; pendingLines: number }; uncosted: number }>('/api/v1/reports/stock-transfers', f) });
  // [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — lọc theo nhóm hàng
  const [nhom, setNhom] = useState('');
  const ln = useLocNhomHang(nhom);
  const d = q.data && ln.coLoc ? { ...q.data, rows: ln.loc(q.data.rows) } : q.data;
  return (
    <>
      <PageHeader title="Bảng kê chuyển kho" code="HH01" subtitle="Hàng chuyển giữa các chi nhánh theo phiếu và mặt hàng: đã nhận, còn trên đường (số dư hàng đang chuyển)" helpKey="bang-ke-chuyen-kho" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen="HH01" templates={TRANSFER_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} label="Chi nhánh xuất hoặc nhận" />
            <ChonNhomHang value={nhom} onChange={setNhom} />
            <div className="field"><label>Trạng thái</label><select className="select input" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="all">Tất cả</option><option value="pending">Chưa nhận đủ</option><option value="received">Đã nhận đủ</option></select></div>
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {d && <div className="card-body muted" style={{ paddingTop: 0 }}>{d.rows.length.toLocaleString('vi-VN')} dòng · giá trị xuất <b><Money value={d.totals.outValue} blankZero={false} /></b> · {d.totals.pendingLines.toLocaleString('vi-VN')} dòng chưa nhận đủ{d.uncosted ? ` · ${d.uncosted} dòng chưa có giá trị (tháng chưa tính giá vốn)` : ''}</div>}
          {q.isLoading ? <Loading /> : !d?.rows.length ? <Empty text="Không có phiếu chuyển kho trong khoảng này" /> : (
            <DataGrid
              storageKey="hh01"
              rows={d.rows}
              rowKey={(r) => `${r.eventId}-${r.sku}`}
              exportName={`chuyen-kho-${f.from}-${f.to}`}
              columns={[
                { key: 'outDate', header: 'Ngày xuất', type: 'date' },
                { key: 'docNo', header: 'Số phiếu', type: 'code' },
                { key: 'fromBranch', header: 'Từ chi nhánh', type: 'code' },
                { key: 'toBranch', header: 'Đến chi nhánh', type: 'code' },
                { key: 'sku', header: 'Mã hàng', type: 'code' },
                { key: 'name', header: 'Tên hàng' },
                { key: 'unit', header: 'ĐVT' },
                { key: 'outQty', header: 'SL xuất', type: 'qty', sum: true },
                { key: 'outValue', header: 'Giá trị xuất', type: 'money', sum: true },
                { key: 'inQty', header: 'SL đã nhận', type: 'qty', sum: true },
                { key: 'pendingQty', header: 'SL trên đường', type: 'qty', sum: true },
                { key: 'inDate', header: 'Ngày nhận', type: 'date' },
                { key: 'status', header: 'Trạng thái', value: (r) => STATUS[r.status] ?? r.status, render: (r) => <span className={r.status === 'received' ? '' : 'text-bad'}>{STATUS[r.status]}</span> },
              ] satisfies Column<TransferRow>[]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ KQ01 kết quả kinh doanh theo cửa hàng */
interface PnlRow { key: string; name: string; revenue: number; deductions: number; netRevenue: number; cogs: number; gross: number; margin: number | null; finIncome: number; finExpense: number; selling: number; admin: number; operating: number; otherIncome: number; otherExpense: number; other: number; profit: number }

export function ProfitByDepartmentPage() {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), by: 'department', branchCodes: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['profit-by-department', f], queryFn: () => api.get<{ rows: PnlRow[]; totals: PnlRow }>('/api/v1/reports/profit-by-department', f) });
  const d = q.data;
  const m = (key: keyof PnlRow, header: string, extra: Partial<Column<PnlRow>> = {}): Column<PnlRow> => ({ key, header, type: 'money', sum: true, ...extra });
  return (
    <>
      <PageHeader title="Kết quả kinh doanh theo cửa hàng" code="KQ01" subtitle="Doanh thu, giá vốn, lãi gộp, chi phí và lợi nhuận của từng cửa hàng (bộ phận) hoặc chi nhánh, lấy từ sổ cái" helpKey="ket-qua-theo-cua-hang" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen="KQ01" templates={PNL_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows, totals: d.totals }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <div className="field"><label>Xem theo</label><select className="select input" value={f.by} onChange={(e) => set({ by: e.target.value })}><option value="department">Bộ phận (cửa hàng, HO, phòng ban)</option><option value="branch">Chi nhánh</option></select></div>
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
          </>
        }
      >
        {d && (
          <div className="kpis">
            <div className="card kpi"><div className="label">Doanh thu thuần</div><div className="value"><Money value={d.totals.netRevenue} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Lãi gộp{d.totals.margin !== null ? ` (${d.totals.margin}%)` : ''}</div><div className="value"><Money value={d.totals.gross} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Lợi nhuận trước thuế</div><div className={`value ${d.totals.profit < 0 ? 'text-bad' : ''}`}><Money value={d.totals.profit} blankZero={false} /></div></div>
          </div>
        )}
        <div className="card">
          <div className="card-body muted" style={{ paddingTop: 0 }}>
            Số lấy từ sổ cái, không tính bút toán kết chuyển. Theo bộ phận: dòng sổ chưa gắn bộ phận gom vào "(chưa gắn bộ phận)" — gắn bộ phận cho chi nhánh ở danh mục Chi nhánh để bút toán bán hàng mang bộ phận của cửa hàng.
          </div>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d?.rows.length ? <Empty text="Không có phát sinh doanh thu, chi phí trong khoảng này" /> : (
            <DataGrid
              storageKey={`kq01-${f.by}`}
              rows={d.rows}
              rowKey={(r) => r.key || '-'}
              exportName={`ket-qua-theo-${f.by}-${f.from}-${f.to}`}
              columns={[
                { key: 'key', header: f.by === 'department' ? 'Mã bộ phận' : 'Mã chi nhánh', type: 'code' },
                { key: 'name', header: 'Tên' },
                m('revenue', 'Doanh thu (511)', { hidden: true }),
                m('deductions', 'Giảm trừ (521)', { hidden: true }),
                m('netRevenue', 'Doanh thu thuần'),
                m('cogs', 'Giá vốn (632)'),
                m('gross', 'Lãi gộp', { bold: true }),
                { key: 'margin', header: '% lãi gộp', type: 'number', value: (r) => r.margin ?? null, render: (r) => (r.margin === null ? '' : `${r.margin}%`) },
                m('finIncome', 'DT tài chính (515)', { hidden: true }),
                m('finExpense', 'CP tài chính (635)', { hidden: true }),
                m('selling', 'CP bán hàng (641)'),
                m('admin', 'CP quản lý (642)'),
                m('operating', 'Lợi nhuận thuần HĐKD'),
                m('other', 'Lợi nhuận khác (711 − 811)', { hidden: true }),
                m('profit', 'Lợi nhuận trước thuế', { bold: true, render: (r) => <span className={r.profit < 0 ? 'text-bad' : ''}><Money value={r.profit} blankZero={false} /></span> }),
              ] satisfies Column<PnlRow>[]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}
