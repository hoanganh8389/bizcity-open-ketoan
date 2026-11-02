/**
 * @bizcity/module-sdk/web (PHASES 3.18, ADR-0015 Q5): defineWebModule nhận khai báo đúng; bắt đường dẫn ngoài /app/<key>/,
 * slot ngoài danh sách đóng (STD-EXT-1), quyền sai khuôn, khoá sai khuôn.
 */
import { describe, expect, it } from 'vitest';
import { defineWebModule, WEB_SLOTS } from '@bizcity/module-sdk/web';

describe('defineWebModule', () => {
  it('nhận khai báo đúng (menu, màn, slot dưới /app/<key>/)', () => {
    const m = defineWebModule({
      key: 'hop-dong', label: 'Hợp đồng',
      menu: [{ key: 'hd', label: 'Hợp đồng', children: [{ key: 'hd-ds', label: 'Danh sách', path: '/app/hop-dong/danh-sach', code: 'HD01', permission: 'hop-dong:read' }] }],
      routes: [{ path: '/app/hop-dong/danh-sach', component: 'DanhSach' }],
      slots: [{ slot: 'partner.detail.tab', component: 'TabHopDong' }],
    });
    expect(Object.isFrozen(m)).toBe(true);
    expect(WEB_SLOTS).toContain('document.detail.panel');
  });

  it('bắt đường dẫn ngoài /app/<key>/, slot lạ, quyền sai khuôn, khoá sai khuôn', () => {
    expect(() => defineWebModule({ key: 'hop-dong', label: 'Hợp đồng', routes: [{ path: '/chung-tu', component: 'X' }] })).toThrow(/phải nằm dưới \/app\/hop-dong\//);
    expect(() => defineWebModule({ key: 'hop-dong', label: 'Hợp đồng', slots: [{ slot: 'ledger.edit' as never, component: 'X' }] })).toThrow(/slot "ledger.edit"/);
    expect(() => defineWebModule({ key: 'hop-dong', label: 'Hợp đồng', menu: [{ key: 'a', label: 'A', path: '/app/hop-dong/a', permission: 'Quan Tri' }] })).toThrow(/quyền "Quan Tri"/);
    expect(() => defineWebModule({ key: 'Hop_Dong', label: '' })).toThrow(/key "Hop_Dong" sai khuôn.*thiếu label/);
  });
});
