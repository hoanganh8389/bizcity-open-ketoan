/**
 * Nhóm menu của phân hệ Tài sản (thanh bên trái + trang chủ phân hệ). Mục có path mở màn; mục không path = chưa làm.
 * Mã chức năng (ACC.., DM..) và khoá mục giữ nguyên (màn đã ghim không mất). Muốn nhóm hiện thêm ở phân hệ khác: thêm khoá
 * nhóm vào manifest của phân hệ đó.
 */
import type { MenuItem } from '@ketoan/contracts';
import { soon, sec } from '../../layout/menu-helpers';

export const taiSanMenu: MenuItem[] = [
  {
    key: 'nghiep-vu-tscd',
    label: '6. Tài sản cố định, CCDC',
    children: [
      sec('ts-ccdc', 'Công cụ dụng cụ, chi phí trả trước'),
      { key: 'ccdc', label: 'Công cụ dụng cụ', path: '/tai-san/cong-cu', code: 'ACC22' },
      { key: 'phan-bo', label: 'Phân bổ chi phí trả trước', path: '/tai-san/chi-phi-tra-truoc', code: 'ACC23' },
      { key: 'bc-phan-bo', label: 'Báo cáo phân bổ chi phí', path: '/bao-cao/phan-bo-chi-phi', code: 'ACC27' },
      sec('ts-nghiep-vu', 'Tài sản cố định'),
      { key: 'tang-ts', label: 'Tăng tài sản cố định', path: '/tai-san/tscd', code: 'ACC28' },
      { key: 'giam-ts', label: 'Giảm tài sản cố định', path: '/tai-san/ghi-giam', code: 'ACC30' },
      { key: 'khau-hao', label: 'Tính khấu hao, phân bổ', path: '/tai-san/khau-hao', code: 'ACC31' },
      { key: 'ke-hoach-kh', label: 'Kế hoạch khấu hao, phân bổ', path: '/tai-san/ke-hoach-khau-hao', code: 'TS01' },
      { key: 'danh-gia-ts', label: 'Đánh giá lại tài sản', path: '/tai-san/danh-gia-lai', code: 'ACC32' },
      { key: 'dieu-chuyen-ts', label: 'Điều chuyển tài sản', path: '/tai-san/dieu-chuyen', code: 'ACC33' },
      { key: 'kiem-ke-ts', label: 'Kiểm kê tài sản', path: '/tai-san/kiem-ke', code: 'ACC35' },
      soon('ts-thue', 'Chuyển TS thuê thành TS sở hữu', 'ACC34'),
      sec('ts-bao-cao', 'Báo cáo'),
      { key: 'so-ts', label: 'Sổ tài sản', path: '/bao-cao/so-tai-san', code: 'ACC29' },
      { key: 'bc-ts', label: 'Báo cáo tài sản', path: '/bao-cao/tai-san', code: 'ACC42' },
      { key: 'theo-doi-ts', label: 'BC theo dõi TSCĐ và CCDC', path: '/bao-cao/theo-doi-tscd-ccdc', code: 'ACC85' },
      { key: 'nguon-von', label: 'Sổ theo dõi chi tiết nguồn vốn CSH', path: '/bao-cao/nguon-von', code: 'ACC86' },
    ],
  },
];
