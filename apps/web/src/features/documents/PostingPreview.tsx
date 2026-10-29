/**
 * Xem trước định khoản của một chứng từ ở trạm ACC14: bút toán sẽ ghi theo nội dung mới nhất và cấu hình hạch toán hiện
 * tại (máy chủ chạy thử rồi huỷ, không ghi gì), số bút toán đang có sẽ bị đảo, hàng vào / ra kho, hoá đơn lên sổ hoá đơn.
 * Phiếu chờ / lỗi: tự hiện; phiếu đã định khoản: bấm "Xem trước định khoản lại" (định khoản xong thì khối tự ẩn —
 * DocumentDetail dựng lại theo trạng thái).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { DOC_TYPE_LABELS, type DocType } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { date, money } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/ui';

interface PreviewLine { pairNo: number; accountCode: string; accountName: string; debit: number; credit: number; part: string; taxCode: string | null; description: string; sku: string | null; partnerCode: string | null; partnerName: string | null }
interface Preview {
  ok: boolean; version: number; postedVersion: number | null; willReverse: number; willKeep?: number; error?: string;
  cancel?: boolean; cancelReason?: string | null; removeMovements?: number;
  entries?: { branchCode: string; postingDate: string; description: string; total: number; docType: string; docNo: string; lines: PreviewLine[] }[];
  movements?: { branchCode: string; kind: string; sku: string; name: string; qty: number; amount: number | null }[];
  invoice?: { no: string; serial: string; date: string } | null;
}
const PART: Record<string, string> = { goods: 'Tiền hàng', tax: 'Thuế', payment: 'Thanh toán', cogs: 'Giá vốn', discount: 'Chiết khấu', other: 'Khác' };

/** docLabel: tên loại của chứng từ khi khác tên loại bút toán mặc định (ví dụ Phiếu xuất điều chỉnh thay cho Hoá đơn bán hàng). */
export function PostingPreview({ id, version, auto, docLabel }: { id: string; version: number; auto: boolean; docLabel?: string }) {
  const [show, setShow] = useState(auto);
  const q = useQuery({ queryKey: ['document-preview', id, version], enabled: show, queryFn: () => api.get<Preview>(`/api/v1/documents/${id}/preview`), staleTime: 0 });
  if (!show) return <button className="btn btn-sm" style={{ marginBottom: 8 }} onClick={() => setShow(true)}><Eye size={14} /> Xem trước định khoản lại</button>;
  const p = q.data;
  const all = p?.entries?.flatMap((e) => e.lines) ?? [];
  const debit = all.reduce((s, l) => s + l.debit, 0);
  const credit = all.reduce((s, l) => s + l.credit, 0);
  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid var(--primary, #1f6fb2)' }}>
      <div className="card-body">
        <div className="row" style={{ gap: 8, marginBottom: 6 }}>
          <h3 style={{ fontSize: 14 }}>{auto ? 'Xem trước định khoản' : 'Xem trước định khoản lại'}</h3>
          <span className="muted" style={{ fontSize: 12 }}>theo phiên bản {version} và cấu hình hạch toán hiện tại — chưa ghi gì</span>
        </div>
        {q.isLoading && <Loading text="Đang chạy thử định khoản…" />}
        <ErrorBox error={q.error ? errorText(q.error) : p && !p.ok ? `Không định khoản được: ${p.error}` : null} />
        {p?.ok && p.cancel && (
          <div className="alert alert-bad">
            <b>Chờ huỷ</b>: {p.cancelReason || 'phiếu đã xoá ở hệ thống nguồn'}. Định khoản sẽ <b>huỷ chứng từ</b>:{' '}
            {p.willReverse ? `ghi số âm ${p.willReverse} bút toán đang có (có liên kết)` : 'sổ chưa có bút toán nào'}
            {p.removeMovements ? `, bỏ ${p.removeMovements} dòng hàng vào / ra kho` : ''}
            {p.invoice ? `, bỏ hoá đơn số ${p.invoice.no} khỏi sổ hoá đơn` : ''}; công nợ đã ghép với chứng từ này được gỡ.
          </div>
        )}
        {p?.ok && !p.cancel && (
          <>
            {(p.willReverse > 0 || (p.willKeep ?? 0) > 0) && (
              <div className="alert alert-warn" style={{ marginBottom: 6 }}>
                {auto ? 'Định khoản' : 'Nếu định khoản lại'}: {p.willKeep ? `giữ nguyên ${p.willKeep} bút toán không đổi; ` : ''}
                {p.willReverse ? `đảo ${p.willReverse} bút toán đã đổi (ghi số âm, có liên kết) rồi ghi các bút toán mới dưới đây.` : p.entries!.length ? 'ghi thêm các bút toán dưới đây.' : 'không có gì thay đổi.'}
              </div>
            )}
            {p.entries!.length === 0 && (p.movements!.some((m) => m.amount === null)
              ? (
                <div className="alert alert-info" style={{ marginBottom: 6 }}>
                  Phiếu kho chỉ có <b>số lượng</b> (chuyển kho, điều chỉnh): định khoản ghi ngay hàng vào / ra thẻ kho (bảng dưới).
                  <b> Bút toán giá trị</b> (Nợ / Có 1579, 156, 3381, 1381…) ghi khi chạy <b>Tính giá vốn</b> của tháng (ACC49), theo đơn giá bình quân
                  — hai đầu chuyển kho cùng một đơn giá nên tài khoản hàng đang chuyển về 0.
                </div>
              )
              : p.movements!.length > 0 && p.willReverse === 0 && (p.willKeep ?? 0) === 0
                ? (
                  <div className="alert alert-warn" style={{ marginBottom: 6 }}>
                    <b>Chứng từ có hàng nhưng tiền bằng 0</b> (đơn giá trên phiếu = 0): định khoản chỉ ghi số lượng vào thẻ kho, <b>không có bút toán</b>.
                    Kiểm tra lại đơn giá ở hệ thống bán hàng; sửa xong phiếu sẽ về lại với phiên bản mới để định khoản lại.
                  </div>
                )
                : <div className="muted" style={{ marginBottom: 6 }}>Không có bút toán mới phải ghi.</div>)}
            {p.entries!.map((e, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div className="muted" style={{ fontSize: 12 }}>Bút toán {i + 1} · <b>{(e.docType === 'sale' && docLabel) || (DOC_TYPE_LABELS[e.docType as DocType] ?? e.docType)} {e.docNo}</b> · {e.branchCode} · ngày {date(e.postingDate)} · {e.description}</div>
                <table className="grid">
                  <thead><tr><th>Cặp</th><th>Tài khoản</th><th>Đối tượng</th><th>Mặt hàng</th><th>Phần</th><th>Thuế</th><th>Diễn giải</th><th className="num">Nợ</th><th className="num">Có</th></tr></thead>
                  <tbody>
                    {e.lines.map((l, k) => (
                      <tr key={k}>
                        <td>{l.pairNo}</td><td><span className="mono">{l.accountCode}</span> {l.accountName}</td><td>{l.partnerCode ? `${l.partnerCode} ${l.partnerName ?? ''}` : ''}</td>
                        <td className="mono">{l.sku ?? ''}</td><td>{PART[l.part] ?? l.part}</td><td>{l.taxCode ?? ''}</td><td>{l.description}</td>
                        <td className="num">{l.debit ? money(l.debit) : ''}</td><td className="num">{l.credit ? money(l.credit) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div style={{ fontSize: 13 }}>
              Tổng Nợ <b>{money(debit)}</b> · tổng Có <b>{money(credit)}</b>{debit !== credit && <b className="text-bad"> · LỆCH</b>}
              {' · '}{p.invoice ? <>lên sổ hoá đơn: số <b>{p.invoice.no}</b>{p.invoice.serial ? ` ký hiệu ${p.invoice.serial}` : ''}</> : 'không lên sổ hoá đơn'}
            </div>
            {p.movements!.length > 0 && (
              <details style={{ marginTop: 6 }} open={p.entries!.length === 0}>
                <summary>Hàng vào / ra kho ({p.movements!.length} dòng)</summary>
                <table className="grid">
                  <thead><tr><th>Chi nhánh</th><th>Loại</th><th>Mã hàng</th><th>Tên</th><th className="num">Số lượng</th><th className="num">Giá trị</th></tr></thead>
                  <tbody>{p.movements!.map((m, k) => <tr key={k}><td>{m.branchCode}</td><td>{m.kind}</td><td className="mono">{m.sku}</td><td>{m.name}</td><td className="num">{m.qty.toLocaleString('vi-VN')}</td><td className="num">{m.amount === null ? 'tính khi tính giá vốn' : money(m.amount)}</td></tr>)}</tbody>
                </table>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
