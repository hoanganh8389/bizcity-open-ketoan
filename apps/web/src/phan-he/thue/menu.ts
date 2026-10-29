/**
 * Nhóm menu của phân hệ Thuế (thanh bên trái + trang chủ phân hệ). Mục có path mở màn; mục không path = chưa làm.
 * Mã chức năng (ACC.., DM..) và khoá mục giữ nguyên (màn đã ghim không mất). Muốn nhóm hiện thêm ở phân hệ khác: thêm khoá
 * nhóm vào manifest của phân hệ đó.
 */
import type { MenuItem } from '@ketoan/contracts';
import { sec } from '../../layout/menu-helpers';

export const thueMenu: MenuItem[] = [
  {
    key: 'thue',
    label: '5. Thuế',
    children: [
      sec('thue-nghiep-vu', 'Nghiệp vụ'),
      { key: 'bo-sung-thue', label: 'Bổ sung thông tin thuế', path: '/thue/bo-sung-thong-tin', code: 'ACC78' },
      { key: 'to-khai', label: 'Tờ khai thuế GTGT', path: '/thue/to-khai-gtgt', code: 'ACC66' },
      { key: 'quyet-toan-tndn', label: 'Quyết toán thuế TNDN', path: '/thue/quyet-toan-tndn', code: 'TNDN03' },
      { key: 'hd-co-quan-thue', label: 'Hoá đơn từ cơ quan thuế', path: '/thue/hoa-don-co-quan-thue', code: 'THUE01' },
      { key: 'hd-rui-ro', label: 'Cảnh báo hoá đơn rủi ro', path: '/thue/hoa-don-rui-ro', code: 'THUE02' },
      { key: 'nguoi-nop-thue', label: 'Thông tin người nộp thuế', path: '/thue/nguoi-nop-thue', code: 'TT01' },
      sec('thue-bao-cao', 'Báo cáo'),
      { key: 'bang-ke-ban-ra', label: 'Báo cáo thuế ra', path: '/thue/bang-ke-ban-ra', code: 'ACC65' },
      { key: 'bang-ke-mua-vao', label: 'Báo cáo thuế vào', path: '/thue/bang-ke-mua-vao', code: 'ACC64' },
      { key: 'th-thue', label: 'Bảng tổng hợp thuế GTGT', path: '/thue/tong-hop', code: 'ACC91' },
    ],
  },
];
