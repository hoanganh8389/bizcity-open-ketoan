/**
 * Trang Tổng quan (/): lưới PHÂN HỆ như màn hình ứng dụng trên máy tính bảng — mỗi phân hệ một biểu tượng màu, tên,
 * mô tả, số chức năng. Bấm vào → trang chủ phân hệ (/app/<key>) với menu chức năng riêng của phân hệ đó.
 * Chỉ hiện phân hệ người dùng có ít nhất một chức năng (theo quyền). Danh sách phân hệ: src/modules.
 *
 * Trang chủ phân hệ (/app/<key>): phân hệ có lưu đồ (phan-he/flows.tsx) mở thẻ "Quy trình" — sơ đồ nghiệp vụ + việc cần
 * làm; thẻ "Tất cả chức năng" là các nhóm chức năng dạng thẻ, bấm chức năng để mở màn.
 */
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BarChart3, LayoutGrid, Workflow } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { MODULES, isSection, moduleMenu } from '../../layout/menu';
import { useAppMenu, useEnabledModules } from '../../layout/useAppMenu';
import { ModuleIcon } from '../../phan-he/icons';
import { MODULE_FLOWS } from '../../phan-he/flows';
import '@/components/quy-trinh/quy-trinh.css';

/** Số chức năng đã có (có đường dẫn) trong các nhóm của phân hệ. */
const countOf = (groups: MenuItem[]) => new Set(groups.flatMap((g) => (g.children ?? []).filter((c) => c.path && !isSection(c)).map((c) => c.path))).size;

export function LauncherPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const menu = useAppMenu();
  const enabled = useEnabledModules();
  const apps = MODULES.filter((m) => !enabled || enabled.has(m.key)).map((m) => ({ m, n: countOf(moduleMenu(menu, m.key)) })).filter((x) => x.n > 0);
  return (
    <>
      <PageHeader title={`Xin chào${user?.fullName ? `, ${user.fullName}` : ''}`} subtitle={user?.tenant.name ? `${user.tenant.name} — chọn phân hệ để làm việc` : 'Chọn phân hệ để làm việc'} helpKey="trang-chu" />
      <div className="launcher-grid">
        {apps.map(({ m, n }) => (
          <button key={m.key} type="button" className="launcher-app" onClick={() => navigate(`/app/${m.key}`)}>
            <span className="launcher-icon" style={{ background: `linear-gradient(135deg, ${m.color}, ${m.color}cc)` }}><ModuleIcon name={m.icon} size={30} color="#fff" /></span>
            <span className="launcher-name">{m.label}</span>
            <span className="launcher-desc">{m.description}</span>
            <span className="launcher-count">{n} chức năng</span>
          </button>
        ))}
      </div>
      <div className="launcher-links">
        <Link to="/bang-dieu-khien" className="launcher-link"><BarChart3 size={16} /> Bảng điều khiển số liệu (doanh thu, thuế, tiền thu, chứng từ lỗi)</Link>
      </div>
    </>
  );
}

export function ModuleHomePage() {
  const { key = '' } = useParams();
  const menu = useAppMenu();
  const [sp, setSp] = useSearchParams();
  const mod = MODULES.find((m) => m.key === key);
  const Flow = MODULE_FLOWS[key];
  const view = Flow && sp.get('xem') !== 'chuc-nang' ? 'flow' : 'all';
  if (!mod) return <div className="card card-body">Không có phân hệ "{key}". <Link to="/">Về trang Tổng quan</Link></div>;
  const own = moduleMenu(menu, mod.key).filter((g) => g.children?.some((c) => c.path) || g.path);
  // Phân hệ chỉ một nhóm có các mục con (vd Danh mục: Tài khoản · Đối tượng · Mặt hàng…): mỗi mục con một thẻ cho dễ nhìn.
  const groups = own.length === 1 && own[0]!.children?.some(isSection)
    ? own[0]!.children!.reduce<MenuItem[]>((acc, c) => { if (isSection(c)) acc.push({ key: c.key, label: c.label, children: [] }); else if (acc.length) acc[acc.length - 1]!.children!.push(c); else acc.push({ key: `${own[0]!.key}-dau`, label: own[0]!.label, children: [c] }); return acc; }, []).filter((g) => g.children?.length)
    : own;
  return (
    <>
      <div className="module-home-head">
        <span className="launcher-icon small" style={{ background: `linear-gradient(135deg, ${mod.color}, ${mod.color}cc)` }}><ModuleIcon name={mod.icon} size={22} color="#fff" /></span>
        <div style={{ flex: 1 }}>
          <PageHeader title={mod.label} subtitle={mod.description} helpKey={Flow ? `${mod.key}-quy-trinh` : 'trang-chu'} />
        </div>
      </div>
      {Flow && (
        <div className="tabs module-home-tabs" role="tablist">
          <button role="tab" className={`tab ${view === 'flow' ? 'active' : ''}`} onClick={() => setSp({}, { replace: true })}><Workflow size={14} style={{ verticalAlign: -2 }} /> Quy trình</button>
          <button role="tab" className={`tab ${view === 'all' ? 'active' : ''}`} onClick={() => setSp({ xem: 'chuc-nang' }, { replace: true })}><LayoutGrid size={14} style={{ verticalAlign: -2 }} /> Tất cả chức năng</button>
        </div>
      )}
      {view === 'flow' && Flow ? <Flow /> : <>
      {!groups.length && <div className="card card-body muted">Bạn chưa được cấp chức năng nào trong phân hệ này.</div>}
      <div className="module-home-grid">
        {groups.map((g) => (
          <div key={g.key} className="card module-home-card">
            <div className="module-home-card-head" style={{ borderColor: mod.color }}>{g.path ? <Link to={g.path}>{g.label}</Link> : g.label}</div>
            <div className="module-home-card-body">
              {(g.children ?? []).map((c) => (isSection(c) ? <div key={c.key} className="module-home-section">{c.label}</div>
                : c.path ? (
                  <Link key={c.key} to={c.path} className="module-home-item"><span>{c.label}</span>{c.code && <small>{c.code}</small>}</Link>
                ) : null))}
            </div>
          </div>
        ))}
      </div>
      </>}
    </>
  );
}
