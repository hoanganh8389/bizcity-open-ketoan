// [2026-11-14 03:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-3 (B1, chữ chốt PHASE-036 · 00 §10): biểu ngữ "Đơn vị chưa có chứng từ" ở Tổng quan — chỉ đường thay cho màn số "—"
// [2026-11-14 07:41 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-5 (B3, 00 §12): lối vào Thiết lập nhanh (module thiet-lap, TI15) — nút chính khi module bật, hộp nhắc một lần mỗi phiên; bỏ dòng "sắp có"
/**
 * Đơn vị trắng (core.setup.status): chưa có bút toán, chưa có chứng từ ở trạng thái nào.
 *  - Có quyền settings:write: nút Thiết lập nhanh (khi module `thiet-lap` có trong bản dựng và bật ở đơn vị) + ba đường bắt đầu
 *    (danh mục chuẩn TI08, số dư đầu kỳ, chứng từ đầu tiên). Lần đầu trong phiên: hộp nhắc Bắt đầu / Để sau.
 *  - Không có quyền: nhờ chủ đơn vị thiết lập.
 *  - Đơn vị đã có dữ liệu, hoặc gọi lỗi: không hiện gì (không chặn phần còn lại của Tổng quan).
 * Core chỉ biết đường dẫn của module (/app/thiet-lap), không import mã module.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui';
import { useEnabledModules } from '../../layout/useAppMenu';
import { SDK_WEB } from '../../phan-he/sdk-modules';

interface SetupStatus { empty: boolean; kinds: string[]; canSetup: boolean }

const DUONG = [
  { to: '/tien-ich/du-lieu-goc', label: 'Nạp danh mục chuẩn', sub: 'Dữ liệu gốc (TI08): xem trước rồi nạp' },
  { to: '/nghiep-vu/so-du-tai-khoan', label: 'Nhập số dư đầu kỳ', sub: 'Tiền, công nợ, hàng tồn khi bắt đầu dùng' },
  { to: '/nghiep-vu/phieu-thu', label: 'Lập chứng từ đầu tiên', sub: 'Phiếu thu, phiếu chi, phiếu mua, bán…' },
];

const THIET_LAP = { key: 'thiet-lap', path: '/app/thiet-lap' };
const DE_SAU = 'bizcity:thiet-lap:de-sau';
const daDeSau = (): boolean => { try { return sessionStorage.getItem(DE_SAU) === '1'; } catch { return false; } };
const ghiDeSau = (): void => { try { sessionStorage.setItem(DE_SAU, '1'); } catch { /* trình duyệt chặn lưu: hộp nhắc hiện lại lần sau, không sao */ } };

export function DonViTrang() {
  const q = useQuery({ queryKey: ['setup-status'], queryFn: () => api.get<SetupStatus>('/api/v1/setup/status'), staleTime: 60_000, retry: false });
  const enabled = useEnabledModules();
  const navigate = useNavigate();
  const [nhac, setNhac] = useState(() => !daDeSau());
  const coThietLap = SDK_WEB.some((m) => m.meta.key === THIET_LAP.key) && (!enabled || enabled.has(THIET_LAP.key));
  if (!q.data?.empty) return null;
  if (!q.data.canSetup) {
    return <div className="alert alert-warn" style={{ marginBottom: 12 }}><b>Đơn vị chưa có dữ liệu.</b> Nhờ chủ đơn vị hoặc kế toán trưởng thiết lập (danh mục, số dư đầu kỳ) trước khi nhập chứng từ.</div>;
  }
  const deSau = () => { ghiDeSau(); setNhac(false); };
  const batDau = () => { ghiDeSau(); navigate(THIET_LAP.path); };
  return (
    <section className="card card-body" style={{ marginBottom: 12 }}>
      <b>Đơn vị chưa có chứng từ nào</b>
      <p className="muted" style={{ margin: '4px 0 10px' }}>Các báo cáo đang trống vì sổ chưa có số. Bắt đầu theo một trong các đường:</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {coThietLap && (
          <Link to={THIET_LAP.path} className="btn btn-primary" style={{ flexDirection: 'column', alignItems: 'flex-start', height: 'auto', padding: '8px 12px' }}>
            <span>Thiết lập nhanh <ArrowRight size={13} /></span>
            <small>Thông tin công ty, chế độ ghi sổ chuẩn (TI15)</small>
          </Link>
        )}
        {DUONG.map((d) => (
          <Link key={d.to} to={d.to} className="btn" style={{ flexDirection: 'column', alignItems: 'flex-start', height: 'auto', padding: '8px 12px' }}>
            <span>{d.label} <ArrowRight size={13} /></span>
            <small className="muted">{d.sub}</small>
          </Link>
        ))}
      </div>
      {coThietLap && nhac && (
        <Modal title="Thiết lập nhanh" onClose={deSau}
          footer={<><button type="button" className="btn" onClick={deSau}>Để sau</button><button type="button" className="btn btn-primary" onClick={batDau}>Bắt đầu</button></>}>
          <p>Đơn vị chưa có dữ liệu. Thiết lập nhanh mất khoảng 1 phút: thông tin công ty, chế độ ghi sổ chuẩn, danh mục mẫu nếu muốn.</p>
          <p className="muted">Bấm <b>Để sau</b> thì trong phiên này không hỏi lại; vẫn mở được bằng nút Thiết lập nhanh ở Tổng quan hoặc menu TI15.</p>
        </Modal>
      )}
    </section>
  );
}
