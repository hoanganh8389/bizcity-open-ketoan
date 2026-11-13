/**
 * BH15 Sổ ca bán (NT-BH-008 §5 dòng 6): ca của mọi cửa hàng — đầu ca, tiền mặt bán / hoàn, phải có, đếm được, chênh lệch; lọc "ca có
 * chênh lệch" để kế toán xử lý (NT-BH-007 Q1). Ca vượt ngưỡng Cài đặt bán hàng tô đỏ. Dưới: theo hình thức thanh toán của ca chọn.
 * Cột Phiếu kế toán (NT-BH-014): phiếu chênh lệch két lập lúc chốt ca — trạng thái lúc chốt; lỗi thì sửa / ghi sổ lại ở ACC14.
 */
// [2026-11-13 08:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-014: cột phiếu kế toán chênh lệch két ở Sổ ca (đóng góp)
import { useState } from 'react';
import { DataGrid, ErrorBox, KpiCards, Loading, PageHeader, errorText, useApi, useCan, useMutation, type GridColumn } from '@bizcity/ui-kit';
import { M, RangeLayout, time, usePage, useRange, vnd } from '../lib';

type Row = {
  id: string; branchCode: string; status: string; openedAt: string; closedAt: string | null; cashier: string; openingCash: number; orderCount: number;
  total: number; cashSales: number; cashRefunds: number; expectedCash: number; countedCash: number | null; difference: number | null; forced: boolean;
  note: string; alert: boolean; byPayment: { method: string; name: string; amount: number }[];
  journal: { docKey: string; docNo: string; status: string; amount: number; error?: string } | null;
};

const JOURNAL: Record<string, [string, string]> = {
  posted: ['Đã ghi sổ', 'badge-ok'], pending: ['Chờ duyệt', 'badge-warn'], error: ['Lỗi — xem ACC14', 'badge-bad'], unchanged: ['Đã ghi sổ', 'badge-ok'],
  not_created: ['Chưa lập — xem lý do', 'badge-bad'],
};

const cols: GridColumn<Row>[] = [
  { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 90 },
  { key: 'openedAt', header: 'Mở ca', width: 110, value: (r) => r.openedAt, render: (r) => time(r.openedAt) },
  { key: 'closedAt', header: 'Chốt ca', width: 110, value: (r) => r.closedAt ?? '', render: (r) => (r.closedAt ? time(r.closedAt) : <span className="badge badge-info">Đang mở</span>) },
  { key: 'cashier', header: 'Người mở', width: 120 },
  { key: 'orderCount', header: 'Số đơn', type: 'number', sum: true, width: 70 },
  { key: 'total', header: 'Doanh thu', type: 'money', sum: true, width: 110 },
  { key: 'openingCash', header: 'Đầu ca', type: 'money', width: 100 },
  { key: 'cashSales', header: 'Tiền mặt bán', type: 'money', sum: true, width: 110 },
  { key: 'cashRefunds', header: 'Tiền mặt hoàn', type: 'money', sum: true, width: 110 },
  { key: 'expectedCash', header: 'Phải có', type: 'money', width: 110 },
  // Bảng lưới ẩn số 0 — đếm được 0 vẫn phải hiện (khác ca đang mở chưa đếm).
  { key: 'countedCash', header: 'Đếm được', type: 'money', width: 110, render: (r) => (r.countedCash === null ? '' : vnd(r.countedCash)) },
  { key: 'difference', header: 'Chênh lệch', type: 'money', sum: true, width: 110, bold: (r) => r.alert,
    render: (r) => (r.difference === null ? '' : <span className={r.alert ? 'badge badge-bad' : r.difference !== 0 ? 'badge badge-warn' : ''}>{vnd(r.difference)}</span>) },
  { key: 'journal', header: 'Phiếu kế toán', width: 150, value: (r) => r.journal?.docNo ?? '',
    render: (r) => {
      if (!r.journal) return '';
      const [label, cls] = JOURNAL[r.journal.status] ?? [r.journal.status, 'badge-info'];
      const badge = <span className={`badge ${cls}`} title={r.journal.error ?? r.journal.docNo}>{label}</span>;
      return r.journal.status === 'not_created' ? badge : <a href={`/chung-tu?status=&search=${encodeURIComponent(r.journal.docNo)}`}>{badge}</a>;
    } },
  { key: 'forced', header: 'Chốt bất chấp', width: 100, value: (r) => (r.forced ? 'Có' : '') },
  { key: 'note', header: 'Ghi chú', width: 200 },
];

const payCols: GridColumn<{ method: string; name: string; amount: number }>[] = [
  { key: 'name', header: 'Hình thức', width: 200 },
  { key: 'amount', header: 'Số tiền', type: 'money', sum: true, width: 130 },
];

export function SoCaPage() {
  const r = useRange({ diffOnly: 'false' });
  const [pick, setPick] = useState<Row | null>(null);
  const q = usePage<Row[]>('shifts', '/admin/shifts', r.applied);
  const api = useApi();
  const can = useCan();
  const redo = useMutation({
    mutationFn: (id: string) => api.post(`${M}/admin/shifts/${encodeURIComponent(id)}/journal`, {}),
    onSuccess: () => { setPick(null); void q.refetch(); },
  });
  const canRedo = (x: Row | null) => !!x && x.status === 'closed' && (x.difference ?? 0) !== 0 && (!x.journal || x.journal.status === 'not_created') && can('documents:write');
  const rows = q.data?.data ?? [];
  const diff = rows.reduce((s, x) => s + (x.difference ?? 0), 0);
  return (
    <div>
      <PageHeader title="Sổ ca bán" code="BH15" subtitle="Ca bán của các cửa hàng: tiền két phải có, đếm được, chênh lệch. Ca lệch két tự lập phiếu kế toán thiếu / thừa (Cài đặt bán hàng BH17); phiếu chưa lập được thì chọn ca, bấm Lập lại phiếu." />
      <RangeLayout r={r} id="pos-so-ca" more={(
        <label className="rp-field">
          <span>Chỉ ca có chênh lệch</span>
          <input type="checkbox" checked={r.draft.diffOnly === 'true'} onChange={(e) => r.setDraft({ ...r.draft, diffOnly: e.target.checked ? 'true' : 'false' })} />
        </label>
      )}>
        <KpiCards items={[
          { key: 'n', label: 'Số ca', value: rows.length },
          { key: 'open', label: 'Đang mở', value: rows.filter((x) => x.status === 'open').length, tone: 'info' },
          { key: 'd', label: 'Ca có chênh lệch', value: rows.filter((x) => (x.difference ?? 0) !== 0).length, tone: 'warn' },
          { key: 'sum', label: 'Tổng chênh lệch', value: diff, tone: diff < 0 ? 'bad' : 'ok' },
        ]} />
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
          <>
            <DataGrid rows={rows} columns={cols} rowKey={(x) => x.id} storageKey="pos.so-ca" onRowClick={setPick}
              rowClassName={(x) => (x.id === pick?.id ? 'selected' : '')} emptyText="Không có ca trong kỳ" maxHeight="46vh"
              exportName="so-ca-ban" exportTitle="Sổ ca bán" />
            <div className="card" style={{ marginTop: 8, padding: 8 }}>
              <b>Theo hình thức · {pick ? `${pick.branchCode} · mở ${time(pick.openedAt)}` : 'bấm một ca ở trên'}</b>
              {pick?.journal?.error && <div className="muted">Phiếu kế toán: {pick.journal.error}</div>}
              {canRedo(pick) && (
                <div className="row" style={{ gap: 8, margin: '6px 0' }}>
                  <button type="button" className="btn btn-primary" disabled={redo.isPending} onClick={() => redo.mutate(pick!.id)}>Lập lại phiếu kế toán</button>
                  {redo.error && <ErrorBox error={errorText(redo.error)} />}
                </div>
              )}
              {pick && <DataGrid rows={pick.byPayment} columns={payCols} rowKey={(p) => p.method} storageKey="pos.so-ca.ht" maxHeight="24vh" />}
            </div>
          </>
        )}
      </RangeLayout>
    </div>
  );
}
