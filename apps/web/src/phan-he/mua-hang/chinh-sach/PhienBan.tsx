// [2026-11-07 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W1 (S031-5): các bản của một chính sách mua hàng (sổ đăng ký chính sách, 0079)
/**
 * Bảng phiên bản của một chính sách: mỗi lần nội dung đổi là một bản, áp cho chứng từ từ một ngày. Phiếu ngày nào tính bằng bản
 * hiệu lực ngày đó — sửa chính sách không làm đổi số của phiếu cũ. Băm rút gọn để đối chiếu với vết chính sách trên phiếu.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { dmy } from '../chung';

interface Version { version: number; effectiveFrom: string | null; effectiveTo: string | null; hash: string; status: string; publishedBy: string; publishedAt: string | null; reason: string | null }

/** Khoảng áp của một bản theo ngày chứng từ; bản bị thay trong cùng ngày thì không ngày nào chọn nó. */
const range = (v: Version) => {
  if (v.effectiveFrom && v.effectiveTo && v.effectiveTo < v.effectiveFrom) return 'bị thay ngay trong ngày';
  return `${v.effectiveFrom ? `từ ${dmy(v.effectiveFrom)}` : 'từ đầu'}${v.effectiveTo ? ` đến ${dmy(v.effectiveTo)}` : ''}`;
};

export function PhienBan({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['mua-hang', 'policy-versions', id], queryFn: () => api.get<Version[]>(`/api/v1/purchase/policies/${id}/versions`) });
  const rows = [...(q.data ?? [])].reverse();
  return (
    <div className="full" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
      <b style={{ fontSize: 13 }}>Phiên bản</b>
      <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>phiếu ngày nào tính bằng bản áp ngày đó; sửa chính sách không đổi số của phiếu cũ</span>
      {q.isLoading ? <div className="muted" style={{ fontSize: 12 }}>Đang tải…</div> : !rows.length ? <div className="muted" style={{ fontSize: 12 }}>Chưa có bản nào.</div> : (
        <table className="table" style={{ fontSize: 12.5, marginTop: 4 }}>
          <thead><tr><th>Bản</th><th>Áp cho chứng từ</th><th>Người ghi</th><th>Lúc</th><th>Lý do</th><th>Băm</th></tr></thead>
          <tbody>
            {rows.map((v, i) => (
              <tr key={v.version} className={i === 0 ? '' : 'muted'}>
                <td>{v.version}{i === 0 && <span className="badge badge-ok" style={{ marginLeft: 4 }}>hiện hành</span>}{v.status === 'retired' && <span className="badge badge-gray" style={{ marginLeft: 4 }}>ngừng</span>}</td>
                <td>{range(v)}</td>
                <td>{v.publishedBy || '—'}</td>
                <td>{v.publishedAt ? new Date(v.publishedAt).toLocaleString('vi-VN', { hour12: false }) : '—'}</td>
                <td>{v.reason ?? ''}</td>
                <td className="mono" title={v.hash}>{v.hash.slice(0, 8)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
