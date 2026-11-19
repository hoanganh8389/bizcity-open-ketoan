// [2026-11-19 Nguyễn Văn Thủy] quy tắc khai báo Đơn vị tính (DM15), Tài khoản ngân hàng (DM09), Chi nhánh (DM02 / cơ cấu) — docs/nghiep-vu/25 (đóng góp)
import type { CatalogHintDef } from '../catalog-hint.js';

export const QT_TO_CHUC_NGAN_HANG: Record<string, CatalogHintDef> = {
  // ── Đơn vị tính (DM15) ──
  'UNIT-BLOCK-001': {
    id: 'UNIT-BLOCK-001', entity: 'unit', level: 'block', status: 'approved', okText: 'Tên đơn vị tính chưa có', field: 'name',
    title: 'Đơn vị tính "{name}" đã có trong danh mục.',
    why: 'Hai tên giống nhau (khác hoa thường) làm mặt hàng chọn lẫn đơn vị, báo cáo theo đơn vị bị tách đôi.',
    fix: 'Dùng đơn vị "{name}" đã có.',
  },
  'UNIT-BLOCK-002': {
    id: 'UNIT-BLOCK-002', entity: 'unit', level: 'block', status: 'approved', okText: 'Chưa mặt hàng nào dùng (đổi tên / xoá được)', field: 'name',
    title: '"{name}" đang dùng ở {count} mặt hàng — không {action} được.',
    why: 'Phiếu đã ghi theo tên đơn vị này; đổi tên hay xoá làm phiếu cũ không khớp đơn vị của mặt hàng.',
    fix: 'Thêm tên mới rồi khai lại ở mặt hàng; muốn ẩn khỏi gợi ý thì bỏ tích "Đang dùng".',
  },
  // ── Tài khoản ngân hàng (DM09) ──
  'BANK-BLOCK-001': {
    id: 'BANK-BLOCK-001', entity: 'bank', level: 'block', status: 'approved', okText: 'Gắn đúng một tài khoản chi tiết 112', field: 'accountCode',
    title: 'Tài khoản kế toán: {detail}.',
    why: 'Mỗi tài khoản ngân hàng gắn một tài khoản chi tiết của 112 (tiền gửi) để sổ tiền gửi, đối chiếu sao kê tách theo từng tài khoản.',
    fix: 'Chọn một tài khoản chi tiết 112 chưa gắn tài khoản ngân hàng nào (thiếu thì thêm ở Hệ thống tài khoản).',
  },
  'BANK-BLOCK-002': {
    id: 'BANK-BLOCK-002', entity: 'bank', level: 'block', status: 'approved', okText: 'Chi nhánh có trong danh mục', field: 'branchCode',
    title: 'Chi nhánh {branch} chưa khai báo.',
    why: 'Tài khoản ngân hàng thuộc một chi nhánh để phiếu thu / chi của chi nhánh chọn đúng tài khoản.',
    fix: 'Chọn chi nhánh trong danh sách, hoặc khai chi nhánh trước.',
  },
  'BANK-BLOCK-003': {
    id: 'BANK-BLOCK-003', entity: 'bank', level: 'block', status: 'approved', okText: 'Không gắn hình thức thanh toán nào (xoá được)',
    title: 'Tài khoản ngân hàng {code} đang gắn hình thức thanh toán {method}.',
    why: 'Hình thức thanh toán (chuyển khoản, QR…) đang ghi tiền vào tài khoản này; xoá làm phiếu mới không biết ghi vào đâu.',
    fix: 'Bỏ tích "Đang dùng" để ngừng, hoặc đổi tài khoản của hình thức thanh toán {method} trước.',
  },
  // ── Chi nhánh (DM02, cơ cấu tổ chức) ──
  'BR-BLOCK-001': {
    id: 'BR-BLOCK-001', entity: 'branch', level: 'block', status: 'approved', okText: 'Bộ phận có trong danh mục', field: 'departmentCode',
    title: 'Bộ phận {code} không có trong danh mục Bộ phận.',
    why: 'Bộ phận dùng để gom chi phí, báo cáo theo phòng ban; mã không có thì không lên báo cáo.',
    fix: 'Chọn bộ phận trong danh sách, hoặc khai ở danh mục Bộ phận trước.',
  },
  'BR-BLOCK-002': {
    id: 'BR-BLOCK-002', entity: 'branch', level: 'block', status: 'approved', okText: 'Chưa có chứng từ, không còn kho (xoá được)',
    title: 'Chi nhánh {code}: {detail}.',
    why: 'Chứng từ, sổ kho đã ghi theo chi nhánh; xoá làm mất lịch sử và sai số liệu.',
    fix: 'Bỏ tích "Theo dõi" để ngừng dùng; còn kho thì xoá hoặc chuyển kho ở Danh mục kho trước.',
  },
  'BR-BLOCK-003': {
    id: 'BR-BLOCK-003', entity: 'branch', level: 'block', status: 'approved', okText: 'Mã chi nhánh chưa ai dùng', field: 'code',
    title: 'Mã chi nhánh {code} đã có.',
    why: 'Mỗi mã chỉ thuộc một chi nhánh; trùng mã làm chứng từ ghi lẫn hai chi nhánh.',
    fix: 'Nhập mã khác.',
  },
  'BR-BLOCK-004': {
    id: 'BR-BLOCK-004', entity: 'branch', level: 'block', status: 'approved', okText: 'Thuộc nút cơ cấu tổ chức đang dùng', field: 'orgUnitCode',
    title: 'Nút cơ cấu tổ chức {code}: {detail}.',
    why: 'Chi nhánh gắn vào một nút của cơ cấu tổ chức để báo cáo theo vùng / miền gộp đúng.',
    fix: 'Chọn nút đang dùng trong cây Cơ cấu tổ chức (DM16).',
  },
};
