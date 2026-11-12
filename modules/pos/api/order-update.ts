/**
 * Đổi một đơn đã lập (xác nhận tiền QR — NT-BH-009, người mua hoá đơn điện tử — NT-BH-010): ghi bản chụp mới, tăng phiên bản;
 * rồi phát lại `pos.order.recorded` mang phiên bản để bản sao sổ ở website ghi đè đúng thứ tự.
 * Hai bước tách nhau: ghi đơn chạy trong ctx.data.module (vai trò CSDL của module), phát sự kiện chạy NGOÀI đoạn đó (outbox là
 * bảng Core) — cả hai vẫn trong cùng giao dịch của action. Chỉ đơn đã hoàn tất mới có bản sao: đơn chờ tiền đổi thì không phát.
 */
import { sql, type ActionContext } from '@bizcity/module-sdk';
import type { OrderRow } from './return-service.js';

type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

export type OrderChange = { order: OrderRow; snapshot: Record<string, unknown>; status: string; version: number };

export async function saveOrderChange(tx: Tx, order: OrderRow, snapshot: Record<string, unknown>, status = order.status): Promise<OrderChange> {
  const version = (await sql<{ version: number }>`
    UPDATE mod_pos.orders SET snapshot = ${JSON.stringify(snapshot)}::jsonb, status = ${status}, version = version + 1
     WHERE order_id = ${order.order_id} RETURNING version`.execute(tx)).rows[0]!.version;
  return { order, snapshot, status, version };
}

export async function emitOrderChange(ctx: ActionContext, c: OrderChange): Promise<void> {
  if (c.status !== 'completed') return;
  await ctx.events.emit('pos.order.recorded', {
    orderId: c.order.order_id, code: c.order.code, branchCode: c.order.branch_code, docKey: c.order.doc_key, version: c.version,
    cashier: { name: ctx.actor.name }, order: c.snapshot,
  }, { subject: `pos.order:${c.order.order_id}`, dedupeKey: `pos.order.recorded:${c.order.order_id}:v${c.version}` });
}
