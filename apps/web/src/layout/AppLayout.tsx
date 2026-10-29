/**
 * Khung trang sau khi đăng nhập: thanh trên cùng (logo, thanh phân hệ, màn đã ghim, tìm chức năng, người dùng),
 * thanh menu chức năng bên trái (theo phân hệ đang chọn) và vùng làm việc nhiều thẻ.
 */
import { useTenant } from '../features/system/TenantPage';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { BarChart3, KeyRound, LogOut, Menu } from 'lucide-react';
import { ChangePasswordModal } from '@/features/access/ChangePasswordModal';
import { ROLE_LABELS, type Role } from '@ketoan/contracts';
import { api } from '@/lib/api';
import { useAuth, inFrame } from '@/lib/auth';
import { SideNav, sideNavCollapsed, sideNavWidth } from './SideNav';
import { PinBar } from './PinBar';
import { MenuSearch } from './MenuSearch';
import { TabWorkspace } from './TabWorkspace';
import { ModuleBar, useActiveModule } from './ModuleBar';
import { useFitTables } from './fitTables';
import { MobileNav } from './MobileNav';
import { AssistantBubble, TroLyDock } from '../addins/tro-ly/AssistantBubble';
import { useAddIns, useAppMenu } from './useAppMenu';
import { ModuleIcon } from '../phan-he/icons';
import { NutChiNhanh } from '@/components/ChiNhanhLamViec';
import { DangOnline } from './DangOnline';
import { workBranch } from '@/lib/workBranch';

export function AppLayout() {
  const { user, logout } = useAuth();
  // Chi nhánh đang làm việc lưu theo đơn vị × người dùng.
  workBranch.setScope(user ? `${user.tenant.id}:${user.id}` : '');
  const { pathname } = useLocation();
  const [changingPassword, setChangingPassword] = useState(false);
  // Điện thoại / máy tính bảng dọc: menu trượt mở bằng nút ☰.
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(sideNavCollapsed.get());
  const collapse = (v: boolean) => { sideNavCollapsed.set(v); setCollapsed(v); };
  // Bề rộng menu trái: kéo mép phải menu để đổi, nhớ theo máy.
  const [navWidth, setNavWidth] = useState(sideNavWidth.get());
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = navWidth;
    let w = w0;
    const move = (ev: MouseEvent) => { w = Math.min(520, Math.max(200, w0 + ev.clientX - x0)); setNavWidth(w); };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.style.cursor = ''; sideNavWidth.set(w); };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  const addins = useAddIns();
  const menu = useAppMenu();
  const { data: tenant } = useTenant();
  const mod = useActiveModule(menu);
  useFitTables();
  // Trang Tổng quan (lưới phân hệ) rộng hết màn; các trang khác có menu chức năng của phân hệ ở bên trái.
  const sideNav = pathname !== '/';
  // Bản cài sổ thuế (BOOK_MODE=tax): nhãn đỏ cạnh tên để không nhầm với sổ nội bộ.
  const sysInfo = useQuery({ queryKey: ['book-mode'], queryFn: () => api.get<{ bookMode?: string; envLabel?: string }>('/api/v1/system/health'), staleTime: Infinity }).data;
  const bookMode = sysInfo?.bookMode;
  // Bản test (ENV_LABEL): dải màu trên đầu + tiền tố tiêu đề thẻ trình duyệt, để không nhầm nhập số thật vào.
  const envLabel = (sysInfo?.envLabel ?? '').trim();
  useEffect(() => {
    if (!envLabel) return;
    const t = document.title;
    if (!t.startsWith(`[${envLabel}]`)) document.title = `[${envLabel}] ${t}`;
  });
  // Dải cao cố định (--env-h) để khung trang trừ đúng phần này — không thì cả trang dài hơn màn hình, thanh cuộn ngang của bảng bị đẩy xuống dưới.
  useEffect(() => {
    if (!envLabel) return;
    document.documentElement.style.setProperty('--env-h', '18px');
    return () => { document.documentElement.style.removeProperty('--env-h'); };
  }, [envLabel]);
  const envBanner = envLabel ? (
    <div style={{ position: 'sticky', top: 0, zIndex: 1000, boxSizing: 'border-box', height: 'var(--env-h, 18px)', lineHeight: '17px', overflow: 'hidden', textAlign: 'center', padding: '0 8px', fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fef3c7', borderBottom: '1px solid #fcd34d' }}>
      {envLabel} · dữ liệu thử
    </div>
  ) : null;

  // Nhúng: Ctrl + K mở ô tìm màn của trang quản trị (menu nằm bên đó).
  useEffect(() => {
    if (!inFrame) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); window.parent.postMessage({ type: 'ketoan:search' }, '*'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Nhúng trong trang quản trị: menu nằm bên trang quản trị → bỏ logo, thanh trên, menu trái, dải thẻ; chỉ còn màn hình.
  if (inFrame) {
    return (
      <div className="shell no-nav embed">
        {envBanner}
        <main className="page">
          <TabWorkspace menu={menu} />
          <div className="print-sign">
            <div><b>Người lập biểu</b><span>(Ký, họ tên)</span></div>
            <div><b>Kế toán trưởng</b><span>(Ký, họ tên)</span></div>
            <div><b>Giám đốc</b><span>(Ký, họ tên, đóng dấu)</span></div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      {envBanner}
      <header className="topbar">
        <button type="button" className="mnav-btn" onClick={() => setMobileNav(true)} aria-label="Mở menu"><Menu size={20} /></button>
        <Link to="/" className="brand">
          {tenant?.logo
            ? <span className="brand-logo" style={{ background: '#fff', width: 'auto', minWidth: 34, padding: '0 4px' }}><img src={tenant.logo} alt="" style={{ maxHeight: 26, maxWidth: 90 }} /></span>
            : <span className="brand-logo"><BarChart3 size={17} color="#2a6cc4" /></span>}
          <span>
            ERP{bookMode === 'tax' && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, background: '#d93025', color: '#fff', fontSize: 11, fontWeight: 700 }}>SỔ THUẾ</span>}
            <small>{user?.tenant.name}</small>
          </span>
        </Link>
        <ModuleBar modules={mod.modules} current={mod.current.key} />
        <PinBar menu={menu} />
        <div className="topbar-right">
          {/* Robot trợ lý khi đã bấm "Ẩn": thu gọn thành biểu tượng ở đây. */}
          {addins.some((a) => a.id === 'tro-ly') && <TroLyDock />}
          <DangOnline menu={menu} />
          <NutChiNhanh />
          <MenuSearch items={menu} />
          <span className="user-chip" title={user?.email}>
            {user?.fullName} <small>{ROLE_LABELS[user?.role as Role] ?? user?.role}</small>
          </span>
          <button className="btn btn-sm btn-ghost" style={{ color: 'var(--topbar-ink)' }} onClick={() => setChangingPassword(true)} title="Đổi mật khẩu">
            <KeyRound size={16} />
          </button>
          <button className="btn btn-sm btn-ghost" style={{ color: 'var(--topbar-ink)' }} onClick={logout} title="Đăng xuất">
            <LogOut size={16} />
          </button>
        </div>
      </header>
      {/* Menu trái: chức năng của phân hệ đang chọn (trang Tổng quan không có). */}
      <div className={`shell ${!sideNav ? 'no-nav' : collapsed ? 'nav-collapsed' : ''}`} style={sideNav && !collapsed ? { gridTemplateColumns: `${navWidth}px minmax(0, 1fr)` } : undefined}>
      {sideNav && <SideNav title={<Link to={`/app/${mod.current.key}`} className="sidenav-module" style={{ color: 'inherit' }}><span className="sidenav-module-icon" style={{ background: mod.current.color }}><ModuleIcon name={mod.current.icon} size={14} color="#fff" /></span>{mod.current.label}</Link>} items={mod.items} collapsed={collapsed} onCollapse={collapse} onResizeStart={startResize} />}
      <main className="page">
        <TabWorkspace menu={menu} />
        {/* Chỉ hiện khi in sổ, báo cáo: các ô chữ ký cuối trang. */}
        <div className="print-sign">
          <div><b>Người lập biểu</b><span>(Ký, họ tên)</span></div>
          <div><b>Kế toán trưởng</b><span>(Ký, họ tên)</span></div>
          <div><b>Giám đốc</b><span>(Ký, họ tên, đóng dấu)</span></div>
        </div>
      </main>
      </div>
      {/* Robot trợ lý góc màn hình: chỉ khi add-in Trợ lý đang bật. */}
      {addins.some((a) => a.id === 'tro-ly') && <AssistantBubble menu={menu} />}
      {mobileNav && <MobileNav modules={mod.modules} current={mod.current.key} menu={menu} onChoose={mod.choose} onClose={() => setMobileNav(false)} />}
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </>
  );
}
