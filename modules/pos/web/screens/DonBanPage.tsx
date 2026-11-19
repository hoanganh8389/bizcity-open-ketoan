/**
 * BH13 Đơn bán máy POS (NT-BH-008 §5 dòng 1–4): đơn của nhiều chi nhánh theo kỳ, danh sách trên – dưới (bấm một lần: dòng hàng ở
 * nửa dưới), thẻ chỉ số của cả kết quả lọc. Chỉ xem — đơn lập ở máy bán.
 */
import { useState } from 'react';
import { DataGrid, ErrorBox, KpiCards, Loading, PageHeader, errorText, useApi, useQuery, type GridColumn } from '@bizcity/ui-kit';
import { Badge, DOC_STATUS, M, ORDER_STATUS, RangeLayout, SideInput, time, usePage, useRange, vnd } from '../lib';

type Line = { lineId: string; sku: string; name: string; unitName: string; unitQty: number; unitPrice: number; amount: number; taxAmount: number; taxRate: number | null };
type Row = {
  id: string; code: string; branchCode: string; businessDate: string; createdAt: string; status: string; total: number; taxTotal: number;
  docKey: string; docStatus: string; cashier: string; shiftId: string; customerName: string; customerPhone: string; saleSource: string; saleSourceName: string;
  payments: { method: string; name: string; amount: number }[]; lines: Line[];
  stockShortOffline: { sku: string; need: number; have: number }[];
  priceChangedOffline: { sku: string; unit: string; price: number | null; clientPrice: number }[];
};

const cols: GridColumn<Row>[] = [
  { key: 'code', header: 'Mã phiếu', type: 'code', width: 130 },
  { key: 'createdAt', header: 'Ngày giờ', width: 110, value: (r) => r.createdAt, render: (r) => time(r.createdAt) },
  { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 90 },
  { key: 'cashier', header: 'Thu ngân', width: 130 },
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: kênh bán của đơn (tên lúc bán) (đóng góp)
  { key: 'saleSourceName', header: 'Kênh', width: 120 },
  { key: 'customerName', header: 'Khách', width: 160, render: (r) => (r.customerPhone ? `${r.customerName} · ${r.customerPhone}` : r.customerName) },
  { key: 'payments', header: 'Hình thức', width: 170, value: (r) => r.payments.map((p) => p.name).join(', '), render: (r) => r.payments.map((p) => `${p.name} ${vnd(p.amount)}`).join(' · ') },
  { key: 'total', header: 'Tổng tiền', type: 'money', sum: true, width: 120 },
  { key: 'taxTotal', header: 'Tiền thuế', type: 'money', sum: true, width: 100, hidden: true },
  { key: 'status', header: 'Trạng thái', width: 110, value: (r) => ORDER_STATUS[r.status]?.label ?? r.status, render: (r) => <Badge map={ORDER_STATUS} value={r.status} /> },
  { key: 'docStatus', header: 'Chứng từ sổ', width: 110, value: (r) => DOC_STATUS[r.docStatus]?.label ?? r.docStatus, render: (r) => <Badge map={DOC_STATUS} value={r.docStatus} /> },
  { key: 'docKey', header: 'Mã chứng từ', type: 'code', width: 200, hidden: true },
  // [2026-11-16 06:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-021: đơn bán dự phòng lúc mất mạng gửi bù mà thiếu tồn (đóng góp)
  { key: 'stockShortOffline', header: 'Lệch khi mất mạng (tồn / giá)', width: 190, value: (r) => r.stockShortOffline.length + r.priceChangedOffline.length,
    render: (r) => [...r.stockShortOffline.map((s) => `${s.sku}: cần ${s.need}, tồn ${s.have}`),
      // [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-022: đơn mất mạng bán giá cũ / chưa có giá (đóng góp)
      ...r.priceChangedOffline.map((p) => `${p.sku} (${p.unit}): bán ${p.clientPrice.toLocaleString('vi-VN')}, bảng giá ${p.price === null ? 'chưa có' : p.price.toLocaleString('vi-VN')}`)].join('; ') },
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
  const r = useRange({ q: '', cashier: '', stockShort: '0', saleSource: '' });
  const api = useApi();
  const channels = useQuery({ queryKey: ['pos-kenh-ban'], queryFn: () => api.get<{ items: { code: string; name: string; active: boolean }[] }>(`${M}/channels`) });
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
          <label className="rp-field">
            <span>Kênh bán</span>
            <select className="input" value={r.draft.saleSource ?? ''} onChange={(e) => r.setDraft({ ...r.draft, saleSource: e.target.value })}>
              <option value="">Tất cả</option>
              {(channels.data?.items ?? []).map((c) => <option key={c.code} value={c.code}>{c.active ? c.name : `${c.name} (ngừng)`}</option>)}
            </select>
          </label>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={r.draft.stockShort === '1'} onChange={(e) => r.setDraft({ ...r.draft, stockShort: e.target.checked ? '1' : '0' })} />
            Chỉ đơn mất mạng bị lệch (tồn / giá)
          </label>
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
