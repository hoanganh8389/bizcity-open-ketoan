// [2026-11-11 Nguyễn Văn Thủy] THÊM NHANH — mở thẳng form thêm mới bằng ?them=1, danh sách nút Thêm nhanh ở menu trái (đóng góp)
/**
 * THÊM NHANH: một quy ước cho mọi màn danh sách — địa chỉ có `?them=1` thì màn tự mở form thêm mới (rồi xoá tham số khỏi địa
 * chỉ để tải lại trang không mở lại). Nút "Thêm nhanh" ở menu trái, sơ đồ quy trình, liên kết ở báo cáo… đều dùng chung.
 * Muốn màn mới nhận lệnh này: gọi useThemTuDiaChi(() => mởFormMới(), quyềnGhi) ở màn đó và khai một dòng ở THEM_NHANH.
 */
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Mở form thêm mới khi địa chỉ có ?them=1 (gọi một lần cho mỗi lần vào màn). `ready`: đã đủ quyền / dữ liệu để mở. */
export function useThemTuDiaChi(open: (params: URLSearchParams) => void, ready = true) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !ready) return;
    const p = new URLSearchParams(search);
    if (p.get('them') !== '1') return;
    done.current = true;
    open(p);
    p.delete('them');
    const rest = p.toString();
    navigate(pathname + (rest ? `?${rest}` : ''), { replace: true });
  }, [search, ready]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Đường dẫn mở form thêm mới của một màn. */
export const themMoi = (path: string) => `${path}${path.includes('?') ? '&' : '?'}them=1`;

export interface ThemNhanhMuc { label: string; path: string; /** Đường dẫn màn (không tham số) để kiểm người dùng có quyền mở. */ base: string }
export interface ThemNhanhNhom { label: string; items: ThemNhanhMuc[] }

const m = (label: string, base: string, link = themMoi(base)): ThemNhanhMuc => ({ label, base, path: link });

/** Nút "Thêm nhanh" đầu menu trái: lập chứng từ / thêm danh mục hay dùng, chia theo nhóm việc. Mục người dùng không có quyền tự ẩn. */
export const THEM_NHANH: ThemNhanhNhom[] = [
  { label: 'Tiền', items: [m('Phiếu thu', '/nghiep-vu/phieu-thu'), m('Phiếu chi', '/nghiep-vu/phieu-chi'), m('Báo có (thu tiền gửi)', '/nghiep-vu/phieu-bao-co'), m('Báo nợ (chi tiền gửi)', '/nghiep-vu/phieu-bao-no')] },
  { label: 'Mua hàng', items: [m('Đơn đặt hàng', '/mua-hang/tong-hop', '/mua-hang/tong-hop?moi=order'), m('Nhập mua', '/mua-hang/tong-hop', '/mua-hang/tong-hop?moi=receipt'), m('Trả hàng nhà cung cấp', '/mua-hang/tong-hop', '/mua-hang/tong-hop?moi=return'), m('Chi phí mua hàng', '/mua-hang/tong-hop', '/mua-hang/tong-hop?moi=cost')] },
  { label: 'Bán hàng', items: [m('Phiếu bán hàng', '/ban-hang/phieu-ban'), m('Hàng bán trả lại', '/ban-hang/tra-lai')] },
  { label: 'Kho', items: [m('Chuyển kho', '/kho/chuyen-kho')] },
  { label: 'Tổng hợp', items: [m('Phiếu kế toán', '/nghiep-vu/phieu-ke-toan')] },
  { label: 'Danh mục', items: [m('Khách hàng', '/danh-muc/doi-tuong', '/danh-muc/doi-tuong?them=1&loai=customer'), m('Nhà cung cấp', '/danh-muc/doi-tuong', '/danh-muc/doi-tuong?them=1&loai=supplier'), m('Mặt hàng', '/danh-muc/mat-hang'), m('Kho', '/danh-muc/kho'), m('Nhập từ Excel', '/tien-ich/nhap-excel', '/tien-ich/nhap-excel')] },
];
