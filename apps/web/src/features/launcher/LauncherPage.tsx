// [2026-11-06 12:20 AM Nguyễn Văn Thủy] MENU — Tổng quan khớp menu trái: lưới theo nhóm việc, thêm trang chủ nhóm (đóng góp)
/**
 * Trang chủ nhóm (/nhom/<key>): sơ đồ ít chữ (layout/so-do-nhom.ts) và hàng Tiện ích; nhóm không có quy trình (Danh mục, Hệ thống…)
 * là các mục dạng thẻ. Sơ đồ đầy đủ (phan-he/flows.tsx) và Trụ cột mở từ hàng Tiện ích (?xem=chi-tiet, ?xem=tru-cot).
 * Trang chủ phân hệ (/app/<key>) chỉ còn dùng cho module SDK; phân hệ lõi tự chuyển sang trang chủ nhóm.
 */
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Columns3, HelpCircle, LayoutGrid, Workflow } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { PageHeader } from '@/components/PageHeader';
import { HelpDrawer } from '@/components/HelpDrawer';
import { SoDoNhom } from './SoDoNhom';
import { SO_DO } from '../../layout/so-do-nhom';
import { DANG_PHAT_TRIEN } from '../../layout/menu-gon';
import { MODULES, isSection, moduleMenu } from '../../layout/menu';
import { useAppMenu } from '../../layout/useAppMenu';
import { ModuleIcon } from '../../phan-he/icons';
import { GonIcon } from '../../layout/SideNav';
import { useGonGroups } from '../../layout/useGon';
import { MODULE_FLOWS } from '../../phan-he/flows';
// [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — thẻ "Trụ cột" cạnh "Quy trình": phân hệ này dựa vào trụ cột nào của Core, đạt tới đâu (training cho kế toán, kim chỉ nam cho dev)
import { PillarMatrix } from '../system/PillarsPage';
import '@/components/quy-trinh/quy-trinh.css';

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
        : soDo ? (
          // Sơ đồ bên trái, báo cáo hay dùng của nhóm bên phải (bố cục trang Quy trình phổ biến).
          <div className={`sd-layout${g.reports.length || soDo.reports?.length ? "" : " no-bc"}`}>
            <div className="sd-main"><SoDoNhom soDo={soDo} canOpen={(p) => seen.has(p.split('?')[0]!)} extra={nutPhu} /></div>
            {(soDo.reports?.length || g.reports.length > 0) && (
              <aside className="card sd-bc">
                <b>Báo cáo</b>
                {soDo.reports
                  ? soDo.reports.filter((r) => !r.path || seen.has(r.path)).map((r) => (r.path
                    ? <Link key={r.label} to={r.path}>{r.label}</Link>
                    : <span key={r.label} className="sd-bc-soon" title="Đang phát triển, sẽ có ở bản sau">{r.label} <small>{DANG_PHAT_TRIEN}</small></span>))
                  : g.reports.flatMap((s) => s.items).slice(0, 7).map((m) => <Link key={m.key} to={m.path!} title={m.code ? `${m.label} (${m.code})` : m.label}>{m.label}</Link>)}
                <Link className="sd-bc-all" to={`/bao-cao?nhom=${g.key}`}>Tất cả báo cáo ›</Link>
              </aside>
            )}
          </div>
        )
        : (
          <>
            <div className="module-home-grid">
              {g.sections.map((s, i) => (
                <div key={s.label ?? i} className="card module-home-card">
                  <div className="module-home-card-head" style={{ borderColor: g.color }}>{s.label ?? g.label}</div>
                  <div className="module-home-card-body">
                    {s.items.map((m) => <Link key={m.key} to={m.path!} className="module-home-item" title={m.code ? `${m.label} (${m.code})` : m.label}><span>{m.label}</span></Link>)}
                    {s.soon?.map((label) => <span key={label} className="module-home-item disabled" title="Đang phát triển, sẽ có ở bản sau"><span>{label}</span><small>{DANG_PHAT_TRIEN}</small></span>)}
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
