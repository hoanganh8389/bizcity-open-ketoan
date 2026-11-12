/**
 * [2026-11-13 Nguyễn Văn Thủy] QUY TRÌNH DANH MỤC — trang chủ phân hệ Danh mục (thẻ "Quy trình") (đóng góp)
 * Góc người quản trị: nhìn một lần thấy cả hệ thống đi theo thứ tự
 *   khai báo tổ chức → hàng hoá → đối tượng → cấu hình → phân quyền → báo cáo tổng hợp.
 * Mỗi bước: bấm để mở màn; ô nhỏ phía trên là khai báo đi kèm; phía dưới là chỗ xem lại / đối chiếu.
 * Dùng chung khung giao diện với Quy trình mua hàng (mf-*). Không có nội dung kỹ thuật.
 */
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as Icons from 'lucide-react';
import { api } from '@/lib/api';
import '../mua-hang/quy-trinh/quy-trinh-mua-hang.css';

interface Node { label: string; code?: string; icon: string; color: string; path: string; hint?: string; soon?: boolean; count?: string }
interface Stage { node: Node; auto: ReactNode[]; config: Node[]; side: Node[] }

const GRAY = '#64748b';
const STAGES: Stage[] = [
  {
    node: { label: 'Cơ cấu tổ chức', code: 'DM16', icon: 'Network', color: '#0d7a6f', path: '/danh-muc/so-do-to-chuc' },
    auto: ['Một cây: công ty → vùng → chi nhánh → tỉnh → cửa hàng', 'Mã số thuế đặt ở tỉnh, cửa hàng và kho bên dưới tự theo', 'Đổi cơ cấu, đổi mã số thuế có ngày hiệu lực — chứng từ cũ giữ nguyên'],
    config: [
      { label: 'Chi nhánh, cửa hàng', code: 'DM02', icon: 'Store', color: GRAY, path: '/danh-muc/chi-nhanh', hint: 'Gắn vào một nút trên cây', count: 'branches' },
      { label: 'Kho', code: 'DM12', icon: 'Warehouse', color: GRAY, path: '/danh-muc/kho', hint: 'Mỗi chi nhánh có kho mặc định', count: 'warehouses' },
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
    auto: ['Khách hàng, nhà cung cấp, nhân viên dùng chung một danh mục', 'Khai một lần, chứng từ mua, bán, thu chi chọn lại'],
    config: [
      { label: 'Nhà cung cấp', icon: 'Building2', color: GRAY, path: '/danh-muc/nha-cung-cap' },
      { label: 'Nhóm đối tượng', icon: 'UsersRound', color: GRAY, path: '/danh-muc/nhom-doi-tuong' },
      { label: 'Bộ phận', icon: 'Briefcase', color: GRAY, path: '/danh-muc/bo-phan', hint: 'Bán hàng, Mua hàng, Kế toán, Kho vận…' },
    ],
    side: [
      { label: 'Tài khoản ngân hàng', icon: 'Landmark', color: '#2d9cdb', path: '/danh-muc/ngan-hang' },
    ],
  },
  {
    node: { label: 'Cấu hình hạch toán', icon: 'Settings2', color: '#e8710a', path: '/cau-hinh/tai-khoan-ngam-dinh' },
    auto: ['Chứng từ tự định khoản theo khai báo', 'Khai một nơi, mọi phân hệ dùng chung'],
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

const Icon = ({ name, size = 18, color }: { name: string; size?: number; color?: string }) => {
  const C = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] || Icons.Circle;
  return <C size={size} color={color} />;
};

export function QuyTrinhDanhMuc() {
  const navigate = useNavigate();
  const dd = useQuery({ queryKey: ['default-data'], queryFn: () => api.get<{ datasets: { key: string; currentCount: number }[] }>('/api/v1/default-data'), staleTime: 60_000 });
  const counts = new Map((dd.data?.datasets ?? []).map((d) => [d.key, d.currentCount]));
  const badge = (n: Node) => {
    if (n.soon) return <span className="mf-badge info">sắp có</span>;
    const c = n.count ? counts.get(n.count) : undefined;
    return c !== undefined ? <span className="mf-badge info">{c.toLocaleString('vi-VN')}</span> : null;
  };
  const small = (n: Node, kind: 'cfg' | 'side') => (
    <div key={n.path + n.label} className={`mf-small ${kind}`} role="button" tabIndex={0} title={n.hint} onClick={() => navigate(n.path)} onKeyDown={(e) => e.key === 'Enter' && navigate(n.path)}>
      <span className="mf-small-icon" style={{ color: n.color }}><Icon name={n.icon} size={16} /></span>
      <span className="mf-small-text">
        <span className="mf-small-label">{n.label}{n.code && <i>{n.code}</i>}</span>
        {n.hint && <span className="mf-small-hint">{n.hint}</span>}
        {badge(n)}
      </span>
    </div>
  );

  return (
    <div className="mf">
      <div className="mf-card">
        <div className="mf-head">Khai báo một lần — mọi chứng từ mua, bán, kho, quỹ dùng chung</div>
        <div className="mf-scroll">
          <div className="mf-grid" style={{ ['--n' as string]: STAGES.length, gridTemplateColumns: `96px ${STAGES.map(() => 'minmax(126px, 1fr)').join(' ')}` }}>
            <div className="mf-lane-label cfg"><Icons.Settings2 size={15} /> Khai báo kèm<small>làm cùng bước bên dưới</small></div>
            {STAGES.map((s, i) => <div key={i} className={`mf-cell cfg ${s.config.length ? 'has' : ''}`}>{s.config.map((n) => small(n, 'cfg'))}</div>)}

            <div className="mf-lane-label main"><Icons.Workflow size={15} /> Thứ tự<small>làm từ trái sang phải</small></div>
            {STAGES.map((s, i) => (
              <div key={i} className={`mf-cell main ${i < STAGES.length - 1 ? 'next' : ''}`}>
                <div className="mf-stage" role="button" tabIndex={0} title="Bấm để mở" style={{ ['--c' as string]: s.node.color }}
                  onClick={() => navigate(s.node.path)} onKeyDown={(e) => e.key === 'Enter' && navigate(s.node.path)}>
                  <div className="mf-stage-top">
                    <span className="mf-num">{i + 1}</span>
                    <span className="mf-stage-icon"><Icon name={s.node.icon} size={22} color="#fff" /></span>
                    {badge(s.node)}
                  </div>
                  <div className="mf-stage-label">{s.node.label}{s.node.code && <i>{s.node.code}</i>}</div>
                  <ul className="mf-auto">{s.auto.map((a, k) => <li key={k}><Icons.Sparkles size={12} /> <span>{a}</span></li>)}</ul>
                </div>
              </div>
            ))}

            <div className="mf-lane-label side"><Icons.CornerDownRight size={15} /> Xem thêm<small>dùng khi cần</small></div>
            {STAGES.map((s, i) => <div key={i} className={`mf-cell side ${s.side.length ? 'has' : ''}`}>{s.side.map((n) => small(n, 'side'))}</div>)}
          </div>
          <div className="mf-loop">
            <Icons.RefreshCcw size={14} /> Danh mục càng gọn, chứng từ càng ít sai: chọn chi nhánh là có kho, có mã số thuế; chọn mặt hàng là có đơn vị tính, thuế suất, tài khoản.
            {' '}Cần làm lại từ đầu: <Link to="/tien-ich/du-lieu-goc">Dữ liệu gốc</Link>.
          </div>
        </div>
      </div>
    </div>
  );
}
