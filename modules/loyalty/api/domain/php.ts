// [2026-11-15 03:20 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: chép nguyên từ tgs_pos_react/packages/pos-core (khớp engine PHP 14 chính sách × 400 đơn); sửa ở hai nơi phải sửa cùng (đóng góp)
// Hàm nhỏ mô phỏng đúng cách PHP ép kiểu / so sánh, để engine port ra cùng kết quả với engine PHP trên cùng dữ liệu
// admin lưu (dữ liệu thô: số có thể là chuỗi, cờ có thể là "1" / 0 / true…).

export function intval(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : 0
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const m = /^\s*([+-]?\d+)/.exec(v)
    return m ? Number(m[1]) : 0
  }
  return 0
}

export function floatval(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const m = /^\s*([+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?)/.exec(v)
    return m ? Number(m[1]) : 0
  }
  return 0
}

/** !empty($x) của PHP. */
export function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === '' || v === '0') return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'number' && Number.isNaN(v)) return false
  return true
}

export function str(v: unknown): string {
  if (v === null || v === undefined || v === false) return ''
  if (v === true) return '1'
  return String(v)
}

export const trim = (v: unknown) => str(v).trim()

/** sanitize_key của WordPress. */
export function sanitizeKey(v: unknown): string {
  return str(v)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** (array) $x ?? [] cho danh sách. */
export function list(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (isRecord(v)) return Object.values(v)
  if (v === null || v === undefined) return []
  return [v]
}

export function rec(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {}
}

/** round() của PHP: nửa xa số 0, có làm tròn trước để 1,005 → 1,01. */
export function phpRound(value: number, decimals = 0): number {
  const f = 10 ** decimals
  return (Math.round(Number((Math.abs(value) * f).toPrecision(15))) / f) * Math.sign(value)
}

/** number_format($x, 0, ',', '.') . 'đ' */
export function formatMoneyText(amount: unknown): string {
  return `${String(phpRound(Math.abs(floatval(amount)))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`.replace(/^/, floatval(amount) < 0 ? '-' : '')
}

export function formatNumberText(n: unknown): string {
  const x = floatval(n)
  if (Math.floor(x) === x) return String(Math.trunc(x))
  return phpRound(x, 2).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/** strcmp: chỉ cần dấu. */
export function strcmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Chia lấy phần nguyên xuống (intdiv / floor của PHP) cho SỐ ĐIỂM — không phải tiền (tiền làm tròn bằng roundMoney). Bản module: gom phép chia điểm về đây. */
export const floorDiv = (a: number, b: number): number => Math.floor(a / b)
