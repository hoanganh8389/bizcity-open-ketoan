// fixture: sổ quyền rút gọn
export const CORE_PERMISSION_META = {
  'documents:read': { label: 'Xem chứng từ', risk: 'low', resource: 'document', operation: 'read' },
  'documents:write': { label: 'Lập chứng từ', risk: 'low', resource: 'document', operation: 'update' },
  'documents:edit-all': { label: 'Sửa phiếu người khác', risk: 'high', resource: 'document', operation: 'update' },
  'documents:bypass-date-lock': { label: 'Vượt khoá ngày', risk: 'high', resource: 'document', operation: 'update', aliases: ['tgs:HT10'] },
  'reports:read': { label: 'Xem báo cáo', risk: 'low', resource: 'report', operation: 'read' },
};
