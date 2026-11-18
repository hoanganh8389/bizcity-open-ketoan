// [2026-11-19 Nguyễn Văn Thủy] quy tắc khai báo Nhóm hàng / phân loại hàng (DM11: nhóm, ngành, nhãn, loại; nhóm hạch toán, loại thuế của mặt hàng) — docs/nghiep-vu/25 (đóng góp)
import type { CatalogHintDef } from '../catalog-hint.js';

export const QT_NHOM_HANG: Record<string, CatalogHintDef> = {
  'GRP-BLOCK-001': {
    id: 'GRP-BLOCK-001', entity: 'group', level: 'block', status: 'approved', okText: 'Phân loại có trong danh mục', field: 'groupCode',
    title: 'Phân loại: {detail}.',
    why: 'Nhóm, ngành, nhãn, loại dùng để báo cáo và áp chính sách theo nhóm; mã không có thì mặt hàng không lên đúng báo cáo.',
    fix: 'Chọn trong danh sách, hoặc khai phân loại ở Danh mục nhóm hàng (DM11) trước.',
  },
  'GRP-BLOCK-002': {
    id: 'GRP-BLOCK-002', entity: 'group', level: 'block', status: 'approved', okText: 'Nhóm hạch toán có trong danh mục', field: 'postingGroupCode',
    title: 'Nhóm hạch toán chưa có: {codes}.',
    why: 'Nhóm hạch toán quyết định tài khoản kho, giá vốn, doanh thu của mặt hàng.',
    fix: 'Chọn nhóm hạch toán có sẵn, hoặc khai ở Cấu hình hạch toán trước.',
  },
  'GRP-BLOCK-003': {
    id: 'GRP-BLOCK-003', entity: 'group', level: 'block', status: 'approved', okText: 'Loại thuế đúng chiều (đầu ra / đầu vào)', field: 'taxOutCode',
    title: 'Loại thuế: {detail}.',
    why: 'Thuế bán ra phải là loại thuế đầu ra, thuế mua vào là loại đầu vào; chọn nhầm chiều thì tờ khai GTGT sai.',
    fix: 'Chọn loại thuế đúng chiều trong Biểu thuế.',
  },
  'GRP-BLOCK-004': {
    id: 'GRP-BLOCK-004', entity: 'group', level: 'block', status: 'approved', okText: 'Không còn mặt hàng / mã con dùng (xoá được)',
    title: 'Không xoá được: {detail}.',
    why: 'Còn mặt hàng hoặc phân loại con dùng mã này; xoá làm các mục đó mất phân loại, báo cáo theo nhóm sai.',
    fix: 'Bấm Sửa, bỏ tích "Đang dùng" để ngừng; hoặc chuyển mặt hàng / mã con sang phân loại khác trước.',
  },
  'GRP-BLOCK-005': {
    id: 'GRP-BLOCK-005', entity: 'group', level: 'block', status: 'approved', okText: 'Nhóm cha hợp lệ', field: 'parentCode',
    title: 'Nhóm cha: {detail}.',
    why: 'Cây nhóm hàng không được vòng và nhóm đã tạo không đổi nhánh — mã hàng sinh theo nhánh nhóm, đổi nhánh làm mã không còn khớp nhóm.',
    fix: 'Chọn nhóm cha có sẵn, nằm ngoài nhánh của nhóm đang sửa; muốn đổi nhánh thì lập nhóm mới.',
  },
  'GRP-BLOCK-006': {
    id: 'GRP-BLOCK-006', entity: 'group', level: 'block', status: 'approved', okText: 'Mã nhóm không trùng', field: 'skuCode',
    title: 'Trùng mã: {detail}.',
    why: 'Mã nhóm là một phần của mã hàng sinh tự động; trùng mã thì hai nhóm sinh ra mã hàng lẫn nhau.',
    fix: 'Đặt mã khác chưa dùng ở cùng cấp.',
  },
  'GRP-BLOCK-007': {
    id: 'GRP-BLOCK-007', entity: 'group', level: 'block', status: 'approved', okText: 'Nhóm chưa có mặt hàng (đổi mã ngắn được)', field: 'skuCode',
    title: 'Nhóm đã có mặt hàng ({sku}): giữ nguyên mã ngắn và nhóm cha.',
    why: 'Mã hàng đã sinh theo mã ngắn và nhánh của nhóm; đổi thì mã hàng cũ không còn khớp nhóm.',
    fix: 'Giữ mã ngắn, nhóm cha; muốn khác thì lập nhóm mới rồi chuyển mặt hàng.',
  },
  'GRP-BLOCK-008': {
    id: 'GRP-BLOCK-008', entity: 'group', level: 'block', status: 'approved', okText: 'Mã nhóm đúng khuôn theo cấp', field: 'skuCode',
    title: 'Mã nhóm hàng: {detail}.',
    why: 'Mã hàng tự sinh ghép mã nhóm từng cấp theo số ký tự cố định (ngành 2 + nhãn 3 + nhóm 1); sai khuôn thì không sinh được mã hàng.',
    fix: 'Nhập mã đúng số ký tự của cấp, chỉ chữ và số (cấp 1: 2 chữ số, không bắt đầu bằng 0).',
  },
};
