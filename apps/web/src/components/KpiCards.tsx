// [2026-11-11 Nguyễn Văn Thủy] THẺ CHỈ SỐ trên đầu danh sách (nợ quá hạn, tổng nợ, hết hàng…) dùng chung (đóng góp)
/**
 * Hàng thẻ số trên đầu danh sách: nhãn, số lớn, màu theo mức (đỏ quá hạn / âm kho, cam sắp đến hạn, xanh bình thường), giờ tính số.
 * Bấm thẻ: mở màn chi tiết (`to`) hoặc lọc danh sách (`onClick`). Nút ⌃ thu gọn cả hàng, nhớ theo máy.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';

export interface KpiItem { key: string; label: string; value: number | null | undefined; tone?: 'bad' | 'warn' | 'ok' | 'info'; icon?: ReactNode; to?: string; onClick?: () => void; hint?: string; money?: boolean; sub?: string }

const KEY = 'ketoan.kpi.gon';
const fmt = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 0 });

export function KpiCards({ items, at }: { items: KpiItem[]; at?: string | number | Date | null }) {
  const [gon, setGon] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  const flip = () => setGon((v) => { try { localStorage.setItem(KEY, v ? '0' : '1'); } catch { /* bỏ qua */ } return !v; });
  const time = at ? new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div className={`kpi-cards${gon ? ' gon' : ''}`}>
      {!gon && items.map((k) => {
        const body = (
          <>
            {k.icon && <span className={`kpi-ic ${k.tone ?? 'ok'}`}>{k.icon}</span>}
            <span className="kpi-tx">
              <small>{k.label}</small>
              <b className={k.tone === 'bad' && k.value ? 'bad' : undefined}>{k.value === null || k.value === undefined ? '…' : fmt(k.value)}</b>
              {k.sub && <em>{k.sub}</em>}
            </span>
            {time && <span className="kpi-time" title="Số liệu tính đến"><Clock size={12} /> {time}</span>}
          </>
        );
        const cls = `kpi-card ${k.tone ?? 'ok'}`;
        return k.to ? <Link key={k.key} className={cls} to={k.to} title={k.hint}>{body}</Link>
          : <button key={k.key} type="button" className={cls} title={k.hint} onClick={k.onClick} disabled={!k.onClick}>{body}</button>;
      })}
      <button type="button" className="kpi-gon" title={gon ? 'Hiện thẻ chỉ số' : 'Thu gọn thẻ chỉ số'} onClick={flip}>{gon ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>
    </div>
  );
}
