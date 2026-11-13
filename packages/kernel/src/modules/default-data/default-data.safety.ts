// @bizcity-layer K kernel/seeds
// [2026-11-13 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-8a (00 §9, D036-9): quay về dữ liệu gốc an toàn — mã xem trước, ảnh chụp danh mục trước khi ghi, chặn bộ giả lập trên đơn vị có bút toán
/**
 * An toàn cho "Quay về dữ liệu gốc" (TI08 và nút ở đầu màn danh mục).
 *
 *   1. Xem trước bắt buộc: chạy action quay về ở chế độ chạy thử (?dryRun=1) → kết quả thật rồi huỷ, kèm previewToken
 *      (HMAC theo đơn vị, người, phạm vi, số thêm / sửa / xoá / khoá; sống 15 phút). Chạy thật phải gửi lại mã đó;
 *      kết quả thật khác lúc xem trước (danh mục đã đổi ở giữa) → CONFLICT, huỷ cả giao dịch.
 *   2. Ảnh chụp: trước khi ghi, chụp các dòng của đơn vị ở những bảng bộ đó chạm tới vào default_data_backups (0136),
 *      cùng giao dịch; giữ 10 bản gần nhất.
 *   3. Bộ giả lập trên đơn vị thật: tệp gốc có "_nguon": "gia-lap" (S030-53) mà đơn vị đã có bút toán → từ chối, chỉ cách
 *      đặt SEEDS_DIR tới danh mục của công ty. Bộ làm sạch catalog_sample KHÔNG chặn theo bút toán (thiết kế để chạy trên đơn vị
 *      có sổ: giữ mã đã vào sổ) — vẫn phải xem trước và có ảnh chụp.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';
import { env } from '@bizcity/platform/config/env';
import { Errors } from '@bizcity/platform/core/errors';
import { DATASETS, readSeed, type RestoreResult } from './default-data.service.js';

/** Bảng danh mục mỗi bộ chạm tới (đọc từ hàm quay về của bộ). Bộ không khai → chụp theo nhóm mặc định ở dưới. */
const DIM = ['dimensions'];
export const DATASET_TABLES: Record<string, string[]> = {
  account_tracking: ['accounts'],
  posting_defaults: ['posting_defaults'],
  tax_codes: ['tax_codes'],
  department: ['dimensions', 'branches'],
  branches: ['branches'],
  warehouses: ['warehouses'],
  reasons: ['posting_reasons'],
  posting_groups: ['product_posting_groups', 'products'],
  catalog_sample: ['products', 'item_classes'],
  item_classes: ['item_classes'],
  products: ['products'],
  partner_groups: ['partner_groups'],
  partners: ['partners'],
  bank_accounts: ['bank_accounts', 'accounts'],
  payment_methods: ['payment_methods'],
  asset_categories: ['asset_categories'],
};
const KNOWN = new Set([...Object.values(DATASET_TABLES).flat(), ...DIM]);

export function tablesOf(keys: string[]): string[] {
  const out = new Set<string>();
  for (const k of keys) for (const t of DATASET_TABLES[k] ?? DIM) out.add(t);
  return [...out].sort();
}

/** Tệp gốc là bộ giả lập (dòng đầu "_nguon": "gia-lap", S030-53). */
export function isSampleDataset(key: string): boolean {
  const d = DATASETS.find((x) => x.key === key);
  if (!d || !d.file.endsWith('.jsonl')) return false;
  try { return (readSeed(d.file).head as { _nguon?: string })._nguon === 'gia-lap'; } catch { return false; }
}

/** Chặn quay về bộ giả lập trên đơn vị đã có bút toán (bản cài thật chưa đặt SEEDS_DIR). */
export async function guardSampleSeeds(trx: Db, tenantId: string, keys: string[]): Promise<void> {
  const risky = keys.filter(isSampleDataset);
  if (!risky.length) return;
  const r = await sql<{ x: boolean }>`SELECT EXISTS (SELECT 1 FROM ledger_entries WHERE tenant_id = ${tenantId}) AS x`.execute(trx);
  if (!r.rows[0]?.x) return;
  const titles = risky.map((k) => DATASETS.find((d) => d.key === k)?.title ?? k);
  throw Errors.validation(
    `Tệp gốc của ${titles.join(', ')} là dữ liệu mẫu giả lập, còn đơn vị này đã có bút toán — quay về sẽ ghi dữ liệu mẫu đè lên danh mục thật. `
    + 'Đặt biến SEEDS_DIR của máy chủ tới bộ danh mục của công ty (db/seeds/README.md) rồi làm lại.',
    { datasets: risky },
  );
}

// ── Mã xem trước ──────────────────────────────────────────────────────────────────
const TTL_MS = 15 * 60_000;
type Outcome = { key: string; result: RestoreResult };

/** Dấu của kết quả: số thêm / sửa / xoá / khoá theo bộ (không tính câu cảnh báo). */
export function digestOf(outcomes: Outcome[]): string {
  const norm = outcomes.map(({ key, result: r }) => [key, r.added, r.updated, r.removed, r.deactivated]);
  return createHash('sha256').update(JSON.stringify(norm)).digest('hex').slice(0, 24);
}
const sign = (payload: string) => createHmac('sha256', env.JWT_SECRET).update(`default-data-preview|${payload}`).digest('base64url');

export function issuePreviewToken(tenantId: string, actor: string, scope: string, digest: string, now = Date.now()): string {
  return `${now}.${digest}.${sign(`${tenantId}|${actor}|${scope}|${digest}|${now}`)}`;
}

/** Kiểm mã xem trước; trả dấu kết quả lúc xem trước. */
export function checkPreviewToken(token: string | undefined, tenantId: string, actor: string, scope: string, now = Date.now()): string {
  const bad = () => Errors.validation('Cần xem trước trước khi quay về dữ liệu gốc: mã xem trước thiếu, sai hoặc đã quá 15 phút — bấm Xem trước lại.');
  const m = /^(\d{13})\.([0-9a-f]{24})\.([A-Za-z0-9_-]{43})$/.exec(token ?? '');
  if (!m) throw bad();
  const [, at, digest, sig] = m as unknown as [string, string, string, string];
  const want = Buffer.from(sign(`${tenantId}|${actor}|${scope}|${digest}|${at}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) throw bad();
  if (now - Number(at) > TTL_MS || Number(at) > now + 60_000) throw bad();
  return digest;
}

export function assertSameAsPreview(previewDigest: string, outcomes: Outcome[]): void {
  const actual = digestOf(outcomes);
  if (actual !== previewDigest) {
    throw Errors.conflict('Danh mục đã đổi sau khi xem trước (số thêm / sửa / xoá khác) — không ghi gì. Bấm Xem trước lại.');
  }
}

// ── Ảnh chụp danh mục ─────────────────────────────────────────────────────────────
const KEEP = 10;

export async function snapshotTables(trx: Db, tenantId: string, datasetKey: string, actor: string, tables: string[]): Promise<{ id: string; rowCount: number }> {
  for (const t of tables) if (!KNOWN.has(t)) throw new Error(`default-data: bảng ${t} không nằm trong danh sách chụp`);
  const parts = tables.map((t) => sql`${t}::text, COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM ${sql.table(t)} x WHERE x.tenant_id = ${tenantId}), '[]'::jsonb)`);
  const r = await sql<{ id: string; row_count: number }>`
    INSERT INTO default_data_backups (tenant_id, dataset_key, tables, row_count, snapshot, created_by)
    SELECT ${tenantId}, ${datasetKey}, ${sql.val(tables)}::text[],
           (SELECT COALESCE(sum(jsonb_array_length(e.value)), 0)::int FROM jsonb_each(s.snap) e), s.snap, ${actor}
      FROM (SELECT jsonb_build_object(${sql.join(parts)}) AS snap) s
    RETURNING id, row_count`.execute(trx);
  const row = r.rows[0]!;
  await sql`DELETE FROM default_data_backups WHERE tenant_id = ${tenantId}
              AND id NOT IN (SELECT id FROM default_data_backups WHERE tenant_id = ${tenantId} ORDER BY id DESC LIMIT ${KEEP})`.execute(trx);
  return { id: String(row.id), rowCount: row.row_count };
}

export async function setBackupResult(trx: Db, tenantId: string, id: string, outcomes: Outcome[]): Promise<void> {
  await sql`UPDATE default_data_backups SET result = ${JSON.stringify(outcomes)}::jsonb WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
}

export interface BackupInfo { id: string; datasetKey: string; tables: string[]; rowCount: number; createdBy: string; createdAt: string; result: Outcome[] | null }

export async function listBackups(trx: Db, tenantId: string): Promise<BackupInfo[]> {
  const r = await sql<{ id: string; dataset_key: string; tables: string[]; row_count: number; created_by: string; created_at: Date; result: Outcome[] | null }>`
    SELECT id, dataset_key, tables, row_count, created_by, created_at, result FROM default_data_backups WHERE tenant_id = ${tenantId} ORDER BY id DESC`.execute(trx);
  return r.rows.map((x) => ({ id: String(x.id), datasetKey: x.dataset_key, tables: x.tables, rowCount: x.row_count, createdBy: x.created_by, createdAt: new Date(x.created_at).toISOString(), result: x.result }));
}

export async function getBackup(trx: Db, tenantId: string, id: string): Promise<BackupInfo & { snapshot: Record<string, unknown[]> }> {
  if (!/^\d{1,18}$/.test(id)) throw Errors.notFound(`bản sao lưu ${id}`);
  const r = await sql<{ id: string; dataset_key: string; tables: string[]; row_count: number; created_by: string; created_at: Date; result: Outcome[] | null; snapshot: Record<string, unknown[]> }>`
    SELECT * FROM default_data_backups WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
  const x = r.rows[0];
  if (!x) throw Errors.notFound(`bản sao lưu ${id}`);
  return { id: String(x.id), datasetKey: x.dataset_key, tables: x.tables, rowCount: x.row_count, createdBy: x.created_by, createdAt: new Date(x.created_at).toISOString(), result: x.result, snapshot: x.snapshot };
}
