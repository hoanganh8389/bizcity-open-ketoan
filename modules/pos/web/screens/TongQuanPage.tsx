/** BH16 Tổng quan bán lẻ (NT-BH-008 §5 dòng 7): doanh thu, trả, thuần của nhiều cửa hàng; theo chi nhánh, hình thức, giờ, mặt hàng bán chạy. */
import { useState } from 'react';
import { DataGrid, ErrorBox, KpiCards, Loading, PageHeader, errorText, useApi, useQuery, type GridColumn } from '@bizcity/ui-kit';
import { M, RangeLayout, usePage, useRange } from '../lib';

type Dash = {
  orderCount: number; total: number; taxTotal: number; returnCount: number; returnTotal: number; net: number;
  byBranch: { code: string; name: string; orders: number; total: number; returnTotal: number; net: number }[];
  byPayment: { method: string; name: string; amount: number }[];
  bySaleSource: { code: string; name: string; orders: number; total: number }[];
  byHour: { hour: number; orders: number; total: number }[];
  topProducts: { sku: string; name: string; qty: number; total: number }[];
};

const branchCols: GridColumn<Dash['byBranch'][number]>[] = [
  { key: 'code', header: 'Chi nhánh', type: 'code', width: 90 }, { key: 'name', header: 'Tên', width: 200 },
  { key: 'orders', header: 'Số đơn', type: 'number', sum: true, width: 80 }, { key: 'total', header: 'Doanh thu', type: 'money', sum: true, width: 120 },
  { key: 'returnTotal', header: 'Trả hàng', type: 'money', sum: true, width: 110 }, { key: 'net', header: 'Thuần', type: 'money', sum: true, width: 120 },
];
const payCols: GridColumn<Dash['byPayment'][number]>[] = [{ key: 'name', header: 'Hình thức', width: 180 }, { key: 'amount', header: 'Số tiền', type: 'money', sum: true, width: 130 }];
const hourCols: GridColumn<Dash['byHour'][number]>[] = [
  { key: 'hour', header: 'Giờ', width: 70, value: (h) => `${String(h.hour).padStart(2, '0')}:00` },
  { key: 'orders', header: 'Số đơn', type: 'number', sum: true, width: 80 }, { key: 'total', header: 'Doanh thu', type: 'money', sum: true, width: 120 },
];
const topCols: GridColumn<Dash['topProducts'][number]>[] = [
  { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 }, { key: 'name', header: 'Tên hàng', width: 240 },
  { key: 'qty', header: 'SL (ĐVT nhỏ nhất)', type: 'qty', sum: true, width: 110 }, { key: 'total', header: 'Doanh thu', type: 'money', sum: true, width: 120 },
];

export function TongQuanPage() {
  const r = useRange();
  const q = usePage<Dash>('dashboard', '/admin/dashboard', r.applied);
  const d = q.data?.data;
  return (
    <div>
      <PageHeader title="Tổng quan bán lẻ" code="BH16" subtitle="Doanh thu bán tại quầy của các cửa hàng theo kỳ: thuần sau trả hàng, theo chi nhánh, hình thức, giờ, mặt hàng." />
      <RangeLayout r={r} id="pos-tong-quan">
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : d && (
          <>
            <KpiCards items={[
              { key: 'n', label: 'Số đơn', value: d.orderCount }, { key: 't', label: 'Doanh thu', value: d.total, tone: 'info' },
              { key: 'r', label: `Trả hàng (${d.returnCount} phiếu)`, value: d.returnTotal, tone: 'warn' }, { key: 'net', label: 'Thuần', value: d.net, tone: 'ok' },
            ]} />
            <h3 style={{ margin: '10px 0 4px' }}>Theo chi nhánh</h3>
            <DataGrid rows={d.byBranch} columns={branchCols} rowKey={(x) => x.code} storageKey="pos.tq.cn" exportName="tong-quan-ban-le-chi-nhanh" emptyText="Không có đơn trong kỳ" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginTop: 10 }}>
              <div><h3 style={{ margin: '0 0 4px' }}>Theo hình thức thanh toán</h3><DataGrid rows={d.byPayment} columns={payCols} rowKey={(x) => x.method} storageKey="pos.tq.ht" /></div>
              <div><h3 style={{ margin: '0 0 4px' }}>Theo giờ</h3><DataGrid rows={d.byHour} columns={hourCols} rowKey={(x) => String(x.hour)} storageKey="pos.tq.gio" /></div>
            </div>
            <h3 style={{ margin: '10px 0 4px' }}>Mặt hàng bán chạy</h3>
            <DataGrid rows={d.topProducts} columns={topCols} rowKey={(x) => x.sku} storageKey="pos.tq.mh" exportName="mat-hang-ban-chay" />
          </>
        )}
      </RangeLayout>
      <SoBillThieu />
    </div>
  );
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027: báo cáo "Số bill bị thiếu" theo cửa hàng × ngày (đóng góp)
type Missing = { branch: string; date: string; total: number; ranges: { kind: 'sale' | 'return'; from: string; to: string; count: number; reason: string }[] };
const missCols: GridColumn<Missing['ranges'][number]>[] = [
  { key: 'kind', header: 'Loại', width: 90, value: (x) => (x.kind === 'sale' ? 'Phiếu bán' : 'Phiếu hoàn') },
  { key: 'from', header: 'Từ số', type: 'code', width: 130 }, { key: 'to', header: 'Đến số', type: 'code', width: 130 },
  { key: 'count', header: 'Số lượng', type: 'number', sum: true, width: 80 }, { key: 'reason', header: 'Lý do', width: 320 },
];

/** Số máy bán đã xin trước (dải số dùng khi mất mạng) mà không đơn / phiếu hoàn nào dùng — chấp nhận hở số, có lý do (NT-BH-027 Q2). */
export function SoBillThieu() {
  const api = useApi();
  const [branch, setBranch] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
  const q = useQuery({
    queryKey: ['pos-admin', 'missing-codes', branch, date], enabled: Boolean(branch && date),
    queryFn: () => api.get<Missing>(`${M}/reports/missing-codes?branch=${encodeURIComponent(branch)}&date=${date}`),
  });
  return (
    <section className="card card-body" style={{ marginTop: 14, display: 'grid', gap: 8 }}>
      <div><b>Số bill bị thiếu</b><div className="muted">Số máy bán đã xin trước (dùng khi mất mạng) mà chưa đơn / phiếu hoàn nào dùng, theo cửa hàng × ngày. Đơn huỷ giữ số, không tính là thiếu.</div></div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <label className="row" style={{ gap: 4 }}>Cửa hàng <input className="input" style={{ width: 110 }} value={branch} placeholder="08022" onChange={(e) => setBranch(e.target.value.trim())} /></label>
        <label className="row" style={{ gap: 4 }}>Ngày <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      {!branch ? <span className="muted">Nhập mã cửa hàng để xem.</span> : q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : q.data && (
        <DataGrid rows={q.data.ranges} columns={missCols} rowKey={(x) => `${x.kind}-${x.from}`} storageKey="pos.tq.thieu" exportName="so-bill-bi-thieu" emptyText="Không thiếu số nào" />
      )}
    </section>
  );
}
