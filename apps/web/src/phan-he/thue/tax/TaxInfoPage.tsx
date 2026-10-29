/**
 * Bổ sung thông tin thuế (ACC78): chứng từ mua bán và hoá đơn trong kỳ, các điểm còn thiếu; bấm một dòng để bổ sung
 * hoá đơn (hoá đơn về muộn, thiếu ký hiệu, mã số thuế…), chọn kỳ kê khai, đánh dấu không được khấu trừ, ghi chứng từ
 * thanh toán không dùng tiền mặt.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DOC_TYPE_LABELS, type DocType } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { date, defaultFrom, defaultTo, money } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';

interface Patch { invoice: Record<string, string>; declareMonth: string; deductible: boolean; paymentRef: string; note: string; updatedBy: string; updatedAt: string }
interface Row {
  eventId: string; docType: string; docNo: string; docDate: string; manual: boolean; trade: boolean; branchCode: string;
  partnerCode: string; partnerName: string; partnerTaxCode: string; docTotal: number;
  direction: 'input' | 'output'; hasInvoice: boolean; invoiceStatus: string;
  invoiceNo: string; serial: string; form: string; invoiceDate: string; name: string; taxCode: string; address: string;
  amount: number; tax: number; declareMonth: string; deductible: boolean; paymentRef: string;
  patch: Patch | null; issues: string[];
}
interface Data { rows: Row[]; counts: { all: number; issues: number; patched: number }; truncated: boolean }

const SHOW = [
  { v: 'issues', label: 'Cần bổ sung' },
  { v: 'patched', label: 'Đã bổ sung' },
  { v: 'all', label: 'Tất cả' },
] as const;

export function TaxInfoPage() {
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), direction: 'input', branchCodes: '', show: 'issues', search: '' });
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const params = { ...f, direction: f.direction || undefined, search: f.search || undefined };
  const q = useQuery({ queryKey: ['tax-info', params], queryFn: () => api.get<Data>('/api/v1/tax-info', params) });
  const d = q.data;

  return (
    <>
      <PageHeader title="Bổ sung thông tin thuế" code="ACC78" subtitle="Bổ sung hoá đơn về muộn, sửa thông tin hoá đơn, chọn kỳ kê khai, đánh dấu hoá đơn không được khấu trừ" helpKey="bo-sung-thong-tin-thue" />
      <FilterLayout
        filters={
          <>
            <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ search: search.trim() }); }}>
              <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
              <div className="field">
                <label>Hoá đơn</label>
                <select className="select input" value={f.direction} onChange={(e) => set({ direction: e.target.value })}>
                  <option value="input">Mua vào</option>
                  <option value="output">Bán ra</option>
                  <option value="">Mua vào và bán ra</option>
                </select>
              </div>
              <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
              <div className="field">
                <label>Hiện</label>
                <select className="select input" value={f.show} onChange={(e) => set({ show: e.target.value })}>
                  {SHOW.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                </select>
              </div>
              <div className="field"><label>Tìm</label><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => set({ search: search.trim() })} placeholder="Số chứng từ, số hoá đơn, tên, MST…" /></div>
            </form>
          </>
        }
      >
        {d && (
          <div className="kpis">
            <div className="card kpi"><div className="label">Chứng từ, hoá đơn trong kỳ</div><div className="value">{d.counts.all.toLocaleString('vi-VN')}</div></div>
            <div className="card kpi"><div className="label">Cần bổ sung</div><div className={`value ${d.counts.issues ? 'text-bad' : ''}`}>{d.counts.issues.toLocaleString('vi-VN')}</div></div>
            <div className="card kpi"><div className="label">Đã bổ sung</div><div className="value">{d.counts.patched.toLocaleString('vi-VN')}</div></div>
          </div>
        )}
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {d?.truncated && <div className="alert alert-warn" style={{ margin: '0 12px 8px' }}>Chỉ hiện 5.000 dòng đầu: thu hẹp khoảng ngày hoặc chi nhánh.</div>}
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text={f.show === 'issues' ? 'Không có chứng từ nào cần bổ sung trong khoảng này' : 'Không có chứng từ trong khoảng này'} /> : (
            <DataGrid
              storageKey="acc78"
              rows={d.rows}
              rowKey={(r) => `${r.eventId}-${r.invoiceNo}`}
              onRowClick={(r) => setEditing(r)}
              columns={[
                { key: 'docDate', header: 'Ngày CT', type: 'date' },
                { key: 'docNo', header: 'Số chứng từ', type: 'code' },
                { key: 'docType', header: 'Loại', value: (r) => DOC_TYPE_LABELS[r.docType as DocType] ?? r.docType },
                { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
                { key: 'invoiceNo', header: 'Số HĐ', type: 'code' },
                { key: 'serial', header: 'Ký hiệu', type: 'code' },
                { key: 'invoiceDate', header: 'Ngày HĐ', type: 'date' },
                { key: 'name', header: f.direction === 'output' ? 'Người mua' : 'Người bán', value: (r) => r.name || r.partnerName },
                { key: 'taxCode', header: 'Mã số thuế', type: 'code' },
                { key: 'amount', header: 'Tiền hàng', type: 'money', sum: true, value: (r) => (r.hasInvoice ? r.amount : r.docTotal) },
                { key: 'tax', header: 'Thuế GTGT', type: 'money', sum: true },
                { key: 'declareMonth', header: 'Kỳ kê khai', value: (r) => (r.declareMonth ? `${r.declareMonth.slice(5)}/${r.declareMonth.slice(0, 4)}` : '') },
                { key: 'deductible', header: 'Khấu trừ', value: (r) => (r.direction === 'input' && r.hasInvoice ? (r.deductible ? 'Được' : 'Không') : ''), render: (r) => (r.direction === 'input' && r.hasInvoice ? <span className={r.deductible ? '' : 'text-bad'}>{r.deductible ? 'Được' : 'Không'}</span> : null) },
                { key: 'issues', header: 'Cần bổ sung', value: (r) => r.issues.join('; '), render: (r) => <span className="text-bad">{r.issues.join('; ')}</span> },
                { key: 'patch', header: 'Đã bổ sung', value: (r) => (r.patch ? 'Có' : ''), render: (r) => (r.patch ? <span className="badge badge-ok">Đã bổ sung</span> : null) },
              ] satisfies Column<Row>[]}
            />
          )}
          <p className="muted" style={{ margin: 12 }}>
            Bấm một dòng để bổ sung. Bổ sung hoá đơn cho chứng từ chưa có hoá đơn thì chứng từ chuyển về chờ định khoản lại (ACC14); định khoản lại thì lên sổ hoá đơn, bảng kê và tờ khai.
            Phần bổ sung được giữ khi hệ thống bán hàng gửi lại chứng từ.
          </p>
        </div>
      </FilterLayout>
      {editing && <TaxInfoDialog row={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TaxInfoDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const readOnly = !can('documents:write');
  const p = row.patch;
  const [inv, setInv] = useState<Record<string, string>>({
    no: p?.invoice.no ?? '', serial: p?.invoice.serial ?? '', form: p?.invoice.form ?? '', date: p?.invoice.date ?? '',
    buyerName: p?.invoice.buyerName ?? '', buyerTaxCode: p?.invoice.buyerTaxCode ?? '', buyerAddress: p?.invoice.buyerAddress ?? '',
  });
  const [declareMonth, setDeclareMonth] = useState(p?.declareMonth ?? '');
  const [deductible, setDeductible] = useState(p?.deductible ?? true);
  const [paymentRef, setPaymentRef] = useState(p?.paymentRef ?? '');
  const [note, setNote] = useState(p?.note ?? '');
  const done = () => { void qc.invalidateQueries({ queryKey: ['tax-info'] }); void qc.invalidateQueries({ queryKey: ['vat-return'] }); onClose(); };
  const save = useMutation({ mutationFn: () => api.put(`/api/v1/tax-info/${row.eventId}`, { invoice: inv, declareMonth, deductible, paymentRef, note }), onSuccess: done });
  const remove = useMutation({ mutationFn: () => api.delete(`/api/v1/tax-info/${row.eventId}`), onSuccess: done });
  const input = row.direction === 'input';
  const canInvoice = row.trade && !row.manual && !readOnly;
  const who = input ? 'người bán' : 'người mua';
  const invField = (k: string, label: string, current: string, opts: { type?: string; mono?: boolean; full?: boolean } = {}) => (
    <Field label={label} full={opts.full} hint={current ? `Hiện tại: ${opts.type === 'date' ? date(current) : current}` : 'Hiện tại: trống'}>
      <input type={opts.type ?? 'text'} className={`input ${opts.mono ? 'mono' : ''}`} value={inv[k] ?? ''} disabled={!canInvoice}
        onChange={(e) => setInv((x) => ({ ...x, [k]: e.target.value }))} placeholder={canInvoice ? 'Để trống = giữ như hiện tại' : ''} />
    </Field>
  );
  const big = input && row.hasInvoice && row.amount + row.tax >= 5_000_000;

  return (
    <Modal wide title={`Bổ sung thông tin thuế — ${DOC_TYPE_LABELS[row.docType as DocType] ?? row.docType} ${row.docNo}`} onClose={onClose}
      footer={<>
        {p && !readOnly && <button className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={remove.isPending} onClick={() => window.confirm('Bỏ toàn bộ phần đã bổ sung, trở về thông tin gốc của chứng từ?') && remove.mutate()}>Bỏ phần bổ sung</button>}
        <button className="btn" onClick={onClose}>Đóng</button>
        {!readOnly && <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Ghi</button>}
      </>}>
      <div className="full muted">
        Chứng từ ngày {date(row.docDate)}, chi nhánh {row.branchCode}{row.partnerName ? `, đối tượng ${row.partnerCode} — ${row.partnerName}` : ''}, tổng tiền {money(row.docTotal)}.
        {row.issues.length > 0 && <div className="text-bad" style={{ marginTop: 4 }}>Cần bổ sung: {row.issues.join('; ')}.</div>}
      </div>
      <div className="full field-title">Hoá đơn</div>
      {!row.trade || row.manual
        ? <div className="full muted">Phiếu nhập tay: sửa hoá đơn ngay trên phiếu (mở phiếu, sửa dòng thuế, ghi lại). Ở đây chỉ chọn kỳ kê khai, khấu trừ, chứng từ thanh toán.</div>
        : !row.hasInvoice && <div className="full alert alert-warn">Chứng từ chưa có hoá đơn. Nhập ít nhất số và ngày hoá đơn: chứng từ chuyển về chờ định khoản lại, định khoản lại thì lên bảng kê, tờ khai.</div>}
      {invField('no', 'Số hoá đơn', row.invoiceNo, { mono: true })}
      {invField('serial', 'Ký hiệu', row.serial, { mono: true })}
      {invField('form', 'Mẫu số', row.form, { mono: true })}
      {invField('date', 'Ngày hoá đơn', row.invoiceDate, { type: 'date' })}
      {invField('buyerName', `Tên ${who}`, row.name, { full: true })}
      {invField('buyerTaxCode', `Mã số thuế ${who}`, row.taxCode, { mono: true })}
      {invField('buyerAddress', `Địa chỉ ${who}`, row.address, { full: true })}
      <div className="full field-title">Kê khai</div>
      <Field label="Kỳ kê khai" hint="Trống = theo tháng của ngày hoá đơn. Hoá đơn mua vào về muộn được kê khai vào kỳ phát hiện.">
        <input type="month" className="input" value={declareMonth} disabled={readOnly} onChange={(e) => setDeclareMonth(e.target.value)} />
      </Field>
      {input && (
        <Field label="Khấu trừ thuế" hint="Bỏ chọn nếu hoá đơn không đủ điều kiện khấu trừ: thuế không đưa vào chỉ tiêu [25]">
          <label className="checkbox"><input type="checkbox" checked={deductible} disabled={readOnly} onChange={(e) => setDeductible(e.target.checked)} /> Được khấu trừ</label>
        </Field>
      )}
      {input && (
        <Field label="Chứng từ thanh toán không dùng tiền mặt" full hint={big ? 'Hoá đơn từ 5 triệu đồng: cần chứng từ thanh toán qua ngân hàng mới được khấu trừ' : 'Số, ngày uỷ nhiệm chi / giấy báo nợ'}>
          <input className="input" value={paymentRef} disabled={readOnly} onChange={(e) => setPaymentRef(e.target.value)} placeholder="Ví dụ: UNC 125 ngày 05/10/2026 – Vietcombank" />
        </Field>
      )}
      <Field label="Ghi chú" full><input className="input" value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} /></Field>
      {p && <div className="full muted">Bổ sung lần cuối bởi {p.updatedBy} lúc {new Date(p.updatedAt).toLocaleString('vi-VN')}.</div>}
      <div className="full"><ErrorBox error={save.error ? errorText(save.error) : remove.error ? errorText(remove.error) : null} /></div>
    </Modal>
  );
}
