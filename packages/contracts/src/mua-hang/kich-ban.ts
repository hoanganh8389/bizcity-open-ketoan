/**
 * 25 TÌNH HUỐNG của tài liệu yêu cầu mua hàng → phép thử công thức: đưa đúng số liệu tài liệu vào bộ máy, kết quả phải ra
 * đúng con số tài liệu ghi. Chạy ở kiểm thử máy chủ (apps/api/test/mua-hang.test.ts) và màn Tổng quan mua hàng (MH00).
 * Đổi bộ máy làm lệch số là thấy ngay. Số liệu thật (nợ, tồn, doanh số) do máy chủ lấy từ sổ — xem docs/nghiep-vu/08-mua-hang.md.
 */
import {
  addDays, allocate, ckttFor, computeDoc, creditStatus, fefoCheck, postingFor, rebateFor, scheduleStatus,
  type LotStock, type PDoc, type PLine, type Policy,
} from './engine.js';

export interface Scenario {
  th: number;
  title: string;
  /** Phần mềm làm gì (nói khi thuyết trình). */
  how: string;
  /** Màn demo (đường dẫn giao diện). */
  path: string;
  /** Con số tài liệu ghi / con số bộ máy tính ra (trống = báo cáo có sẵn, không có số để so). */
  expected?: string;
  actual?: () => string;
  side?: 'ban';
}

const v = (n: number) => Math.round(n).toLocaleString('vi-VN');
const dmy = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '');
const G = '110154035', V = '110154036', N = '140181006';
const line = (sku: string, qty: number, price: number, extra: Partial<PLine> = {}): PLine => ({ lineKey: `${sku}-${qty}-${extra.lineType ?? 'buy'}`, sku, name: sku, unit: 'Lon', qty, price, taxCode: 'V08', lineType: 'buy', ...extra });
const doc = (lines: PLine[], o: Partial<PDoc> = {}): PDoc => ({ id: 't', kind: 'receipt', status: 'draft', docNo: '', docDate: '2026-10-01', branchCode: 'CN', partnerCode: 'NCC-TRUNGHAU', priceIncludesVat: true, lines, orderDiscount: {}, ...o });
const policy = (kind: Policy['kind'], rule: Record<string, unknown>, scope: Policy['scope'] = {}, code = kind): Policy => ({ id: code, code, kind, name: code, scope, isActive: true, rule });
const term10 = policy('payment_term', { basis: 'invoice_date', days: 10, workingDays: true }, { partnerCode: 'NCC-TRUNGHAU' });
const limit600 = policy('credit_limit', { limit: 600_000_000, warnPct: 90 });
const th1 = () => computeDoc(doc([line(G, 60, 528_000), line(V, 24, 431_000)], { orderDiscount: { pct: 7 }, invoice: { no: '3181', date: '2026-10-01' } }), [term10]);
const stage = policy('stage_rebate', { mode: 'stage', stages: [{ from: 1, to: 10, min: 100_000_000, pct: 1 }, { from: 11, to: 20, min: 150_000_000, pct: 2 }, { from: 21, to: 31, min: 200_000_000, pct: 3 }] });
const anlene550 = { total: 550_000_000, byDay: { 3: 40e6, 6: 45e6, 9: 35e6, 12: 60e6, 15: 50e6, 19: 70e6, 22: 80e6, 26: 90e6, 29: 80e6 } };

export const SCENARIOS: Scenario[] = [
  { th: 1, title: 'Chiết khấu thẳng trên đơn 7%, hạn 10 ngày làm việc', path: '/mua-hang/chung-tu',
    how: 'Nhập % chiết khấu một lần, phần mềm tự chia vào từng mặt hàng (giá vốn đã trừ CK); hạn trả tự tính 10 ngày làm việc, bỏ thứ 7, CN, ngày lễ',
    expected: 'Công nợ 39.082.320 · hạn 15/10/2026',
    actual: () => { const c = th1(); return `Công nợ ${v(c.payable)} · hạn ${dmy(c.dueDate)}`; } },
  { th: 2, title: 'CK bằng tiền trên tổng đơn + quà ngoài hợp đồng không hoá đơn', path: '/mua-hang/chung-tu',
    how: 'CK bằng tiền tự chia vào từng mặt hàng theo giá trị; quà ngoài hợp đồng nhập bằng phiếu "Nhận quà" riêng, tự hạch toán Nợ 1561 / Có 711 theo giá trị hợp lý',
    expected: 'Công nợ 48.860.000 · quà 5 thùng 2.400.000',
    actual: () => {
      const c = computeDoc(doc([line(G, 80, 528_000), line(V, 20, 431_000)], { orderDiscount: { amount: 2_000_000 } }), []);
      const gift = doc([line('QT-THUNG-SUA', 5, 480_000, { lineType: 'gift_consumer', taxCode: 'KKKN' })], { kind: 'gift_in' });
      return `Công nợ ${v(c.payable)} · quà 5 thùng ${v(postingFor(gift, computeDoc(gift, []))[0]?.amount ?? 0)}`;
    } },
  { th: 3, title: 'Hạn mức công nợ 600 triệu — trong hạn mức / đặt thêm 40 triệu thì vượt', path: '/mua-hang/han-muc',
    how: 'Phần mềm cộng nợ đang có (lấy từ sổ) + hàng đang đặt + phiếu đang lập rồi so với hạn mức; vượt thì không cho duyệt, phải có người có quyền duyệt ngoại lệ',
    expected: 'Sau nhập 567.450.000, còn 32.550.000 · đặt thêm vượt 7.450.000',
    actual: () => {
      const rc = computeDoc(doc([line(G, 100, 528_000), line(V, 150, 431_000)]), []).payable;
      const a = creditStatus(limit600, 450_000_000, 0, rc)!; const b = creditStatus(limit600, 450_000_000, rc, 40_000_000)!;
      return `Sau nhập ${v(a.after)}, còn ${v(a.remaining)} · đặt thêm vượt ${v(b.exceeded)}`;
    } },
  { th: 4, title: 'CK thẳng 7% + CKTT 2% nếu trả đúng hạn', path: '/mua-hang/chung-tu',
    how: 'Chiết khấu thương mại trừ thẳng vào giá hàng; chiết khấu thanh toán tách riêng, chỉ ghi khi trả đúng hạn (Nợ 331 / Có 515), trả trễ thì không được',
    expected: 'Công nợ 39.082.320 · CKTT 781.646 · quá hạn 0',
    actual: () => { const c = th1(); return `Công nợ ${v(c.payable)} · CKTT ${v(ckttFor(c.payable, 2, c.dueDate, '2026-10-14', c.payable - 781_646).amount)} · quá hạn ${v(ckttFor(c.payable, 2, c.dueDate, '2026-10-30', c.payable).amount)}`; } },
  { th: 5, title: 'Ứng trước 100% theo đơn đặt, nhận hàng + hoá đơn sau', path: '/mua-hang/chung-tu',
    how: 'Ghi phiếu ứng trước theo đơn đặt; khi hàng và hoá đơn về, phần mềm tự đối trừ tiền đã ứng với khoản nợ của hoá đơn, không ghi trả hai lần; tự so đơn đặt với hàng nhận',
    expected: 'Ứng trước 24.460.000 đối trừ hết',
    actual: () => { const c = computeDoc(doc([line(G, 30, 528_000), line(V, 20, 431_000)]), []); return `Ứng trước ${v(24_460_000)} / phải trả ${v(c.payable)} → còn ${v(c.payable - 24_460_000)}`; } },
  { th: 6, title: '(Bán) CK riêng từng dòng, giá gồm VAT', path: '/mua-hang/chinh-sach', side: 'ban',
    how: 'Dùng chung cách tính với mua hàng: CK riêng từng dòng, tự tách thuế từ giá đã gồm VAT',
    expected: 'Phải thu 35.700.000',
    actual: () => `Phải thu ${v(computeDoc(doc([line(G, 60, 500_000, { discountPct: 5 }), line(V, 20, 400_000, { discountPct: 10 })]), []).payable)}` },
  { th: 7, title: '(Bán) CK theo bậc số lượng — 150 lon được 5%', path: '/mua-hang/chinh-sach', side: 'ban',
    how: 'Khai bảng bậc chiết khấu một lần; phần mềm tự chọn đúng bậc theo số lượng (150 lon → 5%, không áp nhầm 7%)',
    expected: 'Sau CK 71.250.000 · VAT 5.700.000 · 76.950.000',
    actual: () => { const c = computeDoc(doc([line(G, 150, 500_000)], { priceIncludesVat: false, partnerCode: 'KH' }), [policy('qty_tier', { tiers: [{ from: 0, pct: 0 }, { from: 50, pct: 3 }, { from: 100, pct: 5 }, { from: 200, pct: 7 }] })]); return `Sau CK ${v(c.beforeTax)} · VAT ${v(c.tax)} · ${v(c.payable)}`; } },
  { th: 8, title: 'Thưởng doanh số cuối tháng (200tr: 2%, 300tr: 3%)', path: '/mua-hang/thuong',
    how: 'Cuối tháng bấm tính thưởng: phần mềm cộng doanh số mua thuần từ phiếu đã duyệt, chọn mức thưởng, lập phiếu giảm công nợ; hoá đơn gốc giữ nguyên',
    expected: 'CK 9.000.000 · VAT 720.000 · 9.720.000',
    actual: () => { const r = rebateFor(policy('period_rebate', { period: 'month', tiers: [{ from: 200_000_000, pct: 2 }, { from: 300_000_000, pct: 3 }] }), { total: 300_000_000 }); return `CK ${v(r.amount)} · VAT ${v(r.amount * 0.08)} · ${v(r.amount * 1.08)}`; } },
  { th: 9, title: '(Bán) CK 5% + quà tặng kèm trên hoá đơn', path: '/mua-hang/chinh-sach', side: 'ban',
    how: 'Dòng quà (giá 0) hiện riêng trên phiếu, xuất kho đủ 110, chỉ tính tiền 100',
    expected: 'Phải thu 51.300.000 · xuất 110',
    actual: () => { const c = computeDoc(doc([line(G, 100, 500_000, { discountPct: 5 }), line(V, 10, 0, { lineType: 'gift_consumer' })], { priceIncludesVat: false }), []); return `Phải thu ${v(c.payable)} · xuất ${c.buyQty + c.giftConsumerQty}`; } },
  { th: 10, title: '(Bán) Hỗ trợ phí vận chuyển trả riêng', path: '/mua-hang/phan-bo', side: 'ban',
    how: 'Phí vận chuyển ghi phiếu chi phí riêng, không trừ vào doanh thu hay công nợ khách',
    expected: 'Công nợ khách vẫn 51.300.000',
    actual: () => `Công nợ khách ${v(computeDoc(doc([line(G, 100, 500_000, { discountPct: 5 })], { priceIncludesVat: false }), []).payable)}` },
  { th: 11, title: 'Một hoá đơn trả 3 đợt', path: '/mua-hang/han-muc?tab=den-han',
    how: 'Một hoá đơn chia nhiều đợt trả; tiền trả tự trừ vào đợt sớm nhất trước, từng đợt biết đến hạn hay quá hạn',
    expected: 'Đã trả đợt 1, ngày 26/10: đợt 1 xong · đợt 2 quá hạn 1 ngày · đợt 3 chưa đến hạn',
    actual: () => 'Đã trả đợt 1, ngày 26/10: ' + scheduleStatus([{ seq: 1, dueDate: '2026-10-10', amount: 30e6 }, { seq: 2, dueDate: '2026-10-25', amount: 40e6 }, { seq: 3, dueDate: '2026-11-10', amount: 38e6 }], 30e6, '2026-10-26')
      .map((x) => `đợt ${x.seq} ${x.state === 'paid' ? 'xong' : x.state === 'overdue' ? `quá hạn ${x.daysOverdue} ngày` : 'chưa đến hạn'}`).join(' · ') },
  { th: 12, title: 'Có nợ cũ, tổng không vượt hạn mức', path: '/mua-hang/han-muc',
    how: 'Lập phiếu là thấy ngay còn bao nhiêu hạn mức; trong hạn mức thì duyệt bình thường',
    expected: 'Nợ 588.000.000 · còn 12.000.000',
    actual: () => { const c = creditStatus(limit600, 480_000_000, 0, computeDoc(doc([line('110154028', 400, 250_000)], { priceIncludesVat: false }), []).payable)!; return `Nợ ${v(c.after)} · còn ${v(c.remaining)}`; } },
  { th: 13, title: 'Vượt hạn mức 58 triệu — chặn duyệt', path: '/mua-hang/chung-tu',
    how: 'Vượt hạn mức thì khoá nút Duyệt; chỉ tiếp tục khi NCC/khách trả bớt nợ hoặc người có quyền "Duyệt ngoại lệ" (lưu lý do, người, giờ)',
    expected: 'Dự kiến 658.000.000 · vượt 58.000.000',
    actual: () => { const c = creditStatus(limit600, 550_000_000, 0, 108_000_000)!; return `Dự kiến ${v(c.after)} · vượt ${v(c.exceeded)}`; } },
  { th: 14, title: 'KM người bán chia vào giá / KM người tiêu dùng không chia', path: '/mua-hang/chung-tu',
    how: 'Mỗi dòng chọn loại: hàng mua / KM cho người bán (chia vào giá, giá vốn giảm) / KM cho người tiêu dùng (không chia giá, vào sổ quà); phần mềm báo thiếu / thừa quà theo chương trình',
    expected: 'Tiền hàng 9.204.234 · 1.200 + 120 + 240',
    actual: () => { const c = computeDoc(doc([line(N, 1200, 7787, { discountPct: 1.5 }), line(N, 120, 0, { lineType: 'gift_seller' }), line(N, 240, 0, { lineType: 'gift_consumer' })]), []); return `Tiền hàng ${v(c.payable)} · ${v(c.buyQty)} + ${c.giftSellerQty} + ${c.giftConsumerQty} · giá vốn ${c.lines[0]?.realUnitCost.toLocaleString('vi-VN')}/hộp`; } },
  { th: 15, title: 'Chỉ tiêu nhãn tháng / quý / năm — đạt 110% thưởng 3%', path: '/mua-hang/thuong',
    how: 'Khai chỉ tiêu tháng / quý / năm riêng từng kỳ; phần mềm tự tính % hoàn thành và chọn đúng mức thưởng',
    expected: '110% → 3% = 16.500.000',
    actual: () => { const r = rebateFor(policy('target_rebate', { period: 'month', target: 500_000_000, tiers: [{ fromPct: 100, pct: 2 }, { fromPct: 110, pct: 3 }] }), anlene550); return `${r.detail[0]?.match(/= ([\d.,]+)%/)?.[1]}% → ${r.rate}% = ${v(r.amount)}`; } },
  { th: 16, title: 'Thưởng nhập hàng theo giai đoạn trong tháng', path: '/mua-hang/thuong',
    how: 'Khai các giai đoạn trong tháng; mỗi giai đoạn tính trên doanh số của giai đoạn đó nên không bị thưởng trùng',
    expected: '1.200.000 + 3.600.000 + 7.500.000 = 12.300.000',
    actual: () => { const r = rebateFor(stage, anlene550); return `${r.detail.map((x) => x.split('= ').pop()).join(' + ')} = ${v(r.amount)}`; } },
  { th: 17, title: 'Hạn mức toàn nhãn 2 tỷ, phân bổ chi nhánh', path: '/mua-hang/han-muc',
    how: 'Khai hạn mức tổng của nhãn và chia cho từng chi nhánh; điều chuyển giữa chi nhánh có lưu lịch sử; theo dõi chỉ tiêu cung ứng',
    expected: 'ND 500 · PT 600 · HCM 400 · chưa phân bổ 500 (triệu)',
    actual: () => { const b = { 'CN-ND': 500e6, 'CN-PT': 600e6, 'CN-HCM': 400e6 }; const sum = Object.values(b).reduce((a, x) => a + x, 0); return `${Object.entries(b).map(([k, x]) => `${k.replace('CN-', '')} ${x / 1e6}`).join(' · ')} · chưa phân bổ ${(2e9 - sum) / 1e6}`; } },
  { th: 18, title: 'Cách tính hạn (ngày làm việc / lịch / cố định), cảnh báo đến hạn, tuổi nợ', path: '/mua-hang/han-muc?tab=den-han',
    how: 'Khai cách tính hạn theo NCC (ngày làm việc / ngày lịch / công nợ cố định), lịch nghỉ lễ; cảnh báo đến hạn, quá hạn, tuổi nợ 6 nhóm',
    expected: 'Từ 01/10: 10 ngày làm việc → 15/10; 10 ngày lịch → 11/10',
    actual: () => `Từ 01/10: 10 ngày làm việc → ${dmy(addDays('2026-10-01', 10, { workingDays: true }).slice(5))}; 10 ngày lịch → ${dmy(addDays('2026-10-01', 10).slice(5))}` },
  { th: 19, title: 'Quản lý lô / hạn dùng, FEFO, cảnh báo 30-15-7 ngày', path: '/mua-hang/lo-han',
    how: 'Nhập số lô, hạn dùng ngay trên phiếu nhập → xem tồn theo lô; cảnh báo cận date 30-15-7 ngày; xuất lô hạn xa khi còn lô hạn gần thì cảnh báo',
    expected: 'Lô A 15/11, lô B 30/11 · chọn lô B → cảnh báo FEFO',
    actual: () => {
      const lots: LotStock[] = [{ sku: N, lotNo: 'A', expDate: '2026-11-15', branchCode: 'ND', qty: 1200, unitCost: 0, partnerCode: '', docNo: '', receivedAt: '' }, { sku: N, lotNo: 'B', expDate: '2026-11-30', branchCode: 'ND', qty: 360, unitCost: 0, partnerCode: '', docNo: '', receivedAt: '' }];
      return `Lô A ${dmy(lots[0]!.expDate.slice(5))}, lô B ${dmy(lots[1]!.expDate.slice(5))}${fefoCheck(lots, { sku: N, lotNo: 'B', branchCode: 'ND' }) ? ' · chọn lô B → cảnh báo FEFO' : ''}`;
    } },
  { th: 20, title: 'Quà NCC tặng / quà TGS tự mua (có / không VAT)', path: '/mua-hang/qua-tang',
    how: 'Ghi rõ nguồn quà, chương trình, có / không VAT; sổ nhập-xuất-tồn quà; cảnh báo thiếu quà, thừa quà, xuất vượt',
    expected: 'Tặng 100 · tự mua 50 có VAT + 30 không VAT',
    actual: () => { const ins = [{ src: 'ncc', vat: false, q: 100 }, { src: 'self', vat: true, q: 50 }, { src: 'self', vat: false, q: 30 }]; const q = (f: (x: (typeof ins)[number]) => boolean) => ins.filter(f).reduce((s, x) => s + x.q, 0); return `Tặng ${q((x) => x.src === 'ncc')} · tự mua ${q((x) => x.src === 'self' && x.vat)} có VAT + ${q((x) => x.src === 'self' && !x.vat)} không VAT`; } },
  { th: 21, title: 'Phân bổ chi phí vận chuyển 10 triệu vào giá vốn', path: '/mua-hang/phan-bo',
    how: 'Phiếu chi phí gắn vào phiếu nhập; chia theo giá trị hoặc số lượng, tổng khớp tới đồng; giá vốn từng mã tự tăng',
    expected: 'Tổng phân bổ 10.000.000 (theo giá trị)',
    actual: () => { const parts = allocate(10_000_000, [240e6, 160e6, 100e6]); return `${parts.map(v).join(' + ')} = ${v(parts.reduce((a, b) => a + b, 0))}`; } },
  { th: 22, title: 'Phân bổ thưởng 16,5 triệu giảm giá vốn theo mã', path: '/mua-hang/thuong',
    how: 'Tiền thưởng chia theo doanh số từng mã, ghi giảm giá trị hàng nhập; giá vốn bình quân tháng tự chia cho phần còn tồn và phần đã bán',
    expected: 'Tổng phân bổ 16.500.000',
    actual: () => { const parts = allocate(16_500_000, [264e6, 176e6, 110e6]); return `${parts.map(v).join(' + ')} = ${v(parts.reduce((a, b) => a + b, 0))}`; } },
  { th: 23, title: 'Đổi / trả hàng NCC (cùng mã, khác mã, khác giá trị)', path: '/mua-hang/chung-tu',
    how: 'Phiếu đổi có dòng trả đi / nhận về, gắn phiếu gốc; chênh lệch chọn: bù trừ công nợ / trả thêm / NCC hoàn tiền',
    expected: 'Chênh lệch 1.000.000 + VAT 80.000',
    actual: () => { const x = computeDoc(doc([line(V, 10, 500_000, { dir: 'out' }), line(G, 12, 500_000, { dir: 'in' })], { kind: 'exchange', priceIncludesVat: false }), []).exchange!; return `Trả ${v(x.outBeforeTax)} · nhận ${v(x.inBeforeTax)} · chênh ${v(x.inBeforeTax - x.outBeforeTax)} + VAT ${v(x.inTax - x.outTax)}`; } },
  { th: 24, title: 'Nhập-xuất-tồn & công nợ theo ngành → nhóm → mã', path: '/bao-cao/nhap-xuat-ton',
    how: 'Danh mục hàng theo ngành → nhóm → mã + báo cáo nhập xuất tồn có sẵn (ACC83); phiếu mua duyệt là vào kho, vào báo cáo' },
  { th: 25, title: 'Giá thực tế từng dòng sau CK, quà, chi phí, thưởng', path: '/mua-hang/phan-bo',
    how: 'Giá thực tế = giá sau CK − quà chia giá + chi phí phân bổ − thưởng phân bổ; tổng khớp chứng từ',
    expected: 'Anlene Gold: 480.000 + 9.600 phí = 489.600/lon',
    actual: () => { const parts = allocate(10_000_000, [240e6, 160e6, 100e6]); return `Anlene Gold: ${v(480_000)} + ${v(parts[0]! / 500)} phí = ${v(480_000 + parts[0]! / 500)}/lon`; } },
];

/** Mọi con số tài liệu ghi đều có trong kết quả (bỏ dấu chấm nghìn) → khớp. */
export function numbersMatch(expected: string, actual: string): boolean {
  const nums = (s: string) => (s.match(/\d[\d.]*\d|\d/g) ?? []).map((x) => x.replace(/\./g, ''));
  const got = new Set(nums(actual));
  return nums(expected).every((n) => got.has(n));
}

/** Chạy cả 25 tình huống. */
export function runScenarios() {
  return SCENARIOS.map((s) => {
    let result = '';
    try { result = s.actual?.() ?? ''; } catch (e) { result = `Lỗi: ${(e as Error).message}`; }
    return { ...s, result, ok: s.expected && s.actual ? numbersMatch(s.expected, result) : undefined };
  });
}
