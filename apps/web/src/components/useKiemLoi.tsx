// [2026-11-11 Nguyễn Văn Thủy] Hook báo lỗi tại ô dùng chung cho Modal và VoucherModal (đóng góp)
/**
 * const kl = useKiemLoi(locked)
 *   <div className="modal-body" ref={kl.body} {...kl.bodyProps}>…</div>
 *   <div className="modal-foot" {...kl.footProps}>{kl.banner}…nút…</div>
 *   Ctrl + S tự gọi: if (!kl.kiem(nutGhi)) return;
 * Bấm nút Ghi / Lưu: ô bắt buộc trống → chặn, tô đỏ, báo "Còn N ô bắt buộc chưa nhập: …" ở chân hộp thoại.
 * Bấm vào nút Ghi đang khoá (mờ): cũng rà; không thiếu ô nào thì nói lý do khoá (title của nút).
 */
import { useRef, useState, type MouseEvent, type SyntheticEvent } from 'react';
import { boLoiO, kiemBatBuoc, laNutGhi } from './kiemLoi';

export function useKiemLoi(locked = false) {
  const body = useRef<HTMLDivElement>(null);
  const [bao, setBao] = useState<string | null>(null);
  /** Rà trước khi ghi. nut: nút vừa bấm (để đọc lý do khoá); trả false = chặn. */
  const kiem = (nut?: HTMLButtonElement | null) => {
    const thieu = body.current ? kiemBatBuoc(body.current) : [];
    if (thieu.length) { setBao(`Còn ${thieu.length} ô bắt buộc chưa nhập: ${thieu.join(', ')}`); return false; }
    if (nut?.disabled) { setBao(nut.title?.trim() && !/^Ctrl/i.test(nut.title.trim()) ? nut.title.trim() : 'Chưa ghi được: còn thông tin chưa đủ hoặc chưa đúng — xem các dòng báo trong hộp.'); return false; }
    setBao(null);
    return true;
  };
  const footProps = {
    onClickCapture: (e: MouseEvent) => {
      if (locked) return;
      const b = (e.target as HTMLElement).closest('button');
      if (laNutGhi(b) && !kiem(b)) { e.preventDefault(); e.stopPropagation(); }
    },
    // Nút khoá có pointer-events: none (CSS): bấm vào chỗ nút thì sự kiện tới chân hộp thoại, dò nút theo toạ độ.
    onClick: (e: MouseEvent) => {
      if (locked || (e.target as HTMLElement).closest('button:not(:disabled)')) return;
      const b = [...(e.currentTarget as HTMLElement).querySelectorAll('button:disabled')].find((el) => { const r = el.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
      if (laNutGhi(b ?? null)) kiem(b as HTMLButtonElement);
    },
  };
  const sua = (e: SyntheticEvent) => { boLoiO(e.target); if (bao && body.current && !body.current.querySelector('.o-loi')) setBao(null); };
  const bodyProps = { onInputCapture: sua, onChangeCapture: sua };
  const banner = bao && !locked ? <span className="modal-loi" role="alert" title="Bấm để ẩn" onClick={() => setBao(null)}>{bao}</span> : null;
  return { body, kiem, footProps, bodyProps, banner };
}
