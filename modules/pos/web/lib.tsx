/** Dùng chung cho các màn quản trị bán lẻ (NT-BH-008): bảng tham số kỳ / chi nhánh, gọi API module, nhãn trạng thái. */
import { useState, type ReactNode } from 'react';
import { BranchCheckList, FilterLayout, PeriodField, useApi, useQuery } from '@bizcity/ui-kit';

export const M = '/api/v1/m/pos';

const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export type Range = { from: string; to: string; branches: string };

/** Tham số đang sửa (bảng bên trái) và tham số đã áp (bấm Tìm kiếm) — như màn báo cáo Core. Mặc định: hôm nay, mọi chi nhánh. */
export function useRange(extra: Record<string, string> = {}) {
  const today = vnToday();
  const [draft, setDraft] = useState<Range & Record<string, string>>({ from: today, to: today, branches: '', ...extra });
  const [applied, setApplied] = useState(draft);
  return { draft, setDraft, applied, apply: () => setApplied(draft) };
}

/** Khung trang danh sách / báo cáo: bảng tham số (kỳ, chi nhánh, ô riêng của màn) + nội dung. */
export function RangeLayout({ r, id, children, more }: { r: ReturnType<typeof useRange>; id: string; children: ReactNode; more?: ReactNode }) {
  return (
    <FilterLayout
      onSearch={r.apply}
      boThamSo={{ value: r.draft, onApply: ((v: Range) => r.setDraft({ ...r.draft, ...v })) as never, id }}
      filters={(
        <>
          <PeriodField from={r.draft.from} to={r.draft.to} onChange={(from, to) => r.setDraft({ ...r.draft, from, to })} />
          <BranchCheckList value={r.draft.branches} onChange={(branches) => r.setDraft({ ...r.draft, branches })} />
          {more}
        </>
      )}
    >
      {children}
    </FilterLayout>
  );
}

/** Ô nhập trong bảng tham số (cùng lớp CSS ô của Core). */
export function SideInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="rp-field">
      <span>{label}</span>
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export type Page<T> = { data: T; meta?: { total?: number; sums?: Record<string, number> } };

/** Đọc có meta (tổng của cả kết quả lọc). Tham số rỗng không gửi. */
export function usePage<T>(key: string, path: string, query: Record<string, string | number>) {
  const api = useApi();
  const q = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v !== undefined));
  return useQuery({ queryKey: ['pos-admin', key, q], queryFn: () => api.getPage<T>(`${M}${path}`, q) as Promise<Page<T>> });
}

export const ORDER_STATUS: Record<string, { label: string; tone: string }> = {
  completed: { label: 'Hoàn tất', tone: 'ok' }, awaiting_payment: { label: 'Chờ trả tiền', tone: 'warn' }, cancelled: { label: 'Đã huỷ', tone: 'gray' },
};
export const DOC_STATUS: Record<string, { label: string; tone: string }> = {
  posted: { label: 'Đã ghi sổ', tone: 'ok' }, pending: { label: 'Chờ duyệt', tone: 'warn' }, pending_cancel: { label: 'Chờ huỷ', tone: 'warn' },
  failed: { label: 'Lỗi ghi sổ', tone: 'bad' }, held: { label: 'Đang giữ', tone: 'warn' },
};
export function Badge({ map, value }: { map: Record<string, { label: string; tone: string }>; value: string }) {
  const m = map[value] ?? { label: value || '—', tone: 'gray' };
  return <span className={`badge badge-${m.tone}`}>{m.label}</span>;
}

export const time = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
export const vnd = (n: number | null | undefined) => (n === null || n === undefined ? '' : new Intl.NumberFormat('vi-VN').format(n));
