/**
 * NT-BH-026 — Voucher 3 loại (module voucher; module pos, phieu-ban): đợt phát hãng nạp mã gắn SĐT, dùng một lần (phần dư mất) ở máy bán
 * thành dòng thanh toán theo hình thức kế toán khai; mã không thuộc khách / đã dùng bị từ chối; voucher TGS = chiết khấu (doanh thu + thuế
 * giảm); voucher lần mua sau tự phát khi mua đủ, giỏ không có sản phẩm áp dụng thì không trừ; trả cả đơn gốc thu hồi mã chưa dùng; hai máy
 * cùng mã → một đơn nhận; BH10 dùng được; báo cáo.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-026 (đóng góp)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { dispatchOnce } from '@bizcity/platform/core/events';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { khaiGia, nhapTon } from './pos-nhap-ton.js';

const MOD = (k: string) => fileURLToPath(new URL(`../../../modules/${k}/`, import.meta.url));
const HAS = ['pos', 'phieu-ban', 'voucher'].every((k) => existsSync(path.join(MOD(k), 'bizcity.module.json')));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const P = '/api/v1/m/pos';
const V = '/api/v1/m/voucher';
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const A = '0901111111';
const B = '0902222222';
let seq = 0;
const uuid = () => `0193a1b2-0000-7000-8000-${String(26_000_000 + ++seq).padStart(12, '0')}`;

describe.skipIf(!HAS)('NT-BH-026 — voucher 3 loại', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId: string | number;
  let k = 0;
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-026-${++k}-${Date.now()}` }) },
  });
  const deliver = () => dispatchOnce({ consumers: ['voucher.pos-order', 'voucher.pos-return', 'voucher.phieu-ban-doc'], limit: 200 });
  const lookup = async (code: string) => (await req('GET', `${V}/codes/${code}`)).json().data;
  /** Đơn máy bán của khách theo SĐT; `lines`: [mã, SL, giá]; tiền mặt đưa đúng phần còn phải trả. */
  const order = (lines: [string, number, number][], o: { phone?: string; vouchers?: string[]; total?: number; cash?: number } = {}) => {
    const sum = lines.reduce((t, [, q, p]) => t + q * p, 0);
    const total = o.total ?? sum;
    return {
      id: uuid(), branchCode: 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { phone: o.phone ?? A, name: 'Khách' },
      lines: lines.map(([sku, unitQty, clientUnitPrice], i) => ({ lineId: `l${i + 1}`, sku, unitName: 'Hộp', unitQty, clientUnitPrice })),
      promotionSelections: [], payment: { mode: 'cash', cashGiven: o.cash ?? total }, clientTotal: total, coreVersion: '0.1.0', promotionsVersion: '',
      ...(o.vouchers ? { vouchers: o.vouchers } : {}),
    };
  };
  const byAccount = async (docKey: string) => {
    const rows = (await sql<{ account: string; d: string; c: string }>`
      SELECT l.account_code AS account, SUM(l.debit) AS d, SUM(l.credit) AS c
        FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id JOIN ledger_lines l ON l.entry_id = e.id
       WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${docKey} AND e.status = 'posted' AND NOT e.is_reversal
       GROUP BY l.account_code ORDER BY l.account_code`.execute(db)).rows;
    return rows.map((r) => ({ account: r.account, d: Number(r.d), c: Number(r.c) }));
  };
  /** Doanh thu thuần (511 có − 521 nợ) và thuế đầu ra (3331) của một chứng từ. */
  const revenueTax = async (docKey: string) => {
    const rows = await byAccount(docKey);
    const rev = rows.filter((r) => r.account.startsWith('511')).reduce((t, r) => t + r.c - r.d, 0) - rows.filter((r) => r.account.startsWith('521')).reduce((t, r) => t + r.d - r.c, 0);
    const tax = rows.filter((r) => r.account.startsWith('3331')).reduce((t, r) => t + r.c - r.d, 0);
    return { rev, tax };
  };
  const campaign = async (body: Record<string, unknown>) => {
    const r = await req('POST', `${V}/campaigns`, { validFrom: TODAY, ...body });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { id: string };
  };

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(MOD('pos'), 'migrations'), { reads: READS });
    await runModuleMigrations('phieu-ban', path.join(MOD('phieu-ban'), 'migrations'), { reads: READS });
    await runModuleMigrations('voucher', path.join(MOD('voucher'), 'migrations'), { reads: ['bizcity_read.partners', 'bizcity_read.products', 'bizcity_read.payment_methods'] });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-026', trx as never); });
    app = await buildApp();
    const products = [['SUA30', 'Sữa hộp 30K'], ['SP100', 'Sữa 100K'], ['BIOMIL', 'Biomil Plus 1']];
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: products.map(([sku, name]) => ({ sku, name, unit: 'Hộp' })) })).status).toBeLessThan(300);
    for (const [sku] of products) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: 'R08' })).status).toBe(200);
    await sql`UPDATE products SET brand_code = 'BIO' WHERE tenant_id = ${tenantId} AND sku = 'BIOMIL'`.execute(db);
    expect((await call(ctx, 'PUT', '/api/v1/partners/NCC-ABBOTT', { name: 'Abbott (hãng)', kind: 'supplier' })).status).toBeLessThan(300);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH-A', name: 'Khách A (đại lý)', phone: A })).status).toBeLessThan(300);
    // Kế toán khai hình thức thanh toán cho voucher Abbott: phải thu hãng (tài khoản ở danh mục, không ở module).
    const pm = await call(ctx, 'PUT', '/api/v1/posting/payment-methods/VC-ABBOTT', { name: 'Voucher Abbott', accountCode: '13881', partnerCode: 'NCC-ABBOTT' });
    expect(pm.status, JSON.stringify(pm.body)).toBeLessThan(300);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
    await nhapTon(ctx, 'CN01', [['SUA30', 500, 'Hộp'], ['SP100', 500, 'Hộp'], ['BIOMIL', 500, 'Hộp']]);
    await khaiGia(tenantId, [['SUA30', 'Hộp', 30_000], ['SP100', 'Hộp', 100_000], ['BIOMIL', 'Hộp', 300_000]]);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  let abbott = '';
  it('§3 dòng 1: đợt "Abbott 50K" (hãng), nạp 100 mã gắn SĐT → mã còn hạn, gắn khách', async () => {
    const c = await campaign({ code: 'ABBOTT50K', name: 'Abbott 50K', kind: 'cash', issuer: 'brand', issuerPartnerCode: 'NCC-ABBOTT', paymentMethodCode: 'VC-ABBOTT', faceValue: 50_000, validDays: 30 });
    abbott = c.id;
    const items = Array.from({ length: 100 }, (_, i) => ({ code: `ABB-${String(i + 1).padStart(3, '0')}`, phone: i < 3 ? A : `09${String(10_000_000 + i).padStart(8, '0')}` }));
    const r = await req('POST', `${V}/campaigns/${c.id}/import`, { items: [...items, { code: 'ABB-001', phone: A }, { code: 'ABB-X', phone: '123' }] });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data.created).toHaveLength(100);
    expect(r.json().data.skipped.map((s: { reason: string }) => s.reason)).toEqual(['Mã lặp trong danh sách', 'SĐT phải có 10 số, bắt đầu bằng 0']);
    const one = await lookup('abb-001');
    expect(one).toMatchObject({ code: 'ABB-001', phone: A, state: 'active', campaign: { code: 'ABBOTT50K', issuer: 'brand', faceValue: 50_000 } });
    expect(one.expiresOn >= TODAY).toBe(true);
    // Máy bán: danh sách voucher còn hạn của khách A.
    const av = await req('GET', `${V}/customer?phone=${A}&skus=SUA30&total=30000`);
    expect(av.json().data.map((x: { code: string; usable: boolean }) => [x.code, x.usable])).toEqual(expect.arrayContaining([['ABB-001', true], ['ABB-002', true], ['ABB-003', true]]));
  });

  let abbOrderCode = '';
  it('§3 dòng 2: khách A dùng mã 50K cho đơn 30K → trừ 30K (thanh toán bằng voucher hãng), phần dư mất; mã "Đã dùng" ở đơn đó', async () => {
    const o = order([['SUA30', 1, 30_000]], { vouchers: ['ABB-001'], cash: 0 });
    const r = await req('POST', `${P}/orders`, o);
    expect(r.statusCode, r.body).toBe(201);
    const snap = r.json().data.order;
    abbOrderCode = snap.code;
    expect(snap.total).toBe(30_000);
    expect(snap.voucherUses).toEqual([expect.objectContaining({ code: 'ABB-001', issuer: 'brand', kind: 'payment', amount: 30_000, faceValue: 50_000, methodCode: 'VC-ABBOTT' })]);
    // Sổ: doanh thu đủ (30.000 gồm thuế), phải thu hãng 30.000 theo tài khoản của hình thức.
    const docKey = `pos:CN01:sale:${o.id}`;
    expect(await revenueTax(docKey)).toEqual({ rev: 27_778, tax: 2_222 });
    expect((await byAccount(docKey)).find((x) => x.account === '13881')).toMatchObject({ d: 30_000 });
    await deliver();
    expect(await lookup('ABB-001')).toMatchObject({ state: 'used', usedSource: 'pos', usedRefCode: abbOrderCode, usedBranch: 'CN01', usedOn: TODAY, usedAmount: 30_000 });
  });

  it('§3 dòng 3: khách B đưa mã của khách A → từ chối: mã không thuộc khách', async () => {
    const r = await req('POST', `${P}/orders`, order([['SUA30', 1, 30_000]], { phone: B, vouchers: ['ABB-002'], cash: 0 }));
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.details).toMatchObject({ reason: 'VOUCHER_NOT_OWNER', items: [{ code: 'ABB-002', reason: 'VOUCHER_NOT_OWNER' }] });
  });

  it('§3 dòng 4: dùng lại mã đã dùng → từ chối, nêu đơn đã dùng', async () => {
    const r = await req('POST', `${P}/orders`, order([['SUA30', 1, 30_000]], { vouchers: ['ABB-001'], cash: 0 }));
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.details.reason).toBe('VOUCHER_USED');
    expect(r.json().error.message).toContain(abbOrderCode);
    // Không chọn khách → không dùng voucher được.
    const anon = await req('POST', `${P}/orders`, { ...order([['SUA30', 1, 30_000]], { vouchers: ['ABB-002'], cash: 0 }), customer: { retail: true } });
    expect(anon.json().error.details.reason).toBe('VOUCHER_NEED_CUSTOMER');
  });

  it('§3 dòng 5: đợt TGS 20K → trừ là chiết khấu: doanh thu + thuế giảm; hai voucher một đơn, tổng trừ ≤ số phải trả', async () => {
    const c = await campaign({ code: 'TGS20K', name: 'TGS 20K', kind: 'cash', issuer: 'tgs', faceValue: 20_000, minOrder: 50_000 });
    const g = await req('POST', `${V}/campaigns/${c.id}/generate`, { phones: [A], perPhone: 4 });
    expect(g.statusCode, g.body).toBe(200);
    const codes = (g.json().data.created as { code: string }[]).map((x) => x.code);
    expect(codes).toHaveLength(4);
    const o = order([['SP100', 1, 100_000]], { vouchers: [codes[0]!], total: 80_000 });
    const r = await req('POST', `${P}/orders`, o);
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data.order).toMatchObject({ total: 80_000, voucherUses: [{ code: codes[0], issuer: 'tgs', kind: 'discount', amount: 20_000 }] });
    expect(r.json().data.order.lines[0].voucherDiscount).toBe(20_000);
    // Không voucher: 92.593 + 7.407; có voucher TGS 20K: 74.074 + 5.926.
    expect(await revenueTax(`pos:CN01:sale:${o.id}`)).toEqual({ rev: 74_074, tax: 5_926 });
    // Đơn tối thiểu 50K: đơn 30K → từ chối.
    const low = await req('POST', `${P}/orders`, order([['SUA30', 1, 30_000]], { vouchers: [codes[1]!], total: 10_000 }));
    expect(low.json().error.details.reason).toBe('VOUCHER_MIN_ORDER');
    // Hai voucher (TGS 20K + hãng 50K) cho đơn 60K: TGS trừ 20K (chiết khấu), hãng trừ 40K còn lại (phần dư 10K mất).
    const two = await req('POST', `${P}/orders`, order([['SUA30', 2, 30_000]], { vouchers: [codes[1]!, 'ABB-002'], total: 40_000, cash: 0 }));
    expect(two.statusCode, two.body).toBe(201);
    expect(two.json().data.order.voucherUses.map((u: { code: string; amount: number }) => [u.code, u.amount])).toEqual([[codes[1], 20_000], ['ABB-002', 40_000]]);
    await deliver();
  });

  let bioCode = '';
  it('§3 dòng 6: mua 2 lon Biomil (đủ điều kiện "lần mua sau") → bill in mã voucher 30K lần mua sau Biomil; lần sau giỏ không có Biomil → không trừ', async () => {
    await campaign({
      code: 'BIOMIL30K', name: 'Lần mua sau Biomil 30K', kind: 'next_purchase', issuer: 'tgs', faceValue: 30_000, validDays: 30, skus: ['BIOMIL'],
      issueMode: 'auto', autoRule: { skus: ['BIOMIL'], brandCodes: [], minQty: 2, branches: [] },
    });
    const one = await req('POST', `${P}/orders`, order([['BIOMIL', 1, 300_000]]));
    expect(one.json().data.order.issuedVouchers).toBeUndefined();
    const r = await req('POST', `${P}/orders`, order([['BIOMIL', 2, 300_000]]));
    expect(r.statusCode, r.body).toBe(201);
    const issued = r.json().data.order.issuedVouchers as { code: string; faceValue: number; campaignName: string; phone: string; skus: string[]; expiresOn: string }[];
    expect(issued).toEqual([expect.objectContaining({ faceValue: 30_000, campaignName: 'Lần mua sau Biomil 30K', phone: A, skus: ['BIOMIL'] })]);
    bioCode = issued[0]!.code;
    await deliver();
    expect(await lookup(bioCode)).toMatchObject({ state: 'active', phone: A, source: 'auto', issuedOrderCode: r.json().data.order.code });
    const no = await req('POST', `${P}/orders`, order([['SP100', 1, 100_000]], { vouchers: [bioCode], total: 70_000 }));
    expect(no.statusCode, no.body).toBe(400);
    expect(no.json().error.details.reason).toBe('VOUCHER_NOT_APPLICABLE');
    // Giỏ có Biomil (cùng hàng khác) → chỉ trừ ở dòng Biomil.
    const yes = await req('POST', `${P}/orders`, order([['BIOMIL', 1, 300_000], ['SP100', 1, 100_000]], { vouchers: [bioCode], total: 370_000 }));
    expect(yes.statusCode, yes.body).toBe(201);
    expect(yes.json().data.order.lines.map((l: { sku: string; voucherDiscount?: number }) => [l.sku, l.voucherDiscount ?? 0])).toEqual([['BIOMIL', 30_000], ['SP100', 0]]);
    await deliver();
  });

  it('§3 dòng 7: trả hàng đơn đã phát voucher chưa dùng → thu hồi voucher', async () => {
    const r = await req('POST', `${P}/orders`, order([['BIOMIL', 2, 300_000]]));
    expect(r.statusCode, r.body).toBe(201);
    const code = r.json().data.order.issuedVouchers[0].code as string;
    await deliver();
    expect((await lookup(code)).state).toBe('active');
    const ret = await req('POST', `${P}/returns`, { id: uuid(), orderId: r.json().data.order.id, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 2 }], refundMethod: 'TM', reason: 'Khách trả cả đơn' });
    expect(ret.statusCode, ret.body).toBe(201);
    await deliver();
    const after = await lookup(code);
    expect(after).toMatchObject({ state: 'revoked' });
    expect(after.revokeReason).toContain(r.json().data.order.code);
    const use = await req('POST', `${P}/orders`, order([['BIOMIL', 1, 300_000]], { vouchers: [code], total: 270_000 }));
    expect(use.json().error.details.reason).toBe('VOUCHER_REVOKED');
  });

  it('lệch chuẩn: hai máy cùng lúc dùng một mã → một đơn nhận, đơn kia VOUCHER_USED (chưa cần module voucher nhận sự kiện)', async () => {
    const [a, b] = await Promise.all([
      req('POST', `${P}/orders`, order([['SUA30', 1, 30_000]], { vouchers: ['ABB-003'], cash: 0 })),
      req('POST', `${P}/orders`, order([['SUA30', 1, 30_000]], { vouchers: ['ABB-003'], cash: 0 })),
    ]);
    expect([a.statusCode, b.statusCode].sort(), `${a.body} ${b.body}`).toEqual([201, 400]);
    expect((a.statusCode === 400 ? a : b).json().error.details.reason).toBe('VOUCHER_USED');
    await deliver();
    expect((await lookup('ABB-003')).state).toBe('used');
  });

  it('BH10: phiếu bán dùng voucher TGS của khách → chiết khấu trên phiếu, mã đã dùng ở phiếu; bỏ duyệt → mã về còn', async () => {
    const c = await campaign({ code: 'TGS20K-BH10', name: 'TGS 20K BH10', kind: 'cash', issuer: 'tgs', faceValue: 20_000 });
    const code = (await req('POST', `${V}/campaigns/${c.id}/generate`, { phones: [A] })).json().data.created[0].code as string;
    const doc = await req('POST', '/api/v1/m/phieu-ban/docs', {
      docType: 'sale', docDate: TODAY, branchCode: 'CN01', partner: { code: 'KH-A' }, payments: [], vouchers: [code],
      lines: [{ lineKey: 'L1', sku: 'SP100', qty: 1, unitPrice: 92_593 }],
    });
    expect(doc.statusCode, doc.body).toBe(200);
    const id = doc.json().data.id as string;
    const ok = await req('POST', `/api/v1/m/phieu-ban/docs/${id}/approve`, {});
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().data).toMatchObject({ totals: { beforeTax: 74_074, tax: 5_926, total: 80_000 }, vouchers: [{ code, kind: 'discount', amount: 20_000 }] });
    expect(await revenueTax(`phieu-ban:${id}`)).toEqual({ rev: 74_074, tax: 5_926 });
    await deliver();
    expect(await lookup(code)).toMatchObject({ state: 'used', usedSource: 'phieu-ban', usedRefCode: ok.json().data.docNo });
    // Mã đã dùng ở BH10 → máy bán từ chối.
    const pos = await req('POST', `${P}/orders`, order([['SP100', 1, 100_000]], { vouchers: [code], total: 80_000 }));
    expect(pos.json().error.details.reason).toBe('VOUCHER_USED');
    const un = await req('POST', `/api/v1/m/phieu-ban/docs/${id}/unapprove`, { reason: 'Thử bỏ duyệt' });
    expect(un.statusCode, un.body).toBe(200);
    expect(un.json().data.totals.total).toBe(100_000);
    await deliver();
    expect((await lookup(code)).state).toBe('active');
  });

  it('báo cáo: phát hành / đã dùng / còn theo đợt, người phát; đã dùng theo cửa hàng', async () => {
    const r = await req('GET', `${V}/report?from=${TODAY}&to=${TODAY}`);
    expect(r.statusCode, r.body).toBe(200);
    const d = r.json().data as { campaigns: { code: string }[]; byBranch: { code: string }[] };
    expect(d.campaigns.find((x) => x.code === 'ABBOTT50K')).toMatchObject({ issuer: 'brand', issuerPartnerCode: 'NCC-ABBOTT', issued: 100, used: 3, active: 97, usedAmount: 100_000 });
    expect(d.byBranch.find((x) => x.code === 'ABBOTT50K')).toMatchObject({ branchCode: 'CN01', source: 'pos', used: 3, usedAmount: 100_000 });
    const brandOnly = (await req('GET', `${V}/report?issuer=brand`)).json().data.campaigns as { code: string }[];
    expect(brandOnly.map((x) => x.code)).toEqual(['ABBOTT50K']);
    void abbott;
  });
});
