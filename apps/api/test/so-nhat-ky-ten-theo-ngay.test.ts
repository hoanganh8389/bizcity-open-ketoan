// [2026-11-09 10:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-19 đợt 2b: T029-JNL-1..5 — sổ nhật ký hiện tên đối tượng LÚC GHI, khung nhìn bizcity_read thấy partner_name (chữ chốt: docs/phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/36-THUOC-TINH-CO-HIEU-LUC.md §2)
/**
 *   T029-JNL-1  khung nhìn bizcity_read.ledger_lines / ledger_entries có partner_name + partner_attr_id (cột cũ giữ nguyên thứ tự, quyền đọc còn)
 *   T029-JNL-2  nhật ký bán hàng: chứng từ ghi TRƯỚC ngày đổi tên và chứng từ NHẬP MUỘN (ngày chứng từ trước ngày đổi tên) mang tên CŨ; chứng từ ngày hôm nay mang tên MỚI
 *   T029-JNL-3  nhật ký thu tiền: cùng quy tắc (dòng tiền không gắn đối tượng → lấy tên lúc ghi của đầu bút toán)
 *   T029-JNL-3b dòng sổ không gắn đối tượng (doanh thu 511) lấy tên lúc ghi của đầu bút toán
 *   T029-JNL-4  nhật ký mua hàng: cùng quy tắc
 * Giới hạn: đường dự phòng COALESCE(…, tên hiện tại) cho dòng sổ ghi TRƯỚC khi có cột tên không kiểm được ở đây — sổ chỉ thêm nên không dựng được dòng
 * cũ mà không ghi sổ thật; đường đó chỉ là COALESCE trên NULL và được đọc bằng mắt khi duyệt mã.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let today = '';
const CUST = 'KH-NK';
const SUPP = 'NCC-NK';

const saleDoc = (docKey: string, docDate: string, partner: { code: string; name?: string }, amount: number) => ({
  docType: 'sale', docKey, branchCode: 'CN01', docNo: docKey, docDate, partner,
  lines: [{ lineKey: 'l1', sku: 'NKHANG', name: 'Hàng nhật ký', unit: 'Cái', qty: 1, amountBeforeTax: amount, taxCode: 'R08', taxAmount: Math.round(amount * 0.08) }],
  payments: [{ methodCode: 'TM', amount: amount + Math.round(amount * 0.08) }], totals: { beforeTax: amount, tax: Math.round(amount * 0.08), total: amount + Math.round(amount * 0.08) },
});
const purchaseDoc = (docKey: string, docDate: string, partner: { code: string; name?: string }, amount: number) => ({
  docType: 'purchase', docKey, branchCode: 'CN01', docNo: docKey, docDate, partner,
  lines: [{ lineKey: 'l1', sku: 'NKHANG', name: 'Hàng nhật ký', unit: 'Cái', qty: 1, amountBeforeTax: amount, taxCode: 'V08', taxAmount: 0 }],
  totals: { beforeTax: amount, tax: 0, total: amount },
});
const post = async (doc: unknown) => { const r = await call(ctx, 'POST', '/api/v1/documents', doc); expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted'); };

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  today = (await sql<{ d: string }>`SELECT CURRENT_DATE::text AS d`.execute(db)).rows[0]!.d;
  // trước khi đổi tên: chứng từ ngày 10/10 (bán + thu tiền) và 12/10 (mua)
  await post(saleDoc('NK-S1', '2026-10-10', { code: CUST, name: 'Khách NK Tên Cũ' }, 1000000));
  await post(purchaseDoc('NK-M1', '2026-10-12', { code: SUPP, name: 'NCC NK Tên Cũ' }, 500000));
  // đổi tên cả hai đối tượng qua cột (có hiệu lực từ HÔM NAY)
  await sql`UPDATE partners SET name = 'Khách NK Tên Mới' WHERE tenant_id = ${tenantId} AND code = ${CUST}`.execute(db);
  await sql`UPDATE partners SET name = 'NCC NK Tên Mới' WHERE tenant_id = ${tenantId} AND code = ${SUPP}`.execute(db);
  // NHẬP MUỘN: ghi sổ sau ngày đổi tên nhưng ngày chứng từ (20/10, 22/10) trước ngày đổi tên → phải mang tên CŨ
  await post(saleDoc('NK-S2', '2026-10-20', { code: CUST }, 2000000));
  await post(purchaseDoc('NK-M2', '2026-10-22', { code: SUPP }, 700000));
  // chứng từ ngày hôm nay → tên mới
  await post(saleDoc('NK-S3', today, { code: CUST }, 3000000));
});
afterAll(async () => {
  await ctx.app.close();
});

type Row = { docNo: string; partnerCode: string | null; partnerName: string | null };
const OCT = 'from=2026-10-01&to=2026-10-31';
const salesRows = async (range: string) => (await call(ctx, 'GET', `/api/v1/reports/sales-journal?${range}`)).body.data.branches.flatMap((b: { rows: Row[] }) => b.rows) as Row[];
const nameOf = (rows: Row[], docNo: string) => rows.find((r) => r.docNo === docNo)?.partnerName;

describe('T029-JNL — sổ nhật ký hiện tên đối tượng lúc ghi', () => {
  it('T029-JNL-1 khung nhìn bizcity_read thấy partner_name + partner_attr_id; cột cũ giữ nguyên thứ tự', async () => {
    const cols = async (v: string) => (await sql<{ column_name: string }>`SELECT column_name FROM information_schema.columns WHERE table_schema = 'bizcity_read' AND table_name = ${v} ORDER BY ordinal_position`.execute(db)).rows.map((r) => r.column_name);
    const lines = await cols('ledger_lines');
    const entries = await cols('ledger_entries');
    expect(lines.slice(-3)).toEqual(['product_name', 'partner_name', 'partner_attr_id']); // 0072 giữ nguyên, hai cột mới ở cuối
    expect(entries.slice(-3)).toEqual(['policy_version', 'partner_name', 'partner_attr_id']);
    expect(lines.slice(0, 5)).toEqual(['id', 'entry_id', 'tenant_id', 'branch_id', 'posting_date']);
    // đọc được qua khung nhìn với tên đúng bản
    const r = await sql<{ partner_name: string | null; version: number | null }>`
      SELECT e.partner_name, a.version FROM bizcity_read.ledger_entries e LEFT JOIN entity_attributes a ON a.id = e.partner_attr_id
       WHERE e.tenant_id = ${tenantId} AND e.doc_no = 'NK-S2' AND e.is_reversal = false LIMIT 1`.execute(db);
    expect(r.rows[0]).toMatchObject({ partner_name: 'Khách NK Tên Cũ', version: 1 });
  });

  it('T029-JNL-2 nhật ký bán hàng: nhập muộn mang tên cũ, hôm nay mang tên mới', async () => {
    const oct = await salesRows(OCT);
    expect(nameOf(oct, 'NK-S1')).toBe('Khách NK Tên Cũ');
    expect(nameOf(oct, 'NK-S2')).toBe('Khách NK Tên Cũ'); // NHẬP MUỘN: ghi sổ sau khi đổi tên mà vẫn tên cũ
    const now = await salesRows(`from=${today}&to=${today}`);
    expect(nameOf(now, 'NK-S3')).toBe('Khách NK Tên Mới');
    // mã đối tượng luôn là mã hiện hành, số tiền không đổi
    expect(oct.filter((r) => r.docNo.startsWith('NK-S')).every((r) => r.partnerCode === CUST)).toBe(true);
  });

  it('T029-JNL-3 nhật ký thu tiền: cùng quy tắc', async () => {
    const rows = (await call(ctx, 'GET', `/api/v1/reports/cash-journal?${OCT}&account=111&direction=in`)).body.data.rows as Row[];
    expect(nameOf(rows, 'NK-S1')).toBe('Khách NK Tên Cũ');
    expect(nameOf(rows, 'NK-S2')).toBe('Khách NK Tên Cũ');
    const now = (await call(ctx, 'GET', `/api/v1/reports/cash-journal?from=${today}&to=${today}&account=111&direction=in`)).body.data.rows as Row[];
    expect(nameOf(now, 'NK-S3')).toBe('Khách NK Tên Mới');
  });

  it('T029-JNL-3b dòng sổ KHÔNG gắn đối tượng (doanh thu 511) lấy tên lúc ghi của ĐẦU bút toán', async () => {
    // dòng doanh thu không có partner_id, đầu bút toán có: tên phải lấy ở partner_name của đầu bút toán, không phải tên hiện tại
    const rows = (await call(ctx, 'GET', `/api/v1/reports/cash-journal?${OCT}&account=511&direction=out`)).body.data.rows as Row[];
    expect(nameOf(rows, 'NK-S1')).toBe('Khách NK Tên Cũ');
    expect(nameOf(rows, 'NK-S2')).toBe('Khách NK Tên Cũ'); // NHẬP MUỘN
    const lineHasPartner = (await sql<{ n: number }>`SELECT count(*)::int AS n FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id WHERE e.tenant_id = ${tenantId} AND e.doc_no = 'NK-S2' AND l.account_code LIKE '511%' AND l.partner_id IS NOT NULL`.execute(db)).rows[0]!.n;
    expect(lineHasPartner).toBe(0); // đúng là đang đi đường "đầu bút toán"
  });

  it('T029-JNL-4 nhật ký mua hàng: cùng quy tắc', async () => {
    const rows = (await call(ctx, 'GET', `/api/v1/reports/purchase-journal?${OCT}`)).body.data.branches.flatMap((b: { rows: Row[] }) => b.rows) as Row[];
    expect(nameOf(rows, 'NK-M1')).toBe('NCC NK Tên Cũ');
    expect(nameOf(rows, 'NK-M2')).toBe('NCC NK Tên Cũ'); // NHẬP MUỘN
    expect(rows.filter((r) => r.docNo.startsWith('NK-M')).every((r) => r.partnerCode === SUPP)).toBe(true);
  });
});
