/**
 * GET /api/v1/m/pos/order-lines?code=&branch= — dòng hàng của một đơn máy bán theo mã đơn (đọc): mã, SL theo ĐVT bán, tỉ lệ ĐVT, dòng quà,
 * khách. Module phieu-ban gọi (ctx.actions.call) để copy hoá đơn máy bán thành đơn đặt hàng mới (phiếu NT-BH-032 Q4) — module không
 * đọc bảng của nhau. Mã đơn chỉ duy nhất trong một cửa hàng: có ở nhiều cửa hàng mà không gửi branch → POS_BRANCH_REQUIRED.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: action đọc dòng đơn máy bán cho copy đơn (đóng góp)
import { Errors, defineAction, sql, z } from '@bizcity/module-sdk';

type Row = { order_id: string; code: string; branch_code: string; status: string; customer_code: string | null; business_date: string };
type LineRow = { line_key: string; sku: string; unit_name: string; unit_qty: string; unit_ratio: string; is_gift: boolean };

export default defineAction({
  id: 'pos.order.lines', title: 'Dòng hàng của đơn máy POS theo mã đơn (copy đơn)', tags: ['Máy bán POS'],
  permission: 'pos:report', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  // Không có mã thì trả null (hợp đồng module C-4: GET không tham số đường dẫn trả 200).
  input: z.object({ code: z.string().trim().max(64).default(''), branch: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()).nullable(),
  expose: { http: { method: 'GET', path: '/order-lines' }, mcp: false, ai: 'read' },
  handler: async (ctx, { code, branch }) => (!code ? null : ctx.data.module(async (tx) => {
    const found = (await sql<Row>`
      SELECT order_id, code, branch_code, status, customer_code, business_date::text AS business_date FROM mod_pos.orders
       WHERE code = ${code} ${branch ? sql`AND branch_code = ${branch}` : sql``} ORDER BY id LIMIT 2`.execute(tx)).rows;
    if (found.length > 1) throw Errors.validation(`Mã đơn ${code} có ở nhiều cửa hàng — chọn cửa hàng`, { reason: 'POS_BRANCH_REQUIRED' });
    const o = found[0];
    if (!o) throw Errors.notFound(`đơn máy bán ${code}`);
    // Dòng quà theo chương trình nằm ở bản gửi của máy (draft.lines[].isGift) — copy bỏ quà, khuyến mại tính lại ở đơn mới.
    const lines = (await sql<LineRow>`
      SELECT ol.line_key, ol.sku, ol.unit_name, ol.unit_qty::text AS unit_qty, ol.unit_ratio::text AS unit_ratio,
             coalesce((SELECT (x->>'isGift')::boolean FROM mod_pos.orders o, jsonb_array_elements(o.draft->'lines') x
                        WHERE o.order_id = ol.order_id AND x->>'lineId' = ol.line_key LIMIT 1), false) AS is_gift
        FROM mod_pos.order_lines ol WHERE ol.order_id = ${o.order_id} ORDER BY ol.id`.execute(tx)).rows;
    return {
      code: o.code, branchCode: o.branch_code, status: o.status, businessDate: o.business_date, customerCode: o.customer_code,
      lines: lines.map((l) => ({ lineKey: l.line_key, sku: l.sku, unit: l.unit_name, unitQty: Number(l.unit_qty), ratio: Number(l.unit_ratio) || 1, isGift: l.is_gift })),
    };
  })),
});
