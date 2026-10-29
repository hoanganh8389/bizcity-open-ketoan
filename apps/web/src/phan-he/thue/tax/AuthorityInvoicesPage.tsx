/**
 * Hoá đơn từ cơ quan thuế (THUE01): nhập danh sách hoá đơn mua vào / bán ra tải từ cổng hoá đơn điện tử
 * (tệp Excel "Xuất excel" hoặc các tệp XML hoá đơn), đối chiếu với sổ hoá đơn của phần mềm:
 *   khớp, lệch tiền, trên cổng đã huỷ / bị thay thế mà sổ còn ghi, có trên cổng chưa có trong sổ, có trong sổ không có trên cổng.
 * Hoá đơn có trên cổng chưa có trong sổ: chọn rồi chuyển thành chứng từ nguồn (CN06) để lập phiếu công nợ.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, FileCode2, Trash2 } from 'lucide-react';
import { AUTHORITY_INVOICE_STATUS_LABELS, type AuthorityInvoiceInput } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date as fmtDate, money, today } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading, Modal } from '@/components/ui';
import { useBranches, BranchPicker } from '@/components/filters';
import { useTenant } from '../../../features/system/TenantPage';
import { readAuthorityExcel, readAuthorityXml } from './authorityImport';

type Kind = 'matched' | 'amount_mismatch' | 'status_mismatch' | 'missing_in_books' | 'missing_on_portal';
interface Side { serial: string; no: string; date: string; taxCode: string; name: string; beforeTax: number; tax: number; status: string }
interface Row {
  key: string; kind: Kind;
  portal: (Side & { id: string; total: number; statusText: string; checkResult: string; referenceDocKey: string | null }) | null;
  book: (Side & { eventId: string; docNo: string; branchCode: string }) | null;
}
interface Result { rows: Row[]; summary: { portal: number; books: number; matched: number; amountMismatch: number; statusMismatch: number; missingInBooks: number; missingOnPortal: number } }

const KIND_LABEL: Record<Kind, string> = {
  matched: 'Khớp',
  amount_mismatch: 'Lệch tiền',
  status_mismatch: 'Trên cổng đã huỷ / thay thế',
  missing_in_books: 'Chưa có trong sổ',
  missing_on_portal: 'Không có trên cổng',
};
const KIND_BADGE: Record<Kind, string> = { matched: 'badge-ok', amount_mismatch: 'badge-warn', status_mismatch: 'badge-bad', missing_in_books: 'badge-warn', missing_on_portal: 'badge-warn' };
const monthStart = () => `${today().slice(0, 7)}-01`;

interface Pending { direction: 'input' | 'output'; source: 'excel' | 'xml'; fileName: string; invoices: AuthorityInvoiceInput[]; problems: string[]; unknownColumns: string[] }

export function AuthorityInvoicesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data: tenant } = useTenant();
  const { data: branches } = useBranches();
  const [direction, setDirection] = useState<'input' | 'output'>('input');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [kind, setKind] = useState<Kind | ''>('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [branchCode, setBranchCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [readErr, setReadErr] = useState<string | null>(null);
  const editable = can('documents:write');

  const q = useQuery({ queryKey: ['authority-reconcile', direction, from, to], queryFn: () => api.get<Result>('/api/v1/authority-invoices/reconcile', { direction, from, to }) });
  const refresh = () => { setPicked(new Set()); void qc.invalidateQueries({ queryKey: ['authority-reconcile'] }); void qc.invalidateQueries({ queryKey: ['invoice-risks'] }); };
  const rows = useMemo(() => (q.data?.rows ?? []).filter((r) => !kind || r.kind === kind), [q.data, kind]);

  const importMut = useMutation({
    mutationFn: async (list: Pending[]) => {
      const out = [];
      for (const p of list) if (p.invoices.length) out.push(await api.put<{ received: number; inserted: number; updated: number }>('/api/v1/authority-invoices', { direction: p.direction, source: p.source, fileName: p.fileName, invoices: p.invoices }));
      return out;
    },
    onSuccess: (res) => {
      setPending(null);
      setMsg(`Đã nhập ${res.reduce((s, r) => s + r.received, 0)} hoá đơn (mới ${res.reduce((s, r) => s + r.inserted, 0)}, cập nhật ${res.reduce((s, r) => s + r.updated, 0)}).`);
      refresh();
    },
  });
  const toRef = useMutation({
    mutationFn: () => api.post<{ created: number }>('/api/v1/authority-invoices/to-reference', { ids: [...picked], branchCode: branchCode || branches?.find((b) => b.isActive)?.code }),
    onSuccess: (r) => { setMsg(`Đã tạo ${r.created} chứng từ nguồn. Lập phiếu ghi tăng công nợ từ chứng từ nguồn ở màn CN02 / CN03.`); refresh(); },
  });
  const del = useMutation({
    mutationFn: () => api.delete<{ deleted: number }>(`/api/v1/authority-invoices?direction=${direction}&from=${from}&to=${to}`),
    onSuccess: (r) => { setMsg(`Đã xoá ${r.deleted} hoá đơn cổng đã nhập.`); refresh(); },
  });

  const onExcel = async (f: File | undefined) => {
    if (!f) return;
    setReadErr(null);
    try {
      const p = await readAuthorityExcel(f);
      setPending([{ direction, source: 'excel', fileName: f.name, ...p }]);
    } catch (e) { setReadErr(`${f.name}: ${(e as Error).message}`); }
  };
  const onXml = async (files: FileList | null) => {
    if (!files?.length) return;
    setReadErr(null);
    const r = await readAuthorityXml([...files], tenant?.taxCode ?? '');
    const name = files.length === 1 ? files[0]!.name : `${files.length} tệp XML`;
    setPending([
      { direction: 'input', source: 'xml', fileName: name, invoices: r.input, problems: r.problems, unknownColumns: [] },
      { direction: 'output', source: 'xml', fileName: name, invoices: r.output, problems: [], unknownColumns: [] },
    ]);
  };

  const s = q.data?.summary;
  const chip = (k: Kind | '', label: string, n?: number) => (
    <button key={k || 'all'} className={`btn btn-sm ${kind === k ? 'btn-primary' : ''}`} onClick={() => setKind(k)}>{label}{n !== undefined ? `: ${n}` : ''}</button>
  );
  const pickable = (r: Row) => r.kind === 'missing_in_books' && r.portal && !r.portal.referenceDocKey;
  const columns: Column<Row>[] = [
    ...(editable ? [{
      key: 'pick', header: '', width: 34, noFilter: true, noSort: true,
      render: (r: Row) => (pickable(r) ? <input type="checkbox" checked={picked.has(r.portal!.id)} onClick={(e) => e.stopPropagation()}
        onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(r.portal!.id); else n.delete(r.portal!.id); return n; })} /> : null),
    } as Column<Row>] : []),
    { key: 'kind', header: 'Kết quả', value: (r) => KIND_LABEL[r.kind], render: (r) => <span className={`badge ${KIND_BADGE[r.kind]}`}>{KIND_LABEL[r.kind]}</span>, width: 170 },
    { key: 'serial', header: 'Ký hiệu', type: 'code', value: (r) => (r.portal ?? r.book)!.serial, width: 80 },
    { key: 'no', header: 'Số HĐ', type: 'code', value: (r) => (r.portal ?? r.book)!.no, width: 90 },
    { key: 'date', header: 'Ngày HĐ', type: 'date', value: (r) => (r.portal ?? r.book)!.date, width: 95 },
    { key: 'taxCode', header: direction === 'input' ? 'MST người bán' : 'MST người mua', type: 'code', value: (r) => (r.portal ?? r.book)!.taxCode, width: 115 },
    { key: 'name', header: direction === 'input' ? 'Người bán' : 'Người mua', value: (r) => (r.portal ?? r.book)!.name, width: 220 },
    { key: 'pBefore', header: 'Tiền hàng (cổng)', band: 'Trên cổng', type: 'money', sum: true, value: (r) => r.portal?.beforeTax ?? null },
    { key: 'pTax', header: 'Thuế (cổng)', band: 'Trên cổng', type: 'money', sum: true, value: (r) => r.portal?.tax ?? null },
    { key: 'pStatus', header: 'Trạng thái', band: 'Trên cổng', value: (r) => (r.portal ? r.portal.statusText || AUTHORITY_INVOICE_STATUS_LABELS[r.portal.status as keyof typeof AUTHORITY_INVOICE_STATUS_LABELS] : ''), width: 150 },
    { key: 'pCheck', header: 'Kết quả kiểm tra', band: 'Trên cổng', value: (r) => r.portal?.checkResult ?? '', width: 150, hidden: true },
    { key: 'bBefore', header: 'Tiền hàng (sổ)', band: 'Trong sổ', type: 'money', sum: true, value: (r) => r.book?.beforeTax ?? null },
    { key: 'bTax', header: 'Thuế (sổ)', band: 'Trong sổ', type: 'money', sum: true, value: (r) => r.book?.tax ?? null },
    { key: 'docNo', header: 'Chứng từ', band: 'Trong sổ', type: 'code', value: (r) => r.book?.docNo ?? '', width: 110 },
    { key: 'branch', header: 'Chi nhánh', band: 'Trong sổ', type: 'code', value: (r) => r.book?.branchCode ?? '', width: 80 },
    { key: 'diff', header: 'Chênh tiền hàng + thuế', type: 'money', value: (r) => (r.portal && r.book ? r.book.beforeTax + r.book.tax - r.portal.beforeTax - r.portal.tax : null) },
    { key: 'ref', header: 'Chứng từ nguồn', value: (r) => (r.portal?.referenceDocKey ? 'Đã tạo' : ''), width: 100 },
  ];

  return (
    <>
      <PageHeader title="Hoá đơn từ cơ quan thuế" code="THUE01" subtitle="Nhập hoá đơn tải từ cổng hoá đơn điện tử, đối chiếu với sổ hoá đơn, chuyển hoá đơn chưa có thành chứng từ nguồn" helpKey="hoa-don-co-quan-thue" />
      {msg && <div className="alert alert-ok" style={{ marginBottom: 12 }}>{msg}</div>}
      <FilterLayout
        filters={
          <>
            <div className="field"><label>Hoá đơn</label>
              <select className="select input" value={direction} onChange={(e) => { setDirection(e.target.value as 'input' | 'output'); setPicked(new Set()); }}>
                <option value="input">Mua vào</option><option value="output">Bán ra</option>
              </select>
            </div>
            <div className="field"><label>Từ ngày</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="field"><label>Đến ngày</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            {editable && (
              <div className="row" style={{ gap: 8, alignSelf: 'flex-end', flexWrap: 'wrap' }}>
                <label className="btn" title="Tệp tải bằng nút Xuất excel ở màn tra cứu hoá đơn của cổng; chiều mua vào / bán ra theo ô Hoá đơn">
                  <FileSpreadsheet size={16} /> Nhập Excel từ cổng
                  <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => { void onExcel(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                <label className="btn" title="Chọn một hoặc nhiều tệp XML hoá đơn; tự nhận mua vào / bán ra theo mã số thuế người bán">
                  <FileCode2 size={16} /> Nhập XML hoá đơn
                  <input type="file" accept=".xml" multiple style={{ display: 'none' }} onChange={(e) => { void onXml(e.target.files); e.target.value = ''; }} />
                </label>
                <button className="btn" disabled={del.isPending || !s?.portal} onClick={() => window.confirm(`Xoá ${s?.portal} hoá đơn ${direction === 'input' ? 'mua vào' : 'bán ra'} đã nhập từ cổng trong khoảng ngày này? (Không ảnh hưởng sổ.)`) && del.mutate()}>
                  <Trash2 size={16} /> Xoá dữ liệu cổng
                </button>
              </div>
            )}
          </>
        }
      >
        <div className="card">
          <div style={{ padding: '0 16px 16px' }}>
            <ErrorBox error={readErr ?? (q.error ? errorText(q.error) : toRef.error ? errorText(toRef.error) : del.error ? errorText(del.error) : null)} />
            {s && (
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {chip('', `Tất cả (cổng ${s.portal}, sổ ${s.books})`)}
                {chip('matched', 'Khớp', s.matched)}
                {chip('amount_mismatch', 'Lệch tiền', s.amountMismatch)}
                {chip('status_mismatch', 'Trên cổng đã huỷ / thay thế', s.statusMismatch)}
                {chip('missing_in_books', 'Chưa có trong sổ', s.missingInBooks)}
                {chip('missing_on_portal', 'Không có trên cổng', s.missingOnPortal)}
              </div>
            )}
            {s && s.portal === 0 && <div className="muted" style={{ marginBottom: 8 }}>Chưa nhập hoá đơn nào từ cổng trong khoảng ngày này: mọi hoá đơn trong sổ hiện là "Không có trên cổng".</div>}
            {editable && picked.size > 0 && (
              <div className="row" style={{ gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
                <div className="field"><label>Chi nhánh nhận</label>
                  <BranchPicker activeOnly value={branchCode || branches?.find((b) => b.isActive)?.code || ''} onChange={setBranchCode} />
                </div>
                <button className="btn btn-primary" disabled={toRef.isPending} onClick={() => toRef.mutate()}>Chuyển {picked.size} hoá đơn thành chứng từ nguồn</button>
              </div>
            )}
            {q.isLoading ? <Loading /> : (
              <DataGrid storageKey="hd01" rows={rows} rowKey={(r) => r.key} columns={columns} exportName={`doi-chieu-hoa-don-${direction}-${from}-${to}`}
                exportTitle={`Đối chiếu hoá đơn ${direction === 'input' ? 'mua vào' : 'bán ra'} với cổng hoá đơn điện tử từ ${fmtDate(from)} đến ${fmtDate(to)}`} />
            )}
          </div>
        </div>
      </FilterLayout>
      {pending && <PreviewDialog list={pending} pending={importMut.isPending} error={importMut.error ? errorText(importMut.error) : null} onClose={() => setPending(null)} onOk={() => importMut.mutate(pending)} />}
    </>
  );
}

function PreviewDialog({ list, pending, error, onClose, onOk }: { list: Pending[]; pending: boolean; error: string | null; onClose: () => void; onOk: () => void }) {
  const total = list.reduce((s, p) => s + p.invoices.length, 0);
  const problems = list.flatMap((p) => p.problems);
  const unknown = [...new Set(list.flatMap((p) => p.unknownColumns))];
  return (
    <Modal title={`Nhập hoá đơn từ ${list[0]!.fileName}`} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Huỷ</button><button className="btn btn-primary" disabled={pending || !total} onClick={onOk}>Nhập {total} hoá đơn</button></>}>
      <div className="full">
        {list.filter((p) => p.invoices.length).map((p) => (
          <div key={p.direction} style={{ marginBottom: 8 }}>
            <b>{p.direction === 'input' ? 'Mua vào' : 'Bán ra'}</b>: {p.invoices.length} hoá đơn, tiền hàng {money(p.invoices.reduce((s, x) => s + x.totalBeforeTax, 0))}, thuế {money(p.invoices.reduce((s, x) => s + x.totalTax, 0))}
            {p.invoices.length > 0 && <span className="muted"> · từ {fmtDate(p.invoices.map((x) => x.invoiceDate).sort()[0]!)} đến {fmtDate(p.invoices.map((x) => x.invoiceDate).sort().at(-1)!)}</span>}
          </div>
        ))}
        {!total && <div className="alert alert-bad">Không đọc được hoá đơn nào trong tệp.</div>}
        {problems.length > 0 && <div className="alert alert-warn"><b>Bỏ qua:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{problems.slice(0, 20).map((x) => <li key={x}>{x}</li>)}</ul>{problems.length > 20 && `… và ${problems.length - 20} dòng khác`}</div>}
        {unknown.length > 0 && <div className="muted">Cột không dùng: {unknown.join(', ')}</div>}
        <div className="muted" style={{ marginTop: 6 }}>Hoá đơn đã nhập trước (cùng người bán, ký hiệu, số) được cập nhật theo tệp mới. Dữ liệu cổng chỉ để đối chiếu, không ghi sổ.</div>
        {error && <div className="alert alert-bad">{error}</div>}
      </div>
    </Modal>
  );
}
