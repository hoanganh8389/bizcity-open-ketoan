/**
 * SƠ ĐỒ QUY TRÌNH của một phân hệ (trang chủ phân hệ, thẻ "Quy trình"): các bước nghiệp vụ nằm trên một trục thời gian,
 * bước chính ở trên, bước phát sinh ở dưới; bên phải là theo dõi + báo cáo; dưới cùng là danh mục, cài đặt. Bấm một bước
 * = mở danh sách; nút "+" = lập phiếu mới. Mỗi bước hiện số chứng từ đang chờ (nháp / chờ duyệt).
 *
 * Phân hệ khác dùng lại: khai một FlowDef (bước, liên kết) rồi đăng ký ở phan-he/flows.tsx — không phải viết giao diện.
 */
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import './quy-trinh.css';

export interface FlowStep {
  key: string;
  label: string;
  /** Tên biểu tượng lucide (ClipboardList, PackageCheck…). */
  icon: string;
  color: string;
  /** Mở danh sách. */
  path: string;
  /** Lập mới (nút "+"). */
  newPath?: string;
  hint?: string;
  /** Số hiện trên bước: { text, tone } — ví dụ "2 chờ duyệt". */
  badge?: { text: string; tone: 'warn' | 'info' | 'bad' } | null;
}
export interface FlowLink { label: string; path: string; icon?: string; hint?: string }
export interface FlowDef {
  title: string;
  /** Bước chính (trên trục) theo thứ tự thời gian. */
  main: FlowStep[];
  /** Bước phát sinh (dưới trục). */
  side: FlowStep[];
  /** Các khối bên phải: theo dõi, cuối kỳ, báo cáo. */
  panels: { title: string; links: FlowLink[] }[];
  /** Thanh dưới: danh mục, cài đặt. */
  shortcuts: FlowLink[];
}

const Icon = ({ name, size = 18, color }: { name?: string; size?: number; color?: string }) => {
  const C = (name && (Icons as unknown as Record<string, Icons.LucideIcon>)[name]) || Icons.Circle;
  return <C size={size} color={color} />;
};

function Step({ s, n }: { s: FlowStep; n?: number }) {
  const navigate = useNavigate();
  return (
    <div className="qt-step" title={s.hint}>
      <button type="button" className="qt-step-main" onClick={() => navigate(s.path)}>
        <span className="qt-icon" style={{ background: `linear-gradient(135deg, ${s.color}, ${s.color}bb)` }}><Icon name={s.icon} size={26} color="#fff" /></span>
        <span className="qt-label">{n !== undefined && <b>{n}. </b>}{s.label}</span>
        {s.hint && <span className="qt-hint">{s.hint}</span>}
      </button>
      {s.badge && <span className={`qt-badge ${s.badge.tone}`}>{s.badge.text}</span>}
      {s.newPath && <button type="button" className="qt-new" title={`Lập ${s.label.toLowerCase()}`} onClick={() => navigate(s.newPath!)}><Icons.Plus size={14} /> Lập mới</button>}
    </div>
  );
}

export function QuyTrinh({ flow, top }: { flow: FlowDef; top?: ReactNode }) {
  return (
    <div className="qt">
      {top}
      <div className="qt-body">
        <div className="qt-card qt-flow">
          <div className="qt-card-head">{flow.title}</div>
          <div className="qt-row">{flow.main.map((s, i) => <Step key={s.key} s={s} n={i + 1} />)}</div>
          <div className="qt-axis" style={{ ['--n' as string]: Math.max(flow.main.length, flow.side.length) }}>
            {flow.main.map((s) => <span key={s.key} className="qt-tick up" />)}
            <span className="qt-arrow" />
          </div>
          <div className="qt-row side">{flow.side.map((s) => <Step key={s.key} s={s} />)}</div>
        </div>
        <div className="qt-panels">
          {flow.panels.map((p) => (
            <div key={p.title} className="qt-card">
              <div className="qt-card-head">{p.title}</div>
              <div className="qt-links">
                {p.links.map((l) => <Link key={l.path} to={l.path} className="qt-link" title={l.hint}><Icon name={l.icon ?? 'ChevronRight'} size={15} /> <span>{l.label}</span></Link>)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="qt-card qt-shortcuts">
        {flow.shortcuts.map((l) => <Link key={l.path} to={l.path} className="qt-shortcut" title={l.hint}><Icon name={l.icon} size={20} /> <span>{l.label}</span></Link>)}
      </div>
    </div>
  );
}
