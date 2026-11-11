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
    // Tên ô = chữ trước "(*)" (nhãn có thể kèm chú thích phía sau).
    if (/\(\*\)|\*\s*$/.test(t)) them(f, t.split('(*)')[0] ?? t);
  });
  root.querySelectorAll('label.req').forEach((lb) => them(lb.nextElementSibling, lb.textContent ?? ''));
  root.querySelectorAll('[data-bat-buoc]').forEach((b) => them(b, b.getAttribute('data-bat-buoc') ?? ''));
  return out;
}

/** Tô đỏ một ô (đánh dấu data-tk: chỉ gỡ những ô do bộ rà tô, không đụng lớp o-loi React tự đặt — Field error, dòng hàng…). */
function toDo(box: HTMLElement) { box.classList.add('o-loi'); box.setAttribute('data-tk', ''); }
/** Xoá dấu đỏ do bộ rà tô trong hộp thoại (trước lần rà mới). */
export function xoaLoi(root: HTMLElement) {
  root.querySelectorAll('.o-loi[data-tk]').forEach((b) => { b.classList.remove('o-loi'); b.removeAttribute('data-tk'); });
  root.querySelectorAll('.o-loi-chu[data-tu-kiem]').forEach((s) => s.remove());
}

/** Rà và tô đỏ ô bắt buộc còn trống. Trả danh sách tên ô thiếu (rỗng = đủ). Có ô thiếu thì đưa con trỏ vào ô đầu tiên. */
export function kiemBatBuoc(root: HTMLElement): string[] {
  xoaLoi(root);
  const thieu = oBatBuoc(root).filter((o) => !String(o.ctl.value ?? '').trim());
  for (const o of thieu) {
    toDo(o.box);
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
  const box = (target as HTMLElement | null)?.closest?.('.o-loi[data-tk]');
  if (!box) return;
  box.classList.remove('o-loi');
  box.removeAttribute('data-tk');
  box.querySelectorAll('.o-loi-chu[data-tu-kiem]').forEach((s) => s.remove());
}

/** Nút Ghi / Lưu: btn-primary ở chân hộp thoại, hoặc nút có chữ Ghi / Lưu. */
export const laNutGhi = (b: Element | null): b is HTMLButtonElement =>
  Boolean(b && b.tagName === 'BUTTON' && (b.classList.contains('btn-primary') || /^\s*(Ghi|Lưu|Gửi duyệt|Duyệt)/.test(b.textContent ?? '')));

/* ------------------------------------------------------------------ Lỗi máy chủ → ô */
const kd = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/\(\*\)|\*/g, '').replace(/\s+/g, ' ').toLowerCase().trim();

/** Mọi ô có nhãn trong hộp thoại (không chỉ ô bắt buộc): `.field > label`, nhãn đứng trước ô ở lưới đầu phiếu, `data-bat-buoc`. */
function oCoNhan(root: HTMLElement): OBatBuoc[] {
  const out: OBatBuoc[] = [];
  const them = (box: Element | null, ten: string) => {
    if (!box || !hien(box)) return;
    const ctl = oNhap(box);
    if (!ctl || !kd(ten) || out.some((o) => o.ctl === ctl)) return;
    out.push({ box: box as HTMLElement, ten: sach(ten), ctl });
  };
  root.querySelectorAll('.field').forEach((f) => { const lb = f.querySelector(':scope > label'); if (lb && !lb.classList.contains('checkbox')) them(f, lb.firstChild?.textContent ?? lb.textContent ?? ''); });
  root.querySelectorAll('label:not(.checkbox)').forEach((lb) => { if (!lb.closest('.field')) them(lb.nextElementSibling, lb.textContent ?? ''); });
  root.querySelectorAll('[data-bat-buoc]').forEach((b) => them(b, b.getAttribute('data-bat-buoc') ?? ''));
  return out;
}

/**
 * Lỗi máy chủ trả về (câu chữ) → tô đỏ ô có nhãn khớp. Hai dạng câu:
 *   "Tên: không được để trống"   (lỗi kiểm dữ liệu: phần trước dấu ":" là tên trường) → ô có nhãn bắt đầu bằng / trùng tên đó, chỉ khi duy nhất
 *   "Số tài khoản 1111 đã có"     (lỗi nghiệp vụ) → ô có nhãn (≥ 4 ký tự) nằm trong câu, lấy nhãn dài nhất
 * Trả số ô đã tô. Câu không nhắc ô nào thì bỏ qua (form vẫn báo lỗi như cũ).
 */
export function ganLoiMayChu(root: HTMLElement, cau: string[], fields: { path: string; message: string }[] = []): number {
  const o = oCoNhan(root).map((x) => ({ ...x, k: kd(x.ten) }));
  const da: OBatBuoc[] = [];
  const to = (box: HTMLElement, c: string) => {
    toDo(box);
    box.querySelectorAll('.o-loi-chu[data-tu-kiem]').forEach((s) => s.remove());
    const s = document.createElement('span');
    s.className = 'o-loi-chu';
    s.setAttribute('data-tu-kiem', '');
    s.textContent = c;
    box.appendChild(s);
  };
  // 1. Khớp chính xác: ô khai data-truong (Field truong="name") trùng đường dẫn trường lỗi (đủ, hoặc phần cuối không phải số).
  const conLai = new Set(cau);
  for (const f of fields) {
    const cuoi = f.path.split('.').filter((x) => !/^\d+$/.test(x)).pop() ?? '';
    const box = root.querySelector<HTMLElement>(`[data-truong="${CSS.escape(f.path)}"]`) ?? (cuoi ? root.querySelector<HTMLElement>(`[data-truong="${CSS.escape(cuoi)}"]`) : null);
    if (!box || !hien(box)) continue;
    to(box, f.message);
    conLai.delete(f.message);
    const x = o.find((y) => box.contains(y.ctl));
    if (x) da.push(x); else oNhap(box)?.focus();
  }
  // 2. Còn lại: so câu lỗi với nhãn ô.
  for (const c of conLai) {
    const t = kd(c);
    const m = /^([^:]{1,40}):\s/.exec(c);
    let hit: (typeof o)[number] | undefined;
    if (m) {
      const w = kd(m[1]!.split('›').pop() ?? '');
      const ung = o.filter((x) => x.k === w || x.k.startsWith(`${w} `));
      if (ung.length === 1) hit = ung[0];
    }
    hit ??= o.filter((x) => x.k.length >= 4 && t.includes(x.k)).sort((a, b) => b.k.length - a.k.length)[0];
    if (!hit || da.includes(hit)) continue;
    da.push(hit);
    to(hit.box, c);
  }
  da[0]?.ctl.focus();
  return da.length;
}

/** Sự kiện phát khi máy chủ từ chối một lần ghi (lib/api.ts); hộp thoại trên cùng nghe để gắn lỗi vào ô. */
export const SU_KIEN_LOI = 'ketoan:api-loi';
export interface LoiMayChu { message: string; details: string[]; fields: { path: string; message: string }[] }
