// [2026-11-14 05:30 PM kiennt] PHASE-028 — HT12 lưới theo màn hình đăng ký (đóng góp)
/** Lưới theo sổ đăng ký màn: thẻ theo phân hệ, mỗi màn một dòng, mức Cơ bản, vai trò Hạn chế. Dữ liệu giả. */
import { describe, expect, it } from 'vitest';
import { buildScreenGrid, keysOf, levelOf, levelWant, planRestriction, TAB_CHUNG, type ManHinhDef } from '../web/lib/man-hinh-grid';
import type { MatrixPermission, RoleDetail } from '../web/lib/matrix';

const p = (key: string, label: string, module = 'core'): MatrixPermission => ({ key, label, module, risk: 'low', resource: null, operation: null });
const perms = [
  p('catalog:read', 'Xem danh mục'), p('documents:write', 'Lập / sửa / huỷ chứng từ'),
  p('kho:kiem-ke-xem', 'Xem kiểm kê kho', 'kho'), p('kho:kiem-ke-lap', 'Thêm biên bản kiểm kê', 'kho'), p('kho:kiem-ke-sua', 'Sửa biên bản kiểm kê', 'kho'),
  p('kho:kiem-ke-ghi-nhan', 'Ghi nhận chênh lệch kiểm kê', 'kho'),
  p('he-thong:don-vi-tinh-them', 'Thêm đơn vị tính', 'he-thong'), p('he-thong:don-vi-tinh-xoa', 'Xoá đơn vị tính', 'he-thong'),
  p('quy:phieu-thu-xem', 'Xem phiếu thu', 'quy'),
];
const tt = (quyen: string, nhan: string, loai: 'xem' | 'ghi' | 'huy' | 'xuat' = 'ghi') => ({ quyen, nhan, loai });
const screens: ManHinhDef[] = [
  { key: 'kho.kiem-ke', ma: 'KHO02', nhom: 'Kho', nhan: 'Kiểm kê kho', duongDan: '/kho/kiem-ke', thaoTac: {
    xem: tt('kho:kiem-ke-xem', 'Xem', 'xem'), them: tt('kho:kiem-ke-lap', 'Thêm'), sua: tt('kho:kiem-ke-sua', 'Sửa'),
    ghiNhan: tt('kho:kiem-ke-ghi-nhan', 'Ghi nhận chênh lệch'), lo: tt('kho:khong-co-trong-so', 'Lạ'),
  } },
  { key: 'he-thong.don-vi-tinh', ma: 'DM15', nhom: 'Danh mục', nhan: 'Đơn vị tính', duongDan: '/danh-muc/don-vi-tinh', thaoTac: {
    them: tt('he-thong:don-vi-tinh-them', 'Thêm'), xoa: tt('he-thong:don-vi-tinh-xoa', 'Xoá', 'huy'),
  } },
];

describe('buildScreenGrid', () => {
  const g = buildScreenGrid(screens, perms);
  it('thẻ theo menu, mỗi màn một dòng; nút riêng ở cột Khác với tên nút', () => {
    expect(g.tabs.map((t) => t.key)).toEqual(['Kho', 'Danh mục', TAB_CHUNG]);
    const kk = g.groups.get('Kho')![0]!.rows[0]!;
    expect(kk.ma).toBe('KHO02');
    expect(Object.fromEntries(Object.entries(kk.cells).map(([c, ps]) => [c, ps.map((x) => x.key)]))).toEqual({
      xem: ['kho:kiem-ke-xem'], them: ['kho:kiem-ke-lap'], sua: ['kho:kiem-ke-sua'], khac: ['kho:kiem-ke-ghi-nhan'],
    });
    expect(kk.cells.khac![0]!.label).toBe('Ghi nhận chênh lệch');
    expect(g.groups.get('Danh mục')![0]!.rows[0]!.cells.xoa!.map((x) => x.key)).toEqual(['he-thong:don-vi-tinh-xoa']);
  });
  it('quyền không thuộc màn nào vào Quyền chung; mỗi quyền hiện đúng một lần', () => {
    const all = g.tabs.flatMap((t) => (g.groups.get(t.key) ?? []).flatMap((x) => x.rows.flatMap(keysOf)));
    expect(all.sort()).toEqual(perms.map((x) => x.key).sort());
    expect((g.groups.get(TAB_CHUNG) ?? []).flatMap((x) => x.rows.flatMap(keysOf))).toContain('quy:phieu-thu-xem');
  });
  it('tìm theo mã màn', () => {
    const s = buildScreenGrid(screens, perms, 'dm15');
    expect(s.groups.get('Kho')).toEqual([]);
    expect(s.groups.get('Danh mục')![0]!.rows).toHaveLength(1);
  });
});

describe('mức Cơ bản', () => {
  const row = buildScreenGrid(screens, perms).groups.get('Kho')![0]!.rows[0]!;
  const on = (ks: string[]) => (k: string) => ks.includes(k);
  it('đọc mức', () => {
    expect(levelOf(row, on([]))).toBe('khong');
    expect(levelOf(row, on(['kho:kiem-ke-xem']))).toBe('chi-xem');
    expect(levelOf(row, on(keysOf(row)))).toBe('day-du');
    expect(levelOf(row, on(['kho:kiem-ke-xem', 'kho:kiem-ke-lap']))).toBe('tuy-chinh');
  });
  it('vai trò Hạn chế: "Cấm ghi, giữ xem" = cấm mọi thứ trừ Xem', () => {
    const w = new Map(levelWant(row, 'chi-xem', true));
    expect(w.get('kho:kiem-ke-xem')).toBe(false);
    expect(w.get('kho:kiem-ke-lap')).toBe(true);
    expect(levelOf(row, (k) => w.get(k)!, true)).toBe('chi-xem');
  });
});

describe('planRestriction', () => {
  const rule = (id: string, permission: string) => ({ id, permission, effect: 'deny' as const, note: null, active: true });
  const detail: RoleDetail = { id: '1', code: 'r', label: 'R', kind: 'restriction', baseRole: null, isActive: true, version: 1,
    rules: [rule('a', 'kho:kiem-ke-xem'), rule('b', 'quy:*')] };
  it('tick → thêm Cấm, bỏ tick → gỡ Cấm đích danh; Cấm theo mẫu thì báo chặn', () => {
    const plan = planRestriction(detail, new Map([['kho:kiem-ke-lap', true], ['kho:kiem-ke-xem', false], ['quy:phieu-thu-xem', false]]));
    expect(plan.ops).toEqual([{ kind: 'remove', rule: detail.rules[0] }, { kind: 'deny', permission: 'kho:kiem-ke-lap' }]);
    expect(plan.blocked.map((b) => b.permission)).toEqual(['quy:phieu-thu-xem']);
  });
});

describe('Chỉ xem gồm Xuất', () => {
  it('Xem + Xuất = Chỉ xem', () => {
    const s: ManHinhDef[] = [{ key: 'q.pt', ma: 'X', nhom: 'Quỹ', nhan: 'Phiếu thu', duongDan: '/', thaoTac: {
      xem: tt('quy:phieu-thu-xem', 'Xem', 'xem'), them: tt('kho:kiem-ke-lap', 'Thêm'), xuat: tt('catalog:read', 'Xuất', 'xuat') } }];
    const r = buildScreenGrid(s, perms).groups.get('Quỹ')![0]!.rows[0]!;
    expect(levelOf(r, (k) => k !== 'kho:kiem-ke-lap')).toBe('chi-xem');
  });
});
