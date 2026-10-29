/**
 * Báo cáo kho của mua hàng (dữ liệu: /api/v1/purchase/stock-ledger, /stock-on-hand — xem api bao-cao-kho.ts):
 *   MH24 Sổ kho theo mặt hàng   tồn đầu → nhập · nhập lại · nhập nội bộ · xuất nội bộ · xuất bán · xuất trả · xuất điều chỉnh ·
 *                               SL điều chỉnh ± · khác → tồn cuối, mỗi luồng một màu (cả cột + dòng tổng).
 *   MH25 Tồn kho theo mặt hàng  kho · mã · tên · alias · số lượng · đơn giá · thành tiền · SL đi đường · tồn max · tồn min ·
 *                               SL cần nhập (= tồn max − số lượng, âm = đang dư) · ĐVT.
 * Bộ lọc trái: chi nhánh → mã kho (BranchSelect). Cả hai màn CHỈ chạy khi bấm Tìm kiếm (443 chi nhánh × cả lịch sử kho là truy vấn
 * nặng — không tự chạy lúc mở màn); ngày / mã hàng cũng là bản nháp, áp khi bấm. Lúc chạy hiện thanh tiến độ + Huỷ (TienDoTai).
 */
import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect } from '@/components/filters';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox } from '@/components/ui';
import { TienDoTai } from '@/components/TienDoTai';
import { P, today } from '../du-lieu';
import '../mua-hang.css';

interface LedgerRow { sku: string; name: string; unit: string; openQty: number; inQty: number; inReturnQty: number; inTransferQty: number; outTransferQty: number; saleQty: number; returnQty: number; outAdjustQty: number; adjustQty: number; otherQty: number; closeQty: number }
interface OnHandRow { branchCode: string; warehouseCode: string; sku: string; name: string; alias: string; unit: string; qty: number; unitCost: number | null; amount: number | null; uncosted: number; inTransit: number; max: number | null; min: number | null; need: number | null }

const monthStart = () => `${today().slice(0, 7)}-01`;
const qtyCol = (key: keyof LedgerRow & string, header: string, cls: string, title?: string): Column<LedgerRow> => ({ key, header, type: 'qty', width: 110, sum: true, className: cls, title });

export function SoKhoTheoMatHangPage() {
  const [f, setF] = useState({ from: monthStart(), to: today(), branchCodes: '', warehouseCodes: '', search: '' });
  const [d, setD] = useState({ from: f.from, to: f.to, search: '' });
  const [ran, setRan] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mua-hang', 'stock-ledger', f], enabled: ran, placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.get<{ rows: LedgerRow[] }>(`${P}/stock-ledger`, f, signal) });
  const columns: Column<LedgerRow>[] = [
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 },
    { key: 'name', header: 'Tên hàng', width: 260 },
    qtyCol('openQty', 'Σ tồn đầu', 'kb-open', 'Tồn trước ngày đầu kỳ'),
    qtyCol('inQty', 'Σ nhập', 'kb-in', 'Nhập mua'),
    qtyCol('inReturnQty', 'Σ nhập lại', 'kb-inret', 'Khách hoàn trả lại cửa hàng — tồn TĂNG'),
    qtyCol('inTransferQty', 'Σ nhập nội bộ', 'kb-inb', 'Chiều NHẬN của phiếu chuyển kho'),
    qtyCol('outTransferQty', 'Σ xuất nội bộ', 'kb-outb', 'Chiều XUẤT của phiếu chuyển kho'),
    qtyCol('saleQty', 'Σ xuất bán', 'kb-sell', 'Xuất bán (không gồm phiếu xuất điều chỉnh)'),
    qtyCol('returnQty', 'Σ xuất trả', 'kb-ret', 'Trả hàng về nhà cung cấp — tồn GIẢM'),
    qtyCol('outAdjustQty', 'Σ xuất điều chỉnh', 'kb-adj', 'Phiếu xuất điều chỉnh của cửa hàng (luôn dương, bản chất là trừ kho)'),
    qtyCol('adjustQty', 'SL điều chỉnh (±)', 'kb-adj', 'Điều chỉnh cân tồn / kiểm kê, giữ dấu: dương là tăng kho, âm là giảm'),
    qtyCol('otherQty', 'Khác', 'kb-other', 'Phát sinh ngoài các luồng trên (vd nhận / xuất quà ở mua hàng) — luôn cộng vào để sổ cân'),
    qtyCol('closeQty', 'Σ tồn cuối', 'kb-close', '= tồn đầu + nhập + nhập lại + nhập nội bộ − xuất nội bộ − xuất bán − xuất trả − xuất điều chỉnh + SL điều chỉnh + khác'),
    { key: 'unit', header: 'ĐVT', width: 70, className: 'kb-unit', title: 'ĐVT nhỏ nhất (tỉ lệ 1)' },
  ];
  return (
    <>
      <PageHeader title="Sổ kho theo mặt hàng" code="MH24" helpKey="mua-hang-bao-cao-kho" subtitle="Mỗi mặt hàng: tồn đầu, nhập, nhập lại, nhập / xuất nội bộ, xuất bán, xuất trả, xuất điều chỉnh, SL điều chỉnh ±, khác, tồn cuối — theo chi nhánh / mã kho đã chọn" />
      <FilterLayout filters={<form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ from: d.from, to: d.to, search: d.search.trim() }); setRan(true); }}>
        <div className="field"><label>Từ ngày</label><input className="input" type="date" value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })} /></div>
        <div className="field"><label>Đến ngày</label><input className="input" type="date" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} /></div>
        <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} warehouses={{ value: f.warehouseCodes, onChange: (warehouseCodes) => set({ warehouseCodes }) }} />
        <div className="field"><label>Mã / tên hàng</label><input className="input" value={d.search} onChange={(e) => setD({ ...d, search: e.target.value })} /></div>
      </form>}>
        <div className="card">
          <TienDoTai chuaTim={!ran} dangTai={q.isFetching} soDong={q.data?.rows.length} onHuy={() => void qc.cancelQueries({ queryKey: ['mua-hang', 'stock-ledger'] })} />
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {ran && q.data && (
            <DataGrid storageKey="mh24-so-kho" exportName={`so-kho-theo-mat-hang-${f.from}-${f.to}`} exportTitle="Sổ kho theo mặt hàng" rows={q.data?.rows ?? []} rowKey={(r) => r.sku} columns={columns}
              footerLabel="Tổng cộng" emptyText="Không có mặt hàng phát sinh trong kỳ / chi nhánh / kho đã chọn" />
          )}
        </div>
      </FilterLayout>
    </>
  );
}

export function TonKhoTheoMatHangPage() {
  const [f, setF] = useState({ to: today(), branchCodes: '', warehouseCodes: '', search: '' });
  const [d, setD] = useState({ to: f.to, search: '' });
  const [ran, setRan] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mua-hang', 'stock-on-hand', f], enabled: ran, placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.get<{ rows: OnHandRow[] }>(`${P}/stock-on-hand`, f, signal) });
  const uncosted = (q.data?.rows ?? []).reduce((s, r) => s + r.uncosted, 0);
  const columns: Column<OnHandRow>[] = [
    { key: 'warehouseCode', header: 'Kho', type: 'code', width: 100, value: (r) => r.warehouseCode || 'mặc định', title: 'Mã kho đang giữ tồn (dòng không ghi kho tính vào kho mặc định của chi nhánh)' },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 100 },
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 },
    { key: 'name', header: 'Tên hàng', width: 240 },
    { key: 'alias', header: 'Alias', type: 'code', width: 120, title: 'Mã vạch của mặt hàng' },
    { key: 'qty', header: 'Số lượng', type: 'qty', width: 100, sum: true, className: 'kb-qty', title: 'Tồn tại ngày "Đến ngày" (ĐVT nhỏ nhất)' },
    { key: 'unitCost', header: 'Đơn giá', type: 'money', width: 100, title: 'Thành tiền ÷ số lượng (giá vốn bình quân / giá trị chứng từ)' },
    { key: 'amount', header: 'Thành tiền', type: 'money', width: 130, sum: true },
    { key: 'inTransit', header: 'SL đi đường', type: 'qty', width: 100, sum: true, title: 'Đã xuất chuyển đến chi nhánh này nhưng chưa nhận — tính vào kho mặc định của chi nhánh nhận' },
    { key: 'max', header: 'Tồn max', type: 'qty', width: 90, sum: true, title: 'Tồn max khai theo kho (MH16)' },
    { key: 'min', header: 'Tồn min', type: 'qty', width: 90, sum: true },
    { key: 'need', header: 'SL cần nhập', type: 'qty', width: 110, sum: true, className: 'kb-need', title: '= Tồn max − số lượng. Âm (đỏ) = đang dư so với tồn max; trống = chưa khai tồn max',
      render: (r) => (r.need === null ? '' : <span style={r.need < 0 ? { color: '#dc2626' } : undefined}>{r.need.toLocaleString('vi-VN', { maximumFractionDigits: 4 })}</span>) },
    { key: 'unit', header: 'ĐVT', width: 70, className: 'kb-unit' },
  ];
  return (
    <>
      <PageHeader title="Tồn kho theo mặt hàng" code="MH25" helpKey="mua-hang-bao-cao-kho" subtitle="Tồn theo từng kho: số lượng, đơn giá, thành tiền, hàng đi đường, tồn max / min theo kho, SL cần nhập" />
      <FilterLayout filters={<form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ to: d.to, search: d.search.trim() }); setRan(true); }}>
        <div className="field"><label>Đến ngày</label><input className="input" type="date" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} /></div>
        <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} warehouses={{ value: f.warehouseCodes, onChange: (warehouseCodes) => set({ warehouseCodes }) }} />
        <div className="field"><label>Mã / tên hàng</label><input className="input" value={d.search} onChange={(e) => setD({ ...d, search: e.target.value })} /></div>
      </form>}>
        <div className="card">
          <TienDoTai chuaTim={!ran} dangTai={q.isFetching} soDong={q.data?.rows.length} onHuy={() => void qc.cancelQueries({ queryKey: ['mua-hang', 'stock-on-hand'] })} />
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {uncosted > 0 && <div className="card-body muted">Có {uncosted} lần nhập / xuất chưa có giá trị (tháng chưa tính giá vốn): đơn giá, thành tiền chưa đầy đủ.</div>}
          {ran && q.data && (
            <DataGrid storageKey="mh25-ton-kho" exportName={`ton-kho-theo-mat-hang-${f.to}`} exportTitle="Tồn kho theo mặt hàng" rows={q.data?.rows ?? []} rowKey={(r) => `${r.branchCode}|${r.warehouseCode}|${r.sku}`} columns={columns}
              footerLabel="Tổng cộng" emptyText="Không có tồn ở chi nhánh / kho đã chọn" />
          )}
        </div>
      </FilterLayout>
    </>
  );
}
