/** BH14 Phiếu trả hàng máy POS (NT-BH-008 §5 dòng 5): phiếu trả nối đơn gốc, hình thức hoàn, lý do, người duyệt quá hạn; dưới: dòng trả. */
import { useState } from 'react';
import { DataGrid, ErrorBox, KpiCards, Loading, PageHeader, errorText, type GridColumn } from '@bizcity/ui-kit';
import { Badge, DOC_STATUS, RangeLayout, SideInput, time, usePage, useRange } from '../lib';

type Line = { lineId: string; sku: string; name?: string; qty?: number; unitQty?: number; refund?: number; refundTotal?: number };
type Row = {
  id: string; code: string; orderCode: string; branchCode: string; createdAt: string; refundMethodName: string; refundTotal: number; refundNet: number;
  refundTax: number; reason: string; approvedBy: string; approvalNote: string; exchange: boolean; docStatus: string; cashier: string; lines: Line[];
};

const cols: GridColumn<Row>[] = [
  { key: 'code', header: 'Mã phiếu trả', type: 'code', width: 130 },
  { key: 'createdAt', header: 'Ngày giờ', width: 110, value: (r) => r.createdAt, render: (r) => time(r.createdAt) },
  { key: 'orderCode', header: 'Đơn gốc', type: 'code', width: 130 },
  { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 90 },
  { key: 'cashier', header: 'Thu ngân', width: 120 },
  { key: 'kind', header: 'Loại', width: 90, value: (r) => (r.exchange ? 'Đổi hàng' : 'Trả hàng') },
  { key: 'refundMethodName', header: 'Hoàn bằng', width: 110 },
  { key: 'refundTotal', header: 'Tiền hoàn', type: 'money', sum: true, width: 120 },
  { key: 'refundTax', header: 'Thuế giảm', type: 'money', sum: true, width: 100, hidden: true },
  { key: 'reason', header: 'Lý do', width: 200 },
  { key: 'approvedBy', header: 'Người duyệt (quá hạn)', width: 150, value: (r) => (r.approvedBy ? `${r.approvedBy}${r.approvalNote ? ` — ${r.approvalNote}` : ''}` : '') },
  { key: 'docStatus', header: 'Chứng từ sổ', width: 110, value: (r) => DOC_STATUS[r.docStatus]?.label ?? r.docStatus, render: (r) => <Badge map={DOC_STATUS} value={r.docStatus} /> },
];

const lineCols: GridColumn<Line>[] = [
  { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 },
  { key: 'name', header: 'Tên hàng', width: 260 },
  { key: 'qty', header: 'SL trả', type: 'qty', width: 70, value: (l) => l.qty ?? l.unitQty ?? 0 },
  { key: 'refund', header: 'Tiền hoàn', type: 'money', sum: true, width: 110, value: (l) => l.refund ?? l.refundTotal ?? 0 },
];

export function TraHangPage() {
  const r = useRange({ q: '' });
  const [pick, setPick] = useState<Row | null>(null);
  const q = usePage<Row[]>('returns', '/admin/returns', { ...r.applied, pageSize: 500 });
  const sums = q.data?.meta?.sums ?? {};
  return (
    <div>
      <PageHeader title="Phiếu trả hàng máy POS" code="BH14" subtitle="Phiếu trả / đổi hàng tại quầy, nối về đơn gốc. Phiếu lập ở máy bán, màn này chỉ xem." />
      <RangeLayout r={r} id="pos-tra-hang" more={<SideInput label="Mã phiếu / đơn gốc" value={r.draft.q ?? ''} onChange={(v) => r.setDraft({ ...r.draft, q: v })} placeholder="TH…, HD…" />}>
        <KpiCards items={[{ key: 'n', label: 'Số phiếu trả', value: sums.returns }, { key: 't', label: 'Tiền hoàn', value: sums.refundTotal, tone: 'warn' }]} />
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
          <>
            <DataGrid rows={q.data?.data ?? []} columns={cols} rowKey={(x) => x.id} storageKey="pos.tra-hang" onRowClick={setPick}
              rowClassName={(x) => (x.id === pick?.id ? 'selected' : '')} emptyText="Không có phiếu trả trong kỳ" maxHeight="46vh"
              exportName="phieu-tra-may-pos" exportTitle="Phiếu trả hàng máy POS" />
            <div className="card" style={{ marginTop: 8, padding: 8 }}>
              <b>Chi tiết · {pick ? `${pick.code} ← ${pick.orderCode}` : 'bấm một phiếu ở trên'}</b>
              {pick && <DataGrid rows={pick.lines} columns={lineCols} rowKey={(l) => l.lineId} storageKey="pos.tra-hang.dong" maxHeight="28vh" />}
            </div>
          </>
        )}
      </RangeLayout>
    </div>
  );
}
