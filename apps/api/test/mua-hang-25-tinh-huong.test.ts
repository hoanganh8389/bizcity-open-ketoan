/**
 * 25 TÌNH HUỐNG của tài liệu yêu cầu mua hàng (motanhanherp/mota1.text) — chạy trên SỔ THẬT: nạp dữ liệu mẫu (đúng số liệu
 * tài liệu: Trung Hậu, Hoàng Nhi, Thắng Bảo, Anlene) vào một đơn vị mới, rồi làm từng nghiệp vụ như kế toán thao tác và kiểm
 * con số + yêu cầu tối thiểu của từng tình huống. Tình huống phía bán (6, 7, 9, 10) kiểm ở phép thử công thức.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
type Doc = { id: string; docNo: string; kind: string; status: string; note?: string; totals: { beforeTax: number; tax: number; total: number }; dueDate?: string; links: { docNo: string; eventId: string; role: string }[]; checks?: { code: string; level: string }[]; lines: ({ sku: string; unit: string } & Record<string, unknown>)[] };
let docs: Doc[] = [];
const reload = async () => { docs = (await call(t, 'GET', '/api/v1/purchase/documents')).body.data; };
const byNote = (prefix: string) => { const d = docs.find((x) => x.note?.startsWith(prefix)); if (!d) throw new Error(`Thiếu phiếu mẫu "${prefix}"`); return d; };
const get = async (id: string) => (await call(t, 'GET', `/api/v1/purchase/documents/${id}`)).body.data as { doc: Doc; analysis: { calc: { payable: number; dueDate?: string; lines: { realUnitCost: number; lineType: string }[] }; checks: { code: string; level: string; text: string }[]; credit: { after: number; remaining: number; exceeded: number; warn: boolean; current: number }[]; prepayment: number } };
const approve = async (id: string) => { const r = await call(t, 'POST', `/api/v1/purchase/documents/${id}/approve`); expect(r.status, JSON.stringify(r.body)).toBe(200); await reload(); return r.body.data as Doc; };
const save = async (body: Record<string, unknown>) => { const r = await call(t, 'POST', '/api/v1/purchase/documents', body); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body.data as Doc; };
const debts = async (partner: string) => (await call(t, 'GET', `/api/v1/debt-items?partnerCode=${partner}&status=all`)).body.data as { docNo: string; side: string; amount: number; remaining: number; dueDate: string }[];
const ledgerText = async (eventId: string) => JSON.stringify((await call(t, 'GET', `/api/v1/documents/${eventId}`)).body.data.entries);
const codes = (cs?: { code: string }[]) => (cs ?? []).map((c) => c.code);

beforeAll(async () => {
  t = await setupTenant();
  const s = await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
  expect(s.status, JSON.stringify(s.body)).toBe(200);
  expect(s.body.data.errors).toEqual([]);
  await reload();
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('25 tình huống mua hàng trên sổ thật', () => {
  it('Kho chi nhánh mẫu — nạp mẫu tự thêm kho mặc định <mã>-HH; phiếu mẫu tính vào kho đó; bấm thêm kho lần nữa không trùng', async () => {
    const wh = (await call(t, 'GET', '/api/v1/warehouses?branchCodes=CN-NA,CN-ND,CN-PT,CN-HCM')).body.data as { code: string; branchCode: string; isDefault: boolean }[];
    expect(wh.map((w) => [w.branchCode, w.code, w.isDefault]).sort()).toEqual([['CN-HCM', 'CN-HCM-HH', true], ['CN-NA', 'CN-NA-HH', true], ['CN-ND', 'CN-ND-HH', true], ['CN-PT', 'CN-PT-HH', true]]);
    const again = await call(t, 'POST', '/api/v1/purchase/demo/warehouses', { password: 'Thuy!@#' });
    expect(again.status).toBe(200);
    expect(again.body.data.created).toEqual([]);
    expect((await call(t, 'POST', '/api/v1/purchase/demo/warehouses', { password: 'sai' })).status).toBe(403);
    // Tồn kho theo mặt hàng: mọi tồn mẫu ở CN-ND nằm ở kho CN-ND-HH (không còn "mặc định / chưa khai kho"); lọc đúng kho đó ra cùng số.
    const all = (await call(t, 'GET', '/api/v1/purchase/stock-on-hand?to=2026-10-31&branchCodes=CN-ND')).body.data.rows as { warehouseCode: string; qty: number }[];
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((r) => r.warehouseCode))).toEqual(new Set(['CN-ND-HH']));
    const one = (await call(t, 'GET', '/api/v1/purchase/stock-on-hand?to=2026-10-31&branchCodes=CN-ND&warehouseCodes=CN-ND-HH')).body.data.rows as { qty: number }[];
    expect(one.reduce((s, r) => s + r.qty, 0)).toBe(all.reduce((s, r) => s + r.qty, 0));
  });

  it('TH1 — CK thẳng 7%, hạn 10 ngày làm việc: công nợ 39.082.320 hạn 15/10, đã ghi 1561 / 1331 / 331', async () => {
    const d = byNote('TH1 —');
    expect(d).toMatchObject({ status: 'approved', totals: { total: 39082320 }, dueDate: '2026-10-15' });
    expect((await debts('NCC-TRUNGHAU')).find((x) => x.docNo === d.docNo)).toMatchObject({ side: 'credit', amount: 39082320, dueDate: '2026-10-15' });
    const led = await ledgerText(d.links[0]!.eventId);
    expect(led).toMatch(/1561/); expect(led).toMatch(/1331/); expect(led).toMatch(/331/);
  });

  it('TH2 — CK 2.000.000 trên tổng đơn: 48.860.000; quà 5 thùng không HĐ → chứng từ riêng, Có 711 theo giá trị hợp lý', async () => {
    expect(byNote('TH2 — CK').totals.total).toBe(48860000);
    const g = byNote('TH2 — quà');
    expect(g).toMatchObject({ kind: 'gift_in', status: 'approved' });
    const led = await ledgerText(g.links[0]!.eventId);
    expect(led).toMatch(/711/); expect(led).toMatch(/2400000/);
  });

  it('TH3 — hạn mức 600 triệu: nhập 117.450.000 còn 32.550.000 (được ghi, cảnh báo gần hết); đặt thêm 40 triệu vượt 7.450.000 → chặn duyệt', async () => {
    const a = (await get(byNote('TH3 — không').id)).analysis;
    expect(a.credit[0]).toMatchObject({ current: 450000000, after: 567450000, remaining: 32550000, warn: true });
    const b = byNote('TH3 — đặt thêm');
    expect((await get(b.id)).analysis.credit[0]).toMatchObject({ exceeded: 7450000 });
    const r = await call(t, 'POST', `/api/v1/purchase/documents/${b.id}/approve`);
    expect(r.status).toBe(409);
    expect(r.body.error.details.canOverride).toBe(true);
  });

  it('TH4 — CK 7% + CKTT 2%: công nợ 39.082.320; trả đúng hạn được CKTT 781.646 (Nợ 331 / Có 515); trả quá hạn bị từ chối', async () => {
    // Quy trình: đơn đặt TH4 (sau TH3 nợ đã 567,45 triệu → vượt hạn mức) chờ duyệt → phiếu nhập theo đơn chưa duyệt được;
    // duyệt ngoại lệ đơn (có lý do) rồi mới nhập kho.
    const ord = docs.find((x) => x.docNo === 'DH2610004')!;
    expect(ord).toMatchObject({ kind: 'order', status: 'pending_approval' });
    const blocked = await call(t, 'POST', `/api/v1/purchase/documents/${byNote('TH4 —').id}/approve`);
    expect(blocked.status).toBe(409); expect(JSON.stringify(blocked.body)).toMatch(/DH2610004 chưa duyệt/);
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${ord.id}/override`, { reason: 'Kế toán trưởng duyệt giãn hạn mức cho đơn TH4' })).status).toBe(200);
    const d = await approve(byNote('TH4 —').id);
    expect(d).toMatchObject({ totals: { total: 39082320 }, dueDate: '2026-10-20' });
    const late = await save({ kind: 'payment', docDate: '2026-10-21', branchCode: 'CN-NA', partnerCode: 'NCC-TRUNGHAU', amount: 38300674, ckttAmount: 781646, refIds: [d.id], lines: [] });
    const lr = await call(t, 'POST', `/api/v1/purchase/documents/${late.id}/approve`);
    expect(lr.status).toBe(409); expect(lr.body.error.message).toMatch(/quá hạn/);
    await call(t, 'POST', `/api/v1/purchase/documents/${late.id}/cancel`);
    const pay = await save({ kind: 'payment', docDate: '2026-10-19', branchCode: 'CN-NA', partnerCode: 'NCC-TRUNGHAU', amount: 38300674, ckttAmount: 781646, method: 'bank', refIds: [d.id], lines: [] });
    const p = await approve(pay.id);
    expect(p.links.map((l) => l.role)).toEqual(['Trả tiền', 'Chiết khấu thanh toán']);
    expect((await debts('NCC-TRUNGHAU')).find((x) => x.docNo === d.docNo)?.remaining).toBe(0);
    expect(await ledgerText(p.links[1]!.eventId)).toMatch(/515/);
  });

  it('TH5 — ứng trước 100% theo đơn DH005: nhận hàng + HĐ 3185 tự đối trừ, không ghi trả trùng; đối chiếu 3 bên khớp', async () => {
    const d = byNote('TH5 — nhận hàng');
    const a = (await get(d.id)).analysis;
    expect(a.prepayment).toBe(24460000);
    expect(codes(a.checks)).toContain('po_match');
    const ok = await approve(d.id);
    expect((await debts('NCC-TRUNGHAU')).find((x) => x.docNo === ok.docNo)).toMatchObject({ amount: 24460000, remaining: 0 });
  });

  it('TH8 — thưởng doanh số tháng 300 triệu → 3%: CK 9.000.000 + VAT 720.000 = giảm công nợ 9.720.000; hoá đơn gốc giữ nguyên; không tính trùng', async () => {
    const pv = (await call(t, 'POST', '/api/v1/purchase/rebates/preview', { policyCode: 'TH-THUONG-T', period: '2026-10', manualTotal: 300000000 })).body.data;
    expect(pv).toMatchObject({ base: 300000000, rate: 3, amount: 9000000 });
    expect(pv.allocation.reduce((s: number, x: { amount: number }) => s + x.amount, 0)).toBe(9000000);
    const rb = await save({ kind: 'rebate', docDate: '2026-10-23', branchCode: 'CN-NA', partnerCode: 'NCC-TRUNGHAU', amount: 9000000, taxCode: 'V08', invoice: { no: 'DC0001', date: '2026-10-23' }, rebate: { policyCode: 'TH-THUONG-T', period: '2026-10', base: pv.base, rate: pv.rate, detail: pv.detail }, allocation: pv.allocation, lines: [] });
    expect(rb.totals).toMatchObject({ beforeTax: 9000000, tax: 720000, total: 9720000 });
    expect(byNote('TH1 —').status).toBe('approved'); // hoá đơn gốc không đổi
    const ok = await approve(rb.id);
    expect((await debts('NCC-TRUNGHAU')).find((x) => x.docNo === ok.docNo)).toMatchObject({ side: 'debit', amount: 9720000 });
    expect((await call(t, 'POST', '/api/v1/purchase/documents', { kind: 'rebate', docDate: '2026-10-23', branchCode: 'CN-NA', partnerCode: 'NCC-TRUNGHAU', amount: 1, rebate: { policyCode: 'TH-THUONG-T', period: '2026-10', base: 1, rate: 1, detail: [] }, allocation: pv.allocation, lines: [] })).status).toBe(409);
  });

  it('TH11 — một hoá đơn 108.000.000 trả 3 đợt (30 / 40 / 38 triệu): trả đợt 1 thì đợt 2 quá hạn, đợt 3 chưa đến hạn', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-TH11', { name: 'NCC trả nhiều đợt', kind: 'supplier' });
    const r = await save({ kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-08', branchCode: 'CN-NA', partnerCode: 'NCC-TH11', priceIncludesVat: false, orderDiscount: {}, lines: [{ lineKey: 'a', sku: '110154028', name: 'Anlene Gold 5X hương vani 400g', unit: 'Lon', qty: 400, price: 250000, taxCode: 'V08', lineType: 'buy', lotNo: 'L11', expDate: '2028-01-01' }],
      schedule: [{ seq: 1, dueDate: '2026-10-10', amount: 30000000 }, { seq: 2, dueDate: '2026-10-25', amount: 40000000 }, { seq: 3, dueDate: '2026-11-10', amount: 38000000 }] });
    expect(r.totals.total).toBe(108000000);
    await approve(r.id);
    const p = await save({ kind: 'payment', docDate: '2026-10-10', branchCode: 'CN-NA', partnerCode: 'NCC-TH11', amount: 30000000, method: 'bank', refIds: [r.id], lines: [] });
    await approve(p.id);
    const due = (await call(t, 'GET', '/api/v1/purchase/due?partnerCode=NCC-TH11&asOf=2026-10-26')).body.data;
    const rows = due.rows.filter((x: { docNo: string }) => x.docNo === r.docNo);
    expect(rows.map((x: { seq: number; remaining: number; daysOverdue: number; bucket: number }) => [x.seq, x.remaining, x.daysOverdue, x.bucket])).toEqual([[2, 40000000, 1, 2], [3, 38000000, 0, 0]]);
  });

  it('TH12 — nợ cũ 480 triệu + 108 triệu = 588 triệu, còn 12 triệu: duyệt bình thường', async () => {
    const d = byNote('TH12');
    expect(d.status).toBe('approved');
    expect((await get(d.id)).analysis.credit[0]).toMatchObject({ current: 480000000, after: 588000000, remaining: 12000000 });
  });

  it('TH13 — nợ 550 triệu + 108 triệu = 658 triệu, vượt 58 triệu: chặn; chỉ tiếp tục khi trả bớt nợ hoặc duyệt ngoại lệ có lý do', async () => {
    const d = byNote('TH13');
    const a = (await get(d.id)).analysis;
    expect(a.credit[0]).toMatchObject({ current: 550000000, after: 658000000, exceeded: 58000000 });
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/approve`)).status).toBe(409);
    // NCC trả bớt 60 triệu trước ngày đơn → hết vượt
    const pay = await save({ kind: 'payment', docDate: '2026-10-10', branchCode: 'CN-ND', partnerCode: 'NCC-THANGBAO', amount: 60000000, method: 'bank', lines: [] });
    await approve(pay.id);
    expect((await get(d.id)).analysis.credit[0]?.exceeded).toBe(0);
    await call(t, 'POST', `/api/v1/purchase/documents/${pay.id}/unapprove`);
    const ov = await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/override`, { reason: 'Giám đốc duyệt giãn hạn mức tháng 10' });
    expect(ov.status, JSON.stringify(ov.body)).toBe(200);
    expect((await call(t, 'GET', '/api/v1/purchase/logs?event=override_approved')).body.data[0].data.reason).toMatch(/Giám đốc/);
  });

  it('TH14 + TH19 — KM người bán 120 chia giá, KM NTD 240 không chia; giá vốn đơn vị giảm; 2 lô A 15/11, B 30/11; cảnh báo cận date', async () => {
    const d = byNote('TH14');
    const a = (await get(d.id)).analysis;
    expect(a.calc.payable).toBe(9204234);
    expect(codes(a.checks)).not.toContain('gift_qty');
    expect(codes(a.checks)).toContain('near_expiry');
    const unit = a.calc.lines[0]!.realUnitCost;
    expect(unit).toBeLessThan(9204234 / 1.08 / 1200); // chia quà người bán vào giá
    await approve(d.id);
    const lots = (await call(t, 'GET', '/api/v1/purchase/lots?asOf=2026-10-23')).body.data.lots.filter((l: { sku: string; branchCode: string }) => l.sku === '140181006' && l.branchCode === 'CN-ND');
    expect(lots.map((l: { lotNo: string; expDate: string; level: string }) => [l.lotNo, l.expDate, l.level])).toEqual([['A', '2026-11-15', 'm30'], ['B', '2026-11-30', 'ok']]);
    const gifts = (await call(t, 'GET', '/api/v1/purchase/gifts')).body.data.rows;
    expect(gifts.find((g: { sku: string; program: string }) => g.sku === '140181006' && g.program === 'HN-KM-NTD')).toMatchObject({ inQty: 240 });
  });

  it('TH15 — chỉ tiêu Anlene tháng 500 triệu, đạt 550 triệu = 110% → thưởng 3% = 16.500.000; quý / năm tính độc lập', async () => {
    const pv = (await call(t, 'POST', '/api/v1/purchase/rebates/preview', { policyCode: 'ANL-CT-THANG', period: '2026-10', manualTotal: 550000000 })).body.data;
    expect(pv).toMatchObject({ rate: 3, amount: 16500000 });
    expect(pv.detail[0]).toMatch(/110%/);
    const ov = (await call(t, 'GET', '/api/v1/purchase/rebates/overview?month=2026-10')).body.data as { policy: string; period: string }[];
    expect(ov.filter((x) => x.policy.startsWith('ANL-CT')).map((x) => x.period).sort()).toEqual(['2026', '2026-10', '2026-Q4']);
  });

  it('TH16 — thưởng theo giai đoạn: mỗi giai đoạn tính trên doanh số của chính nó (từ phiếu đã duyệt theo ngày), không tính trùng', async () => {
    const pv = (await call(t, 'POST', '/api/v1/purchase/rebates/preview', { policyCode: 'ANL-GD-T10', period: '2026-10' })).body.data;
    const sum = (a: number, b: number) => Object.entries(pv.byDay as Record<string, number>).filter(([d]) => Number(d) >= a && Number(d) <= b).reduce((s, [, v]) => s + v, 0);
    const s1 = sum(1, 10), s2 = sum(11, 20), s3 = sum(21, 31);
    const expect1 = s1 >= 100e6 ? Math.round(s1 * 0.01) : 0, expect2 = s2 >= 150e6 ? Math.round(s2 * 0.02) : 0, expect3 = s3 >= 200e6 ? Math.round(s3 * 0.03) : 0;
    expect(pv.amount).toBe(expect1 + expect2 + expect3);
    expect(pv.detail).toHaveLength(3);
    expect((await call(t, 'POST', '/api/v1/purchase/rebates/preview', { policyCode: 'ANL-GD-T10', period: '2026-10', manualTotal: 1 })).status).toBe(400);
  });

  it('TH17 — hạn mức nhãn Anlene 2 tỷ: ND 500 · PT 600 · HCM 400 · chưa phân bổ 500; điều chuyển có vết, không vượt; chỉ tiêu cung ứng', async () => {
    const c = (await call(t, 'GET', '/api/v1/purchase/credit?asOf=2026-10-23')).body.data;
    const b = c.brands.find((x: { brandCode: string }) => x.brandCode === 'ANLENE');
    expect(b).toMatchObject({ limit: 2000000000, allocated: 1500000000, unallocated: 500000000 });
    // Nợ nhãn tại CN Nam Định = số dư đầu 250 triệu + phần chưa trả phiếu nhập Thắng Bảo 108 triệu
    expect(b.branches.find((x: { branchCode: string }) => x.branchCode === 'CN-ND').current).toBe(358000000);
    expect((await call(t, 'POST', `/api/v1/purchase/policies/${b.id}/transfer-limit`, { from: '', to: 'CN-ND', amount: 600000000 })).status).toBe(400);
    expect((await call(t, 'POST', `/api/v1/purchase/policies/${b.id}/transfer-limit`, { from: '', to: 'CN-ND', amount: 100000000 })).status).toBe(200);
    const after = (await call(t, 'GET', '/api/v1/purchase/credit?asOf=2026-10-23')).body.data.brands.find((x: { brandCode: string }) => x.brandCode === 'ANLENE');
    expect(after.branches.find((x: { branchCode: string }) => x.branchCode === 'CN-ND').limit).toBe(600000000);
    expect((await call(t, 'GET', '/api/v1/purchase/logs?event=limit_transfer')).body.data[0].data).toMatchObject({ to: 'CN-ND', amount: 100000000 });
    expect(c.supply[0].branches.find((x: { branchCode: string }) => x.branchCode === 'CN-PT').done).toBe(500000000);
  });

  it('TH18 — hạn theo ngày làm việc có ngày lễ; tuổi nợ 6 nhóm; cảnh báo NCC đang có nợ quá hạn khi lập phiếu mới', async () => {
    const st = (await call(t, 'GET', '/api/v1/purchase/settings')).body.data;
    expect((await call(t, 'PUT', '/api/v1/purchase/settings', { holidays: [...st.holidays, '2026-10-12'], brandOpening: st.brandOpening, accounts: st.accounts, warnDays: 5 })).status).toBe(200);
    const a = (await call(t, 'POST', '/api/v1/purchase/analyze', { kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-23', branchCode: 'CN-NA', partnerCode: 'NCC-TRUNGHAU', priceIncludesVat: true, orderDiscount: {}, invoice: { no: 'X1', date: '2026-10-01' }, lines: [{ lineKey: 'a', sku: '110154035', name: 'G', unit: 'Lon', qty: 1, price: 528000, taxCode: 'V08', lineType: 'buy', lotNo: 'Z', expDate: '2028-01-01' }] })).body.data;
    expect(a.calc.dueDate).toBe('2026-10-16'); // 10 ngày làm việc từ 01/10, nghỉ 12/10
    expect(codes(a.checks)).toContain('credit_overdue');
    const due = (await call(t, 'GET', '/api/v1/purchase/due?asOf=2026-10-23')).body.data;
    expect(due.buckets.map((b: { label: string }) => b.label)).toEqual(['Chưa đến hạn', 'Đến hạn', 'Quá hạn 1–7 ngày', 'Quá hạn 8–15 ngày', 'Quá hạn 16–30 ngày', 'Quá hạn > 30 ngày']);
  });

  it('TH20 — quà NCC tặng 100, TGS tự mua 50 có VAT + 30 không VAT; xuất vượt tồn bị chặn; ngân sách quà theo chương trình', async () => {
    const g = (await call(t, 'GET', '/api/v1/purchase/gifts')).body.data;
    const q = (f: (r: { source: string; hasVat: boolean }) => boolean) => g.rows.filter(f).reduce((s: number, r: { inQty: number }) => s + r.inQty, 0);
    expect([q((r) => r.source === 'ncc_program'), q((r) => r.source === 'self_buy' && r.hasVat), q((r) => r.source === 'self_buy' && !r.hasVat)]).toEqual([100, 50, 30]);
    const over = await save({ kind: 'gift_out', docDate: '2026-10-23', branchCode: 'CN-PT', partnerCode: 'NCC-ANLENE', priceIncludesVat: false, lines: [{ lineKey: 'x', sku: 'QT-BINH-01', name: 'Bình', unit: 'Cái', qty: 50, price: 0, taxCode: 'KKKN', lineType: 'gift_consumer', program: 'ANL-T10-BINH' }] });
    const r = await call(t, 'POST', `/api/v1/purchase/documents/${over.id}/approve`);
    expect(r.status).toBe(409); expect(r.body.error.message).toMatch(/chỉ còn 35/);
    expect((await call(t, 'POST', '/api/v1/purchase/policies', { code: 'NS-TRI-AN', kind: 'gift_budget', name: 'Ngân sách quà tri ân', rule: { program: 'TGS-TRI-AN', amount: 10000000 } })).status).toBe(201);
    const b = (await call(t, 'GET', '/api/v1/purchase/gifts')).body.data.budgets[0];
    expect(b).toMatchObject({ program: 'TGS-TRI-AN', amount: 10000000 });
    expect(b.used).toBeGreaterThan(0);
  });

  it('TH21 — cước 10 triệu phân bổ theo giá trị: 4,8 + 3,2 + 2 triệu; Anlene Gold 480.000 → 489.600/lon; phân bổ được cho nhiều phiếu nhập', async () => {
    const vt = byNote('TH21 — cước');
    const al = (await call(t, 'GET', `/api/v1/purchase/allocations/${vt.id}`)).body.data;
    expect(al.rows.map((r: { amount: number }) => r.amount)).toEqual([4800000, 3200000, 2000000]);
    const anl = byNote('TH21 + TH11');
    const rc = (await call(t, 'GET', `/api/v1/purchase/real-cost/${anl.id}`)).body.data.rows.find((r: { sku: string }) => r.sku === '110154035');
    expect((rc.before + rc.cost) / (rc.qty + rc.giftQty)).toBe(489600);
    const multi = await save({ kind: 'cost', docDate: '2026-10-23', branchCode: 'CN-PT', partnerCode: 'NCC-VANTAI', amount: 3000001, costType: 'boc_xep', basis: 'qty', refIds: [anl.id, byNote('TH12').id], lines: [] });
    expect((await call(t, 'GET', `/api/v1/purchase/allocations/${multi.id}`)).body.data.rows.reduce((s: number, r: { amount: number }) => s + r.amount, 0)).toBe(3000001);
  });

  it('TH22 + TH25 — thưởng 16,5 triệu phân bổ theo mã; chiết khấu bổ sung sau nhập giảm giá thực tế từng mã, tổng khớp', async () => {
    const pv = (await call(t, 'POST', '/api/v1/purchase/rebates/preview', { policyCode: 'ANL-CT-THANG', period: '2026-10', manualTotal: 550000000 })).body.data;
    const rb = await save({ kind: 'rebate', docDate: '2026-10-23', branchCode: 'CN-PT', partnerCode: 'NCC-ANLENE', brandCode: 'ANLENE', amount: pv.amount, rebate: { policyCode: 'ANL-CT-THANG', period: '2026-10', base: pv.base, rate: pv.rate, detail: pv.detail }, allocation: pv.allocation, lines: [] });
    await approve(rb.id);
    const sum = (await call(t, 'GET', '/api/v1/purchase/summary?from=2026-10-01&to=2026-10-31&groupBy=sku')).body.data.rows;
    expect(sum.reduce((s: number, r: { rebate: number }) => s + r.rebate, 0)).toBeGreaterThanOrEqual(16500000);
    const anl = byNote('TH21 + TH11');
    const ck = await save({ kind: 'rebate', docDate: '2026-10-23', branchCode: 'CN-PT', partnerCode: 'NCC-ANLENE', amount: 5000000, refIds: [anl.id], note: 'NCC giảm giá bổ sung sau nhập', lines: [] });
    await approve(ck.id);
    const rc = (await call(t, 'GET', `/api/v1/purchase/real-cost/${anl.id}`)).body.data.rows;
    expect(rc.reduce((s: number, r: { rebate: number }) => s + r.rebate, 0)).toBe(5000000);
    expect((await get(ck.id)).doc.links[0]!.role).toBe('Thưởng / CK giảm giá vốn');
  });

  it('TH23 — đổi cùng mã (chênh 0), đổi khác mã khác giá trị (trả thêm 1.080.000), trả hàng gắn phiếu gốc; trả quá số đã nhận bị chặn', async () => {
    const a = await approve(byNote('TH23.1').id);
    expect(a.links.map((l) => l.role)).toEqual(['Hàng trả đi', 'Hàng nhận về']);
    const b = await approve(byNote('TH23.3').id);
    expect(b.totals.total).toBe(1080000);
    expect(b.links.map((l) => l.role)).toContain('Trả chênh lệch');
    expect(byNote('TH23.4').status).toBe('approved');
    const over = await save({ kind: 'return', docDate: '2026-10-23', branchCode: 'CN-NA', partnerCode: 'NCC-TRUNGHAU', refIds: [byNote('TH1 —').id], orderDiscount: { pct: 7 }, lines: [{ lineKey: 'r', sku: '110154036', name: 'V', unit: 'Lon', qty: 30, price: 431000, taxCode: 'V08', lineType: 'buy', lotNo: 'AV2607B', expDate: '2028-01-31' }] });
    const r = await call(t, 'POST', `/api/v1/purchase/documents/${over.id}/approve`);
    expect(r.status).toBe(409); expect(r.body.error.message).toMatch(/chỉ còn 20 có thể trả/);
  });

  it('TH24 — tổng hợp theo ngành / nhóm / mã / NCC / chi nhánh kèm công nợ còn lại theo mã', async () => {
    for (const groupBy of ['industry', 'group', 'brand', 'sku', 'partner', 'branch']) {
      const r = (await call(t, 'GET', `/api/v1/purchase/summary?from=2026-10-01&to=2026-10-31&groupBy=${groupBy}`)).body.data;
      expect(r.rows.length, groupBy).toBeGreaterThan(0);
      // Mã và tên tách riêng: mã hàng / nhóm / ngành / nhãn có tên (không gộp "mã — tên" vào một ô, không chỉ hiện mã số).
      if (groupBy !== 'partner' && groupBy !== 'branch') expect(r.rows.filter((x: { key: string; name: string }) => x.key && !x.name), groupBy).toEqual([]);
    }
    const sku = (await call(t, 'GET', '/api/v1/purchase/summary?from=2026-10-01&to=2026-10-31&groupBy=sku')).body.data.rows;
    expect(sku.some((r: { openDebt: number }) => r.openDebt > 0)).toBe(true);
    expect(sku.find((r: { key: string }) => r.key === '110154035').unitCost).toBeGreaterThan(0);
  });

  it('Phiếu demo cảnh báo — trùng HĐ, lệch giá, lệch đơn đặt, lệch tổng HĐ, cận date, thiếu lô', async () => {
    const a = (await get(byNote('DEMO CẢNH BÁO').id)).analysis;
    expect(codes(a.checks)).toEqual(expect.arrayContaining(['invoice_dup', 'price_fixed', 'price_last', 'po_price', 'invoice_total', 'near_expiry', 'lot_missing']));
  });

  it('TH6, 7, 9, 10 (phía bán) và mọi con số tài liệu — phép thử công thức 24/24', async () => {
    const sc = (await call(t, 'GET', '/api/v1/purchase/scenarios')).body.data as { th: number; ok?: boolean }[];
    expect(sc.filter((s) => s.ok === false)).toEqual([]);
    expect(sc.filter((s) => [6, 7, 9, 10].includes(s.th)).every((s) => s.ok)).toBe(true);
  });
});

describe('Ví dụ bổ sung VD1–VD8 (NCC Hoà Bình): nhiều thuế suất, giao nhiều lần, bậc SL, giá cố định theo ĐVT', () => {
  const byNote = (p: string) => docs.find((d) => d.note?.startsWith(p))!;
  it('VD2 — nhập theo đơn, 2 mức thuế 8% / 10%, khăn ướt 200 gói tự hưởng bậc 5%, hạn 15 ngày làm việc; đã ghi sổ', () => {
    const d = byNote('VD2');
    expect(d.status).toBe('approved');
    // 80×380.000 + 60×520.000 + 200×28.000×95% = 66.920.000 trước thuế; thuế 8% 4.928.000 + 10% 532.000.
    expect(d.totals).toMatchObject({ beforeTax: 66_920_000, tax: 5_460_000, total: 72_380_000 });
    expect(d.dueDate).toBeTruthy();
    expect(d.links.length).toBeGreaterThan(0);
  });
  it('VD2 — CK bậc 5% tự áp được chốt lúc duyệt: giá vốn thực tế (MH07) và tổng hợp mua ra 26.600/gói như bút toán, kể cả khi tắt chính sách', async () => {
    const d = byNote('VD2');
    const khan = async () => (await call(t, 'GET', `/api/v1/purchase/real-cost/${d.id}`)).body.data.rows.find((r: { sku: string }) => r.sku === '170413004');
    expect(await khan()).toMatchObject({ qty: 200, gross: 5_600_000, disc: 280_000, before: 5_320_000 });
    const sum = (await call(t, 'GET', '/api/v1/purchase/summary?from=2026-10-01&to=2026-10-31&groupBy=sku')).body.data.rows.find((r: { key: string }) => r.key === '170413004');
    expect(sum.discount).toBeGreaterThanOrEqual(280_000);
    const tiers = (await call(t, 'GET', '/api/v1/purchase/policies')).body.data.filter((p: { kind: string; isActive: boolean }) => p.kind === 'qty_tier' && p.isActive);
    for (const p of tiers) await call(t, 'PUT', `/api/v1/purchase/policies/${p.id}`, { ...p, isActive: false });
    expect(await khan()).toMatchObject({ disc: 280_000, before: 5_320_000 });
    for (const p of tiers) await call(t, 'PUT', `/api/v1/purchase/policies/${p.id}`, { ...p, isActive: true });
  });
  it('VD3 chi phí bốc xếp theo SL, VD5 CK sau mua có HĐ điều chỉnh, VD6 trả một phần — đều duyệt được', () => {
    for (const n of ['VD3', 'VD5', 'VD6', 'VD4']) expect(byNote(n).status, n).toBe('approved');
  });
  it('VD4 giá cao hơn giá cố định / Hộp 3,9% → cảnh báo (không chặn); VD7 lô còn 19 ngày → cảnh báo cận date; VD8 bậc 3%', async () => {
    expect(codes(byNote('VD4').checks)).toContain('price_fixed');
    expect(byNote('VD4').checks?.find((c) => c.code === 'price_fixed')).toMatchObject({ level: 'warn' });
    expect(codes(byNote('VD7').checks)).toContain('near_expiry');
    const a = (await call(t, 'POST', '/api/v1/purchase/analyze', byNote('VD8'))).body.data as { calc: { trace: { policy: string; text: string }[] } };
    expect(a.calc.trace.find((x) => x.policy === 'HB-BAC-KHAN')?.text).toMatch(/CK 3%/);
  });
  it('giá cố định theo ĐVT: khai giá / Hộp, dòng nhập theo Thùng (12 hộp) so với giá quy đổi; ĐVT lạ không so; lịch sử giá trả lần nhập gần nhất', async () => {
    const vd8 = byNote('VD8');
    const line = vd8.lines.find((l) => l.sku === '110054061')!;
    const analyze = async (unit: string, price: number) => codes(((await call(t, 'POST', '/api/v1/purchase/analyze', { ...vd8, id: undefined, docNo: '', lines: [{ ...line, unit, price }] })).body.data as { checks: { code: string }[] }).checks);
    expect(await analyze('Thùng', 520000 * 12)).not.toContain('price_fixed');
    expect(await analyze('Thùng', 3_000_000)).toContain('price_fixed');
    expect(await analyze('Bao', 3_000_000)).not.toContain('price_fixed');
    const h = (await call(t, 'GET', '/api/v1/purchase/price-history/110054057')).body.data as { docNo: string; unitPrice: number; unit?: string }[];
    expect(h[0]).toMatchObject({ docNo: 'NM2610052', unitPrice: 395000, unit: 'Hộp' });
  });
});

describe('Quy trình liên kết: khai mã + giá của NCC → đơn đặt (duyệt) → phiếu nhập theo đơn → công nợ → báo cáo', () => {
  type Linked = Doc & { refIds?: string[]; lines: ({ sku: string; unit: string; price?: number; lineType?: string } & Record<string, unknown>)[] };
  const all = () => docs as Linked[];

  it('mọi phiếu nhập mua mẫu đều lập từ một đơn đặt (trừ phiếu nháp để thử VD8); đơn đặt không ghi sổ, không có hoá đơn', async () => {
    await reload();
    const receipts = all().filter((d) => d.kind === 'receipt' && d.note && !d.note.startsWith('VD8')); // phiếu mẫu (phiếu do phép thử khác tạo không có ghi chú)
    expect(receipts.length).toBeGreaterThan(10);
    for (const r of receipts) {
      const ord = all().find((d) => d.kind === 'order' && (r.refIds ?? []).includes(d.id));
      expect(ord, `${r.docNo} (${r.note?.slice(0, 30)}) chưa gắn đơn đặt`).toBeTruthy();
      expect(ord!.links ?? []).toEqual([]);
    }
  });

  it('giá mua khai riêng cho từng NCC (không còn "giá chung" Anlene): Trung Hậu 528.000 gồm VAT, mua thẳng nhãn Anlene 480.000 chưa VAT', async () => {
    const th = (await call(t, 'GET', '/api/v1/purchase/supplier-products?partnerCode=NCC-TRUNGHAU')).body.data.rows as { sku: string; price: number; priceIncludesVat: boolean; partnerCode: string }[];
    expect(th.find((r) => r.sku === '110154035')).toMatchObject({ partnerCode: 'NCC-TRUNGHAU', price: 528000, priceIncludesVat: true });
    expect(th.find((r) => r.sku === '110154036')).toMatchObject({ price: 431000, priceIncludesVat: true });
    const bySku = (await call(t, 'GET', '/api/v1/purchase/supplier-products?sku=110154035')).body.data.rows as { partnerCode: string | null; price: number; priceIncludesVat: boolean }[];
    expect(bySku.filter((r) => !r.partnerCode)).toEqual([]);
    expect(bySku.find((r) => r.partnerCode === 'NCC-ANLENE')).toMatchObject({ price: 480000, priceIncludesVat: false });
  });

  it('TH1 đi trọn chuỗi: giá trên đơn = giá đã khai; phiếu nhập khớp đơn (không lệch giá, không lệch giá cố định); nhận đủ thì đơn không còn giữ hạn mức', async () => {
    const ord = all().find((d) => d.docNo === 'DH2610001')!;
    expect(ord).toMatchObject({ kind: 'order', status: 'approved' });
    expect(ord.lines.map((l) => [l.sku, l.price])).toEqual([['110154035', 528000], ['110154036', 431000]]);
    const rec = byNote('TH1 —') as Linked;
    expect(rec.refIds).toContain(ord.id);
    const a = (await get(rec.id)).analysis;
    expect(codes(a.checks)).toContain('po_match');
    expect(codes(a.checks)).not.toContain('po_price');
    expect(codes(a.checks)).not.toContain('price_fixed');
    // Đơn đã nhận đủ không cộng vào nợ dự kiến: đơn "đặt thêm 40 triệu" của TH3 vẫn vượt đúng 7.450.000 (không bị cộng trùng các đơn TH1–TH3).
    expect((await get(byNote('TH3 — đặt thêm').id)).analysis.credit[0]).toMatchObject({ exceeded: 7450000 });
  });

  it('VD4: NCC xuất hoá đơn giá cao hơn giá đặt → phiếu nhập cảnh báo lệch đơn giá so với đơn và lệch giá cố định', async () => {
    const a = (await get(byNote('VD4').id)).analysis;
    expect(codes(a.checks)).toEqual(expect.arrayContaining(['po_price', 'price_fixed']));
  });

  it('nhập ngoài đơn (ngoại lệ được phép): thiếu lý do → chặn; có lý do → cảnh báo vàng, duyệt đóng dấu người duyệt, rà soát riêng; MH12 bật → phải duyệt ngoại lệ', async () => {
    const line = { lineKey: 'a', sku: '110154035', name: 'G', unit: 'Lon', qty: 1, price: 528000, taxCode: 'V08', lineType: 'buy', lotNo: 'L1', expDate: '2028-01-31' };
    const body = { kind: 'receipt', docDate: '2026-10-28', branchCode: 'CN-NA', partnerCode: 'NCC-TRUNGHAU', priceIncludesVat: true, lines: [line] };
    // Thiếu lý do: chặn duyệt.
    const d = await save(body);
    expect((await get(d.id)).analysis.checks.find((c) => c.code === 'po_none_reason')).toMatchObject({ level: 'error' });
    const r0 = await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/approve`);
    expect(r0.status).toBe(409); expect(JSON.stringify(r0.body)).toMatch(/Lý do nhập ngoài đơn/);
    // Ghi lý do: cảnh báo vàng, duyệt được; phiếu mang dấu nhập ngoài đơn (lý do + người duyệt), nhật ký ghi lại.
    const reason = 'NCC giao bổ sung hàng thiếu của đợt trước';
    expect((await call(t, 'PUT', `/api/v1/purchase/documents/${d.id}`, { ...body, outsideOrder: { reason } })).status).toBe(200);
    expect((await get(d.id)).analysis.checks.find((c) => c.code === 'po_none')).toMatchObject({ level: 'warn' });
    const ok1 = await approve(d.id);
    expect(ok1.status).toBe('approved');
    const stored = (await get(d.id)).doc as Doc & { outsideOrder?: { reason: string; by?: string; reviewedBy?: string } };
    expect(stored.outsideOrder).toMatchObject({ reason });
    expect(stored.outsideOrder?.by).toBeTruthy();
    expect((await call(t, 'GET', '/api/v1/purchase/logs?event=outside_order_approved')).body.data[0].data.reason).toBe(reason);
    // Việc cần làm: phiếu nhập ngoài đơn chờ rà soát.
    const todo = async () => ((await call(t, 'GET', '/api/v1/purchase/todo')).body.data.items as { key: string; count: number }[]).find((x) => x.key === 'outside');
    const before = (await todo())?.count ?? 0;
    expect(before).toBeGreaterThanOrEqual(1);
    // Kế toán rà soát riêng.
    const rv = await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/review-outside`, { note: 'Đã đối chiếu biên bản giao hàng' });
    expect(rv.status, JSON.stringify(rv.body)).toBe(200);
    expect(rv.body.data.outsideOrder).toMatchObject({ reason, reviewNote: 'Đã đối chiếu biên bản giao hàng' });
    expect(rv.body.data.outsideOrder.reviewedBy).toBeTruthy();
    expect((await todo())?.count ?? 0).toBe(before - 1);
    // Bật "Phiếu nhập phải lập từ đơn đặt": có lý do vẫn chặn duyệt thường, người có quyền bấm Duyệt ngoại lệ thì được.
    const cur = (await call(t, 'GET', '/api/v1/purchase/settings')).body.data as Record<string, unknown>;
    const put = (requireOrder: boolean) => call(t, 'PUT', '/api/v1/purchase/settings', { holidays: cur.holidays, brandOpening: cur.brandOpening, accounts: {}, warnDays: cur.warnDays, priceWarnPct: cur.priceWarnPct, requireOrder });
    expect((await put(true)).status).toBe(200);
    const d2 = await save({ ...body, docDate: '2026-10-29', outsideOrder: { reason: 'Mua gấp hàng bán chạy' } });
    const r2 = await call(t, 'POST', `/api/v1/purchase/documents/${d2.id}/approve`);
    expect(r2.status).toBe(409); expect(r2.body.error.details.canOverride).toBe(true);
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${d2.id}/override`, { reason: 'Kế toán trưởng cho nhập gấp' })).status).toBe(200);
    await put(false);
  });

  it('đối chiếu đơn đặt ↔ phiếu nhập (MH21): giao thừa, lệch giá, mã ngoài đơn, phiếu đang chờ — theo vết từng phiếu', async () => {
    expect((await call(t, 'PUT', '/api/v1/partners/NCC-DC', { name: 'NCC đối chiếu', kind: 'supplier' })).status).toBeLessThan(300);
    const L = (k: string, sku: string, unit: string, qty: number, price: number) => ({ lineKey: k, sku, name: sku, unit, qty, price, taxCode: 'V10', lineType: 'buy', lotNo: 'DC1', expDate: '2028-01-31' });
    const ord = await save({ kind: 'order', docDate: '2026-11-02', branchCode: 'CN-NA', partnerCode: 'NCC-DC', priceIncludesVat: false, lines: [L('a', '170413004', 'Gói', 100, 28000)] });
    await approve(ord.id);
    // Giao 120 gói (thừa 20), giá 28.500 (lệch +1,79%), kèm 5 hộp Sure Prevent không có trong đơn.
    const rec = await save({ kind: 'receipt', docDate: '2026-11-03', branchCode: 'CN-NA', partnerCode: 'NCC-DC', priceIncludesVat: false, refIds: [ord.id], lines: [L('a', '170413004', 'Gói', 120, 28500), L('b', '110054061', 'Hộp', 5, 520000)] });
    const codesR = codes((await get(rec.id)).analysis.checks);
    expect(codesR).toEqual(expect.arrayContaining(['po_over', 'po_price']));
    // Chưa duyệt: số nằm ở cột "đang chờ".
    const q = async () => (await call(t, 'GET', '/api/v1/purchase/order-reconcile?from=2026-11-01&to=2026-11-30&partnerCode=NCC-DC')).body.data as { rows: { orderNo: string; sku: string; ordered: number; received: number; pending: number; diff: number; state: string; priceDiffPct: number | null; receipts: { docNo: string }[] }[]; summary: Record<string, number> };
    let r = await q();
    expect(r.rows.find((x) => x.sku === '170413004')).toMatchObject({ ordered: 100, received: 0, pending: 120, state: 'thieu' });
    await approve(rec.id);
    r = await q();
    expect(r.rows.find((x) => x.sku === '170413004')).toMatchObject({ orderNo: ord.docNo, ordered: 100, received: 120, pending: 0, diff: 20, state: 'thua', priceDiffPct: 1.79 });
    const extra = r.rows.find((x) => x.sku === '110054061')!;
    expect(extra).toMatchObject({ orderNo: ord.docNo, ordered: 0, received: 5, state: 'ngoai_don' });
    expect(extra.receipts.map((x) => x.docNo)).toEqual([rec.docNo]);
    expect(r.summary).toMatchObject({ thua: 1, ngoai_don: 1 });
    // Phiếu đã duyệt vẫn giữ dấu lệch đơn (checks lưu lúc duyệt) — MH11 lọc được.
    const stored = (docs.find((d) => d.id === rec.id))!;
    expect(codes(stored.checks)).toEqual(expect.arrayContaining(['po_over', 'po_price']));
  });

  it('báo cáo tổng hợp mua hàng chỉ tính phiếu nhập (đơn đặt không cộng vào số mua)', async () => {
    const rows = (await call(t, 'GET', '/api/v1/purchase/summary?from=2026-10-01&to=2026-10-31&groupBy=sku')).body.data.rows as { key: string; docList: { docNo: string }[] }[];
    const docNos = rows.flatMap((r) => r.docList.map((d) => d.docNo));
    expect(docNos.some((n) => n.startsWith('NM'))).toBe(true);
    expect(docNos.filter((n) => n.startsWith('DH'))).toEqual([]);
  });
});
