// [2026-11-06 12:20 AM Nguyễn Văn Thủy] MENU — Tổng quan khớp menu trái: lưới theo nhóm việc, thêm trang chủ nhóm (đóng góp)
/**
 * Trang Tổng quan (/): lưới các NHÓM VIỆC, cùng tên, biểu tượng, thứ tự với menu trái (layout/menu-gon.ts). Bấm một ô → trang chủ nhóm.
 * Chỉ hiện nhóm người dùng có ít nhất một chức năng (theo quyền, phân hệ đang bật).
 *
 * Trang chủ nhóm (/nhom/<key>): sơ đồ ít chữ (layout/so-do-nhom.ts) và hàng Tiện ích; nhóm không có quy trình (Danh mục, Hệ thống…)
 * là các mục dạng thẻ. Sơ đồ đầy đủ (phan-he/flows.tsx) và Trụ cột mở từ hàng Tiện ích (?xem=chi-tiet, ?xem=tru-cot).
 * Trang chủ phân hệ (/app/<key>) chỉ còn dùng cho module SDK; phân hệ lõi tự chuyển sang trang chủ nhóm.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Columns3, HelpCircle, LayoutGrid, Workflow } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { HelpDrawer } from '@/components/HelpDrawer';
import { SoDoNhom } from './SoDoNhom';
import { SO_DO } from '../../layout/so-do-nhom';
import { MODULES, isSection, moduleMenu } from '../../layout/menu';
import { useAppMenu, useEnabledModules } from '../../layout/useAppMenu';
import { ModuleIcon } from '../../phan-he/icons';
import { GonIcon } from '../../layout/SideNav';
import { useGonGroups } from '../../layout/useGon';
import { groupCount, REPORT_PAGE } from '../../layout/menu-gon';
import { MODULE_FLOWS } from '../../phan-he/flows';
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G5): ô của module SDK trên Tổng quan (dashboard.widget)
import { sdkSlots } from '../../phan-he/sdk-modules';
// [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — thẻ "Trụ cột" cạnh "Quy trình": phân hệ này dựa vào trụ cột nào của Core, đạt tới đâu (training cho kế toán, kim chỉ nam cho dev)
import { PillarMatrix } from '../system/PillarsPage';
import '@/components/quy-trinh/quy-trinh.css';

export function LauncherPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const menu = useAppMenu();
  const enabled = useEnabledModules();
  const groups = useGonGroups(menu);
  const reportCount = new Set(groups.flatMap((g) => g.reports.flatMap((s) => s.items.map((i) => i.path)))).size;
  return (
    <>
      <PageHeader title={`Xin chào${user?.fullName ? `, ${user.fullName}` : ''}`} subtitle={user?.tenant.name ? `${user.tenant.name} — chọn việc cần làm` : 'Chọn việc cần làm'} helpKey="trang-chu" />
      <div className="launcher-grid gon-grid">
        {groups.map((g) => (
          <button key={g.key} type="button" className="launcher-app" title={`${g.description} (${groupCount(g)} chức năng)`} onClick={() => navigate(g.home)}>
            <span className="launcher-icon" style={{ background: `linear-gradient(135deg, ${g.color}, ${g.color}cc)` }}><GonIcon name={g.icon} size={26} color="#fff" /></span>
            <span className="launcher-name">{g.label}</span>
          </button>
        ))}
        {reportCount > 0 && (
          <button type="button" className="launcher-app" title={`Tất cả báo cáo, sổ sách theo từng loại (${reportCount} báo cáo)`} onClick={() => navigate(REPORT_PAGE)}>
            <span className="launcher-icon" style={{ background: 'linear-gradient(135deg, #2a6cc4, #2a6cc4cc)' }}><BarChart3 size={26} color="#fff" /></span>
            <span className="launcher-name">Báo cáo</span>
          </button>
        )}
      </div>
      {(() => {
        const widgets = sdkSlots('dashboard.widget').filter((s) => (!enabled || enabled.has(s.module)) && (!s.permission || can(s.permission)));
        return widgets.length > 0 && <div className="launcher-widgets">{widgets.map((s) => <div key={s.module} className="card card-body"><b>{s.label}</b><s.component /></div>)}</div>;
      })()}
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
  const xem = sp.get('xem');
  const view = xem === 'tru-cot' ? 'pillars' : Flow && xem !== 'chuc-nang' ? 'flow' : 'all';
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
      <div className="tabs module-home-tabs" role="tablist">
        {Flow && <button role="tab" className={`tab ${view === 'flow' ? 'active' : ''}`} onClick={() => setSp({}, { replace: true })}><Workflow size={14} style={{ verticalAlign: -2 }} /> Quy trình</button>}
        <button role="tab" className={`tab ${view === 'all' ? 'active' : ''}`} onClick={() => setSp(Flow ? { xem: 'chuc-nang' } : {}, { replace: true })}><LayoutGrid size={14} style={{ verticalAlign: -2 }} /> Tất cả chức năng</button>
        <button role="tab" className={`tab ${view === 'pillars' ? 'active' : ''}`} onClick={() => setSp({ xem: 'tru-cot' }, { replace: true })} title="Phân hệ này dựa vào trụ cột nào của Core và hôm nay đạt tới đâu"><Columns3 size={14} style={{ verticalAlign: -2 }} /> Trụ cột</button>
      </div>
      {view === 'pillars' ? <PillarMatrix module={mod.key} compact /> : view === 'flow' && Flow ? <Flow /> : <>
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

export function GroupHomePage() {
  const { key = '' } = useParams();
  const menu = useAppMenu();
  const [sp, setSp] = useSearchParams();
  const [help, setHelp] = useState(false);
  const groups = useGonGroups(menu);
  const g = groups.find((x) => x.key === key);
  if (!g) return <div className="card card-body">Không có nhóm "{key}" hoặc bạn chưa được cấp chức năng nào trong nhóm này. <Link to="/">Về trang Tổng quan</Link></div>;
  const seen = new Set(groups.flatMap((x) => [...x.sections, ...x.reports].flatMap((s) => s.items.map((i) => i.path!.split('?')[0]))));
  const Flow = g.module ? MODULE_FLOWS[g.module] : undefined;
  const xem = sp.get('xem');
  const soDo = SO_DO[g.key];
  const helpKey = Flow ? `${g.module}-quy-trinh` : 'trang-chu';
  const nutPhu = (
    <>
      {Flow && <button type="button" onClick={() => setSp({ xem: 'chi-tiet' }, { replace: true })} title="Sơ đồ đầy đủ: từng bước phần mềm tự làm gì, việc cần làm"><Workflow size={16} /> Luồng chi tiết</button>}
      {g.module && <button type="button" onClick={() => setSp({ xem: 'tru-cot' }, { replace: true })} title="Nhóm này dựa vào trụ cột nào của Core và hôm nay đạt tới đâu"><Columns3 size={16} /> Trụ cột</button>}
      <button type="button" onClick={() => setHelp(true)}><HelpCircle size={16} /> Hướng dẫn</button>
    </>
  );
  const veSoDo = <button type="button" className="btn btn-sm" style={{ marginBottom: 10 }} onClick={() => setSp({}, { replace: true })}><ArrowLeft size={14} /> Về sơ đồ</button>;
  return (
    <>
      {xem === 'tru-cot' && g.module ? <>{veSoDo}<PillarMatrix module={g.module} compact /></>
        : xem === 'chi-tiet' && Flow ? <>{veSoDo}<Flow /></>
        : soDo ? <SoDoNhom soDo={soDo} canOpen={(p) => seen.has(p.split('?')[0]!)} extra={nutPhu} />
        : (
          <>
            <div className="module-home-grid">
              {g.sections.map((s, i) => (
                <div key={s.label ?? i} className="card module-home-card">
                  <div className="module-home-card-head" style={{ borderColor: g.color }}>{s.label ?? g.label}</div>
                  <div className="module-home-card-body">
                    {s.items.map((m) => <Link key={m.key} to={m.path!} className="module-home-item" title={m.code ? `${m.label} (${m.code})` : m.label}><span>{m.label}</span></Link>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="card sd-links"><div>{nutPhu}</div></div>
          </>
        )}
      {help && <HelpDrawer guideKey={helpKey} onClose={() => setHelp(false)} />}
    </>
  );
}
