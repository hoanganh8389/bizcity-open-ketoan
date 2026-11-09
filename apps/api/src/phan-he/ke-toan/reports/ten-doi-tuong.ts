// @bizcity-layer D modules/ke-toan
// [2026-11-09 09:33 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-19 đợt 2a: tên đối tượng hiệu lực tại một ngày cho tiêu đề báo cáo (36 §2)
/**
 * TÊN ĐỐI TƯỢNG TẠI MỘT NGÀY cho TIÊU ĐỀ / DÒNG TỔNG HỢP của báo cáo "đến ngày D" (công nợ, số dư, đối chiếu): báo cáo nói về tình hình
 * tại D thì gọi đối tượng bằng tên đúng tại D, không phải tên của hôm nay. Nguồn sự thật là `entity_attributes` (0087), tra bằng
 * `bizcity_entity_attr_at` (cùng quy tắc với `resolveEntity`: bản hiệu lực tại ngày; ngày cũ hơn bản đầu → bản đầu).
 * Chưa có bản nào (đối tượng có trước khi có bảng và điền sót) thì dùng tên hiện tại trên bảng `partners`.
 *
 * Tên của TỪNG CHỨNG TỪ / dòng sổ là chuyện khác: dùng `partner_name` lúc ghi (đợt 2b, cần cập nhật khung nhìn bizcity_read.*).
 */
import { sql } from 'kysely';
import { db } from '../../../db/client.js';

export interface PartnerAt { id: string; code: string; name: string }

/** Mã và tên của các đối tượng `ids` tại ngày `asOf` (YYYY-MM-DD). Đối tượng không có trong đơn vị thì không có trong kết quả. */
export async function partnerNamesAt(tenantId: string, ids: readonly string[], asOf: string): Promise<Map<string, PartnerAt>> {
  const out = new Map<string, PartnerAt>();
  if (!ids.length) return out;
  const r = await sql<PartnerAt>`
    SELECT p.id::text AS id, p.code, COALESCE((bizcity_entity_attr_at(p.tenant_id, 'partner', p.id, ${asOf}::date)).name, p.name) AS name
      FROM partners p
     WHERE p.tenant_id = ${tenantId} AND p.id IN (${sql.join(ids.map((v) => sql`${v}::bigint`))})`.execute(db);
  for (const x of r.rows) out.set(x.id, x);
  return out;
}
