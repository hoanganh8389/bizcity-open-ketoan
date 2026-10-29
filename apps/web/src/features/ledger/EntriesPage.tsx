/**
 * Bút toán sổ cái: tra theo bộ sổ, ngày, chi nhánh, tài khoản, số chứng từ.
 */
import { useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DOC_TYPE_LABELS, type DocType } from '@ketoan/contracts';
import { api, errorText, ALL_ROWS } from '@/lib/api';
import { date, dateTime, defaultFrom, defaultTo } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Drawer, Empty, ErrorBox, Loading, Money, StatusBadge } from '@/components/ui';
import { Field, GroupBox } from '@/components/FormBlocks';
import { type EntryLine } from './EntryLinesTable';
import { DocumentDetail } from '../documents/DocumentDetail';
import { EntryDetailGrid, type DetailLine } from './EntryDetailGrid';
import { FORM_DOC_TYPES } from '../documents/SaleDocumentForm';
import { ACTION_TEXT, type LogRow } from '../documents/DocumentsPage';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker } from '@/components/pickers';

interface EntryRow {
  id: string;
  entryNo: string;
  docType: DocType;
  docNo: string;
  invoiceNo: string | null;
  postingDate: string;
  description: string;
  total: number;
  status: string;
  isReversal: boolean;
  sourceDocumentId: string | null;
  branchCode: string;
  partnerName: string | null;
}

interface EntryLink { type: string; reason: string; createdAt: string; entryId: string; entryNo: string; docType: string; docNo: string; postingDate: string; total: number }
const LINK_LABEL: Record<string, [string, string]> = {
  // [nhãn khi bút toán này trỏ tới gốc, nhãn khi bút toán khác trỏ tới bút toán này]
  reversal: ['Đảo (ghi số âm) bút toán', 'Đã bị đảo bởi bút toán'],
  return: ['Trả lại hàng của bút toán', 'Có hàng trả lại ở bút toán'],
  adjustment: ['Điều chỉnh bút toán', 'Được điều chỉnh bởi bút toán'],
  gift: ['Quà tặng kèm bút toán', 'Có quà tặng ở bút toán'],
  replacement: ['Thay thế bút toán', 'Được thay thế bởi bút toán'],
};

/** Dòng định khoản trong form chi tiết: mỗi dòng một tài khoản, một bên Nợ hoặc Có. */

/**
 * Thông tin hạch toán chi tiết: phần đầu là thông tin chứng từ hạch toán (Ngày lập, Ngày chứng từ, Loại chứng từ;
 * Chi nhánh, Số chứng từ, User lập; Lý do, Diễn giải), bên dưới là bảng dòng hạch toán chi tiết.
 */
/**
 * Chứng từ mở thẳng chứng từ gốc khi bấm một dòng sổ: phiếu có dòng hàng (bán, hoàn, mua, trả NCC, chuyển kho, điều chỉnh,
 * xuất điều chỉnh) và phiếu thanh toán / chuyển tiền từ hệ thống kết nối.
 */
const OPEN_SOURCE = new Set([...FORM_DOC_TYPES, 'customer_payment', 'supplier_payment', 'cash_transfer']);

/**
 * Bấm một dòng ở sổ nhật ký chung, sổ cái, sổ chi tiết, nhật ký thu / bán / mua…: chứng từ có chứng từ gốc thì mở
 * THẲNG modal chứng từ gốc (thẻ "Bút toán" trong đó để xem Nợ / Có); bút toán khác (phiếu kế toán, giá vốn tháng,
 * khấu hao, kết chuyển…) mở "Thông tin hạch toán chi tiết" như cũ.
 */
export function EntryOpen({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['entry', id], queryFn: () => api.get<any>(`/api/v1/ledger/entries/${id}`) });
  if (!q.data) return <Drawer title="Chứng từ" onClose={onClose}>{q.isLoading ? <Loading /> : <ErrorBox error={q.error ? errorText(q.error) : null} />}</Drawer>;
  if (q.data.sourceDocumentId && OPEN_SOURCE.has(q.data.docType)) return <DocumentDetail id={String(q.data.sourceDocumentId)} onClose={onClose} />;
  return <EntryDetail id={id} onClose={onClose} />;
}

export function EntryDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['entry', id], queryFn: () => api.get<any>(`/api/v1/ledger/entries/${id}`) });
  const [docId, setDocId] = useState<string | null>(null);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const e = q.data;
  // Lịch sử thay đổi của chứng từ gốc: mọi bút toán đã ghi (kể cả đã đảo, ghi số âm) theo phiên bản, và nhật ký định khoản.
  const doc = useQuery({ queryKey: ['document', e?.sourceDocumentId], enabled: history && Boolean(e?.sourceDocumentId),
    queryFn: () => api.get<{ version: number; postedVersion: number | null; entries: { id: string; entryNo: string; postingDate: string; status: string; isReversal: boolean; total: number; sourceVersion: number; description: string }[] }>(`/api/v1/documents/${e.sourceDocumentId}`) });
  const log = useQuery({ queryKey: ['posting-log', 'doc', e?.sourceDocumentId], enabled: history && Boolean(e?.sourceDocumentId),
    queryFn: () => api.get<LogRow[]>(`/api/v1/documents/${e.sourceDocumentId}/posting-log`) });
  const field = (label: string, value: ReactNode, span?: number) => <Field label={label} labelWidth={96} align="right" span={span}>{value}</Field>;
  return (
    <Drawer
      title="Thông tin hạch toán chi tiết"
      onClose={onClose}
      actions={
        <>
          {e?.sourceDocumentId && <button className={`btn btn-sm${history ? ' btn-primary' : ''}`} onClick={() => setHistory((x) => !x)}>Lịch sử thay đổi</button>}
          {e?.sourceDocumentId && <button className="btn btn-sm" onClick={() => setDocId(e.sourceDocumentId)}>Chứng từ gốc</button>}
          <button className="btn btn-sm" onClick={() => q.refetch()}>Nạp</button>
        </>
      }
    >
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {e && (
        <>
          {/* Bút toán đảo (ghi số âm) hoặc bút toán đã bị sửa: báo một dòng, phần còn lại giữ đúng form. */}
          {(e.isReversal || e.status !== 'posted') && (
            <div className="alert alert-warn" style={{ marginBottom: 8 }}>
              {e.isReversal ? 'Bút toán ghi số âm (đảo bút toán đã sửa / huỷ).' : 'Bút toán này đã bị sửa / huỷ, không còn hiệu lực.'}
            </div>
          )}
          <GroupBox title="Thông tin chứng từ hạch toán" style={{ marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '4px 12px', alignItems: 'center' }}>
              {field('Ngày lập', date(e.postingDate))}
              {field('Ngày chứng từ', date(e.docDate))}
              {field('Loại chứng từ', DOC_TYPE_LABELS[e.docType as DocType] ?? e.docType)}
              {field('Chi nhánh', e.branch.code)}
              {field('Số chứng từ', <span className="mono">{e.docNo}</span>)}
              {field('User lập', <span title={`${e.createdBy} · ${dateTime(e.createdAt)}`}>{e.createdByName ?? e.createdBy}</span>)}
              {field('Lý do', e.reasonCode ?? '')}
              {field('Diễn giải', e.description, 2)}
            </div>
          </GroupBox>
          <EntryDetailGrid lines={e.lines as DetailLine[]} />
          {(e.links.length > 0 || e.linkedBy.length > 0) && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-body" style={{ paddingBottom: 4 }}><b>Liên kết bút toán</b></div>
              <table className="grid">
                <thead><tr><th>Quan hệ</th><th>Số bút toán</th><th>Chứng từ</th><th>Ngày</th><th className="num">Tổng tiền</th><th>Ghi chú</th></tr></thead>
                <tbody>
                  {[...(e.links as EntryLink[]).map((l) => ({ l, label: LINK_LABEL[l.type]?.[0] ?? l.type })), ...(e.linkedBy as EntryLink[]).map((l) => ({ l, label: LINK_LABEL[l.type]?.[1] ?? l.type }))].map(({ l, label }) => (
                    <tr key={`${label}-${l.entryId}`} className="clickable" onClick={() => setLinkedId(l.entryId)}>
                      <td>{label}</td><td className="mono">{l.entryNo}</td>
                      <td>{DOC_TYPE_LABELS[l.docType as DocType] ?? l.docType} <span className="mono">{l.docNo}</span></td>
                      <td>{date(l.postingDate)}</td><td className="num"><Money value={l.total} blankZero={false} /></td><td className="muted">{l.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {history && e?.sourceDocumentId && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-body" style={{ paddingBottom: 4 }}>
            <b>Lịch sử thay đổi của chứng từ {e.docNo}</b>
            {doc.data && <span className="muted"> · chứng từ đang ở phiên bản {doc.data.version}{doc.data.postedVersion ? `, sổ theo phiên bản ${doc.data.postedVersion}` : ', chưa định khoản'}</span>}
          </div>
          {(doc.isLoading || log.isLoading) && <Loading />}
          {doc.data && (
            <table className="grid">
              <thead><tr><th>Số bút toán</th><th>Phiên bản</th><th>Ngày ghi sổ</th><th>Trạng thái</th><th className="num">Tổng tiền</th><th>Diễn giải</th></tr></thead>
              <tbody>
                {doc.data.entries.map((x) => (
                  <tr key={x.id} className="clickable" onClick={() => x.id !== id && setLinkedId(x.id)} style={x.id === id ? { background: 'var(--row-selected, #eaf3fb)' } : undefined}>
                    <td className="mono">{x.entryNo}{x.id === id && <span className="muted"> (đang xem)</span>}</td>
                    <td className="num">{x.sourceVersion}</td>
                    <td>{date(x.postingDate)}</td>
                    <td>{x.isReversal ? <span className="badge badge-warn">Ghi số âm</span> : x.status === 'posted' ? <span className="badge badge-ok">Đang hiệu lực</span> : <span className="badge badge-gray">Đã đảo</span>}</td>
                    <td className="num"><Money value={x.total} blankZero={false} /></td>
                    <td className="muted">{x.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {log.data && log.data.length > 0 && (
            <>
              <div className="card-body" style={{ padding: '10px 12px 4px' }}><b>Nhật ký định khoản</b></div>
              <table className="grid">
                <thead><tr><th>Thời gian</th><th>Hành động</th><th className="num">Phiên bản</th><th>Bút toán ghi</th><th className="num">Đảo</th><th className="num">Tổng tiền</th><th>Người làm</th><th>Ghi chú</th></tr></thead>
                <tbody>
                  {log.data.map((x) => (
                    <tr key={x.id}>
                      <td>{dateTime(x.createdAt)}</td><td>{ACTION_TEXT[x.action] ?? x.action}</td><td className="num">{x.version}</td>
                      <td className="mono">{x.entryNos.join(', ')}</td><td className="num">{x.reversed || ''}</td>
                      <td className="num">{x.total !== null ? <Money value={x.total} /> : ''}</td><td>{x.actorName}</td><td className="muted">{x.message ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
      {docId && <DocumentDetail id={docId} onClose={() => setDocId(null)} />}
      {linkedId && <EntryDetail id={linkedId} onClose={() => setLinkedId(null)} />}
    </Drawer>
  );
}

export function EntriesPage() {
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '', account: '', search: '', page: 1 });
  const [openId, setOpenId] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch, page: patch.page ?? 1 }));
  const q = useQuery({ queryKey: ['entries', f], queryFn: () => api.getPage<EntryRow[]>('/api/v1/ledger/entries', { ...f, pageSize: ALL_ROWS }), placeholderData: keepPreviousData });
  const rows = q.data?.data ?? [];

  return (
    <>
      <PageHeader title="Chứng từ kế toán" code="ACC3" subtitle="Mọi bút toán đã ghi; sổ cái chỉ thêm, sửa bằng ghi số âm" helpKey="but-toan" />
      <FilterLayout
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <div className="field"><label>Tài khoản</label><AccountPicker className="input w-md" value={f.account} onChange={(account) => set({ account })} placeholder="Tất cả" /></div>
            <div className="field"><label>Số chứng từ / bút toán / HĐ</label><input className="input w-md" value={f.search} onChange={(e) => set({ search: e.target.value })} /></div>
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : rows.length === 0 ? <Empty /> : (
            <DataGrid
                storageKey="acc3"
                rows={rows}
                rowKey={(r) => r.id}
                onRowClick={(r) => setOpenId(r.id)}
                
                columns={[
                  { key: 'postingDate', header: 'Ngày', type: 'date' },
                  { key: 'entryNo', header: 'Số bút toán', type: 'code' },
                  { key: 'docNo', header: 'Số chứng từ', type: 'code' },
                  { key: 'docType', header: 'Loại chứng từ', value: (r) => DOC_TYPE_LABELS[r.docType] ?? r.docType },
                  { key: 'description', header: 'Diễn giải' },
                  { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
                  { key: 'partnerName', header: 'Đối tượng' },
                  { key: 'total', header: 'Số tiền', type: 'money', sum: true },
                  { key: 'status', header: 'Trạng thái', value: (r) => (r.isReversal ? 'Ghi số âm' : r.status), render: (r) => (r.isReversal ? <span className="badge badge-warn">Ghi số âm</span> : <StatusBadge status={r.status} />) },
                ] satisfies Column<EntryRow>[]}
              />
          )}
        </div>
      </FilterLayout>
      {openId && <EntryOpen id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
