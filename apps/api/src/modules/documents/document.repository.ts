// @bizcity-layer K kernel/intake
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Đọc/ghi chứng từ gốc.
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';

export interface DocumentListFilter {
  from?: string;
  to?: string;
  branchCode?: string;
  status?: string;
  docType?: string;
  /** Mục đích của phiếu nhập tay (payload.purpose); nhiều mã cách nhau dấu phẩy. */
  purpose?: string;
  /** Nguồn (source_system), nhiều mã cách nhau dấu phẩy. */
  sourceSystem?: string;
  /** Loại phiếu ở hệ thống nguồn (payload.sourceRef.type). */
  sourceType?: string;
  search?: string;
  /** Nhiều chi nhánh, mã cách nhau dấu phẩy ("-" = không chi nhánh nào). */
  branchCodes?: string;
  /** Kèm thông tin danh sách phiếu thu / chi: lý do, nhân viên, điện thoại, địa chỉ, tài khoản, ngày / người tạo, sửa. */
  voucherInfo?: boolean;
  page: number;
  pageSize: number;
}

export const documentRepository = {
  /** Khoá dòng chứng từ theo docKey tới hết giao dịch (tránh hai lần gửi cùng lúc ghi trùng). */
  findByKeyForUpdate(db: Db, tenantId: string, docKey: string) {
    return db.selectFrom('accounting_events').selectAll().where('tenant_id', '=', tenantId).where('doc_key', '=', docKey).forUpdate().executeTakeFirst();
  },

  findById(db: Db, tenantId: string, id: string) {
    return db.selectFrom('accounting_events').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
  },

  findByKey(db: Db, tenantId: string, docKey: string) {
    return db.selectFrom('accounting_events').selectAll().where('tenant_id', '=', tenantId).where('doc_key', '=', docKey).executeTakeFirst();
  },

  insert(db: Db, v: { tenant_id: string; source_system: string; doc_key: string; version: number; doc_type: string; branch_id: string; doc_no: string; doc_date: string; partner_id: string | null; invoice_no: string | null; total: number; payload: string; created_by?: string }) {
    return db.insertInto('accounting_events').values(v).returning(['id']).executeTakeFirstOrThrow();
  },

  archiveVersion(db: Db, sourceDocumentId: string, version: number, payload: unknown, receivedAt: Date) {
    return db
      .insertInto('accounting_event_versions')
      .values({ event_id: sourceDocumentId, version, payload: JSON.stringify(payload), received_at: receivedAt })
      .onConflict((oc) => oc.columns(['event_id', 'version']).doNothing())
      .execute();
  },

  update(db: Db, id: string, patch: Record<string, unknown>) {
    return db.updateTable('accounting_events').set(patch).where('id', '=', id).execute();
  },

  async list(db: Db, tenantId: string, f: DocumentListFilter) {
    let q = db
      .selectFrom('accounting_events as d')
      .innerJoin('branches as b', 'b.id', 'd.branch_id')
      .leftJoin('partners as p', 'p.id', 'd.partner_id')
      .where('d.tenant_id', '=', tenantId);
    if (f.from) q = q.where('d.doc_date', '>=', f.from);
    if (f.to) q = q.where('d.doc_date', '<=', f.to);
    if (f.branchCode) q = q.where('b.code', '=', f.branchCode);
    if (f.branchCodes) {
      const codes = f.branchCodes.split(',').map((x) => x.trim()).filter((x) => x && x !== '-');
      q = codes.length ? q.where('b.code', 'in', codes) : q.where(sql<boolean>`false`);
    }
    // auto: đã định khoản TỰ ĐỘNG — phiên bản đang trong sổ do hệ thống nguồn đẩy vào (khoá API) và tự ghi theo chế độ
    // định khoản "Tự động" của loại chứng từ (không qua kế toán bấm ở trạm).
    if (f.status === 'auto') {
      q = q.where('d.status', '=', 'posted').where(sql<boolean>`EXISTS (SELECT 1 FROM posting_log pl WHERE pl.event_id = d.id AND pl.version = d.posted_version
        AND pl.action IN ('post', 'repost') AND pl.actor LIKE 'apikey:%')`);
    } else if (f.status) q = q.where('d.status', '=', f.status);
    if (f.docType) q = q.where('d.doc_type', '=', f.docType);
    if (f.sourceSystem) q = q.where('d.source_system', 'in', f.sourceSystem.split(',').map((x) => x.trim()).filter(Boolean));
    // sourceType: loại phiếu ở nguồn; "!loại" = trừ loại đó (ví dụ hoá đơn bán hàng không lẫn phiếu xuất điều chỉnh).
    if (f.sourceType?.startsWith('!')) q = q.where(sql<string>`COALESCE(d.payload->'sourceRef'->>'type', '')`, '<>', f.sourceType.slice(1));
    else if (f.sourceType) q = q.where(sql<string>`d.payload->'sourceRef'->>'type'`, '=', f.sourceType);
    if (f.purpose) q = q.where(sql<string>`d.payload->>'purpose'`, 'in', f.purpose.split(',').map((x) => x.trim()).filter(Boolean));
    if (f.search) {
      const s = f.search.trim();
      q = q.where((eb) => eb.or([eb('d.doc_no', 'ilike', `%${s}%`), eb('d.invoice_no', '=', s), eb('p.name', 'ilike', `%${s}%`), eb('d.doc_key', '=', s)]));
    }
    const [rows, count] = await Promise.all([
      q
        .select([
          'd.id', 'd.doc_key', 'd.version', 'd.doc_type', 'd.doc_no', 'd.doc_date', 'd.invoice_no', 'd.total', 'd.status', 'd.posted_version', 'd.cancel_requested_at', 'd.cancel_reason',
          'd.error_message', 'd.received_at', 'd.posted_at', 'd.source_system', 'b.code as branch_code', 'b.name as branch_name',
          'p.code as partner_code', 'p.name as partner_name',
          sql<string | null>`d.payload->>'description'`.as('description'),
          sql<string | null>`d.payload->>'counterparty'`.as('counterparty'),
          sql<string | null>`d.payload->>'purpose'`.as('purpose'),
          sql<string | null>`d.payload->'sourceRef'->>'type'`.as('source_type'),
          sql<string | null>`COALESCE(d.payload->'sourceRef'->>'label', d.payload->'sourceRef'->>'type')`.as('source_label'),
          sql<string | null>`d.payload->'sourceRef'->>'url'`.as('source_url'),
          ...(f.voucherInfo
            ? [
                'd.created_by',
                sql<string | null>`d.payload->>'reasonCode'`.as('reason_code'),
                sql<string | null>`d.payload->>'employeeCode'`.as('employee_code'),
                sql<string | null>`d.payload->>'phone'`.as('phone'),
                sql<string | null>`d.payload->>'address'`.as('address'),
                sql<string | null>`d.payload->'lines'->0->>'debitAccount'`.as('first_debit'),
                sql<string | null>`d.payload->'lines'->0->>'creditAccount'`.as('first_credit'),
                sql<string | null>`jsonb_path_query_first(d.payload, '$.lines[*].invoiceNo')#>>'{}'`.as('line_invoice_no'),
                sql<Date | null>`COALESCE((SELECT min(v.received_at) FROM accounting_event_versions v WHERE v.event_id = d.id), d.received_at)`.as('created_at'),
                sql<Date | null>`CASE WHEN d.version > 1 THEN d.received_at END`.as('updated_at'),
                sql<string | null>`CASE WHEN d.version > 1 THEN (SELECT a.actor FROM audit_logs a WHERE a.tenant_id = d.tenant_id AND a.object_id = d.doc_key AND a.action LIKE '%.update' ORDER BY a.created_at DESC LIMIT 1) END`.as('updated_by'),
              ] as const
            : []),
        ])
        .orderBy('d.doc_date', 'desc')
        .orderBy('d.doc_no', 'desc')
        .limit(f.pageSize)
        .offset((f.page - 1) * f.pageSize)
        .execute(),
      q.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirst(),
    ]);
    return { rows, total: Number(count?.n ?? 0) };
  },

  /** Đếm theo trạng thái (dùng cho trang tổng quan). */
  countByStatus(db: Db, tenantId: string) {
    return db
      .selectFrom('accounting_events')
      .select(['status', (eb) => eb.fn.countAll<string>().as('n')])
      .where('tenant_id', '=', tenantId)
      .groupBy('status')
      .execute();
  },
};
