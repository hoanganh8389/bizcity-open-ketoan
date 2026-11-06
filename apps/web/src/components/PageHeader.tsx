// [2026-11-06 01:10 AM Nguyễn Văn Thủy] MENU — mô tả dưới tiêu đề chuyển thành chú thích rê chuột để đỡ chữ
/**
 * Tiêu đề trang: tên, mã chức năng, mô tả ngắn (rê chuột vào biểu tượng i), các nút, nút "In" (in màn đang xem theo khổ giấy,
 * đầu trang có tên đơn vị, cuối trang có ô chữ ký) và nút "Hướng dẫn"
 * mở tài liệu sử dụng của chính màn này (docs/huong-dan/<helpKey>.md). Màn danh mục có dữ liệu gốc thì thêm nút
 * "Quay về dữ liệu gốc" (DEFAULT_DATA_SCREENS).
 */
import { useState, type ReactNode } from 'react';
import { HelpCircle, Info, Printer } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { HelpDrawer } from './HelpDrawer';
import { DEFAULT_DATA_SCREENS, RestoreDefaultsButton } from '@/features/flow/DefaultDataPages';

export function PageHeader({ title, code, subtitle, note, actions, helpKey }: { title: string; code?: string; subtitle?: string; /** Dòng luôn hiện dưới tiêu đề, dành cho thông tin theo dữ liệu đang xem. */ note?: string; actions?: ReactNode; helpKey?: string }) {
  const [help, setHelp] = useState(false);
  const { user } = useAuth();
  return (
    <div className="page-header">
      {/* Chỉ hiện khi in: tên đơn vị ở đầu trang. */}
      <div className="print-org">{user?.tenant.name}</div>
      <div>
        <div className="page-title">
          <h1>{title}</h1>
          {code && <span className="code">{code}</span>}
          {subtitle && <span className="page-info" title={subtitle} aria-label={subtitle}><Info size={14} /></span>}
        </div>
        {note && <div className="page-sub">{note}</div>}
      </div>
      <div className="page-actions">
        {actions}
        {code && DEFAULT_DATA_SCREENS[code] && <RestoreDefaultsButton datasetKey={DEFAULT_DATA_SCREENS[code]!.key} title={DEFAULT_DATA_SCREENS[code]!.title} />}
        {code && (
          <button className="btn" onClick={() => window.print()} title="In màn hình đang xem">
            <Printer size={16} /> In
          </button>
        )}
        {helpKey && (
          <button className="btn btn-help" onClick={() => setHelp(true)}>
            <HelpCircle size={16} /> Hướng dẫn
          </button>
        )}
      </div>
      {help && helpKey && <HelpDrawer guideKey={helpKey} onClose={() => setHelp(false)} />}
    </div>
  );
}
