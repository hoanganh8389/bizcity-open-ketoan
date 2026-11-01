/**
 * Manifest phân hệ / add-in (bizcity_module@1, PHASES 3.2, PHASE-011 S011-3): mỗi phân hệ và add-in có bizcity.module.json khớp
 * khai báo trong mã, manifest nói thật về action đã đăng ký, và GET /api/v1/system/modules?detail=true trả manifest.
 * Schema, năng lực, tiền tố: bộ kiểm SC-CON-2 / SC-MOD-3 (tests/conformance) — không lặp ở đây.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listActions } from '../src/core/actions.js';
import { loadModuleManifest } from '../src/core/module-manifest.js';
import { API_MODULES, MODULE_MANIFESTS } from '../src/phan-he/index.js';
import { ADDIN_MANIFESTS, BUILTIN_ADDINS } from '../src/addins/index.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Manifest phân hệ / add-in', () => {
  it('9 phân hệ + 3 add-in đều có manifest, key / label / kind / version khớp mã', () => {
    expect([...MODULE_MANIFESTS.keys()].sort()).toEqual(API_MODULES.map((m) => m.key).sort());
    for (const m of API_MODULES) expect(MODULE_MANIFESTS.get(m.key)).toMatchObject({ key: m.key, label: m.label, kind: 'module', id: `bizcity.${m.key}` });
    expect([...ADDIN_MANIFESTS.keys()].sort()).toEqual(BUILTIN_ADDINS.map((a) => a.manifest.id).sort());
    for (const a of BUILTIN_ADDINS) expect(ADDIN_MANIFESTS.get(a.manifest.id)).toMatchObject({ key: a.manifest.id, label: a.manifest.name, version: a.manifest.version, kind: 'addin' });
  });

  it('manifest lệch khai báo trong mã thì dừng khởi động (không chạy với khai báo sai)', () => {
    const url = new URL('../src/phan-he/quy/bizcity.module.json', import.meta.url);
    expect(() => loadModuleManifest(url, { key: 'quy', kind: 'module', label: 'Quỹ' })).not.toThrow();
    expect(() => loadModuleManifest(url, { key: 'quy', kind: 'module', label: 'Quỹ tiền' })).toThrow(/label "Quỹ" ≠ "Quỹ tiền"/);
    expect(() => loadModuleManifest(url, { key: 'quy', kind: 'addin' })).toThrow(/kind "module" ≠ "addin"/);
    expect(() => loadModuleManifest(new URL('../src/phan-he/khong-co/bizcity.module.json', import.meta.url), { key: 'khong-co', kind: 'module' })).toThrow(/Không đọc được manifest/);
  });

  it('manifest nói thật về action: action khai đều đã đăng ký; action đăng ký của phân hệ đều được khai', () => {
    const registered = new Set(listActions().map((a) => a.id));
    for (const [key, m] of MODULE_MANIFESTS) {
      for (const id of m.actions ?? []) expect(registered.has(id), `${key} khai ${id} nhưng chưa đăng ký`).toBe(true);
      // Action mang tiền tố <key>. phải nằm trong manifest của phân hệ đó (STD-MOD-2: chỉ làm những gì đã khai).
      for (const id of registered) if (id.startsWith(`${key}.`)) expect(m.actions ?? [], `${id} chưa khai trong manifest ${key}`).toContain(id);
    }
  });

  it('GET /system/modules giữ mảng mã; ?detail=true trả manifest tóm tắt của phân hệ + add-in đang bật', async () => {
    const plain = await call(ctx, 'GET', '/api/v1/system/modules');
    expect(plain.status).toBe(200);
    expect(plain.body.data).toEqual(expect.arrayContaining(['ke-toan', 'mua-hang', 'he-thong']));
    expect(typeof plain.body.data[0]).toBe('string');

    const detail = await call(ctx, 'GET', '/api/v1/system/modules?detail=true');
    expect(detail.status).toBe(200);
    const rows = detail.body.data as { key: string; kind: string; version: string; requires: { capabilities: string[] }; submits: string[]; waivers?: unknown; owners?: unknown }[];
    const muaHang = rows.find((r) => r.key === 'mua-hang')!;
    expect(muaHang).toMatchObject({ kind: 'module', version: '0.1.0', submits: ['purchase', 'purchase_return', 'stock_adjustment'] });
    expect(muaHang.requires.capabilities).toContain('ledger.submit');
    expect(rows.filter((r) => r.kind === 'addin').map((r) => r.key).sort()).toEqual(ctx.app.addins.map((a) => a.manifest.id).sort());
    // Thông tin quản trị mã nguồn không ra API
    for (const r of rows) { expect(r.waivers).toBeUndefined(); expect(r.owners).toBeUndefined(); }
  });
});
