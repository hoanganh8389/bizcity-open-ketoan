// [2026-11-06 01:30 AM Nguyễn Văn Thủy] MENU — thêm thanh mép phải, trợ lý và thông báo chuyển vào đó
// [2026-11-05 11:50 PM Nguyễn Văn Thủy] MENU — bỏ thanh phân hệ, menu trái gọn luôn hiện, thêm thẻ của nhóm
/**
 * Khung trang sau khi đăng nhập: thanh trên cùng (logo, màn đã ghim, tìm chức năng, người dùng),
 * thanh menu trái theo nhóm việc và vùng làm việc nhiều thẻ.
 */
import { useTenant } from '../features/system/TenantPage';
import { WindowDock } from './WindowDock';
import { Link } from 'react-router-dom';
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
import { useActiveModule } from './ModuleBar';
import { useGon } from './useGon';
import { TheNhom } from './TheNhom';
import { useFitTables } from './fitTables';
import { MobileNav } from './MobileNav';
import { RightRail } from './rail/RightRail';
import { useAddIns, useAppMenu } from './useAppMenu';
import { NutChiNhanh } from '@/components/ChiNhanhLamViec';
import { DangOnline } from './DangOnline';
import { workBranch } from '@/lib/workBranch';
import { MaTraCuu } from '@/components/MaTraCuu';
// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09: dòng nhắc sau khi lưu danh mục
import { SavedFlash } from '@/components/WhyPanel';

export function AppLayout() {
  const { user, logout } = useAuth();
  // Chi nhánh đang làm việc lưu theo đơn vị × người dùng.
  workBranch.setScope(user ? `${user.tenant.id}:${user.id}` : '');
  const [changingPassword, setChangingPassword] = useState(false);
  // Điện thoại / máy tính bảng dọc: menu trượt mở bằng nút ☰.
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(sideNavCollapsed.get());
  const collapse = (v: boolean) => { sideNavCollapsed.set(v); setCollapsed(v); };
  // Ctrl + B: đóng / mở menu trái (như các phần mềm soạn thảo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') { e.preventDefault(); setCollapsed((c) => { sideNavCollapsed.set(!c); return !c; }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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
  const gon = useGon(menu);
  useFitTables();
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
        <MaTraCuu />
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
        <PinBar menu={menu} />
        <div className="topbar-right">
          <SavedFlash />
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
      {/* Menu trái: nhóm theo việc, bấm mới bung danh sách màn. */}
      <div className={`shell ${collapsed ? 'nav-collapsed' : ''}`} style={!collapsed ? { gridTemplateColumns: `${navWidth}px minmax(0, 1fr)` } : undefined}>
      <SideNav groups={gon.groups} active={gon.active} onChoose={gon.choose} collapsed={collapsed} onCollapse={collapse} onResizeStart={startResize} />
      <main className="page">
        <TabWorkspace menu={menu} strip={<TheNhom group={gon.active} />} />
        {/* Thanh dưới đáy: hộp thoại đang mở / đã thu nhỏ, ô "Màn chính". */}
        <WindowDock />
        {/* Chỉ hiện khi in sổ, báo cáo: các ô chữ ký cuối trang. */}
        <div className="print-sign">
          <div><b>Người lập biểu</b><span>(Ký, họ tên)</span></div>
          <div><b>Kế toán trưởng</b><span>(Ký, họ tên)</span></div>
          <div><b>Giám đốc</b><span>(Ký, họ tên, đóng dấu)</span></div>
        </div>
      </main>
      </div>
      {/* Thanh mép phải: việc cần làm, trợ lý, thông báo. */}
      <RightRail menu={menu} groups={gon.groups} active={gon.active} assistant={addins.some((a) => a.id === 'tro-ly')} />
      {mobileNav && <MobileNav modules={mod.modules} current={mod.current.key} menu={menu} onChoose={mod.choose} onClose={() => setMobileNav(false)} />}
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
      {/* Mã tra cứu của lỗi API gần nhất (PHASE-019 W1): người dùng chép gửi dev. */}
      <MaTraCuu />
    </>
  );
}
