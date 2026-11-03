#!/usr/bin/env node
// [2026-11-03 07:32 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — mô hình ước tính tiết kiệm thời gian và token khi dùng Core; mặc định là bảng giả định của dự án, đổi tham số hoặc nạp số đo thật bằng --input
/**
 * MÔ HÌNH ƯỚC TÍNH (không phải số đo):   node scripts/uoc-tinh-tiet-kiem.mjs [tuỳ chọn]
 *
 * Số mặc định là GIẢ ĐỊNH của dự án cho một ứng dụng quản lý kinh doanh quy mô vừa (bảng so sánh "tự xây" và "dùng Open Kế Toán").
 * Chưa có dự án thật nào được đo. Muốn số thật: ghi giờ và token từng nhóm công việc ở dự án của bạn, nạp bằng --input.
 *
 *   --rate <đồng/giờ>      chi phí developer (mặc định 300.000)
 *   --week <giờ/tuần>      giờ công một tuần (mặc định 40)
 *   --usd <đồng/USD>       tỉ giá (mặc định 26.000)
 *   --price-in <USD/triệu> giá input token (mặc định 2,5)      --price-out <USD/triệu> giá output token (mặc định 15)
 *   --realize <0..1>       phần tiết kiệm thực tế đạt được (mặc định 1 = đúng bảng giả định; 0,5 = chỉ được một nửa)
 *   --input <tệp.json>     thay toàn bộ dữ liệu: { groups: [{ name, build, core }], tokens: { build: { in, out }, core: { in, out } } } (giờ, token)
 *   --sensitivity          in lưới nhạy: chi phí developer × phần tiết kiệm đạt được
 *   --json                 in JSON
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DEFAULTS = {
  rate: 300000,
  hoursPerWeek: 40,
  usdVnd: 26000,
  priceIn: 2.5,
  priceOut: 15,
  realize: 1,
  groups: [
    { name: 'Chuẩn hoá dữ liệu ban đầu', build: 40, core: 15 },
    { name: 'Ghi nhận giao dịch và sổ sách', build: 120, core: 15 },
    { name: 'Thiết lập quy tắc ghi nhận', build: 75, core: 30 },
    { name: 'Kiểm soát sai sót và lịch sử điều chỉnh', build: 80, core: 20 },
    { name: 'Kết nối với phần mềm kinh doanh', build: 45, core: 50 },
    { name: 'Kiểm thử và đối chiếu số liệu', build: 95, core: 40 },
  ],
  tokens: { build: { in: 35e6, out: 7e6 }, core: { in: 11e6, out: 2.2e6 } },
};

/** Tính toàn bộ từ tham số. Thuần, không đọc tệp. */
export function estimate(p = DEFAULTS) {
  const q = { ...DEFAULTS, ...p };
  const groups = q.groups.map((g) => ({ ...g, avoided: g.build - g.core }));
  const build = groups.reduce((s, g) => s + g.build, 0);
  const core = groups.reduce((s, g) => s + g.core, 0);
  const avoided = build - core;
  const realizedHours = avoided * q.realize;
  const apiUsd = (t) => (t.in / 1e6) * q.priceIn + (t.out / 1e6) * q.priceOut;
  const usdBuild = apiUsd(q.tokens.build);
  const usdCore = apiUsd(q.tokens.core);
  const tokenSavingVnd = (usdBuild - usdCore) * q.usdVnd * q.realize;
  const hoursValueVnd = realizedHours * q.rate;
  return {
    params: { rate: q.rate, hoursPerWeek: q.hoursPerWeek, usdVnd: q.usdVnd, priceIn: q.priceIn, priceOut: q.priceOut, realize: q.realize },
    groups,
    hours: { build, core, avoided, realized: realizedHours, weeks: realizedHours / q.hoursPerWeek },
    tokens: {
      build: { ...q.tokens.build, total: q.tokens.build.in + q.tokens.build.out },
      core: { ...q.tokens.core, total: q.tokens.core.in + q.tokens.core.out },
      usdBuild, usdCore, vndBuild: usdBuild * q.usdVnd, vndCore: usdCore * q.usdVnd,
    },
    value: { hoursVnd: hoursValueVnd, tokensVnd: tokenSavingVnd, totalVnd: hoursValueVnd + tokenSavingVnd, tokenShare: tokenSavingVnd / (hoursValueVnd + tokenSavingVnd) },
  };
}

/** Lưới nhạy: giá trị tổng (đồng) theo chi phí developer và phần tiết kiệm đạt được. */
export function sensitivity(p = DEFAULTS, rates = [150000, 300000, 500000], realizes = [1, 0.6, 0.3]) {
  return realizes.map((realize) => ({ realize, byRate: rates.map((rate) => ({ rate, totalVnd: estimate({ ...p, rate, realize }).value.totalVnd })) }));
}

const n = (v, d = 0) => Number(v).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });

export function format(e, withSensitivity, base) {
  const L = [];
  L.push('MÔ HÌNH ƯỚC TÍNH, không phải số đo' + (e.params.realize !== 1 ? ` (đạt ${n(e.params.realize * 100)}% tiết kiệm theo bảng)` : ''));
  L.push('', 'Thời gian (giờ)'.padEnd(46) + 'Tự xây'.padStart(8) + 'Dùng Core'.padStart(11) + 'Tránh được'.padStart(12));
  for (const g of e.groups) L.push(`  ${g.name.padEnd(44)}${n(g.build).padStart(8)}${n(g.core).padStart(11)}${n(g.avoided).padStart(12)}`);
  L.push(`  ${'Tổng'.padEnd(44)}${n(e.hours.build).padStart(8)}${n(e.hours.core).padStart(11)}${n(e.hours.avoided).padStart(12)}`);
  L.push(`  Quy ra ${n(e.hours.realized, 1)} giờ thực tế = ${n(e.hours.weeks, 1)} tuần công (${e.params.hoursPerWeek} giờ/tuần)`);
  L.push('', `Token AI (giá giả định ${n(e.params.priceIn, 2)} USD/triệu input, ${n(e.params.priceOut)} USD/triệu output, ${n(e.params.usdVnd)} đồng/USD)`);
  L.push(`  Tự xây     ${n(e.tokens.build.in / 1e6, 1)} triệu input + ${n(e.tokens.build.out / 1e6, 1)} triệu output = ${n(e.tokens.build.total / 1e6, 1)} triệu → ${n(e.tokens.vndBuild)} đồng`);
  L.push(`  Dùng Core  ${n(e.tokens.core.in / 1e6, 1)} triệu input + ${n(e.tokens.core.out / 1e6, 1)} triệu output = ${n(e.tokens.core.total / 1e6, 1)} triệu → ${n(e.tokens.vndCore)} đồng`);
  L.push('', 'Giá trị ước tính cho một dự án');
  L.push(`  Công phát triển không phải làm lại: ${n(e.hours.realized, 1)} giờ × ${n(e.params.rate)} = ${n(e.value.hoursVnd)} đồng`);
  L.push(`  Phí API giảm:                       ${n(e.value.tokensVnd)} đồng`);
  L.push(`  Tổng:                               ${n(e.value.totalVnd)} đồng   (token chiếm ${n(e.value.tokenShare * 100, 1)}%)`);
  if (withSensitivity) {
    L.push('', 'Lưới nhạy: tổng giá trị (triệu đồng) theo phần tiết kiệm đạt được và chi phí developer');
    const grid = sensitivity(base);
    L.push(`  ${'đạt \\ đồng/giờ'.padEnd(16)}${grid[0].byRate.map((c) => n(c.rate).padStart(12)).join('')}`);
    for (const r of grid) L.push(`  ${`${n(r.realize * 100)}%`.padEnd(16)}${r.byRate.map((c) => n(c.totalVnd / 1e6, 1).padStart(12)).join('')}`);
  }
  return L.join('\n');
}

function main(argv) {
  const get = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const num = (name, key) => {
    const v = get(name);
    if (v === undefined) return {};
    const x = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(x) || x < 0) { process.stderr.write(`✘ ${name} phải là số không âm, nhận "${v}"\n`); process.exit(2); }
    return { [key]: x };
  };
  let p = { ...num('--rate', 'rate'), ...num('--week', 'hoursPerWeek'), ...num('--usd', 'usdVnd'), ...num('--price-in', 'priceIn'), ...num('--price-out', 'priceOut'), ...num('--realize', 'realize') };
  if (p.realize > 1) { process.stderr.write('✘ --realize phải trong khoảng 0..1\n'); process.exit(2); }
  const file = get('--input');
  if (file) {
    try { p = { ...JSON.parse(readFileSync(file, 'utf8')), ...p }; } catch (err) { process.stderr.write(`✘ không đọc được ${file}: ${err.message}\n`); process.exit(2); }
  }
  const e = estimate(p);
  process.stdout.write(`${argv.includes('--json') ? JSON.stringify({ ...e, sensitivity: argv.includes('--sensitivity') ? sensitivity(p) : undefined }, null, 2) : format(e, argv.includes('--sensitivity'), p)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
