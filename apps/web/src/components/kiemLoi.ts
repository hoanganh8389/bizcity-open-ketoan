// [2026-11-11 Nguyễn Văn Thủy] BÁO LỖI TẠI Ô cho mọi hộp thoại: bấm Ghi mà ô bắt buộc còn trống → viền đỏ + chữ đỏ dưới ô (đóng góp)
/**
 * Rà ô bắt buộc trong một hộp thoại (gọi từ Modal khi bấm nút Ghi / Lưu, Ctrl + S, hoặc bấm vào nút Ghi đang khoá).
 * Ô bắt buộc nhận theo cách các form đã đánh dấu sẵn, không cần sửa form:
 *   - `.field` có nhãn chứa "(*)" hoặc kết thúc bằng "*"  (Field label="Tên (*)")
 *   - `label.req` ở lưới đầu phiếu chứng từ (L req) → ô ngay sau nhãn (C)
 *   - phần tử tự khai `data-bat-buoc="Tên ô"` (form muốn đánh dấu ô không theo hai cách trên)
 * Bỏ qua: ô đang ẩn, ô khoá (disabled / readOnly), ô tự cấp (placeholder "Tự cấp…", "tự sinh"…), ô tích.
 * Ô trống → lớp `o-loi` (viền đỏ) + dòng `.o-loi-chu` "… không được để trống"; gõ / chọn vào ô thì tự hết đỏ.
 */
const TU_CAP = /t[ựu]\s*(c[ấa]p|sinh|đ[ộo]ng|l[ấa]y)/i;
const sach = (s: string) => s.replace(/\(\*\)|\*/g, '').replace(/\s+/g, ' ').trim();
const hien = (e: Element) => (e as HTMLElement).offsetParent !== null || (e as HTMLElement).getClientRects().length > 0;

function oNhap(box: Element): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null {
  return box.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), select, textarea');
}

interface OBatBuoc { box: HTMLElement; ten: string; ctl: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }
function oBatBuoc(root: HTMLElement): OBatBuoc[] {
  const out: OBatBuoc[] = [];
  const them = (box: Element | null, ten: string) => {
    if (!box || !hien(box)) return;
    const ctl = oNhap(box);
    if (!ctl || ctl.disabled || (ctl as HTMLInputElement).readOnly || TU_CAP.test((ctl as HTMLInputElement).placeholder ?? '')) return;
    if (!out.some((o) => o.ctl === ctl)) out.push({ box: box as HTMLElement, ten: sach(ten), ctl });
  };
  root.querySelectorAll('.field').forEach((f) => {
    const lb = f.querySelector(':scope > label');
    const t = lb?.textContent ?? '';
    if (/\(\*\)|\*\s*$/.test(t)) them(f, t);
  });
  root.querySelectorAll('label.req').forEach((lb) => them(lb.nextElementSibling, lb.textContent ?? ''));
  root.querySelectorAll('[data-bat-buoc]').forEach((b) => them(b, b.getAttribute('data-bat-buoc') ?? ''));
  return out;
}

/** Xoá dấu đỏ trong hộp thoại (gọi khi đóng hoặc trước lần rà mới). */
export function xoaLoi(root: HTMLElement) {
  root.querySelectorAll('.o-loi').forEach((b) => b.classList.remove('o-loi'));
  root.querySelectorAll('.o-loi-chu[data-tu-kiem]').forEach((s) => s.remove());
}

/** Rà và tô đỏ ô bắt buộc còn trống. Trả danh sách tên ô thiếu (rỗng = đủ). Có ô thiếu thì đưa con trỏ vào ô đầu tiên. */
export function kiemBatBuoc(root: HTMLElement): string[] {
  xoaLoi(root);
  const thieu = oBatBuoc(root).filter((o) => !String(o.ctl.value ?? '').trim());
  for (const o of thieu) {
    o.box.classList.add('o-loi');
    const s = document.createElement('span');
    s.className = 'o-loi-chu';
    s.setAttribute('data-tu-kiem', '');
    s.textContent = `${o.ten || 'Ô này'} không được để trống`;
    o.box.appendChild(s);
  }
  if (thieu[0]) { thieu[0].ctl.focus(); thieu[0].box.scrollIntoView({ block: 'nearest' }); }
  return thieu.map((o) => o.ten);
}

/** Gõ / chọn vào ô đang đỏ thì bỏ đỏ ô đó (gắn ở thân hộp thoại: onInput / onChange). */
export function boLoiO(target: EventTarget | null) {
  const box = (target as HTMLElement | null)?.closest?.('.o-loi');
  if (!box) return;
  box.classList.remove('o-loi');
  box.querySelectorAll('.o-loi-chu[data-tu-kiem]').forEach((s) => s.remove());
}

/** Nút Ghi / Lưu: btn-primary ở chân hộp thoại, hoặc nút có chữ Ghi / Lưu / Cất. */
export const laNutGhi = (b: Element | null): b is HTMLButtonElement =>
  Boolean(b && b.tagName === 'BUTTON' && (b.classList.contains('btn-primary') || /^\s*(Ghi|Lưu|Cất)\b/.test(b.textContent ?? '')));
