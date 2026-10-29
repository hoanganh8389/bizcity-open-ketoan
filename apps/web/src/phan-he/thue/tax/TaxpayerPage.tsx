/** Thông tin người nộp thuế: in ở phần đầu các tờ khai (tên, mã số thuế, địa chỉ, cơ quan thuế, đại lý thuế, người ký). */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading } from '@/components/ui';

const FIELDS: [string, string, boolean?][] = [
  ['name', 'Tên người nộp thuế', true], ['taxCode', 'Mã số thuế'], ['phone', 'Điện thoại'],
  ['address', 'Địa chỉ trụ sở', true], ['ward', 'Phường / xã'], ['province', 'Tỉnh / thành phố'], ['email', 'Thư điện tử'],
  ['taxOffice', 'Cơ quan thuế quản lý', true],
  ['agentName', 'Tên đại lý thuế (nếu có)', true], ['agentTaxCode', 'Mã số thuế đại lý'], ['agentContract', 'Hợp đồng đại lý: số, ngày'],
  ['signer', 'Người đại diện theo pháp luật (ký tờ khai)'], ['preparer', 'Người lập tờ khai'],
];

export function TaxpayerPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['taxpayer'], queryFn: () => api.get<Record<string, string> & { updatedBy?: string; updatedAt?: string }>('/api/v1/taxpayer') });
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => { if (q.data) setV(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put('/api/v1/taxpayer', Object.fromEntries(FIELDS.map(([k]) => [k, v[k] ?? '']))),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['taxpayer'] }),
  });
  const readOnly = !can('catalog:write');
  return (
    <>
      <PageHeader title="Thông tin người nộp thuế" code="TT01" subtitle="In ở phần đầu tờ khai thuế GTGT, quyết toán thuế TNDN" helpKey="quyet-toan-tndn"
        actions={!readOnly && <button className="btn btn-primary" disabled={save.isPending || !q.data} onClick={() => save.mutate()}>Ghi</button>} />
      <div className="card">
        {q.isLoading ? <Loading /> : (
          <div className="form-grid card-body">
            {FIELDS.map(([k, label, full]) => (
              <Field key={k} label={label} full={full}>
                <input className={`input ${k.toLowerCase().includes('taxcode') ? 'mono' : ''}`} value={v[k] ?? ''} disabled={readOnly} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} />
              </Field>
            ))}
            <div className="full">
              <ErrorBox error={save.error ? errorText(save.error) : null} />
              {save.isSuccess && <div className="alert alert-ok">Đã lưu.</div>}
              {q.data?.updatedBy && <div className="muted">Cập nhật lần cuối bởi {q.data.updatedBy} lúc {new Date(q.data.updatedAt!).toLocaleString('vi-VN')}.</div>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
