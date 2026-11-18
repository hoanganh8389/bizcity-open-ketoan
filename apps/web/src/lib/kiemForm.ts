// [2026-11-19 Nguyễn Văn Thủy] lỗi form tự chặn (chưa gửi máy chủ) cũng ghi nhật ký kiểm khai báo (JSONL) để đếm lỗi hay gặp;
// tuỳ chọn theo máy "không kiểm ở form" — form gửi thẳng, máy chủ tự kiểm và trả mã lỗi đầy đủ (docs/nghiep-vu/25) (đóng góp)
import { api } from './api';

const KHOA = 'ketoan:bo-kiem-form';

/** Máy này đang tắt kiểm ở form (để thử: máy chủ tự kiểm). */
export function boKiemForm(): boolean {
  try { return localStorage.getItem(KHOA) === '1'; } catch { return false; }
}
export function datBoKiemForm(on: boolean) {
  try { if (on) localStorage.setItem(KHOA, '1'); else localStorage.removeItem(KHOA); } catch { /* trình duyệt chặn lưu */ }
}

let truoc = '';
let luc = 0;
/**
 * Ghi một lần form chặn vào nhật ký kiểm (không chờ, lỗi ghi thì bỏ qua). Cùng nội dung trong 3 giây chỉ ghi một lần.
 * entity: đường dẫn API của danh mục (vd "catalog/products") — để hiện ở thẻ Lịch sử lỗi của danh mục; không biết thì "man:<đường dẫn màn>".
 */
export function ghiLoiForm(entity: string, messages: string[], opt: { key?: string; code?: string } = {}) {
  const msgs = messages.map((m) => m.trim()).filter(Boolean).slice(0, 20);
  if (!msgs.length) return;
  const sig = `${entity}|${opt.key ?? ''}|${msgs.join('|')}`;
  const now = Date.now();
  if (sig === truoc && now - luc < 3000) return;
  truoc = sig; luc = now;
  void api.post('/api/v1/validation-log/form', { entity, key: opt.key ?? '', screen: window.location.pathname, failed: msgs.map((title) => ({ code: opt.code ?? 'FORM-CHAN', title })) }).catch(() => undefined);
}
