/**
 * Bảng dạng biểu (.table-wrap: báo cáo tài chính, sổ…) kéo cao tới đáy khung thẻ, như lưới DataGrid tự đo:
 * chiều cao = đáy vùng thẻ − đỉnh bảng − phần nằm sau bảng (phân trang, ghi chú, thẻ kế tiếp). Bảng đặt sẵn
 * maxHeight riêng (style trên phần tử) thì giữ nguyên. Chạy lại khi đổi cỡ cửa sổ hoặc nội dung thay đổi.
 */
import { useEffect } from 'react';

function fitAll() {
  document.querySelectorAll<HTMLElement>('.ws-panel:not([hidden]) .table-wrap').forEach((el) => {
    if (el.style.maxHeight && el.dataset.fit !== '1') return; // trang tự đặt chiều cao
    if (el.offsetParent === null) return;
    const panel = el.closest('.ws-panel') as HTMLElement | null;
    if (!panel) return;
    const top = el.getBoundingClientRect().top + panel.scrollTop;
    let after = 16;
    for (let s = el.nextElementSibling; s; s = s.nextElementSibling) after += (s as HTMLElement).offsetHeight;
    const card = el.closest('.card');
    if (card) for (let s = card.nextElementSibling; s; s = s.nextElementSibling) if (!(s as HTMLElement).classList.contains('modal-mask')) after += (s as HTMLElement).offsetHeight;
    const h = Math.max(240, Math.floor(panel.getBoundingClientRect().bottom - top - after));
    if (el.style.maxHeight !== `${h}px`) { el.style.maxHeight = `${h}px`; el.dataset.fit = '1'; }
  });
}

export function useFitTables() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fitAll); };
    const mo = new MutationObserver(schedule);
    const root = document.getElementById('root') ?? document.body;
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('resize', schedule);
    schedule();
    return () => { mo.disconnect(); window.removeEventListener('resize', schedule); cancelAnimationFrame(frame); };
  }, []);
}
