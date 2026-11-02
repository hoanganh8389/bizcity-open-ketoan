// [2026-11-02 03:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-20: HT06 Kiểm chuẩn (quyền conformance:read), HT07 Hồ sơ kế toán (ADR-0012, ADR-0013).
/**
 * Nhóm menu của phân hệ Hệ thống (thanh bên trái + trang chủ phân hệ). Mục có path mở màn; mục không path = chưa làm.
 * Mã chức năng (ACC.., DM..) và khoá mục giữ nguyên (màn đã ghim không mất). Muốn nhóm hiện thêm ở phân hệ khác: thêm khoá
 * nhóm vào manifest của phân hệ đó.
 */
import type { MenuItem } from '@ketoan/contracts';

export const heThongMenu: MenuItem[] = [
  {
    key: 'he-thong',
    label: 'Hệ thống',
    children: [
      { key: 'chi-nhanh-lam-viec', label: 'Chuyển chi nhánh làm việc', path: '/he-thong/chi-nhanh-lam-viec', code: 'HT04' },
      { key: 'don-vi', label: 'Thông tin đơn vị', path: '/cau-hinh/don-vi', code: 'HT03' },
      { key: 'mau-in', label: 'Mẫu in', path: '/cau-hinh/mau-in', code: 'HT05' },
      { key: 'nguoi-dung', label: 'Người dùng', path: '/cau-hinh/nguoi-dung', code: 'HT01', permission: 'users:write' },
      { key: 'khoa-api', label: 'Khoá API', path: '/cau-hinh/khoa-api', code: 'HT02', permission: 'users:write' },
      { key: 'kiem-chuan', label: 'Kiểm chuẩn', path: '/he-thong/kiem-chuan', code: 'HT06', permission: 'conformance:read' },
      { key: 'ho-so-ke-toan', label: 'Hồ sơ kế toán', path: '/he-thong/ho-so-ke-toan', code: 'HT07', permission: 'ledger:read' },
      // [2026-11-02 10:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4: Bàn đánh giá theo vai (HT08, quyền review:read)
      { key: 'ban-danh-gia', label: 'Bàn đánh giá', path: '/he-thong/ban-danh-gia', code: 'HT08', permission: 'review:read' },
    ],
  },
];
