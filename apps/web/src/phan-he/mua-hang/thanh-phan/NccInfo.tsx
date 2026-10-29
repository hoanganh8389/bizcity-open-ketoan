/**
 * Xem nhanh thông tin NHÀ CUNG CẤP ở mọi chỗ có NCC (phiếu, danh sách, chính sách, đề xuất đặt hàng): bấm ⓘ cạnh tên →
 * thẻ nổi: tên, MST, địa chỉ, điện thoại, email, người liên hệ, tài khoản ngân hàng, điều khoản thanh toán, hạn mức, nợ,
 * quá hạn, hợp đồng — kèm nút mở hồ sơ NCC.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { purchaseApi, useNames, vnd } from '../du-lieu';

const dmy = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

export function NccInfo({ code, showName = true }: { code: string; showName?: boolean }) {
  const names = useNames();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const box = useRef<HTMLSpanElement>(null);
  const q = useQuery({ queryKey: ['mua-hang', 'supplier', code], queryFn: () => purchaseApi.supplier(code), enabled: open && Boolean(code), staleTime: 60_000 });
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!code) return null;
  const p = q.data?.partner, s = q.data?.summary;
  const row = (label: string, v?: string | null) => (v ? <div className="mh-ncc-pop-row"><span>{label}</span><b>{v}</b></div> : null);
  return (
    <span className="mh-ncc-chip" ref={box}>
      {showName && <span>{names.partnerName(code)}</span>}
      <button type="button" className="mh-ncc-i" title="Xem thông tin nhà cung cấp" onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 396)), top: r.bottom + 4 + 320 > window.innerHeight ? Math.max(8, r.top - 330) : r.bottom + 4 }); setOpen((x) => !x); }}><Info size={13} /></button>
      {open && (
        <div className="mh-ncc-pop" style={{ left: pos.left, top: pos.top }} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          {q.isLoading ? <div className="muted">Đang tải…</div> : !p ? <div className="muted">Không có thông tin NCC {code}</div> : <>
            <div className="mh-ncc-pop-head">{p.name} <span className="mono muted">{p.code}</span></div>
            {row('Mã số thuế', p.taxCode)}{row('Địa chỉ', p.address)}{row('Điện thoại', p.phone)}{row('Email', p.email)}{row('Người liên hệ', p.contactName)}
            {row('Tài khoản', p.bankAccount ? `${p.bankAccount}${p.bankName ? ` — ${p.bankName}` : ''}` : '')}
            {row('Nhóm', p.groupCode)}
            {s && <>
              <div className="mh-ncc-pop-sep" />
              {row('Điều khoản thanh toán', s.term || 'chưa khai')}
              {row('Hạn mức', s.creditLimit ? `${vnd(s.creditLimit)} · đã dùng ${Math.round((s.creditUsed / s.creditLimit) * 100)}%` : 'chưa khai')}
              {row('Nợ phải trả', vnd(s.debt))}{s.overdue > 0 ? row('Quá hạn', vnd(s.overdue)) : null}
              {row('Hợp đồng', s.contractNo ? `${s.contractNo}${s.contractTo ? ` · đến ${dmy(s.contractTo)}` : ''}` : '')}
              {row('Nhập gần nhất', dmy(s.lastReceipt))}
            </>}
            <Link className="btn btn-xs btn-primary" style={{ marginTop: 6 }} to={`/mua-hang/nha-cung-cap/${encodeURIComponent(code)}`} onClick={() => setOpen(false)}>Mở hồ sơ NCC →</Link>
          </>}
        </div>
      )}
    </span>
  );
}
