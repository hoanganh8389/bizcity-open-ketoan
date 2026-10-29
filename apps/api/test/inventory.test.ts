/**
 * Kho và mua hàng: nhập mua, trả nhà cung cấp, chuyển kho giữa chi nhánh, điều chỉnh kho.
 * Kiểm định khoản, sổ hoá đơn mua vào, hàng vào / ra kho (inventory_movements).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' });
  await call(ctx, 'POST', '/api/v1/branches', { code: 'KHO-MB', name: 'Kho miền Bắc', accountingUnitCode: 'DV-MB' });
});
afterAll(async () => {
  await ctx.app.close();
});

const post = (doc: unknown) => call(ctx, 'POST', '/api/v1/documents', doc);

async function docId(key: string) {
  const { body } = await call(ctx, 'GET', `/api/v1/documents?search=${encodeURIComponent(key)}`);
  return body.data.find((d: any) => d.docKey === key).id as string;
}

/** Dòng sổ còn hiệu lực của chứng từ: [chi nhánh, tài khoản, Nợ, Có]. */
async function ledger(key: string) {
  const id = await docId(key);
  const res = await sql<{ branch: string; account: string; debit: string; credit: string }>`
    SELECT br.code AS branch, l.account_code AS account, l.debit, l.credit
      FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id JOIN branches br ON br.id = e.branch_id
     WHERE e.event_id = ${id} AND e.status = 'posted' AND NOT e.is_reversal
     ORDER BY e.id, br.code, l.line_no`.execute(db);
  return res.rows.map((r) => ({ branch: r.branch, account: r.account, debit: Number(r.debit), credit: Number(r.credit) }));
}

async function movements(key: string) {
  const id = await docId(key);
  const rows = await db
    .selectFrom('inventory_movements as m')
    .innerJoin('branches as b', 'b.id', 'm.branch_id')
    .select(['b.code as branch', 'm.kind', 'm.sku', 'm.qty', 'm.amount'])
    .where('m.event_id', '=', id)
    .orderBy('m.id')
    .execute();
  return rows.map((r) => ({ branch: r.branch, kind: r.kind, sku: r.sku, qty: Number(r.qty), amount: r.amount === null ? null : Number(r.amount) }));
}

/** Số dư (Nợ − Có) một tài khoản theo chi nhánh (bỏ trống = toàn công ty). */
async function balance(account: string, branch?: string) {
  const res = await sql<{ v: string | null }>`
    SELECT SUM(l.debit - l.credit) AS v FROM ledger_lines l
      JOIN branches br ON br.id = l.branch_id
     WHERE l.tenant_id = ${tenantId} AND l.account_code = ${account}
       ${branch ? sql`AND br.code = ${branch}` : sql``}`.execute(db);
  return Number(res.rows[0]?.v ?? 0);
}

const purchase = (over: Record<string, unknown> = {}) => ({
  docType: 'purchase',
  docKey: 'kho:CN01:NM0001',
  branchCode: 'CN01',
  docNo: 'NM0001',
  docDate: '2026-10-03',
  partner: { code: 'NCC-VNM', name: 'Công ty Sữa ABC', taxCode: '0300588569' },
  invoice: { no: '0004567', serial: 'C26TAB', form: '1', date: '2026-10-03' },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 10, amountBeforeTax: 700000, taxCode: 'V08', taxAmount: 56000 }],
  totals: { beforeTax: 700000, tax: 56000, total: 756000 },
  ...over,
});

describe('Nhập mua hàng', () => {
  it('phiếu mua dùng mã thuế ĐẦU RA (R08) có tiền thuế: báo lỗi cấu hình, không ghi Nợ 33311', async () => {
    const r = await post(purchase({ docKey: 'kho:CN01:NM-R08', docNo: 'NM-R08', invoice: undefined,
      lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 1, amountBeforeTax: 200000, taxCode: 'R08', taxAmount: 16000 }],
      totals: { beforeTax: 200000, tax: 16000, total: 216000 } }));
    expect(r.body.data?.status ?? r.body.error?.code, JSON.stringify(r.body)).not.toBe('posted');
    expect(JSON.stringify(r.body)).toContain('thuế GTGT đầu ra');
    expect(await ledger('kho:CN01:NM-R08')).toEqual([]);
  });

  it('Nợ 1561, Nợ 1331 / Có 3312 theo nhà cung cấp', async () => {
    const res = await post(purchase());
    expect(res.body.data.status).toBe('posted');
    expect(res.body.data.entryIds).toHaveLength(1);
    const lines = await ledger('kho:CN01:NM0001');
    expect(lines).toEqual([
      { branch: 'CN01', account: '1561', debit: 700000, credit: 0 },
      { branch: 'CN01', account: '3312', debit: 0, credit: 700000 },
      { branch: 'CN01', account: '1331', debit: 56000, credit: 0 },
      { branch: 'CN01', account: '3312', debit: 0, credit: 56000 },
    ]);
  });

  it('hoá đơn đầu vào vào bảng kê mua vào, hàng vào kho theo giá nhập', async () => {
    const r = await call(ctx, 'GET', '/api/v1/reports/sales-invoices?from=2026-10-01&to=2026-10-31&direction=input');
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body.data)).toContain('0004567');
    expect(await movements('kho:CN01:NM0001')).toEqual([{ branch: 'CN01', kind: 'purchase', sku: 'SUA01', qty: 10, amount: 700000 }]);
  });

  it('trả tiền ngay: bút toán thanh toán nhà cung cấp riêng (số = mã phiếu chi), Nợ 3312 / Có 1111', async () => {
    await post(purchase({ docKey: 'kho:CN01:NM0002', docNo: 'NM0002', invoice: undefined, payments: [{ methodCode: 'TM', amount: 756000, reference: 'PC0002' }] }));
    const entries = await sql<{ doc_type: string; doc_no: string }>`SELECT doc_type, doc_no FROM ledger_entries WHERE event_id = ${await docId('kho:CN01:NM0002')} ORDER BY id`.execute(db);
    expect(entries.rows.map((e) => `${e.doc_type}:${e.doc_no}`)).toEqual(['purchase:NM0002', 'supplier_payment:PC0002']);
    const lines = await ledger('kho:CN01:NM0002');
    expect(lines).toEqual(expect.arrayContaining([
      { branch: 'CN01', account: '3312', debit: 756000, credit: 0 },
      { branch: 'CN01', account: '1111', debit: 0, credit: 756000 },
    ]));
  });
});

describe('Trả hàng nhà cung cấp', () => {
  it('Nợ 3312 / Có 1561, Có 1331; hàng ra kho', async () => {
    const res = await post({
      ...purchase({ docKey: 'kho:CN01:TN0001', docNo: 'TN0001', invoice: undefined }),
      docType: 'purchase_return',
      lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 2, amountBeforeTax: 140000, taxCode: 'V08', taxAmount: 11200 }],
      totals: { beforeTax: 140000, tax: 11200, total: 151200 },
    });
    expect(res.body.data.status).toBe('posted');
    expect(await ledger('kho:CN01:TN0001')).toEqual([
      { branch: 'CN01', account: '3312', debit: 140000, credit: 0 },
      { branch: 'CN01', account: '1561', debit: 0, credit: 140000 },
      { branch: 'CN01', account: '3312', debit: 11200, credit: 0 },
      { branch: 'CN01', account: '1331', debit: 0, credit: 11200 },
    ]);
    expect(await movements('kho:CN01:TN0001')).toEqual([{ branch: 'CN01', kind: 'purchase_return', sku: 'SUA01', qty: -2, amount: -140000 }]);
  });
});

const transfer = (over: Record<string, unknown> = {}) => ({
  docType: 'transfer',
  docKey: 'kho:CK0001',
  branchCode: 'CN01',
  toBranchCode: 'CN02',
  docNo: 'CK0001',
  docDate: '2026-10-06',
  status: 'shipped',
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 4, amount: 280000 }],
  totals: { total: 280000 },
  ...over,
});

describe('Chuyển kho', () => {
  it('đang chuyển: chỉ chi nhánh xuất ghi Nợ 1579 / Có 1561', async () => {
    const res = await post(transfer());
    expect(res.body.data.status).toBe('posted');
    const lines = await ledger('kho:CK0001');
    expect(lines).toEqual([
      { branch: 'CN01', account: '1579', debit: 280000, credit: 0 },
      { branch: 'CN01', account: '1561', debit: 0, credit: 280000 },
    ]);
    expect(await balance('1579')).toBe(280000); // hàng đang trên đường
    expect(await movements('kho:CK0001')).toEqual([{ branch: 'CN01', kind: 'transfer_out', sku: 'SUA01', qty: -4, amount: -280000 }]);
  });

  it('cửa hàng xác nhận nhận hàng (phiên bản 2): thêm bút toán ở nơi nhận, hàng đang chuyển về 0', async () => {
    const res = await post(transfer({ version: 2, status: 'received' }));
    expect(res.body.data.status).toBe('posted');
    expect(await ledger('kho:CK0001')).toEqual([
      { branch: 'CN01', account: '1579', debit: 280000, credit: 0 },
      { branch: 'CN01', account: '1561', debit: 0, credit: 280000 },
      { branch: 'CN02', account: '1561', debit: 280000, credit: 0 },
      { branch: 'CN02', account: '1579', debit: 0, credit: 280000 },
    ]);
    expect(await balance('1579')).toBe(0);
    expect(await balance('1561', 'CN02')).toBe(280000);
    expect(await movements('kho:CK0001')).toEqual([
      { branch: 'CN01', kind: 'transfer_out', sku: 'SUA01', qty: -4, amount: -280000 },
      { branch: 'CN02', kind: 'transfer_in', sku: 'SUA01', qty: 4, amount: 280000 },
    ]);
  });

  it('khác đơn vị hạch toán: dùng 13681 thay cho 1579, đối tượng là chi nhánh bên kia', async () => {
    await post(transfer({ docKey: 'kho:CK0002', docNo: 'CK0002', toBranchCode: 'KHO-MB', status: 'received' }));
    const lines = await ledger('kho:CK0002');
    expect(lines.map((l) => `${l.branch}:${l.account}`)).toEqual(['CN01:13681', 'CN01:1561', 'KHO-MB:1561', 'KHO-MB:13681']);
    const partners = await sql<{ code: string }>`
      SELECT DISTINCT p.code FROM ledger_lines l JOIN partners p ON p.id = l.partner_id
       WHERE l.entry_id IN (SELECT id FROM ledger_entries WHERE event_id = ${await docId('kho:CK0002')}) AND l.account_code = '13681'`.execute(db);
    expect(partners.rows.map((r) => r.code).sort()).toEqual(['CN-CN01', 'CN-KHO-MB']);
  });

  it('chưa có giá vốn (giá trị 0): không ghi dòng nào trên phiếu (giá trị vào phiếu giá vốn tháng), vẫn ghi hàng vào / ra kho', async () => {
    const res = await post(transfer({ docKey: 'kho:CK0003', docNo: 'CK0003', status: 'received', lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 1, amount: 0 }], totals: { total: 0 } }));
    expect(res.body.data.status).toBe('posted');
    expect(res.body.data.entryIds).toHaveLength(0);
    expect(await ledger('kho:CK0003')).toEqual([]);
    expect(await movements('kho:CK0003')).toEqual([
      { branch: 'CN01', kind: 'transfer_out', sku: 'SUA01', qty: -1, amount: null },
      { branch: 'CN02', kind: 'transfer_in', sku: 'SUA01', qty: 1, amount: null },
    ]);
  });
});

describe('Chuyển kho mỗi đầu một chứng từ (phiếu xuất nội bộ / phiếu nhận nội bộ của từng cửa hàng)', () => {
  const leg = (over: Record<string, unknown>) => ({
    docType: 'transfer', docNo: 'BNB-1', docDate: '2026-10-08', lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 2, amount: 150000 }], totals: { total: 150000 }, ...over,
  });
  it('xuất nội bộ (leg out): chỉ chi nhánh xuất ghi Nợ 1579 / Có 1561, đối tượng là nơi nhận; nhận nội bộ (leg in) ghi ở nơi nhận; 1579 hai đầu triệt tiêu', async () => {
    const before = await balance('1579');
    const out = await post(leg({ docKey: 'ms:1:transfer-out:9', branchCode: 'CN01', leg: 'out', toBranchCode: 'CN02' }));
    expect(out.body.data.status, JSON.stringify(out.body)).toBe('posted');
    expect(await ledger('ms:1:transfer-out:9')).toEqual([
      { branch: 'CN01', account: '1579', debit: 150000, credit: 0 },
      { branch: 'CN01', account: '1561', debit: 0, credit: 150000 },
    ]);
    expect(await movements('ms:1:transfer-out:9')).toEqual([{ branch: 'CN01', kind: 'transfer_out', sku: 'SUA01', qty: -2, amount: -150000 }]);
    const inn = await post(leg({ docKey: 'ms:2:transfer-in:4', docNo: 'MNB-1', branchCode: 'CN02', leg: 'in', fromBranchCode: 'CN01' }));
    expect(inn.body.data.status, JSON.stringify(inn.body)).toBe('posted');
    expect(await ledger('ms:2:transfer-in:4')).toEqual([
      { branch: 'CN02', account: '1561', debit: 150000, credit: 0 },
      { branch: 'CN02', account: '1579', debit: 0, credit: 150000 },
    ]);
    expect(await movements('ms:2:transfer-in:4')).toEqual([{ branch: 'CN02', kind: 'transfer_in', sku: 'SUA01', qty: 2, amount: 150000 }]);
    expect(await balance('1579')).toBe(before);
  });

  it('bảng kê chuyển kho (HH01) ghép hai phiếu một đầu cùng mã nhóm chuyển thành một dòng: xuất CN01 → nhận CN02', async () => {
    await post(leg({ docKey: 'ms:1:transfer-out:20', docNo: 'BNB-20', branchCode: 'CN01', leg: 'out', toBranchCode: 'CN02', extra: { transferGroup: 'G-20' } }));
    await post(leg({ docKey: 'ms:2:transfer-in:21', docNo: 'MNB-21', branchCode: 'CN02', leg: 'in', extra: { transferGroup: 'G-20' } }));
    const r = await call(ctx, 'GET', '/api/v1/reports/stock-transfers?from=2026-10-08&to=2026-10-08');
    const row = r.body.data.rows.find((x: { docNo: string }) => x.docNo === 'BNB-20 → MNB-21');
    expect(row, JSON.stringify(r.body.data.rows)).toMatchObject({ fromBranch: 'CN01', toBranch: 'CN02', outQty: 2, inQty: 2, status: 'received' });
  });

  it('nhận nội bộ không rõ nơi gửi (mã nơi gửi chưa có trong danh mục): vẫn ghi được, coi như cùng đơn vị hạch toán (1579)', async () => {
    const r = await post(leg({ docKey: 'ms:2:transfer-in:5', docNo: 'MNB-2', branchCode: 'CN02', leg: 'in', fromBranchCode: 'KHONG-CO', lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 1, amount: 0 }], totals: { total: 0 } }));
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
    expect(await movements('ms:2:transfer-in:5')).toEqual([{ branch: 'CN02', kind: 'transfer_in', sku: 'SUA01', qty: 1, amount: null }]);
  });

  it('chuyển kho cả cặp mà thiếu nơi nhận: báo lỗi', async () => {
    const r = await post(leg({ docKey: 'ms:1:transfer:x', branchCode: 'CN01' }));
    expect(r.status).toBe(400);
  });
});

describe('Điều chỉnh kho', () => {
  it('tăng / giảm theo từng dòng (mixed, số lượng có dấu): dòng + ghi Nợ 1561 / Có 3381, dòng − ghi Nợ 1381 / Có 1561; thẻ kho theo dấu', async () => {
    const r = await post({ docType: 'stock_adjustment', docKey: 'ms:1:adjust:7', branchCode: 'CN02', docNo: 'DC-7', docDate: '2026-10-07', direction: 'mixed',
      lines: [{ lineKey: 'a', sku: 'SUA01', qty: 2, amount: 140000 }, { lineKey: 'b', sku: 'SUA01', qty: -1, amount: 70000 }], totals: { total: 210000 } });
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
    expect(await ledger('ms:1:adjust:7')).toEqual([
      { branch: 'CN02', account: '1561', debit: 140000, credit: 0 },
      { branch: 'CN02', account: '3381', debit: 0, credit: 140000 },
      { branch: 'CN02', account: '1381', debit: 70000, credit: 0 },
      { branch: 'CN02', account: '1561', debit: 0, credit: 70000 },
    ]);
    expect(await movements('ms:1:adjust:7')).toEqual([
      { branch: 'CN02', kind: 'adjust_in', sku: 'SUA01', qty: 2, amount: 140000 },
      { branch: 'CN02', kind: 'adjust_out', sku: 'SUA01', qty: -1, amount: -70000 },
    ]);
  });

  const adj = (direction: string, key: string) => ({
    docType: 'stock_adjustment',
    docKey: key,
    branchCode: 'CN02',
    docNo: key,
    docDate: '2026-10-07',
    direction,
    lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 1, amount: 70000 }],
    totals: { total: 70000 },
  });

  it('kiểm kê thiếu: Nợ 1381 (đối tượng là chi nhánh) / Có 1561', async () => {
    await post(adj('decrease', 'KK-THIEU-1'));
    expect((await ledger('KK-THIEU-1'))).toEqual([
      { branch: 'CN02', account: '1381', debit: 70000, credit: 0 },
      { branch: 'CN02', account: '1561', debit: 0, credit: 70000 },
    ]);
    expect(await movements('KK-THIEU-1')).toEqual([{ branch: 'CN02', kind: 'adjust_out', sku: 'SUA01', qty: -1, amount: -70000 }]);
  });

  it('kiểm kê thừa: Nợ 1561 / Có 3381', async () => {
    await post(adj('increase', 'KK-THUA-1'));
    expect((await ledger('KK-THUA-1'))).toEqual([
      { branch: 'CN02', account: '1561', debit: 70000, credit: 0 },
      { branch: 'CN02', account: '3381', debit: 0, credit: 70000 },
    ]);
  });

  it('huỷ chứng từ: đảo bút toán và bỏ khỏi hàng vào / ra kho', async () => {
    const res = await call(ctx, 'POST', '/api/v1/documents/cancel', { docKey: 'KK-THUA-1', reason: 'nhập nhầm' });
    expect(res.status).toBe(200);
    expect(await ledger('KK-THUA-1')).toEqual([]);
    expect(await movements('KK-THUA-1')).toEqual([]);
  });
});

describe('Sổ luôn cân', () => {
  it('tổng Nợ = tổng Có trên mọi sổ của đơn vị', async () => {
    const r = await sql<{ d: string; c: string }>`SELECT SUM(debit) AS d, SUM(credit) AS c FROM ledger_lines WHERE tenant_id = ${tenantId}`.execute(db);
    expect(r.rows[0]!.d).toBe(r.rows[0]!.c);
  });
});
