// Ca tự kiểm SC-INTAKE-1 (xem ../../../../expect.json): mã IN-XAU-001 không có dòng ở bảng hợp đồng, không có trang bài học.
// Ca tự kiểm SC-FIX-1: IN-XAU-001 mức block nhưng không có phương án trong INTAKE_REMEDIES.
export const INTAKE_CATALOG = {
  'IN-XAU-001': { layer: 'L1', severity: 'block', stage: 'door', weight: 0, title: 'Mã mẫu cố ý sai', why: 'Ca tự kiểm.', fix: 'Không sửa.', ref: 'SC-INTAKE-1', acceptable: false },
} as const;
