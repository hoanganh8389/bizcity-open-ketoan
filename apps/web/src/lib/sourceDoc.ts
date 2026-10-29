/**
 * Mở PHIẾU GỐC ở trang quản trị bán hàng (tab mới).
 *
 * Chứng từ do trang quản trị gửi sang mang mã nguồn "<nguồn>:<website>:<loại>:<mã phiếu>" (vd. phiếu nhập kho
 * "btsoft:1:purchase:3329"). Bấm số phiếu ở sổ / báo cáo → mở Tổng hợp mua hàng của trang quản trị, tự bật modal phiếu
 * đó (xem, sửa, duyệt). Chưa biết địa chỉ trang quản trị (WP_ADMIN_URL / WP_SSO_LOGIN_URL) hoặc loại phiếu chưa có
 * modal → trả false, màn tự mở form xem chứng từ của phần mềm kế toán.
 */
import { api } from '@/lib/api';

const SOURCE_RE = /^[a-z0-9_-]+:(\d+):(purchase):(\d+)$/i;
let adminUrl: string | null = null;

/** main.tsx đặt lúc khởi động (GET /api/v1/auth/wp-sso → adminUrl). */
export function setAdminUrl(url: string | null): void {
  adminUrl = url;
}

export function sourceOf(docKey: string | null | undefined): { blog: number; kind: 'purchase'; id: number } | null {
  const m = SOURCE_RE.exec(String(docKey ?? ''));
  return m ? { blog: Number(m[1]), kind: 'purchase', id: Number(m[3]) } : null;
}

export function canOpenSource(docKey: string | null | undefined): boolean {
  return adminUrl !== null && sourceOf(docKey) !== null;
}

export function openSource(docKey: string | null | undefined): boolean {
  const s = sourceOf(docKey);
  if (!adminUrl || !s) return false;
  const q = new URLSearchParams({ page: 'tgs-shop-management', view: 'bctk-purchase-sum', open_blog: String(s.blog), open_import: String(s.id), open_loai: 'buy' });
  window.open(`${adminUrl}admin.php?${q.toString()}`, '_blank', 'noopener');
  return true;
}

/** Sổ / báo cáo chỉ có số chứng từ: tra chứng từ theo số (đúng chi nhánh nếu trùng số). */
export async function findDocByNo(docNo: string, branchCode?: string): Promise<{ id: string; docKey: string } | null> {
  const no = docNo.trim();
  if (!no) return null;
  const res = await api.getPage<{ id: string; docKey: string; docNo: string; branchCode?: string | null }[]>('/api/v1/documents', { search: no, pageSize: 50 });
  const same = (res.data ?? []).filter((x) => x.docNo === no);
  const hit = same.find((x) => !branchCode || !x.branchCode || x.branchCode === branchCode) ?? same[0];
  return hit ? { id: String(hit.id), docKey: hit.docKey } : null;
}
