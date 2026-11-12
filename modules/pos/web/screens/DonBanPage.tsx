/**
 * BH13 Đơn bán máy POS (NT-BH-008 §5 dòng 1–4): đơn của nhiều chi nhánh theo kỳ, danh sách trên – dưới (bấm một lần: dòng hàng ở
 * nửa dưới), thẻ chỉ số của cả kết quả lọc. Chỉ xem — đơn lập ở máy bán.
 */
import { useState } from 'react';
import { DataGrid, ErrorBox, KpiCards, Loading, PageHeader, errorText, type GridColumn } from '@bizcity/ui-kit';
import { Badge, DOC_STATUS, ORDER_STATUS, RangeLayout, SideInput, time, usePage, useRange, vnd } from '../lib';

type Line = { lineId: string; sku: string; name: string; unitName: string; unitQty: number; unitPrice: number; amount: number; taxAmount: number; taxRate: number | null };
type Row = {
  id: string; code: string; branchCode: string; businessDate: string; createdAt: string; status: string; total: number; taxTotal: number;
  docKey: string; docStatus: string; cashier: string; shiftId: string; customerName: string; customerPhone: string;
  payments: { method: string; name: string; amount: number }[]; lines: Line[];
};

const cols: GridColumn<Row>[] = [
  { key: 'code', header: 'Mã phiếu', type: 'code', width: 130 },
  { key: 'createdAt', header: 'Ngày giờ', width: 110, value: (r) => r.createdAt, render: (r) => time(r.createdAt) },
  { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 90 },
  { key: 'cashier', header: 'Thu ngân', width: 130 },
  { key: 'customerName', header: 'Khách', width: 160, render: (r) => (r.customerPhone ? `${r.customerName} · ${r.customerPhone}` : r.customerName) },
  { key: 'payments', header: 'Hình thức', width: 170, value: (r) => r.payments.map((p) => p.name).join(', '), render: (r) => r.payments.map((p) => `${p.name} ${vnd(p.amount)}`).join(' · ') },
  { key: 'total', header: 'Tổng tiền', type: 'money', sum: true, width: 120 },
  { key: 'taxTotal', header: 'Tiền thuế', type: 'money', sum: true, width: 100, hidden: true },
  { key: 'status', header: 'Trạng thái', width: 110, value: (r) => ORDER_STATUS[r.status]?.label ?? r.status, render: (r) => <Badge map={ORDER_STATUS} value={r.status} /> },
  { key: 'docStatus', header: 'Chứng từ sổ', width: 110, value: (r) => DOC_STATUS[r.docStatus]?.label ?? r.docStatus, render: (r) => <Badge map={DOC_STATUS} value={r.docStatus} /> },
  { key: 'docKey', header: 'Mã chứng từ', type: 'code', width: 200, hidden: true },
];

const lineCols: GridColumn<Line>[] = [
  { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 },
  { key: 'name', header: 'Tên hàng', width: 260 },
  { key: 'unitName', header: 'ĐVT', width: 70 },
  { key: 'unitQty', header: 'SL', type: 'qty', width: 60 },
  { key: 'unitPrice', header: 'Đơn giá', type: 'price', width: 100 },
  { key: 'gross', header: 'Thành tiền', type: 'money', sum: true, width: 110, value: (l) => l.amount + l.taxAmount },
  { key: 'taxRate', header: 'Thuế %', type: 'number', width: 60 },
  { key: 'taxAmount', header: 'Tiền thuế', type: 'money', sum: true, width: 100 },
];

export function DonBanPage() {
  const r = useRange({ q: '', cashier: '' });
  const [pick, setPick] = useState<Row | null>(null);
  const q = usePage<Row[]>('orders', '/admin/orders', { ...r.applied, pageSize: 500 });
  const sums = q.data?.meta?.sums ?? {};
  return (
    <div>
      <PageHeader title="Đơn bán máy POS" code="BH13" subtitle="Đơn bán tại quầy của mọi cửa hàng — đối chiếu với chứng từ đã vào sổ. Đơn lập ở máy bán, màn này chỉ xem." />
      <RangeLayout r={r} id="pos-don-ban" more={(
        <>
          <SideInput label="Mã phiếu / khách" value={r.draft.q ?? ''} onChange={(v) => r.setDraft({ ...r.draft, q: v })} placeholder="HD…, SĐT, tên khách" />
          <SideInput label="Thu ngân" value={r.draft.cashier ?? ''} onChange={(v) => r.setDraft({ ...r.draft, cashier: v })} />
        </>
      )}>
        <KpiCards items={[
          { key: 'n', label: 'Số đơn', value: sums.orders },
          { key: 't', label: 'Doanh thu', value: sums.total, tone: 'info' },
          { key: 'r', label: 'Đã hoàn', value: sums.returned, tone: 'warn' },
          { key: 'net', label: 'Thuần', value: sums.net, tone: 'ok' },
        ]} />
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
          <>
            <DataGrid rows={q.data?.data ?? []} columns={cols} rowKey={(x) => x.id} storageKey="pos.don-ban" onRowClick={setPick}
              rowClassName={(x) => (x.id === pick?.id ? 'selected' : '')} emptyText="Không có đơn trong kỳ" maxHeight="46vh"
              exportName="don-ban-may-pos" exportTitle="Đơn bán máy POS" />
            <div className="card" style={{ marginTop: 8, padding: 8 }}>
              <b>Chi tiết · {pick ? `${pick.code} · ${pick.branchCode} · ca ${pick.shiftId || '—'}` : 'bấm một đơn ở trên'}</b>
              {pick && <DataGrid rows={pick.lines} columns={lineCols} rowKey={(l) => l.lineId} storageKey="pos.don-ban.dong" maxHeight="28vh" exportName={`don-${pick.code}`} />}
            </div>
          </>
        )}
      </RangeLayout>
    </div>
  );
}
