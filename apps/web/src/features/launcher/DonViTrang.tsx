// [2026-11-14 03:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-3 (B1, chữ chốt PHASE-036 · 00 §10): biểu ngữ "Đơn vị chưa có chứng từ" ở Tổng quan — chỉ đường thay cho màn số "—"
/**
 * Đơn vị trắng (core.setup.status): chưa có bút toán, chưa có chứng từ ở trạng thái nào.
 *  - Có quyền settings:write: ba đường bắt đầu (danh mục chuẩn TI08, số dư đầu kỳ, chứng từ đầu tiên). Hộp thoại Thiết lập nhanh là B3.
 *  - Không có quyền: nhờ chủ đơn vị thiết lập.
 *  - Đơn vị đã có dữ liệu, hoặc gọi lỗi: không hiện gì (không chặn phần còn lại của Tổng quan).
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';

interface SetupStatus { empty: boolean; kinds: string[]; canSetup: boolean }

const DUONG = [
  { to: '/tien-ich/du-lieu-goc', label: 'Nạp danh mục chuẩn', sub: 'Dữ liệu gốc (TI08): xem trước rồi nạp' },
  { to: '/nghiep-vu/so-du-tai-khoan', label: 'Nhập số dư đầu kỳ', sub: 'Tiền, công nợ, hàng tồn khi bắt đầu dùng' },
  { to: '/nghiep-vu/phieu-thu', label: 'Lập chứng từ đầu tiên', sub: 'Phiếu thu, phiếu chi, phiếu mua, bán…' },
];

export function DonViTrang() {
  const q = useQuery({ queryKey: ['setup-status'], queryFn: () => api.get<SetupStatus>('/api/v1/setup/status'), staleTime: 60_000, retry: false });
  if (!q.data?.empty) return null;
  if (!q.data.canSetup) {
    return <div className="alert alert-warn" style={{ marginBottom: 12 }}><b>Đơn vị chưa có dữ liệu.</b> Nhờ chủ đơn vị hoặc kế toán trưởng thiết lập (danh mục, số dư đầu kỳ) trước khi nhập chứng từ.</div>;
  }
  return (
    <section className="card card-body" style={{ marginBottom: 12 }}>
      <b>Đơn vị chưa có chứng từ nào</b>
      <p className="muted" style={{ margin: '4px 0 10px' }}>Các báo cáo đang trống vì sổ chưa có số. Bắt đầu theo một trong ba đường:</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {DUONG.map((d) => (
          <Link key={d.to} to={d.to} className="btn" style={{ flexDirection: 'column', alignItems: 'flex-start', height: 'auto', padding: '8px 12px' }}>
            <span>{d.label} <ArrowRight size={13} /></span>
            <small className="muted">{d.sub}</small>
          </Link>
        ))}
      </div>
      <small className="muted" style={{ display: 'block', marginTop: 8 }}>Sắp có: <b>Thiết lập nhanh</b> — nạp một công ty mẫu đủ 3 tháng nghiệp vụ để xem toàn bộ báo cáo có số.</small>
    </section>
  );
}
