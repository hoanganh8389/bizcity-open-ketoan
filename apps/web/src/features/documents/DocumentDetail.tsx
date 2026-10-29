/**
 * Xem chứng từ gốc ở trạm định khoản (ACC14): nội dung MỚI NHẤT của chứng từ, trạng thái định khoản, nút "Định khoản" /
 * "Định khoản lại" riêng chứng từ này, bút toán (kể cả bút toán đã đảo bằng ghi số âm) và nhật ký định khoản.
 * Không sửa bút toán ở đây: chứng từ sai thì sửa ở hệ thống bán hàng (lên phiên bản mới), rồi định khoản lại theo trình tự.
 * Ba thẻ: "Chứng từ" (mặc định — form phiếu có dòng hàng: bán, hoàn, mua, trả NCC, chuyển kho, điều chỉnh, xuất điều chỉnh;
 * chứng từ khác: thông tin phiếu), "Bút toán" (Nợ / Có, kể cả bút toán đã đảo), "Nhật ký định khoản".
 * Bấm một dòng ở sổ nhật ký chung, sổ cái, sổ chi tiết… mở thẳng modal này (EntryOpen), ai cần Nợ / Có thì bấm thẻ Bút toán.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, RefreshCcw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ACTION_TEXT, statusText, type LogRow } from './DocumentsPage';
import { PostingPreview } from './PostingPreview';
import { DOC_TYPE_LABELS, type DocType } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { date, dateTime, money } from '@/lib/format';
import { Drawer, ErrorBox, Loading, Money, StatusBadge } from '@/components/ui';
import { type EntryLine } from '../ledger/EntryLinesTable';
import { EntryLinesById } from '../ledger/EntryDetailGrid';
import { canOpenSource, openSource } from '@/lib/sourceDoc';
import { FORM_DOC_TYPES, SaleDocumentForm, type FormDocType, type LinkedPayment, type Offset, type OffsetBy } from './SaleDocumentForm';
import { FormTabs } from '@/components/FormBlocks';

interface DocDetail {
  id: string;
  docKey: string;
  sourceSystem: string;
  cancelRequestedAt?: string | null;
  /** Phiếu chuyển tiền: kế toán xác nhận nơi nhận đã nhận tiền (valid = còn khớp nội dung mới nhất). */
  receiptConfirmation?: { amount: number; toBranchCode: string; toBankCode: string; note: string; confirmedBy: string; confirmedAt: string; valid: boolean } | null;
  cancelReason?: string | null;
  linkedPayments?: LinkedPayment[];
  offsets?: Offset[];
  offsetBy?: OffsetBy[];
  /** Phiếu thanh toán: hoá đơn mà phiếu này thanh toán. */
  linkedInvoices?: { id: string | null; docKey: string; docNo: string | null; docDate: string | null; docType: string | null; invoiceNo: string | null; total: number | null; status: string | null; amount: number }[];
  version: number;
  docType: DocType;
  docNo: string;
  docDate: string;
  invoiceNo: string | null;
  total: number;
  status: string;
  postedVersion: number | null;
  errorMessage: string | null;
  branch: { code: string; name: string } | null;
  payload: any;
  receivedAt: string;
  postedAt: string | null;
  entries: { id: string; entryNo: string; postingDate: string; status: string; isReversal: boolean; description: string; total: number; sourceVersion: number; lines: EntryLine[] }[];
}

export function DocumentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['document', id], queryFn: () => api.get<DocDetail>(`/api/v1/documents/${id}`) });
  const log = useQuery({ queryKey: ['posting-log', 'doc', id], queryFn: () => api.get<LogRow[]>(`/api/v1/documents/${id}/posting-log`) });
  const qc = useQueryClient();
  // Chứng từ liên quan đang mở chồng lên (hoá đơn ↔ phiếu thanh toán ↔ đối trừ).
  const [subId, setSubId] = useState<string | null>(null);
  const [tab, setTab] = useState<'doc' | 'entries' | 'log'>('doc');
  const canPost = useAuth().can('documents:write');
  const post = useMutation({
    mutationFn: (repost: boolean) => api.post<{ posted: number; unchanged?: number; skipped: { message: string }[]; errors: { message: string }[] }>('/api/v1/documents/post', { ids: [id], repost }),
    onSettled: () => { void qc.invalidateQueries(); },
  });
  // Phiếu chuyển tiền: kế toán xác nhận / bỏ xác nhận nơi nhận đã nhận tiền (định khoản ngay phía nơi nhận).
  const receipt = useMutation({
    mutationFn: (confirm: boolean) => (confirm ? api.post(`/api/v1/documents/${id}/confirm-receipt`, {}) : api.delete(`/api/v1/documents/${id}/confirm-receipt`)),
    onSettled: () => { void qc.invalidateQueries(); },
  });
  const postResult = post.data
    ? (post.data.posted ? 'Đã ghi vào sổ nhật ký chung.'
      : post.data.unchanged ? 'Không có thay đổi — bút toán dựng lại giống hệt bút toán đang có hiệu lực, giữ nguyên (không ghi số âm).'
      : [...post.data.skipped, ...post.data.errors].map((x) => x.message).join('; '))
    : null;
  const d = q.data;
  const p = d?.payload ?? {};
  /** Chứng từ lập trong phần mềm (phiếu thu chi, báo nợ có, phiếu kế toán, số dư đầu, kết chuyển): không có dòng hàng. */
  const isVoucher = d ? !FORM_DOC_TYPES.includes(d.docType) : false;
  const entries = d?.entries.filter((e) => e.status === 'posted' && !e.isReversal) ?? [];
  // Phiếu kho: giá trị từng mặt hàng đã ghi sổ (sau tính giá vốn) — lấy theo bút toán còn hiệu lực có giá trị lớn nhất
  // (phiếu chuyển kho cả cặp có hai bút toán bằng nhau ở hai đầu).
  const valueBySku = new Map<string, number>();
  for (const e of entries) {
    const per = new Map<string, number>();
    for (const l of e.lines) if (l.productSku && l.debit > 0) per.set(l.productSku, (per.get(l.productSku) ?? 0) + l.debit);
    for (const [k, v] of per) valueBySku.set(k, Math.max(valueBySku.get(k) ?? 0, v));
  }

  return (
    <Drawer
      title={d ? `${d.docType === 'sale' ? (p.extra?.exportAdjust ? (p.sourceRef?.label ?? 'Phiếu xuất điều chỉnh') : 'Hóa đơn bán lẻ') : d.docType === 'sale_return' ? 'Hàng bán trả lại' : DOC_TYPE_LABELS[d.docType] ?? d.docType} ${d.docNo}` : 'Chứng từ'}
      onClose={onClose}
    >
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {d && (
        <>
          {/* Trạng thái định khoản + nút định khoản riêng chứng từ này */}
          <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <b>{statusText(d)}</b>
            <span className="muted">phiên bản {d.version}{d.postedVersion ? ` · sổ theo phiên bản ${d.postedVersion}` : ''}</span>
            <span className="spacer" />
            {d.status !== 'cancelled' && d.status !== 'posted' && <button className="btn btn-sm btn-primary" disabled={!canPost || post.isPending} onClick={() => window.confirm(d.cancelRequestedAt ? 'Phiếu đã xoá ở hệ thống nguồn. Huỷ chứng từ này (ghi số âm các bút toán đang có)?' : 'Định khoản chứng từ này vào sổ nhật ký chung?') && post.mutate(false)}><CheckCheck size={14} /> {d.cancelRequestedAt ? 'Định khoản huỷ' : 'Định khoản'}</button>}
            {d.status === 'posted' && <button className="btn btn-sm" disabled={!canPost || post.isPending} onClick={() => window.confirm('Định khoản lại chứng từ này theo cấu hình hiện tại?\nBút toán nào thay đổi thì ghi số âm để đảo rồi ghi bút toán mới; bút toán không đổi giữ nguyên.') && post.mutate(true)}><RefreshCcw size={14} /> Định khoản lại</button>}
          </div>
          {postResult && <div className={post.data?.posted ? 'alert alert-ok' : 'alert alert-warn'} style={{ marginBottom: 8 }}>{postResult}</div>}
          {post.error && <div className="alert alert-bad" style={{ marginBottom: 8 }}>{errorText(post.error)}</div>}
          {d.status === 'error' && <div className="alert alert-bad" style={{ marginBottom: 12 }}>{d.errorMessage} — sửa cấu hình rồi bấm Định khoản.</div>}
          {d.status !== 'cancelled' && d.sourceSystem !== 'manual' && <PostingPreview key={`${d.status}-${d.version}`} id={id} version={d.version} auto={d.status !== 'posted'} docLabel={p.extra?.exportAdjust ? (p.sourceRef?.label ?? 'Phiếu xuất điều chỉnh') : undefined} />}
          <FormTabs tabs={[['doc', 'Chứng từ'], ['entries', `Bút toán (${d.entries.length})`], ['log', 'Nhật ký định khoản']]} value={tab} onChange={setTab} />
          <div style={{ marginTop: 6 }}>
          {tab === 'doc' && <>
          {d.status === 'cancelled' && <div className="alert alert-warn" style={{ marginBottom: 12 }}>Chứng từ đã huỷ.</div>}
          {!isVoucher && <SaleDocumentForm docType={d.docType as FormDocType} docNo={d.docNo} docDate={d.docDate} branch={d.branch} p={p} linkedPayments={d.linkedPayments} offsets={d.offsets} offsetBy={d.offsetBy} onOpenDoc={setSubId} valueBySku={valueBySku} />}
          {isVoucher && <dl className="kv">
            <dt>Trạng thái</dt><dd><StatusBadge status={d.status} /></dd>
            <dt>Ngày chứng từ</dt><dd>{date(d.docDate)}</dd>
            <dt>Chi nhánh</dt><dd>{d.branch ? `${d.branch.code} — ${d.branch.name}` : ''}</dd>
            {d.docType === 'cash_transfer' ? (
              <>
                <dt>Chuyển từ</dt><dd>{p.branchCode} · {p.fromBankCode ? `ngân hàng ${p.fromBankCode}` : `hình thức ${p.fromMethodCode ?? 'TM'}`}{p.reasonCode ? ` · lý do chi ${p.reasonCode}` : ''}</dd>
                <dt>Chuyển đến</dt><dd>{p.toBranchCode} · {p.toBankCode ? `ngân hàng ${p.toBankCode}` : `hình thức ${p.toMethodCode ?? 'TM'}`}{p.toReasonCode ? ` · lý do thu ${p.toReasonCode}` : ''}</dd>
                <dt>Số tiền</dt><dd><Money value={d.total} /></dd>
                <dt>Nơi nhận</dt>
                <dd>
                  {p.status === 'received' || p.toBranchCode === p.branchCode ? 'Hệ thống nguồn đã báo nhận tiền'
                    : d.receiptConfirmation?.valid ? `Kế toán đã xác nhận nhận tiền — ${d.receiptConfirmation.confirmedBy}, ${dateTime(d.receiptConfirmation.confirmedAt)}`
                    : d.receiptConfirmation ? 'Xác nhận cũ không còn hiệu lực (phiếu đã đổi số tiền / nơi nhận / ngân hàng) — cần xác nhận lại'
                    : 'Chưa xác nhận (tiền đang chuyển, tài khoản 11319)'}
                  {p.status === 'sent' && p.toBranchCode !== p.branchCode && d.status !== 'cancelled' && !d.cancelRequestedAt && (
                    <span style={{ marginLeft: 8 }}>
                      {!d.receiptConfirmation?.valid
                        ? <button className="btn btn-sm btn-primary" disabled={!canPost || receipt.isPending} onClick={() => window.confirm(`Xác nhận chi nhánh ${p.toBranchCode} ĐÃ NHẬN ${money(d.total)}?\nĐã đối chiếu quỹ / sao kê ngân hàng nơi nhận. Phần mềm sẽ ghi bút toán nơi nhận.`) && receipt.mutate(true)}><CheckCheck size={14} /> Xác nhận đã nhận tiền</button>
                        : <button className="btn btn-sm" disabled={!canPost || receipt.isPending} onClick={() => window.confirm('Bỏ xác nhận đã nhận tiền? Bút toán nơi nhận sẽ bị ghi số âm.') && receipt.mutate(false)}>Bỏ xác nhận</button>}
                    </span>
                  )}
                  {receipt.error && <div className="alert alert-bad" style={{ marginTop: 6 }}>{errorText(receipt.error)}</div>}
                </dd>
                <dt>Diễn giải</dt><dd>{p.description}</dd>
              </>
            ) : isVoucher ? (
              <>
                <dt>Diễn giải</dt><dd>{p.description}</dd>
                {p.methodCode && <><dt>Hình thức</dt><dd>{p.methodLabel ? `${p.methodLabel} (${p.methodCode})` : p.methodCode}</dd></>}
                <dt>Người nộp / nhận</dt><dd>{p.counterparty}</dd>
                <dt>Đối tượng công nợ</dt><dd>{p.partnerCode ?? ''}</dd>
                <dt>Chứng từ kèm theo</dt><dd>{p.reference}</dd>
              </>
            ) : (
              <>
                <dt>Đối tượng</dt><dd>{p.partner ? `${p.partner.code} — ${p.partner.name}` : 'Khách lẻ'}</dd>
                <dt>Hoá đơn</dt><dd>{p.invoice ? `${p.invoice.form}/${p.invoice.serial} số ${p.invoice.no} ngày ${date(p.invoice.date)}` : 'Không có'}</dd>
              </>
            )}
            <dt>Mã chứng từ nguồn</dt><dd className="mono">{d.docKey} · phiên bản {d.version}
              {canOpenSource(d.docKey) && <button type="button" className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => openSource(d.docKey)}>Mở phiếu nhập kho (xem, sửa)</button>}</dd>
            <dt>Nhận lúc</dt><dd>{dateTime(d.receivedAt)}{d.postedAt ? ` · ghi sổ ${dateTime(d.postedAt)}` : ''}</dd>
          </dl>}

          {(d.linkedInvoices ?? []).length > 0 && (
            <>
              <h3 style={{ fontSize: 14, margin: '6px 0 8px' }}>Thanh toán cho {d.docType === 'supplier_payment' ? 'chứng từ' : 'hoá đơn'}</h3>
              <div className="card" style={{ marginBottom: 14 }}>
                <table className="grid">
                  <thead><tr><th>Loại</th><th>Số phiếu</th><th>Ngày</th><th>Số hoá đơn</th><th className="num">Tổng phiếu</th><th className="num">Phiếu này thanh toán</th><th>Trạng thái phiếu</th></tr></thead>
                  <tbody>
                    {d.linkedInvoices!.map((x, i) => (
                      <tr key={i} className={x.id ? 'clickable' : ''} onClick={() => x.id && setSubId(x.id)} title={x.id ? 'Bấm để mở phiếu' : 'Phiếu chưa có trong phần mềm kế toán'}>
                        <td>{x.docType === 'sale' ? 'Hoá đơn bán hàng' : x.docType === 'sale_return' ? 'Hàng bán trả lại' : x.docType ? DOC_TYPE_LABELS[x.docType as DocType] ?? x.docType : '—'}</td>
                        <td className="mono">{x.id ? <u>{x.docNo}</u> : <span className="muted">{x.docKey}</span>}</td>
                        <td>{x.docDate ? date(x.docDate) : ''}</td>
                        <td className="mono">{x.invoiceNo ?? ''}</td>
                        <td className="num">{x.total !== null ? <Money value={x.total} /> : ''}</td>
                        <td className="num"><Money value={x.amount} /></td>
                        <td>{x.status ? <StatusBadge status={x.status} /> : <span className="text-warn">Chưa nhận</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {isVoucher && (p.payments ?? []).length > 0 && (
            <>
              <h3 style={{ fontSize: 14, margin: '6px 0 8px' }}>Thanh toán</h3>
              <div className="card" style={{ marginBottom: 14 }}>
                <table className="grid">
                  <thead><tr><th>Hình thức</th><th>Tham chiếu</th><th className="num">Số tiền</th></tr></thead>
                  <tbody>{p.payments.map((x: any, i: number) => <tr key={i}><td>{x.methodCode}</td><td>{x.reference}</td><td className="num"><Money value={x.amount} /></td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}

          </>}

          {tab === 'entries' && <>
          <div className="muted" style={{ margin: '2px 0 8px', fontSize: 12 }}>Kể cả bút toán đã đảo (ghi số âm) của các phiên bản trước.</div>
          {d.entries.length === 0 && (
            <div className="muted">
              {d.status === 'posted'
                // Đã định khoản mà 0 bút toán: phiếu không có giá trị (chuyển kho, điều chỉnh chưa có giá) — chỉ ghi thẻ kho;
                // giá trị theo giá vốn vào phiếu "Giá vốn hàng xuất" tháng khi tính giá vốn (ACC49).
                ? 'Phiếu không có giá trị nên không có bút toán — hàng đã ghi vào thẻ kho; giá trị theo giá vốn nằm trong phiếu giá vốn tháng khi tính giá vốn (ACC49).'
                : 'Chưa có bút toán — chứng từ chưa định khoản.'}
            </div>
          )}
          {d.entries.map((e) => (
            <div key={e.id} className="card" style={{ marginBottom: 12 }}>
              <div className="card-body row" style={{ paddingBottom: 8 }}>
                <span className="mono">{e.entryNo}</span>
                {e.isReversal ? <span className="badge badge-warn">Ghi số âm</span> : <StatusBadge status={e.status} />}
                <span className="muted">phiên bản {e.sourceVersion}</span>
                <span className="spacer" />
                <span className="muted">{date(e.postingDate)}</span>
              </div>
              {/* Đủ cột như "Thông tin hạch toán chi tiết" / sổ nhật ký chung: bộ phận, mã hàng, tên hàng, nhân viên, KH/NCC… */}
              <EntryLinesById id={e.id} />
            </div>
          ))}

          </>}

          {tab === 'log' && ((log.data ?? []).length === 0 ? <div className="muted">Chưa có.</div> : (
            <table className="grid">
              <thead><tr><th>Thời gian</th><th>Hành động</th><th>Phiên bản</th><th>Bút toán ghi</th><th className="num">Đảo</th><th className="num">Tổng tiền</th><th>Người làm</th><th>Ghi chú</th></tr></thead>
              <tbody>
                {log.data!.map((x) => (
                  <tr key={x.id}>
                    <td>{dateTime(x.createdAt)}</td><td className={x.action === 'error' ? 'text-bad' : undefined}>{ACTION_TEXT[x.action]}</td><td className="num">{x.version}</td>
                    <td className="mono">{x.entryNos.join(', ')}</td><td className="num">{x.reversed || ''}</td><td className="num">{x.total !== null ? money(x.total) : ''}</td><td>{x.actorName}</td><td>{x.message ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          </div>
        </>
      )}
      {subId && <DocumentDetail id={subId} onClose={() => setSubId(null)} />}
    </Drawer>
  );
}
