/** Logic thuần của ma trận Role Editor (PHASE-028 W4). Dữ liệu giả. Chạy: `npm test -w @bizcity-module/phan-quyen`. */
import { describe, expect, it } from 'vitest';
import {
  cellOf, columnSummary, explainCell, groupPermissions, matchPattern, needsPassword, roleDbId, validReason,
  type MatrixData, type MatrixRole, type RoleDetail,
} from './matrix';

const perms = [
  { key: 'catalog:read', label: 'Xem danh mục', module: 'core', risk: 'low' as const, resource: 'catalog', operation: 'read' },
  { key: 'catalog:write', label: 'Thêm / sửa danh mục', module: 'core', risk: 'low' as const, resource: 'catalog', operation: 'update' },
  { key: 'periods:lock', label: 'Khoá / mở kỳ', module: 'core', risk: 'high' as const, resource: 'period', operation: 'manage' },
  { key: 'kho:xuat', label: 'Xuất kho', module: 'kho', risk: 'low' as const, resource: null, operation: null },
];
const role = (over: Partial<MatrixRole>): MatrixRole => ({ id: 'tenant:7', code: 'thu_kho', label: 'Thủ kho', kind: 'job', isActive: true, baseRole: 'viewer', system: false, ...over });
const matrix: MatrixData = {
  permissions: perms,
  roles: [role({ id: 'system:viewer', code: 'viewer', label: 'Người xem', system: true, baseRole: null }), role({})],
  cells: {
    'system:viewer': { allow: ['catalog:read'], deny: [] },
    'tenant:7': { allow: ['catalog:read', 'catalog:write'], deny: [] },
    'tenant:8': { allow: [], deny: ['periods:lock'] },
  },
};
const detail = (rules: RoleDetail['rules']): RoleDetail => ({ id: '7', code: 'thu_kho', label: 'Thủ kho', kind: 'job', baseRole: 'viewer', isActive: true, version: 1, rules });

describe('matchPattern', () => {
  it('đích danh; * khớp một vế, không vượt dấu :', () => {
    expect(matchPattern('ledger:read', 'ledger:read')).toBe(true);
    expect(matchPattern('ledger:*', 'ledger:read')).toBe(true);
    expect(matchPattern('*:read', 'catalog:read')).toBe(true);
    expect(matchPattern('ledger:*', 'catalog:read')).toBe(false);
    expect(matchPattern('*', 'ledger:read')).toBe(false);
    expect(matchPattern('catalog:read', 'catalog:write')).toBe(false);
  });
});

describe('groupPermissions', () => {
  it('Lõi trước, module sau; trong nhóm theo khoá', () => {
    const g = groupPermissions(perms);
    expect(g.map((x) => x.module)).toEqual(['core', 'kho']);
    expect(g[0]!.items.map((p) => p.key)).toEqual(['catalog:read', 'catalog:write', 'periods:lock']);
  });
  it('tìm theo khoá hoặc nhãn, không phân biệt hoa thường', () => {
    expect(groupPermissions(perms, 'KHOÁ')[0]!.items.map((p) => p.key)).toEqual(['periods:lock']);
    expect(groupPermissions(perms, 'kho:xu')[0]!.module).toBe('kho');
    expect(groupPermissions(perms, 'không-có')).toEqual([]);
  });
});

describe('cellOf / columnSummary', () => {
  it('Có · Cấm · —; cột không có dữ liệu là —', () => {
    expect(cellOf(matrix, 'tenant:7', 'catalog:write')).toBe('allow');
    expect(cellOf(matrix, 'tenant:8', 'periods:lock')).toBe('deny');
    expect(cellOf(matrix, 'tenant:7', 'kho:xuat')).toBe('none');
    expect(cellOf(matrix, 'tenant:99', 'catalog:read')).toBe('none');
    expect(columnSummary(matrix, 'tenant:7')).toEqual({ allow: 2, deny: 0 });
    expect(columnSummary(matrix, 'tenant:99')).toEqual({ allow: 0, deny: 0 });
  });
});

describe('explainCell', () => {
  it('vai trò hệ thống chỉ đọc', () => {
    const ex = explainCell(matrix, matrix.roles[0]!, undefined, 'catalog:read');
    expect(ex).toMatchObject({ cell: 'allow', canAllow: false, canDeny: false, removable: [] });
  });
  it('quyền đến từ vai trò nền: không Cho thêm, Cấm được', () => {
    const ex = explainCell(matrix, role({}), detail([]), 'catalog:read');
    expect(ex.reasons).toEqual([{ kind: 'base', baseRole: 'viewer' }]);
    expect(ex.canAllow).toBe(false);
    expect(ex.canDeny).toBe(true);
  });
  it('quyền Cho riêng: gỡ được, không Cho lại', () => {
    const rule = { id: '3', permission: 'catalog:write', effect: 'allow' as const, note: null, active: true };
    const ex = explainCell(matrix, role({}), detail([rule]), 'catalog:write');
    expect(ex.reasons).toEqual([{ kind: 'rule-allow', rule }]);
    expect(ex.canAllow).toBe(false);
    expect(ex.removable).toEqual([rule]);
  });
  it('chưa có gì: Cho và Cấm đều thêm được', () => {
    const ex = explainCell(matrix, role({}), detail([]), 'periods:lock');
    expect(ex).toMatchObject({ cell: 'none', canAllow: true, canDeny: true, removable: [] });
    expect(ex.reasons).toEqual([{ kind: 'none' }]);
  });
  it('luật Cấm dạng mẫu khớp quyền: nêu luật, không Cho / Cấm thêm, gỡ được; luật đã gỡ không tính', () => {
    const deny = { id: '4', permission: 'periods:*', effect: 'deny' as const, note: null, active: true };
    const gone = { id: '5', permission: 'catalog:*', effect: 'deny' as const, note: null, active: false };
    const m: MatrixData = { ...matrix, cells: { ...matrix.cells, 'tenant:7': { allow: [], deny: ['periods:lock'] } } };
    const ex = explainCell(m, role({}), detail([deny, gone]), 'periods:lock');
    expect(ex.cell).toBe('deny');
    expect(ex.reasons[0]).toEqual({ kind: 'rule-deny', rules: [deny] });
    expect(ex).toMatchObject({ canAllow: false, canDeny: false, removable: [deny] });
    expect(explainCell(m, role({}), detail([deny, gone]), 'catalog:write').removable).toEqual([]);
  });
  it('vai trò hạn chế (restriction) không Cho; vai trò vô hiệu không sửa', () => {
    expect(explainCell(matrix, role({ kind: 'restriction', baseRole: null }), detail([]), 'periods:lock')).toMatchObject({ canAllow: false, canDeny: true });
    expect(explainCell(matrix, role({ isActive: false }), detail([]), 'periods:lock')).toMatchObject({ canAllow: false, canDeny: false });
  });
});

describe('tiện ích', () => {
  it('roleDbId bỏ tiền tố tenant:', () => expect(roleDbId('tenant:12')).toBe('12'));
  it('needsPassword nhận câu lỗi nêu confirmPassword', () => {
    expect(needsPassword('Cho quyền rủi ro cao periods:lock — nhập lại mật khẩu của bạn (confirmPassword)')).toBe(true);
    expect(needsPassword('Mật khẩu xác nhận không đúng')).toBe(false);
  });
  it('validReason cần ≥ 3 ký tự sau khi cắt khoảng trắng', () => {
    expect(validReason('  ab ')).toBe(false);
    expect(validReason(' abc ')).toBe(true);
  });
});
