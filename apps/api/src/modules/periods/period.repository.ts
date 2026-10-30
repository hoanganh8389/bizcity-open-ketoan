// @bizcity-layer K kernel/periods
/**
 * Kỳ kế toán và khoá sổ.
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';


export const periodRepository = {
  /** Lấy kỳ chứa ngày `date` (YYYY-MM-DD); chưa có thì tạo kỳ tháng tương ứng. */
  async ensurePeriodFor(db: Db, tenantId: string, date: string): Promise<{ id: string; year: number; month: number }> {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    const start = `${date.slice(0, 7)}-01`;
    const row = await db
      .insertInto('fiscal_periods')
      .values({
        tenant_id: tenantId,
        year,
        month,
        start_date: start,
        end_date: sql<string>`(${start}::date + interval '1 month' - interval '1 day')::date` as unknown as string,
      })
      .onConflict((oc) => oc.columns(['tenant_id', 'year', 'month']).doUpdateSet({ year }))
      .returning(['id', 'year', 'month'])
      .executeTakeFirstOrThrow();
    return row;
  },

  /**
   * Kỳ có bị khoá cho (chi nhánh, loại chứng từ) không.
   * Khoá chung (branch NULL / doc_type '*') áp cho mọi chi nhánh / mọi loại.
   */
  async isLocked(db: Db, tenantId: string, periodId: string, branchId: string, docType: string): Promise<boolean> {
    const row = await db
      .selectFrom('period_locks')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('period_id', '=', periodId)
      .where((eb) => eb.or([eb('branch_id', 'is', null), eb('branch_id', '=', branchId)]))
      .where((eb) => eb.or([eb('doc_type', '=', '*'), eb('doc_type', '=', docType)]))
      .limit(1)
      .executeTakeFirst();
    return Boolean(row);
  },

  /** Danh sách kỳ kèm số khoá đang có. */
  listWithLocks(db: Db, tenantId: string, year?: number) {
    let q = db
      .selectFrom('fiscal_periods as p')
      .leftJoin('period_locks as l', 'l.period_id', 'p.id')
      .leftJoin('branches as br', 'br.id', 'l.branch_id')
      .select(['p.id', 'p.year', 'p.month', 'p.start_date', 'p.end_date', 'l.id as lock_id', 'br.code as branch_code', 'l.doc_type', 'l.locked_by', 'l.locked_at'])
      .where('p.tenant_id', '=', tenantId);
    if (year) q = q.where('p.year', '=', year);
    return q.orderBy('p.year', 'desc').orderBy('p.month', 'desc').execute();
  },

  /** Thêm khoá; đã có khoá y hệt thì bỏ qua. Trả về true nếu vừa thêm. */
  async insertLock(db: Db, v: { tenant_id: string; period_id: string; branch_id: string | null; doc_type: string; locked_by: string }) {
    const exists = await db
      .selectFrom('period_locks')
      .select('id')
      .where('tenant_id', '=', v.tenant_id)
      .where('period_id', '=', v.period_id)
      .where(sql<boolean>`COALESCE(branch_id, 0) = COALESCE(${v.branch_id}::bigint, 0)`)
      .where('doc_type', '=', v.doc_type)
      .executeTakeFirst();
    if (exists) return false;
    await db.insertInto('period_locks').values(v).execute();
    return true;
  },

  deleteLock(db: Db, tenantId: string, lockId: string) {
    return db.deleteFrom('period_locks').where('tenant_id', '=', tenantId).where('id', '=', lockId).returningAll().executeTakeFirst();
  },
};
