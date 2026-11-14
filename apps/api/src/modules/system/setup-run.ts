// @bizcity-layer P module-sdk
// [2026-11-14 05:48 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-4 (B2, chữ chốt PHASE-036 · 00 §11): máy chủ chạy gói mẫu — đọc presets/<id>/, gọi lại action Core với quyền người bấm, tiến độ ở sample_runs
/**
 * Máy chủ chạy một gói mẫu (bizcity_preset@1) cho đơn vị đang dùng.
 *  - Mỗi bản ghi đi qua action Core có sẵn (runAction, quyền của người bấm): quyền, zod, cửa nạp, luật định khoản, bằng chứng như gõ tay
 *    (STD-PRE-3, D036-6). Không SQL ghi bảng nghiệp vụ, không số tài khoản. Tiền lệ: runModuleSeed.
 *  - Chạy lại không nhân đôi, không ghi đè: danh mục chỉ tạo khi chưa có; chứng từ theo docKey (lần hai unchanged); cấu hình chỉ ở lần đầu.
 *  - Chỉ chạy trên đơn vị trắng, hoặc đơn vị đã từng chạy cùng gói (chạy tiếp / chạy lại). Ngoài ra SETUP_NOT_EMPTY (D036-4).
 *  - sample_runs giữ trạng thái + tiến độ; một đơn vị một lần chạy đang chạy; mất nhịp sống quá 5 phút → failed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'kysely';
import { z } from 'zod';
import { db, type Db } from '@bizcity/platform/db/client';
import { PRESETS_DIR } from '@bizcity/platform/db/paths';
import { Errors } from '@bizcity/platform/core/errors';
import type { AuthContext } from '@bizcity/platform/core/auth';
import { defineAction, listActions, runAction, type AnyActionDef } from '@bizcity/platform/core/actions';
import { queryBool } from '@bizcity/platform/core/http';
import { STANDARD } from '../../core/version.js';
import { tenantEmptiness } from './setup-status.js';

export const STALE_MINUTES = 5;
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

// ── Gói ───────────────────────────────────────────────────────────────────────────

interface PresetFile {
  contract: string; id: string; version: string; title: string; description: string;
  requires?: { capabilities?: string[] };
  settings?: { postingModes?: Record<string, string> };
  sample?: { fictional?: boolean; branches?: string; partners?: string; products?: string; documents?: string };
}

export function readPreset(id: string): PresetFile {
  if (!ID_RE.test(id)) throw Errors.notFound(`gói mẫu "${id}"`);
  const file = path.join(PRESETS_DIR, id, 'preset.json');
  if (!fs.existsSync(file)) throw Errors.notFound(`gói mẫu "${id}"`);
  const p = JSON.parse(fs.readFileSync(file, 'utf8')) as PresetFile;
  if (p.contract !== 'bizcity_preset@1' || p.id !== id) throw Errors.validation(`presets/${id}/preset.json không phải bizcity_preset@1 đúng mã thư mục`);
  if (p.sample && p.sample.fictional !== true) throw Errors.validation(`Gói ${id}: dữ liệu mẫu phải khai fictional: true (STD-PRE-2)`);
  return p;
}

export function listPresets(): PresetFile[] {
  if (!fs.existsSync(PRESETS_DIR)) return [];
  return fs.readdirSync(PRESETS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(PRESETS_DIR, e.name, 'preset.json')))
    .map((e) => readPreset(e.name));
}

const readSample = <T>(id: string, rel: string | undefined): T[] => (rel ? JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, id, rel), 'utf8')) as T[] : []);

/** "@today" / "@today-N" → YYYY-MM-DD theo giờ Việt Nam của máy chủ (STD-PRE-5). */
export function fillDates<T>(v: T, now = new Date()): T {
  const day = (n: number) => {
    const today = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const walk = (x: unknown): unknown => typeof x === 'string' ? x.replace(/^@today(?:-(\d+))?$/, (_m, n) => day(Number(n ?? 0)))
    : Array.isArray(x) ? x.map(walk) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)])) : x;
  return walk(v) as T;
}

// ── Khối ──────────────────────────────────────────────────────────────────────────

/** Một bản ghi: action Core + đầu vào; `key` để tra đã có chưa. */
interface Item { key: string; action: string; input: Record<string, unknown> }
interface Block { key: 'settings' | 'branches' | 'partners' | 'products' | 'documents'; label: string; items: Item[] }

function blocksOf(p: PresetFile, opts: { sample?: boolean; now?: Date } = {}): Block[] {
  const now = opts.now ?? new Date();
  const out: Block[] = [];
  if (p.settings?.postingModes) out.push({ key: 'settings', label: 'Chế độ ghi sổ theo loại chứng từ', items: [{ key: 'postingModes', action: 'core.posting-modes.update', input: p.settings.postingModes }] });
  if (!p.sample || opts.sample === false) return out;
  out.push({ key: 'branches', label: 'Chi nhánh', items: readSample<Record<string, unknown>>(p.id, p.sample.branches).map((b) => ({ key: String(b.code), action: 'core.branch.create', input: b })) });
  out.push({ key: 'partners', label: 'Đối tượng', items: readSample<Record<string, unknown>>(p.id, p.sample.partners).map((x) => ({ key: String(x.code), action: 'core.partner.upsert', input: x })) });
  out.push({ key: 'products', label: 'Mặt hàng', items: readSample<Record<string, unknown>>(p.id, p.sample.products).map((x) => ({ key: String(x.sku), action: 'core.catalog-product.save', input: { ...x, new: true } })) });
  out.push({ key: 'documents', label: 'Chứng từ', items: fillDates(readSample<Record<string, unknown>>(p.id, p.sample.documents), now).map((d) => ({ key: String(d.docKey), action: 'core.document.submit', input: { document: d } })) });
  return out;
}

/** Mã đã có trong đơn vị theo từng khối (danh mục theo mã, chứng từ theo docKey). Cấu hình: luôn "chưa có". */
async function existingKeys(trx: Db, tenantId: string, b: Block): Promise<Set<string>> {
  const keys = b.items.map((i) => i.key);
  if (!keys.length || b.key === 'settings') return new Set();
  const q = {
    branches: sql<{ k: string }>`SELECT code AS k FROM branches WHERE tenant_id = ${tenantId} AND code = ANY(${keys})`,
    partners: sql<{ k: string }>`SELECT code AS k FROM partners WHERE tenant_id = ${tenantId} AND code = ANY(${keys})`,
    products: sql<{ k: string }>`SELECT sku AS k FROM products WHERE tenant_id = ${tenantId} AND sku = ANY(${keys})`,
    documents: sql<{ k: string }>`SELECT doc_key AS k FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ANY(${keys})`,
  }[b.key];
  return new Set((await q.execute(trx)).rows.map((r) => r.k));
}

// ── Lần chạy ──────────────────────────────────────────────────────────────────────

interface StepState { key: string; label: string; total: number; written: number; skipped: number; failed: number; status: 'waiting' | 'running' | 'done'; firstError: { code: string; message: string; requestId: string } | null }
export interface RunRow { id: string; presetId: string; presetVersion: string; status: 'running' | 'done' | 'failed'; firstRun: boolean; steps: StepState[]; error: string | null; startedAt: string; finishedAt: string | null }

const STALE_ERROR = `Mất nhịp sống quá ${STALE_MINUTES} phút (máy chủ khởi động lại giữa chừng?) — bấm chạy lại`;
const isStale = (r: Record<string, unknown>) => r.status === 'running' && Date.now() - new Date(r.heartbeat_at as string).getTime() > STALE_MINUTES * 60_000;

/** Dòng sample_runs → DTO. Đang "running" mà mất nhịp sống → báo failed (đọc không ghi; startRun mới ghi failed vào bảng). */
const runDto = (r: Record<string, unknown>): RunRow => ({
  id: String(r.id), presetId: String(r.preset_id), presetVersion: String(r.preset_version),
  status: isStale(r) ? 'failed' : r.status as RunRow['status'], firstRun: Boolean(r.first_run),
  steps: r.steps as StepState[], error: isStale(r) ? STALE_ERROR : (r.error as string | null) ?? null,
  startedAt: new Date(r.started_at as string).toISOString(), finishedAt: r.finished_at ? new Date(r.finished_at as string).toISOString() : null,
});

/** Ghi failed cho lần chạy "running" mất nhịp sống (gọi trong giao dịch ghi của startRun). */
async function failStale(trx: Db, tenantId: string): Promise<void> {
  await sql`UPDATE sample_runs SET status = 'failed', error = ${STALE_ERROR}, finished_at = now()
            WHERE tenant_id = ${tenantId} AND status = 'running' AND heartbeat_at < now() - make_interval(mins => ${STALE_MINUTES})`.execute(trx);
}

/** Lần chạy gần nhất của mỗi gói (core.setup.status). */
export async function latestRuns(trx: Db, tenantId: string): Promise<RunRow[]> {
  const r = await sql<Record<string, unknown>>`SELECT DISTINCT ON (preset_id) * FROM sample_runs WHERE tenant_id = ${tenantId} ORDER BY preset_id, id DESC`.execute(trx);
  return r.rows.map(runDto);
}

export async function getRun(trx: Db, tenantId: string, id: string): Promise<RunRow> {
  const r = await sql<Record<string, unknown>>`SELECT * FROM sample_runs WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
  if (!r.rows[0]) throw Errors.notFound('lần chạy gói mẫu');
  return runDto(r.rows[0]);
}

// ── Xem trước ─────────────────────────────────────────────────────────────────────

export interface PlanResult {
  presetId: string; presetVersion: string; title: string;
  allowed: boolean; reason: string | null; empty: boolean; previousRun: RunRow | null; missingCapabilities: string[];
  blocks: { key: string; label: string; total: number; existing: number; toAdd: number }[];
}

export async function planPreset(trx: Db, tenantId: string, id: string, opts: { lock?: boolean; sample?: boolean } = {}): Promise<PlanResult & { _blocks: Block[] }> {
  const p = readPreset(id);
  const emptiness = await tenantEmptiness(trx, tenantId, { lock: opts.lock });
  const prev = await sql<Record<string, unknown>>`SELECT * FROM sample_runs WHERE tenant_id = ${tenantId} AND preset_id = ${id} ORDER BY id DESC LIMIT 1`.execute(trx);
  const previousRun = prev.rows[0] ? runDto(prev.rows[0]) : null;
  const caps = (STANDARD?.capabilities ?? []) as { id: string; status: string }[];
  const available = new Set(caps.filter((c) => c.status === 'available').map((c) => c.id));
  const missingCapabilities = (p.requires?.capabilities ?? []).filter((c) => !available.has(c));
  const blocks = blocksOf(p, { sample: opts.sample });
  const counted = [];
  for (const b of blocks) {
    // cấu hình chỉ đặt ở lần chạy đầu (đơn vị trắng); khối khác: mã / docKey đã có trong đơn vị
    const have = b.key === 'settings' ? (emptiness.empty ? 0 : b.items.length) : (await existingKeys(trx, tenantId, b)).size;
    counted.push({ key: b.key, label: b.label, total: b.items.length, existing: have, toAdd: b.items.length - have });
  }
  const reason = missingCapabilities.length ? `Core chưa có năng lực: ${missingCapabilities.join(', ')}`
    : !emptiness.empty && !previousRun ? 'Đơn vị đã có dữ liệu nghiệp vụ — chỉ nạp gói mẫu vào đơn vị trắng (hoặc đơn vị mẫu riêng)'
      : null;
  return { presetId: p.id, presetVersion: p.version, title: p.title, allowed: reason === null, reason, empty: emptiness.empty, previousRun, missingCapabilities, blocks: counted, _blocks: blocks };
}

// ── Chạy ──────────────────────────────────────────────────────────────────────────

/** Bắt đầu một lần chạy: kiểm (có khoá) + ghi dòng running trong một giao dịch. Trả lần chạy (cũ nếu cùng Idempotency-Key). */
export async function startRun(auth: AuthContext, id: string, idempotencyKey: string, opts: { sample?: boolean } = {}): Promise<{ run: RunRow; fresh: boolean }> {
  readPreset(id);
  return db.transaction().execute(async (trx) => {
    const tenantId = auth.tenantId;
    const plan = await planPreset(trx, tenantId, id, { lock: true, sample: opts.sample });
    await failStale(trx, tenantId);
    const same = await sql<Record<string, unknown>>`SELECT * FROM sample_runs WHERE tenant_id = ${tenantId} AND idempotency_key = ${idempotencyKey}`.execute(trx);
    if (same.rows[0]) return { run: runDto(same.rows[0]), fresh: false };
    const running = await sql<{ id: string }>`SELECT id FROM sample_runs WHERE tenant_id = ${tenantId} AND status = 'running'`.execute(trx);
    if (running.rows[0]) throw Errors.conflict(`Đang chạy một gói mẫu cho đơn vị này (lần chạy ${running.rows[0].id}) — chờ xong rồi chạy lại`, { reason: 'SETUP_RUNNING', runId: running.rows[0].id });
    if (plan.missingCapabilities.length) throw Errors.validation(plan.reason!, { missingCapabilities: plan.missingCapabilities });
    if (!plan.allowed) throw Errors.conflict(plan.reason!, { reason: 'SETUP_NOT_EMPTY' });
    const steps: StepState[] = plan._blocks.map((b) => ({ key: b.key, label: b.label, total: b.items.length, written: 0, skipped: 0, failed: 0, status: 'waiting', firstError: null }));
    const r = await sql<Record<string, unknown>>`INSERT INTO sample_runs (tenant_id, preset_id, preset_version, first_run, steps, idempotency_key, started_by)
      VALUES (${tenantId}, ${id}, ${plan.presetVersion}, ${plan.empty}, ${JSON.stringify(steps)}::jsonb, ${idempotencyKey}, ${auth.actor}) RETURNING *`.execute(trx);
    return { run: runDto(r.rows[0]!), fresh: true };
  });
}

const actionDef = (id: string) => {
  const d = listActions().find((a) => a.id === id);
  if (!d) throw Errors.notReady(`Chưa đăng ký action ${id}`);
  return d;
};

/** Chạy các khối của một lần chạy (sau khi trả runId). Mỗi bản ghi một action con, giao dịch riêng. Không ném lỗi ra ngoài. */
export async function executeRun(auth: AuthContext, run: RunRow): Promise<RunRow> {
  const tenantId = auth.tenantId;
  const save = (steps: StepState[], fin?: { status: 'done' | 'failed'; error?: string }) =>
    sql`UPDATE sample_runs SET steps = ${JSON.stringify(steps)}::jsonb, heartbeat_at = now()
        ${fin ? sql`, status = ${fin.status}, error = ${fin.error ?? null}, finished_at = now()` : sql``}
        WHERE tenant_id = ${tenantId} AND id = ${run.id}`.execute(db);
  const steps = run.steps.map((s) => ({ ...s }));
  try {
    // khối của lần chạy = khối đã ghi ở steps lúc bắt đầu (sample = false thì chỉ cấu hình)
    const keys = new Set(run.steps.map((x) => x.key));
    const blocks = blocksOf(readPreset(run.presetId)).filter((b) => keys.has(b.key));
    for (const b of blocks) {
      const st = steps.find((s) => s.key === b.key)!;
      st.status = 'running';
      await save(steps);
      const have = await existingKeys(db, tenantId, b);
      for (const [n, it] of b.items.entries()) {
        if ((b.key === 'settings' && !run.firstRun) || (b.key !== 'documents' && have.has(it.key))) { st.skipped++; continue; }
        const requestId = `setup:${run.id}:${b.key}:${n}`;
        try {
          const res = await runAction(actionDef(it.action), it.input, { auth, requestId, idempotencyKey: requestId });
          const status = (res.data as { status?: string } | undefined)?.status;
          if (status === 'unchanged') st.skipped++;
          else if (status === 'error') { st.failed++; st.firstError ??= { code: 'POSTING_FAILED', message: `Chứng từ ${it.key} lỗi định khoản`, requestId }; }
          else st.written++;
        } catch (err) {
          st.failed++;
          const e = err as { code?: string; message?: string };
          st.firstError ??= { code: e.code ?? 'INTERNAL', message: String(e.message ?? err).slice(0, 300), requestId };
        }
        await save(steps);
      }
      st.status = 'done';
    }
    await save(steps, { status: 'done' });
  } catch (err) {
    await save(steps, { status: 'failed', error: String((err as Error).message ?? err).slice(0, 500) });
  }
  return getRun(db, tenantId, run.id);
}

// ── Action đọc ────────────────────────────────────────────────────────────────────

const tags = ['Thiết lập'];
const stepSchema = z.object({ key: z.string(), label: z.string(), total: z.number(), written: z.number(), skipped: z.number(), failed: z.number(), status: z.string(), firstError: z.object({ code: z.string(), message: z.string(), requestId: z.string() }).nullable() });
export const runSchema = z.object({ id: z.string(), presetId: z.string(), presetVersion: z.string(), status: z.enum(['running', 'done', 'failed']), firstRun: z.boolean(), steps: z.array(stepSchema), error: z.string().nullable(), startedAt: z.string(), finishedAt: z.string().nullable() });

export const setupRunActions: AnyActionDef[] = [
  defineAction({
    id: 'core.setup.presets', title: 'Thiết lập: các gói mẫu theo ngành có trong bản cài', tags,
    permission: 'catalog:read', effect: 'read', idempotency: 'none',
    input: z.object({}),
    output: z.array(z.object({ id: z.string(), version: z.string(), title: z.string(), description: z.string(), blocks: z.array(z.object({ key: z.string(), label: z.string(), total: z.number() })) })),
    expose: { http: { method: 'GET', path: '/api/v1/setup/presets' }, mcp: true, ai: 'read' },
    handler: async () => listPresets().map((p) => ({ id: p.id, version: p.version, title: p.title, description: p.description, blocks: blocksOf(p).map((b) => ({ key: b.key, label: b.label, total: b.items.length })) })),
  }),
  defineAction({
    id: 'core.setup.plan', title: 'Thiết lập: xem trước một gói mẫu cho đơn vị đang dùng (không ghi gì)', tags,
    description: 'Mỗi khối: tổng, đã có, sẽ thêm. allowed = chạy được không (đơn vị trắng, hoặc đã từng chạy cùng gói); reason nói vì sao không.',
    permission: 'settings:write', effect: 'read', idempotency: 'none',
    input: z.object({ id: z.string().regex(ID_RE).max(64), sample: queryBool.default(true).describe('false = chỉ khối cấu hình, không dữ liệu mẫu') }),
    output: z.object({
      presetId: z.string(), presetVersion: z.string(), title: z.string(), allowed: z.boolean(), reason: z.string().nullable(), empty: z.boolean(),
      previousRun: runSchema.nullable(), missingCapabilities: z.array(z.string()),
      blocks: z.array(z.object({ key: z.string(), label: z.string(), total: z.number(), existing: z.number(), toAdd: z.number() })),
    }),
    expose: { http: { method: 'GET', path: '/api/v1/setup/presets/:id/plan' }, mcp: true, ai: 'read' },
    handler: async (ctx, input) => { const { _blocks, ...plan } = await planPreset(ctx.data.tx, ctx.tenant.id, input.id, { sample: input.sample }); return plan; },
  }),
  defineAction({
    id: 'core.setup.run', title: 'Thiết lập: tiến độ một lần chạy gói mẫu', tags,
    permission: 'catalog:read', effect: 'read', idempotency: 'none',
    input: z.object({ id: z.string().regex(/^\d+$/) }),
    output: runSchema,
    expose: { http: { method: 'GET', path: '/api/v1/setup/runs/:id' }, mcp: true, ai: 'read' },
    handler: (ctx, input) => getRun(ctx.data.tx, ctx.tenant.id, input.id),
  }),
];
