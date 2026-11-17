// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: ngày làm việc giờ Việt Nam (đóng góp)
/** Ngày làm việc theo giờ Việt Nam (UTC+7). */
export function todayVn(now = Date.now()): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
}
