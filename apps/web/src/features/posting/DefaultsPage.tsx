/**
 * Tài khoản ngầm định (ACC41): form mười một tài khoản (tiền mặt, thuế đầu ra / đầu vào, hàng gửi đi bán,
 * phải thu / phải trả nội bộ hàng và tiền, giá vốn nội bộ khi chuyển kho, Nợ / Có hoa hồng) và nút Ghi.
 * Phần "Bộ định khoản" bên dưới: các tài khoản dùng khi lý do / hình thức thanh toán không chỉ định.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { AccountPicker } from '@/components/pickers';

interface DefaultRow { key: string; label: string; accountCode: string | null; onForm: boolean }
/** Hoa hồng ghi theo tài khoản cấp trên được (chưa vào bộ định khoản tự động). */
const ANY_LEVEL = new Set(['commission_debit', 'commission_credit']);

export function DefaultsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('settings:write');
  const q = useQuery({ queryKey: ['posting-defaults'], queryFn: () => api.get<DefaultRow[]>('/api/v1/posting/defaults') });
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data) setValues(Object.fromEntries(q.data.map((r) => [r.key, r.accountCode ?? ''])));
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put('/api/v1/posting/defaults', Object.fromEntries(Object.entries(values).filter(([, v]) => v))),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['posting-defaults'] }),
  });
  const row = (r: DefaultRow) => (
    <div key={r.key} className="defaults-row">
      <label htmlFor={`def-${r.key}`}>{r.label}</label>
      <AccountPicker postingOnly={!ANY_LEVEL.has(r.key)} disabled={!canWrite} value={values[r.key] ?? ''} onChange={(v) => setValues((x) => ({ ...x, [r.key]: v }))} />
    </div>
  );

  return (
    <>
      <PageHeader title="Tài khoản ngầm định" code="ACC41" subtitle="Tài khoản dùng khi chứng từ, lý do, mặt hàng không chỉ định" helpKey="tai-khoan-ngam-dinh" />
      <div className="card">
        <div className="catalog-toolbar">
          <button className="btn btn-sm" disabled={!canWrite || save.isPending} onClick={() => save.mutate()}><Save size={14} /> Ghi</button>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : save.error ? errorText(save.error) : null} />
        {save.isSuccess && <div className="alert alert-ok" style={{ margin: 12 }}>Cập nhật thành công!</div>}
        {q.isLoading ? <Loading /> : (
          <div className="card-body">
            <div className="defaults-form">{q.data?.filter((r) => r.onForm).map(row)}</div>
            <div className="field-title" style={{ marginTop: 18 }}>Bộ định khoản</div>
            <div className="muted" style={{ marginBottom: 8 }}>Dùng khi lý do, hình thức thanh toán, loại thuế không chỉ định tài khoản.</div>
            <div className="defaults-form">{q.data?.filter((r) => !r.onForm).map(row)}</div>
          </div>
        )}
      </div>
    </>
  );
}
