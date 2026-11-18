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
import { appendRunLog, readRunLog } from '../run-log.js';

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
  // [2026-11-18 Nguyễn Văn Thủy] số đếm ghi nhật ký JSONL luồng "thu-vien" (0161, bỏ bảng library_usage_daily); đọc thì cộng dồn (đóng góp)
  void db;
  try {
    for (const { tenantId, ...r } of rows) await appendRunLog<UsageData>(USAGE_STREAM, tenantId, r);
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


/** Số liệu bảng đánh giá trong khoảng ngày (đã lọc theo đơn vị bằng RLS + điều kiện tenant_id). */
export async function libraryUsage(db: Db, tenantId: string | number, q: UsageQuery): Promise<UsageReport> {
  void db;
  type Acc = { pass: number; warn: number; block: number; deprecated: number };
  const SEP = '\u0001';
  const lib = new Map<string, Acc>();
  const src = new Map<string, Acc>();
  const top = new Map<string, number>();
  const unk = new Map<string, number>();
  const add = (m: Map<string, Acc>, k: string, r: UsageData) => {
    const x = m.get(k) ?? { pass: 0, warn: 0, block: 0, deprecated: 0 };
    x[r.outcome] += r.count;
    if (r.findingCode === 'LIB-DEPRECATED-001') x.deprecated += r.count;
    m.set(k, x);
  };
  const bump = (m: Map<string, number>, k: string, c: number) => m.set(k, (m.get(k) ?? 0) + c);
  for (const r of await libraryUsageRows(tenantId, q)) {
    add(lib, r.libraryId, r);
    add(src, [r.source, r.libraryId].join(SEP), r);
    if (r.findingCode) bump(top, [r.findingCode, r.libraryId, r.outcome].join(SEP), r.count);
    if (r.itemCode === '?') bump(unk, [r.libraryId, r.source].join(SEP), r.count);
  }
  const byKey = <V>(m: Map<string, V>) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const byLibrary = byKey(lib).map(([k, v]) => ({ libraryId: k, pass: v.pass, warn: v.warn, block: v.block }));
  return {
    from: q.from, to: q.to,
    total: byLibrary.reduce((a, r) => ({ pass: a.pass + r.pass, warn: a.warn + r.warn, block: a.block + r.block }), { pass: 0, warn: 0, block: 0 }),
    byLibrary,
    bySource: byKey(src).map(([k, v]) => { const [source, libraryId] = k.split(SEP) as [string, string]; return { source, libraryId, pass: v.pass, warn: v.warn, block: v.block, deprecated: v.deprecated }; }),
    topFindings: [...top.entries()].map(([k, count]) => { const [code, libraryId, outcome] = k.split(SEP) as [string, string, UsageOutcome]; return { code, libraryId, outcome, count }; })
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)).slice(0, 10),
    unknown: [...unk.entries()].map(([k, count]) => { const [libraryId, source] = k.split(SEP) as [string, string]; return { libraryId, source, count }; })
      .sort((a, b) => b.count - a.count).slice(0, 10),
  };
}

const USAGE_STREAM = 'thu-vien';
type UsageData = Omit<Row, 'tenantId'>;
/** Số đếm (đã cộng theo khoá ngày × thư viện × bản × nguồn × mã × kết quả × mã phát hiện) của đơn vị trong khoảng ngày. */
export async function libraryUsageRows(tenantId: string | number, q: UsageQuery): Promise<UsageData[]> {
  const sum = new Map<string, UsageData>();
  for (const e of await readRunLog<UsageData>(USAGE_STREAM, { tenantId: String(tenantId) })) {
    const r = e.data;
    if (r.day < q.from || r.day > q.to || (q.library && r.libraryId !== q.library) || (q.source && r.source !== q.source)) continue;
    const k = [r.day, r.libraryId, r.version, r.source, r.itemCode, r.outcome, r.findingCode].join('\u0001');
    const cur = sum.get(k);
    if (cur) cur.count += r.count; else sum.set(k, { ...r });
  }
  return [...sum.values()];
}
