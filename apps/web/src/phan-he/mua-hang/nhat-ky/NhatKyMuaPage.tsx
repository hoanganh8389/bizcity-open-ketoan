/**
 * NHẬT KÝ MUA HÀNG (MH10) — dòng thời gian sự kiện của phân hệ: cảnh báo giá / hạn mức / hoá đơn / lô, chính sách đã áp,
 * duyệt ngoại lệ, điều chuyển hạn mức, chạy tính thưởng. Máy chủ ghi mỗi sự kiện một dòng JSON vào
 * DATA_DIR/mua-hang/<tenant>/<yyyy-mm>.jsonl (không cần bảng); nút "Tải file nhật ký" xuất đúng khuôn đó.
 */
import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { PrintButton } from '@/components/print';
import { LOG_TEMPLATES } from '../mauIn/baoCaoMua';
import { P, toJsonl, type LogRow } from '../du-lieu';
import '../mua-hang.css';

const EVENT: Record<string, [string, string]> = {
  price_check: ['Lệch giá mua', 'badge-warn'], limit_check: ['Kiểm hạn mức', 'badge-warn'], invoice_mismatch: ['Đối soát hoá đơn', 'badge-warn'], lot_check: ['Lô / hạn dùng', 'badge-warn'], gift_check: ['Đối chiếu quà', 'badge-warn'],
  variants_saved: ['Cấu hình biến thể', 'badge-info'], policy_applied: ['Chính sách đã áp', 'badge-info'], override_approved: ['Duyệt ngoại lệ', 'badge-bad'], outside_order_approved: ['Nhập ngoài đơn', 'badge-warn'], outside_order_reviewed: ['Rà soát nhập ngoài đơn', 'badge-ok'], limit_transfer: ['Điều chuyển hạn mức', 'badge-info'], rebate_run: ['Tính thưởng', 'badge-ok'],
  cost_allocated: ['Phân bổ chi phí', 'badge-ok'], gift_received: ['Nhận quà', 'badge-ok'], policy_changed: ['Sửa chính sách', 'badge-info'],
  doc_saved: ['Ghi phiếu', 'badge-gray'], doc_submitted: ['Gửi duyệt', 'badge-gray'], doc_approved: ['Duyệt phiếu', 'badge-ok'], doc_unapproved: ['Bỏ duyệt', 'badge-gray'], doc_cancelled: ['Huỷ phiếu', 'badge-gray'], demo_seeded: ['Nạp dữ liệu mẫu', 'badge-gray'], demo_cleared: ['Xoá dữ liệu mẫu', 'badge-gray'], demo_warehouses: ['Thêm kho chi nhánh mẫu', 'badge-gray'],
  invoice_created: ['Thêm hoá đơn NCC', 'badge-info'], invoice_updated: ['Sửa hoá đơn NCC', 'badge-info'], invoice_cancelled: ['Huỷ hoá đơn NCC', 'badge-gray'], invoice_imported: ['Nhập hoá đơn NCC', 'badge-info'],
  invoice_scanned: ['Quét hoá đơn (AI)', 'badge-info'], alias_learned: ['Học mã hàng NCC', 'badge-ok'], alias_deleted: ['Xoá mã đã học', 'badge-gray'],
};
const money = (v: unknown) => Number(v ?? 0).toLocaleString('vi-VN');
/** Mỗi sự kiện thành một câu tiếng Việt cho kế toán đọc. */
function brief(r: LogRow): string {
  const d = r.data as Record<string, any>;
  switch (r.event) {
    case 'doc_saved': return `Ghi phiếu — số tiền ${money(d.payable)}${d.errors || d.warnings ? `, còn ${d.errors ?? 0} lỗi, ${d.warnings ?? 0} cảnh báo` : ''}`;
    case 'doc_submitted': return `Gửi duyệt — số tiền ${money(d.payable)}`;
    case 'doc_approved': return `Duyệt phiếu, đã ghi sổ — số tiền ${money(d.payable)}${Array.isArray(d.ledger) && d.ledger.length ? ` (${d.ledger.join(', ')})` : ''}`;
    case 'doc_unapproved': return `Bỏ duyệt phiếu, huỷ chứng từ kế toán ${Array.isArray(d.cancelled) ? d.cancelled.join(', ') : ''}`;
    case 'doc_cancelled': return 'Huỷ phiếu';
    case 'outside_order_approved': return `Duyệt phiếu nhập NGOÀI ĐƠN (không theo đơn đặt) — lý do: ${d.reason ?? ''} · ${money(d.payable)}`;
    case 'outside_order_reviewed': return `Kế toán rà soát phiếu nhập ngoài đơn${d.note ? ` — ${d.note}` : ''} (lý do nhập: ${d.reason ?? ''})`;
    case 'override_approved': return `Duyệt ngoại lệ — lý do: ${d.reason ?? ''}${Array.isArray(d.credit) ? ` (${d.credit.map((c: any) => `${c.scope} vượt ${money(c.exceeded)}`).join('; ')})` : ''}`;
    case 'limit_check': return d.text ?? `${String(d.scope ?? '')}: nợ sau phiếu ${money(d.after)} / hạn mức ${money(d.limit)}, còn ${money(d.remaining)}`;
    case 'variants_saved': return `Biến thể tách riêng khi phân tích đặt hàng: ${(d.before ?? []).join(', ') || '(không)'} → ${(d.after ?? []).join(', ') || '(không)'}`;
    case 'limit_transfer': return `Chuyển hạn mức nhãn ${d.brand}: ${d.from} → ${d.to}, ${money(d.amount)}`;
    case 'rebate_run': return `Tính thưởng ${d.policy}: doanh số ${money(d.base)} → ${d.rate ? `${d.rate}%` : 'theo giai đoạn'} = ${money(d.amount)}`;
    case 'cost_allocated': return `Phân bổ chi phí ${money(d.amount)} vào phiếu ${d.target} theo ${d.basis === 'qty' ? 'số lượng' : 'giá trị'}`;
    case 'gift_received': return `Nhận ${d.qty} ${d.sku === 'QT-THUNG-SUA' ? 'thùng sữa' : d.sku} quà ${d.source === 'ncc_extra' ? 'ngoài hợp đồng' : 'theo chương trình'}`;
    case 'policy_changed': return `Lưu chính sách ${d.code} — ${d.name ?? ''}`;
    case 'invoice_created': case 'invoice_updated': return `${r.event === 'invoice_created' ? 'Thêm' : 'Sửa'} hoá đơn NCC ${d.partnerCode} · ${money(d.total)} · ${d.lines} dòng${d.unmatched ? `, ${d.unmatched} chưa nhận diện mã` : ''}`;
    case 'invoice_cancelled': return `Huỷ hoá đơn NCC ${d.partnerCode} — lý do: ${d.reason ?? ''}`;
    case 'invoice_imported': return `Nhập hoá đơn NCC ${d.partnerCode} (${d.source}): ghi ${Array.isArray(d.saved) ? d.saved.length : 0}${Array.isArray(d.skipped) && d.skipped.length ? `, bỏ qua ${d.skipped.length}` : ''}`;
    case 'invoice_scanned': return `Quét ${d.fileName}: đọc được ${d.invoices} hoá đơn, ${d.lines} dòng`;
    case 'alias_learned': return `Học ${d.count} cách ghi mã hàng của NCC ${d.partnerCode}${Array.isArray(d.lines) ? `: ${d.lines.slice(0, 3).map((x: any) => `${x.nccName || x.nccSku} → ${x.sku}`).join('; ')}` : ''}`;
    case 'alias_deleted': return `Xoá cách ghi "${d.nccName || d.nccSku}" (${d.nccUnit}) → ${d.sku} của NCC ${d.partnerCode}`;
    case 'demo_seeded': return `Nạp ${d.documents} chứng từ mẫu (${d.errors} lỗi)`;
    case 'demo_cleared': return `Xoá ${d.documents} chứng từ mẫu`;
    case 'demo_warehouses': return `Thêm kho mặc định: ${(d.created as string[]).join(', ')}`;
    default: return d.text ?? '';
  }
}
export function NhatKyMuaPage() {
  // Lọc theo khoảng ngày (máy chủ lọc theo giờ Việt Nam); để trống = toàn bộ.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useQuery({ queryKey: ['mua-hang', 'log', from, to], queryFn: () => api.get<LogRow[]>(`${P}/logs`, { from: from || undefined, to: to || undefined }) });
  const [event, setEvent] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => (q.data ?? []).filter((r) => !event || r.event === event).map((r, i) => ({ ...r, id: `${r.ts}-${i}` })), [q.data, event]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([toJsonl(rows)], { type: 'application/x-ndjson' }));
    const a = document.createElement('a'); a.href = url; a.download = `mua-hang-${from || to ? `${from || 'dau'}_${to || 'nay'}` : new Date().toISOString().slice(0, 7)}.jsonl`; a.click(); URL.revokeObjectURL(url);
  };
  const events = [...new Set((q.data ?? []).map((r) => r.event))];
  return (
    <>
      <PageHeader title="Nhật ký mua hàng" code="MH10" helpKey="mua-hang-nhat-ky"
        actions={<PrintButton screen="MH10" templates={LOG_TEMPLATES} disabled={!q.data}
          getDocs={() => [{ from, to, eventLabel: event ? EVENT[event]?.[0] ?? event : '', rows: rows.map((r) => ({ ts: r.ts, eventLabel: EVENT[r.event]?.[0] ?? r.event, docNo: r.docNo, user: r.user, text: brief(r) })) }]} />}
        subtitle="Ai làm gì, lúc nào: cảnh báo, chính sách đã áp, duyệt ngoại lệ, chuyển hạn mức, tính thưởng — tra lại được" />
      <div className="card">
        <div className="filters">
          <label className="row" style={{ gap: 4, alignItems: 'center' }}>Từ ngày <input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="row" style={{ gap: 4, alignItems: 'center' }}>đến <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
          {(from || to) && <button className="btn btn-sm" onClick={() => { setFrom(''); setTo(''); }} title="Bỏ lọc ngày">× Bỏ lọc ngày</button>}
          <select className="select input" style={{ width: 220 }} value={event} onChange={(e) => setEvent(e.target.value)}><option value="">Mọi sự kiện</option>{events.map((e) => <option key={e} value={e}>{EVENT[e]?.[0] ?? e}</option>)}</select>
          <button className="btn btn-sm" onClick={() => void q.refetch()}>Nạp</button>
          <button className="btn btn-sm" onClick={download} title="Tải toàn bộ nhật ký đang lọc thành một file (mỗi dòng một sự kiện)">Tải file nhật ký</button>
          <span className="muted" style={{ fontSize: 12 }}>{rows.length} dòng · bấm một dòng để xem chi tiết</span>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <div className="table-wrap"><table className="grid"><thead><tr><th style={{ width: 150 }}>Thời điểm</th><th style={{ width: 150 }}>Sự kiện</th><th style={{ width: 110 }}>Chứng từ</th><th style={{ width: 120 }}>Người</th><th>Nội dung</th></tr></thead><tbody>
            {rows.map((r) => (<Fragment key={r.id}>
              <tr onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                <td>{new Date(r.ts).toLocaleString('vi-VN')}</td><td><span className={`badge ${EVENT[r.event]?.[1] ?? 'badge-gray'}`}>{EVENT[r.event]?.[0] ?? r.event}</span></td>
                <td className="mono">{r.docNo}</td><td>{r.user}</td><td style={{ fontSize: 12.5 }}>{brief(r)}</td>
              </tr>
              {open === r.id && <tr><td colSpan={5}><Detail r={r} /></td></tr>}
            </Fragment>))}
          </tbody></table></div>
        )}
      </div>
    </>
  );
}

const LABEL: Record<string, string> = {
  kind: 'Loại phiếu', status: 'Trạng thái', payable: 'Số tiền', errors: 'Số lỗi', warnings: 'Số cảnh báo', level: 'Mức', text: 'Nội dung', policy: 'Chính sách',
  amount: 'Số tiền', scope: 'Phạm vi', after: 'Nợ sau phiếu', limit: 'Hạn mức', remaining: 'Còn lại', brand: 'Nhãn', from: 'Từ', to: 'Sang', reason: 'Lý do',
  base: 'Doanh số', rate: 'Mức thưởng (%)', period: 'Kỳ', basis: 'Tiêu thức', target: 'Phiếu nhập', sku: 'Mã hàng', qty: 'Số lượng', source: 'Nguồn', code: 'Mã',
};
const SKIP = new Set(['lineKey', 'kind', 'before', 'after_', 'detail', 'allocation', 'rule', 'override', 'level', 'code']);
function Detail({ r }: { r: LogRow }) {
  const d = r.data as Record<string, unknown>;
  const rows = Object.entries(d).filter(([k, v]) => !SKIP.has(k) && v !== undefined && v !== null && typeof v !== 'object');
  const ov = d.override as { by?: string; reason?: string } | undefined;
  return (
    <table className="mh-mini" style={{ maxWidth: 640 }}><tbody>
      <tr><td style={{ width: 160 }}>Thời điểm</td><td>{new Date(r.ts).toLocaleString('vi-VN')}</td></tr>
      <tr><td>Người thực hiện</td><td>{r.user}</td></tr>
      {r.docNo && <tr><td>Chứng từ</td><td>{r.docNo}</td></tr>}
      {ov && <tr><td>Duyệt ngoại lệ</td><td>{ov.by} — {ov.reason}</td></tr>}
      {rows.map(([k, v]) => <tr key={k}><td>{LABEL[k] ?? k}</td><td>{typeof v === 'number' && Math.abs(v) >= 1000 ? v.toLocaleString('vi-VN') : String(v)}</td></tr>)}
      {Array.isArray(d.detail) && <tr><td>Cách tính</td><td>{(d.detail as string[]).join(' · ')}</td></tr>}
    </tbody></table>
  );
}
