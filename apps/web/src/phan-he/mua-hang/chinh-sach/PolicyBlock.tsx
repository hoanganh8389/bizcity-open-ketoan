// [2026-11-18 Nguyễn Văn Thủy] bảng chính sách của một NCC / một hợp đồng — dùng chung cho khung hợp đồng (tách từ hồ sơ NCC) (đóng góp)
import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { POLICY_LABEL, type Policy, type PolicyKind } from '@bizcity/mua-hang-domain';
import { scopeBranches } from '@bizcity/mua-hang-domain';
import { ruleText } from './quyTac';
import { today } from '../du-lieu';
import { dmy } from '../chung';

/** Nhóm loại chính sách theo thẻ của khung hợp đồng. */
/** Mọi loại khai được trong hợp đồng / không theo hợp đồng. */
export const CONTRACT_KINDS: PolicyKind[] = ['trade_discount', 'item_discount', 'qty_tier', 'payment_discount', 'promo_gift', 'gift_budget', 'period_rebate', 'target_rebate', 'stage_rebate', 'supply_target', 'payment_term', 'credit_limit', 'lot_tracking'];
export const POLICY_GROUPS = {
  'chiet-khau': ['trade_discount', 'item_discount', 'qty_tier', 'payment_discount', 'promo_gift', 'gift_budget'],
  thuong: ['period_rebate', 'target_rebate', 'stage_rebate', 'supply_target'],
  'dieu-khoan': ['payment_term', 'credit_limit', 'lot_tracking'],
} satisfies Record<string, PolicyKind[]>;

export function PolicyBlock({ hint, policies, kinds, onAdd, onEdit }: { hint?: ReactNode; policies: Policy[]; kinds: PolicyKind[]; onAdd: (k: PolicyKind, kinds: PolicyKind[]) => void; onEdit: (p: Policy) => void }) {
  const [find, setFind] = useState('');
  const all = policies.filter((p) => kinds.includes(p.kind));
  const rows = all.filter((p) => !find || `${POLICY_LABEL[p.kind]} ${ruleText(p)} ${p.code} ${p.name} ${p.scope.sku ?? ''}`.toLowerCase().includes(find.toLowerCase())).sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const now = today();
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {/* Nhiều loại: một ô "+ Thêm chính sách" chọn loại (gọn); ít loại: mỗi loại một nút. */}
        {kinds.length > 4
          ? <select className="select input" style={{ width: 260 }} value="" onChange={(e) => e.target.value && onAdd(e.target.value as PolicyKind, kinds)}><option value="">+ Thêm chính sách…</option>{kinds.map((k) => <option key={k} value={k}>{POLICY_LABEL[k]}</option>)}</select>
          : kinds.map((k) => <button key={k} className="btn btn-sm" onClick={() => onAdd(k, kinds)}><Plus size={13} /> {POLICY_LABEL[k]}</button>)}
        {hint && <span className="muted" style={{ fontSize: 12 }}>{hint}</span>}
      </div>
      {all.length > 5 && <div className="row" style={{ gap: 6, marginBottom: 6, alignItems: 'center' }}><input className="input" style={{ width: 260 }} placeholder="Tìm chính sách: loại, nội dung, mã" value={find} onChange={(e) => setFind(e.target.value)} /><span className="muted" style={{ fontSize: 12 }}>{rows.length} / {all.length} chính sách</span></div>}
      <div className="scroll-box" style={{ maxHeight: 460 }}>
      <table className="mh-mini">
        <thead><tr><th>STT</th><th>Loại</th><th>Nội dung</th><th>Phạm vi</th><th>Hiệu lực</th><th>Trạng thái</th><th>Mã</th><th>Người tạo · ngày giờ</th><th>Sửa lần cuối</th><th /></tr></thead>
        <tbody>
          {rows.map((p, i) => {
            const st = !p.isActive ? 'Tắt' : p.validTo && p.validTo < now ? 'Hết hiệu lực' : 'Đang áp';
            return (
              <tr key={p.id} onDoubleClick={() => onEdit(p)} style={{ cursor: 'pointer' }} className={st === 'Đang áp' ? '' : 'muted'}>
                <td>{i + 1}</td><td>{POLICY_LABEL[p.kind]}</td><td style={{ fontSize: 12.5 }}>{ruleText(p)}</td>
                <td>{[p.scope.sku && `Mã ${p.scope.sku}`, scopeBranches(p.scope).join(', '), p.scope.brandCode && `Nhãn ${p.scope.brandCode}`].filter(Boolean).join(' · ') || 'Mọi mã, mọi chi nhánh'}</td>
                <td>{dmy(p.validFrom) || '—'} → {dmy(p.validTo) || '…'}</td>
                <td><span className={`badge ${st === 'Đang áp' ? 'badge-ok' : 'badge-gray'}`}>{st}</span></td>
                <td className="mono" style={{ fontSize: 11 }}>{p.code}</td>
                <td style={{ fontSize: 11.5 }}>{p.createdBy || '—'} · {p.createdAt ? new Date(p.createdAt).toLocaleString('vi-VN', { hour12: false }) : ''}</td>
                <td style={{ fontSize: 11.5 }}>{p.updatedBy || '—'} · {p.updatedAt ? new Date(p.updatedAt).toLocaleString('vi-VN', { hour12: false }) : ''}</td>
                <td><button className="btn btn-xs" onClick={() => onEdit(p)}>Sửa</button></td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={9} className="muted">{find ? 'Không có chính sách khớp.' : 'Chưa khai — bấm các nút "+" bên trên (có mẫu nhanh, mã tự đặt).'}</td></tr>}
        </tbody>
      </table>
      </div>
    </div>
  );
}

