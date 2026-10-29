/**
 * Dữ liệu gốc (thư mục db/seeds): bộ danh mục và cấu hình định khoản chuẩn của công ty, lưu bằng tệp JSONL
 * (dòng đầu mô tả tệp, mỗi dòng sau một bản ghi). Người dùng thêm, sửa, xoá trên phần mềm thoải mái; khi cần làm
 * sạch thì "Quay về dữ liệu gốc" cho từng bộ: chép đè từ tệp vào danh mục của đơn vị.
 *
 * Khi quay về một bộ:
 *   - bản ghi có trong tệp: thêm mới hoặc ghi đè tên, cha, tài khoản… theo tệp;
 *   - bản ghi người dùng tự thêm (không có trong tệp): chưa dùng ở đâu thì xoá; đã dùng (sổ cái, chứng từ, chi nhánh,
 *     thẻ tài sản…) thì chỉ khoá (ngừng dùng) để sổ sách cũ vẫn tra được;
 *   - riêng mặt hàng: tệp chỉ sửa nhóm hạch toán, loại thuế của mặt hàng đã có trong phần mềm; mặt hàng chưa có thì
 *     bộ định khoản đọc thẳng từ tệp (không cần nạp vào cơ sở dữ liệu).
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import type { DimensionKind } from '@ketoan/contracts';
import { SEEDS_DIR } from '../../db/paths.js';

export { SEEDS_DIR };

interface Head { _bang: string; _mo_ta: string; _cot: string[] }
const cache = new Map<string, { mtime: number; head: Head; rows: Record<string, unknown>[] }>();

/** Đọc một tệp JSONL dữ liệu gốc (có bộ nhớ đệm theo thời điểm sửa tệp). */
export function readSeed<T = Record<string, unknown>>(file: string): { head: Head; rows: T[] } {
  const full = path.join(SEEDS_DIR, file);
  let mtime: number;
  try { mtime = statSync(full).mtimeMs; } catch { throw Errors.notFound(`tệp dữ liệu gốc ${file}`); }
  const hit = cache.get(full);
  if (hit && hit.mtime === mtime) return hit as unknown as { head: Head; rows: T[] };
  const lines = readFileSync(full, 'utf8').split('\n').filter((l) => l.trim());
  const parsed = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  const head = (parsed[0]?._bang ? parsed.shift() : { _bang: file, _mo_ta: '', _cot: [] }) as unknown as Head;
  const entry = { mtime, head, rows: parsed };
  cache.set(full, entry);
  return entry as unknown as { head: Head; rows: T[] };
}

/** Bộ tài khoản, loại thuế của mặt hàng theo tệp gốc (dùng khi mặt hàng chưa có trong phần mềm). */
export function seedProduct(sku: string): { postingGroupCode: string | null; taxOutCode: string | null } | undefined {
  let rows: SeedItem[];
  try { rows = readSeed<SeedItem>('mat-hang-tai-khoan.jsonl').rows; } catch { return undefined; }
  let idx = itemIndex.get(rows);
  if (!idx) { idx = new Map(rows.map((r) => [r.sku, r])); itemIndex.clear(); itemIndex.set(rows, idx); }
  const r = idx.get(sku);
  return r ? { postingGroupCode: r.posting_group, taxOutCode: r.tax_out } : undefined;
}
interface SeedItem { sku: string; name: string; unit: string; posting_group: string | null; tax_out: string | null; tax_in: string | null; category_path: string; note?: string; excise_rate?: number | null }
const itemIndex = new Map<SeedItem[], Map<string, SeedItem>>();

export interface RestoreResult { added: number; updated: number; removed: number; deactivated: number; warnings: string[] }
interface Dataset {
  key: string;
  title: string;
  file: string;
  /** Mã màn danh mục liên quan (nút "Quay về dữ liệu gốc" ở màn đó). */
  screens: string[];
  current: (trx: Db, tenantId: string) => Promise<number>;
  restore: (trx: Db, tenantId: string) => Promise<RestoreResult>;
}

const empty = (): RestoreResult => ({ added: 0, updated: 0, removed: 0, deactivated: 0, warnings: [] });

/* ------------------------------------------------------------------ khoản mục, bộ phận */
interface SeedDim { code: string; name: string; parent_code: string | null; note?: string; address?: string; phone?: string; is_active: boolean; extra?: Record<string, unknown> }

async function restoreDimension(trx: Db, tenantId: string, kind: DimensionKind, file: string): Promise<RestoreResult> {
  const res = empty();
  const rows = readSeed<SeedDim>(file).rows;
  const have = new Map((await trx.selectFrom('dimensions').select(['code', 'name', 'parent_code', 'note', 'extra', 'is_active']).where('tenant_id', '=', tenantId).where('kind', '=', kind).execute()).map((d) => [d.code, d]));
  for (const r of rows) {
    const extra: Record<string, unknown> = kind === 'department' ? { address: r.address ?? '', phone: r.phone ?? '' } : r.extra ?? {};
    const cur = have.get(r.code);
    if (!cur) {
      await trx.insertInto('dimensions').values({ tenant_id: tenantId, kind, code: r.code, name: r.name, parent_code: r.parent_code, note: r.note ?? '', extra: JSON.stringify(extra), is_active: r.is_active }).execute();
      res.added++;
    } else {
      const merged = { ...((cur.extra ?? {}) as Record<string, unknown>), ...extra };
      if (cur.name !== r.name || (cur.parent_code ?? null) !== r.parent_code || cur.note !== (r.note ?? '') || cur.is_active !== r.is_active || JSON.stringify(merged) !== JSON.stringify(cur.extra ?? {})) {
        await trx.updateTable('dimensions').set({ name: r.name, parent_code: r.parent_code, note: r.note ?? '', is_active: r.is_active, extra: JSON.stringify(merged) })
          .where('tenant_id', '=', tenantId).where('kind', '=', kind).where('code', '=', r.code).execute();
        res.updated++;
      }
    }
  }
  const keep = new Set(rows.map((r) => r.code));
  await dropExtras(res, [...have.keys()].filter((c) => !keep.has(c)), (c) => have.get(c)!.is_active, () => usedDimensionCodes(trx, tenantId, kind, [...have.keys()].filter((c) => !keep.has(c))),
    (c) => trx.updateTable('dimensions').set({ is_active: false }).where('tenant_id', '=', tenantId).where('kind', '=', kind).where('code', '=', c).execute(),
    (c) => trx.deleteFrom('dimensions').where('tenant_id', '=', tenantId).where('kind', '=', kind).where('code', '=', c).execute());
  if (kind === 'department') {
    // Chi nhánh chưa gắn bộ phận: gắn theo quy ước BH + 5 số đầu của mã chi nhánh nếu bộ phận đó có trong danh mục.
    const r = await sql`
      UPDATE branches b SET department_code = 'BH' || left(b.code, 5)
       WHERE b.tenant_id = ${tenantId} AND b.department_code IS NULL AND b.code ~ '^[0-9]{5}'
         AND EXISTS (SELECT 1 FROM dimensions d WHERE d.tenant_id = b.tenant_id AND d.kind = 'department' AND d.code = 'BH' || left(b.code, 5))`.execute(trx);
    const n = Number(r.numAffectedRows ?? 0);
    if (n) res.warnings.push(`Đã gắn bộ phận cho ${n} chi nhánh theo quy ước BH + mã cửa hàng`);
    const left = await trx.selectFrom('branches').select('code').where('tenant_id', '=', tenantId).where('is_active', '=', true).where('department_code', 'is', null).execute();
    if (left.length) res.warnings.push(`${left.length} chi nhánh chưa gắn bộ phận (${left.slice(0, 10).map((b) => b.code).join(', ')}${left.length > 10 ? '…' : ''}): gắn ở danh mục Chi nhánh`);
  }
  return res;
}

/** Bản ghi tự thêm (không có trong tệp): đã dùng thì khoá, chưa dùng thì xoá. */
async function dropExtras(res: RestoreResult, extra: string[], isActive: (c: string) => boolean, used: () => Promise<Set<string>>, deactivate: (c: string) => Promise<unknown>, remove: (c: string) => Promise<unknown>) {
  if (!extra.length) return;
  const u = await used();
  for (const c of extra) {
    if (u.has(c)) { if (isActive(c)) { await deactivate(c); res.deactivated++; } }
    else { await remove(c); res.removed++; }
  }
}

/** Trường chiều phân tích trên dòng sổ (dims) và cột trên thẻ tài sản, định mức của từng loại danh mục. */
const DIM_USES: Record<DimensionKind, { dims?: string; assetCol?: string; normCol?: string }> = {
  cost_item: { dims: 'costItem', assetCol: 'cost_item_code', normCol: 'cost_item_code' },
  department: { dims: 'department', assetCol: 'department_code', normCol: 'department_code' },
  contract: { dims: 'contract', assetCol: 'contract_code' },
  employee: { dims: 'employee' },
  case: { dims: 'case' },
  project: { dims: 'project' },
  capital_source: { dims: 'capitalSource' },
  tool_group: { assetCol: 'tool_group_code' },
  usage_purpose: { assetCol: 'usage_purpose_code' },
};

/** Mã chiều phân tích đang được dùng: sổ cái, thẻ tài sản, định mức, chi nhánh, lý do, lịch hợp đồng, mã con. */
export async function usedDimensionCodes(trx: Db, tenantId: string, kind: DimensionKind, codes: string[]): Promise<Set<string>> {
  if (!codes.length) return new Set();
  const u = DIM_USES[kind];
  const parts = [sql`SELECT d.parent_code AS code FROM dimensions d WHERE d.tenant_id = ${tenantId} AND d.kind = ${kind} AND d.parent_code = ANY(${codes}::text[])`];
  if (u.dims) parts.push(sql`SELECT DISTINCT l.dims->>${u.dims} FROM ledger_lines l WHERE l.tenant_id = ${tenantId} AND l.dims->>${u.dims} = ANY(${codes}::text[])`);
  if (u.assetCol) parts.push(sql`SELECT a.${sql.ref(u.assetCol)} FROM assets a WHERE a.tenant_id = ${tenantId} AND a.${sql.ref(u.assetCol)} = ANY(${codes}::text[])`);
  if (u.normCol) parts.push(sql`SELECT n.${sql.ref(u.normCol)} FROM cost_norms n WHERE n.tenant_id = ${tenantId} AND n.${sql.ref(u.normCol)} = ANY(${codes}::text[])`);
  if (kind === 'department') parts.push(sql`SELECT b.department_code FROM branches b WHERE b.tenant_id = ${tenantId} AND b.department_code = ANY(${codes}::text[])`);
  if (kind === 'cost_item') parts.push(sql`SELECT r.flags->>'costItem' FROM posting_reasons r WHERE r.tenant_id = ${tenantId} AND r.flags->>'costItem' = ANY(${codes}::text[])`);
  if (kind === 'contract') parts.push(sql`SELECT s.contract_code FROM contract_schedules s WHERE s.tenant_id = ${tenantId} AND s.contract_code = ANY(${codes}::text[])`);
  const res = await sql<{ code: string }>`${sql.join(parts, sql` UNION `)}`.execute(trx);
  return new Set(res.rows.map((r) => r.code));
}

/* ------------------------------------------------------------------ lý do */
/** JSON có khoá sắp xếp (so sánh cờ của lý do không phụ thuộc thứ tự khoá). */
const stableJson = (v: unknown): string => JSON.stringify(v ?? {}, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
interface SeedReason { code: string; name: string; kind: string; counter_account: string | null; revenue_account: string | null; expense_account: string | null; cashflow_code: string | null; is_active: boolean; flags: Record<string, unknown> }

async function restoreReasons(trx: Db, tenantId: string): Promise<RestoreResult> {
  const res = empty();
  const rows = readSeed<SeedReason>('ly-do.jsonl').rows;
  const accounts = new Set((await trx.selectFrom('accounts').select('code').where('tenant_id', '=', tenantId).execute()).map((a) => a.code));
  const have = new Map((await trx.selectFrom('posting_reasons').selectAll().where('tenant_id', '=', tenantId).execute()).map((r) => [r.code, r]));
  const missing = new Set<string>();
  for (const r of rows) {
    // Tài khoản chưa có trong hệ thống tài khoản: bỏ trống (báo lại) để không hỏng ràng buộc.
    const ok = (a: string | null) => { if (a && !accounts.has(a)) { missing.add(`${r.code} → ${a}`); return null; } return a; };
    const values = { name: r.name, kind: r.kind, counter_account: ok(r.counter_account), revenue_account: ok(r.revenue_account), expense_account: ok(r.expense_account), cashflow_code: r.cashflow_code, flags: JSON.stringify(r.flags), is_active: r.is_active };
    const cur = have.get(r.code);
    if (cur) {
      // Chỉ ghi (và đếm "cập nhật") lý do thật sự khác tệp gốc.
      const same = cur.name === values.name && cur.kind === values.kind && cur.counter_account === values.counter_account && cur.revenue_account === values.revenue_account
        && cur.expense_account === values.expense_account && cur.cashflow_code === values.cashflow_code && cur.is_active === values.is_active && stableJson(cur.flags) === stableJson(r.flags);
      if (same) continue;
      await trx.updateTable('posting_reasons').set(values).where('tenant_id', '=', tenantId).where('code', '=', r.code).execute();
      res.updated++;
    } else {
      await trx.insertInto('posting_reasons').values({ tenant_id: tenantId, code: r.code, ...values }).execute();
      res.added++;
    }
  }
  const keep = new Set(rows.map((r) => r.code));
  const extra = [...have.keys()].filter((c) => !keep.has(c));
  if (extra.length) {
    const used = new Set((await trx.selectFrom('ledger_entries').select('reason_code').distinct().where('tenant_id', '=', tenantId).where('reason_code', 'in', extra).execute()).map((r) => r.reason_code));
    for (const c of extra) {
      if (used.has(c)) { await trx.updateTable('posting_reasons').set({ is_active: false }).where('tenant_id', '=', tenantId).where('code', '=', c).execute(); res.deactivated++; }
      else { await trx.deleteFrom('posting_reasons').where('tenant_id', '=', tenantId).where('code', '=', c).execute(); res.removed++; }
    }
  }
  if (missing.size) res.warnings.push(`Lý do trỏ tới tài khoản chưa có trong hệ thống tài khoản (đã để trống, khai thêm tài khoản rồi sửa lý do): ${[...missing].join('; ')}`);
  return res;
}

/* ------------------------------------------------------------------ nhóm hạch toán + mặt hàng */
interface SeedGroup { code: string; name: string; inventory_account: string; cogs_account: string; revenue_account: string; discount_account: string | null; sales_return_account: string; is_default: boolean }

async function restoreGroups(trx: Db, tenantId: string): Promise<RestoreResult> {
  const res = empty();
  const groups = readSeed<SeedGroup>('nhom-hach-toan.jsonl').rows;
  const have = new Set((await trx.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', tenantId).execute()).map((g) => g.code));
  await trx.updateTable('product_posting_groups').set({ is_default: false }).where('tenant_id', '=', tenantId).execute();
  const accounts = new Set((await trx.selectFrom('accounts').select('code').where('tenant_id', '=', tenantId).execute()).map((a) => a.code));
  for (const g of groups) {
    const lack = [g.inventory_account, g.cogs_account, g.revenue_account, g.discount_account, g.sales_return_account].filter((a): a is string => Boolean(a) && !accounts.has(a!));
    if (lack.length) { res.warnings.push(`Bỏ qua nhóm ${g.code}: tài khoản ${lack.join(', ')} chưa có trong hệ thống tài khoản`); continue; }
    const values = { name: g.name, inventory_account: g.inventory_account, cogs_account: g.cogs_account, revenue_account: g.revenue_account, discount_account: g.discount_account, sales_return_account: g.sales_return_account, is_default: g.is_default };
    if (have.has(g.code)) { await trx.updateTable('product_posting_groups').set(values).where('tenant_id', '=', tenantId).where('code', '=', g.code).execute(); res.updated++; }
    else { await trx.insertInto('product_posting_groups').values({ tenant_id: tenantId, code: g.code, ...values }).execute(); res.added++; }
  }
  // Mặt hàng đã có trong phần mềm: nhóm hạch toán, loại thuế theo tệp. Ghi theo lô qua bảng tạm từ JSON.
  const items = readSeed<SeedItem>('mat-hang-tai-khoan.jsonl').rows;
  const taxes = new Set((await trx.selectFrom('tax_codes').select('code').where('tenant_id', '=', tenantId).execute()).map((t) => t.code));
  let changed = 0;
  for (let i = 0; i < items.length; i += 2000) {
    const chunk = items.slice(i, i + 2000).map((x) => ({ sku: x.sku, g: x.posting_group, o: x.tax_out && taxes.has(x.tax_out) ? x.tax_out : null, n: x.tax_in && taxes.has(x.tax_in) ? x.tax_in : null, nt: x.note ?? '', ex: x.excise_rate ?? null }));
    const r = await sql`
      UPDATE products p SET posting_group_code = COALESCE(x.g, p.posting_group_code), tax_out_code = COALESCE(x.o, p.tax_out_code), tax_in_code = COALESCE(x.n, p.tax_in_code),
             note = x.nt, excise_rate = x.ex, updated_at = now()
        FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS x(sku text, g text, o text, n text, nt text, ex numeric)
       WHERE p.tenant_id = ${tenantId} AND p.sku = x.sku
         AND (p.posting_group_code IS DISTINCT FROM COALESCE(x.g, p.posting_group_code) OR p.tax_out_code IS DISTINCT FROM COALESCE(x.o, p.tax_out_code) OR p.tax_in_code IS DISTINCT FROM COALESCE(x.n, p.tax_in_code)
              OR p.note IS DISTINCT FROM x.nt OR p.excise_rate IS DISTINCT FROM x.ex)`.execute(trx);
    changed += Number(r.numAffectedRows ?? 0);
  }
  if (changed) res.warnings.push(`Đã đặt lại nhóm hạch toán, loại thuế, ghi chú, thuế TTĐB cho ${changed} mặt hàng theo tệp gốc`);
  // Nhóm người dùng tự thêm: không còn mặt hàng nào dùng thì xoá.
  const keep = new Set(groups.map((g) => g.code));
  for (const c of [...have].filter((c) => !keep.has(c))) {
    const used = await trx.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).where('posting_group_code', '=', c).executeTakeFirst();
    if (used) res.warnings.push(`Giữ nhóm ${c} vì còn mặt hàng dùng (không có trong tệp gốc)`);
    else { await trx.deleteFrom('product_posting_groups').where('tenant_id', '=', tenantId).where('code', '=', c).execute(); res.removed++; }
  }
  return res;
}


/* ------------------------------------------------------------------ mặt hàng, phân loại hàng hoá */
interface SeedClass { kind: string; code: string; name: string; parent_code: string | null; is_active: boolean }

async function restoreItemClasses(trx: Db, tenantId: string): Promise<RestoreResult> {
  const res = empty();
  const rows = readSeed<SeedClass>('phan-loai-hang.jsonl').rows;
  const have = new Map((await trx.selectFrom('item_classes').select(['kind', 'code', 'name', 'parent_code', 'is_active']).where('tenant_id', '=', tenantId).execute()).map((c) => [`${c.kind}|${c.code}`, c]));
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const r = await sql<{ inserted: boolean }>`
      INSERT INTO item_classes (tenant_id, kind, code, name, parent_code, is_active)
      SELECT ${tenantId}, x.kind, x.code, x.name, x.parent_code, x.is_active FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS x(kind text, code text, name text, parent_code text, is_active boolean)
      ON CONFLICT (tenant_id, kind, code) DO UPDATE SET name = EXCLUDED.name, parent_code = EXCLUDED.parent_code, is_active = EXCLUDED.is_active
       WHERE item_classes.name IS DISTINCT FROM EXCLUDED.name OR item_classes.parent_code IS DISTINCT FROM EXCLUDED.parent_code OR item_classes.is_active IS DISTINCT FROM EXCLUDED.is_active
      RETURNING (xmax = 0) AS inserted`.execute(trx);
    for (const x of r.rows) if (x.inserted) res.added++; else res.updated++;
  }
  const keep = new Set(rows.map((r) => `${r.kind}|${r.code}`));
  const extra = [...have.keys()].filter((k) => !keep.has(k));
  const COL: Record<string, string> = { brand: 'brand_code', industry: 'industry_code', group: 'group_code', type: 'type_code' };
  await dropExtras(res, extra, (k) => have.get(k)!.is_active, async () => {
    const used = new Set<string>();
    for (const k of extra) {
      const [kind, code] = k.split('|') as [string, string];
      const p = await trx.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).where(sql.ref(COL[kind]!), '=', code).executeTakeFirst();
      const child = await trx.selectFrom('item_classes').select('code').where('tenant_id', '=', tenantId).where('kind', '=', kind).where('parent_code', '=', code).executeTakeFirst();
      if (p || child) used.add(k);
    }
    return used;
  }, (k) => trx.updateTable('item_classes').set({ is_active: false }).where('tenant_id', '=', tenantId).where('kind', '=', k.split('|')[0]!).where('code', '=', k.split('|')[1]!).execute(),
  (k) => trx.deleteFrom('item_classes').where('tenant_id', '=', tenantId).where('kind', '=', k.split('|')[0]!).where('code', '=', k.split('|')[1]!).execute());
  return res;
}

/** Danh mục mặt hàng: thêm / cập nhật mọi mặt hàng của tệp gốc (tên, đơn vị tính, nhóm hạch toán, thuế, phân loại). Không xoá mặt hàng khác. */
async function restoreProducts(trx: Db, tenantId: string): Promise<RestoreResult> {
  const res = empty();
  const items = readSeed<SeedItem & { group_code: string | null; industry_code: string | null; brand_code: string | null; note?: string; excise_rate?: number | null }>('mat-hang-tai-khoan.jsonl').rows;
  const groups = new Set((await trx.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', tenantId).execute()).map((g) => g.code));
  const taxes = new Set((await trx.selectFrom('tax_codes').select('code').where('tenant_id', '=', tenantId).execute()).map((x) => x.code));
  let noGroup = 0;
  for (let i = 0; i < items.length; i += 2000) {
    const chunk = items.slice(i, i + 2000).map((x) => {
      const g = x.posting_group && groups.has(x.posting_group) ? x.posting_group : null;
      if (x.posting_group && !g) noGroup++;
      return { sku: x.sku, name: x.name, unit: x.unit, g, o: x.tax_out && taxes.has(x.tax_out) ? x.tax_out : null, n: x.tax_in && taxes.has(x.tax_in) ? x.tax_in : null, gr: x.group_code, ind: x.industry_code, br: x.brand_code, nt: x.note ?? '', ex: x.excise_rate ?? null };
    });
    const r = await sql<{ inserted: boolean }>`
      INSERT INTO products (tenant_id, sku, name, unit, posting_group_code, tax_out_code, tax_in_code, group_code, industry_code, brand_code, note, excise_rate, source_system)
      SELECT ${tenantId}, x.sku, x.name, x.unit, x.g, x.o, x.n, x.gr, x.ind, x.br, x.nt, x.ex, 'default'
        FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS x(sku text, name text, unit text, g text, o text, n text, gr text, ind text, br text, nt text, ex numeric)
      ON CONFLICT (tenant_id, sku) DO UPDATE SET name = EXCLUDED.name, unit = EXCLUDED.unit,
             posting_group_code = COALESCE(EXCLUDED.posting_group_code, products.posting_group_code), tax_out_code = COALESCE(EXCLUDED.tax_out_code, products.tax_out_code),
             tax_in_code = COALESCE(EXCLUDED.tax_in_code, products.tax_in_code), group_code = EXCLUDED.group_code, industry_code = EXCLUDED.industry_code,
             brand_code = EXCLUDED.brand_code, note = EXCLUDED.note, excise_rate = EXCLUDED.excise_rate, updated_at = now()
       WHERE (products.name, products.unit, products.posting_group_code, products.tax_out_code, products.tax_in_code, products.group_code, products.industry_code, products.brand_code, products.note, products.excise_rate)
             IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.unit, COALESCE(EXCLUDED.posting_group_code, products.posting_group_code), COALESCE(EXCLUDED.tax_out_code, products.tax_out_code),
                               COALESCE(EXCLUDED.tax_in_code, products.tax_in_code), EXCLUDED.group_code, EXCLUDED.industry_code, EXCLUDED.brand_code, EXCLUDED.note, EXCLUDED.excise_rate)
      RETURNING (xmax = 0) AS inserted`.execute(trx);
    for (const x of r.rows) if (x.inserted) res.added++; else res.updated++;
  }
  if (noGroup) res.warnings.push(`${noGroup} mặt hàng chưa gán được nhóm hạch toán vì nhóm chưa có: quay về dữ liệu gốc của Mặt hàng – tài khoản (ACC17) trước`);
  const cls = await trx.selectFrom('item_classes').select((eb) => eb.fn.countAll().as('n')).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
  if (!Number(cls.n)) res.warnings.push('Chưa có phân loại hàng hoá: quay về dữ liệu gốc của Phân loại hàng hoá (DM11) để nhóm / ngành / nhãn hàng hiện tên');
  return res;
}

/* ------------------------------------------------------------------ bảng danh mục theo mã (loại tài sản, loại thuế, hình thức thanh toán, nhóm đối tượng) */
type CodeTable = 'asset_categories' | 'tax_codes' | 'payment_methods' | 'partner_groups' | 'bank_accounts';

/** Thêm / cập nhật theo mã các cột của tệp; mã tự thêm: đã dùng thì khoá, chưa dùng thì xoá. */
async function restoreByCode(trx: Db, tenantId: string, table: CodeTable, file: string, cols: string[], used: (codes: string[]) => Promise<Set<string>>, prepare?: (row: Record<string, unknown>, res: RestoreResult) => Promise<Record<string, unknown> | null>): Promise<RestoreResult> {
  const res = empty();
  const rows = [...readSeed<Record<string, unknown>>(file).rows].sort((x, y) => Number(x.is_active !== false) - Number(y.is_active !== false));
  const have = new Map((await (trx.selectFrom(table) as any).selectAll().where('tenant_id', '=', tenantId).execute() as Record<string, unknown>[]).map((x) => [String(x.code), x]));
  for (const raw of rows) {
    const r = prepare ? await prepare(raw, res) : raw;
    if (!r) continue;
    const values = Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]]));
    const cur = have.get(String(r.code));
    if (!cur) { await (trx.insertInto(table) as any).values({ tenant_id: tenantId, code: r.code, ...values }).execute(); res.added++; }
    else if (Object.entries(values).some(([k, v]) => String(cur[k] ?? '') !== String(v ?? ''))) {
      await (trx.updateTable(table) as any).set(values).where('tenant_id', '=', tenantId).where('code', '=', r.code).execute();
      res.updated++;
    }
  }
  const keep = new Set(rows.map((r) => String(r.code)));
  const extra = [...have.keys()].filter((c) => !keep.has(c));
  await dropExtras(res, extra, (c) => Boolean(have.get(c)!.is_active), () => used(extra),
    (c) => (trx.updateTable(table) as any).set({ is_active: false }).where('tenant_id', '=', tenantId).where('code', '=', c).execute(),
    (c) => (trx.deleteFrom(table) as any).where('tenant_id', '=', tenantId).where('code', '=', c).execute());
  return res;
}
const usedBy = (trx: Db, tenantId: string, q: (codes: string[]) => ReturnType<typeof sql<{ code: string }>>) => async (codes: string[]) =>
  new Set((await q(codes).execute(trx)).rows.map((r) => r.code));

/** Tài khoản 112 chi tiết của tài khoản ngân hàng chưa có trong hệ thống tài khoản: tạo dưới tài khoản cấp trên gần nhất. */
async function ensureBankAccount(trx: Db, tenantId: string, code: string, name: string, res: RestoreResult): Promise<boolean> {
  const exists = await trx.selectFrom('accounts').select('code').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (exists) return true;
  const parents = await trx.selectFrom('accounts').select(['code', 'level', 'is_posting']).where('tenant_id', '=', tenantId).where('code', 'in', Array.from({ length: code.length - 1 }, (_, i) => code.slice(0, i + 1))).execute();
  const parent = parents.filter((p) => !p.is_posting).sort((a, b) => b.code.length - a.code.length)[0];
  if (!parent || !code.startsWith('112')) { res.warnings.push(`Tài khoản ${code} chưa có, không tạo được (không thấy tài khoản cấp trên): khai ở DM tài khoản`); return false; }
  await trx.insertInto('accounts').values({ tenant_id: tenantId, code, name: `Tiền gửi ${name}`.slice(0, 250), parent_code: parent.code, level: parent.level + 1, normal_side: 'debit', is_posting: true }).execute();
  res.warnings.push(`Đã tạo tài khoản ${code} (dưới ${parent.code}) cho tài khoản ngân hàng`);
  return true;
}

/* ------------------------------------------------------------------ chi nhánh, đối tượng: chỉ thêm / cập nhật */
async function restoreBranches(trx: Db, tenantId: string): Promise<RestoreResult> {
  const res = empty();
  const rows = readSeed<{ code: string; name: string; address: string | null; department_code: string | null; is_active: boolean; note?: string; company_name?: string; tax_code?: string; phone?: string; fax?: string }>('chi-nhanh.jsonl').rows;
  const deps = new Set((await trx.selectFrom('dimensions').select('code').where('tenant_id', '=', tenantId).where('kind', '=', 'department').execute()).map((d) => d.code));
  const have = new Map((await trx.selectFrom('branches').select(['code', 'name', 'address', 'department_code', 'is_active', 'note', 'company_name', 'tax_code', 'phone', 'fax']).where('tenant_id', '=', tenantId).execute()).map((b) => [b.code, b]));
  /*
   * Shop đổi đuôi (lên Plus / Premium, đóng thành _OFF): cùng một cửa hàng (5 số đầu của mã). Mã mới chưa có mà đơn vị còn
   * đúng MỘT chi nhánh cũ cùng 5 số không còn trong gốc → đổi mã chi nhánh cũ sang mã mới (chứng từ, bút toán giữ nguyên
   * vì gắn theo id). Mã mới đã có → chi nhánh lẻ cùng 5 số không còn trong gốc thì ngừng theo dõi.
   */
  const store = (c: string) => (/^\d{5}/.test(c) ? c.slice(0, 5) : null);
  const seedCodes = new Set(rows.map((r) => r.code));
  const renamed: string[] = [];
  const stopped: string[] = [];
  for (const r of rows) {
    const key = store(r.code);
    if (!key) continue;
    const strays = [...have.keys()].filter((c) => !seedCodes.has(c) && store(c) === key);
    if (!strays.length) continue;
    if (!have.has(r.code) && strays.length === 1) {
      const old = strays[0]!;
      await trx.updateTable('branches').set({ code: r.code }).where('tenant_id', '=', tenantId).where('code', '=', old).execute();
      have.set(r.code, { ...have.get(old)!, code: r.code });
      have.delete(old);
      renamed.push(`${old} → ${r.code}`);
    } else {
      for (const c of strays) {
        if (have.get(c)!.is_active) {
          await trx.updateTable('branches').set({ is_active: false }).where('tenant_id', '=', tenantId).where('code', '=', c).execute();
          have.get(c)!.is_active = false;
          stopped.push(`${c} (dùng ${have.has(r.code) ? r.code : strays.join(', ')})`);
        }
      }
    }
  }
  if (renamed.length) res.warnings.push(`Đổi mã ${renamed.length} chi nhánh theo shop đổi đuôi: ${renamed.slice(0, 10).join('; ')}${renamed.length > 10 ? '…' : ''}`);
  if (stopped.length) res.warnings.push(`Ngừng theo dõi ${stopped.length} chi nhánh trùng cửa hàng không có trong gốc: ${stopped.slice(0, 10).join('; ')}${stopped.length > 10 ? '…' : ''}`);
  res.updated += renamed.length + stopped.length;
  let noDep = 0;
  for (const r of rows) {
    const dep = r.department_code && deps.has(r.department_code) ? r.department_code : null;
    if (r.department_code && !dep) noDep++;
    const cur = have.get(r.code);
    const info = { note: r.note ?? '', company_name: r.company_name ?? '', tax_code: r.tax_code ?? '', phone: r.phone ?? '', fax: r.fax ?? '' };
    if (!cur) { await trx.insertInto('branches').values({ tenant_id: tenantId, code: r.code, name: r.name, address: r.address, department_code: dep, is_active: r.is_active, ...info }).execute(); res.added++; }
    else if (cur.name !== r.name || (cur.address ?? null) !== r.address || cur.is_active !== r.is_active || (dep && cur.department_code !== dep)
      || Object.entries(info).some(([k, v]) => (cur as Record<string, unknown>)[k] !== v)) {
      await trx.updateTable('branches').set({ name: r.name, address: r.address, is_active: r.is_active, ...info, ...(dep ? { department_code: dep } : {}) }).where('tenant_id', '=', tenantId).where('code', '=', r.code).execute();
      res.updated++;
    }
  }
  if (noDep) res.warnings.push(`${noDep} chi nhánh chưa gắn được bộ phận vì danh mục bộ phận chưa có mã: quay về dữ liệu gốc của Danh mục bộ phận (ACC26) trước`);
  const own = [...have.keys()].filter((c) => !rows.some((r) => r.code === c));
  if (own.length) res.warnings.push(`Giữ nguyên ${own.length} chi nhánh không có trong dữ liệu gốc (${own.slice(0, 10).join(', ')}${own.length > 10 ? '…' : ''})`);
  return res;
}

/** Kho theo chi nhánh (DM12): chỉ thêm / cập nhật; chi nhánh chưa có trong danh mục thì bỏ qua và báo. */
async function restoreWarehouses(trx: Db, tenantId: string): Promise<RestoreResult> {
  const res = empty();
  const rows = readSeed<{ code: string; branch_code: string; name: string; address: string; is_active: boolean; is_default: boolean; is_promo: boolean; account: string; note: string }>('kho.jsonl').rows;
  const branches = new Map((await trx.selectFrom('branches').select(['id', 'code']).where('tenant_id', '=', tenantId).execute()).map((b) => [b.code, b.id]));
  const have = new Map((await trx.selectFrom('warehouses').selectAll().where('tenant_id', '=', tenantId).execute()).map((w) => [w.code, w]));
  const noBranch = new Set<string>();
  for (const r of rows) {
    const branchId = branches.get(r.branch_code);
    if (!branchId) { noBranch.add(r.branch_code); continue; }
    const v = { branch_id: branchId, name: r.name ?? '', address: r.address ?? '', is_active: r.is_active, is_default: r.is_default, is_promo: r.is_promo, account: r.account ?? '', note: r.note ?? '' };
    const cur = have.get(r.code);
    if (!cur) { await trx.insertInto('warehouses').values({ tenant_id: tenantId, code: r.code, ...v }).execute(); res.added++; }
    else if (Object.entries(v).some(([k, x]) => String((cur as Record<string, unknown>)[k]) !== String(x))) {
      await trx.updateTable('warehouses').set({ ...v, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('code', '=', r.code).execute();
      res.updated++;
    }
  }
  if (noBranch.size) res.warnings.push(`Bỏ qua kho của ${noBranch.size} chi nhánh chưa có trong danh mục chi nhánh (${[...noBranch].slice(0, 10).join(', ')}): quay về dữ liệu gốc của Chi nhánh (DM02) trước`);
  const own = [...have.keys()].filter((c) => !rows.some((r) => r.code === c));
  if (own.length) res.warnings.push(`Giữ nguyên ${own.length} kho không có trong dữ liệu gốc (${own.slice(0, 10).join(', ')}${own.length > 10 ? '…' : ''})`);
  return res;
}

async function restorePartners(trx: Db, tenantId: string): Promise<RestoreResult> {
  const res = empty();
  const rows = readSeed<Record<string, unknown>>('doi-tuong.jsonl').rows;
  const groups = new Set((await trx.selectFrom('partner_groups').select('code').where('tenant_id', '=', tenantId).execute()).map((g) => g.code));
  let noGroup = 0;
  for (let i = 0; i < rows.length; i += 2000) {
    const chunk = rows.slice(i, i + 2000).map((r) => {
      const g = r.group_code && groups.has(String(r.group_code)) ? r.group_code : null;
      if (r.group_code && !g) noGroup++;
      return { ...r, group_code: g };
    });
    const r = await sql<{ inserted: boolean }>`
      INSERT INTO partners (tenant_id, code, name, kind, group_code, tax_code, address, phone, email, contact_name, bank_account_no, bank_account_holder, bank_name, payment_term_days, credit_limit, max_open_docs,
                            mobile, fax, website, position, company_name, company_address, short_name, note, manager_code, branch_code, is_active, created_at, created_by)
      SELECT ${tenantId}, x.code, x.name, x.kind, x.group_code, x.tax_code, x.address, x.phone, x.email, COALESCE(x.contact_name, ''), COALESCE(x.bank_account_no, ''), COALESCE(x.bank_account_holder, ''), COALESCE(x.bank_name, ''), x.payment_term_days, x.credit_limit, x.max_open_docs,
             COALESCE(x.mobile, ''), COALESCE(x.fax, ''), COALESCE(x.website, ''), COALESCE(x.position, ''), COALESCE(x.company_name, ''), COALESCE(x.company_address, ''), COALESCE(x.short_name, ''), COALESCE(x.note, ''), x.manager_code, x.branch_code, COALESCE(x.is_active, true), COALESCE(x.created_date::timestamptz, now()), COALESCE(x.created_by, '')
        FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS x(code text, name text, kind text, group_code text, tax_code text, address text, phone text, email text, contact_name text, bank_account_no text, bank_account_holder text, bank_name text, payment_term_days int, credit_limit numeric, max_open_docs int,
             mobile text, fax text, website text, position text, company_name text, company_address text, short_name text, note text, manager_code text, branch_code text, is_active boolean, created_date date, created_by text)
      ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, group_code = COALESCE(EXCLUDED.group_code, partners.group_code),
             mobile = EXCLUDED.mobile, fax = EXCLUDED.fax, website = EXCLUDED.website, position = EXCLUDED.position, company_name = EXCLUDED.company_name,
             company_address = EXCLUDED.company_address, short_name = EXCLUDED.short_name, note = EXCLUDED.note, manager_code = EXCLUDED.manager_code,
             branch_code = EXCLUDED.branch_code, is_active = EXCLUDED.is_active, created_at = EXCLUDED.created_at, created_by = EXCLUDED.created_by,
             tax_code = COALESCE(EXCLUDED.tax_code, partners.tax_code), address = COALESCE(EXCLUDED.address, partners.address), phone = EXCLUDED.phone,
             email = COALESCE(EXCLUDED.email, partners.email), contact_name = CASE WHEN EXCLUDED.contact_name <> '' THEN EXCLUDED.contact_name ELSE partners.contact_name END,
             bank_account_no = CASE WHEN EXCLUDED.bank_account_no <> '' THEN EXCLUDED.bank_account_no ELSE partners.bank_account_no END,
             bank_account_holder = CASE WHEN EXCLUDED.bank_account_holder <> '' THEN EXCLUDED.bank_account_holder ELSE partners.bank_account_holder END,
             bank_name = CASE WHEN EXCLUDED.bank_name <> '' THEN EXCLUDED.bank_name ELSE partners.bank_name END,
             payment_term_days = COALESCE(EXCLUDED.payment_term_days, partners.payment_term_days), credit_limit = COALESCE(EXCLUDED.credit_limit, partners.credit_limit),
             max_open_docs = COALESCE(EXCLUDED.max_open_docs, partners.max_open_docs), updated_at = now()
      RETURNING (xmax = 0) AS inserted`.execute(trx);
    for (const x of r.rows) if (x.inserted) res.added++; else res.updated++;
  }
  if (noGroup) res.warnings.push(`${noGroup} đối tượng chưa gắn được nhóm vì nhóm chưa có: quay về dữ liệu gốc của Nhóm đối tượng (DM08) trước`);
  return res;
}

/* ------------------------------------------------------------------ tài khoản ngầm định, theo dõi chiều của tài khoản */
async function restoreDefaults(trx: Db, tenantId: string): Promise<RestoreResult> {
  const res = empty();
  const rows = readSeed<{ key: string; account_code: string }>('tai-khoan-ngam-dinh.jsonl').rows;
  const have = new Map((await trx.selectFrom('posting_defaults').selectAll().where('tenant_id', '=', tenantId).execute()).map((d) => [d.key, d.account_code]));
  for (const r of rows) {
    if (!have.has(r.key)) { await trx.insertInto('posting_defaults').values({ tenant_id: tenantId, key: r.key, account_code: r.account_code }).execute(); res.added++; }
    else if (have.get(r.key) !== r.account_code) { await trx.updateTable('posting_defaults').set({ account_code: r.account_code }).where('tenant_id', '=', tenantId).where('key', '=', r.key).execute(); res.updated++; }
  }
  return res;
}

const ACCOUNT_FLAGS = ['track_partner', 'track_cost_item', 'track_department', 'track_contract', 'track_employee', 'track_cashflow',
  'is_foreign_currency', 'track_product', 'track_internal_debt', 'is_vat', 'is_debt', 'is_loan', 'always_increase', 'is_ledger', 'is_cost'] as const;
/**
 * Hệ thống tài khoản: tên, tên tiếng Anh, tính chất (dư Nợ / Có / lưỡng tính) và mọi cờ theo dõi, tính chất theo tệp gốc.
 * Tài khoản còn thiếu được thêm khi tài khoản mẹ đã là tài khoản tổng hợp; không xoá tài khoản đơn vị tự thêm.
 * Luật thêm: tài khoản lãi lỗ (loại 5 – 8) luôn theo dõi bộ phận; tài khoản chi tiết 641x, 642x luôn theo dõi khoản mục.
 */
async function restoreAccountTracking(trx: Db, tenantId: string): Promise<RestoreResult> {
  const res = empty();
  const text = readFileSync(path.join(SEEDS_DIR, 'tai-khoan.csv'), 'utf8');
  const [header, ...lines] = text.split(/\r?\n/).filter(Boolean).map(splitCsv);
  const col = (r: string[], name: string) => r[header!.indexOf(name)] ?? '';
  const have = new Map((await trx.selectFrom('accounts').selectAll().where('tenant_id', '=', tenantId).execute()).map((a) => [a.code, a]));
  for (const r of lines) {
    const code = col(r, 'code');
    const posting = col(r, 'is_posting') === '1';
    const patch: Record<string, unknown> = { name: col(r, 'name'), name_en: col(r, 'name_en') || null, normal_side: col(r, 'normal_side') || 'debit' };
    for (const k of ACCOUNT_FLAGS) patch[k] = col(r, k) === '1';
    if (posting && /^64[12]/.test(code)) patch.track_cost_item = true;
    if (/^[5-8]/.test(code)) patch.track_department = true;
    const cur = have.get(code);
    if (!cur) {
      const parentCode = col(r, 'parent_code') || null;
      const parent = parentCode ? have.get(parentCode) : undefined;
      if (parentCode && (!parent || parent.is_posting)) { res.warnings.push(`Tài khoản ${code} chưa có: tài khoản mẹ ${parentCode} ${parent ? 'đang ghi sổ trực tiếp' : 'chưa có'}, thêm ở danh mục Tài khoản`); continue; }
      const row = await trx.insertInto('accounts').values({ tenant_id: tenantId, code, parent_code: parentCode, level: parent ? parent.level + 1 : 1, is_posting: posting, ...(patch as { name: string }) }).returningAll().executeTakeFirstOrThrow();
      have.set(code, row);
      res.added++;
      continue;
    }
    if (Object.entries(patch).some(([k, v]) => (cur as Record<string, unknown>)[k] !== v)) {
      await trx.updateTable('accounts').set(patch).where('tenant_id', '=', tenantId).where('code', '=', code).execute();
      res.updated++;
    }
  }
  return res;
}
function splitCsv(line: string): string[] {
  const out: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) { if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cell); cell = ''; } else cell += ch;
  }
  out.push(cell);
  return out;
}

const countOf = (table: 'posting_reasons' | 'product_posting_groups' | 'posting_defaults') => async (trx: Db, tenantId: string) =>
  Number((await trx.selectFrom(table).select((eb) => eb.fn.countAll().as('n')).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow()).n);
const dimCount = (kind: string) => async (trx: Db, tenantId: string) =>
  Number((await trx.selectFrom('dimensions').select((eb) => eb.fn.countAll().as('n')).where('tenant_id', '=', tenantId).where('kind', '=', kind).executeTakeFirstOrThrow()).n);

const tableCount = (table: CodeTable | 'products' | 'item_classes' | 'branches' | 'partners' | 'warehouses') => async (trx: Db, tenantId: string) =>
  Number((await (trx.selectFrom(table) as any).select((eb: any) => eb.fn.countAll().as('n')).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow()).n);
const dim = (key: string, title: string, kind: DimensionKind, file: string, screens: string[]): Dataset => ({ key, title, file, screens, current: dimCount(kind), restore: (t, id) => restoreDimension(t, id, kind, file) });

export const DATASETS: Dataset[] = [
  // Thứ tự = thứ tự quay về toàn bộ: bộ sau dùng mã của bộ trước (mặt hàng cần nhóm hạch toán, phân loại, loại thuế; chi nhánh cần bộ phận…).
  {
    key: 'account_tracking', title: 'Hệ thống tài khoản (tên, tính chất, theo dõi chi tiết)', file: 'tai-khoan.csv', screens: ['ACC1'],
    current: async (trx, id) => Number((await trx.selectFrom('accounts').select((eb) => eb.fn.countAll().as('n')).where('tenant_id', '=', id).executeTakeFirstOrThrow()).n),
    restore: restoreAccountTracking,
  },
  { key: 'posting_defaults', title: 'Tài khoản ngầm định', file: 'tai-khoan-ngam-dinh.jsonl', screens: ['ACC41'], current: countOf('posting_defaults'), restore: restoreDefaults },
  {
    key: 'tax_codes', title: 'Loại thuế', file: 'loai-thue.jsonl', screens: ['ACC43'], current: tableCount('tax_codes'),
    restore: (trx, id) => restoreByCode(trx, id, 'tax_codes', 'loai-thue.jsonl', ['name', 'rate', 'direction', 'account_code', 'report_group', 'is_active'],
      usedBy(trx, id, (codes) => sql<{ code: string }>`SELECT DISTINCT tax_code AS code FROM ledger_lines WHERE tenant_id = ${id} AND tax_code = ANY(${codes}::text[]) UNION SELECT tax_out_code FROM products WHERE tenant_id = ${id} AND tax_out_code = ANY(${codes}::text[]) UNION SELECT tax_in_code FROM products WHERE tenant_id = ${id} AND tax_in_code = ANY(${codes}::text[])`)),
  },
  dim('cost_item', 'Danh mục khoản mục', 'cost_item', 'khoan-muc.jsonl', ['ACC24']),
  dim('department', 'Danh mục bộ phận (gồm từng cửa hàng)', 'department', 'bo-phan.jsonl', ['ACC26']),
  { key: 'branches', title: 'Chi nhánh / cửa hàng', file: 'chi-nhanh.jsonl', screens: ['DM02'], current: tableCount('branches'), restore: restoreBranches },
  { key: 'warehouses', title: 'Kho theo chi nhánh', file: 'kho.jsonl', screens: ['DM12'], current: tableCount('warehouses'), restore: restoreWarehouses },
  { key: 'reasons', title: 'Lý do – tài khoản', file: 'ly-do.jsonl', screens: ['ACC18'], current: countOf('posting_reasons'), restore: restoreReasons },
  { key: 'posting_groups', title: 'Mặt hàng – tài khoản (nhóm hạch toán)', file: 'nhom-hach-toan.jsonl', screens: ['ACC17'], current: countOf('product_posting_groups'), restore: restoreGroups },
  { key: 'item_classes', title: 'Phân loại hàng hoá (nhóm, ngành, nhãn hàng)', file: 'phan-loai-hang.jsonl', screens: ['DM11'], current: tableCount('item_classes'), restore: restoreItemClasses },
  { key: 'products', title: 'Danh mục mặt hàng', file: 'mat-hang-tai-khoan.jsonl', screens: ['DM10'], current: tableCount('products'), restore: restoreProducts },
  { key: 'partner_groups', title: 'Nhóm đối tượng', file: 'nhom-doi-tuong.jsonl', screens: ['DM08'], current: tableCount('partner_groups'),
    restore: (trx, id) => restoreByCode(trx, id, 'partner_groups', 'nhom-doi-tuong.jsonl', ['name', 'kind', 'parent_code', 'note', 'is_active'],
      usedBy(trx, id, (codes) => sql<{ code: string }>`SELECT group_code AS code FROM partners WHERE tenant_id = ${id} AND group_code = ANY(${codes}::text[]) UNION SELECT parent_code FROM partner_groups WHERE tenant_id = ${id} AND parent_code = ANY(${codes}::text[])`)) },
  { key: 'partners', title: 'Đối tượng (nhà cung cấp, chủ nhà, khách buôn, nhân viên, cơ quan…)', file: 'doi-tuong.jsonl', screens: ['DM03'], current: tableCount('partners'), restore: restorePartners },
  {
    key: 'bank_accounts', title: 'Tài khoản ngân hàng', file: 'ngan-hang.jsonl', screens: ['DM09'], current: tableCount('bank_accounts'),
    restore: (trx, id) => restoreByCode(trx, id, 'bank_accounts', 'ngan-hang.jsonl', ['bank_name', 'account_no', 'holder', 'account_code', 'bank_address', 'bank_phone', 'contact', 'note', 'is_active'],
      usedBy(trx, id, (codes) => sql<{ code: string }>`SELECT bank_account_code AS code FROM payment_methods WHERE tenant_id = ${id} AND bank_account_code = ANY(${codes}::text[])`),
      async (r, res) => ((await ensureBankAccount(trx, id, String(r.account_code), String(r.bank_name), res)) ? r : null)),
  },
  {
    key: 'payment_methods', title: 'Hình thức thanh toán', file: 'hinh-thuc-thanh-toan.jsonl', screens: ['DM05'], current: tableCount('payment_methods'),
    restore: async (trx, id) => {
      const banks = new Set((await trx.selectFrom('bank_accounts').select('code').where('tenant_id', '=', id).execute()).map((b) => b.code));
      const accounts = new Set((await trx.selectFrom('accounts').select('code').where('tenant_id', '=', id).execute()).map((a) => a.code));
      return restoreByCode(trx, id, 'payment_methods', 'hinh-thuc-thanh-toan.jsonl', ['name', 'account_code', 'bank_account_code', 'is_receivable', 'note', 'sort_order', 'partner_code'],
        usedBy(trx, id, (codes) => sql<{ code: string }>`SELECT DISTINCT method_code AS code FROM sales_payments WHERE tenant_id = ${id} AND method_code = ANY(${codes}::text[])`),
        async (r, res) => {
          if (!accounts.has(String(r.account_code))) { res.warnings.push(`Bỏ qua hình thức ${String(r.code)}: tài khoản ${String(r.account_code)} chưa có`); return null; }
          let partner = r.partner_code ? String(r.partner_code) : null;
          if (partner && !(await trx.selectFrom('partners').select('id').where('tenant_id', '=', id).where('code', '=', partner).executeTakeFirst())) {
            res.warnings.push(`Hình thức ${String(r.code)}: đối tượng nhận hộ ${partner} chưa có, để trống`); partner = null;
          }
          return { ...r, partner_code: partner, bank_account_code: r.bank_account_code && banks.has(String(r.bank_account_code)) ? r.bank_account_code : null };
        });
    },
  },
  dim('employee', 'Danh mục nhân viên', 'employee', 'nhan-vien.jsonl', ['DM04']),
  dim('contract', 'Danh mục hợp đồng', 'contract', 'hop-dong.jsonl', ['ACC25']),
  { key: 'asset_categories', title: 'Loại tài sản', file: 'loai-tai-san.jsonl', screens: ['ACC37'], current: tableCount('asset_categories'),
    restore: (trx, id) => restoreByCode(trx, id, 'asset_categories', 'loai-tai-san.jsonl', ['name', 'kind', 'asset_account', 'depreciation_account', 'expense_account', 'useful_life_months', 'parent_code', 'is_active'],
      usedBy(trx, id, (codes) => sql<{ code: string }>`SELECT c.code FROM asset_categories c JOIN assets a ON a.category_id = c.id WHERE c.tenant_id = ${id} AND c.code = ANY(${codes}::text[])`)) },
  dim('tool_group', 'Nhóm công cụ dụng cụ', 'tool_group', 'nhom-ccdc.jsonl', ['ACC19']),
  dim('capital_source', 'Danh mục nguồn vốn', 'capital_source', 'nguon-von.jsonl', ['ACC20']),
  dim('usage_purpose', 'Mục đích sử dụng', 'usage_purpose', 'muc-dich-su-dung.jsonl', ['ACC21']),
  dim('case', 'Danh mục vụ việc', 'case', 'vu-viec.jsonl', ['DM06']),
  dim('project', 'Danh mục dự án', 'project', 'du-an.jsonl', ['DM07']),
];

export function datasetOf(key: string): Dataset {
  const d = DATASETS.find((x) => x.key === key);
  if (!d) throw Errors.notFound(`bộ dữ liệu gốc ${key}`);
  return d;
}

/** Số bản ghi trong tệp gốc (tệp CSV: số dòng trừ dòng tiêu đề). */
export function seedCount(file: string): number {
  if (file.endsWith('.csv')) return readFileSync(path.join(SEEDS_DIR, file), 'utf8').split(/\r?\n/).filter(Boolean).length - 1;
  return readSeed(file).rows.length;
}
