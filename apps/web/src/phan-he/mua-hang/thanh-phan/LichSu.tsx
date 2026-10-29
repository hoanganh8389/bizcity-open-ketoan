/**
 * LỊCH SỬ THAY ĐỔI ngay trên màn hình: một phiếu (docNo = số phiếu), một chính sách (docNo = mã chính sách) hay mọi việc của
 * một NCC (partnerCode). Mỗi dòng: thời gian, người làm, việc, và ĐỔI GÌ — phiếu: "Tổng tiền 10.000 → 12.000", "Dòng X: SL…";
 * chính sách: nội dung / hiệu lực / trạng thái trước → sau.
 */
import { useQuery } from '@tanstack/react-query';
import { POLICY_LABEL, type Policy } from '@ketoan/contracts/mua-hang';
import { ruleText } from '../chinh-sach/quyTac';
import { purchaseApi, vnd, type LogRow } from '../du-lieu';

export const EVENT_LABEL: Record<string, string> = {
  doc_created: 'Tạo phiếu', doc_saved: 'Sửa phiếu', doc_submitted: 'Gửi duyệt', approved: 'Duyệt (ghi sổ)', doc_approved: 'Duyệt (ghi sổ)', override_approved: 'Duyệt ngoại lệ',
  doc_unapproved: 'Bỏ duyệt', doc_cancelled: 'Huỷ phiếu', policy_created: 'Tạo chính sách', policy_changed: 'Sửa chính sách', policy_deleted: 'Xoá chính sách', attachment_added: 'Gắn tệp',
  limit_transfer: 'Điều chuyển hạn mức', supplier_items: 'Cập nhật mặt hàng NCC', supplier_products: 'Cập nhật mặt hàng & giá mua', price_check: 'Kiểm giá', limit_check: 'Kiểm hạn mức', policy_applied: 'Áp chính sách',
  invoice_created: 'Thêm hoá đơn NCC', invoice_updated: 'Sửa hoá đơn NCC', invoice_cancelled: 'Huỷ hoá đơn NCC', invoice_imported: 'Nhập hoá đơn NCC', invoice_scanned: 'Quét hoá đơn (AI)', alias_learned: 'Học mã hàng NCC', alias_deleted: 'Xoá mã đã học',
};
const dmy = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '…');

/** Dòng giá đã xoá (nhật ký giữ đủ nội dung): mã · ĐVT · giá · hiệu lực · ghi chú. */
type DelRow = { sku?: string; unit?: string; price?: number | null; priceIncludesVat?: boolean; validFrom?: string | null; validTo?: string | null; note?: string; partnerCode?: string | null };
const delRow = (r: DelRow) => {
  const dmy = (x?: string | null) => (x ? x.split('-').reverse().join('/') : '');
  return [`${r.partnerCode ? `${r.partnerCode} · ` : ''}${r.sku ?? ''} · ${r.unit ?? ''}`, r.price !== null && r.price !== undefined ? `${r.price.toLocaleString('vi-VN')}đ (${r.priceIncludesVat ? 'gồm' : 'chưa'} thuế)` : 'chưa có giá',
    r.validFrom || r.validTo ? `hiệu lực${r.validFrom ? ` từ ${dmy(r.validFrom)}` : ''}${r.validTo ? ` đến ${dmy(r.validTo)}` : ''}` : 'không ghi hiệu lực', r.note ? `ghi chú: ${r.note}` : ''].filter(Boolean).join(' · ');
};
type D = { kind?: string; rule?: Record<string, unknown>; scope?: Policy['scope']; isActive?: boolean; validFrom?: string; validTo?: string; name?: string; before?: { name?: string; rule?: Record<string, unknown>; scope?: Policy['scope']; isActive?: boolean; validFrom?: string; validTo?: string }; changes?: string[]; payable?: number; reason?: string; fileName?: string; added?: number; updated?: number; from?: string; to?: string; amount?: number; cancelled?: string[]; rows?: string[]; deleted?: DelRow };

/** Đổi gì của một chính sách: so trước / sau. */
export function policyDiff(d: D): string[] {
  if (!d.before || !d.kind) return [];
  const kind = d.kind as Policy['kind'];
  const out: string[] = [];
  const bt = ruleText({ kind, rule: d.before.rule ?? {}, scope: d.before.scope }), at = ruleText({ kind, rule: d.rule ?? {}, scope: d.scope ?? d.before.scope });
  if (bt !== at) out.push(`Nội dung: ${bt} → ${at}`);
  if ((d.before.validFrom ?? '') !== (d.validFrom ?? '') || (d.before.validTo ?? '') !== (d.validTo ?? '')) out.push(`Hiệu lực: ${dmy(d.before.validFrom)} – ${dmy(d.before.validTo)} → ${dmy(d.validFrom)} – ${dmy(d.validTo)}`);
  if (d.before.isActive !== undefined && d.isActive !== undefined && d.before.isActive !== d.isActive) out.push(`Trạng thái: ${d.before.isActive ? 'Đang áp' : 'Tắt'} → ${d.isActive ? 'Đang áp' : 'Tắt'}`);
  if (JSON.stringify(d.before.scope ?? {}) !== JSON.stringify(d.scope ?? d.before.scope ?? {})) out.push('Đổi phạm vi (NCC / nhãn / mã / chi nhánh)');
  if (d.before.name && d.name && d.before.name !== d.name) out.push(`Tên: ${d.before.name} → ${d.name}`);
  return out.length ? out : ['Ghi lại, không đổi nội dung'];
}

/** Một câu tóm tắt việc đã làm (dùng ở cột "Thay đổi gần nhất"). */
export function logSummary(l: LogRow): string {
  const d = l.data as D;
  if (l.event === 'policy_changed') return policyDiff(d).join(' · ');
  if (l.event === 'policy_created') return `Tạo: ${d.kind ? ruleText({ kind: d.kind as Policy['kind'], rule: d.rule ?? {}, scope: d.scope }) : ''}`;
  if (l.event === 'doc_saved') return (d.changes ?? []).join(' · ') || 'Ghi lại, không đổi nội dung';
  if (l.event === 'doc_created') return `Tạo phiếu${d.payable ? ` ${vnd(d.payable)}` : ''}`;
  if (l.event === 'doc_unapproved') return `Bỏ duyệt${d.reason ? `: ${d.reason}` : ''}${d.cancelled?.length ? ` (huỷ ${d.cancelled.join(', ')})` : ''}`;
  if (l.event === 'override_approved') return `Lý do: ${d.reason ?? ''}`;
  if (l.event === 'attachment_added') return d.fileName ?? '';
  if (l.event === 'supplier_items') return `Thêm ${d.added ?? 0}, cập nhật ${d.updated ?? 0} mã`;
  if (l.event === 'supplier_products' && d.deleted) return `Xoá vĩnh viễn dòng giá: ${delRow(d.deleted)}`;
  if (l.event === 'supplier_products') return `Thêm ${d.added ?? 0}, sửa ${d.updated ?? 0} dòng${d.rows?.length ? `: ${d.rows.join(', ')}` : ''}`;
  if (l.event === 'limit_transfer') return `${d.from || 'Chưa phân bổ'} → ${d.to}: ${vnd(d.amount)}`;
  return d.payable ? vnd(d.payable) : '';
}

export function LichSu({ docNo, partnerCode, rows: given, title = 'Lịch sử thay đổi', empty = 'Chưa có thay đổi nào được ghi.' }: { docNo?: string; partnerCode?: string; rows?: LogRow[]; title?: string; empty?: string }) {
  const q = useQuery({ queryKey: ['mua-hang', 'history', docNo ?? '', partnerCode ?? ''], queryFn: () => purchaseApi.history({ docNo, partnerCode }), enabled: !given && Boolean(docNo || partnerCode) });
  const rows = (given ?? q.data ?? []).filter((l) => !['price_check', 'limit_check', 'policy_applied'].includes(l.event));
  return (
    <div className="mh-history">
      {title && <h4 className="mh-h4">{title}</h4>}
      {!given && q.isLoading ? <div className="muted" style={{ fontSize: 12 }}>Đang tải…</div> : !rows.length ? <div className="muted" style={{ fontSize: 12 }}>{empty}</div> : (
        <ol className="mh-timeline">
          {rows.map((l, i) => {
            const d = l.data as D;
            const lines = l.event === 'policy_changed' ? policyDiff(d) : l.event === 'doc_saved' ? (d.changes?.length ? d.changes : ['Ghi lại, không đổi nội dung']) : [logSummary(l)].filter(Boolean);
            return (
              <li key={i}>
                <div className="mh-timeline-head"><b>{EVENT_LABEL[l.event] ?? l.event}</b> · {l.user || '—'} · <span className="muted">{new Date(l.ts).toLocaleString('vi-VN', { hour12: false })}</span>{partnerCode && l.docNo ? <span className="mono muted"> · {l.docNo}</span> : null}{d.kind && POLICY_LABEL[d.kind as Policy['kind']] && l.event.startsWith('policy') ? <span className="muted"> · {POLICY_LABEL[d.kind as Policy['kind']]}</span> : null}</div>
                {lines.length > 0 && <ul>{lines.map((x, j) => <li key={j}>{x}</li>)}</ul>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
