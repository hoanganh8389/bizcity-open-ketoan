// [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-036: khung phiếu bán / trả bán cùng mẫu phiếu mua — một nút Hướng dẫn, cột Trợ lý (đóng góp)
/**
 * Khung cửa sổ của một phiếu hàng (bán hàng, hàng bán trả lại) — dựng theo mẫu "Nhập mua (mới)" của phân hệ Mua hàng:
 *   Tiêu đề: tên phiếu + số + nhãn trạng thái · tổng tiền chữ lớn · MỘT nút "? Hướng dẫn" · thu nhỏ · đóng.
 *   Thân hai cột: trái = đầu phiếu + thẻ (form truyền vào `children`), phải = khung Trợ lý thu gọn được (`side`).
 *   Chân: lý do chưa ghi được bên trái (`footNote`), nút bên phải (`footer`).
 * Thay cho khung hộp thoại chung (Modal) — Modal tự thêm nút Hướng dẫn ở tiêu đề nên phiếu từng có hai nút. Các việc Modal làm
 * cho phiếu được làm lại ở đây:
 *   - Chế độ XEM (`viewing`): nhãn "Đang xem" ở tiêu đề; F2 / Enter / bấm đúp thân phiếu = Sửa (`onEdit`). Form tự khoá ô khi xem.
 *   - Ctrl + S: bấm nút chính (.btn-primary) ở chân khi đang sửa; nút đang khoá thì báo lý do (useKiemLoi). Esc: đóng.
 *   - Thu nhỏ xuống thanh dưới (useDockWindow — ẩn bằng CSS, dữ liệu đang nhập còn nguyên).
 *   - Báo lỗi tại ô (useKiemLoi): bấm Ghi mà ô bắt buộc trống → tô đỏ, báo ở chân.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DockScope, MinimizeButton, useDockWindow } from '@/layout/WindowDock';
import { useKiemLoi } from '@/components/useKiemLoi';
import { HelpDrawer } from '@/components/HelpDrawer';
import './khung-phieu.css';

const TRO_LY_AN = 'ph.tro-ly.an';

export function KhungPhieu({ title, badges, totalLabel, total, helpKey, viewing, readOnly, onEdit, onClose, sideTitle, side, footNote, footer, keys, lyDo, children }: {
  /** Tên phiếu + số phiếu (chữ của tiêu đề, cũng là tên ô ở thanh thu nhỏ). */
  title: string;
  /** Nhãn trạng thái cạnh tiêu đề (Nháp / Đã duyệt…). */
  badges?: ReactNode;
  totalLabel: string;
  total: number;
  /** Hướng dẫn mở từ nút "? Hướng dẫn" (HelpDrawer). */
  helpKey: string;
  /** Phiếu đã ghi đang ở chế độ xem (bấm Sửa mới sửa). */
  viewing: boolean;
  /** Phiếu chỉ xem hẳn (đã duyệt): không có Sửa; thân phiếu hiện kiểu "ô giá trị". */
  readOnly: boolean;
  onEdit: () => void;
  onClose: () => void;
  sideTitle: string;
  side: ReactNode;
  /** Dòng bên trái chân phiếu (vd "Chưa ghi được: …"); báo lỗi tại ô của useKiemLoi hiện đè lên. */
  footNote?: ReactNode;
  footer: ReactNode;
  /** Dòng phím tắt dưới thân phiếu. */
  keys?: string;
  /** Lý do nút Ghi đang khoá (useKiemLoi đọc khi bấm vào nút khoá / Ctrl + S). */
  lyDo?: () => string | null | undefined;
  children: ReactNode;
}) {
  const [help, setHelp] = useState(false);
  const [anTroLy, setAnTroLy] = useState(() => { try { return localStorage.getItem(TRO_LY_AN) === '1'; } catch { return false; } });
  const doiTroLy = (an: boolean) => { setAnTroLy(an); try { localStorage.setItem(TRO_LY_AN, an ? '1' : '0'); } catch { /* chế độ riêng tư */ } };
  const locked = viewing || readOnly;
  const kl = useKiemLoi(locked, { lyDo });
  const dock = useDockWindow(onClose);
  const sheet = useRef<HTMLDivElement>(null);

  // Phím tắt như khung hộp thoại chung: chỉ khung đang ở trên cùng (không thu nhỏ, không bị hộp thoại khác che) nhận phím.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (help || sheet.current !== [...document.querySelectorAll('.modal-mask:not(.is-min), .mh-sheet:not(.is-min)')].pop()) return;
      if (e.key === 'Escape') onClose();
      else if (!locked && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const btn = sheet.current?.querySelector<HTMLButtonElement>('.mh-sheet-foot .btn-primary:not(:disabled)');
        const khoa = sheet.current?.querySelector<HTMLButtonElement>('.mh-sheet-foot .btn-primary:disabled');
        if (btn) { e.preventDefault(); btn.click(); } else if (khoa) { e.preventDefault(); kl.kiem(khoa); }
      } else if (viewing && !readOnly && (e.key === 'F2' || (e.key === 'Enter' && !(e.target as HTMLElement).closest?.('button, a, textarea')))) { e.preventDefault(); onEdit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onEdit, locked, viewing, readOnly, help]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DockScope>
      <div className={`mh-sheet kp-sheet${dock.minimized ? ' is-min' : ''}`} ref={sheet} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="mh-sheet-box" role="dialog" aria-modal="true"
          onDoubleClick={viewing && !readOnly ? (e) => { if (!(e.target as HTMLElement).closest('button, a, .tab, .tabs, .mh-sheet-head, .mh-sheet-foot')) onEdit(); } : undefined}>
          <div className="mh-sheet-head" ref={(el) => { dock.headRef.current = el; }}>
            <h2>{title} {badges}{viewing && !readOnly && <span className="badge badge-info modal-viewing">Đang xem — bấm Sửa để thay đổi</span>}</h2>
            <span className="ct-total" title={totalLabel}><small>{totalLabel}</small><b>{total.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</b></span>
            <button type="button" className="btn btn-sm btn-help" data-view-ok onClick={() => setHelp(true)} title="Hướng dẫn sử dụng phiếu">? Hướng dẫn</button>
            {dock.top && <MinimizeButton onClick={dock.minimize} />}
            <button type="button" className="btn btn-sm btn-ghost" data-view-ok onClick={onClose} aria-label="Đóng" title="Đóng (Esc)">✕</button>
          </div>
          <div className={`mh-sheet-body${locked ? ' view-plain' : ''}${anTroLy ? ' an-tro-ly' : ''}`}>
            <div className="mh-main" ref={kl.body} {...kl.bodyProps}>{children}</div>
            {anTroLy && <button type="button" className="mh-side-mo" data-view-ok onClick={() => doiTroLy(false)} title={`Mở khung ${sideTitle}`}><span>‹ Trợ lý</span></button>}
            <aside className="mh-side" hidden={anTroLy}>
              <div className="row" style={{ marginBottom: 6, alignItems: 'center', gap: 6 }}>
                <b style={{ fontSize: 14 }}>{sideTitle}</b>
                <button type="button" className="btn btn-xs" data-view-ok style={{ marginLeft: 'auto' }} onClick={() => doiTroLy(true)} title="Thu gọn khung trợ lý — bảng hàng rộng hết màn">Thu gọn ›</button>
              </div>
              {side}
            </aside>
          </div>
          {keys && <div className="ct-keys">{keys}</div>}
          <div className="mh-sheet-foot" {...kl.footProps}>
            <span className="grow">{kl.banner ?? footNote}</span>
            {footer}
          </div>
        </div>
      </div>
      {help && <HelpDrawer guideKey={helpKey} onClose={() => setHelp(false)} />}
    </DockScope>
  );
}
