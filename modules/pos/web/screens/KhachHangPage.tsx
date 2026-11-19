/**
 * BH23 Báo cáo khách hàng (phiếu NT-BH-034 §2 B): mỗi khách × kỳ × cửa hàng — số đơn, tiền hàng, giảm giá, thực trả, trả hàng, voucher, điểm
 * tích / đổi, quà (số lượng, giá trị theo giá bán), cửa hàng đã mua. Bấm khách → từng lần mua (mặt hàng, đơn giá, SL, khuyến mại, voucher,
 * điểm, quà). Gồm đơn máy bán và phiếu bán BH10; lọc nhiều cửa hàng, kênh; xuất Excel. Quyền xem pos:report.
 */
// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: màn Báo cáo khách hàng (đóng góp)
import { useMemo, useState } from 'react';
import { DataGrid, ErrorBox, KpiCards, Loading, PageHeader, errorText, useApi, useQuery, type GridColumn } from '@bizcity/ui-kit';
import { M, RangeLayout, useRange, vnd } from '../lib';

type Row = {
  customerCode: string; customerName: string; phone: string; branchCode: string; period: string; orders: number; posOrders: number; phieuBanDocs: number;
  goods: number; discount: number; net: number; returns: number; netAfterReturns: number; voucherCount: number; voucherAmount: number;
  pointsEarned: number; pointsRedeemed: number; giftQty: number; giftValue: number; shops: string;
};
type Line = { sku: string; name: string; unit: string; qty: number; unitPrice: number; discount: number; amount: number; isGift: boolean; promo: string | null; giftValue?: number | null };
type Purchase = {
  source: 'pos' | 'phieu-ban'; kind: 'sale' | 'return'; refId: string; refCode: string; date: string; branchCode: string; channel: string;
  goods: number; discount: number; total: number; returns: number; originalCode?: string | null;
  vouchers: { code: string; campaignName: string; amount: number }[]; pointsEarned: number; pointsRedeemed: number; lines: Line[];
};
type Meta = { totals?: Record<string, number>; phieuBan?: string; voucher?: string; loyalty?: string };

const cols: GridColumn<Row>[] = [
  { key: 'customerCode', header: 'Mã khách', type: 'code', width: 110 }, { key: 'customerName', header: 'Tên khách', width: 180 },
  { key: 'phone', header: 'SĐT', width: 100 }, { key: 'branchCode', header: 'Cửa hàng', type: 'code', width: 80 }, { key: 'period', header: 'Kỳ', width: 150 },
  { key: 'orders', header: 'Số đơn', type: 'number', sum: true, width: 70 },
  { key: 'goods', header: 'Tiền hàng', type: 'money', sum: true, width: 110 }, { key: 'discount', header: 'Giảm giá', type: 'money', sum: true, width: 100 },
  { key: 'net', header: 'Thực trả', type: 'money', sum: true, width: 110 }, { key: 'returns', header: 'Trả hàng', type: 'money', sum: true, width: 100 },
  { key: 'netAfterReturns', header: 'Thực thu', type: 'money', sum: true, width: 110 },
  { key: 'voucherCount', header: 'Voucher (mã)', type: 'number', sum: true, width: 80 }, { key: 'voucherAmount', header: 'Tiền voucher', type: 'money', sum: true, width: 100 },
  { key: 'pointsEarned', header: 'Điểm tích', type: 'qty', sum: true, width: 80 }, { key: 'pointsRedeemed', header: 'Điểm đổi', type: 'qty', sum: true, width: 80 },
  { key: 'giftQty', header: 'Quà (SL)', type: 'qty', sum: true, width: 70 }, { key: 'giftValue', header: 'Giá trị quà (giá bán)', type: 'money', sum: true, width: 120 },
  { key: 'shops', header: 'Cửa hàng đã mua', width: 140 },
];

/** Từng dòng hàng của các lần mua (để xuất Excel một bảng phẳng). */
type FlatLine = Line & { key: string; refCode: string; date: string; branchCode: string; source: string; vouchers: string; points: string };
const lineCols: GridColumn<FlatLine>[] = [
  { key: 'date', header: 'Ngày', width: 90 }, { key: 'refCode', header: 'Số đơn / phiếu', type: 'code', width: 130 },
  { key: 'source', header: 'Nguồn', width: 90 }, { key: 'branchCode', header: 'Cửa hàng', type: 'code', width: 80 },
  { key: 'sku', header: 'Mã hàng', type: 'code', width: 100 }, { key: 'name', header: 'Tên hàng', width: 200 }, { key: 'unit', header: 'ĐVT', width: 60 },
  { key: 'qty', header: 'SL', type: 'qty', width: 60 }, { key: 'unitPrice', header: 'Đơn giá', type: 'money', width: 100 },
  { key: 'discount', header: 'Giảm', type: 'money', sum: true, width: 90 }, { key: 'amount', header: 'Thành tiền', type: 'money', sum: true, width: 110 },
  { key: 'promo', header: 'Khuyến mại', width: 120 }, { key: 'isGift', header: 'Quà', width: 50, value: (l) => (l.isGift ? 'Quà' : '') },
  { key: 'giftValue', header: 'Giá trị quà', type: 'money', sum: true, width: 100 },
  { key: 'vouchers', header: 'Voucher', width: 160 }, { key: 'points', header: 'Điểm tích / đổi', width: 110 },
];

function Detail({ row, range }: { row: Row; range: { from: string; to: string; branchCodes: string; channels: string } }) {
  const api = useApi();
  const q = useQuery({
    queryKey: ['pos-admin', 'customer-detail', row.customerCode, range],
    queryFn: () => api.get<Purchase[]>(`${M}/reports/customer-detail`, Object.fromEntries(Object.entries({ ...range, customer: row.customerCode }).filter(([k, v]) => v || k === 'customer'))),
  });
  const flat = useMemo<FlatLine[]>(() => (q.data ?? []).flatMap((p) => {
    const vouchers = p.vouchers.map((v) => `${v.code} (${vnd(v.amount)})`).join(', ');
    const points = p.pointsEarned || p.pointsRedeemed ? `+${p.pointsEarned} / −${p.pointsRedeemed}` : '';
    const src = p.source === 'pos' ? 'Máy bán' : 'Phiếu BH10';
    if (p.kind === 'return') {
      return [{ key: `${p.refId}-r`, refCode: p.refCode, date: p.date, branchCode: p.branchCode, source: `${src} · trả hàng${p.originalCode ? ` (${p.originalCode})` : ''}`,
        sku: '', name: 'Trả hàng', unit: '', qty: 0, unitPrice: 0, discount: 0, amount: -p.returns, isGift: false, promo: null, vouchers: '', points: '' }];
    }
    return p.lines.map((l, i) => ({ ...l, key: `${p.refId}-${i}`, refCode: p.refCode, date: p.date, branchCode: p.branchCode, source: src,
      vouchers: i === 0 ? vouchers : '', points: i === 0 ? points : '' }));
  }), [q.data]);
  return (
    <div className="card" style={{ marginTop: 8, padding: 8 }}>
      <b>Từng lần mua · {row.customerName || 'Khách lẻ'} {row.customerCode ? `(${row.customerCode})` : ''}</b>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <DataGrid rows={flat} columns={lineCols} rowKey={(l) => l.key} storageKey="pos.khach-hang.chi-tiet" maxHeight="34vh"
          exportName={`khach-${row.customerCode || 'le'}`} exportTitle={`Từng lần mua — ${row.customerName || 'Khách lẻ'} ${range.from} – ${range.to}`} emptyText="Không có lần mua" />
      )}
    </div>
  );
}

export function KhachHangPage() {
  const r = useRange({ channels: '', groupBy: 'range' });
  const api = useApi();
  const [pick, setPick] = useState<Row | null>(null);
  const a = r.applied;
  const query = { from: a.from, to: a.to, branchCodes: a.branches, channels: a.channels ?? '', groupBy: a.groupBy ?? 'range' };
  const q = useQuery({
    queryKey: ['pos-admin', 'customers', query],
    queryFn: () => api.getPage<Row[]>(`${M}/reports/customers`, Object.fromEntries(Object.entries(query).filter(([, v]) => v))) as Promise<{ data: Row[]; meta?: Meta }>,
  });
  const t = q.data?.meta?.totals;
  const meta = q.data?.meta;
  return (
    <div>
      <PageHeader title="Báo cáo khách hàng" code="BH23" subtitle="Mỗi khách × kỳ × cửa hàng: đơn, tiền, giảm giá, trả hàng, voucher, điểm, quà — gồm đơn máy bán và phiếu bán BH10. Bấm khách để xem từng lần mua." />
      <RangeLayout r={r} id="pos-khach-hang" more={(
        <>
          <label className="rp-field">
            <span>Kênh (mã, cách nhau dấu phẩy)</span>
            <input className="input" value={r.draft.channels ?? ''} placeholder="ZALO,GAN_SHOP" onChange={(e) => r.setDraft({ ...r.draft, channels: e.target.value })} />
          </label>
          <label className="rp-field">
            <span>Kỳ</span>
            <select className="input" value={r.draft.groupBy ?? 'range'} onChange={(e) => r.setDraft({ ...r.draft, groupBy: e.target.value })}>
              <option value="range">Cả khoảng ngày</option><option value="month">Theo tháng</option>
            </select>
          </label>
        </>
      )}>
        {t && (
          <KpiCards items={[
            { key: 'c', label: 'Số khách', value: t.customers ?? 0 }, { key: 'o', label: 'Số đơn', value: t.orders ?? 0 },
            { key: 'n', label: 'Thực trả', value: t.net ?? 0, tone: 'info' }, { key: 'r', label: 'Trả hàng', value: t.returns ?? 0, tone: 'warn' },
            { key: 'g', label: `Quà (${t.giftQty ?? 0})`, value: t.giftValue ?? 0 },
          ]} />
        )}
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
          <>
            <DataGrid rows={q.data?.data ?? []} columns={cols} rowKey={(x) => `${x.customerCode}|${x.branchCode}|${x.period}`} storageKey="pos.khach-hang"
              onRowClick={setPick} rowClassName={(x) => (pick && x.customerCode === pick.customerCode ? 'selected' : '')} maxHeight="44vh"
              emptyText="Không có khách mua trong kỳ" exportName="bao-cao-khach-hang" exportTitle={`Báo cáo khách hàng ${query.from} – ${query.to}`} />
            {pick && <Detail row={pick} range={query} />}
          </>
        )}
        <p className="muted">
          Tiền gồm thuế. Tiền hàng = đơn giá × số lượng của dòng hàng (không gồm quà); Giảm giá = khuyến mại + voucher TGS + giảm khác; Thực trả = tiền khách phải trả;
          trả hàng tính theo ngày trả. Voucher, điểm lấy từ module Voucher / Điểm thành viên; giá trị quà theo giá bán hiện hành của cửa hàng (giá vốn quà xem ở báo cáo kho).
          {meta?.phieuBan === 'unavailable' && <b> Chưa gồm phiếu BH10 (module Phiếu bán nhập tay chưa bật hoặc bạn chưa có quyền xem).</b>}
          {meta?.voucher === 'unavailable' && <b> Voucher theo bản chụp đơn (chưa đọc được module Voucher).</b>}
          {meta?.loyalty === 'unavailable' && <b> Điểm theo bản chụp đơn (chưa đọc được module Điểm thành viên).</b>}
        </p>
      </RangeLayout>
    </div>
  );
}
