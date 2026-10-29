/**
 * Đọc số tiền thành chữ tiếng Việt (dùng trên phiếu thu, phiếu chi in ra).
 *   amountInWords(1250000) → "Một triệu hai trăm năm mươi nghìn đồng chẵn"
 */
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const UNITS = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ'];

/** Đọc một nhóm ba chữ số. `full`: nhóm không đứng đầu nên phải đọc đủ "không trăm", "lẻ". */
function readTriple(n: number, full: boolean): string {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const donvi = n % 10;
  const out: string[] = [];
  if (tram > 0 || full) out.push(`${DIGITS[tram]} trăm`);
  if (chuc > 1) {
    out.push(`${DIGITS[chuc]} mươi`);
    if (donvi === 1) out.push('mốt');
    else if (donvi === 4) out.push('tư');
    else if (donvi === 5) out.push('lăm');
    else if (donvi > 0) out.push(DIGITS[donvi]!);
  } else if (chuc === 1) {
    out.push('mười');
    if (donvi === 5) out.push('lăm');
    else if (donvi > 0) out.push(DIGITS[donvi]!);
  } else if (donvi > 0) {
    if (tram > 0 || full) out.push('lẻ');
    out.push(DIGITS[donvi]!);
  }
  return out.join(' ');
}

export function amountInWords(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return 'Không đồng';
  const groups: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    parts.push(readTriple(groups[i]!, i < groups.length - 1) + UNITS[i]);
  }
  const text = `${amount < 0 ? 'âm ' : ''}${parts.join(' ')} đồng chẵn`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
