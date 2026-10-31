// @bizcity-layer K kernel/ledger
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Đọc/ghi sổ cái: bút toán, dòng, số dư theo ngày, bộ đếm số bút toán.
 * Không chứa luật — luật nằm ở ledger.service.ts.
 */
import { sql, type Insertable } from 'kysely';
import type { Db } from '../../db/client.js';
import type { LedgerEntriesTable, LedgerLineInsert } from '../../db/types.js';

/** partner_id của số dư "không theo đối tượng" trong ledger_balances_daily (khoá chính không nhận NULL). */
export const NO_PARTNER_ID = '0';

/** Loại liên kết bút toán (xem bảng ledger_links). */
export type LedgerLinkType = 'reversal' | 'return' | 'adjustment' | 'gift' | 'replacement';

export const ledgerRepository = {
  /** Cấp số bút toán tiếp theo (khoá dòng bộ đếm tới hết giao dịch → liền mạch, không trùng). */
  async nextEntryNo(db: Db, tenantId: string, year: number): Promise<number> {
    const row = await db
      .insertInto('ledger_entry_sequences')
      .values({ tenant_id: tenantId, year, last_no: 1 })
      .onConflict((oc) => oc.columns(['tenant_id', 'year']).doUpdateSet({ last_no: sql`ledger_entry_sequences.last_no + 1` }))
      .returning('last_no')
      .executeTakeFirstOrThrow();
    return row.last_no;
  },

  insertEntry(db: Db, values: Insertable<LedgerEntriesTable>) {
    return db
      .insertInto('ledger_entries')
      .values(values)
      .returning(['id', 'entry_no'])
      .executeTakeFirstOrThrow();
  },

  async insertLines(db: Db, lines: LedgerLineInsert[]): Promise<void> {
    if (lines.length) await db.insertInto('ledger_lines').values(lines).execute();
  },

  /**
   * Cộng phát sinh vào bảng số dư theo ngày.
   * `rows` đã gom theo (chi nhánh, tài khoản, ngày, đối tượng).
   */
  async addDailyBalances(
    db: Db,
    rows: { tenant_id: string; branch_id: string; account_code: string; posting_date: string; partner_id: string; debit: number; credit: number }[],
  ): Promise<void> {
    if (!rows.length) return;
    await db
      .insertInto('ledger_balances_daily')
      .values(rows)
      .onConflict((oc) =>
        oc.columns(['tenant_id', 'branch_id', 'account_code', 'posting_date', 'partner_id']).doUpdateSet({
          debit: sql`ledger_balances_daily.debit + excluded.debit`,
          credit: sql`ledger_balances_daily.credit + excluded.credit`,
        }),
      )
      .execute();
  },

  /** Bút toán còn hiệu lực (chưa bị đảo) của một chứng từ gốc. */
  findActiveEntriesBySource(db: Db, tenantId: string, sourceDocumentId: string) {
    return db
      .selectFrom('ledger_entries')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('event_id', '=', sourceDocumentId)
      .where('status', '=', 'posted')
      .where('reverses_entry_id', 'is', null)
      .execute();
  },

  findEntry(db: Db, tenantId: string, entryId: string) {
    return db.selectFrom('ledger_entries').selectAll().where('tenant_id', '=', tenantId).where('id', '=', entryId).executeTakeFirst();
  },

  findLines(db: Db, entryId: string) {
    return db.selectFrom('ledger_lines').selectAll().where('entry_id', '=', entryId).orderBy('line_no').execute();
  },

  /** Ghi một liên kết bút toán mới → bút toán gốc (bảng ledger_links, chỉ thêm). */
  addLink(db: Db, link: { tenantId: string; entryId: string; targetEntryId: string; type: LedgerLinkType; reason?: string; actor: string }) {
    return db
      .insertInto('ledger_links')
      .values({ tenant_id: link.tenantId, entry_id: link.entryId, target_entry_id: link.targetEntryId, link_type: link.type, reason: link.reason ?? '', created_by: link.actor })
      .onConflict((oc) => oc.columns(['entry_id', 'target_entry_id', 'link_type']).doNothing())
      .execute();
  },

  /** Liên kết của một bút toán: đi ra (bút toán này trỏ tới gốc nào) và đi vào (bút toán nào trỏ tới nó). */
  async linksOf(db: Db, tenantId: string, entryId: string) {
    const cols = ['k.link_type', 'k.reason', 'k.created_at', 'e.id', 'e.entry_no', 'e.doc_type', 'e.doc_no', 'e.posting_date', 'e.total'] as const;
    const [outgoing, incoming] = await Promise.all([
      db.selectFrom('ledger_links as k').innerJoin('ledger_entries as e', 'e.id', 'k.target_entry_id').select(cols).where('k.tenant_id', '=', tenantId).where('k.entry_id', '=', entryId).orderBy('k.id').execute(),
      db.selectFrom('ledger_links as k').innerJoin('ledger_entries as e', 'e.id', 'k.entry_id').select(cols).where('k.tenant_id', '=', tenantId).where('k.target_entry_id', '=', entryId).orderBy('k.id').execute(),
    ]);
    return { outgoing, incoming };
  },

  markReversed(db: Db, entryId: string) {
    return db.updateTable('ledger_entries').set({ status: 'reversed' }).where('id', '=', entryId).execute();
  },
};
