// [2026-11-19 kiennt] NT-DM-012 — loại thuế GTGT cố định theo quy định nhà nước: một danh sách dùng chung mua / bán (đóng góp)
/**
 * THUẾ GTGT DÙNG CHUNG cho mọi ô chọn loại thuế.
 * Danh mục cố định do phần mềm cấu hình theo quy định (KCT, 0, 5, 8, 10, KKKN — migration 0169): một loại dùng cho cả phiếu mua và phiếu
 * bán, tiền thuế ghi vào TK của Quy tắc hạch toán (ACC41). Mã cũ (V…, R…) chỉ còn để đọc chứng từ đã ghi — không chọn được nữa.
 *   - useLoaiThue(): danh sách (GET /api/v1/tax-codes); nạp thuế suất mọi mã vào TAX_RATES để phiếu tính tiền thuế đúng.
 *   - loaiDangDung(): 6 loại cố định theo thứ tự KCT · 0 · 5 · 8 · 10 · KKKN.
 *   - <ChonThue>: ô chọn loại thuế; `ngay` (ngày chứng từ) làm mờ loại hết hiệu lực; giá trị đang là mã cũ thì hiện kèm loại thay thế.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TAX_RATES } from '@/lib/tradeDocs';

export interface LoaiThue {
  code: string; name: string; rate: number; direction: string; accountCode: string | null; reportGroup: string; isActive: boolean;
  validFrom: string | null; validTo: string | null; legalBasis: string | null; isLegacy: boolean; replacedBy: string | null;
}

const THU_TU = ['KCT', '0', '5', '8', '10', 'KKKN'];

/** Danh sách loại thuế (đệm chung `['tax-codes']`); nạp thuế suất mọi mã vào TAX_RATES. */
export function useLoaiThue(): LoaiThue[] {
  const q = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<LoaiThue[]>('/api/v1/tax-codes'), staleTime: 60_000 });
  useEffect(() => { for (const t of q.data ?? []) TAX_RATES[t.code] = Number(t.rate); }, [q.data]);
  return q.data ?? [];
}

/** 6 loại cố định đang dùng, theo thứ tự KCT · 0 · 5 · 8 · 10 · KKKN. */
export const loaiDangDung = (ds: readonly LoaiThue[]): LoaiThue[] =>
  ds.filter((t) => !t.isLegacy && t.isActive).sort((a, b) => (THU_TU.indexOf(a.code) + 1 || 99) - (THU_TU.indexOf(b.code) + 1 || 99));

/** Nhãn ngắn: "10%", "Không chịu thuế", "Không kê khai". */
export const nhanLoai = (t: Pick<LoaiThue, 'code' | 'reportGroup' | 'name'> & { rate?: number | string }): string =>
  t.reportGroup === 'KCT' ? 'Không chịu thuế' : t.reportGroup === 'KKK' ? 'Không kê khai' : `${Number(t.rate ?? 0)}%`;

const vn = (d: string) => d.split('-').reverse().join('/');
/** Loại thuế còn hiệu lực ở ngày `ngay` (YYYY-MM-DD)? Không có ngày thì coi là còn. */
export const conHieuLuc = (t: Pick<LoaiThue, 'validFrom' | 'validTo'>, ngay?: string | null): boolean =>
  !ngay || ((!t.validFrom || ngay >= t.validFrom) && (!t.validTo || ngay <= t.validTo));
export const ghiChuHieuLuc = (t: Pick<LoaiThue, 'validFrom' | 'validTo'>): string =>
  t.validTo ? `đến hết ${vn(t.validTo)}` : t.validFrom ? `từ ${vn(t.validFrom)}` : '';

/** Loại cố định tương ứng của một mã (mã cũ → replacedBy). */
export const loaiCua = (code: string | null | undefined, ds: readonly LoaiThue[]): string | null => {
  if (!code) return null;
  const t = ds.find((x) => x.code === code);
  return t ? (t.isLegacy ? t.replacedBy : t.code) : null;
};

interface Props {
  value: string | null | undefined;
  onChange: (code: string, t: LoaiThue | null) => void;
  /** Ngày chứng từ (YYYY-MM-DD): loại hết hiệu lực ở ngày đó bị mờ. */
  ngay?: string | null;
  /** Cho để trống ("— Không thuế —"). */
  trong?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

/** Ô chọn loại thuế cố định. Giá trị đang là mã cũ vẫn hiện (kèm loại thay thế) để không mất dữ liệu chứng từ cũ. */
export function ChonThue({ value, onChange, ngay, trong, disabled, className = 'select input', style, title }: Props) {
  const ds = useLoaiThue();
  const dung = loaiDangDung(ds);
  const cur = value ? ds.find((t) => t.code === value) : undefined;
  return (
    <select className={className} style={style} value={value ?? ''} disabled={disabled}
      title={title ?? (cur ? `${cur.name}${cur.legalBasis ? ` — ${cur.legalBasis}` : ''}` : 'Loại thuế GTGT theo quy định — dùng chung cho mua và bán')}
      onChange={(e) => onChange(e.target.value, ds.find((t) => t.code === e.target.value) ?? null)}>
      {(trong || !value) && <option value="">— Không thuế —</option>}
      {value && !dung.some((t) => t.code === value) && (
        <option value={value}>{cur ? `${value} (mã cũ${cur.replacedBy ? ` → ${cur.replacedBy}` : ''})` : value}</option>
      )}
      {dung.map((t) => {
        const het = !conHieuLuc(t, ngay);
        const hl = ghiChuHieuLuc(t);
        return <option key={t.code} value={t.code} disabled={het && t.code !== value}>{`${nhanLoai(t)}${hl ? ` (${hl})` : ''}${het ? ' — hết hiệu lực' : ''}`}</option>;
      })}
    </select>
  );
}
