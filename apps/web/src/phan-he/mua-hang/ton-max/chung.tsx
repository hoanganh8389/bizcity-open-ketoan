/**
 * Phần dùng chung của các màn tồn max: chọn chi nhánh cha (nhớ lần trước), chọn shop, thông báo chưa xếp phân cấp, khối số liệu màu.
 * Ô chọn chi nhánh / shop là ô gõ tìm (mã hoặc tên, không dấu); chi nhánh / shop đã ngừng ghi rõ "ngừng".
 */
import { workBranch } from '@/lib/workBranch';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ListPicker } from '@/components/pickers';
import { lastParent, useHierarchy, type BranchNode } from './api';
import './ton-max.css';

/** Chọn chi nhánh cha. Chưa chọn thì tự lấy lần trước / chi nhánh cha đầu tiên. */
export function ChonChiNhanhCha({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const h = useHierarchy();
  const parents = (h.data?.branches ?? []).filter((b) => b.level === 'branch');
  useEffect(() => {
    if (value || !parents.length) return;
    // Ưu tiên chi nhánh đang làm việc (shop → chi nhánh cha của shop), rồi lựa chọn lần trước.
    const wb = (h.data?.branches ?? []).find((b) => b.code === workBranch.get());
    const fromWork = wb?.level === 'branch' ? wb.code : wb?.level === 'shop' ? wb.parentCode ?? '' : '';
    const last = lastParent.get();
    onChange(parents.some((p) => p.code === fromWork) ? fromWork : parents.some((p) => p.code === last) ? last : parents[0]!.code);
  }, [value, parents.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = h.data?.branches ?? [];
  const items = parents.map((p) => {
    const kids = all.filter((s) => s.parentCode === p.code);
    const off = kids.filter(isOff).length;
    return { code: p.code, name: p.name, hint: `${isOff(p) ? 'ngừng · ' : ''}${kids.length} shop${off ? ` (${off} ngừng)` : ''}` };
  });
  return (
    <label className="tm-parent">
      <span>Chi nhánh cha</span>
      <ListPicker items={items} value={value} style={{ width: 320 }} placeholder={parents.length ? 'Gõ mã / tên chi nhánh cha' : '— chưa có chi nhánh cha —'} emptyText="Không có chi nhánh cha khớp"
        onChange={(v) => { if (!v) return; lastParent.set(v); onChange(v); }} />
    </label>
  );
}

/** Chi nhánh / shop đã ngừng: tắt ở danh mục chi nhánh hoặc mã có đuôi _OFF. */
export const isOff = (b: { code: string; isActive: boolean }) => !b.isActive || /_OFF$/i.test(b.code);
/**
 * Chọn shop con của chi nhánh cha, hoặc chính kho chi nhánh cha (value '' — dòng đầu mang mã chi nhánh cha, tên "Kho chi nhánh").
 * Shop ngừng xếp cuối, ghi "ngừng".
 */
export function ChonShop({ parent, value, onChange, width = 300 }: { parent: string; value: string; onChange: (v: string) => void; width?: number }) {
  const h = useHierarchy();
  const shops = (h.data?.branches ?? []).filter((b) => b.level === 'shop' && b.parentCode === parent)
    .sort((a, b) => Number(isOff(a)) - Number(isOff(b)) || a.code.localeCompare(b.code));
  const KHO_CHA = parent;
  const items = [{ code: KHO_CHA, name: 'Kho chi nhánh', hint: (h.data?.branches ?? []).find((b) => b.code === parent)?.name }, ...shops.map((s) => ({
    code: s.code, name: s.name, hint: [isOff(s) ? 'ngừng' : '', s.warehouses.length ? s.warehouses.map((w) => w.code).join(', ') : 'chưa có kho'].filter(Boolean).join(' · '),
  }))];
  return <ListPicker items={items} value={value || KHO_CHA} style={{ width }} placeholder="Gõ mã / tên shop" emptyText="Không có shop khớp"
    onChange={(v) => { if (v) onChange(v === KHO_CHA ? '' : v); }} />;
}

/** Chưa xếp phân cấp thì chỉ đường sang MH15. */
export function ChuaPhanCap({ branches }: { branches: BranchNode[] | undefined }) {
  if (!branches || branches.some((b) => b.level === 'branch')) return null;
  return <div className="alert alert-warn" style={{ margin: 12 }}>Chưa có chi nhánh cha nào. Mở <Link to="/mua-hang/phan-cap">Phân cấp chi nhánh – shop (MH15)</Link> → bấm <b>Tự xếp theo mã</b> hoặc chọn tay.</div>;
}

/** Ô số liệu tóm tắt (khối màu) — bấm được để lọc. */
export function KhoiSo({ label, value, tone = 'blue', active, onClick, hint }: { label: string; value: ReactNode; tone?: 'blue' | 'orange' | 'yellow' | 'green' | 'red' | 'grey' | 'purple'; active?: boolean; onClick?: () => void; hint?: string }) {
  return (
    <button type="button" className={`tm-stat tm-${tone}${active ? ' on' : ''}`} onClick={onClick} disabled={!onClick} title={hint}>
      <span>{label}</span><b>{value}</b>
    </button>
  );
}
