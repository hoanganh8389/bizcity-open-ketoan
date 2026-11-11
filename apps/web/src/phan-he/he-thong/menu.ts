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
      // [2026-11-11 Nguyễn Văn Thủy] HT16 hồ sơ in: thông tin đơn vị trên bản in, người ký, ngày ký (đóng góp)
      { key: 'bao-cao-chung-tu', label: 'Báo cáo, chứng từ', path: '/cau-hinh/bao-cao-chung-tu', code: 'HT16' },
      { key: 'khoi-anh', label: 'Khối ảnh', path: '/cau-hinh/khoi-anh', code: 'HT11', permission: 'settings:write' },
      { key: 'nguoi-dung', label: 'Người dùng', path: '/cau-hinh/nguoi-dung', code: 'HT01', permission: 'users:write' },
      { key: 'khoa-api', label: 'Khoá API', path: '/cau-hinh/khoa-api', code: 'HT02', permission: 'users:write' },
      { key: 'kiem-chuan', label: 'Kiểm chuẩn', path: '/he-thong/kiem-chuan', code: 'HT06', permission: 'conformance:read' },
      { key: 'ho-so-ke-toan', label: 'Hồ sơ kế toán', path: '/he-thong/ho-so-ke-toan', code: 'HT07', permission: 'ledger:read' },
      // [2026-11-02 10:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4: Bàn đánh giá theo vai (HT08, quyền review:read)
      // [2026-11-09 10:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — D032-13: HT08 đổi tên Bàn làm việc kế toán (giữ key, đường dẫn, quyền)
      { key: 'ban-danh-gia', label: 'Bàn làm việc kế toán', path: '/he-thong/ban-danh-gia', code: 'HT08', permission: 'review:read' },
      // [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09: kế toán trưởng duyệt luật nhắc, tắt / bật tự thêm mặt hàng từ chứng từ (người có catalog:read xem được)
      { key: 'quy-dinh-danh-muc', label: 'Quy định dữ liệu danh mục', path: '/he-thong/quy-dinh-danh-muc', code: 'HT09', permission: 'catalog:read' },
      // [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — HT10: bảng trụ cột × mức đạt của Core (ai đăng nhập cũng xem được — kim chỉ nam chung)
      { key: 'tru-cot', label: 'Trụ cột & mức đạt', path: '/he-thong/tru-cot', code: 'HT10' },
      // [2026-11-06 02:41 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-39: HT13 Cấu hình hệ thống, bản chỉ đọc (ai đăng nhập cũng xem được; khoá bí mật không hiện giá trị)
      // [2026-11-09 02:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4b: HT15 Chính sách (quyền catalog:read; Core, không phải module nghiệp vụ — D031-11)
      { key: 'chinh-sach', label: 'Chính sách', path: '/he-thong/chinh-sach', code: 'HT15', permission: 'catalog:read' },
      { key: 'cau-hinh-he-thong', label: 'Cấu hình hệ thống', path: '/he-thong/cau-hinh', code: 'HT13' },
    ],
  },
];
