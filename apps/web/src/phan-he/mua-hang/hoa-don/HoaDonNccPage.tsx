/**
 * HOÁ ĐƠN ĐẦU VÀO CỦA NCC (MH22) — lưu riêng từng hoá đơn NCC gửi (gõ tay, nhập Excel, quét ảnh / PDF bằng AI), đối soát với
 * phiếu nhập cùng số hoá đơn. Mỗi hoá đơn có tình trạng: chưa nhận diện mã · chưa có phiếu nhập · lệch phiếu nhập · khớp.
 * Dùng ở menu (mọi NCC) và trong hồ sơ NCC (khoá theo NCC). Bảng nhận diện mã = các cách ghi tên / mã hàng của NCC phần mềm đã học.
 */
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { invoiceLabel } from '@ketoan/contracts/mua-hang';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading, Modal } from '@/components/ui';
import { PartnerPicker } from '@/components/pickers';
import { NccInfo } from '../thanh-phan/NccInfo';
import { STATUS_LABEL, monthStart, today, useNames } from '../du-lieu';
import { dmy } from '../chung';
import '../mua-hang.css';
import { HoaDonModal } from './HoaDonModal';
import { NhapHoaDon } from './NhapHoaDon';
import { SOURCE_LABEL, STATE_LABEL, invoiceApi, type InvoiceRow, type InvoiceState } from './api';

export function HoaDonNccPage({ embedPartner }: { embedPartner?: string } = {}) {
  const names = useNames();
  const embedded = Boolean(embedPartner);
  // Mở theo tình trạng (việc cần làm) thì xem mọi ngày — hoá đơn tồn đọng từ tháng trước vẫn hiện.
  const [from, setFrom] = useState(embedded || new URLSearchParams(window.location.search).get('tinh-trang') ? '' : monthStart());
  const [to, setTo] = useState(embedded || new URLSearchParams(window.location.search).get('tinh-trang') ? '' : today());
  const [partner, setPartner] = useState(embedPartner ?? '');
  const [params] = useSearchParams();
  // ?tinh-trang=chua_nhan_dien|chua_co_phieu|lech|khop (mở từ Việc cần làm / sơ đồ quy trình).
  const [state, setState] = useState<'' | InvoiceState>(embedded ? '' : (params.get('tinh-trang') as InvoiceState | null) ?? '');
  const [open, setOpen] = useState<{ id?: string } | null>(null);
  const [importMode, setImportMode] = useState<'excel' | 'scan' | null>(null);
  const [aliases, setAliases] = useState(false);
  const exportRef = useRef<(() => void) | null>(null);
  const pc = embedPartner ?? partner;
  const q = useQuery({ queryKey: ['mua-hang', 'invoices', pc, from, to], queryFn: () => invoiceApi.list({ partnerCode: pc || undefined, from: from || undefined, to: to || undefined }) });
  const scan = useQuery({ queryKey: ['mua-hang', 'invoice-scan-config'], staleTime: 300_000, queryFn: () => invoiceApi.scanConfig() });
  const all = q.data ?? [];
  const rows = all.filter((r) => !state || r.state === state);
  const count = (s: InvoiceState) => all.filter((r) => r.state === s).length;
  const columns: Column<InvoiceRow>[] = [
    { key: 'date', header: 'Ngày HĐ', width: 90, value: (r) => dmy(r.date) },
    { key: 'label', header: 'Ký hiệu - Số HĐ', type: 'code', width: 140, value: (r) => invoiceLabel(r), render: (r) => <button type="button" className="btn btn-xs btn-ghost" onClick={() => setOpen({ id: r.id })}>{invoiceLabel(r)}</button> },
    ...(embedded ? [] : [
      { key: 'partner', header: 'Mã NCC', type: 'code', width: 120, value: (r: InvoiceRow) => r.partnerCode, render: (r: InvoiceRow) => <span className="row" style={{ gap: 4, alignItems: 'center' }}>{r.partnerCode}<NccInfo code={r.partnerCode} showName={false} /></span> },
      { key: 'partnerName', header: 'Tên NCC', width: 220, value: (r: InvoiceRow) => names.partnerName(r.partnerCode) },
    ] as Column<InvoiceRow>[]),
    { key: 'sellerTaxCode', header: 'MST người bán', type: 'code', width: 110 },
    { key: 'totalBeforeTax', header: 'Tiền hàng', type: 'money', width: 120 },
    { key: 'totalTax', header: 'Tiền thuế', type: 'money', width: 100 },
    { key: 'total', header: 'Tổng thanh toán', type: 'money', width: 130 },
    { key: 'lineCount', header: 'Số dòng', type: 'number', width: 70 },
    { key: 'unmatched', header: 'Chưa nhận diện', type: 'number', width: 90, render: (r) => (r.unmatched ? <span className="mh-bad">{r.unmatched}</span> : '') },
    { key: 'state', header: 'Tình trạng', width: 160, value: (r) => STATE_LABEL[r.state][0], render: (r) => <span className={`badge ${STATE_LABEL[r.state][1]}`} title={r.issues.length ? r.issues.join('\n') : STATE_LABEL[r.state][2]}>{STATE_LABEL[r.state][0]}</span> },
    { key: 'issues', header: 'Chỗ lệch', width: 260, value: (r) => r.issues.join('; '), render: (r) => <span title={r.issues.join('\n')}>{r.issues.join('; ')}</span> },
    { key: 'receipts', header: 'Phiếu nhập', width: 180, value: (r) => r.receipts.map((x) => x.docNo).join(', '),
      render: (r) => <span>{r.receipts.map((x) => <a key={x.id} href={`/mua-hang/chung-tu?mo=${encodeURIComponent(x.id)}`} style={{ marginRight: 6 }} title={`${dmy(x.docDate)} · ${STATUS_LABEL[x.status as keyof typeof STATUS_LABEL] ?? x.status}`}>{x.docNo || '(nháp)'}</a>)}</span> },
    { key: 'source', header: 'Nguồn', width: 80, value: (r) => SOURCE_LABEL[r.source] },
    { key: 'attachments', header: 'Tệp', type: 'number', width: 55 },
    { key: 'createdBy', header: 'Người tạo', width: 160 },
    { key: 'createdAt', header: 'Ngày giờ tạo', width: 140, value: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString('vi-VN', { hour12: false }) : '') },
    { key: 'updatedBy', header: 'Người sửa', width: 160 },
    { key: 'updatedAt', header: 'Ngày giờ sửa', width: 140, value: (r) => (r.updatedAt ? new Date(r.updatedAt).toLocaleString('vi-VN', { hour12: false }) : '') },
  ];
  const chip = (s: InvoiceState) => <button key={s} type="button" className={`btn btn-sm ${state === s ? 'btn-primary' : ''}`} title={STATE_LABEL[s][2]} onClick={() => setState(state === s ? '' : s)}>{STATE_LABEL[s][0]} ({count(s)})</button>;
  return (
    <>
      {!embedded && <PageHeader title="Hoá đơn đầu vào của NCC" code="MH22" helpKey="mua-hang-hoa-don-ncc"
        subtitle="Lưu hoá đơn NCC gửi (gõ tay, Excel, quét ảnh / PDF), nhận diện mã hàng bên mình, đối soát với phiếu nhập cùng số hoá đơn" />}
      <div className={embedded ? '' : 'card'}>
        <div className="filters">
          <span style={{ fontSize: 13 }}>Ngày HĐ từ</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span style={{ fontSize: 13 }}>đến</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          {!embedded && <div style={{ width: 240 }}><PartnerPicker value={partner} onChange={setPartner} placeholder="Mọi nhà cung cấp" /></div>}
          <button className="btn btn-sm btn-primary" onClick={() => setOpen({})}>+ Thêm hoá đơn</button>
          <button className="btn btn-sm" onClick={() => setImportMode('excel')}>Nhập Excel</button>
          <button className="btn btn-sm" onClick={() => setImportMode('scan')} disabled={!scan.data?.configured} title={scan.data?.configured ? 'Đọc ảnh / PDF hoá đơn bằng dịch vụ AI đã cấu hình' : 'Chưa cấu hình dịch vụ đọc hoá đơn (INVOICE_AI_URL) — hỏi bộ phận IT'}>Quét ảnh / PDF (AI)</button>
          <button className="btn btn-sm" onClick={() => setAliases(true)} title="Các cách NCC ghi tên / mã hàng mà phần mềm đã học">Bảng nhận diện mã</button>
          <button className="btn btn-sm" onClick={() => exportRef.current?.()}>Xuất Excel</button>
        </div>
        <div className="filters" style={{ paddingTop: 0 }}>{(['chua_nhan_dien', 'chua_co_phieu', 'lech', 'khop', 'da_huy'] as InvoiceState[]).map(chip)}</div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid storageKey="mh-hoa-don-ncc" exportName="hoa-don-ncc" exportRef={exportRef} rows={rows} rowKey={(r) => r.id!} columns={columns} onRowDoubleClick={(r) => setOpen({ id: r.id })}
            emptyText="Chưa có hoá đơn NCC trong kỳ — bấm Nhập Excel / Thêm hoá đơn" />
        )}
      </div>
      {open && <HoaDonModal id={open.id} partnerCode={pc} lockPartner={embedded} onClose={() => setOpen(null)} onSaved={() => void q.refetch()} />}
      {importMode && <NhapHoaDon mode={importMode} partnerCode={pc} lockPartner={embedded} onClose={() => setImportMode(null)} onDone={() => void q.refetch()} />}
      {aliases && <BangNhanDien partnerCode={pc} onClose={() => setAliases(false)} />}
    </>
  );
}

/** Bảng nhận diện mã: NCC ghi (mã / tên / ĐVT) → mã + ĐVT bên mình, số lần gặp, ai dạy, lúc nào. Xoá = quên cách ghi đó. */
function BangNhanDien({ partnerCode, onClose }: { partnerCode: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['mua-hang', 'invoice-aliases', partnerCode], queryFn: () => invoiceApi.aliases(partnerCode || undefined) });
  const [err, setErr] = useState('');
  const del = async (id: string, label: string) => {
    if (!window.confirm(`Quên cách ghi "${label}"? Lần sau gặp lại phải chọn mã lại.`)) return;
    try { await api.delete(`/api/v1/purchase/invoice-aliases/${id}`); await q.refetch(); } catch (e) { setErr(errorText(e)); }
  };
  return (
    <Modal wide title={`Bảng nhận diện mã hàng NCC${partnerCode ? ` — ${partnerCode}` : ''}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      <div className="full">
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Mỗi dòng là một cách NCC ghi trên hoá đơn mà phần mềm đã học (khi bạn chọn mã cho dòng hoá đơn). Hoá đơn sau ghi y như vậy thì tự nhận đúng mã. NCC đổi tên hàng: chọn mã một lần là phần mềm nhớ thêm cách ghi mới.</div>
      {err && <div className="alert alert-bad">{err}</div>}
      {q.isLoading ? <Loading /> : (
        <table className="mh-mini">
          <thead><tr>{!partnerCode && <th>NCC</th>}<th>Mã NCC</th><th>Tên NCC ghi</th><th>ĐVT NCC</th><th>→ Mã bên mình</th><th>Tên hàng</th><th>ĐVT</th><th className="num">Số lần gặp</th><th>Nguồn</th><th>Người dạy</th><th>Lần gặp gần nhất</th><th /></tr></thead>
          <tbody>
            {(q.data ?? []).map((a) => (
              <tr key={a.id}>
                {!partnerCode && <td className="mono">{a.partnerCode}</td>}
                <td className="mono">{a.nccSku}</td><td>{a.nccName}</td><td>{a.nccUnit}</td><td className="mono"><b>{a.sku}</b></td><td>{a.productName}</td><td>{a.unit}</td>
                <td className="num">{a.hits}</td><td>{a.source === 'ai' ? 'AI' : a.source === 'auto' ? 'Tự động' : 'Chọn tay'}</td><td>{a.updatedBy || a.createdBy}</td>
                <td>{a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString('vi-VN', { hour12: false }) : ''}</td>
                <td><button type="button" className="btn btn-xs" data-view-ok onClick={() => void del(a.id!, a.nccName || a.nccSku)}>Xoá</button></td>
              </tr>
            ))}
            {!q.isLoading && !(q.data ?? []).length && <tr><td colSpan={12} className="muted">Chưa học cách ghi nào — chọn mã cho dòng hoá đơn chưa nhận diện rồi Ghi.</td></tr>}
          </tbody>
        </table>
      )}
      </div>
    </Modal>
  );
}

