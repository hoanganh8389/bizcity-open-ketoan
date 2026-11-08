// @bizcity-layer P bizcity.config
// [2026-11-08 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-48 (B2, PHASE-030 · 26 §8): bộ đếm lượt dùng thư viện — gom trong bộ nhớ theo lượt (không hẹn giờ — SC-EVT-1), ghi một câu cộng dồn vào library_usage_daily; chỉ mã, không giá trị nhập
/**
 * Lượt dùng thư viện là QUAN SÁT (eventual, ECP — "strong trong giao dịch, eventual sau commit"): mất vài lượt khi tiến trình
 * chết là chấp nhận được; số đếm không bao giờ được đọc để ghi sổ. KHÔNG lưu giá trị người nhập (R-SEC-10).
 *
 *   recordLibraryUsage(tenantId, result, source)   cộng một lượt vào bộ nhớ (kết quả của validateAgainstLibrary)
 *   shouldFlush(now)                               đủ điều kiện ghi: ≥ 30 giây từ lần ghi trước hoặc ≥ 200 dòng
 *   flushLibraryUsage(db)                          ghi hết bộ nhớ: một câu INSERT … ON CONFLICT DO UPDATE count = count + n
 *   libraryUsage(db, tenantId, q)                  số liệu cho bảng đánh giá (theo thư viện, theo nguồn, mã phát hiện, mã lạ)
 * Không setInterval / setTimeout: nơi gọi ghi khi `shouldFlush()` sau mỗi lượt, trước khi đọc số liệu, và khi máy chủ tắt.
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import type { ValidateResult } from './types.js';

export const FLUSH_AFTER_MS = 30_000;
export const FLUSH_AT_ROWS = 200;
const SOURCE_RE = /^[a-z0-9][a-z0-9._/:-]{0,79}$/;

export type UsageOutcome = 'pass' | 'warn' | 'block';

interface Row {
  tenantId: string;
  day: string;
  libraryId: string;
  version: string;
  source: string;
  itemCode: string;
  outcome: UsageOutcome;
  findingCode: string;
  count: number;
}

const buffer = new Map<string, Row>();
let lastFlush = Date.now();

/** Nguồn hợp lệ (module / action / kênh) — chuỗi lạ thành 'api' để không ai nhét dữ liệu vào cột nguồn. */
export const normalizeSource = (s: unknown): string => (typeof s === 'string' && SOURCE_RE.test(s.trim().toLowerCase()) ? s.trim().toLowerCase() : 'api');

/** Kết quả một lượt: block nếu có chặn, warn nếu có cảnh báo, còn lại pass; kèm mã nặng nhất (mức nhắc không tính). */
export function outcomeOf(r: Pick<ValidateResult, 'findings'>): { outcome: UsageOutcome; findingCode: string } {
  const block = r.findings.find((f) => f.level === 'block');
  if (block) return { outcome: 'block', findingCode: block.code };
  const warn = r.findings.find((f) => f.level === 'warn');
  if (warn) return { outcome: 'warn', findingCode: warn.code };
  return { outcome: 'pass', findingCode: '' };
}

/** Mã mục đã khớp: mã chuẩn (sau bí danh), hoặc '?' khi mã không có trong thư viện. Không bao giờ là giá trị người nhập. */
function itemCodeOf(r: ValidateResult, input: unknown): string {
  if (r.findings.some((f) => f.code === 'LIB-UNKNOWN-001' || (f.code === 'LIB-SCHEMA-001' && f.path === 'code'))) return '?';
  if (r.resolved) return r.resolved;
  const code = typeof input === 'string' ? input : (input as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.trim() ? code.trim().slice(0, 80) : '?';
}

/** Cộng một lượt vào bộ nhớ. */
export function recordLibraryUsage(tenantId: string | number, result: ValidateResult, input: unknown, source?: unknown, now = new Date()): void {
  const { outcome, findingCode } = outcomeOf(result);
  const row: Row = {
    tenantId: String(tenantId), day: now.toISOString().slice(0, 10), libraryId: result.library.id, version: result.library.version,
    source: normalizeSource(source), itemCode: itemCodeOf(result, input), outcome, findingCode, count: 1,
  };
  const key = [row.tenantId, row.day, row.libraryId, row.version, row.source, row.itemCode, row.outcome, row.findingCode].join('\u0001');
  const cur = buffer.get(key);
  if (cur) cur.count += 1;
  else buffer.set(key, row);
}

export const pendingUsageRows = (): number => buffer.size;
export const shouldFlush = (now = Date.now()): boolean => buffer.size > 0 && (buffer.size >= FLUSH_AT_ROWS || now - lastFlush >= FLUSH_AFTER_MS);

/** Ghi hết bộ nhớ (một câu). Lỗi ghi: bỏ lô, trả lỗi cho nơi gọi ghi nhật ký — không ném vào luồng nghiệp vụ. */
export async function flushLibraryUsage(db: Db): Promise<{ rows: number; error?: string }> {
  lastFlush = Date.now();
  if (!buffer.size) return { rows: 0 };
  const rows = [...buffer.values()];
  buffer.clear();
  try {
    const values = sql.join(rows.map((r) => sql`(${r.tenantId}::bigint, ${r.day}::date, ${r.libraryId}, ${r.version}, ${r.source}, ${r.itemCode}, ${r.outcome}, ${r.findingCode}, ${r.count}::bigint)`));
    await sql`
      INSERT INTO library_usage_daily (tenant_id, day, library_id, version, source, item_code, outcome, finding_code, count)
      VALUES ${values}
      ON CONFLICT (tenant_id, day, library_id, version, source, item_code, outcome, finding_code)
      DO UPDATE SET count = library_usage_daily.count + EXCLUDED.count, updated_at = now()`.execute(db);
    return { rows: rows.length };
  } catch (e) {
    return { rows: 0, error: (e as Error).message };
  }
}

/** Xoá bộ nhớ (test). */
export function resetLibraryUsage(): void {
  buffer.clear();
  lastFlush = Date.now();
}

export interface UsageQuery { from: string; to: string; library?: string; source?: string }

export interface UsageReport {
  from: string;
  to: string;
  total: { pass: number; warn: number; block: number };
  byLibrary: { libraryId: string; pass: number; warn: number; block: number }[];
  bySource: { source: string; libraryId: string; pass: number; warn: number; block: number; deprecated: number }[];
  topFindings: { code: string; libraryId: string; outcome: UsageOutcome; count: number }[];
  unknown: { libraryId: string; source: string; count: number }[];
}

const n = (v: unknown): number => Number(v ?? 0);

/** Số liệu bảng đánh giá trong khoảng ngày (đã lọc theo đơn vị bằng RLS + điều kiện tenant_id). */
export async function libraryUsage(db: Db, tenantId: string | number, q: UsageQuery): Promise<UsageReport> {
  const where = sql`tenant_id = ${String(tenantId)}::bigint AND day BETWEEN ${q.from}::date AND ${q.to}::date
    ${q.library ? sql`AND library_id = ${q.library}` : sql``} ${q.source ? sql`AND source = ${q.source}` : sql``}`;
  const sum = (o: UsageOutcome) => sql`COALESCE(SUM(count) FILTER (WHERE outcome = ${o}), 0)`;
  const [byLib, bySrc, top, unk] = await Promise.all([
    sql<{ library_id: string; pass: string; warn: string; block: string }>`
      SELECT library_id, ${sum('pass')} AS pass, ${sum('warn')} AS warn, ${sum('block')} AS block
      FROM library_usage_daily WHERE ${where} GROUP BY library_id ORDER BY library_id`.execute(db),
    sql<{ source: string; library_id: string; pass: string; warn: string; block: string; deprecated: string }>`
      SELECT source, library_id, ${sum('pass')} AS pass, ${sum('warn')} AS warn, ${sum('block')} AS block,
             COALESCE(SUM(count) FILTER (WHERE finding_code = 'LIB-DEPRECATED-001'), 0) AS deprecated
      FROM library_usage_daily WHERE ${where} GROUP BY source, library_id ORDER BY source, library_id`.execute(db),
    sql<{ finding_code: string; library_id: string; outcome: UsageOutcome; count: string }>`
      SELECT finding_code, library_id, outcome, SUM(count) AS count
      FROM library_usage_daily WHERE ${where} AND finding_code <> '' GROUP BY finding_code, library_id, outcome
      ORDER BY SUM(count) DESC, finding_code LIMIT 10`.execute(db),
    sql<{ library_id: string; source: string; count: string }>`
      SELECT library_id, source, SUM(count) AS count
      FROM library_usage_daily WHERE ${where} AND item_code = '?' GROUP BY library_id, source
      ORDER BY SUM(count) DESC LIMIT 10`.execute(db),
  ]);
  const byLibrary = byLib.rows.map((r) => ({ libraryId: r.library_id, pass: n(r.pass), warn: n(r.warn), block: n(r.block) }));
  return {
    from: q.from, to: q.to,
    total: byLibrary.reduce((a, r) => ({ pass: a.pass + r.pass, warn: a.warn + r.warn, block: a.block + r.block }), { pass: 0, warn: 0, block: 0 }),
    byLibrary,
    bySource: bySrc.rows.map((r) => ({ source: r.source, libraryId: r.library_id, pass: n(r.pass), warn: n(r.warn), block: n(r.block), deprecated: n(r.deprecated) })),
    topFindings: top.rows.map((r) => ({ code: r.finding_code, libraryId: r.library_id, outcome: r.outcome, count: n(r.count) })),
    unknown: unk.rows.map((r) => ({ libraryId: r.library_id, source: r.source, count: n(r.count) })),
  };
}
