// @bizcity-layer K kernel/config
// [2026-11-02 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — hồ sơ kế toán của đơn vị có phiên bản: năm tài chính, chế độ kế toán, loại pháp nhân (ADR-0013, S020-22).
/**
 * HỒ SƠ KẾ TOÁN CỦA ĐƠN VỊ (ADR-0013; bảng accounting_profiles, migration 0049).
 *
 *   profileAt(db, tenant, asOf)   hồ sơ áp cho ngày asOf: effective_from ≤ asOf lớn nhất, bằng nhau thì version lớn nhất; null = chưa khai
 *   fiscalYearOf(month, date)     năm tài chính chứa một ngày, theo tháng bắt đầu
 *   publishProfile(...)           phát hành bản mới, hiệu lực từ đầu một năm tài chính
 *
 * Core chỉ giữ cấu trúc: hiệu lực là ngày 01 của tháng bắt đầu năm tài chính (CHECK ở CSDL), không rơi vào / trước kỳ đã khoá.
 * Chế độ có hợp với loại pháp nhân, năm tài chính, quy định đang hiệu lực không là việc của Kernel: Conformance Engine phân tích
 * và báo để người dùng quyết (ADR-0012, R-VNC-10). Không có hồ sơ thì Core không đoán.
 */
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';
import { Errors } from '@bizcity/platform/core/errors';

export const REGIMES = ['vn-tt200-2014', 'vn-tt99-2025', 'vn-tt133-2016', 'vn-tt152-2025'] as const;
export const ENTITY_TYPES = ['enterprise', 'sme', 'micro', 'household'] as const;
export type Regime = (typeof REGIMES)[number];
export type EntityType = (typeof ENTITY_TYPES)[number];

export interface ProfileRow {
  version: number;
  effective_from: string;
  fiscal_year_start_month: number;
  regime: Regime;
  entity_type: EntityType;
  note: string;
  created_by: string;
  created_at: Date;
}

const COLS = ['version', 'effective_from', 'fiscal_year_start_month', 'regime', 'entity_type', 'note', 'created_by', 'created_at'] as const;
const pad = (n: number) => String(n).padStart(2, '0');
/** Ngày từ CSDL (Date theo giờ máy, hoặc chuỗi) → YYYY-MM-DD. */
export const ymd = (d: unknown): string => (d instanceof Date ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : String(d).slice(0, 10));

/** Năm tài chính chứa ngày `date` (YYYY-MM-DD) khi năm bắt đầu ở tháng `startMonth`. */
export function fiscalYearOf(startMonth: number, date: string): { start: string; end: string } {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const sy = m >= startMonth ? y : y - 1;
  const start = `${sy}-${pad(startMonth)}-01`;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const ey = startMonth === 1 ? sy : sy + 1;
  const lastDay = new Date(Date.UTC(ey, endMonth, 0)).getUTCDate();
  return { start, end: `${ey}-${pad(endMonth)}-${pad(lastDay)}` };
}

export async function profileAt(db: Db, tenantId: string, asOf: string): Promise<ProfileRow | null> {
  const row = await db.selectFrom('accounting_profiles').select([...COLS])
    .where('tenant_id', '=', tenantId).where('effective_from', '<=', asOf)
    .orderBy('effective_from', 'desc').orderBy('version', 'desc').limit(1).executeTakeFirst();
  return (row as ProfileRow | undefined) ?? null;
}

export async function listProfiles(db: Db, tenantId: string): Promise<ProfileRow[]> {
  return db.selectFrom('accounting_profiles').select([...COLS])
    .where('tenant_id', '=', tenantId).orderBy('version', 'desc').execute() as Promise<ProfileRow[]>;
}

export interface PublishProfileInput {
  effectiveFrom: string;
  fiscalYearStartMonth: number;
  regime: Regime;
  entityType: EntityType;
  note: string;
  actor: string;
}

/** Phát hành hồ sơ mới. Chặn: hiệu lực không phải ngày đầu năm tài chính của chính hồ sơ; có kỳ đã khoá từ ngày hiệu lực trở đi. */
export async function publishProfile(trx: Db, tenantId: string, a: PublishProfileInput): Promise<ProfileRow> {
  if (!/^\d{4}-\d{2}-01$/.test(a.effectiveFrom)) throw Errors.validation('Ngày hiệu lực của hồ sơ kế toán phải là ngày 01 (đầu năm tài chính)');
  const [y, m] = a.effectiveFrom.split('-').map(Number) as [number, number];
  if (m !== a.fiscalYearStartMonth) {
    throw Errors.validation(`Hồ sơ hiệu lực từ đầu năm tài chính: năm tài chính bắt đầu tháng ${a.fiscalYearStartMonth} thì ngày hiệu lực phải là 01/${pad(a.fiscalYearStartMonth)}, không phải ${a.effectiveFrom}`);
  }
  // Không đổi hồ sơ của năm đã có kỳ khoá: kỳ khoá ở hoặc sau ngày hiệu lực.
  const locked = await trx.selectFrom('period_locks as l').innerJoin('fiscal_periods as p', 'p.id', 'l.period_id')
    .select(['p.year', 'p.month']).where('l.tenant_id', '=', tenantId)
    .where(sql<boolean>`p.year * 100 + p.month >= ${y * 100 + m}`)
    .orderBy('p.year').orderBy('p.month').limit(1).executeTakeFirst();
  if (locked) throw Errors.validation(`Kỳ ${pad(locked.month)}/${locked.year} đã khoá: hồ sơ kế toán mới phải hiệu lực sau kỳ khoá cuối cùng`);
  // Một lượt phát hành mỗi lúc trong đơn vị (số phiên bản không trùng).
  await sql`SELECT pg_advisory_xact_lock(727049, ${Number(tenantId)})`.execute(trx);
  const top = await trx.selectFrom('accounting_profiles').select('version').where('tenant_id', '=', tenantId)
    .orderBy('version', 'desc').limit(1).executeTakeFirst();
  const version = (top?.version ?? 0) + 1;
  await trx.insertInto('accounting_profiles').values({
    tenant_id: tenantId, version, effective_from: a.effectiveFrom, fiscal_year_start_month: a.fiscalYearStartMonth,
    regime: a.regime, entity_type: a.entityType, note: a.note, created_by: a.actor,
  }).execute();
  return (await trx.selectFrom('accounting_profiles').select([...COLS]).where('tenant_id', '=', tenantId).where('version', '=', version).executeTakeFirstOrThrow()) as ProfileRow;
}
