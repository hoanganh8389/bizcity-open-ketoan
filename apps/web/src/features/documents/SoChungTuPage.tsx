// [2026-11-18 Nguyễn Văn Thủy] HT18 Sổ chứng từ: mọi chứng từ nghiệp vụ ở một chỗ, theo trạng thái chuẩn (business_documents, 0156) (đóng góp)
/**
 * HT18 Sổ chứng từ — đọc sổ chứng từ chung business_documents (đầu phiếu mọi chứng từ nghiệp vụ, tự đồng bộ từ phân hệ).
 *   thẻ trạng thái chuẩn: Nháp · Chờ duyệt · Đã duyệt · Hoàn tất · Đã huỷ · Tất cả (kèm số lượng);
 *   lọc ngày, chi nhánh, loại chứng từ, ô tìm số / đối tượng;
 *   bấm một dòng: đầu phiếu + các phiên bản (mỗi lần nội dung đổi) + chứng từ liên quan (lập từ, sự việc kế toán sinh ra) + tệp đính kèm.
 * Chỉ xem: lập / sửa / duyệt vẫn ở màn của từng phân hệ.
 */
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { dateTime, defaultFrom, defaultTo } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { FormTabs } from '@/components/FormBlocks';
import { Empty, ErrorBox, Loading, Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';

type Status = 'draft' | 'pending' | 'approved' | 'done' | 'cancelled';
type Tab = Status | 'all';
interface Doc {
  docRef: string; module: string; docType: string; docNo: string; docDate: string | null; branchCode: string; partnerRef: string; partnerName: string;
  title: string; total: number; statusRaw: string; status: Status; version: number; meta: Record<string, unknown>; createdBy: string; createdAt: string; updatedAt: string;
}
interface Detail {
  document: Doc;
  versions: { version: number; contentHash: string; createdBy: string; createdAt: string }[];
  links: { from: string; to: string; role: string; createdBy: string; createdAt: string }[];
  files: { id: string; fileName: string; kind: string; sizeBytes: number; createdBy: string; createdAt: string }[];
}

const STATUS_TEXT: Record<Status, string> = { draft: 'Nháp', pending: 'Chờ duyệt', approved: 'Đã duyệt', done: 'Hoàn tất', cancelled: 'Đã huỷ' };
const STATUS_CLASS: Record<Status, string> = { draft: 'muted', pending: 'text-warn', approved: 'text-ok', done: 'text-ok', cancelled: 'text-bad' };
const TYPES: [string, string][] = [
  ['', 'Mọi loại'], ['purchase.', 'Mua hàng (mọi loại)'], ['purchase.order', 'Đơn đặt hàng'], ['purchase.receipt', 'Phiếu nhập mua'],
  ['purchase.return', 'Trả hàng NCC'], ['inventory.transfer', 'Chuyển kho'], ['finance.payment_request', 'Đề nghị thanh toán'],
];
/** Tên tiếng Việt của thông tin thêm (meta). */
const META_TEXT: Record<string, string> = {
  invoiceNo: 'Số hoá đơn', invoiceDate: 'Ngày hoá đơn', dueDate: 'Hạn thanh toán', totalBeforeTax: 'Tiền hàng', totalTax: 'Tiền thuế', demo: 'Dữ liệu mẫu',
  fromWarehouse: 'Kho xuất', toBranch: 'Chi nhánh nhận', toWarehouse: 'Kho nhận', receivedDate: 'Ngày nhận', reason: 'Lý do', method: 'Hình thức', rejectedReason: 'Lý do trả lại',
};
const metaText = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('vi-VN') : v === true ? 'Có' : String(v));
const ROLE_TEXT: Record<string, string> = { source: 'Lập từ', ledger: 'Sự việc kế toán', reverses: 'Đảo', replaces: 'Thay thế', settles: 'Thanh toán cho', attachesTo: 'Đính vào' };

/** Chiều liên kết nhìn từ chứng từ đang xem: đi ra (lập từ X) hay đi vào (X lập từ phiếu này). */
function linkText(l: Detail['links'][number], self: string) {
  const out = l.from === self;
  const other = out ? l.to : l.from;
  const role = ROLE_TEXT[l.role] ?? l.role;
  return { other: other.replace(/^ledger\.event:/, ''), text: out ? role : l.role === 'source' ? 'Được lập thành' : `${role} (chiều vào)` };
}

function ChiTiet({ docRef, onClose, onOpen }: { docRef: string; onClose: () => void; onOpen: (ref: string) => void }) {
  const q = useQuery({ queryKey: ['business-document', docRef], queryFn: () => api.get<Detail>('/api/v1/business-documents/detail', { docRef }) });
  const d = q.data?.document;
  return (
    <Modal wide title={d ? `${d.title} ${d.docNo}` : docRef} onClose={onClose} footer={<button onClick={onClose}>Đóng</button>}>
      <style>{SCT_CSS}</style>
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading || !q.data || !d ? <Loading /> : (
        <div className="full" style={{ display: 'grid', gap: 14 }}>
          <div className="sct-head" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px' }}>
            <div title="Định danh chứng từ (không đổi)">Mã chứng từ: <b className="mono">{d.docRef}</b></div>
            <div title="Trạng thái chuẩn và trạng thái riêng của phân hệ">Trạng thái: <b className={STATUS_CLASS[d.status]}>{STATUS_TEXT[d.status]}</b> <span className="muted">({d.statusRaw})</span></div>
            <div>Loại: <b>{d.title}</b> <span className="muted mono">{d.docType}</span></div>
            <div>Ngày: <b>{d.docDate ?? '—'}</b> · Chi nhánh: <b>{d.branchCode || '—'}</b></div>
            <div>Đối tượng: <b>{d.partnerRef || '—'}</b>{d.partnerName ? ` ${d.partnerName}` : ''}</div>
            <div>Tổng tiền: <b>{d.total.toLocaleString('vi-VN')}</b></div>
            <div title="Người lập, thời gian lập; cập nhật gần nhất">Lập: <b>{d.createdBy || '—'}</b> lúc {dateTime(d.createdAt)} · Cập nhật {dateTime(d.updatedAt)}</div>
            {Object.entries(d.meta).map(([k, v]) => <div key={k} title="Thông tin thêm của chứng từ">{META_TEXT[k] ?? k}: <b>{metaText(v)}</b></div>)}
          </div>

          <section>
            <h3 style={{ margin: '0 0 6px', fontSize: 14 }} title="Mỗi lần nội dung chứng từ đổi lưu một ảnh chụp; đổi trạng thái không tính">Phiên bản ({q.data.versions.length})</h3>
            <table className="grid full" style={{ width: '100%' }}><thead><tr><th title="Số phiên bản">Bản</th><th title="Người lưu phiên bản">Người lưu</th><th title="Thời điểm lưu">Lúc</th><th title="Băm nội dung — đổi một chữ là đổi băm">Băm nội dung</th></tr></thead>
              <tbody>{q.data.versions.map((v) => <tr key={v.version}><td>{v.version}</td><td>{v.createdBy}</td><td>{dateTime(v.createdAt)}</td><td className="mono muted">{v.contentHash.slice(0, 12)}…</td></tr>)}</tbody></table>
          </section>

          <section>
            <h3 style={{ margin: '0 0 6px', fontSize: 14 }} title="Chứng từ nguồn, chứng từ lập tiếp từ phiếu này, sự việc kế toán đã sinh">Chứng từ liên quan ({q.data.links.length})</h3>
            {!q.data.links.length ? <div className="muted">Chưa có.</div> : (
              <table className="grid full" style={{ width: '100%' }}><thead><tr><th title="Quan hệ với phiếu đang xem">Quan hệ</th><th title="Chứng từ / sự việc kế toán liên quan">Chứng từ</th><th title="Thời điểm gắn liên kết">Lúc</th></tr></thead>
                <tbody>{q.data.links.map((l) => {
                  const t = linkText(l, d.docRef);
                  const other = l.from === d.docRef ? l.to : l.from;
                  return <tr key={`${l.from}|${l.to}|${l.role}`}><td>{t.text}</td>
                    <td className="mono">{other.startsWith('ledger.event:') ? t.other : <button className="link" onClick={() => onOpen(other)} title="Mở chứng từ này">{t.other}</button>}</td>
                    <td>{dateTime(l.createdAt)}</td></tr>;
                })}</tbody></table>
            )}
          </section>

          <section>
            <h3 style={{ margin: '0 0 6px', fontSize: 14 }} title="Tệp đính kèm chung của chứng từ">Đính kèm ({q.data.files.length})</h3>
            {!q.data.files.length ? <div className="muted">Chưa có tệp.</div> : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>{q.data.files.map((f) => <li key={f.id}><a href={`/api/v1/document-attachments/${f.id}/file`}>{f.fileName}</a> <span className="muted">· {f.kind} · {(f.sizeBytes / 1024).toFixed(0)} KB · {f.createdBy}</span></li>)}</ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

const SCT_CSS = '.sct-head > div { flex: 1 1 300px; min-width: 0; }';

export function SoChungTuPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCode: '', docType: '', q: '' });
  const [open, setOpen] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const q = useQuery({
    queryKey: ['business-documents', f, tab],
    queryFn: () => api.get<{ items: Doc[]; counts: Partial<Record<Status, number>> }>('/api/v1/business-documents', {
      from: f.from, to: f.to, ...(f.branchCode ? { branchCode: f.branchCode } : {}), ...(f.docType ? { docType: f.docType } : {}),
      ...(f.q.trim() ? { q: f.q.trim() } : {}), ...(tab !== 'all' ? { status: tab } : {}), limit: 1000,
    }),
    placeholderData: keepPreviousData,
  });
  const rows = q.data?.items ?? [];
  const counts = q.data?.counts ?? {};
  const all = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  const tabText = (s: Status) => `${STATUS_TEXT[s]} (${counts[s] ?? 0})`;

  const columns: Column<Doc>[] = [
    { key: 'docDate', header: 'Ngày', type: 'date', title: 'Ngày chứng từ' },
    { key: 'docNo', header: 'Số', type: 'code', title: 'Số chứng từ', render: (r) => <>{r.docNo || '—'}{r.version > 1 ? <span className="muted" title="Số phiên bản nội dung"> (v{r.version})</span> : null}</> },
    { key: 'title', header: 'Loại chứng từ', title: 'Loại chứng từ' },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', title: 'Chi nhánh lập / chi nhánh xuất' },
    { key: 'partnerRef', header: 'Mã đối tượng', type: 'code', title: 'Mã nhà cung cấp / khách hàng / đối tượng' },
    { key: 'partnerName', header: 'Tên đối tượng', title: 'Tên nhà cung cấp / khách hàng / đối tượng' },
    { key: 'total', header: 'Tổng tiền', type: 'money', sum: true, title: 'Tổng tiền của chứng từ' },
    { key: 'status', header: 'Trạng thái', title: 'Trạng thái chuẩn (trong ngoặc: trạng thái riêng của phân hệ)', value: (r) => STATUS_TEXT[r.status],
      render: (r) => <span className={STATUS_CLASS[r.status]} title={r.statusRaw}>{STATUS_TEXT[r.status]}</span> },
    { key: 'createdBy', header: 'Người lập', title: 'Người lập chứng từ' },
    { key: 'updatedAt', header: 'Cập nhật', title: 'Thời điểm cập nhật gần nhất', value: (r) => dateTime(r.updatedAt) },
  ];

  return (
    <>
      <PageHeader title="Sổ chứng từ" code="HT18" helpKey="so-chung-tu"
        subtitle="Mọi chứng từ nghiệp vụ ở một chỗ: đơn đặt, phiếu nhập, chuyển kho, đề nghị thanh toán… theo trạng thái; bấm một dòng xem phiên bản và chứng từ liên quan" />
      <FilterLayout
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect multiple={false} value={f.branchCode} onChange={(branchCode) => set({ branchCode })} />
            <label className="field" title="Loại chứng từ">Loại chứng từ
              <select value={f.docType} onChange={(e) => set({ docType: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <label className="field" title="Tìm theo số chứng từ hoặc mã đối tượng">Tìm số / đối tượng
              <input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="vd DDH-2026, NCC001" />
            </label>
          </>
        }
      >
        <div className="card">
          <FormTabs<Tab>
            tabs={[['all', `Tất cả (${all})`], ['draft', tabText('draft')], ['pending', tabText('pending')], ['approved', tabText('approved')], ['done', tabText('done')], ['cancelled', tabText('cancelled')]]}
            value={tab} onChange={setTab}
          />
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !rows.length ? <Empty text="Không có chứng từ nào trong kỳ theo bộ lọc này" /> : (
            <DataGrid storageKey="ht18-so-chung-tu" rows={rows} rowKey={(r) => r.docRef} onRowClick={(r) => setOpen(r.docRef)} columns={columns} exportName={`HT18-so-chung-tu-${f.from}-${f.to}`} />
          )}
        </div>
      </FilterLayout>
      {open && <ChiTiet key={open} docRef={open} onClose={() => setOpen(null)} onOpen={setOpen} />}
    </>
  );
}
