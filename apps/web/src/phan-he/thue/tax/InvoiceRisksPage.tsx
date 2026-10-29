/**
 * Cảnh báo hoá đơn rủi ro (THUE02).
 *  - Tab "Hoá đơn rủi ro": hoá đơn mua vào trong sổ và trên cổng (đã nhập ở THUE01) có dấu hiệu rủi ro:
 *    người bán trong danh sách rủi ro, mã số thuế sai, trên cổng đã huỷ / bị thay thế mà sổ còn ghi, lệch tiền,
 *    kết quả kiểm tra trên cổng không hợp lệ, có trong sổ mà không có trên cổng (khi tháng đó đã nhập dữ liệu cổng).
 *  - Tab "Người nộp thuế rủi ro": danh sách người bán ngừng hoạt động, bỏ địa chỉ kinh doanh, rủi ro cao… do kế toán khai
 *    hoặc nhập Excel từ thông báo của cơ quan thuế.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import { RISK_KINDS, taxCodeProblem, type RiskKind, type RiskyTaxpayerInput } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date as fmtDate, dateTime, today } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';

interface RiskRow { key: string; serial: string; no: string; date: string; taxCode: string; name: string; beforeTax: number; tax: number; inBooks: boolean; docNo: string; eventId: string | null; branchCode: string; reasons: { code: string; text: string }[] }
interface Risky { id: string; taxCode: string; name: string; risk: RiskKind; effectiveDate: string | null; source: string; note: string; updatedBy: string; updatedAt: string }

const REASON_LABEL: Record<string, string> = {
  risky_seller: 'Người bán rủi ro', bad_tax_code: 'MST sai', no_tax_code: 'Không có MST', portal_status: 'Trên cổng đã huỷ / thay thế',
  amount: 'Lệch tiền với cổng', portal_check: 'Cổng báo không hợp lệ', not_on_portal: 'Không có trên cổng', not_in_books: 'Chưa có trong sổ',
};
const yearStart = () => `${today().slice(0, 4)}-01-01`;

export function InvoiceRisksPage() {
  const [tab, setTab] = useState<'risks' | 'list'>('risks');
  return (
    <>
      <PageHeader title="Cảnh báo hoá đơn rủi ro" code="THUE02" subtitle="Hoá đơn mua vào của người bán rủi ro, sai mã số thuế, đã huỷ trên cổng, lệch với cổng hoá đơn điện tử" helpKey="hoa-don-co-quan-thue" />
      <div className="card">
        <div className="tabs" role="tablist">
          <button role="tab" className={`tab ${tab === 'risks' ? 'active' : ''}`} onClick={() => setTab('risks')}>Hoá đơn rủi ro</button>
          <button role="tab" className={`tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>Người nộp thuế rủi ro</button>
        </div>
        {tab === 'risks' ? <RisksTab /> : <RiskyListTab />}
      </div>
    </>
  );
}

function RisksTab() {
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['invoice-risks', from, to], queryFn: () => api.get<{ rows: RiskRow[]; byReason: Record<string, number>; portalMonths: string[] }>('/api/v1/invoice-risks', { from, to }) });
  const rows = (q.data?.rows ?? []).filter((r) => !reason || r.reasons.some((x) => x.code === reason));
  const columns: Column<RiskRow>[] = [
    { key: 'serial', header: 'Ký hiệu', type: 'code', width: 80 },
    { key: 'no', header: 'Số HĐ', type: 'code', width: 90 },
    { key: 'date', header: 'Ngày HĐ', type: 'date', width: 95 },
    { key: 'taxCode', header: 'MST người bán', type: 'code', width: 120 },
    { key: 'name', header: 'Người bán', width: 220 },
    { key: 'beforeTax', header: 'Tiền hàng', type: 'money', sum: true },
    { key: 'tax', header: 'Tiền thuế', type: 'money', sum: true },
    { key: 'reasons', header: 'Cảnh báo', value: (r) => r.reasons.map((x) => x.text).join('; '), render: (r) => <div style={{ whiteSpace: 'normal' }}>{r.reasons.map((x) => <div key={x.code} className="text-bad">• {x.text}</div>)}</div>, width: 360 },
    { key: 'docNo', header: 'Chứng từ trong sổ', type: 'code', width: 120 },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 80 },
  ];
  return (
    <div>
      <div className="filters">
        <div className="field"><label>Từ ngày</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label>Đến ngày</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="field"><label>Loại cảnh báo</label>
          <select className="select input" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}{q.data?.byReason[k] ? ` (${q.data.byReason[k]})` : ''}</option>)}
          </select>
        </div>
      </div>
      <div style={{ padding: '0 16px 16px' }}>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.data && (
          <div className="muted" style={{ marginBottom: 8 }}>
            {q.data.portalMonths.length
              ? `Đã nhập dữ liệu cổng hoá đơn điện tử các tháng: ${q.data.portalMonths.map((m) => m.split('-').reverse().join('/')).join(', ')}.`
              : 'Chưa nhập dữ liệu cổng hoá đơn điện tử trong khoảng ngày này: chỉ kiểm được mã số thuế và danh sách người nộp thuế rủi ro. Nhập ở màn THUE01 để kiểm thêm trạng thái hoá đơn.'}
          </div>
        )}
        {q.isLoading ? <Loading /> : <DataGrid storageKey="hd02" rows={rows} rowKey={(r) => r.key} columns={columns} emptyText="Không có hoá đơn rủi ro" exportName={`hoa-don-rui-ro-${from}-${to}`} exportTitle={`Cảnh báo hoá đơn mua vào rủi ro từ ${fmtDate(from)} đến ${fmtDate(to)}`} />}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */

const plain = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');
function riskOf(text: string): RiskKind {
  const p = plain(text);
  if (p.includes('tamngung')) return 'suspended';
  if (p.includes('botron') || p.includes('bodiachi') || p.includes('khonghoatdongtaidiachi')) return 'absconded';
  if (p.includes('ngung') || p.includes('chamdut')) return 'stopped';
  if (p.includes('ruirocao')) return 'high_risk';
  return (Object.keys(RISK_KINDS) as RiskKind[]).find((k) => plain(RISK_KINDS[k]) === p || k === p) ?? 'other';
}

/** Đọc Excel danh sách người nộp thuế rủi ro: cột Mã số thuế, Tên, Loại rủi ro, Từ ngày, Nguồn, Ghi chú. */
async function readRiskyExcel(file: File): Promise<{ items: RiskyTaxpayerInput[]; problems: string[] }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, raw: /\.csv$/i.test(file.name) });
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]!]!, { defval: '', raw: true });
  const pick = (r: Record<string, unknown>, ...names: string[]) => { const k = Object.keys(r).find((h) => names.some((n) => plain(h) === n || plain(h).startsWith(n))); return k ? r[k] : ''; };
  const items: RiskyTaxpayerInput[] = [];
  const problems: string[] = [];
  raw.forEach((r, i) => {
    const taxCode = String(pick(r, 'masothue', 'mst') ?? '').trim();
    if (!taxCode) return;
    if (taxCodeProblem(taxCode)?.includes('dạng')) { problems.push(`Dòng ${i + 2}: mã số thuế "${taxCode}" không đúng dạng`); return; }
    const d = pick(r, 'tungay', 'ngay', 'ngayhieuluc');
    let effectiveDate: string | null = null;
    if (d instanceof Date) effectiveDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    else if (String(d).trim()) {
      const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(String(d).trim()) ?? null;
      effectiveDate = m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}$/.test(String(d).trim()) ? String(d).trim() : null;
    }
    items.push({ taxCode, name: String(pick(r, 'ten', 'tennguoinopthue', 'tendoanhnghiep') ?? '').trim(), risk: riskOf(String(pick(r, 'loairuiro', 'ruiro', 'trangthai', 'tinhtrang') ?? '')), effectiveDate, source: String(pick(r, 'nguon', 'canco', 'thongbao') ?? '').trim(), note: String(pick(r, 'ghichu') ?? '').trim() });
  });
  return { items, problems };
}

function RiskyListTab() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const editable = can('catalog:write');
  const q = useQuery({ queryKey: ['risky-taxpayers'], queryFn: () => api.get<Risky[]>('/api/v1/risky-taxpayers') });
  const [editing, setEditing] = useState<RiskyTaxpayerInput | null>(null);
  const [readMsg, setReadMsg] = useState<string | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['risky-taxpayers'] }); void qc.invalidateQueries({ queryKey: ['invoice-risks'] }); };
  const viewAgain = useViewAgain();
  const save = useMutation({ mutationFn: (items: RiskyTaxpayerInput[]) => api.put<{ saved: number }>('/api/v1/risky-taxpayers', { items }), onSuccess: (r, items) => {
    // Sửa người nộp thuế đã có (một dòng, MST có sẵn) rồi Ghi: ở lại hộp thoại, quay về chế độ xem.
    if (items.length === 1 && (q.data ?? []).some((x) => x.taxCode === items[0]?.taxCode)) viewAgain[1](); else setEditing(null);
    setReadMsg(`Đã ghi ${r.saved} người nộp thuế.`); refresh();
  } });
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/api/v1/risky-taxpayers/${id}`), onSuccess: refresh });
  const onFile = async (f?: File) => {
    if (!f) return;
    const r = await readRiskyExcel(f);
    if (!r.items.length) { setReadMsg(`Không đọc được dòng nào. ${r.problems.slice(0, 5).join('; ')}`); return; }
    if (window.confirm(`Ghi ${r.items.length} người nộp thuế rủi ro từ ${f.name}?${r.problems.length ? ` (bỏ qua ${r.problems.length} dòng lỗi)` : ''}`)) save.mutate(r.items);
  };
  const columns: Column<Risky>[] = [
    { key: 'taxCode', header: 'Mã số thuế', type: 'code', width: 130 },
    { key: 'name', header: 'Tên', width: 260 },
    { key: 'risk', header: 'Rủi ro', value: (r) => RISK_KINDS[r.risk], width: 200 },
    { key: 'effectiveDate', header: 'Từ ngày', type: 'date', width: 95 },
    { key: 'source', header: 'Nguồn / căn cứ', width: 220 },
    { key: 'note', header: 'Ghi chú', width: 200 },
    { key: 'updatedBy', header: 'Người ghi', width: 120, value: (r) => `${r.updatedBy} · ${dateTime(r.updatedAt)}` },
    ...(editable ? [{ key: 'del', header: '', width: 40, noFilter: true, noSort: true, render: (r: Risky) => <button className="btn btn-sm" title="Bỏ khỏi danh sách" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Bỏ ${r.taxCode} khỏi danh sách rủi ro?`)) del.mutate(r.id); }}><Trash2 size={14} /></button> } as Column<Risky>] : []),
  ];
  return (
    <div style={{ padding: 16 }}>
      <div className="muted" style={{ marginBottom: 10 }}>
        Khai người bán đã có thông báo của cơ quan thuế (ngừng hoạt động, không hoạt động tại địa chỉ đăng ký, rủi ro cao…). Hoá đơn mua vào của người bán này lập từ ngày ghi ở cột "Từ ngày" sẽ hiện ở tab Hoá đơn rủi ro.
      </div>
      {editable && (
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <button className="btn" onClick={() => setEditing({ taxCode: '', name: '', risk: 'absconded', effectiveDate: null, source: '', note: '' })}><Plus size={16} /> Thêm</button>
          <label className="btn" title="Cột: Mã số thuế, Tên, Loại rủi ro, Từ ngày, Nguồn, Ghi chú">
            <FileSpreadsheet size={16} /> Nhập từ Excel
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
      )}
      {readMsg && <div className="muted" style={{ marginBottom: 8 }}>{readMsg}</div>}
      <ErrorBox error={q.error ? errorText(q.error) : save.error && !editing ? errorText(save.error) : del.error ? errorText(del.error) : null} />
      {q.isLoading ? <Loading /> : (
        <DataGrid storageKey="hd03" rows={q.data ?? []} rowKey={(r) => r.id} columns={columns} footerLabel={false} emptyText="Chưa khai người nộp thuế rủi ro nào"
          onRowClick={editable ? (r) => setEditing({ taxCode: r.taxCode, name: r.name, risk: r.risk, effectiveDate: r.effectiveDate, source: r.source, note: r.note }) : undefined} />
      )}
      {editing && (
        <Modal viewAgain={viewAgain} viewFirst={Boolean(editing.name || editing.source)} title="Người nộp thuế rủi ro" onClose={() => setEditing(null)}
          footer={<><button className="btn" onClick={() => setEditing(null)}>Huỷ</button><button className="btn btn-primary" disabled={save.isPending || editing.taxCode.trim().length < 10} onClick={() => save.mutate([editing])}>Ghi</button></>}>
          <Field label="Mã số thuế (*)" hint={taxCodeProblem(editing.taxCode) ?? undefined}><input className="input mono" value={editing.taxCode} onChange={(e) => setEditing({ ...editing, taxCode: e.target.value.trim() })} /></Field>
          <Field label="Tên"><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
          <Field label="Loại rủi ro"><select className="select input" value={editing.risk} onChange={(e) => setEditing({ ...editing, risk: e.target.value as RiskKind })}>{(Object.keys(RISK_KINDS) as RiskKind[]).map((k) => <option key={k} value={k}>{RISK_KINDS[k]}</option>)}</select></Field>
          <Field label="Từ ngày" hint="Trống = cảnh báo mọi hoá đơn của người bán này"><input type="date" className="input" value={editing.effectiveDate ?? ''} onChange={(e) => setEditing({ ...editing, effectiveDate: e.target.value || null })} /></Field>
          <Field label="Nguồn / căn cứ" full><input className="input" value={editing.source} onChange={(e) => setEditing({ ...editing, source: e.target.value })} placeholder="Ví dụ: Thông báo số … của Cục thuế …" /></Field>
          <Field label="Ghi chú" full><input className="input" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></Field>
          {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
        </Modal>
      )}
    </div>
  );
}
