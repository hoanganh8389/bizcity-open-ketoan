// [2026-11-06 01:30 AM Nguyễn Văn Thủy] MENU — bảng Việc cần làm: việc của nhóm đang làm trước, nhóm khác sau (đóng góp)
import { AlertCircle, AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { money } from '@/lib/format';
import type { GonGroup } from '../menu-gon';
import { GROUPS_WITH_SOURCE, viecOf, type Viec, type ViecLevel } from './useViec';

const ICON: Record<ViecLevel, typeof Info> = { error: AlertCircle, warn: AlertTriangle, info: Info };

/** Một dòng việc, dùng chung cho bảng Việc cần làm và bảng Trợ lý. */
export function ViecRow({ v, onGo }: { v: Viec; onGo: () => void }) {
  const navigate = useNavigate();
  const Icon = ICON[v.level];
  return (
    <button type="button" className={`rail-viec ${v.level}`} title={`Mở màn xử lý: ${v.text}`} onClick={() => { navigate(v.path); onGo(); }}>
      <Icon size={16} />
      <span className="rail-viec-text">{v.text}{v.amount ? <small>{money(v.amount)}</small> : null}</span>
      <b>{v.count}</b>
    </button>
  );
}

export function ViecPanel({ items, loading, group, groups, onRefresh, onGo }: { items: Viec[]; loading: boolean; group?: GonGroup; groups: GonGroup[]; onRefresh: () => void; onGo: () => void }) {
  const mine = viecOf(items, group?.key);
  const others = group ? groups.filter((g) => g.key !== group.key).map((g) => ({ g, list: viecOf(items, g.key).filter((v) => !v.groups.includes(group.key)) })).filter((x) => x.list.length) : [];
  const shown = new Set<string>();
  return (
    <div className="rail-scroll">
      <div className="rail-sec-head">
        <b>{group ? group.label : 'Tất cả nhóm'}</b>
        <button type="button" className="rail-mini" title="Tải lại" onClick={onRefresh}><RefreshCw size={14} /></button>
      </div>
      {mine.map((v) => <ViecRow key={v.key} v={v} onGo={onGo} />)}
      {!mine.length && !loading && (
        <div className="rail-empty">
          <CheckCircle2 size={28} />
          {group && !GROUPS_WITH_SOURCE.has(group.key) ? `Nhóm ${group.label} chưa có nhắc việc` : 'Không có việc cần xử lý'}
        </div>
      )}
      {others.map(({ g, list }) => {
        const rest = list.filter((v) => !shown.has(v.key));
        rest.forEach((v) => shown.add(v.key));
        return rest.length > 0 && (
          <div key={g.key}>
            <div className="rail-sec-head muted"><b>{g.label}</b></div>
            {rest.map((v) => <ViecRow key={v.key} v={v} onGo={onGo} />)}
          </div>
        );
      })}
    </div>
  );
}
