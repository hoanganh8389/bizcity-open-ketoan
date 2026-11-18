// [2026-11-19 Nguyễn Văn Thủy] quy tắc khai báo Đối tượng (khách hàng DM12, nhà cung cấp DM13, nhân viên DM04, nhóm DM08) — docs/nghiep-vu/25 (đóng góp)
// Mỗi mã: title (câu ngắn, có {biến}), why (vì sao), fix (cách sửa), okText (câu khi đã qua), field (ô trên form). Thêm mã mới: thêm một dòng
// + FINDING_BASIS (legal-basis.ts) + CATALOG_HINT_EXAMPLES (catalog-hint.ts) rồi `node scripts/sinh-ma-loi.mjs --write`.
import type { CatalogHintDef } from '../catalog-hint.js';

export const QT_DOI_TUONG: Record<string, CatalogHintDef> = {
  'PART-BLOCK-001': {
    id: 'PART-BLOCK-001', entity: 'partner', level: 'block', status: 'approved', okText: 'Nhóm đối tượng có trong danh mục', field: 'groupCode',
    title: 'Nhóm đối tượng chưa có trong danh mục: {codes}.',
    why: 'Nhóm dùng để gom báo cáo công nợ, chính sách theo nhóm; mã nhóm không có thì đối tượng không lên đúng báo cáo.',
    fix: 'Chọn nhóm trong danh sách, hoặc khai nhóm ở Nhóm khách hàng, nhà cung cấp (DM08) trước.',
  },
  'PART-BLOCK-002': {
    id: 'PART-BLOCK-002', entity: 'partner', level: 'block', status: 'approved', okText: 'Mã số thuế chưa dùng cho đối tượng khác', field: 'taxCode',
    title: 'Mã số thuế {taxCode} đã có ở {kind} {other} - {name}.',
    why: 'Mỗi mã số thuế chỉ dùng cho một đối tượng; hai mã cùng MST làm công nợ và hoá đơn tách đôi, đối chiếu không khớp.',
    fix: 'Mở đối tượng {other} để dùng lại; nếu là đơn vị phụ thuộc thì khai là đơn vị con của đối tượng đó.',
  },
  'PART-BLOCK-003': {
    id: 'PART-BLOCK-003', entity: 'partner', level: 'block', status: 'approved', okText: 'Mã đối tượng chưa ai dùng', field: 'code',
    title: 'Mã {code} đã có: {name} ({kind}).',
    why: 'Mỗi mã chỉ thuộc một đối tượng; trùng mã làm chứng từ, công nợ ghi lẫn hai đối tượng.',
    fix: 'Bấm "Lấy mã mới" hoặc nhập mã khác.',
  },
  'PART-BLOCK-004': {
    id: 'PART-BLOCK-004', entity: 'partner', level: 'block', status: 'approved', okText: 'Chưa có trên sổ (xoá được)',
    title: 'Đối tượng {code} đã có trên sổ, không xoá được.',
    why: 'Sổ cái và công nợ đã ghi theo đối tượng này; xoá làm mất lịch sử và sai số dư.',
    fix: 'Bỏ tích "Theo dõi" để khoá đối tượng.',
  },
  'PART-BLOCK-005': {
    id: 'PART-BLOCK-005', entity: 'partner', level: 'block', status: 'approved', okText: 'Không còn dữ liệu khác dùng (xoá được)',
    title: 'Đối tượng {code} đang dùng ở {refs}.',
    why: 'Chứng từ, hợp đồng, chính sách… còn trỏ tới đối tượng; xoá làm các dữ liệu đó mất người bán / người mua.',
    fix: 'Bỏ tích "Theo dõi" để khoá đối tượng thay vì xoá.',
  },
  'PART-BLOCK-006': {
    id: 'PART-BLOCK-006', entity: 'partner', level: 'block', status: 'approved', okText: 'Nhóm không còn đối tượng / nhóm con (xoá được)',
    title: 'Nhóm {code} đang dùng ({used}).',
    why: 'Còn đối tượng hoặc nhóm con thuộc nhóm này; xoá làm các mục đó mất nhóm.',
    fix: 'Bỏ tích "Đang dùng" để ngừng nhóm, hoặc chuyển đối tượng / nhóm con sang nhóm khác trước.',
  },
  'PART-BLOCK-007': {
    id: 'PART-BLOCK-007', entity: 'partner', level: 'block', status: 'approved', okText: 'Nhóm cha hợp lệ', field: 'parentCode',
    title: 'Nhóm cha: {detail}.',
    why: 'Cây nhóm không được vòng (nhóm là cha của chính nó, hoặc cha là cháu của nó) — báo cáo theo nhóm sẽ cộng lặp.',
    fix: 'Chọn nhóm cha nằm ngoài nhánh của nhóm đang sửa.',
  },
  'PART-BLOCK-008': {
    id: 'PART-BLOCK-008', entity: 'partner', level: 'block', status: 'approved', okText: 'Đơn vị cha – con hợp lệ', field: 'parentCode',
    title: 'Đơn vị cha: {detail}.',
    why: 'Mã đơn vị con là mã cha + "-số"; quan hệ cha – con dùng để gộp công nợ, thưởng cả nhóm — sai quan hệ thì gộp sai.',
    fix: 'Chọn đơn vị cha có trong danh mục; mã con bấm "Lấy mã" để máy cấp theo mã cha.',
  },
};
