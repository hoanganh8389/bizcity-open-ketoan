/**
 * Nhóm menu của phân hệ Kho (thanh bên trái + trang chủ phân hệ). Mục có path mở màn; mục không path = chưa làm.
 * Mã chức năng (ACC.., DM..) và khoá mục giữ nguyên (màn đã ghim không mất). Muốn nhóm hiện thêm ở phân hệ khác: thêm khoá
 * nhóm vào manifest của phân hệ đó.
 */
import type { MenuItem } from '@ketoan/contracts';

export const khoMenu: MenuItem[] = [
  // ---------------- Phân hệ Kho ----------------
  {
    key: 'kho-nghiep-vu',
    label: 'Nghiệp vụ kho',
    children: [
      { key: 'kho-chuyen-kho', label: 'Phiếu chuyển kho', path: '/kho/chuyen-kho', code: 'KHO01' },
      // [2026-11-12 03:30 PM kiennt] NT-KHO-002 — biên bản kiểm kê kho
      { key: 'kiem-ke-kho', label: 'Kiểm kê kho', path: '/kho/kiem-ke', code: 'KHO02' },
      { key: 'kho-gia-von', label: 'Tính giá vốn', path: '/nghiep-vu/tinh-gia-von', code: 'ACC49' },
      { key: 'kho-cong-thuc-gia-von', label: 'Công thức giá vốn', path: '/nghiep-vu/cong-thuc-gia-von', code: 'ACC49A' },
    ],
  },
  {
    key: 'kho-bao-cao',
    label: 'Báo cáo kho',
    children: [
      { key: 'kho-nxt', label: 'BC nhập xuất tồn hàng hoá', path: '/bao-cao/nhap-xuat-ton', code: 'ACC83' },
      { key: 'kho-ct-hang-hoa', label: 'Sổ chi tiết hàng hoá', path: '/bao-cao/so-chi-tiet-hang-hoa', code: 'ACC82' },
      // [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1: truy vết vòng đời một mặt hàng (ADR-0021)
      { key: 'kho-hanh-trinh', label: 'Hành trình mặt hàng', path: '/bao-cao/hanh-trinh-mat-hang', code: 'ACC95', permission: 'ledger:read' },
      { key: 'kho-chuyen-kho', label: 'Bảng kê chuyển kho', path: '/bao-cao/chuyen-kho', code: 'HH01' },
      // [2026-11-10 06:30 PM Nguyễn Văn Thủy] PHASE-026 — tồn theo lô (0098) (đóng góp)
      { key: 'kho-ton-theo-lo', label: 'Tồn theo lô', path: '/kho/ton-theo-lo', code: 'KHO05' },
      { key: 'kho-the-kho', label: 'Thẻ kho', path: '/kho/the-kho', code: 'KHO06' },
      { key: 'kho-doi-chieu', label: 'Đối chiếu kho và sổ cái', path: '/kho/doi-chieu-so-cai', code: 'KHO07' },
    ],
  },
  {
    key: 'kho-danh-muc',
    label: 'Danh mục kho',
    children: [
      { key: 'kho-mat-hang', label: 'Danh mục mặt hàng', path: '/danh-muc/mat-hang', code: 'DM10' },
      { key: 'kho-don-vi-tinh', label: 'Danh mục đơn vị tính', path: '/danh-muc/don-vi-tinh', code: 'DM15' },
      { key: 'kho-phan-loai', label: 'Nhóm hàng', path: '/danh-muc/phan-loai-hang', code: 'DM11' },
      // [2026-11-10 04:30 PM Nguyễn Văn Thủy] PHASE-026 — ẩn Mặt hàng - Tài khoản (ACC17): định khoản theo Tài khoản ngầm định ACC41 (đóng góp)
      { key: 'kho-so-do-to-chuc', label: 'Sơ đồ tổ chức', path: '/danh-muc/so-do-to-chuc', code: 'DM16' },
      { key: 'kho-chi-nhanh', label: 'Chi nhánh (kho, cửa hàng)', path: '/danh-muc/chi-nhanh', code: 'DM02' },
      { key: 'kho-kho', label: 'Danh mục kho', path: '/danh-muc/kho', code: 'DM12' },
      { key: 'kho-loai-kho', label: 'Loại kho', path: '/danh-muc/loai-kho', code: 'DM18' },
    ],
  },
];
