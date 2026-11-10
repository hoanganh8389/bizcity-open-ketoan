import { readFileSync } from 'node:fs';
// 'docs/standard/chi-chu-thich.json' — chú thích, không tính
const a = readFileSync('docs/standard/co-copy.json', 'utf8');
const b = readFileSync('docs/standard/thieu-copy.json', 'utf8');
const c = readFileSync('docs/thu-muc/a.yaml', 'utf8');
const d = readFileSync('docs/standard/khong-co.json', 'utf8');
export { a, b, c, d };
