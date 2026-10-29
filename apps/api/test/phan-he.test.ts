/**
 * Phân hệ phía máy chủ (src/phan-he/, ENABLED_MODULES): chỉ bật phân hệ cần chạy, lõi luôn bật, route trùng chỉ một lần.
 */
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { API_MODULES, enabledModules, routesFor } from '../src/phan-he/index.js';

describe('Phân hệ (ENABLED_MODULES)', () => {
  it('chỉ bật Mua hàng: không có route tài sản, vẫn có đăng nhập + danh mục + báo cáo', async () => {
    const before = env.ENABLED_MODULES;
    env.ENABLED_MODULES = 'mua-hang';
    const app = await buildApp();
    try {
      await app.ready();
      expect(app.hasRoute({ method: 'GET', url: '/api/v1/assets' })).toBe(false);
      expect(app.hasRoute({ method: 'POST', url: '/api/v1/auth/login' })).toBe(true);
      expect(app.hasRoute({ method: 'GET', url: '/api/v1/catalog/price-lists' })).toBe(true);
      expect(app.enabledModules).toEqual(['mua-hang', 'he-thong']);
    } finally {
      await app.close();
      env.ENABLED_MODULES = before;
    }
  });

  it('bật tất cả: mọi phân hệ, route không trùng; mã lạ thì báo lỗi', () => {
    expect(enabledModules('*').map((m) => m.key)).toEqual(API_MODULES.map((m) => m.key));
    const all = routesFor('*');
    expect(new Set(all).size).toBe(all.length);
    expect(() => enabledModules('mua-hang,khong-co')).toThrow(/khong-co/);
  });
});
