// [2026-11-01 09:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W1: kho mã tra cứu của tab: vài lỗi API gần nhất cho khay Mã tra cứu (D019-6).
/**
 * Kho lỗi API gần nhất của tab (PHASE-019 W1). Hàm đọc mã / dựng nội dung Chép, Báo lỗi ở `@ketoan/contracts` (ma-tra-cuu.ts) —
 * chỉ gồm mã, không dữ liệu. Không lưu localStorage: mã thuộc phiên làm việc, đóng tab là hết.
 */
import type { LoiTraCuu } from '@ketoan/contracts';

export { docMaTuPhanHoi, loaiLoi, moTaLyDo, noiDungBaoLoi, noiDungChep, tomTatMa, type LoiTraCuu, type PhienBan } from '@ketoan/contracts';

const MAX = 5;
let gan: LoiTraCuu[] = [];
const nghe = new Set<() => void>();

export const khoMaTraCuu = {
  ghi(e: LoiTraCuu) {
    gan = [e, ...gan].slice(0, MAX);
    nghe.forEach((f) => f());
  },
  ds: (): readonly LoiTraCuu[] => gan,
  xoa() {
    gan = [];
    nghe.forEach((f) => f());
  },
  nghe(f: () => void) {
    nghe.add(f);
    return () => { nghe.delete(f); };
  },
};
