// @bizcity-layer P permissions
// [2026-11-07 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-3: mật khẩu công cụ dữ liệu mẫu không có giá trị mặc định trong mã (SC-SEC-5)
/**
 * MẬT KHẨU CÔNG CỤ (nạp / xoá dữ liệu tình huống, quét cha – con cả danh mục…): đọc từ biến môi trường PURCHASE_SEED_PASSWORD.
 * Không có giá trị mặc định trong mã: mật khẩu viết trong git thì ai đọc repo cũng biết. Chưa đặt biến → công cụ tắt, câu lỗi
 * nói rõ cách bật (người dùng không phải đoán). So sánh thời gian hằng để không lộ mật khẩu qua thời gian trả lời.
 */
import { timingSafeEqual } from 'node:crypto';
import { Errors } from '../errors.js';

export const TOOL_PASSWORD_ENV = 'PURCHASE_SEED_PASSWORD';

/** Công cụ đã được bật trên máy chủ này chưa (đã đặt mật khẩu công cụ). */
export const toolPasswordSet = (): boolean => Boolean(process.env[TOOL_PASSWORD_ENV]);

/** Chặn khi công cụ chưa bật hoặc mật khẩu sai. `what` là tên công cụ trong câu lỗi (vd "nạp dữ liệu"). */
export function checkToolPassword(given: string | undefined, what = 'công cụ'): void {
  const expected = process.env[TOOL_PASSWORD_ENV];
  if (!expected) {
    throw Errors.forbidden(`Công cụ ${what} đang tắt trên máy chủ này: quản trị đặt biến môi trường ${TOOL_PASSWORD_ENV} (mật khẩu công cụ) rồi khởi động lại API để bật`);
  }
  const a = Buffer.from(given ?? '', 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw Errors.forbidden(`Sai mật khẩu ${what}`);
}
