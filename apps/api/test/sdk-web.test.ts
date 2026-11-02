/**
 * PHASE-014 W2 — phần web của module SDK (@bizcity/module-sdk/web), không cần CSDL:
 *   T014-7  defineWebModule nhận trang chủ /app/<key> và đường dẫn dưới /app/<key>/; từ chối đường dẫn của Core / module khác
 *   T014-8  webModuleParts: mục Tổng quan theo manifest (ui, description), nhóm menu mod-<key>, route giữ nguyên
 */
import { describe, expect, it } from 'vitest';
import { defineWebModule, webModuleParts } from '@bizcity/module-sdk/web';

const Screen = () => null;

describe('Phần web của module SDK', () => {
  it('T014-7: /app/<key> và /app/<key>/… hợp lệ; đường dẫn khác bị từ chối', () => {
    expect(() => defineWebModule({ key: 'hop-dong', label: 'Hợp đồng', menu: [{ key: 'hd', label: 'Hợp đồng', path: '/app/hop-dong', permission: 'hop-dong:read' }],
      routes: [{ path: '/app/hop-dong/lich-thu', component: Screen, permission: 'hop-dong:read' }] })).not.toThrow();
    expect(() => defineWebModule({ key: 'hop-dong', label: 'Hợp đồng', routes: [{ path: '/he-thong/nguoi-dung', component: Screen }] })).toThrow(/phải nằm dưới \/app\/hop-dong\/ \(hoặc là trang chủ \/app\/hop-dong\)/);
    expect(() => defineWebModule({ key: 'hop-dong', label: 'Hợp đồng', routes: [{ path: '/app/hop-dong-khac/x', component: Screen }] })).toThrow();
  });

  it('T014-8: webModuleParts dựng mục Tổng quan, nhóm menu, route', () => {
    const def = defineWebModule({ key: 'ghi-chu', label: 'Ghi chú', menu: [{ key: 'ghi-chu', label: 'Ghi chú', path: '/app/ghi-chu/danh-sach', code: 'GC01' }],
      routes: [{ path: '/app/ghi-chu/danh-sach', component: Screen }] });
    const p = webModuleParts(def, { description: 'Ghi chú của đơn vị', icon: 'NotebookPen', color: '#0f766e', order: 45 });
    expect(p.meta).toEqual({ key: 'ghi-chu', label: 'Ghi chú', description: 'Ghi chú của đơn vị', icon: 'NotebookPen', color: '#0f766e', order: 45, groups: ['mod-ghi-chu'] });
    expect(p.group).toEqual({ key: 'mod-ghi-chu', label: 'Ghi chú', children: [{ key: 'ghi-chu', label: 'Ghi chú', path: '/app/ghi-chu/danh-sach', code: 'GC01' }] });
    expect(p.routes.map((r) => r.path)).toEqual(['/app/ghi-chu/danh-sach']);
    expect(webModuleParts(def).meta).toMatchObject({ icon: 'Puzzle', order: 60, description: '' });
  });
});
