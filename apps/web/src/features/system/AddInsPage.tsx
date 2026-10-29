/**
 * Danh sách add-in đang bật (khai báo ở API, bật/tắt bằng biến môi trường ADDINS).
 */
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import type { AddInManifestDto } from '@/layout/menu';

export function AddInsPage() {
  const q = useQuery({ queryKey: ['addins'], queryFn: () => api.get<AddInManifestDto[]>('/api/v1/system/addins') });
  return (
    <>
      <PageHeader title="Add-in đang bật" code="TI00" subtitle="Phần mở rộng cắm thêm vào phần mềm, không sửa lõi" helpKey="add-in"
        actions={<a className="btn" href="/api/docs" target="_blank" rel="noreferrer">Tài liệu API</a>} />
      <div className="card">
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : !q.data?.length ? <Empty text="Chưa bật add-in nào" /> : (
          <table className="grid">
            <thead><tr><th>Mã</th><th>Tên</th><th>Phiên bản</th><th>Mô tả</th><th>Đường dẫn API</th></tr></thead>
            <tbody>
              {q.data.map((a) => (
                <tr key={a.id}><td className="mono">{a.id}</td><td>{a.name}</td><td>{a.version}</td><td>{a.description}</td><td className="mono">/api/v1/addins/{a.id}/…</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
