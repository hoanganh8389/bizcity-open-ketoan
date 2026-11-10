#!/usr/bin/env node
// [2026-11-10 10:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-53: sinh bộ dữ liệu gốc giả lập cho db/seeds (thay dữ liệu thật của một công ty; chữ chốt PHASE-030 · 26 §11.2)
/**
 * Bộ dữ liệu gốc GIẢ LẬP cho db/seeds/ — 11 tệp định danh / tổ chức / mặt hàng (PHASE-030 · 26 §11.2, S030-53).
 * Repo công khai: không tên người, công ty, MST, số tài khoản, địa chỉ, số điện thoại thật. MST dạng 0000…, số tài khoản 9999…,
 * điện thoại 0900…, tên "… Mẫu NN". Tất định: cùng script → cùng tệp (không ngẫu nhiên, không ngày giờ chạy).
 *
 * Giữ các quy ước mà Kernel / test đang dựa vào: mã chi nhánh 5 số + đuôi Plus / Premium / _OFF (_OFF luôn ngừng dùng);
 * bộ phận cửa hàng = BH + 5 số đầu; chi nhánh xx000 nhận hàng cho nút cấp 2; cây sơ đồ tổ chức một gốc "Công ty";
 * ngân hàng có tài khoản 112… chưa có trong hệ thống tài khoản; các mã mà hinh-thuc-thanh-toan.jsonl trỏ tới; mã test
 * (apps/api/test/default-data.test.ts, so-do-to-chuc.test.ts, các test mua hàng dùng mã hàng có sẵn).
 *
 * Dữ liệu thật của công ty: chép thư mục db/seeds/ của commit trước đợt này ra ngoài repo, đặt SEEDS_DIR (db/seeds/README.md).
 *
 *   node scripts/du-lieu-mau/sinh-seeds.mjs          ghi 11 tệp vào db/seeds/
 *   node scripts/du-lieu-mau/sinh-seeds.mjs --kiem   chỉ so: tệp trong db/seeds/ khác bản sinh → mã thoát 1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEEDS = path.join(ROOT, 'db/seeds');
const pad = (n, w = 2) => String(n).padStart(w, '0');
const NGUON = 'gia-lap';
const CONG_TY = 'Công ty CP Mẫu Bizcity';
const MST_CTY = '0000000001';

// Đọc dòng mô tả hiện có để giữ nguyên _mo_ta, _cot (khuôn tệp không đổi); thêm _nguon.
function header(file, fallback) {
  const p = path.join(SEEDS, file);
  let h = fallback;
  if (fs.existsSync(p)) {
    const first = JSON.parse(fs.readFileSync(p, 'utf8').split('\n')[0]);
    if (first._bang) h = { _bang: first._bang, _mo_ta: first._mo_ta, _cot: first._cot };
  }
  return { ...h, _nguon: NGUON };
}
const out = {};
const put = (file, rows) => {
  const h = header(file);
  const cols = h._cot;
  out[file] = [h, ...rows.map((r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])))];
};

// ── Sơ đồ tổ chức: Công ty → Miền → Chi nhánh (cấp 2) → Tỉnh (cấp 3) ─────────────────────────
const NODES = [
  ['Công ty', 'Công ty', null, ''],
  ['BAC', 'Miền Bắc', 'Công ty', '12'],
  ['NAM', 'Miền Nam', 'Công ty', '34'],
  ['HOCTY', 'Văn phòng công ty', 'BAC', ''],
  ['ND', 'Chi nhánh Nam Định', 'BAC', ''],
  ['NDH', 'Cửa hàng tại Nam Định', 'ND', ''],
  ['TBH', 'Cửa hàng tại Thái Bình', 'ND', ''],
  ['PT', 'Chi nhánh Phú Thọ', 'BAC', ''],
  ['PTO', 'Cửa hàng tại Phú Thọ', 'PT', ''],
  ['LCI', 'Cửa hàng tại Lào Cai', 'PT', '26000'],
  ['YBI', 'Cửa hàng tại Yên Bái', 'PT', ''],
  ['HN', 'Chi nhánh Hà Nội', 'BAC', ''],
  ['HNI', 'Cửa hàng tại Hà Nội', 'HN', ''],
  ['HCM', 'Chi nhánh Hồ Chí Minh', 'NAM', ''],
  ['HCM1', 'Cửa hàng tại TP Hồ Chí Minh', 'HCM', ''],
  ['BDG', 'Cửa hàng tại Bình Dương', 'HCM', ''],
];
put('so-do-to-chuc.jsonl', NODES.map(([code, name, parent_code, short_code]) => ({ code, name, parent_code, short_code, alias: '', note: '' })));

// ── Chi nhánh: [mã, tên, nút sơ đồ, đang dùng] — 2 số đầu = tỉnh, xx000 = chi nhánh nhận hàng ───────
const BRANCHES = [
  ['00000', 'Văn phòng công ty', 'HOCTY'],
  ['00001Premium', 'Cửa hàng Mẫu Hoàn Kiếm', 'HNI'], ['00002Plus', 'Cửa hàng Mẫu Ba Đình', 'HNI'], ['00003_OFF', 'Cửa hàng Mẫu Đống Đa (đã đóng)', null],
  ['14000', 'Chi nhánh Hà Nội', 'HNI'], ['14051', 'Cửa hàng Mẫu Cầu Giấy', 'HNI'], ['14052Premium', 'Cửa hàng Mẫu Thanh Xuân', 'HNI'], ['14053', 'Cửa hàng Mẫu Long Biên', 'HNI'],
  ['01000', 'Chi nhánh Nam Định', 'NDH'], ['01001', 'Cửa hàng Mẫu Nam Định 1', 'NDH'], ['01002Plus', 'Cửa hàng Mẫu Nam Định 2', 'NDH'], ['01014Premium', 'Cửa hàng Mẫu Hải Hậu', 'NDH'], ['01015_OFF', 'Cửa hàng Mẫu Giao Thủy (đã đóng)', null],
  ['02001', 'Cửa hàng Mẫu Thái Bình 1', 'TBH'], ['02002Plus', 'Cửa hàng Mẫu Thái Bình 2', 'TBH'],
  ['08000', 'Chi nhánh Phú Thọ', 'PTO'], ['08001', 'Cửa hàng Mẫu Việt Trì 1', 'PTO'], ['08002Plus', 'Cửa hàng Mẫu Việt Trì 2', 'PTO'], ['08014Premium', 'Cửa hàng Mẫu Lâm Thao', 'PTO'], ['08015Plus', 'Cửa hàng Mẫu Phù Ninh', 'PTO'], ['08016_OFF', 'Cửa hàng Mẫu Thanh Ba (đã đóng)', null],
  ['26000', 'Văn phòng Lào Cai', 'LCI'], ['26001Premium', 'Cửa hàng Mẫu Bảo Hà', 'LCI'], ['26002', 'Cửa hàng Mẫu Sa Pa', 'LCI'],
  ['18001', 'Cửa hàng Mẫu Yên Bái 1', 'YBI'], ['18002Plus', 'Cửa hàng Mẫu Yên Bái 2', 'YBI'],
  ['30000', 'Chi nhánh Hồ Chí Minh', 'HCM1'], ['30001', 'Cửa hàng Mẫu Quận 1', 'HCM1'], ['30002Plus', 'Cửa hàng Mẫu Quận 3', 'HCM1'], ['30003_OFF', 'Cửa hàng Mẫu Quận 5 (đã đóng)', null],
  ['31001', 'Cửa hàng Mẫu Thủ Dầu Một', 'BDG'], ['31002Premium', 'Cửa hàng Mẫu Dĩ An', 'BDG'],
];
const prefix = (c) => c.slice(0, 5);
const isOff = (c) => c.endsWith('_OFF');
const isHub = (c) => /^\d{2}000$/.test(c);
put('chi-nhanh.jsonl', BRANCHES.map(([code, name], i) => ({
  code, name, address: `Số ${i + 1} đường Mẫu, ${name.replace(/^Cửa hàng Mẫu |^Chi nhánh |^Văn phòng /, '').replace(/ \(đã đóng\)$/, '')}`,
  department_code: `BH${prefix(code)}`, is_active: !isOff(code), note: '', company_name: CONG_TY,
  tax_code: code === '00000' ? MST_CTY : `${MST_CTY}-${pad(i, 3)}`, phone: `0900000${pad(i, 3)}`, fax: '',
})));
put('so-do-to-chuc-gan.jsonl', BRANCHES.filter(([, , org]) => org).map(([branch_code, , org_code]) => ({ branch_code, org_code })));

// ── Bộ phận: khối, phòng ban, mỗi cửa hàng một bộ phận BH + 5 số ─────────────────────────────
const DEPTS = [
  ['BGD', 'Ban giám đốc', null], ['KD', 'Khối kinh doanh', null], ['BH', 'Bán hàng', 'KD'], ['MH', 'Mua hàng', 'KD'], ['MKT', 'Marketing', 'KD'],
  ['VP', 'Khối văn phòng', null], ['KT', 'Kế toán', 'VP'], ['HCNS', 'Hành chính nhân sự', 'VP'], ['IT', 'Công nghệ thông tin', 'VP'], ['KHO', 'Kho vận', 'VP'],
];
const seenDept = new Set();
const shopDepts = BRANCHES.map(([c, n]) => [prefix(c), n]).filter(([p]) => !seenDept.has(p) && seenDept.add(p))
  .map(([p, n]) => [`BH${p}`, n.replace(/ \(đã đóng\)$/, ''), 'BH']);
put('bo-phan.jsonl', [...DEPTS, ...shopDepts].map(([code, name, parent_code]) => ({ code, name, parent_code, address: '', phone: '', note: '', is_active: true })));

// ── Kho: chi nhánh xx000 có kho hàng / khuyến mại / công cụ; cửa hàng một kho mặc định (mã = mã chi nhánh) ──
const WH = [];
for (const [code, name] of BRANCHES) {
  const p2 = code.slice(0, 2);
  if (isHub(code)) {
    WH.push({ code: `${p2}-HH`, branch_code: code, name: 'Kho hàng', is_default: true, is_promo: false });
    WH.push({ code: `${p2}-KM`, branch_code: code, name: 'Kho khuyến mại', is_default: false, is_promo: true });
    WH.push({ code: `${p2}-CC`, branch_code: code, name: 'Kho công cụ dụng cụ', is_default: false, is_promo: false });
  } else {
    WH.push({ code: prefix(code), branch_code: code, name: `Kho ${name.replace(/ \(đã đóng\)$/, '')}`, is_default: true, is_promo: false, is_active: !isOff(code) });
  }
}
put('kho.jsonl', WH.map((w) => ({ code: w.code, branch_code: w.branch_code, name: w.name, address: '', is_active: w.is_active ?? true, is_default: w.is_default, is_promo: w.is_promo, account: '', note: '' })));

// ── Nhân viên ────────────────────────────────────────────────────────────────────────────────
const POS = ['Kế toán trưởng', 'Kế toán tổng hợp', 'Kế toán thuế', 'Kế toán kho', 'Kế toán công nợ', 'Thủ quỹ', 'Nhân viên mua hàng', 'Quản lý cửa hàng', 'Nhân viên bán hàng'];
const shops = BRANCHES.filter(([c]) => !isOff(c)).map(([c]) => c);
const EMP = Array.from({ length: 45 }, (_, i) => ({
  code: `NV-${pad(i + 1, 3)}`, name: `Nhân viên Mẫu ${pad(i + 1)}`, parent_code: null, note: '', is_active: i !== 44,
  extra: { position: POS[i % POS.length], branchCode: i < 9 ? '00000' : shops[i % shops.length], phone: `0900100${pad(i + 1, 3)}`, email: `nv${pad(i + 1, 3)}@mau.invalid` },
}));
put('nhan-vien.jsonl', EMP);

// ── Đối tượng ────────────────────────────────────────────────────────────────────────────────
const P = [];
const partner = (code, name, kind, group_code, extra = {}) => P.push({
  code, name, kind, group_code, tax_code: null, address: '', phone: null, email: null, contact_name: '', bank_account_no: '', bank_account_holder: '', bank_name: '',
  mobile: '', fax: '', website: '', position: '', company_name: '', company_address: '', short_name: '', note: '',
  manager_code: 'NV-002', branch_code: '00000', is_active: true, created_date: '2024-01-02', created_by: 'NV-002', ...extra,
});
const company = (i, name) => ({ tax_code: `00000${pad(i, 5)}`, address: `Số ${i} phố Mẫu, Hà Nội`, phone: `0240000${pad(i, 4)}`, company_name: name, company_address: `Số ${i} phố Mẫu, Hà Nội` });
partner('00000AA00002', 'Công ty Điện lực Mẫu', 'supplier', 'NCC-TSDV', company(2, 'Công ty Điện lực Mẫu'));
partner('00000AA00003', 'Công ty Cấp nước Mẫu', 'supplier', 'NCC-TSDV', company(3, 'Công ty Cấp nước Mẫu'));
partner('00000AA00004', 'Công ty Viễn thông Mẫu', 'supplier', 'NCC-TSDV', company(4, 'Công ty Viễn thông Mẫu'));
for (let i = 1; i <= 12; i++) partner(`NCC-DV${pad(i)}`, `Công ty Dịch vụ Mẫu ${pad(i)}`, 'supplier', 'NCC-TSDV', { ...company(100 + i, `Công ty Dịch vụ Mẫu ${pad(i)}`), payment_term_days: 30 });
for (let i = 1; i <= 30; i++) partner(`NCC-HH${pad(i)}`, `Công ty TNHH Phân phối Mẫu ${pad(i)}`, 'supplier', 'NCC-HH', { ...company(200 + i, `Công ty TNHH Phân phối Mẫu ${pad(i)}`), payment_term_days: [0, 15, 30, 45][i % 4], credit_limit: 0, max_open_docs: 0 });
for (let i = 1; i <= 6; i++) partner(`CN-NHA${pad(i)}`, `Chủ nhà Mẫu ${pad(i)}`, 'supplier', 'CHU-NHA', { address: `Số ${i} ngõ Mẫu`, phone: `0900200${pad(i, 3)}` });
for (let i = 1; i <= 20; i++) partner(`KHB-${pad(i, 3)}`, `Đại lý Mẫu ${pad(i)}`, 'customer', 'KH-BUON', { ...company(300 + i, `Đại lý Mẫu ${pad(i)}`), payment_term_days: 15, credit_limit: 50000000, max_open_docs: 5, branch_code: shops[i % shops.length] });
partner('CQT-HN', 'Chi cục Thuế Mẫu', 'other', 'CQ-THUE', { tax_code: '0000099001' });
partner('CQT-KBNN', 'Kho bạc Nhà nước Mẫu', 'other', 'CQNN', { tax_code: '0000099002' });
partner('BHXH-HN', 'Bảo hiểm xã hội Mẫu', 'other', 'CQ-BHXH', { tax_code: '0000099003' });
partner('NC600000', 'Nội bộ công ty', 'internal', 'NOI-BO');
for (let i = 1; i <= 4; i++) partner(`NC60000${i}`, `Nội bộ — ${['Chi nhánh Nam Định', 'Chi nhánh Phú Thọ', 'Chi nhánh Hà Nội', 'Chi nhánh Hồ Chí Minh'][i - 1]}`, 'internal', 'NOI-BO');
partner('GV-001', 'Cổ đông Mẫu 01', 'other', 'GOP-VON');
for (const e of EMP) partner(`NVDT-${e.code.slice(3)}`, e.name, 'employee', 'NHAN-VIEN', { branch_code: e.extra.branchCode, is_active: e.is_active });
put('doi-tuong.jsonl', P);

// ── Ngân hàng: mã mà hinh-thuc-thanh-toan.jsonl trỏ tới + vài tài khoản; mỗi tài khoản đang dùng một TK 112 riêng ──
const BANK = [
  ['CPVC VTPOS', 'Ví điện tử Mẫu', '13881', true],
  ['PMH5K', 'Phiếu mua hàng Mẫu', '64184', false],
  ['NHCT06', 'Ngân hàng Mẫu A — CN Hà Nội', '11210006', true], ['NHCT07', 'Ngân hàng Mẫu A — CN Nam Định', '11210007', true],
  ['NHCT11', 'Ngân hàng Mẫu A — CN Phú Thọ', '11210010', true], ['NHCT12', 'Ngân hàng Mẫu A — CN Lào Cai', '11210012', true],
  ['NHCT14', 'Ngân hàng Mẫu A — CN Yên Bái', '11210014', true], ['NHCT15', 'Ngân hàng Mẫu A — CN Thái Bình', '11210015', true],
  ['NHSG13', 'Ngân hàng Mẫu B — CN Hồ Chí Minh', '11210504', true],
  ['NHMB01', 'Ngân hàng Mẫu C — CN Hà Nội', '11210601', true], ['NHMB02', 'Ngân hàng Mẫu C — CN Bình Dương', '11210602', true],
  ['NHCT99', 'Ngân hàng Mẫu A — tài khoản cũ', '11210099', false],
];
put('ngan-hang.jsonl', BANK.map(([code, bank_name, account_code, is_active], i) => ({
  code, bank_name, account_no: code === 'CPVC VTPOS' || code === 'PMH5K' ? code : `999900000${pad(i + 1, 3)}`, holder: CONG_TY, account_code, bank_address: '', bank_phone: '', contact: '', note: '', is_active,
})));

// ── Hợp đồng: đúng 4 ─────────────────────────────────────────────────────────────────────────
put('hop-dong.jsonl', [
  ['HD-THUE-01', 'Hợp đồng thuê kho Mẫu số 1', 'Chủ nhà Mẫu 01', '2023-01-05', 50000000],
  ['HD-THUE-02', 'Hợp đồng thuê cửa hàng Mẫu Bảo Hà', 'Chủ nhà Mẫu 02', '2023-03-01', 9000000],
  ['HD-THUE-03', 'Hợp đồng thuê văn phòng Mẫu', 'Chủ nhà Mẫu 03', '2023-06-15', 30000000],
  ['HD-THUE-04', 'Hợp đồng thuê cửa hàng Mẫu Việt Trì', 'Chủ nhà Mẫu 04', '2024-02-01', 12000000],
].map(([code, name, note, signedDate, value]) => ({ code, name, parent_code: null, note, is_active: true, extra: { type: 'rent', signedDate, value } })));

// ── Phân loại hàng + mặt hàng ──────────────────────────────────────────────────────────────
// [mã ngành, tên ngành, đơn vị, thuế ra, thuế vào, nhóm hạch toán, [mã nhãn…]]
const IND = [
  ['1', 'Sữa bột', 'Lon', 'R08', 'V08', 'NHT01', ['21', '22', '23', '24']],
  ['2', 'Sữa nước', 'Thùng', 'R08', 'V08', 'NHT01', ['31', '32', '33']],
  ['3', 'Bỉm / tã', 'Bịch', 'R08', 'V08', 'NHT01', ['41', '42', '43']],
  ['4', 'Đồ uống', 'Thùng', 'R10', 'V10', 'NHT01', ['51', '52']],
  ['5', 'Thực phẩm dinh dưỡng', 'Hộp', 'R05', 'V05', 'NHT01', ['61', '62']],
  ['18', 'Vật tư bán hàng', 'Cái', 'R08', 'V08', 'NHT03', ['180']],
];
const BRAND_NAME = (b) => (b === '180' ? 'Đồ dùng tại cửa hàng' : `Nhãn Mẫu ${b}`);
const CLS = [];
for (const [ic, iname, , , , , brands] of IND) {
  CLS.push({ kind: 'industry', code: ic, name: iname, parent_code: null, is_active: true });
  CLS.push({ kind: 'group', code: ic, name: iname, parent_code: null, is_active: true });
  for (const b of brands) {
    CLS.push({ kind: 'brand', code: b, name: BRAND_NAME(b), parent_code: ic, is_active: true });
    CLS.push({ kind: 'group', code: b, name: BRAND_NAME(b), parent_code: ic, is_active: true });
    for (let k = 1; k <= 2; k++) CLS.push({ kind: 'group', code: `${b}${k}`, name: `${BRAND_NAME(b)} — dòng ${k}`, parent_code: b, is_active: true });
  }
}
put('phan-loai-hang.jsonl', CLS);

const PROD = [];
const SIZES = ['400g', '800g', '900g', '1,7kg', '180ml', '110ml', 'M', 'L', 'XL', 'Hộp 10'];
const add = (sku, name, unit, posting_group, tax_out, tax_in, ic, b, k, note = '') => PROD.push({
  sku, name, unit, posting_group, tax_out, tax_in, group_code: `${b}${k}`, industry_code: ic, brand_code: b,
  category_path: `${IND.find((x) => x[0] === ic)[1]} / ${BRAND_NAME(b)} / dòng ${k}`, note, excise_rate: null,
});
for (const [ic, iname, unit, tout, tin, pg, brands] of IND) {
  for (const b of brands) for (let k = 1; k <= 2; k++) for (let n = 1; n <= 12; n++) {
    const sku = `9${pad(Number(ic), 2)}${pad(Number(b) % 1000, 3)}${k}${pad(n)}`;
    add(sku, `${iname} ${BRAND_NAME(b)} dòng ${k} — ${SIZES[n % SIZES.length]}`, unit, pg, tout, tin, ic, b, k);
    if (n === 1 && pg === 'NHT01') add(`${sku}M`, `KM — ${iname} ${BRAND_NAME(b)} dòng ${k}`, unit, 'NHT02', tout, tin, ic, b, k, 'Hàng khuyến mại');
  }
}
// Mã hàng test đang dùng (mã không phải dữ liệu nhạy cảm): hàng hoá NHT01, R08 / V08; 110051001M là hàng khuyến mại NHT02.
add('110051001M', 'KM — Sữa bột Nhãn Mẫu 24 dòng 1', 'Lon', 'NHT02', 'R08', 'V08', '1', '24', 1, 'Hàng khuyến mại');
for (const sku of ['100861002', '110061004', '110062006', '110063076', '110154028', '110154029', '110154035', '110154036', '130071001', '130181002', '140181001', '140181006']) {
  add(sku, `Sữa bột Nhãn Mẫu 21 — mã ${sku}`, 'Lon', 'NHT01', 'R08', 'V08', '1', '21', 1);
}
put('mat-hang-tai-khoan.jsonl', PROD);

// ── Ghi / kiểm ─────────────────────────────────────────────────────────────────────────────
const kiem = process.argv.includes('--kiem');
let lech = 0;
for (const [file, rows] of Object.entries(out)) {
  const seen = new Set();
  for (const r of rows.slice(1)) { const k = r.sku ?? (r.kind ? `${r.kind}:${r.code}` : r.code ?? `${r.branch_code}`); if (seen.has(k)) throw new Error(`${file}: trùng ${k}`); seen.add(k); }
  const text = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  const p = path.join(SEEDS, file);
  if (kiem) {
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== text) { lech++; console.log(`✘ ${file} khác bản sinh`); }
  } else fs.writeFileSync(p, text);
  console.log(`${kiem ? '·' : '✔'} ${file}: ${rows.length - 1} dòng`);
}
if (kiem && lech) { console.log(`\n${lech} tệp khác bản sinh — chạy: node scripts/du-lieu-mau/sinh-seeds.mjs`); process.exit(1); }
