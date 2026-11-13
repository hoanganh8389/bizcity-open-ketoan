// [2026-11-13 02:40 PM Võ Hoàng] UX-14 — khuôn Luồng chi tiết dùng chung cho trang Quy trình mọi phân hệ (chữ chốt docs/cap-nhat-ux/14; tách từ Quy trình mua hàng của Nguyễn Văn Thủy, giao diện giữ nguyên) (đóng góp)
/**
 * LUỒNG CHI TIẾT — sơ đồ ba tầng của một phân hệ (thẻ "Luồng chi tiết" ở trang Quy trình /nhom/<nhóm>?xem=chi-tiet):
 *   Tầng trên  — khai báo (làm một lần, sửa khi cần), ô nằm trên đúng bước dùng nó;
 *   Tầng giữa  — luồng chính theo thời gian; mỗi bước ghi phần mềm TỰ LÀM gì;
 *   Tầng dưới  — phát sinh, treo dưới bước sinh ra nó.
 * Khung "Việc cần làm" ở trên (tuỳ chọn). Trang của phân hệ chỉ KHAI DỮ LIỆU (bước, ô) và gắn thêm huy hiệu / cảnh báo / nút qua
 * `badge` / `extra`; không tự vẽ khung. Ô không có `path` (hoặc `soon`) hiện mờ "đang phát triển".
 */
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import './luong-chi-tiet.css';

export interface LuongNode {
  label: string;
  code?: string;
  icon: string;
  color: string;
  /** Trống = chưa có màn (đang phát triển). */
  path?: string;
  hint?: string;
  soon?: boolean;
  /** Phần mềm tự làm sẵn gì ở bước này (chỉ dùng ở bước chính). */
  auto?: ReactNode[];
  /** Dữ liệu riêng của trang (vd loại chứng từ để đếm, khoá cảnh báo, mẫu in) — khuôn không đọc. */
  [k: string]: unknown;
}
export interface LuongStage { node: LuongNode; config: LuongNode[]; side: LuongNode[] }
export type ViecLevel = 'error' | 'warn' | 'info';
export interface ViecCanLam { key: string; level: ViecLevel; text: string; count: number; amount?: number; path: string }

export interface LuongChiTietProps {
  title: ReactNode;
  stages: LuongStage[];
  /** Nhãn ba tầng: [tên, chú thích]. */
  lanes?: { cfg?: [string, string]; main?: [string, string]; side?: [string, string] };
  /** Cột bước thứ i (mặc định minmax(132px, 1fr)). */
  column?: (i: number) => string;
  /** Huy hiệu ở góc ô (số chờ duyệt, số lượng…). */
  badge?: (n: LuongNode) => ReactNode;
  /** Phần gắn thêm dưới nội dung ô (cảnh báo, mẫu in, nút lập mới). */
  extra?: (n: LuongNode, place: 'stage' | 'cfg' | 'side') => ReactNode;
  /** Khung "Việc cần làm"; bỏ trống = không có khung. */
  todo?: { items: ViecCanLam[]; loading?: boolean; fetching?: boolean; error?: boolean; retry?: () => void; okText?: string; money?: (n: number) => string };
  /** Dòng chân sơ đồ (vòng lặp nghiệp vụ, lối tắt). */
  loop?: ReactNode;
  /** Chữ trên ô chưa có màn (mặc định "đang phát triển"). */
  soonLabel?: string;
}

export const LuongIcon = ({ name, size = 18, color }: { name: string; size?: number; color?: string }) => {
  const C = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] || Icons.Circle;
  return <C size={size} color={color} />;
};

const isSoon = (n: LuongNode) => n.soon === true || !n.path;

export function LuongChiTiet({ title, stages, lanes, column, badge, extra, todo, loop, soonLabel = 'đang phát triển' }: LuongChiTietProps) {
  const navigate = useNavigate();
  const open = (n: LuongNode) => { if (!isSoon(n)) navigate(n.path!); };
  const soonBadge = <span className="mf-badge info">{soonLabel}</span>;
  const L = {
    cfg: lanes?.cfg ?? ['Khai báo', 'làm một lần, sửa khi cần'],
    main: lanes?.main ?? ['Luồng chính', 'theo thứ tự thời gian'],
    side: lanes?.side ?? ['Phát sinh', 'treo dưới bước sinh ra nó'],
  };
  const small = (n: LuongNode, kind: 'cfg' | 'side') => (
    <div key={`${n.path ?? ''}|${n.label}`} className={`mf-small ${kind}${isSoon(n) ? ' soon' : ''}`} role="button" tabIndex={isSoon(n) ? -1 : 0}
      title={isSoon(n) ? `${n.label} — ${soonLabel}` : n.hint} aria-disabled={isSoon(n) || undefined}
      onClick={() => open(n)} onKeyDown={(e) => e.key === 'Enter' && open(n)}>
      <span className="mf-small-icon" style={{ color: n.color }}><LuongIcon name={n.icon} size={16} /></span>
      <span className="mf-small-text">
        <span className="mf-small-label">{n.label}{n.code && <i>{n.code}</i>}</span>
        {n.hint && <span className="mf-small-hint">{n.hint}</span>}
        {isSoon(n) ? soonBadge : badge?.(n)}
        {!isSoon(n) && extra?.(n, kind)}
      </span>
    </div>
  );

  return (
    <div className="mf">
      {todo && (
        <div className="mf-card">
          <div className="mf-head">Việc cần làm {todo.fetching && <span className="muted" style={{ fontWeight: 400 }}>· đang cập nhật…</span>}</div>
          {todo.error ? (
            <div className="mf-todo-ok" role="alert">Chưa tải được việc cần làm. {todo.retry && <button type="button" className="btn btn-xs" onClick={todo.retry}>Thử lại</button>}</div>
          ) : todo.items.length ? (
            <div className="mf-todo">
              {todo.items.map((t) => <Link key={t.key} to={t.path} className={`mf-todo-item ${t.level}`}><b>{t.count}</b><span>{t.text}{t.amount ? ` · ${todo.money ? todo.money(t.amount) : t.amount.toLocaleString('vi-VN')}` : ''}</span></Link>)}
            </div>
          ) : <div className="mf-todo-ok">{todo.loading ? 'Đang kiểm tra…' : (todo.okText ?? '✓ Không có việc tồn đọng — mọi chứng từ đã xử lý.')}</div>}
        </div>
      )}

      <div className="mf-card">
        <div className="mf-head">{title}</div>
        <div className="mf-scroll">
          <div className="mf-grid" style={{ ['--n' as string]: stages.length, gridTemplateColumns: `96px ${stages.map((_, i) => column?.(i) ?? 'minmax(132px, 1fr)').join(' ')}` }}>
            <div className="mf-lane-label cfg"><Icons.Settings2 size={15} /> {L.cfg[0]}<small>{L.cfg[1]}</small></div>
            {stages.map((s, i) => <div key={i} className={`mf-cell cfg ${s.config.length ? 'has' : ''}`}>{s.config.map((n) => small(n, 'cfg'))}</div>)}

            <div className="mf-lane-label main"><Icons.Workflow size={15} /> {L.main[0]}<small>{L.main[1]}</small></div>
            {stages.map((s, i) => (
              <div key={i} className={`mf-cell main ${i < stages.length - 1 ? 'next' : ''}`}>
                <div className={`mf-stage${isSoon(s.node) ? ' soon' : ''}`} role="button" tabIndex={isSoon(s.node) ? -1 : 0}
                  title={isSoon(s.node) ? `${s.node.label} — ${soonLabel}` : 'Bấm để mở'} aria-disabled={isSoon(s.node) || undefined}
                  style={{ ['--c' as string]: s.node.color }} onClick={() => open(s.node)} onKeyDown={(e) => e.key === 'Enter' && open(s.node)}>
                  <div className="mf-stage-top">
                    <span className="mf-num">{i + 1}</span>
                    <span className="mf-stage-icon"><LuongIcon name={s.node.icon} size={22} color="#fff" /></span>
                    {isSoon(s.node) ? soonBadge : badge?.(s.node)}
                  </div>
                  <div className="mf-stage-label">{s.node.label}{s.node.code && <i>{s.node.code}</i>}</div>
                  <ul className="mf-auto">{s.node.auto?.map((a, k) => <li key={k}><Icons.Sparkles size={12} /> <span>{a}</span></li>)}</ul>
                  {!isSoon(s.node) && extra?.(s.node, 'stage')}
                </div>
              </div>
            ))}

            <div className="mf-lane-label side"><Icons.CornerDownRight size={15} /> {L.side[0]}<small>{L.side[1]}</small></div>
            {stages.map((s, i) => <div key={i} className={`mf-cell side ${s.side.length ? 'has' : ''}`}>{s.side.map((n) => small(n, 'side'))}</div>)}
          </div>
          {loop && <div className="mf-loop"><Icons.RefreshCcw size={14} /> {loop}</div>}
        </div>
      </div>
    </div>
  );
}
