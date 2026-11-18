/**
 * Yêu cầu trả quá hạn (phiếu NT-BH-030 Q2): quá hạn trả thì máy bán gửi yêu cầu (đủ dòng, SL, tình trạng, lý do); người có quyền
 * pos:return-approve (mặc định kế toán trưởng, chủ đơn vị) — không phải người gửi — duyệt / từ chối kèm lý do; duyệt xong máy bán lập
 * phiếu trả kèm approvalId, nội dung phải khớp (verifyApprovalForReturn), lập xong yêu cầu thành "đã dùng". Nhật ký: return_approval_log.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030 Q2: yêu cầu trả quá hạn có duyệt thật, thay ô gõ tên người duyệt (đóng góp)
import { Errors, sql, z, type ActionContext } from '@bizcity/module-sdk';
import { isOffsetMethod } from './domain/order.js';
import { buyerTaxCodeOf, computeReturn, daysOf, sameReturnLines, type ReturnCondition } from './domain/returns.js';
import { lockKey, raise } from './order-service.js';
import { activePaymentMethods, branchTaxCodeOf, resolveBranch, todayVn } from './read.js';
import { badWarehouseOf, findOrder, returnedOf, soldLinesOf } from './return-service.js';
import { returnBadWarehouses, returnDaysPolicy } from './settings.js';

type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

export const approvalRequestSchema = z.object({
  id: z.string().trim().min(8).max(64),
  orderId: z.string().trim().min(1).max(64),
  /** Cửa hàng nhận trả (như phiếu trả). */
  branchCode: z.string().trim().min(1).max(32).optional(),
  lines: z.array(z.object({
    lineId: z.string().min(1).max(64), qty: z.number().gt(0, 'Số lượng trả phải lớn hơn 0'),
    condition: z.enum(['good', 'bad'], { message: 'Tình trạng hàng trả: good (nguyên vẹn) hoặc bad (lỗi / hết hạn)' }).optional(),
  })).min(1, 'Chưa chọn hàng trả').max(500),
  /** Hình thức hoàn dự kiến (tiền mặt / chuyển khoản; đổi hàng: doi_tru). */
  refundMethod: z.string().trim().min(1).max(32),
  reason: z.string().trim().min(1, 'Thiếu lý do trả hàng').max(500),
  note: z.string().trim().max(1000).optional(),
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'used';
export type ApprovalRow = {
  approval_id: string; order_id: string; branch_code: string; status: ApprovalStatus; lines: { lineId: string; qty: number; condition?: ReturnCondition }[];
  refund_method: string; refund_total: string; reason: string; note: string | null; deadline: string; snapshot: Snapshot; request: ApprovalRequest;
  requested_by: string; requested_by_name: string | null; requested_at: Date; decided_by: string | null; decided_by_name: string | null; decided_at: Date | null;
  decision_note: string | null; reject_reason: string | null; return_id: string | null; used_at: Date | null;
};
type Snapshot = {
  orderCode: string; orderBranchCode: string; orderDate: string; customer: { id: string; name: string; phone: string };
  lines: { lineId: string; sku: string; name: string; unitName: string; qty: number; condition: ReturnCondition; refund: number }[];
};

const COLS = sql`approval_id, order_id, branch_code, status, lines, refund_method, refund_total, reason, note, deadline::text AS deadline, snapshot, request,
  requested_by, requested_by_name, requested_at, decided_by, decided_by_name, decided_at, decision_note, reject_reason, return_id, used_at`;

export const STATUS_TEXT: Record<ApprovalStatus, string> = { pending: 'chờ duyệt', approved: 'đã duyệt', rejected: 'bị từ chối', used: 'đã lập phiếu trả' };

/** Yêu cầu → khuôn trả cho máy bán / màn duyệt. */
export function toApproval(r: ApprovalRow) {
  return {
    id: r.approval_id, orderId: r.order_id, orderCode: r.snapshot.orderCode, orderBranchCode: r.snapshot.orderBranchCode, orderDate: r.snapshot.orderDate,
    branchCode: r.branch_code, status: r.status, statusText: STATUS_TEXT[r.status], customer: r.snapshot.customer, lines: r.snapshot.lines,
    refundMethod: r.refund_method, refundTotal: Number(r.refund_total), reason: r.reason, note: r.note ?? '', deadline: r.deadline,
    requestedBy: r.requested_by, requestedByName: r.requested_by_name ?? '', requestedAt: r.requested_at.toISOString(),
    decidedBy: r.decided_by ?? '', decidedByName: r.decided_by_name ?? '', decidedAt: r.decided_at?.toISOString() ?? null,
    decisionNote: r.decision_note ?? '', rejectReason: r.reject_reason ?? '', returnId: r.return_id, usedAt: r.used_at?.toISOString() ?? null,
  };
}
export type Approval = ReturnType<typeof toApproval>;

async function rowOf(tx: Tx, id: string, lock = false): Promise<ApprovalRow | undefined> {
  return (await sql<ApprovalRow>`SELECT ${COLS} FROM mod_pos.return_approvals WHERE approval_id = ${id} ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx)).rows[0];
}

async function log(tx: Tx, ctx: ActionContext, id: string, action: 'submit' | 'approve' | 'reject' | 'use', note?: string | null) {
  await sql`INSERT INTO mod_pos.return_approval_log (tenant_id, approval_id, action, actor, actor_name, note)
    VALUES (${ctx.tenant.id}, ${id}, ${action}, ${ctx.actor.id}, ${ctx.actor.name || null}, ${note ?? null})`.execute(tx);
}

/** Nhật ký một yêu cầu (cũ trước). */
export async function approvalLog(tx: Tx, id: string) {
  return (await sql<Omit<LogDb, 'approval_id'>>`
    SELECT action, actor, actor_name, note, at FROM mod_pos.return_approval_log WHERE approval_id = ${id} ORDER BY at, id`.execute(tx)).rows.map(logRow);
}

/** Nhật ký của nhiều yêu cầu một lượt (màn duyệt). */
export async function approvalLogs(tx: Tx, ids: readonly string[]) {
  const out = new Map<string, ReturnType<typeof logRow>[]>();
  if (!ids.length) return out;
  const rows = (await sql<LogDb>`SELECT approval_id, action, actor, actor_name, note, at FROM mod_pos.return_approval_log
    WHERE approval_id IN (${sql.join([...ids])}) ORDER BY at, id`.execute(tx)).rows;
  for (const l of rows) out.set(l.approval_id, [...(out.get(l.approval_id) ?? []), logRow(l)]);
  return out;
}
type LogDb = { approval_id: string; action: string; actor: string; actor_name: string | null; note: string | null; at: Date };
const logRow = (l: Omit<LogDb, 'approval_id'>) => ({ action: l.action, actor: l.actor, actorName: l.actor_name ?? '', note: l.note ?? '', at: l.at.toISOString() });

/** Gửi yêu cầu trả quá hạn (máy bán, quyền pos:return). Kiểm như phiếu trả (trừ hạn); đơn còn trong hạn → không cần gửi. */
export async function submitApproval(ctx: ActionContext, input: ApprovalRequest): Promise<Approval> {
  const policy = await returnDaysPolicy(ctx);
  const badMap = await returnBadWarehouses(ctx);
  return ctx.data.module(async (tx) => {
    await lockKey(tx, `pos:return-approval:${input.id}`);
    const old = await rowOf(tx, input.id);
    if (old) {
      // jsonb xếp lại khoá → so trong CSDL (như phiếu trả).
      const same = (await sql<{ same: boolean }>`SELECT request = ${JSON.stringify(input)}::jsonb AS same FROM mod_pos.return_approvals WHERE approval_id = ${input.id}`.execute(tx)).rows[0]?.same;
      if (!same) {
        throw Errors.conflict(`Yêu cầu ${input.id} đã nhận với nội dung khác — lập yêu cầu mới`, { reason: 'POS_RETURN_ID_REUSED', approvalId: input.id });
      }
      return toApproval(old);
    }
    const branch = await resolveBranch(tx, input.branchCode);
    const order = await findOrder(tx, input.orderId);
    await lockKey(tx, `pos:order:${order.order_id}`);
    const lines = await soldLinesOf(tx, order);
    const today = todayVn();
    const days = daysOf(policy, branch.code);
    const bad = input.lines.some((l) => l.condition === 'bad') ? await badWarehouseOf(tx, badMap, branch.code) : { code: null };
    const computed = computeReturn({
      draft: input, lines, done: await returnedOf(tx, order.order_id), branchCode: branch.code, branchTaxCode: branch.taxCode, today, days, approved: true,
      order: { status: order.status, branchCode: order.branch_code, businessDate: order.business_date, buyerTaxCode: buyerTaxCodeOf(order.snapshot),
        branchTaxCode: order.branch_code === branch.code ? branch.taxCode : await branchTaxCodeOf(tx, order.branch_code) },
      paymentMethods: await activePaymentMethods(tx), exchange: isOffsetMethod(input.refundMethod),
      badWarehouse: bad.code, ...(bad.issue ? { badWarehouseIssue: bad.issue } : {}),
    });
    if ('problem' in computed) raise(computed.problem);
    if (!computed.late) {
      throw Errors.conflict(`Đơn ${order.code} còn trong hạn trả (hạn cuối ${computed.deadline}) — lập phiếu trả luôn, không cần duyệt`,
        { reason: 'POS_RETURN_APPROVAL_STATE', status: 'not_late', deadline: computed.deadline });
    }
    // Một đơn × cửa hàng chỉ một yêu cầu đang mở (chờ duyệt / đã duyệt chưa dùng).
    const open = (await sql<{ approval_id: string; status: ApprovalStatus }>`
      SELECT approval_id, status FROM mod_pos.return_approvals WHERE order_id = ${order.order_id} AND branch_code = ${branch.code} AND status IN ('pending', 'approved')
       LIMIT 1`.execute(tx)).rows[0];
    if (open) {
      throw Errors.conflict(`Đơn ${order.code} đã có yêu cầu trả quá hạn ${STATUS_TEXT[open.status]} — ${open.status === 'approved' ? 'lập phiếu trả theo yêu cầu đó' : 'chờ kế toán duyệt'}`,
        { reason: 'POS_RETURN_APPROVAL_STATE', status: open.status, approvalId: open.approval_id });
    }
    const customer = (order.snapshot as { customer?: { id: string; name: string; phone: string } }).customer ?? { id: '', name: 'Khách lẻ', phone: '' };
    const snapshot: Snapshot = {
      orderCode: order.code, orderBranchCode: order.branch_code, orderDate: order.business_date, customer,
      lines: computed.lines.map((l) => ({ lineId: l.lineId, sku: l.sku, name: l.name, unitName: l.unitName, qty: l.qty, condition: l.condition, refund: l.refund })),
    };
    const reqLines = input.lines.map((l) => ({ lineId: l.lineId, qty: l.qty, condition: l.condition ?? 'good' }));
    await sql`INSERT INTO mod_pos.return_approvals (tenant_id, approval_id, order_id, branch_code, lines, refund_method, refund_total, reason, note, deadline,
                                                     snapshot, request, requested_by, requested_by_name)
      VALUES (${ctx.tenant.id}, ${input.id}, ${order.order_id}, ${branch.code}, ${JSON.stringify(reqLines)}::jsonb, ${input.refundMethod}, ${computed.refundTotal},
              ${input.reason}, ${input.note ?? null}, ${computed.deadline}, ${JSON.stringify(snapshot)}::jsonb, ${JSON.stringify(input)}::jsonb, ${ctx.actor.id}, ${ctx.actor.name || null})`.execute(tx);
    await log(tx, ctx, input.id, 'submit', input.reason);
    ctx.evidence.note('pos.return-approval', { id: input.id, orderCode: order.code, branchCode: branch.code, refundTotal: computed.refundTotal });
    return toApproval((await rowOf(tx, input.id))!);
  });
}

/** Duyệt / từ chối (quyền pos:return-approve). Người gửi không tự duyệt / từ chối; chỉ yêu cầu đang chờ. */
export async function decideApproval(ctx: ActionContext, id: string, decision: 'approve' | 'reject', text?: string): Promise<Approval> {
  return ctx.data.module(async (tx) => {
    const r = await rowOf(tx, id, true);
    if (!r) throw Errors.notFound(`yêu cầu trả quá hạn ${id}`);
    if (r.requested_by === ctx.actor.id) {
      throw Errors.forbidden(`Người gửi yêu cầu trả quá hạn không tự ${decision === 'approve' ? 'duyệt' : 'từ chối'} — nhờ người có quyền "Duyệt trả quá hạn" khác (kế toán trưởng)`);
    }
    if (r.status !== 'pending') {
      throw Errors.conflict(`Yêu cầu trả quá hạn đơn ${r.snapshot.orderCode} đang ở trạng thái "${STATUS_TEXT[r.status]}" — chỉ duyệt / từ chối yêu cầu chờ duyệt`,
        { reason: 'POS_RETURN_APPROVAL_STATE', status: r.status });
    }
    const note = text?.trim() || null;
    await sql`UPDATE mod_pos.return_approvals SET status = ${decision === 'approve' ? 'approved' : 'rejected'}, decided_by = ${ctx.actor.id},
        decided_by_name = ${ctx.actor.name || null}, decided_at = now(),
        decision_note = ${decision === 'approve' ? note : null}, reject_reason = ${decision === 'reject' ? note : null}
      WHERE approval_id = ${id}`.execute(tx);
    await log(tx, ctx, id, decision, note);
    return toApproval((await rowOf(tx, id))!);
  });
}

/** Một yêu cầu kèm nhật ký (máy bán xem trạng thái, màn duyệt xem chi tiết). */
export async function getApproval(tx: Tx, id: string) {
  const r = await rowOf(tx, id);
  if (!r) throw Errors.notFound(`yêu cầu trả quá hạn ${id}`);
  return { ...toApproval(r), log: await approvalLog(tx, id) };
}

/** Yêu cầu của một đơn ở cửa hàng nhận (mới nhất trước) — kèm vào "còn trả được" cho máy bán. */
export async function approvalsOfOrder(tx: Tx, orderId: string, branchCode: string): Promise<Approval[]> {
  return (await sql<ApprovalRow>`SELECT ${COLS} FROM mod_pos.return_approvals WHERE order_id = ${orderId} AND branch_code = ${branchCode}
    ORDER BY requested_at DESC, id DESC LIMIT 20`.execute(tx)).rows.map(toApproval);
}

/** Màn duyệt (BH14 thẻ "Yêu cầu trả quá hạn"): lọc trạng thái, ngày gửi, cửa hàng nhận, phân trang. */
export async function listApprovals(tx: Tx, f: { status?: ApprovalStatus; from?: string; to?: string; branches: string[]; page: number; pageSize: number }) {
  const where = sql`TRUE ${f.status ? sql`AND status = ${f.status}` : sql``}
    ${f.from ? sql`AND (requested_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= ${f.from}` : sql``}
    ${f.to ? sql`AND (requested_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= ${f.to}` : sql``}
    ${f.branches.length ? sql`AND branch_code IN (${sql.join(f.branches)})` : sql``}`;
  const n = Number((await sql<{ n: string }>`SELECT count(*) AS n FROM mod_pos.return_approvals WHERE ${where}`.execute(tx)).rows[0]!.n);
  const rows = (await sql<ApprovalRow>`SELECT ${COLS} FROM mod_pos.return_approvals WHERE ${where}
    ORDER BY (status = 'pending') DESC, requested_at DESC, id DESC LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`.execute(tx)).rows;
  return { items: rows.map(toApproval), total: n };
}

/**
 * Phiếu trả quá hạn (createReturn): yêu cầu phải đã duyệt, cùng đơn, cùng cửa hàng nhận, đúng dòng / SL / tình trạng. Khoá dòng yêu cầu
 * tới hết giao dịch. Sai → POS_RETURN_APPROVAL_STATE (chưa duyệt / bị từ chối kèm lý do / đã dùng) hoặc POS_RETURN_APPROVAL_MISMATCH.
 */
export async function verifyApprovalForReturn(tx: Tx, id: string, want: { orderId: string; branchCode: string; lines: readonly { lineId: string; qty: number; condition?: ReturnCondition }[] }): Promise<ApprovalRow> {
  const r = await rowOf(tx, id, true);
  if (!r) throw Errors.validation(`Không có yêu cầu trả quá hạn ${id} — gửi yêu cầu, chờ duyệt rồi lập phiếu`, { reason: 'POS_RETURN_EXPIRED', approvalId: id });
  if (r.status !== 'approved') {
    const why = r.status === 'rejected' ? `bị từ chối${r.reject_reason ? `: ${r.reject_reason}` : ''}` : r.status === 'pending' ? 'chưa được duyệt — chờ kế toán trưởng duyệt' : `đã dùng cho phiếu trả khác`;
    throw Errors.conflict(`Yêu cầu trả quá hạn đơn ${r.snapshot.orderCode} ${why}`, {
      reason: 'POS_RETURN_APPROVAL_STATE', status: r.status, approvalId: id, ...(r.reject_reason ? { rejectReason: r.reject_reason } : {}),
    });
  }
  const diff = r.order_id !== want.orderId ? 'khác đơn' : r.branch_code !== want.branchCode ? `khác cửa hàng nhận (${r.branch_code})` : !sameReturnLines(r.lines, want.lines) ? 'khác dòng hàng / số lượng / tình trạng' : '';
  if (diff) {
    throw Errors.validation(`Phiếu trả ${diff} so với yêu cầu trả quá hạn đã duyệt — lập phiếu đúng nội dung đã duyệt hoặc gửi yêu cầu mới`,
      { reason: 'POS_RETURN_APPROVAL_MISMATCH', approvalId: id, approved: r.lines });
  }
  return r;
}

/** Lập xong phiếu trả theo yêu cầu: yêu cầu thành "đã dùng" (cùng giao dịch ghi phiếu), nhật ký ghi mã phiếu trả. */
export async function markApprovalUsed(tx: Tx, ctx: ActionContext, id: string, returnId: string, code: string) {
  const done = (await sql<{ approval_id: string }>`UPDATE mod_pos.return_approvals SET status = 'used', return_id = ${returnId}, used_at = now()
    WHERE approval_id = ${id} AND status = 'approved' RETURNING approval_id`.execute(tx)).rows.length;
  if (!done) throw Errors.conflict(`Yêu cầu trả quá hạn ${id} vừa được dùng cho phiếu khác`, { reason: 'POS_RETURN_APPROVAL_STATE', status: 'used', approvalId: id });
  await log(tx, ctx, id, 'use', code);
}
