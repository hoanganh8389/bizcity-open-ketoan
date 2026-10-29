/**
 * Chọn KHO của chi nhánh cho phiếu hàng (đầu phiếu, mọi dòng đi theo). Chỉ kho đang dùng của chi nhánh đang chọn; tự chọn kho
 * mặc định khi đổi chi nhánh / chưa chọn. Chi nhánh chưa khai kho (DM12) → để trống = kho mặc định (sổ kho tự gán).
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface KhoOption { code: string; branchCode: string; name: string; isActive: boolean; isDefault: boolean; isPromo?: boolean }

export function useKho() {
  return useQuery({ queryKey: ['warehouses'], queryFn: () => api.get<KhoOption[]>('/api/v1/warehouses'), staleTime: 60_000 }).data ?? [];
}

/** Kho mặc định của chi nhánh — cùng luật với máy chủ (modules/warehouses/default-warehouse.ts): kho đánh dấu mặc định; chi nhánh
 *  chỉ có một kho đang dùng thì kho đó; chưa khai kho → undefined. */
export const defaultKhoOf = (all: KhoOption[], branchCode?: string) => {
  const ws = all.filter((w) => w.branchCode === branchCode && w.isActive);
  return ws.find((w) => w.isDefault) ?? (ws.length === 1 ? ws[0] : undefined);
};
/** Mã kho THẬT của phiếu / dòng: có ghi → mã đó; trống → kho mặc định của chi nhánh; chi nhánh chưa khai kho → ''. */
export const khoCodeOf = (all: KhoOption[], branchCode?: string, code?: string) => code || defaultKhoOf(all, branchCode)?.code || '';
/** "mã · tên" của kho thật (trống = kho mặc định của chi nhánh); chi nhánh chưa khai kho → "mặc định (chưa khai kho)". */
export const khoFullLabel = (all: KhoOption[], branchCode?: string, code?: string) => {
  const c = khoCodeOf(all, branchCode, code);
  const w = all.find((x) => x.code === c && x.branchCode === branchCode) ?? all.find((x) => x.code === c);
  return c ? `${c}${w ? ` · ${w.name}` : ''}` : 'mặc định (chưa khai kho)';
};

export function ChonKho({ branchCode, value, onChange, disabled, avoid }: { branchCode: string; value: string; onChange: (code: string) => void; disabled?: boolean; avoid?: string }) {
  const all = useKho();
  const list = all.filter((w) => w.branchCode === branchCode && w.isActive);
  const def = list.find((w) => w.isDefault) ?? (list.length === 1 ? list[0] : undefined);
  // Chưa chọn / kho không thuộc chi nhánh mới → kho mặc định (hoặc kho đầu tiên khác `avoid` khi chuyển trong cùng chi nhánh).
  useEffect(() => {
    if (disabled || !branchCode || !all.length) return;
    if (value && list.some((w) => w.code === value)) return;
    const pick = avoid && def?.code === avoid ? list.find((w) => w.code !== avoid) : def;
    if ((pick?.code ?? '') !== value) onChange(pick?.code ?? '');
  }, [branchCode, all.length, avoid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!branchCode) return <select className="select input" disabled><option>— chọn chi nhánh trước —</option></select>;
  if (!list.length) return <select className="select input" disabled title="Khai kho cho chi nhánh ở Danh mục kho (DM12)"><option>mặc định (chi nhánh chưa khai kho)</option></select>;
  return (
    <select className="select input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {/* Phiếu cũ chưa ghi kho (trống) = kho mặc định của chi nhánh — hiện đúng như vậy, không để trình duyệt tự hiện kho đầu danh sách. */}
      {!value && <option value="">mặc định{def ? ` (${def.code} · ${def.name})` : ''}</option>}
      {list.map((w) => <option key={w.code} value={w.code} title={`${w.name}${w.isDefault ? ' (mặc định)' : ''}${w.isPromo ? ' · kho khuyến mại' : ''}`}>{w.code}</option>)}
    </select>
  );
}

/** Phân kho ở danh sách / bảng hàng: chỉ MÃ kho (08-HH), không kèm tên; trống = kho mặc định của chi nhánh. */
export const khoLabel = (_all: KhoOption[], code?: string) => code || 'mặc định';
