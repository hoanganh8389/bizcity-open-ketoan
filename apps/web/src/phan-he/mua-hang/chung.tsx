/**
 * Mảnh giao diện dùng chung của các màn Mua hàng: danh sách cảnh báo, thanh hạn mức.
 */
import type { Check, CreditStatus } from '@ketoan/contracts/mua-hang';
import { ListPicker } from '@/components/pickers';
import { vnd } from './du-lieu';
import './mua-hang.css';

const ICON: Record<string, string> = { error: '⛔', warn: '⚠', info: 'ℹ', ok: '✓' };
export function CheckList({ checks, empty = 'Không có cảnh báo', onPick }: { checks: Check[]; empty?: string; onPick?: (lineKey: string) => void }) {
  if (!checks.length) return <div className="mh-check ok">{ICON.ok} {empty}</div>;
  const order = { error: 0, warn: 1, info: 2 } as const;
  return (
    <>
      {[...checks].sort((a, b) => order[a.level] - order[b.level]).map((c, i) => (
        <div key={i} className={`mh-check ${c.level}`} style={{ cursor: c.lineKey && onPick ? 'pointer' : undefined }} onClick={() => c.lineKey && onPick?.(c.lineKey)}>
          <span>{ICON[c.level]}</span><span>{c.text}{c.blocking ? <b> — chặn duyệt</b> : null}</span>
        </div>
      ))}
    </>
  );
}

/** Thanh hạn mức: đã dùng | đang chờ | phiếu này | phần vượt. */
export function UsageBar({ s }: { s: CreditStatus }) {
  const scale = Math.max(s.limit, s.after) || 1;
  const pct = (n: number) => `${Math.max(0, (n / scale) * 100)}%`;
  const overFromThis = Math.min(s.exceeded, s.thisDoc);
  return (
    <div style={{ marginBottom: 6 }}>
      <div className="row" style={{ fontSize: 12, justifyContent: 'space-between' }}>
        <b>{s.scope}</b>
        <span className={s.exceeded ? 'mh-bad' : s.warn ? 'mh-warn' : 'mh-ok'}>{s.exceeded ? `vượt ${vnd(s.exceeded)}` : `còn ${vnd(s.remaining)}`}</span>
      </div>
      <div className="mh-bar" title={`Hạn mức ${vnd(s.limit)}`}>
        <span className="used" style={{ width: pct(s.current) }} />
        <span className="pend" style={{ width: pct(s.openOrders) }} />
        <span className="this" style={{ width: pct(s.thisDoc - overFromThis) }} />
        <span className="over" style={{ width: pct(s.exceeded) }} />
      </div>
      <div className="mh-legend">
        <span><i style={{ background: 'var(--brand-500)' }} />Nợ đã ghi {vnd(s.current)}</span>
        <span><i style={{ background: '#9cc3f5' }} />Đang chờ {vnd(s.openOrders)}</span>
        <span><i style={{ background: '#f0a020' }} />Phiếu này {vnd(s.thisDoc)}</span>
        <span>/ hạn mức {vnd(s.limit)}</span>
      </div>
    </div>
  );
}

export const dmy = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
export const statusBadge = (s: string) => ({ draft: 'badge-gray', pending_approval: 'badge-warn', approved: 'badge-ok', cancelled: 'badge-bad' }[s] ?? 'badge-gray');

/**
 * Ô nhãn hàng: ô chọn chuẩn (gõ mã hoặc tên để lọc) — danh mục nhãn + nhãn đã dùng ở chính sách.
 * prefer: nhãn NCC đang bán (suy từ mặt hàng) — xếp lên đầu, ghi "NCC bán · n mã" để chọn đúng nhãn của NCC.
 */
export function BrandInput({ value, onChange, brands, disabled, prefer = [] }: { value: string; onChange: (v: string) => void; brands: { code: string; name: string }[]; disabled?: boolean; prefer?: { brandCode: string; skus: number }[] }) {
  const pref = new Map(prefer.map((x) => [x.brandCode, x.skus]));
  const items = prefer.length ? [...brands.filter((b) => pref.has(b.code)).sort((a, b) => (pref.get(b.code) ?? 0) - (pref.get(a.code) ?? 0)).map((b) => ({ code: b.code, name: `${b.name} — NCC bán · ${pref.get(b.code)} mã` })), ...brands.filter((b) => !pref.has(b.code))] : brands;
  return <ListPicker items={items} value={value} onChange={(v) => onChange(v.trim().toUpperCase())} disabled={disabled} placeholder={prefer.length ? 'Gợi ý trước: nhãn NCC đang bán' : 'Gõ mã hoặc tên nhãn'} emptyText="Không có nhãn khớp" />;
}
