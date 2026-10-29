/**
 * CHI NHÁNH ĐANG LÀM VIỆC — mỗi người dùng chọn một chi nhánh (vd làm việc ở CN Phú Thọ để mua hàng, chuyển kho); mọi phiếu lập
 * mới (đơn đặt, phiếu nhập, chuyển kho, phiếu thu chi…) tự điền chi nhánh này, màn theo chi nhánh cha tự chọn đúng cây.
 * Lưu trên máy theo đơn vị × người dùng (đổi máy thì chọn lại). Đổi ở nút chi nhánh trên thanh trên cùng hoặc Hệ thống → HT04.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'ketoan.workBranch';
let scope = '';
const listeners = new Set<() => void>();

const readMap = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>; } catch { return {}; } };

export const workBranch = {
  /** Khung lưu: đơn vị + người dùng đang đăng nhập (AppLayout gọi khi vào). */
  setScope(s: string) { if (s !== scope) { scope = s; queueMicrotask(() => listeners.forEach((l) => l())); } },
  get(): string { return scope ? readMap()[scope] ?? '' : ''; },
  set(code: string) {
    if (!scope) return;
    const m = readMap();
    if (code) m[scope] = code; else delete m[scope];
    try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* trình duyệt chặn lưu */ }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

/** Mã chi nhánh đang làm việc ('' = chưa chọn); tự cập nhật khi đổi ở bất kỳ đâu. */
export function useWorkBranch(): string {
  return useSyncExternalStore(workBranch.subscribe, workBranch.get, () => '');
}
