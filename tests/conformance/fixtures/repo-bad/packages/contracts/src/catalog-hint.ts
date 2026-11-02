// Ca tự kiểm SC-FIND-1 (xem ../../../../expect.json): mã trùng với danh mục IN-*, cảnh báo không có cách sửa, chưa có trang tra mã.
export const CATALOG_HINTS = {
  'IN-XAU-001': {
    id: 'IN-XAU-001', entity: 'account', level: 'info', status: 'draft',
    title: 'Trùng mã với danh mục tiền kiểm',
    why: 'Ca tự kiểm.',
  },
  'ACC-XAU-001': {
    id: 'ACC-XAU-001', entity: 'account', level: 'warn', status: 'draft',
    title: 'Cảnh báo không có cách sửa',
    why: 'Ca tự kiểm.',
  },
};
