/**
 * [2026-11-13 Nguyễn Văn Thủy] QUY TRÌNH DANH MỤC — trang chủ phân hệ Danh mục (thẻ "Quy trình") (đóng góp)
 * Góc người quản trị: nhìn một lần thấy cả hệ thống đi theo thứ tự
 *   khai báo tổ chức → hàng hoá → đối tượng → cấu hình → phân quyền → báo cáo tổng hợp.
 * Mỗi bước: bấm để mở màn; ô nhỏ phía trên là khai báo đi kèm; phía dưới là chỗ xem lại / đối chiếu.
 * Dùng chung khung giao diện với Quy trình mua hàng (mf-*). Không có nội dung kỹ thuật.
 * [2026-11-13 02:50 PM Võ Hoàng] UX-14 — vẽ bằng khuôn dùng chung components/quy-trinh/LuongChiTiet (chữ chốt cap-nhat-ux/14); giao diện không đổi (đóng góp).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LuongChiTiet, type LuongNode } from '@/components/quy-trinh/LuongChiTiet';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Node extends LuongNode { label: string; code?: string; icon: string; color: string; path: string; hint?: string; soon?: boolean; count?: string }
interface Stage { node: Node; auto: ReactNode[]; config: Node[]; side: Node[] }

const GRAY = '#64748b';
const STAGES: Stage[] = [
  {
    node: { label: 'Cơ cấu tổ chức', code: 'DM16', icon: 'Network', color: '#0d7a6f', path: '/danh-muc/so-do-to-chuc' },
    auto: ['Một màn khai tất cả: công ty, cơ cấu các cấp, cửa hàng, kho, phòng ban — chọn loại rồi điền ô riêng của loại đó', 'Được nhiều công ty cha; xem dạng cây hoặc sơ đồ, bấm nút thấy bên trong có gì', 'Mỗi nút có lịch sử thay đổi: ai, lúc nào, đổi gì', 'Mã số thuế đặt ở tỉnh, cửa hàng và kho bên dưới tự theo', 'Đổi cơ cấu, đổi mã số thuế có ngày hiệu lực — chứng từ cũ giữ nguyên',
      'Mỗi chi nhánh, cửa hàng một phòng ban riêng: chứng từ của chi nhánh tự mang phòng ban',
      'Mỗi kho một loại: chứng từ tự chọn kho theo loại ưu tiên của nghiệp vụ, chặn kho sai loại'],
    config: [
      { label: 'Loại kho', code: 'DM18', icon: 'Layers', color: GRAY, path: '/danh-muc/loai-kho', hint: 'Được bán, thuộc sở hữu, nghiệp vụ dùng loại nào' },
    ],
    side: [],
  },
  {
    node: { label: 'Nhóm hàng', code: 'DM11', icon: 'FolderTree', color: '#2f80ed', path: '/danh-muc/phan-loai-hang' },
    auto: ['Ba cấp: ngành → nhãn → nhóm, mỗi cấp một mã ngắn', 'Mã ngắn khoá lại khi nhóm đã có mặt hàng', 'Mỗi lần thêm, sửa đều lưu lịch sử'],
    config: [],
    side: [],
  },
  {
    node: { label: 'Mặt hàng', code: 'DM10', icon: 'Package', color: '#27ae60', path: '/danh-muc/mat-hang', count: 'catalog_sample' },
    auto: ['Chọn nhóm cấp 3 là có sẵn mã kế tiếp', 'Mã biến thể giữ nguyên mã gốc, tên lấy sẵn', 'Số lượng luôn ghi theo đơn vị nhỏ nhất'],
    config: [
      { label: 'Đơn vị tính', icon: 'Ruler', color: GRAY, path: '/danh-muc/don-vi-tinh', hint: 'Tối đa 10 đơn vị cho một mặt hàng' },
      { label: 'Biểu thuế', icon: 'Percent', color: GRAY, path: '/danh-muc/loai-thue', hint: 'Thuế suất bán ra, mua vào', count: 'tax_codes' },
    ],
    side: [
      { label: 'Bảng giá', icon: 'Tags', color: '#16a085', path: '/danh-muc/bang-gia' },
    ],
  },
  {
    node: { label: 'Đối tượng', icon: 'Users', color: '#9b51e0', path: '/danh-muc/khach-hang', count: 'partners' },
    auto: ['Khách hàng, nhà cung cấp, nhân viên dùng chung một danh mục', 'Khai một lần, chứng từ mua, bán, thu chi chọn lại', 'Cha – con: đơn vị mẹ → chi nhánh, mã con = mã cha-001; số liệu gom lên cha'],
    config: [
      { label: 'Nhà cung cấp', icon: 'Building2', color: GRAY, path: '/danh-muc/nha-cung-cap' },
      { label: 'Nhóm đối tượng', icon: 'UsersRound', color: GRAY, path: '/danh-muc/nhom-doi-tuong' },
    ],
    side: [
      { label: 'Tài khoản ngân hàng', icon: 'Landmark', color: '#2d9cdb', path: '/danh-muc/ngan-hang' },
    ],
  },
  {
    node: { label: 'Cấu hình hạch toán', icon: 'Settings2', color: '#e8710a', path: '/cau-hinh/tai-khoan-ngam-dinh' },
    auto: ['Chứng từ tự định khoản theo khai báo', 'Khai một nơi, mọi phân hệ dùng chung', 'Tài khoản theo dõi phòng ban mà chi nhánh chưa gắn phòng ban → báo lỗi, vào Chi nhánh gắn'],
    config: [
      { label: 'Hệ thống tài khoản', icon: 'BookOpen', color: GRAY, path: '/danh-muc/tai-khoan' },
      { label: 'Hình thức thanh toán', icon: 'CreditCard', color: GRAY, path: '/cau-hinh/hinh-thuc-thanh-toan' },
      { label: 'Thông tin đơn vị', icon: 'BadgeInfo', color: GRAY, path: '/cau-hinh/don-vi', hint: 'Tên, logo in trên chứng từ' },
    ],
    side: [],
  },
  {
    node: { label: 'Phân quyền', icon: 'ShieldCheck', color: '#8e44ad', path: '/cau-hinh/nguoi-dung', soon: true },
    auto: ['Ai được xem, sửa chi nhánh nào, màn nào', 'Theo đúng nhánh trên cơ cấu tổ chức'],
    config: [
      { label: 'Người dùng', icon: 'UserCog', color: GRAY, path: '/cau-hinh/nguoi-dung' },
    ],
    side: [],
  },
  {
    node: { label: 'Báo cáo tổng hợp', icon: 'ChartLine', color: '#283593', path: '/bang-dieu-khien' },
    auto: ['Cộng dồn theo cây: cửa hàng → tỉnh → chi nhánh → toàn công ty', 'Lọc theo nhóm hàng ở mọi báo cáo theo mặt hàng'],
    config: [],
    side: [
      { label: 'Kết quả nhiều chi nhánh', icon: 'ChartColumn', color: '#283593', path: '/bao-cao/ket-qua-nhieu-chi-nhanh' },
      { label: 'Tồn nhiều kho', icon: 'Boxes', color: '#283593', path: '/bao-cao/ton-nhieu-kho' },
    ],
  },
];

export function QuyTrinhDanhMuc() {
  const dd = useQuery({ queryKey: ['default-data'], queryFn: () => api.get<{ datasets: { key: string; currentCount: number }[] }>('/api/v1/default-data'), staleTime: 60_000 });
  const counts = new Map((dd.data?.datasets ?? []).map((d) => [d.key, d.currentCount]));
  const badge = (n: Node) => {
    if (n.soon) return <span className="mf-badge info">sắp có</span>;
    const c = n.count ? counts.get(n.count) : undefined;
    return c !== undefined ? <span className="mf-badge info">{c.toLocaleString('vi-VN')}</span> : null;
  };
  return (
    <LuongChiTiet
      title="Khai báo một lần — mọi chứng từ mua, bán, kho, quỹ dùng chung"
      stages={STAGES.map((s) => ({ ...s, node: { ...s.node, auto: s.auto } }))}
      lanes={{ cfg: ['Khai báo kèm', 'làm cùng bước bên dưới'], main: ['Thứ tự', 'làm từ trái sang phải'], side: ['Xem thêm', 'dùng khi cần'] }}
      column={() => 'minmax(126px, 1fr)'}
      soonLabel="sắp có"
      badge={(n) => badge(n as Node)}
      loop={<>Danh mục càng gọn, chứng từ càng ít sai: chọn chi nhánh là có kho, có mã số thuế; chọn mặt hàng là có đơn vị tính, thuế suất, tài khoản.
        {' '}Cần làm lại từ đầu: <Link to="/tien-ich/du-lieu-goc">Dữ liệu gốc</Link>.</>}
    />
  );
}
