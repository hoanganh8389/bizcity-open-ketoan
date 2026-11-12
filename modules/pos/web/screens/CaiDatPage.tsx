/**
 * BH17 Cài đặt bán hàng (NT-BH-008 §7): hạn trả hàng, bắt buộc mở ca, ca theo chi nhánh / máy, ngưỡng chênh lệch két. Đọc qua module
 * (GET /admin/settings), ghi qua đường chung của Core PUT /api/v1/settings/values/:key (quyền settings:write; có phiên bản, ai đổi).
 */
import { useEffect, useState } from 'react';
import { ErrorBox, Field, Loading, PageHeader, errorText, useApi, useCan, useMutation, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { M } from '../lib';

type Values = { returnDays: number; requireOpenShift: boolean; shiftScope: 'branch' | 'device'; cashDiffAlert: number };
type Resp = { values: Values; keys: Record<keyof Values, string> };

export function CaiDatPage() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['pos-admin', 'settings'], queryFn: () => api.get<Resp>(`${M}/admin/settings`) });
  const [v, setV] = useState<Values | null>(null);
  const [err, setErr] = useState<Partial<Record<keyof Values, string>>>({});
  useEffect(() => { if (q.data) setV(q.data.values); }, [q.data]);
  const save = useMutation({
    mutationFn: async () => {
      if (!q.data || !v) return;
      for (const k of Object.keys(v) as (keyof Values)[]) {
        if (v[k] !== q.data.values[k]) await api.put(`/api/v1/settings/values/${encodeURIComponent(q.data.keys[k])}`, { key: q.data.keys[k], value: v[k] });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-admin', 'settings'] }),
  });
  if (q.isLoading || !v) return q.error ? <ErrorBox error={errorText(q.error)} /> : <Loading />;
  const writable = can('settings:write');
  const days = (s: string) => {
    const n = Number(s);
    setErr((e) => ({ ...e, returnDays: Number.isInteger(n) && n >= 0 && n <= 60 ? undefined : 'Từ 0 đến 60 ngày' }));
    setV({ ...v, returnDays: Number.isInteger(n) ? n : v.returnDays });
  };
  const changed = q.data && (Object.keys(v) as (keyof Values)[]).some((k) => v[k] !== q.data!.values[k]);
  return (
    <div>
      <PageHeader title="Cài đặt bán hàng" code="BH17" subtitle="Tham số bán lẻ tại quầy cho mọi cửa hàng của đơn vị. Đổi có hiệu lực từ hôm nay, lưu lịch sử ai đổi lúc nào." />
      <div className="card card-body" style={{ maxWidth: 680, display: 'grid', gap: 14 }}>
        <Field label="Hạn trả hàng không cần duyệt (ngày, tính từ ngày bán)" hint={err.returnDays ?? 'Quá hạn: máy bán đòi người duyệt (bộ phận kinh doanh). Mặc định 3 ngày.'}>
          <input className={`input${err.returnDays ? ' input-error' : ''}`} type="number" min={0} max={60} value={v.returnDays} disabled={!writable} onChange={(e) => days(e.target.value)} />
        </Field>
        <Field label="Bắt buộc mở ca trước khi bán" hint="Chưa bật: máy bán vẫn nhận đơn khi chưa mở ca (ca theo ngày).">
          <input type="checkbox" checked={v.requireOpenShift} disabled={!writable} onChange={(e) => setV({ ...v, requireOpenShift: e.target.checked })} />
        </Field>
        <Field label="Ca bán" hint="Đợt này chỉ áp dụng một ca chung cho mỗi chi nhánh.">
          <select className="input" value={v.shiftScope} disabled={!writable} onChange={(e) => setV({ ...v, shiftScope: e.target.value as Values['shiftScope'] })}>
            <option value="branch">Một ca chung cho cả chi nhánh</option>
            <option value="device">Mỗi máy bán một ca</option>
          </select>
        </Field>
        <Field label="Ngưỡng chênh lệch két cần chú ý (đồng)" hint="Sổ ca bán tô đỏ ca có chênh lệch từ ngưỡng này trở lên; 0 = mọi chênh lệch.">
          <input className="input" type="number" min={0} value={v.cashDiffAlert} disabled={!writable} onChange={(e) => setV({ ...v, cashDiffAlert: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        </Field>
        {save.error && <ErrorBox error={errorText(save.error)} />}
        {writable ? (
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-primary" disabled={!changed || !!err.returnDays || save.isPending} onClick={() => save.mutate()}>Ghi</button>
            <button type="button" className="btn" disabled={!changed} onClick={() => { setV(q.data!.values); setErr({}); }}>Bỏ sửa</button>
            {save.isSuccess && !changed && <span className="muted">Đã ghi.</span>}
          </div>
        ) : <p className="muted">Chỉ người có quyền ghi cấu hình (kế toán trưởng / quản trị) đổi được.</p>}
      </div>
    </div>
  );
}
