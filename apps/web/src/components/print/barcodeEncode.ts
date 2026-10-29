/**
 * Mã hoá mã vạch không cần thư viện: Code 128 (bộ B, tự chuyển sang bộ C cho đoạn số dài) và EAN-13.
 * Kết quả là dãy độ rộng vạch / khoảng trắng xen kẽ, bắt đầu bằng vạch, đơn vị = 1 module (barcode.tsx vẽ ra SVG).
 */

/** Bảng mẫu Code 128: giá trị 0..106, mỗi mẫu 6 độ rộng (11 module); 106 là mã dừng (7 độ rộng, 13 module). */
const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104, START_C = 105, CODE_B = 100, CODE_C = 99, STOP = 106;

/** Số chữ số liền nhau bắt đầu từ vị trí i. */
const digitRun = (s: string, i: number) => { let n = 0; while (i + n < s.length && /\d/.test(s.charAt(i + n))) n++; return n; };

/**
 * Các giá trị ký hiệu Code 128 (gồm mã bắt đầu, chưa gồm ký tự kiểm tra và mã dừng).
 * Bộ B cho chữ; đoạn ≥ 4 số chẵn ở đầu / cuối hoặc ≥ 6 số ở giữa thì sang bộ C (2 số một ký hiệu) cho mã ngắn hơn.
 * Ký tự ngoài ASCII 32..126 (dấu tiếng Việt…) không mã hoá được → thay bằng "?".
 */
export function code128Values(text: string): number[] {
  const s = [...text].map((ch) => (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126 ? ch : '?')).join('');
  const out: number[] = [];
  let set: 'B' | 'C' | null = null;
  let i = 0;
  while (i < s.length) {
    const run = digitRun(s, i);
    const atStart = i === 0, atEnd = i + run === s.length;
    const useC = run >= 2 && (set === 'C' || (atStart && atEnd ? run >= 4 || (run === 2 && s.length === 2) : (atStart || atEnd) ? run >= 4 : run >= 6));
    if (useC) {
      // Số lẻ chữ số: chữ số đầu đi bộ B (khi đang ở đầu mã) hoặc chữ số cuối để lại cho bộ B.
      let n = run - (run % 2);
      if (run % 2 && set !== 'C' && atStart) {
        out.push(START_B); set = 'B';
        out.push(s.charCodeAt(i) - 32); i++;
        n = run - 1;
      }
      if (set !== 'C') { out.push(set === null ? START_C : CODE_C); set = 'C'; }
      for (let k = 0; k < n; k += 2) out.push(Number(s.slice(i + k, i + k + 2)));
      i += n;
      continue;
    }
    if (set !== 'B') { out.push(set === null ? START_B : CODE_B); set = 'B'; }
    out.push(s.charCodeAt(i) - 32);
    i++;
  }
  if (set === null) out.push(START_B);
  return out;
}

/** Ký tự kiểm tra Code 128: (mã bắt đầu + Σ giá trị × vị trí) mod 103. */
export function code128Check(values: number[]): number {
  return values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103;
}

/** Độ rộng vạch Code 128 trọn (bắt đầu … kiểm tra, dừng), không gồm vùng lặng. */
export function code128Widths(text: string): number[] {
  const v = code128Values(text);
  return [...v, code128Check(v), STOP].flatMap((x) => [...C128[x]!].map(Number));
}

const EAN_L = ['3211', '2221', '2122', '1411', '1132', '1231', '1114', '1312', '1213', '3112'];
/** Chẵn lẻ 6 chữ số bên trái theo chữ số đầu (L = lẻ, G = chẵn). */
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** Chữ số kiểm tra EAN-13 của 12 chữ số đầu. */
export function ean13CheckDigit(d12: string): number {
  const s = [...d12].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  return (10 - (s % 10)) % 10;
}
export const isEan13 = (s: string) => /^\d{13}$/.test(s) && ean13CheckDigit(s.slice(0, 12)) === Number(s[12]);

/**
 * Độ rộng EAN-13: bắt đầu 101, 6 số trái (mẫu L / G), giữa 01010, 6 số phải (mẫu R), kết thúc 101.
 * Mẫu L, R cùng độ rộng (R là nghịch màu của L); G là L đảo ngược. Phần trái mỗi số bắt đầu bằng khoảng trắng,
 * nên độ rộng ghép theo thứ tự trắng/đen — trả về dãy bắt đầu bằng vạch như Code 128.
 */
export function ean13Widths(code: string): number[] {
  const d = [...code].map(Number);
  const parity = EAN_PARITY[d[0]!]!;
  const w: number[] = [1, 1, 1];
  for (let i = 1; i <= 6; i++) { const p = EAN_L[d[i]!]!; w.push(...[...(parity[i - 1] === 'G' ? [...p].reverse().join('') : p)].map(Number)); }
  w.push(1, 1, 1, 1, 1);
  for (let i = 7; i <= 12; i++) w.push(...[...EAN_L[d[i]!]!].map(Number));
  w.push(1, 1, 1);
  return w;
}

/** Dãy 0/1 từng module (1 = vạch) từ dãy độ rộng bắt đầu bằng vạch — để kiểm tra, vẽ. */
export const toModules = (w: number[]) => w.map((n, i) => (i % 2 ? '0' : '1').repeat(n)).join('');
