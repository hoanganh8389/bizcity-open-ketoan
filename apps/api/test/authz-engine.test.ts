// [2026-11-05 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W1 nền: bộ tính quyền thuần — ca T028-1, 2, 4, 5, 9, 13, 16, 18, 22 ở mức hàm (ADR-0027 D5)
/**
 * Bộ tính phân quyền (packages/platform/src/core/authz/engine.ts) — không CSDL:
 *   - một người nhiều lần gán, Cho không gộp chéo phạm vi (T028-1); kho báo cáo ≠ kho làm việc (T028-4); chuyển kho hai đầu (T028-5)
 *   - Cấm luôn thắng; Nới chỉ nới điều kiện, không tự cấp (T028-22); hạn sửa theo giờ lập phiếu, người lập
 *   - mẫu * không phủ quyền cao / quyền chưa duyệt (T028-2); khoá API / trợ lý không nhận quyền cao (T028-13)
 *   - 6 vai trò cũ × mọi quyền: bộ tính mới = rolePermissions (T028-9); batchAuthorize = gọi lẻ (T028-18)
 *   - sổ quyền: đổi nhãn không đổi nghĩa (T028-16), diff nâng cấp phát hiện quyền mới / rủi ro tăng
 */
import { describe, expect, it } from 'vitest';
import { ROLES, type Role } from '@ketoan/contracts';
import type { AuthzAssignment, AuthzRole } from '@bizcity/platform/core/authz/types';
import { rolePermissions } from '@bizcity/platform/core/auth';
import {
  authorize, batchAuthorize, buildCatalog, codePermissions, diffCatalog, explain, legacyAssignment, matchPattern, meaningHash, scopeOf, systemRoles,
  type CatalogEntry,
} from '@bizcity/platform/core/authz/index';

const NOW = new Date('2026-11-05T09:00:00+07:00');
const PERMS = [
  { key: 'quy:receipt-read', label: 'Xem phiếu thu', module: 'quy', risk: 'low' as const },
  { key: 'quy:receipt-update', label: 'Sửa phiếu thu', module: 'quy', risk: 'low' as const, defaults: { edit_window_days: 0, creator: 'self' as const } },
  { key: 'quy:receipt-cancel', label: 'Huỷ phiếu thu', module: 'quy', risk: 'low' as const },
  { key: 'kho:transfer-create', label: 'Lập chuyển kho', module: 'kho', risk: 'low' as const },
  { key: 'kho:transfer-confirm', label: 'Xác nhận nhận hàng', module: 'kho', risk: 'low' as const },
  { key: 'kho:report-read', label: 'Báo cáo kho', module: 'kho', risk: 'low' as const },
  { key: 'kho:cost-read', label: 'Xem giá vốn', module: 'kho', risk: 'high' as const, sensitive: 'field' as const },
  { key: 'ban-hang:price-override', label: 'Sửa giá khi bán', module: 'ban-hang', risk: 'low' as const },
];
const seenAllActive = PERMS.map((p) => ({ permission_key: p.key, meaning_hash: meaningHash(p), status: 'active' as const }));
const catalog = buildCatalog(PERMS, seenAllActive);

const role = (id: string, rules: AuthzRole['rules'], kind: AuthzRole['kind'] = 'job'): AuthzRole => ({ id, code: id, label: id, kind, isActive: true, rules });
const ROLE_MAP = new Map<string, AuthzRole>([
  ['cash', role('cash', [{ id: 'r1', pattern: 'quy:*', effect: 'allow' }])],
  ['viewer', role('viewer', [{ id: 'r2', pattern: '*:*-read', effect: 'allow' }])],
  ['relax3', role('relax3', [{ id: 'r3', pattern: 'quy:*-update', effect: 'relax', conditions: { edit_window_days: 3 } }], 'privilege')],
  ['nocancel', role('nocancel', [{ id: 'r4', pattern: '*:*-cancel', effect: 'deny' }], 'restriction')],
  ['keeper', role('keeper', [{ id: 'r5', pattern: 'kho:transfer-*', effect: 'allow' }, { id: 'r6', pattern: 'kho:cost-read', effect: 'allow' }])],
  ['wild', role('wild', [{ id: 'r7', pattern: '*:*', effect: 'allow' }])],
]);
const PT = { kind: 'org_unit' as const, id: '10', path: 'CTY\\BAC\\PT', subtree: true };
const YB = { kind: 'org_unit' as const, id: '11', path: 'CTY\\BAC\\YB', subtree: true };
const asg = (id: string, roleId: string, scopes: AuthzAssignment['scopes'], purposes: AuthzAssignment['purposes'], extra: Partial<AuthzAssignment> = {}): AuthzAssignment =>
  ({ id, principalKind: 'user', principalId: '7', roleId, scopes, purposes, ...extra });
const QLPT: AuthzAssignment[] = [
  asg('a1', 'cash', [PT], ['operate', 'report']),
  asg('a2', 'viewer', [YB], ['report']),
  asg('a3', 'relax3', [PT], ['operate'], { validTo: '2026-11-30T23:59:59+07:00' }),
  asg('a4', 'nocancel', [{ kind: 'all' }], ['operate', 'approve']),
];
const me = { kind: 'user' as const, id: '7' };
const base = { principal: me, now: NOW, authzVersion: 42, catalog, roles: ROLE_MAP, decisionId: 'dz_test' };
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const atPT = (over = {}) => ({ orgPath: 'CTY\\BAC\\PT\\PTO', createdBy: 'user:7', createdAt: daysAgo(2), ...over });
const atYB = (over = {}) => ({ orgPath: 'CTY\\BAC\\YB\\YBA', createdBy: 'user:7', createdAt: daysAgo(0), ...over });

describe('mẫu quyền', () => {
  it('* khớp trong một vế, không vượt dấu :', () => {
    expect(matchPattern('quy:*', 'quy:receipt-read')).toBe(true);
    expect(matchPattern('*:*-read', 'kho:report-read')).toBe(true);
    expect(matchPattern('*:*-read', 'kho:report-readx')).toBe(false);
    expect(matchPattern('quy:*', 'quyx:receipt-read')).toBe(false);
    expect(matchPattern('quy:receipt-read', 'quy:receipt-read')).toBe(true);
  });
});

describe('một người nhiều lần gán (T028-1, T028-22)', () => {
  it('sửa phiếu 2 ngày tuổi ở Phú Thọ: Cho của Kế toán quỹ + Nới 3 ngày cùng phạm vi → được', () => {
    const d = authorize({ ...base, assignments: QLPT, permission: 'quy:receipt-update', resource: atPT() });
    expect(d).toMatchObject({ allowed: true, reasonCode: 'AUTHZ-ALLOW', authzVersion: 42 });
    expect(d.matched.map((m) => m.ruleId)).toEqual(['r1', 'r3']);
  });
  it('cùng phiếu ở Yên Bái → từ chối: lần gán Yên Bái chỉ báo cáo, không gộp chéo phạm vi', () => {
    // Lần gán "Không huỷ chứng từ" (toàn đơn vị) vẫn sống ở Yên Bái nhưng không có luật Cho → NO-ALLOW, không mượn Cho của Phú Thọ.
    expect(authorize({ ...base, assignments: QLPT, permission: 'quy:receipt-update', resource: atYB() })).toMatchObject({ allowed: false, reasonCode: 'AUTHZ-NO-ALLOW' });
    expect(authorize({ ...base, assignments: QLPT.filter((a) => a.id !== 'a4'), permission: 'quy:receipt-update', resource: atYB() }).reasonCode).toBe('AUTHZ-NO-ASSIGNMENT');
    expect(authorize({ ...base, assignments: QLPT, permission: 'quy:receipt-read', purpose: 'report', resource: atYB() }).allowed).toBe(true);
  });
  it('hết hạn đặc quyền → về mặc định "trong ngày", điều kiện trượt có số liệu để dựng câu báo', () => {
    const d = authorize({ ...base, now: new Date('2026-12-01T09:00:00+07:00'), assignments: QLPT, permission: 'quy:receipt-update', resource: atPT({ createdAt: '2026-11-29T10:00:00+07:00' }) });
    expect(d).toMatchObject({ allowed: false, reasonCode: 'AUTHZ-CONDITION', failed: { condition: 'edit_window_days', need: 0, have: 2 } });
  });
  it('Nới không tự cấp: chỉ có đặc quyền Nới (không Cho) → từ chối', () => {
    const only = [asg('b1', 'relax3', [PT], ['operate'])];
    expect(authorize({ ...base, assignments: only, permission: 'quy:receipt-update', resource: atPT() }).reasonCode).toBe('AUTHZ-NO-ALLOW');
  });
  it('Cấm luôn thắng (huỷ ở Phú Thọ dù Kế toán quỹ có quy:*)', () => {
    const d = authorize({ ...base, assignments: QLPT, permission: 'quy:receipt-cancel', resource: atPT() });
    expect(d).toMatchObject({ allowed: false, reasonCode: 'AUTHZ-DENIED-BY-RULE', matched: [{ ruleId: 'r4' }] });
  });
  it('Cấm dạng mẫu phủ cả quyền high (hạn chế không được lỏng hơn Cho)', () => {
    const k = [asg('f1', 'keeper', [{ kind: 'all' }], ['report']), asg('f2', 'nocost', [{ kind: 'all' }], ['report'])];
    const roles = new Map(ROLE_MAP).set('nocost', role('nocost', [{ id: 'r8', pattern: 'kho:*', effect: 'deny' }], 'restriction'));
    expect(authorize({ ...base, roles, assignments: k, permission: 'kho:cost-read', purpose: 'report' }).reasonCode).toBe('AUTHZ-DENIED-BY-RULE');
  });
  it('người lập: phiếu của người khác trượt điều kiện creator=self', () => {
    const d = authorize({ ...base, assignments: QLPT, permission: 'quy:receipt-update', resource: atPT({ createdBy: 'user:9' }) });
    expect(d.failed).toMatchObject({ condition: 'creator', need: 'self', have: 'user:9' });
  });
  it('có tài nguyên mà thiếu trường điều kiện → đóng an toàn', () => {
    expect(authorize({ ...base, assignments: QLPT, permission: 'quy:receipt-update', resource: { orgPath: 'CTY\\BAC\\PT', createdBy: 'user:7' } }).allowed).toBe(false);
  });
  it('lần gán thu hồi / chưa hiệu lực không tính', () => {
    const rev = [asg('c1', 'cash', [PT], ['operate'], { revokedAt: daysAgo(1) })];
    const fut = [asg('c2', 'cash', [PT], ['operate'], { validFrom: '2027-01-01T00:00:00+07:00' })];
    expect(authorize({ ...base, assignments: rev, permission: 'quy:receipt-read', resource: atPT() }).allowed).toBe(false);
    expect(authorize({ ...base, assignments: fut, permission: 'quy:receipt-read', resource: atPT() }).allowed).toBe(false);
  });
});

describe('kho: báo cáo ≠ làm việc (T028-4), chuyển kho hai đầu (T028-5)', () => {
  const K1 = { kind: 'warehouse' as const, id: 'K1' };
  const K2 = { kind: 'warehouse' as const, id: 'K2' };
  const tk = [asg('d1', 'keeper', [K1], ['operate']), asg('d2', 'viewer', [K2], ['report'])];
  it('phạm vi báo cáo K2 không lập phiếu ở K2', () => {
    expect(authorize({ ...base, assignments: tk, permission: 'kho:report-read', purpose: 'report', resource: { warehouseId: 'K2' } }).allowed).toBe(true);
    expect(authorize({ ...base, assignments: tk, permission: 'kho:transfer-create', resource: { warehouseId: 'K2' } }).allowed).toBe(false);
  });
  it('người xuất ở K1 không xác nhận nhận ở K2', () => {
    expect(authorize({ ...base, assignments: tk, permission: 'kho:transfer-create', resource: { warehouseId: 'K1' } }).allowed).toBe(true);
    expect(authorize({ ...base, assignments: tk, permission: 'kho:transfer-confirm', resource: { warehouseId: 'K2' } }).allowed).toBe(false);
  });
  it('scopeOf: báo cáo kho chỉ trả K2 (không "rỗng = tất cả")', () => {
    expect(scopeOf({ ...base, assignments: tk, permission: 'kho:report-read', purpose: 'report' })).toEqual({ all: false, branchIds: [], warehouseIds: ['K2'], orgPaths: [] });
    expect(scopeOf({ ...base, assignments: [], permission: 'kho:report-read', purpose: 'report' })).toEqual({ all: false, branchIds: [], warehouseIds: [], orgPaths: [] });
  });
});

describe('quyền cao và quyền chưa duyệt (T028-2, T028-13)', () => {
  const all = (id: string, roleId: string) => [asg(id, roleId, [{ kind: 'all' }], ['operate', 'report'])];
  it('mẫu *:* không phủ quyền high; luật đích danh thì phủ, kèm xác thực lại', () => {
    expect(authorize({ ...base, assignments: all('e1', 'wild'), permission: 'kho:cost-read', purpose: 'report' }).reasonCode).toBe('AUTHZ-PERM-NOT-GRANTED-YET');
    expect(authorize({ ...base, assignments: all('e2', 'keeper'), permission: 'kho:cost-read', purpose: 'report' })).toMatchObject({ allowed: true, stepUpMinutes: 5 });
  });
  it('quyền module mới (chưa duyệt) không bị mẫu * phủ — cài module không ai có thêm quyền', () => {
    const upgraded = buildCatalog(PERMS, seenAllActive.filter((s) => s.permission_key !== 'ban-hang:price-override'));
    expect(upgraded.get('ban-hang:price-override')?.status).toBe('new');
    expect(authorize({ ...base, catalog: upgraded, assignments: all('e3', 'wild'), permission: 'ban-hang:price-override' }).allowed).toBe(false);
    expect(authorize({ ...base, catalog: upgraded, assignments: all('e4', 'wild'), permission: 'quy:receipt-read' }).allowed).toBe(true);
  });
  it('khoá API / trợ lý không nhận quyền high dù có luật đích danh', () => {
    const bot = [{ ...asg('e5', 'keeper', [{ kind: 'all' }], ['report']), principalKind: 'agent' as const, principalId: 'ai.helper' }];
    expect(authorize({ ...base, principal: { kind: 'agent', id: 'ai.helper' }, assignments: bot, permission: 'kho:cost-read', purpose: 'report' }).reasonCode).toBe('AUTHZ-HIGH-RISK-DELEGATION');
  });
  it('quyền không có trong sổ / đã ngừng', () => {
    expect(authorize({ ...base, assignments: QLPT, permission: 'quy:khong-co' }).reasonCode).toBe('AUTHZ-PERM-UNKNOWN');
    const gone = buildCatalog(PERMS.filter((p) => p.key !== 'quy:receipt-read'), seenAllActive);
    expect(authorize({ ...base, catalog: gone, assignments: QLPT, permission: 'quy:receipt-read' }).reasonCode).toBe('AUTHZ-PERM-REMOVED');
  });
  it('Giải thích trả vết từng bước', () => {
    const e = explain({ ...base, assignments: QLPT, permission: 'quy:receipt-cancel', resource: atPT() });
    expect(e.trace.map((t) => t.step)).toEqual(['catalog', 'assignments', 'deny']);
  });
});

describe('tương đương với 6 vai trò cũ (T028-9) và lô = lẻ (T028-18)', () => {
  const realCatalog = buildCatalog(codePermissions());
  const roles = systemRoles();
  it.each(Object.values(ROLES) as Role[])('vai trò %s: mọi quyền Core + module, mới = cũ', (r) => {
    const old = rolePermissions(r);
    const assignments = [legacyAssignment('42', r)];
    for (const p of realCatalog.keys()) {
      const d = authorize({ principal: { kind: 'user', id: '42' }, permission: p, now: NOW, authzVersion: 0, catalog: realCatalog, roles, assignments });
      expect({ p, allowed: d.allowed }).toEqual({ p, allowed: old.has(p as never) });
    }
  });
  it('batchAuthorize trả đúng kết quả từng quyền', () => {
    const keys = [...catalog.keys()];
    const batch = batchAuthorize({ ...base, assignments: QLPT, purpose: 'operate' }, keys);
    for (const k of keys) expect(batch.get(k)).toEqual(authorize({ ...base, assignments: QLPT, purpose: 'operate', permission: k }));
  });
});

describe('sổ quyền (T028-16, SC-AUTH-05)', () => {
  it('đổi nhãn / bí danh không đổi nghĩa; đổi rủi ro thì đổi', () => {
    const p = PERMS[0]!;
    expect(meaningHash({ ...p, label: 'Khác' } as never)).toBe(meaningHash(p));
    expect(meaningHash({ ...p, risk: 'high' })).not.toBe(meaningHash(p));
  });
  it('diff nâng cấp: thêm, bỏ, rủi ro tăng', () => {
    const next = buildCatalog([...PERMS.filter((p) => p.key !== 'kho:report-read').map((p) => (p.key === 'quy:receipt-cancel' ? { ...p, risk: 'high' as const } : p)), { key: 'kho:stocktake-create', label: 'Lập kiểm kê', module: 'kho' }]);
    expect(diffCatalog(catalog as Map<string, CatalogEntry>, next)).toEqual({ added: ['kho:stocktake-create'], removed: ['kho:report-read'], changed: [{ key: 'quy:receipt-cancel', riskRaised: true }] });
  });
});
