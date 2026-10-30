#!/usr/bin/env node
// [2026-10-30 09:40 PM Johnny Chu - Chu Hoàng Anh] R-SIG — công cụ in dấu thay đổi đúng khuôn, đúng giờ địa phương, đúng cú pháp chú thích của tệp.
/**
 * In một dòng dấu thay đổi R-SIG (docs/rules/RULE-SIGNATURE.md) để dán vào chỗ đổi — đúng giờ địa phương, đúng cú pháp chú thích.
 *
 *   node scripts/ky-dau.mjs PHASE-011 "defineModule: ctx.data, ctx.events cho module"                 # dạng // (TS / JS)
 *   node scripts/ky-dau.mjs PHASE-011 "bảng mod_hop_dong_schedules" --file db/migrations/0042_x.sql   # dạng -- (SQL)
 *   BIZCITY_STAMP_AUTHOR="Nguyễn Văn A" node scripts/ky-dau.mjs PHASE-011 "…"                          # người chỉ đạo khác (R-SIG-7)
 *
 * Người mặc định: Johnny Chu - Chu Hoàng Anh (chủ dự án). Không bao giờ đặt tên agent / model (R-SIG-4).
 */
const OWNER = 'Johnny Chu - Chu Hoàng Anh';
const args = process.argv.slice(2);
const fileAt = args.indexOf('--file');
const file = fileAt >= 0 ? args[fileAt + 1] : '';
const rest = fileAt >= 0 ? args.filter((_, i) => i !== fileAt && i !== fileAt + 1) : args;
const [code, ...desc] = rest;
if (!code || !desc.length) {
  console.error('Dùng: node scripts/ky-dau.mjs <MÃ phase / luật> "<mô tả>" [--file <tệp>]');
  process.exit(2);
}
const author = process.env.BIZCITY_STAMP_AUTHOR?.trim() || OWNER;
if (/\b(claude|copilot|codex|cursor|gpt|chatgpt|gemini|openai|anthropic)\b/i.test(author)) {
  console.error('Người trong dấu là người chỉ đạo thay đổi, không phải agent / model (R-SIG-4).');
  process.exit(2);
}
const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true,
}).formatToParts(new Date()).map((x) => [x.type, x.value]));
const body = `[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()} ${author}] ${code} — ${desc.join(' ')}`;
const line = /\.sql$/.test(file) ? `-- ${body}`
  : /\.md$/.test(file) ? `<!-- ${body} -->`
  : /\.(sh|ya?ml|conf)$|Dockerfile/.test(file) ? `# ${body}`
  : `// ${body}`;
console.log(line);
