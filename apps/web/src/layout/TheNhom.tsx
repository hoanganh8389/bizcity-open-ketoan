// [2026-11-05 11:50 PM Nguyễn Văn Thủy] MENU — thẻ đầu trang của nhóm đang làm việc (đóng góp)
/**
 * Dải thẻ của nhóm đang làm việc: chuyển giữa các màn chính trong nhóm bằng một lần bấm. Thẻ cuối là Báo cáo của nhóm.
 * Nhóm không khai thẻ (Danh mục, Hệ thống…) thì không hiện dải này.
 */
import { Link, useLocation } from 'react-router-dom';
import { matchLen, REPORT_PAGE, type GonGroup } from './menu-gon';

export function TheNhom({ group }: { group?: GonGroup }) {
  const { pathname } = useLocation();
  if (!group?.the.length) return null;
  const links = [
    ...(group.home ? [{ key: 'home', label: group.homeLabel ?? 'Tổng quan', path: group.home, title: `Trang chủ ${group.label}` }] : []),
    ...group.the.map((m) => ({ key: m.key, label: m.label, path: m.path!, title: m.code ? `${m.label} (${m.code})` : m.label })),
  ];
  const reportPaths = group.reports.flatMap((s) => s.items);
  const best = Math.max(0, ...links.map((l) => matchLen(l.path, pathname)));
  const onReport = pathname === REPORT_PAGE || (best === 0 && reportPaths.some((m) => matchLen(m.path, pathname) > 0));
  return (
    <nav className="gon-the" aria-label={`Màn của nhóm ${group.label}`}>
      {links.map((l) => <Link key={l.key} to={l.path} title={l.title} className={best > 0 && matchLen(l.path, pathname) === best ? 'active' : ''}>{l.label}</Link>)}
      {reportPaths.length > 0 && <Link to={`${REPORT_PAGE}?nhom=${group.key}`} title={`Các báo cáo của nhóm ${group.label}`} className={onReport ? 'active' : ''}>Báo cáo</Link>}
    </nav>
  );
}
