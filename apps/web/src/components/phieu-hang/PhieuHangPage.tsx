/**
 * Màn danh sách phiếu hàng hoá dùng chung (bán hàng, hàng bán trả lại, mua hàng, trả hàng nhà cung cấp, chuyển kho).
 * Mỗi phân hệ chỉ cần: <PhieuHangPage kind="sale" code="BH10" seed={mau} helpKey="phieu-hang" />.
 *   - Lọc: khoảng ngày, chi nhánh, trạng thái, tìm nhanh (số phiếu, đối tượng, số hoá đơn, ghi chú).
 *   - Thêm / Sửa (bấm đúp) / Xoá (chỉ phiếu nháp) / Duyệt / Bỏ duyệt / Nạp / Xuất Excel.
 *   - Nhãn "DỮ LIỆU GIẢ" khi loại phiếu đang chạy dữ liệu mẫu (đổi ở API → Nguồn dữ liệu màn hình).
 */
import { workBranch } from '@/lib/workBranch';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorText } from '@/lib/api';
import { defaultTo } from '@/lib/format';
import { KIND_INFO, emptyDoc, tradeApi, type TradeDoc, type TradeKind } from '@/lib/tradeDocs';
import { PageHeader } from '@/components/PageHeader';
import { DateRange, BranchSelect } from '@/components/filters';
import { DataGrid, type Column } from '@/components/DataGrid';
import { khoLabel, useKho } from './ChonKho';
import { ErrorBox, Loading, openNextInEdit } from '@/components/ui';
import { PhieuHangForm } from './PhieuHangForm';
import { TRADE_TEMPLATES } from './printTemplates';
import { PrintButton } from '@/components/print';

const STATUS: Record<string, string> = { draft: 'Nháp', approved: 'Đã duyệt' };

export function PhieuHangPage({ kind, code, seed, helpKey = 'phieu-hang', subtitle }: { kind: TradeKind; code: string; seed: TradeDoc[]; helpKey?: string; subtitle?: string }) {
  const info = KIND_INFO[kind];
  const khoAll = useKho();
  const qc = useQueryClient();
  const svc = useMemo(() => tradeApi(kind, seed), [kind, seed]);
  const [f, setF] = useState({ from: `${defaultTo().slice(0, 8)}01`, to: defaultTo(), branchCodes: '', status: '', search: '' });
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<TradeDoc | null>(null);
  const [editing, setEditing] = useState<TradeDoc | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const key = ['trade', kind, svc.source, f];
  const q = useQuery({ queryKey: key, queryFn: () => svc.list({ ...f, status: f.status || undefined, search: f.search || undefined }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['trade', kind] });
  // Sửa phiếu đã có rồi Ghi: ở lại, mở lại form bằng bản vừa lưu ở chế độ xem (đổi key để form dựng lại).
  const [formKey, setFormKey] = useState(0);
  const save = useMutation({ mutationFn: (d: TradeDoc) => svc.save(d), onSuccess: (saved, d) => { if (d.id) { setEditing(saved); setFormKey((k) => k + 1); } else setEditing(null); void refresh(); } });
  const del = useMutation({ mutationFn: (id: string) => svc.remove(id), onSuccess: () => { setSel(null); void refresh(); } });
  const status = useMutation({ mutationFn: (p: { id: string; s: 'draft' | 'approved' }) => svc.setStatus(p.id, p.s), onSuccess: (d) => { setSel(d); void refresh(); } });
  const open = async (row: TradeDoc) => setEditing(await svc.get(row.id));

  const columns: Column<TradeDoc>[] = [
    { key: 'docDate', header: 'Ngày', type: 'date', width: 100 },
    { key: 'docNo', header: 'Số phiếu', type: 'code', width: 120 },
    { key: 'branchCode', header: info.isTransfer ? 'Chi nhánh xuất' : 'Chi nhánh', type: 'code', width: 110 },
    { key: 'warehouseCode', header: info.isTransfer ? 'Kho xuất' : 'Kho', width: 150, title: 'Kho ở đầu phiếu (trống = kho mặc định của chi nhánh)', value: (r) => khoLabel(khoAll, r.warehouseCode) },
    ...(info.isTransfer ? [{ key: 'toBranchCode', header: 'Chi nhánh nhận', type: 'code', width: 110 } as Column<TradeDoc>, { key: 'toWarehouseCode', header: 'Kho nhận', width: 150, value: (r: TradeDoc) => khoLabel(khoAll, r.toWarehouseCode) } as Column<TradeDoc>] : []),
    ...(info.partner ? [{ key: 'partner', header: info.partnerLabel, width: 220, value: (r: TradeDoc) => (r.partner ? `${r.partner.code} — ${r.partner.name}` : info.partner === 'customer' ? 'Khách lẻ' : '') } as Column<TradeDoc>] : []),
    ...(info.hasInvoice ? [{ key: 'invoice', header: 'Số hoá đơn', type: 'code', width: 110, value: (r: TradeDoc) => r.invoice?.no ?? '' } as Column<TradeDoc>] : []),
    { key: 'lines', header: 'Số dòng', type: 'number', width: 70, value: (r) => r.lines.length },
    ...(!info.isTransfer ? [
      { key: 'beforeTax', header: 'Tiền hàng', type: 'money', width: 120, sum: true, value: (r: TradeDoc) => r.totals.beforeTax } as Column<TradeDoc>,
      { key: 'tax', header: 'Tiền thuế', type: 'money', width: 110, sum: true, value: (r: TradeDoc) => r.totals.tax } as Column<TradeDoc>,
      { key: 'total', header: 'Tổng tiền', type: 'money', width: 130, sum: true, bold: true, value: (r: TradeDoc) => r.totals.total } as Column<TradeDoc>,
    ] : []),
    { key: 'status', header: 'Trạng thái', width: 90, value: (r) => STATUS[r.status] ?? r.status },
    { key: 'note', header: 'Ghi chú', width: 200 },
  ];

  return (
    <>
      <PageHeader title={info.label} code={code} helpKey={helpKey}
        subtitle={subtitle ?? `Thêm, sửa, xoá, duyệt ${info.label.toLowerCase()}`} />
      {svc.source === 'mock' && (
        <div className="alert alert-info" style={{ marginBottom: 8 }}>
          <b>DỮ LIỆU GIẢ</b> — màn đang chạy bằng dữ liệu mẫu lưu ở trình duyệt này (chưa vào sổ kế toán), chờ API thật.
          Đổi nguồn ở <Link to="/tich-hop/nguon-du-lieu">API → Nguồn dữ liệu màn hình</Link>.
        </div>
      )}
      <div className="card">
        <div className="filters">
          <DateRange from={f.from} to={f.to} onChange={(from, to) => setF((x) => ({ ...x, from, to }))} />
          <BranchSelect value={f.branchCodes} onChange={(v) => setF((x) => ({ ...x, branchCodes: v }))} />
          <select className="select input" style={{ height: 30, width: 130 }} value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))}>
            <option value="">Mọi trạng thái</option><option value="draft">Nháp</option><option value="approved">Đã duyệt</option>
          </select>
          <form className="row" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); setF((x) => ({ ...x, search: search.trim() })); }}>
            <input className="input" style={{ width: 220, height: 30 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm: số phiếu, đối tượng, hoá đơn" />
            <button className="btn btn-sm" type="submit">Tìm</button>
          </form>
        </div>
        <div className="row" style={{ gap: 6, padding: '6px 0', flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-primary" onClick={() => setEditing(emptyDoc(kind, workBranch.get() || (f.branchCodes.split(',')[0] ?? '')))}>+ Thêm</button>
          <button className="btn btn-sm" disabled={!sel} onClick={() => { if (!sel) return; if (sel.status !== 'approved') openNextInEdit(); void open(sel); }}>{sel?.status === 'approved' ? 'Xem' : 'Sửa'}</button>
          <button className="btn btn-sm" disabled={!sel || sel.status === 'approved' || del.isPending} onClick={() => { if (sel && window.confirm(`Xoá ${info.label.toLowerCase()} ${sel.docNo}?`)) del.mutate(sel.id); }}>Xoá</button>
          <button className="btn btn-sm" disabled={!sel || status.isPending} onClick={() => sel && status.mutate({ id: sel.id, s: sel.status === 'approved' ? 'draft' : 'approved' })}>{sel?.status === 'approved' ? 'Bỏ duyệt' : 'Duyệt'}</button>
          {TRADE_TEMPLATES[kind] && <PrintButton small screen={code} templates={TRADE_TEMPLATES[kind]!} disabled={!sel} title="In phiếu đang chọn" getDocs={async () => (sel ? [await svc.get(sel.id)] : [])} />}
          <button className="btn btn-sm" onClick={() => void q.refetch()}>Nạp</button>
          <button className="btn btn-sm" onClick={() => exportRef.current?.()}>Xuất Excel</button>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : status.error ? errorText(status.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid storageKey={`phieu-${kind}-v1`} exportName={`phieu-${kind}`} exportRef={exportRef} rows={q.data?.data ?? []} rowKey={(r) => r.id}
            onSelect={setSel} onRowDoubleClick={(r) => void open(r)} rowClassName={(r) => (r.status === 'approved' ? '' : 'muted')} footerLabel="Cộng"
            emptyText={`Chưa có ${info.label.toLowerCase()} trong khoảng này — bấm "+ Thêm"`} columns={columns} />
        )}
      </div>
      {editing && <PhieuHangForm key={formKey} printScreen={code} value={editing} readOnly={editing.status === 'approved'} saving={save.isPending} error={save.error} onSave={(d) => save.mutate(d)} onClose={() => { setEditing(null); save.reset(); }} />}
    </>
  );
}
