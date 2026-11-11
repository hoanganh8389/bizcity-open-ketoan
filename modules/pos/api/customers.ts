/**
 * Khách hàng cho máy bán (kế hoạch module POS đợt W2, S-MP-10): đọc danh mục đối tượng qua bizcity_read.partners (RLS theo đơn
 * vị), số đơn / lần mua gần nhất đếm từ mod_pos.orders. Khách mới đi kèm đơn (Core tự thêm theo partner của chứng từ sale).
 */
import { sql, type ActionContext } from '@bizcity/module-sdk';

type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

export type Customer = {
  id: string; name: string; phone: string; address: string; taxCode: string; email: string;
  orderCount: number; lastOrderAt: string | null;
};

type Row = { code: string; name: string; phone: string | null; mobile: string | null; address: string | null; tax_code: string | null; email: string | null };

/** Bỏ dấu tiếng Việt, chữ thường (tìm tên không dấu). */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

async function withOrders(tx: Tx, rows: Row[]): Promise<Customer[]> {
  if (!rows.length) return [];
  const stats = new Map((await sql<{ customer_code: string; n: string; last: string | null }>`
    SELECT customer_code, count(*) AS n, max(created_at)::text AS last FROM mod_pos.orders
     WHERE status = 'completed' AND customer_code IN (${sql.join(rows.map((r) => r.code))}) GROUP BY customer_code`.execute(tx)).rows
    .map((r) => [r.customer_code, r]));
  return rows.map((r) => ({
    id: r.code, name: r.name, phone: r.mobile ?? r.phone ?? '', address: r.address ?? '', taxCode: r.tax_code ?? '', email: r.email ?? '',
    orderCount: Number(stats.get(r.code)?.n ?? 0), lastOrderAt: stats.get(r.code)?.last ?? null,
  }));
}

const COLS = sql`code, name, phone, mobile, address, tax_code, email`;
const ACTIVE_CUSTOMER = sql`is_active IS NOT FALSE AND (kind = 'customer' OR 'customer' = ANY(coalesce(also_kinds, ARRAY[]::text[])))`;

/**
 * Tìm khách: q rỗng → khách mua gần nhất ở máy bán; q có ≥ 3 chữ số → khớp một phần SĐT, SĐT trùng đúng đứng đầu; còn lại → tên
 * (không dấu, đủ mọi từ) hoặc mã. Tối đa 20.
 */
export async function searchCustomers(tx: Tx, q: string): Promise<Customer[]> {
  const digits = q.replace(/\D/g, '');
  if (!q.trim()) {
    const recent = (await sql<{ customer_code: string }>`
      SELECT customer_code FROM mod_pos.orders WHERE customer_code IS NOT NULL AND status = 'completed'
       GROUP BY customer_code ORDER BY max(created_at) DESC LIMIT 20`.execute(tx)).rows.map((r) => r.customer_code);
    if (!recent.length) return [];
    const rows = (await sql<Row>`SELECT ${COLS} FROM bizcity_read.partners WHERE ${ACTIVE_CUSTOMER} AND code IN (${sql.join(recent)})`.execute(tx)).rows;
    const order = new Map(recent.map((c, i) => [c, i]));
    return withOrders(tx, rows.sort((a, b) => order.get(a.code)! - order.get(b.code)!));
  }
  if (digits.length >= 3 && digits.length >= q.replace(/\s/g, '').length - 1) {
    const like = `%${digits}%`;
    const rows = (await sql<Row>`
      SELECT ${COLS} FROM bizcity_read.partners
       WHERE ${ACTIVE_CUSTOMER} AND (regexp_replace(coalesce(mobile, ''), '\\D', '', 'g') LIKE ${like} OR regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE ${like})
       ORDER BY (regexp_replace(coalesce(mobile, phone, ''), '\\D', '', 'g') = ${digits}) DESC, name LIMIT 20`.execute(tx)).rows;
    return withOrders(tx, rows);
  }
  const patterns = fold(q).split(/\s+/).filter(Boolean).map((w) => `%${w}%`);
  const rows = (await sql<Row>`
    SELECT ${COLS} FROM bizcity_read.partners
     WHERE ${ACTIVE_CUSTOMER} AND (code ILIKE ${`%${q.trim()}%`} OR translate(lower(name), ${VN_FROM}, ${VN_TO}) LIKE ALL (${patterns}::text[]))
     ORDER BY name LIMIT 20`.execute(tx)).rows;
  return withOrders(tx, rows);
}

/** Bảng bỏ dấu cho translate() của PostgreSQL (khung nhìn không có cột tên không dấu, không cần extension unaccent). */
const VN_FROM = 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ';
const VN_TO = [...VN_FROM].map(fold).join('');

export async function customerByPhone(tx: Tx, phone: string): Promise<Customer | null> {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9) return null;
  const rows = (await sql<Row>`
    SELECT ${COLS} FROM bizcity_read.partners
     WHERE ${ACTIVE_CUSTOMER} AND (code = ${digits} OR regexp_replace(coalesce(mobile, ''), '\\D', '', 'g') = ${digits} OR regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = ${digits})
     ORDER BY (code = ${digits}) DESC LIMIT 1`.execute(tx)).rows;
  return (await withOrders(tx, rows))[0] ?? null;
}

export async function customerByCode(tx: Tx, code: string): Promise<Customer | null> {
  const rows = (await sql<Row>`SELECT ${COLS} FROM bizcity_read.partners WHERE code = ${code} LIMIT 1`.execute(tx)).rows;
  return (await withOrders(tx, rows))[0] ?? null;
}
