/** "Dùng mẫu" và thao tác cả nhóm (PHASE-028 giai đoạn 4.1 / 4.2). Dữ liệu giả. Chạy: `npm test -w @bizcity-module/phan-quyen`. */
import { describe, expect, it } from 'vitest';
import { planTemplate, templateOf } from '../web/lib/template';
import { groupRulePlan, type MatrixPermission, type RoleDetail } from '../web/lib/matrix';

const row = (payload: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ item: { code: 'tgs-thu-kho', name: 'Thủ kho', payload, ...extra } });
const known = new Map<string, 'low' | 'high'>([['reports:read', 'low'], ['catalog:read', 'low'], ['users:write', 'high']]);

describe('templateOf', () => {
  it('đọc mục thư viện đúng khuôn; sai khuôn → null', () => {
    expect(templateOf(row({ baseRole: 'viewer', derived: ['reports:read'], anomalies: ['dòng 1'] }))).toEqual({ code: 'tgs-thu-kho', name: 'Thủ kho', baseRole: 'viewer', derived: ['reports:read'], anomalies: ['dòng 1'] });
    expect(templateOf(row({ derived: ['reports:read'] }))).toBeNull();
    expect(templateOf({ item: { code: 1, name: 'x', payload: { baseRole: 'viewer', derived: [] } } })).toBeNull();
  });
});

describe('planTemplate', () => {
  const t = templateOf(row({ baseRole: 'viewer', derived: ['reports:read', 'users:write', 'kho:de-xuat', 'reports:read'], anomalies: [] }))!;
  it('chỉ Cho quyền có trong sổ, bỏ trùng; quyền chưa có hiện riêng; có quyền cao → cần mật khẩu', () => {
    expect(planTemplate(t, known)).toEqual({ add: ['reports:read', 'users:write'], unknown: ['kho:de-xuat'], high: true });
  });
  it('chạy lại: luật Cho đã có thì bỏ qua (vai trò dở dang)', () => {
    expect(planTemplate(t, known, ['users:write'])).toEqual({ add: ['reports:read'], unknown: ['kho:de-xuat'], high: false });
  });
});

describe('groupRulePlan', () => {
  const perm = (key: string, risk: 'low' | 'high'): MatrixPermission => ({ key, label: key, module: 'core', risk, resource: null, operation: null });
  const items = [perm('catalog:read', 'low'), perm('catalog:write', 'low'), perm('periods:lock', 'high')];
  const detail = (rules: RoleDetail['rules']): RoleDetail => ({ id: '7', code: 'x', label: 'x', kind: 'job', baseRole: 'viewer', isActive: true, version: 1, rules });
  it('Cho: chỉ quyền rủi ro thấp chưa Cho; Cấm: một mẫu cho mỗi tiền tố chưa Cấm', () => {
    const plan = groupRulePlan(items, detail([{ id: '1', permission: 'catalog:read', effect: 'allow', note: null, active: true }, { id: '2', permission: 'periods:*', effect: 'deny', note: null, active: true }]));
    expect(plan).toEqual({ allow: ['catalog:write'], deny: ['catalog:*'] });
  });
  it('luật đã gỡ không tính', () => {
    expect(groupRulePlan(items, detail([{ id: '1', permission: 'catalog:write', effect: 'allow', note: null, active: false }])).allow).toEqual(['catalog:read', 'catalog:write']);
  });
});
