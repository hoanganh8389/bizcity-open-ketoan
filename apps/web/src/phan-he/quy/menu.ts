/**
 * Nhóm menu của phân hệ Quỹ (thanh bên trái + trang chủ phân hệ). Mục có path mở màn; mục không path = chưa làm.
 * Mã chức năng (ACC.., DM..) và khoá mục giữ nguyên (màn đã ghim không mất). Muốn nhóm hiện thêm ở phân hệ khác: thêm khoá
 * nhóm vào manifest của phân hệ đó.
 */
import type { MenuItem } from '@ketoan/contracts';

export const quyMenu: MenuItem[] = [
  // Phân hệ Quỹ: như nhóm Quỹ của HTsoft (Q1 Số dư quỹ, Q2 Phiếu chuyển tiền, NH1 Số dư ngân hàng). Kế toán xác nhận
  // phiếu chuyển tiền ở đây; phiếu thu / chi / báo nợ / báo có và báo cáo quỹ là lối tắt (vẫn nằm ở phân hệ Kế toán).
  {
    key: 'quy-nghiep-vu',
    label: 'Nghiệp vụ quỹ',
    children: [
      { key: 'q-chuyen-tien', label: 'Phiếu chuyển tiền', path: '/quy/phieu-chuyen-tien', code: 'Q2' },
      { key: 'q-phieu-thu', label: 'Phiếu thu', path: '/nghiep-vu/phieu-thu', code: 'ACC51' },
      { key: 'q-phieu-chi', label: 'Phiếu chi', path: '/nghiep-vu/phieu-chi', code: 'ACC52' },
      { key: 'q-phieu-bao-no', label: 'Phiếu báo nợ', path: '/nghiep-vu/phieu-bao-no', code: 'ACC53' },
      { key: 'q-phieu-bao-co', label: 'Phiếu báo có', path: '/nghiep-vu/phieu-bao-co', code: 'ACC54' },
    ],
  },
  {
    key: 'quy-bao-cao',
    label: 'BC Quỹ & ngân hàng',
    children: [
      { key: 'q-so-du-tien', label: 'Bảng kê số dư tiền', path: '/quy/so-du-tien', code: 'ACC80' },
      { key: 'q-so-quy', label: 'BC Sổ quỹ tiền mặt', path: '/quy/so-quy-tien-mat', code: 'ACC55' },
      { key: 'q-so-tien-gui', label: 'BC Tiền gửi ngân hàng', path: '/quy/so-tien-gui', code: 'ACC56' },
      { key: 'q-nk-thu-tien', label: 'Sổ nhật ký thu tiền', path: '/quy/nhat-ky-thu-tien', code: 'ACC72' },
      { key: 'q-nk-chi-tien', label: 'Sổ nhật ký chi tiền', path: '/quy/nhat-ky-chi-tien', code: 'ACC73' },
      { key: 'q-ct-quy', label: 'Sổ kế toán chi tiết quỹ TM', path: '/quy/so-chi-tiet-quy', code: 'ACC76' },
    ],
  },
];
