// [2026-11-17 05:30 PM khanhtd] NT-HT-003 — GĐ4 (§14): module mới khai màn × thao tác ở manifest (H13) và chi nhánh của bản ghi ở action (H14)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineModule, screenErrors, type ModuleManifestLike } from '@bizcity/module-sdk';
import { defineAction, runAction } from '@bizcity/platform/core/actions';
import { impliedBy, registerModulePermissions, rolePermissions, type AuthContext } from '@bizcity/platform/core/auth';
import { db } from '../src/db/client.js';
import { danhSachManHinh, quyenThaoTac } from '../src/modules/access/man-hinh.js';
import { dangKyManHinhModule } from '../src/modules/access/man-hinh-module.js';
import { setupTenant, type TestCtx } from './helpers.js';

const QUYEN = [
  { key: 'thu-man:don-xem', label: 'Xem đơn' }, { key: 'thu-man:don-lap', label: 'Thêm đơn' },
  { key: 'thu-man:don-xoa', label: 'Xoá đơn', risk: 'high' as const },
];
const manifest = (screens: unknown[]): ModuleManifestLike => ({
  contract: 'bizcity_module@1', id: 'bizcity.thu-man', key: 'thu-man', kind: 'module', version: '0.1.0', label: 'Thử màn',
  requires: { capabilities: [] }, permissions: QUYEN, actions: [], extensions: { screens },
});
const MAN = {
  key: 'thu-man.don', code: 'TM01', label: 'Đơn thử', path: '/app/thu-man/don',
  operations: {
    xem: { permission: 'thu-man:don-xem', label: 'Xem', kind: 'xem' },
    them: { permission: 'thu-man:don-lap', label: 'Thêm', kind: 'ghi' },
    xoa: { permission: 'thu-man:don-xoa', label: 'Xoá', kind: 'huy' },
  },
};

describe('H13 — manifest extensions.screens[]', () => {
  it('khai đúng → không lỗi; defineModule nhận', () => {
    expect(screenErrors(manifest([MAN]))).toEqual([]);
    expect(() => defineModule({ manifest: manifest([MAN]) })).not.toThrow();
  });

  it('khai sai → defineModule dừng nạp, nói rõ chỗ sai', () => {
    const sai = manifest([
      { ...MAN, key: 'khac.don' },
      { ...MAN, key: 'thu-man.thieu-xem', operations: { them: MAN.operations.them } },
      { ...MAN, key: 'thu-man.quyen-la', operations: { ...MAN.operations, duyet: { permission: 'thu-man:don-duyet', label: 'Duyệt', kind: 'ghi' } } },
      { ...MAN, key: 'thu-man.sai-tien-to', operations: { xem: { permission: 'kho:chuyen-kho-xem', label: 'Xem', kind: 'xem' } } },
      { ...MAN, key: 'thu-man.sai-duong', path: '/kho/chuyen-kho' },
    ]);
    const loi = screenErrors(sai).join(' | ');
    expect(loi).toContain('khoá phải dạng "thu-man.<màn>"');
    expect(loi).toContain('thiếu thao tác "xem"');
    expect(loi).toContain('"thu-man:don-duyet" chưa khai ở permissions[]');
    expect(loi).toContain('phải dạng "thu-man:<việc>"');
    expect(loi).toContain('phải nằm dưới /app/thu-man/');
    expect(() => defineModule({ manifest: sai })).toThrow(/chưa khai ở permissions/);
  });

  it('Core đăng ký màn module: có trong sổ màn, gác bằng ĐÚNG quyền module; quyền Core KHÔNG kéo theo (mặc định cấm)', () => {
    registerModulePermissions('thu-man', QUYEN);
    const canhBao = dangKyManHinhModule('thu-man', 'Thử màn', manifest([MAN]), [
      { id: 'thu-man.don.tao', permission: 'thu-man:don-lap', effect: 'write' },
      { id: 'thu-man.don.xem', permission: 'thu-man:don-xem', effect: 'read' },
      { id: 'thu-man.don.dong-bo', permission: 'thu-man:dong-bo', effect: 'write' },
    ]);
    expect(danhSachManHinh().find((m) => m.key === 'thu-man.don')).toMatchObject({ ma: 'TM01', nhom: 'Thử màn', duongDan: '/app/thu-man/don' });
    expect(quyenThaoTac('thu-man.don', 'them')).toBe('thu-man:don-lap');
    expect(quyenThaoTac('thu-man.don', 'xoa')).toBe('thu-man:don-xoa');
    expect(impliedBy('documents:write')).not.toContain('thu-man:don-lap');
    expect(impliedBy('documents:read')).not.toContain('thu-man:don-xem');
    expect([...rolePermissions('accountant')]).not.toContain('thu-man:don-lap');
    expect(canhBao).toEqual([expect.stringContaining('thu-man.don.dong-bo')]);
  });
});

describe('H14 — defineAction({ branchOf }) + ctx.branchScope', () => {
  let ctx: TestCtx;
  let tenantId = '';
  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  });
  afterAll(async () => { await ctx?.app.close(); });

  let thayPhamVi: readonly string[] | null = null;
  const action = defineAction({
    id: 'thu-man.don.xem-mot', title: 'Xem một đơn (thử)', permission: 'catalog:read', effect: 'read', idempotency: 'none',
    input: z.object({ id: z.string() }), output: z.object({ ok: z.boolean() }), expose: {},
    branchOf: async (_c, i) => (i.id === '2' ? 'CN02' : 'CN01'),
    handler: async (c) => { thayPhamVi = c.branchScope; return { ok: true }; },
  });
  const auth = (branchScope: readonly string[] | null): AuthContext => ({
    tenantId, actor: 'user:1', actorName: 'Thử', kind: 'user', role: 'staff', permissions: new Set(['catalog:read']), branchScope,
  });
  const goi = (id: string, scope: readonly string[] | null) => runAction(action, { id }, { auth: auth(scope), requestId: `thu-${id}-${Math.random()}` });

  it('bản ghi ở chi nhánh ngoài phạm vi → FORBIDDEN BRANCH_OUT_OF_SCOPE, handler không chạy', async () => {
    thayPhamVi = null;
    await expect(goi('2', ['CN01'])).rejects.toThrow(/BRANCH_OUT_OF_SCOPE/);
    expect(thayPhamVi).toBeNull();
  });

  it('bản ghi trong phạm vi → chạy; handler thấy ctx.branchScope', async () => {
    await expect(goi('1', ['CN01'])).resolves.toBeTruthy();
    expect(thayPhamVi).toEqual(['CN01']);
  });

  it('không bị giới hạn chi nhánh (branchScope null) → không so, chạy bình thường', async () => {
    await expect(goi('2', null)).resolves.toBeTruthy();
    expect(thayPhamVi).toBeNull();
  });
});
