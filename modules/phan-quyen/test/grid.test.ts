/** Lưới "Sửa vai trò" (chức năng × thao tác) và đổi tick thành luật Cho / Cấm. Dữ liệu giả. Chạy: `npm test -w @bizcity-module/phan-quyen`. */
import { describe, expect, it } from 'vitest';
import { buildGrid, keysOfGroups, planGrid } from '../web/lib/grid';
import type { MatrixData, MatrixPermission, MatrixRole, RoleDetail } from '../web/lib/matrix';

const p = (key: string, label: string, module = 'core', risk: 'low' | 'high' = 'low'): MatrixPermission => ({ key, label, module, risk, resource: null, operation: null });
const perms = [
  p('catalog:read', 'Xem danh mục'), p('catalog:write', 'Thêm / sửa danh mục'),
  p('documents:read', 'Xem chứng từ'), p('documents:write', 'Lập / sửa / huỷ chứng từ'), p('documents:edit-all', 'Sửa phiếu người khác', 'core', 'high'),
  p('periods:lock', 'Khoá / mở kỳ', 'core', 'high'),
  p('ban-hang:hoa-don-xem', 'Xem hoá đơn bán hàng', 'ban-hang'), p('ban-hang:hoa-don-lap', 'Lập / sửa hoá đơn bán hàng (cửa nạp chứng từ)', 'ban-hang'),
  p('ban-hang:hoa-don-huy', 'Huỷ hoá đơn bán hàng', 'ban-hang'), p('ban-hang:hoa-don-xuat', 'Xuất Excel hoá đơn bán hàng (bảng kê bán hàng)', 'ban-hang'),
  p('kho:chuyen-kho-lap', 'Lập / sửa phiếu chuyển kho (cửa nạp chứng từ)', 'kho'),
];

describe('buildGrid', () => {
  it('quyền chứng từ của phân hệ: một dòng, bốn cột; tên dòng bỏ động từ', () => {
    const g = buildGrid(perms, 'nghiep-vu');
    const ban = g.find((x) => x.label === 'Bán hàng')!;
    expect(ban.rows).toHaveLength(1);
    expect(ban.rows[0]!.label).toBe('Hoá đơn bán hàng');
    expect(Object.fromEntries(Object.entries(ban.rows[0]!.cells).map(([c, ps]) => [c, ps!.map((x) => x.key)]))).toEqual({
      xem: ['ban-hang:hoa-don-xem'], lap: ['ban-hang:hoa-don-lap'], huy: ['ban-hang:hoa-don-huy'], xuat: ['ban-hang:hoa-don-xuat'],
    });
    const core = g.find((x) => x.label === 'Chứng từ (mọi loại)')!;
    expect(core.rows[0]!.cells.khac!.map((x) => x.key)).toEqual(['documents:edit-all']);
  });
  it('mỗi quyền ở đúng một thẻ; tìm kiếm lọc dòng', () => {
    const all = (['danh-muc', 'nghiep-vu', 'bao-cao', 'tien-ich'] as const).flatMap((t) => keysOfGroups(buildGrid(perms, t)));
    expect(all.sort()).toEqual(perms.map((x) => x.key).sort());
    expect(buildGrid(perms, 'nghiep-vu', 'chuyển kho').flatMap((x) => x.rows.map((r) => r.label))).toEqual(['Phiếu chuyển kho']);
  });
});

describe('planGrid', () => {
  const role: MatrixRole = { id: 'tenant:7', code: 'thu_kho', label: 'Thủ kho', kind: 'job', isActive: true, baseRole: 'viewer', system: false };
  const m: MatrixData = {
    permissions: perms,
    roles: [{ id: 'system:viewer', code: 'viewer', label: 'Người xem', kind: 'system', isActive: true, baseRole: null, system: true }, role],
    cells: {
      'system:viewer': { allow: ['catalog:read', 'documents:read', 'ban-hang:hoa-don-xem'], deny: [] },
      'tenant:7': { allow: ['catalog:read', 'documents:read', 'kho:chuyen-kho-lap'], deny: ['ban-hang:hoa-don-xem'] },
    },
  };
  const detail: RoleDetail = { id: '7', code: 'thu_kho', label: 'Thủ kho', kind: 'job', baseRole: 'viewer', isActive: true, version: 1, rules: [
    { id: '1', permission: 'kho:chuyen-kho-lap', effect: 'allow', note: null, active: true },
    { id: '2', permission: 'ban-hang:hoa-don-xem', effect: 'deny', note: null, active: true },
  ] };
  it('bật quyền mới → Cho; quyền cao → cần mật khẩu', () => {
    expect(planGrid(m, role, detail, new Map([['periods:lock', true]]))).toEqual({ ops: [{ kind: 'allow', permission: 'periods:lock' }], blocked: [], high: true });
  });
  it('tắt quyền Cho riêng → gỡ luật; tắt quyền từ nền → Cấm đích danh', () => {
    const plan = planGrid(m, role, detail, new Map([['kho:chuyen-kho-lap', false], ['catalog:read', false]]));
    expect(plan.ops).toEqual([{ kind: 'remove', rule: detail.rules[0] }, { kind: 'deny', permission: 'catalog:read' }]);
  });
  it('bật lại quyền đang bị Cấm đích danh mà nền có → chỉ gỡ Cấm; Cấm theo mẫu * → báo chặn', () => {
    expect(planGrid(m, role, detail, new Map([['ban-hang:hoa-don-xem', true]])).ops).toEqual([{ kind: 'remove', rule: detail.rules[1] }]);
    const d2 = { ...detail, rules: [...detail.rules, { id: '3', permission: 'catalog:*', effect: 'deny' as const, note: null, active: true }] };
    const m2 = { ...m, cells: { ...m.cells, 'tenant:7': { allow: [], deny: ['catalog:read', 'catalog:write'] } } };
    const plan = planGrid(m2, role, d2, new Map([['catalog:write', true]]));
    expect(plan.ops).toEqual([]);
    expect(plan.blocked[0]!.reason).toContain('catalog:*');
  });
  it('không đổi gì → không có luật', () => {
    expect(planGrid(m, role, detail, new Map([['catalog:read', true]])).ops).toEqual([]);
  });
});
