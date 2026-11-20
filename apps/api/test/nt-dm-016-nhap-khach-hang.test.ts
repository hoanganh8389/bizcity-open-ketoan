// [2026-11-20 kiennt] NT-DM-016 — nhập Excel khách hàng đủ cột của form; cột liên kết tra theo tên (đóng góp)
/**
 * NT-DM-016:
 *   - cột liên kết Nhóm / Người QL / Chi nhánh QL ghi TÊN → đúng mã; tên không có → dòng lỗi, không nhập;
 *   - các ô khác của form (ngày sinh, giới tính, loại KH, công ty, ngân hàng, giới hạn nợ…) ghi đủ;
 *   - khách hàng: Điện thoại ghi cả điện thoại / di động (như form); khách hàng mới thiếu Nhóm → lỗi.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let branchName = '';
type Res = { created: number; failed: number; rows: { row: number; code: string; action: string; errors: string[]; values: Record<string, string> }[] };
const imp = async (rows: Record<string, unknown>[], dryRun = true) => {
  const r = await call<{ data: Res }>(ctx, 'POST', '/api/v1/partners/import', { dryRun, rows });
  expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
  return r.body.data;
};

beforeAll(async () => {
  ctx = await setupTenant();
  expect((await call(ctx, 'PUT', '/api/v1/partner-groups/NKH16', { name: 'Khách lẻ thử 16', kind: 'customer' })).status).toBeLessThan(300);
  expect((await call(ctx, 'PUT', '/api/v1/dimensions/employee/NV16', { name: 'Trần Thị Quản Lý' })).status).toBeLessThan(300);
  branchName = ((await call(ctx, 'GET', '/api/v1/branches')).body.data as { code: string; name: string }[]).find((b) => b.code === 'CN01')!.name;
});
afterAll(async () => { await ctx.app.close(); });

describe('NT-DM-016 — nhập Excel khách hàng', () => {
  it('đủ cột, liên kết ghi tên → thêm mới đúng nhóm / người QL / chi nhánh; các ô khác ghi đủ', async () => {
    const o = await imp([{
      row: 2, code: 'KH16A', name: 'Nguyễn Văn Thử', kind: 'Khách hàng', groupCode: 'Khách lẻ thử 16', phone: '0912000016', email: 'thu16@vidu.vn',
      birthDate: '05/03/1990', gender: 'Nam', customerType: 'KH cá nhân', isProspect: 'Có', companyName: 'Công ty Thử 16', shortName: 'CT16', fax: '0241600016',
      website: 'thu16.vn', position: 'Giám đốc', bankAccountNo: '1600016', bankAccountHolder: 'NGUYEN VAN THU', bankName: 'Vietcombank', creditLimit: '5.000.000',
      paymentTermDays: '30', maxOpenDocs: '3', managerCode: 'Trần Thị Quản Lý', branchCode: branchName,
    }], false);
    expect(o.rows[0]!.errors).toEqual([]);
    expect(o.created).toBe(1);
    const p = ((await call(ctx, 'GET', '/api/v1/partners?search=KH16A&status=all')).body.data as Record<string, unknown>[]).find((x) => x.code === 'KH16A');
    expect(p).toMatchObject({
      groupCode: 'NKH16', phone: '0912000016', mobile: '0912000016', birthDate: '1990-03-05', gender: 'male', customerType: 'personal', isProspect: true,
      companyName: 'Công ty Thử 16', shortName: 'CT16', fax: '0241600016', website: 'thu16.vn', position: 'Giám đốc', bankAccountHolder: 'NGUYEN VAN THU',
      creditLimit: 5000000, paymentTermDays: 30, maxOpenDocs: 3, managerCode: 'NV16', branchCode: 'CN01',
    });
  });

  it('liên kết không khớp (người QL, chi nhánh, nhóm) → dòng lỗi, không nhập', async () => {
    const o = await imp([
      { row: 2, name: 'Khách B', groupCode: 'Khách lẻ thử 16', managerCode: 'Người Không Có' },
      { row: 3, name: 'Khách C', groupCode: 'Khách lẻ thử 16', branchCode: 'Chi nhánh không có' },
      { row: 4, name: 'Khách D', groupCode: 'Nhóm không có' },
      { row: 5, name: 'Khách E' },
    ]);
    expect(o.rows.map((r) => r.action)).toEqual(['error', 'error', 'error', 'error']);
    expect(o.rows[0]!.errors.join()).toContain('Người quản lý "Người Không Có" không có trong danh mục nhân viên');
    expect(o.rows[1]!.errors.join()).toContain('Chi nhánh quản lý "Chi nhánh không có" không có trong danh mục chi nhánh');
    expect(o.rows[2]!.errors.join()).toContain('Nhóm "Nhóm không có" không có trong danh mục nhóm đối tượng');
    expect(o.rows[3]!.errors.join()).toContain('phải có Nhóm khách hàng');
  });

  // Bảng theo dõi 20/11 dòng 47: nhập NCC mới cùng chi nhánh của nó trong một tệp (mã trống, cha ghi theo tên dòng trên).
  it('NCC cha + chi nhánh con cùng tệp, mã để trống → con nhận mã cha-001; kiểu theo màn (không cột Kiểu)', async () => {
    const rows = [
      { row: 2, name: 'Công ty CP Sữa Mẫu 16', taxCode: '0100000016' },
      { row: 3, name: 'CN Hà Nội Sữa Mẫu 16', parentCode: 'Công ty CP Sữa Mẫu 16' },
      { row: 4, name: 'CN lỗi', parentCode: 'Cha lỗi 16' },
      { row: 5, name: 'Cha lỗi 16', email: 'sai-email' },
      { row: 6, name: 'Con của cha lỗi', parentCode: 'Cha lỗi 16' },
    ];
    const kt = (await call<{ data: Res }>(ctx, 'POST', '/api/v1/partners/import', { dryRun: true, kind: 'supplier', rows })).body.data;
    expect(kt.rows.map((r) => r.action)).toEqual(['create', 'create', 'error', 'error', 'error']);
    expect(kt.rows[2]!.errors.join()).toContain('chưa có');
    expect(kt.rows[4]!.errors.join()).toContain('ở dòng 5 không hợp lệ');
    const o = (await call<{ data: Res }>(ctx, 'POST', '/api/v1/partners/import', { dryRun: false, kind: 'supplier', rows: rows.slice(0, 2) })).body.data;
    expect(o.rows.map((r) => r.errors)).toEqual([[], []]);
    const cha = o.rows[0]!.code; const con = o.rows[1]!.code;
    expect(con).toBe(`${cha}-001`);
    const ds = (await call(ctx, 'GET', '/api/v1/partners?status=all&search=S%E1%BB%AFa%20M%E1%BA%ABu%2016')).body.data as Record<string, unknown>[];
    expect(ds.find((x) => x.code === con)).toMatchObject({ parentCode: cha, kind: 'supplier' });
    expect(ds.find((x) => x.code === cha)).toMatchObject({ kind: 'supplier' });
  });
});
