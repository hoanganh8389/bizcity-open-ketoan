/**
 * Khung màn danh sách phiếu dùng chung (phiếu thu chi, phiếu kế toán, phiếu kho, hoá đơn bán, hàng bán trả lại…),
 * xếp như danh sách chứng từ của phần mềm kế toán để bàn:
 *   bảng lọc trái : Từ ngày, Đến ngày, Chi nhánh (tích chọn, nhớ theo màn, chọn nhanh), Tìm kiếm (+ nút riêng của màn);
 *   thanh nút     : Thêm (một hay nhiều loại), Sửa, Copy, Xóa, Nạp, Xuất (+ nút riêng); Sửa / Copy / Xóa theo các phiếu tích ô Chọn;
 *   lưới          : cột Chọn + cột của màn; bấm một dòng để mở phiếu.
 * useListFilter : điều kiện lọc (bản nháp đang sửa / bản đã bấm Tìm kiếm) và widen() nới khoảng ngày cho phiếu vừa ghi.
 */
import { useRef, useState, type ReactNode } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Copy, Download, Pencil, RefreshCw, Search, X } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { defaultFrom, today } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { BranchCheckList, ReportSideLayout, SideField, branchesPicked } from '@/components/ReportPanel';
import { Empty, ErrorBox, Loading, openNextInEdit } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import type { ToolButton } from './VoucherModal';

export interface ListFilter { from: string; to: string; branchCodes: string }

export function useListFilter(from = defaultFrom()) {
  const init: ListFilter = { from, to: today(), branchCodes: '' };
  const [draft, setDraft] = useState(init);
  const [f, setF] = useState(init);
  /** Phiếu ghi ngày ngoài khoảng đang lọc: nới khoảng ngày để phiếu hiện trong danh sách. */
  const widen = (docDate: string) => {
    const w = (x: ListFilter) => ({ ...x, from: docDate < x.from ? docDate : x.from, to: docDate > x.to ? docDate : x.to });
    setDraft(w);
    setF(w);
  };
  return { draft, setDraft, f, setF, widen };
}

export function VoucherListPage<R extends { id: string; docKey: string }>({
  title, code, subtitle, helpKey, filter, query, columns, storageKey, addButtons, canWrite, onOpen, onCopy, canDelete, extraToolbar, extraPanel, notice, setNotice, emptyText, children,
}: {
  title: string; code: string; subtitle: string; helpKey: string;
  filter: ReturnType<typeof useListFilter>;
  query: { data?: R[]; isLoading: boolean; isFetching: boolean; error: unknown; refetch: () => unknown; queryKey: QueryKey };
  columns: Column<R>[];
  storageKey: string;
  addButtons: ToolButton[];
  canWrite: boolean;
  onOpen: (r: R) => Promise<void> | void;
  onCopy?: (r: R) => Promise<void> | void;
  /** Lý do không xóa được phiếu (null = xóa được). */
  canDelete?: (r: R) => string | null;
  extraToolbar?: (picked: R[], run: (fn: () => Promise<void>) => void) => ReactNode;
  extraPanel?: (picked: R[], run: (fn: () => Promise<void>) => void) => ReactNode;
  notice: string | null;
  setNotice: (s: string | null) => void;
  emptyText?: string;
  /** Hộp phiếu đang mở, hộp in… */
  children?: ReactNode;
}) {
  const qc = useQueryClient();
  const { draft, setDraft, f, setF } = filter;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const exportRef = useRef<(() => void) | null>(null);
  const rows = query.data ?? [];
  const picked = rows.filter((r) => selected.has(r.id));

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    void fn().catch((e) => setProblem(errorText(e))).finally(() => setBusy(false));
  };
  const one = (): R | null => {
    if (picked.length !== 1) { setProblem('Tích ô Chọn ở đúng một phiếu.'); return null; }
    return picked[0]!;
  };
  const remove = () => {
    if (!picked.length) return setProblem('Chưa tích ô Chọn ở phiếu nào.');
    const blocked = canDelete ? picked.map(canDelete).find(Boolean) : null;
    if (blocked) return setProblem(blocked);
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${picked.length} phiếu đã chọn không?`)) return;
    const reason = window.prompt('Lý do xóa phiếu (bút toán được ghi số âm để đảo):');
    if (!reason) return;
    run(async () => {
      for (const r of picked) await api.post('/api/v1/documents/cancel', { docKey: r.docKey, reason });
      setNotice(`Đã xóa ${picked.length} phiếu.`);
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: query.queryKey.slice(0, 1) });
    });
  };
  const search = () => {
    if (!branchesPicked(draft.branchCodes)) return;
    setSelected(new Set());
    setF(draft);
    void qc.invalidateQueries({ queryKey: query.queryKey.slice(0, 2) });
  };

  const pickCol: Column<R> = {
    key: 'pick', noFilter: true, noSort: true, width: 46,
    header: <label className="checkbox" title="Chọn tất cả"><input type="checkbox" checked={rows.length > 0 && rows.every((r) => selected.has(r.id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /> Chọn</label>,
    value: () => '',
    render: (r) => <input type="checkbox" checked={selected.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />,
  };

  const panel = (
    <>
      <SideField label="Từ ngày"><input type="date" className="input" value={draft.from} onChange={(e) => setDraft((x) => ({ ...x, from: e.target.value }))} /></SideField>
      <SideField label="Đến ngày"><input type="date" className="input" value={draft.to} min={draft.from} onChange={(e) => setDraft((x) => ({ ...x, to: e.target.value }))} /></SideField>
      <span className="muted" style={{ fontSize: 12, marginTop: 2 }}>Chi nhánh</span>
      <BranchCheckList value={draft.branchCodes} onChange={(branchCodes) => setDraft((x) => ({ ...x, branchCodes }))} onRestore={(branchCodes) => { setDraft((x) => ({ ...x, branchCodes })); setF((x) => ({ ...x, branchCodes })); }} />
      <div className="rp-actions">
        <button type="button" className="btn btn-primary" onClick={search} disabled={query.isFetching}><Search size={14} /> Tìm kiếm</button>
        {extraPanel?.(picked, run)}
      </div>
    </>
  );

  return (
    <>
      <PageHeader title={title} code={code} subtitle={subtitle} helpKey={helpKey} />
      <ReportSideLayout panel={panel}>
        <div className="card" style={{ padding: 0 }}>
          <div className="vf-toolbar">
            {addButtons.map((b) => <button key={b.key} disabled={!canWrite || b.disabled} title={b.title} onClick={() => { setNotice(null); b.onClick(); }}>{b.icon}{b.label}</button>)}
            <button disabled={busy} onClick={() => { const r = one(); if (r) run(async () => { openNextInEdit(); await onOpen(r); }); }}><Pencil size={15} /> Sửa</button>
            {onCopy && <button disabled={!canWrite || busy} onClick={() => { const r = one(); if (r) run(async () => { setNotice(null); await onCopy(r); }); }}><Copy size={15} /> Copy</button>}
            <button disabled={!canWrite || busy} onClick={remove}><X size={15} className="text-bad" /> Xóa</button>
            <button onClick={() => void query.refetch()}><RefreshCw size={15} /> Nạp</button>
            <button disabled={!rows.length} onClick={() => exportRef.current?.()}><Download size={15} /> Xuất</button>
            {extraToolbar?.(picked, run)}
          </div>
          {notice && <div className="alert alert-ok" style={{ margin: 8 }}>{notice}</div>}
          <ErrorBox error={query.error ? errorText(query.error) : problem} />
          {query.isLoading ? <Loading /> : rows.length === 0 ? <Empty text={emptyText ?? `Chưa có ${title.toLowerCase()} nào trong khoảng này`} /> : (
            <DataGrid
              storageKey={storageKey}
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => run(async () => { await onOpen(r); })}
              exportRef={exportRef}
              exportName={`${code}-${f.from}-${f.to}`}
              columns={[pickCol, ...columns]}
            />
          )}
        </div>
      </ReportSideLayout>
      {children}
    </>
  );
}

/** Ngày giờ ngắn cho cột Ngày tạo / Ngày sửa. */
export const dateTimeShort = (s: string | null) => (s ? new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
