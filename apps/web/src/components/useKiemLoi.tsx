// [2026-11-11 Nguyễn Văn Thủy] Hook báo lỗi tại ô dùng chung cho Modal, VoucherModal và màn phiếu mua (đóng góp)
/**
 * const kl = useKiemLoi(locked, { lyDo })
 *   <div ref={kl.body} {...kl.bodyProps}>…ô nhập…</div>
 *   <div className="modal-foot" {...kl.footProps}>{kl.banner}…nút…</div>
 *   Ctrl + S tự gọi: if (!kl.kiem()) return;
 * - Bấm nút Ghi / Lưu: ô bắt buộc trống → chặn, tô đỏ, báo "Còn N ô bắt buộc chưa nhập: …" ở chân hộp thoại.
 * - Bấm vào nút Ghi đang khoá (mờ): cũng rà; không thiếu ô nào thì nói lý do (lyDo() của form, rồi tới title của nút).
 * - kl.daKiem: đã bấm Ghi mà bị chặn — form dùng để tô đỏ thêm phần riêng (dòng hàng thiếu mã / số lượng…).
 * - Máy chủ từ chối lần ghi (lib/api.ts phát SU_KIEN_LOI): hộp thoại trên cùng gắn câu lỗi vào ô có nhãn khớp.
 */
import { useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react';
import { boLoiO, ganLoiMayChu, kiemBatBuoc, laNutGhi, SU_KIEN_LOI, type LoiMayChu } from './kiemLoi';
import { boKiemForm, ghiLoiForm } from '@/lib/kiemForm';

const KHUNG = '.modal-mask:not(.is-min), .mh-sheet:not(.is-min)';

export function useKiemLoi(locked = false, opt: { lyDo?: () => string | null | undefined } = {}) {
  const body = useRef<HTMLDivElement>(null);
  const [bao, setBaoState] = useState<string | null>(null);
  const [daKiem, setDaKiem] = useState(false);
  // [2026-11-19 Nguyễn Văn Thủy] lần ghi bị máy chủ từ chối: giữ mã lỗi + mã tra cứu, hiện cạnh nút Ghi kèm nút Chép (docs/nghiep-vu/25) (đóng góp)
  const [traCuu, setTraCuu] = useState<{ code?: string; requestId?: string; message: string; details: string[] } | null>(null);
  const setBao = (x: string | null) => { setBaoState(x); setDaKiem(Boolean(x)); };
  const lyDo = useRef(opt.lyDo);
  lyDo.current = opt.lyDo;
  /** Rà trước khi ghi. nut: nút vừa bấm (để đọc lý do khoá); trả false = chặn. */
  const kiem = (nut?: HTMLButtonElement | null) => {
    const thieu = body.current ? kiemBatBuoc(body.current) : [];
    // [2026-11-19 Nguyễn Văn Thủy] form chặn cũng ghi nhật ký kiểm (đếm lỗi hay gặp); máy tắt kiểm form thì cho gửi để máy chủ tự kiểm (đóng góp)
    if (thieu.length) {
      const cau = `Còn ${thieu.length} ô bắt buộc chưa nhập: ${thieu.join(', ')}`;
      ghiLoiForm(`man:${window.location.pathname}`, [cau], { code: 'FORM-THIEU' });
      if (!boKiemForm()) { setBao(cau); return false; }
    }
    if (nut?.disabled) {
      const t = nut.title?.trim();
      const cau = lyDo.current?.() || (t && !/^Ctrl/i.test(t) ? t : 'Chưa ghi được: còn thông tin chưa đủ hoặc chưa đúng — xem các dòng báo trong hộp.');
      ghiLoiForm(`man:${window.location.pathname}`, [cau], { code: 'FORM-KHOA' });
      setBao(cau);
      return false;
    }
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
  // Lỗi máy chủ → ô (chỉ hộp thoại đang ở trên cùng).
  useEffect(() => {
    const nghe = (e: Event) => {
      const el = body.current;
      if (!el || locked) return;
      if (el.closest(KHUNG) !== [...document.querySelectorAll(KHUNG)].pop()) return;
      const { message, details, fields, code, requestId } = (e as CustomEvent<LoiMayChu>).detail;
      ganLoiMayChu(el, details.length ? details : [message], fields);
      setTraCuu({ code, requestId, message, details });
    };
    window.addEventListener(SU_KIEN_LOI, nghe);
    return () => window.removeEventListener(SU_KIEN_LOI, nghe);
  }, [locked]);
  const sua = (e: SyntheticEvent) => { boLoiO(e.target); if (bao && body.current && !body.current.querySelector('.o-loi[data-tk]') && !lyDo.current?.()) setBao(null); };
  const bodyProps = { onInputCapture: sua, onChangeCapture: sua };
  const chep = () => {
    if (!traCuu) return;
    const text = [`Màn: ${document.title} (${window.location.pathname})`, `Lúc: ${new Date().toLocaleString('vi-VN', { hour12: false })}`, `Lỗi: ${traCuu.code ?? ''} — ${traCuu.message}`, ...traCuu.details.map((d) => `- ${d}`), traCuu.requestId ? `Mã tra cứu: ${traCuu.requestId}` : ''].filter(Boolean).join('\n');
    void navigator.clipboard?.writeText(text);
  };
  const banner = bao && !locked ? <span className="modal-loi" role="alert" title="Bấm để ẩn" onClick={() => setBao(null)}>{bao}</span>
    : traCuu?.requestId && !locked ? <span className="modal-loi modal-tra-cuu" role="status">Lỗi <span className="mono">{traCuu.code}</span> · mã tra cứu <span className="mono">{traCuu.requestId}</span> <button type="button" className="btn btn-xs" title="Chép mã lỗi, câu báo, mã tra cứu — dán vào báo lỗi" onClick={(e) => { e.stopPropagation(); chep(); }}>Chép</button> <button type="button" className="btn btn-xs btn-ghost" title="Ẩn" onClick={(e) => { e.stopPropagation(); setTraCuu(null); }}>×</button></span> : null;
  return { body, kiem, footProps, bodyProps, banner, daKiem: daKiem && !locked };
}
