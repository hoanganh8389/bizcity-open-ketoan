// @bizcity-layer P audit
// [2026-11-06 09:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-30b/c: bản niêm phong của bằng chứng (ADR-0030, bizcity_evidence@1 §8) — tác vụ evidence.seal, kiểm ba chiều, băm TS hashVersion 1, chẩn đoán EVIDENCE_SEAL_*
/**
 * BẢN NIÊM PHONG CỦA BẰNG CHỨNG (ADR-0030, bizcity_evidence@1 §8, STD-EVD-4 ngoại lệ hẹp, STD-EVD-9..10).
 *
 * `audit_logs` là nơi ghi DUY NHẤT (D-SEAL-1). Tệp này là chỗ DUY NHẤT trong repo được ghi bằng chứng ra tệp (SC-EVD-1 miễn đúng
 * tệp này; SC-EVD-9 chặn mọi nơi khác ghi dưới `bang-chung`). Tệp chỉ sinh TỪ bảng, sau khi ngày đã đóng.
 *
 *   sealTenant(trx, đơn vị, hôm nay)   chốt các ngày chưa niêm phong tới hôm qua (giờ VN): DATA_DIR/bang-chung/<đv>/<yyyy>/<mm>/<dd>.jsonl
 *                                      + <dd>.manifest.json. Ngày đã có manifest thì chỉ kiểm lại, không bao giờ ghi đè.
 *   verifySeals(trx, đơn vị, từ, đến)   kiểm ba chiều: từng tệp tự kiểm (băm dòng, nối dòng, băm tệp) · manifest nối ngày ·
 *                                      manifest ↔ CSDL (khoảng số thứ tự, băm từng dòng, băm tính lại trong CSDL). Chỉ đọc, không trả nội dung dòng.
 *   evidenceSealSubscriber             `evidence.seal`, nghe bizcity.clock.daily (01:00 giờ VN).
 *   SEAL_DIAGNOSTICS                   EVIDENCE_SEAL_MISSING / _FILE / _DB / _CHAIN (L3, chỉ đọc).
 *
 * Ranh giới ngày theo SỐ THỨ TỰ: created_at là giờ bắt đầu giao dịch nên số thứ tự có thể xen giữa hai ngày. cut(D) = chain_seq lớn
 * nhất có created_at trước hết ngày D (giờ VN); ngày D gồm các dòng chain_seq ∈ (cut(D−1), cut(D)]. Các ngày nối liền, không sót dòng
 * (chuỗi được cấp số dưới khoá tư vấn theo đơn vị, nên số đã cấp là số đã commit theo thứ tự).
 *
 * Niêm phong không chặn nghiệp vụ và không bao giờ được đọc ngược để quyết quyền hay quyết ghi sổ (D-SEAL-8).
 */
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'kysely';
import type { Remedy } from '@ketoan/contracts';
import type { Db } from '../db/client.js';
import { CLOCK_TZ, defineSubscriber } from './events.js';
import type { DiagCheck } from '../system/diagnostics.js';

export const SEAL_CONTRACT = 'bizcity_evidence_seal@1';
export const SEAL_HASH_VERSION = 1;
/** Một lần chạy chốt tối đa ngần này ngày (bản cài cũ lần đầu bật niêm phong đuổi dần qua các đêm). */
export const SEAL_MAX_DAYS = 400;
/** Ngày đã đóng quá ngần này ngày mà chưa niêm phong → EVIDENCE_SEAL_MISSING. */
export const SEAL_GRACE_DAYS = 2;
const SEAL_LOCK = 727030;

export type SealCode = 'EVIDENCE_SEAL_MISSING' | 'EVIDENCE_SEAL_FILE' | 'EVIDENCE_SEAL_DB' | 'EVIDENCE_SEAL_CHAIN';

/** Một dòng tệp niêm phong (§8): đúng các đầu vào của audit_log_hash + băm; traceId để đọc, không được niêm phong. */
export interface SealRow {
  hashVersion: number;
  id: string;
  tenantId: string;
  chainSeq: number;
  prevHash: string | null;
  createdAtHash: string;
  actor: string;
  actorKind: string;
  actorVia: string | null;
  onBehalfOf: string | null;
  action: string;
  moduleId: string | null;
  moduleVersion: string | null;
  objectType: string;
  objectId: string | null;
  subject: string | null;
  requestId: string | null;
  correlationId: string | null;
  idempotencyKey: string | null;
  inputHash: string | null;
  resultOk: boolean;
  resultCode: string | null;
  dryRun: boolean;
  beforeDataText: string | null;
  afterDataText: string | null;
  traceId: string | null;
  hash: string;
}

export interface SealManifest {
  contract: typeof SEAL_CONTRACT;
  tenant: string;
  date: string;
  hashVersion: number;
  firstSeq: number | null;
  lastSeq: number | null;
  rows: number;
  prevHashOfFirst: string | null;
  lastHash: string | null;
  fileSha256: string;
  prevManifestSha256: string | null;
  sealedAt: string;
  sealer: 'platform';
  alg: 'sha256';
  signature: null | { alg: string; keyId: string; value: string };
}

export interface SealFinding { code: SealCode; date: string; detail: string }
export interface SealReport { from: string; to: string; days: number; sealed: number; rows: number; findings: SealFinding[] }

const sha256 = (s: string | Buffer) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

/** Bản TypeScript của audit_log_hash (migration 0036) — hashVersion 1: các trường nối bằng U+001F, NULL thành chuỗi rỗng. */
export function sealRowHash(r: Omit<SealRow, 'hash' | 'traceId' | 'hashVersion'>): string {
  return sha256(Buffer.from([
    r.id, r.tenantId, String(r.chainSeq), r.prevHash ?? '', r.createdAtHash,
    r.actor, r.actorKind, r.actorVia ?? '', r.onBehalfOf ?? '',
    r.action, r.moduleId ?? '', r.moduleVersion ?? '', r.objectType, r.objectId ?? '', r.subject ?? '',
    r.requestId ?? '', r.correlationId ?? '', r.idempotencyKey ?? '', r.inputHash ?? '',
    String(r.resultOk), r.resultCode ?? '', String(r.dryRun),
    r.beforeDataText ?? '', r.afterDataText ?? '',
  ].join('\u001f'), 'utf8'));
}

// ---------- ngày, đường dẫn ----------

export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const sealRoot = (tenantId: string) => path.resolve(process.env.DATA_DIR ?? './data', 'bang-chung', tenantId);
export function sealPaths(tenantId: string, date: string) {
  const [y, m, d] = date.split('-');
  const dir = path.join(sealRoot(tenantId), y!, m!);
  return { jsonl: path.join(dir, `${d}.jsonl`), manifest: path.join(dir, `${d}.manifest.json`) };
}

/** Các ngày đã có manifest, tăng dần. */
export function sealedDates(tenantId: string): string[] {
  const root = sealRoot(tenantId);
  const out: string[] = [];
  const dirs = (p: string, re: RegExp) => (fs.existsSync(p) ? fs.readdirSync(p).filter((x) => re.test(x)).sort() : []);
  for (const y of dirs(root, /^\d{4}$/)) for (const m of dirs(path.join(root, y), /^\d{2}$/)) {
    for (const f of dirs(path.join(root, y, m), /^\d{2}\.manifest\.json$/)) out.push(`${y}-${m}-${f.slice(0, 2)}`);
  }
  return out;
}

const readManifest = (tenantId: string, date: string): { raw: Buffer; m: SealManifest } | null => {
  const p = sealPaths(tenantId, date).manifest;
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p);
  return { raw, m: JSON.parse(raw.toString('utf8')) as SealManifest };
};

/** Ghi một lần: tệp tạm (cờ loại trừ) + fsync, rồi link sang tên thật — link không bao giờ đè tệp có sẵn (EEXIST). */
function writeOnce(target: string, content: string): 'written' | 'exists' {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o750 });
  if (fs.existsSync(target)) return 'exists';
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  const fd = fs.openSync(tmp, 'wx', 0o640);
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.linkSync(tmp, target);
    return 'written';
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return 'exists';
    throw err;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// ---------- CSDL ----------

const dayStart = (date: string) => sql`(${date}::date)::timestamp AT TIME ZONE ${CLOCK_TZ}`;

/** Ngày (giờ VN) của dòng có chuỗi sớm nhất; null = đơn vị chưa có bằng chứng nào có chuỗi. */
async function firstChainedDate(trx: Db, tenantId: string): Promise<string | null> {
  const r = await sql<{ d: string | null }>`
    SELECT to_char(min(created_at) AT TIME ZONE ${CLOCK_TZ}, 'YYYY-MM-DD') AS d
      FROM audit_logs WHERE tenant_id = ${tenantId} AND chain_seq IS NOT NULL`.execute(trx);
  return r.rows[0]?.d ?? null;
}

/** cut(D) cho mọi D ∈ [from − 1, to]: chain_seq lớn nhất có created_at trước hết ngày D (0 = chưa có dòng nào). */
async function dayCuts(trx: Db, tenantId: string, from: string, to: string): Promise<Map<string, number>> {
  const base = await sql<{ s: string | null }>`
    SELECT max(chain_seq)::text AS s FROM audit_logs
     WHERE tenant_id = ${tenantId} AND chain_seq IS NOT NULL AND created_at < ${dayStart(from)}`.execute(trx);
  const days = await sql<{ d: string; s: string }>`
    SELECT to_char(created_at AT TIME ZONE ${CLOCK_TZ}, 'YYYY-MM-DD') AS d, max(chain_seq)::text AS s FROM audit_logs
     WHERE tenant_id = ${tenantId} AND chain_seq IS NOT NULL AND created_at >= ${dayStart(from)} AND created_at < ${dayStart(addDays(to, 1))}
     GROUP BY 1`.execute(trx);
  const perDay = new Map(days.rows.map((r) => [r.d, Number(r.s)]));
  const out = new Map<string, number>();
  let cut = Number(base.rows[0]?.s ?? 0);
  out.set(addDays(from, -1), cut);
  for (let d = from; d <= to; d = addDays(d, 1)) {
    cut = Math.max(cut, perDay.get(d) ?? 0);
    out.set(d, cut);
  }
  return out;
}

async function hashAt(trx: Db, tenantId: string, seq: number): Promise<string | null> {
  if (seq <= 0) return null;
  const r = await sql<{ hash: string | null }>`SELECT hash FROM audit_logs WHERE tenant_id = ${tenantId} AND chain_seq = ${seq}`.execute(trx);
  return r.rows[0]?.hash ?? null;
}

/** Dòng bằng chứng chain_seq ∈ (lo, hi] ở khuôn dòng tệp (§8). */
export async function readSealRows(trx: Db, tenantId: string, lo: number, hi: number): Promise<SealRow[]> {
  if (hi <= lo) return [];
  const r = await sql<{
    id: string; tenant_id: string; chain_seq: string; prev_hash: string | null; created_at_hash: string; actor: string; actor_kind: string;
    actor_via: string | null; on_behalf_of: string | null; action: string; module_id: string | null; module_version: string | null;
    object_type: string; object_id: string | null; subject: string | null; request_id: string | null; correlation_id: string | null;
    idempotency_key: string | null; input_hash: string | null; result_ok: boolean; result_code: string | null; dry_run: boolean;
    before_text: string | null; after_text: string | null; trace_id: string | null; hash: string;
  }>`
    SELECT a.id::text AS id, a.tenant_id::text AS tenant_id, a.chain_seq::text AS chain_seq, a.prev_hash,
           to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_hash,
           a.actor, a.actor_kind, a.actor_via, a.on_behalf_of, a.action, a.module_id, a.module_version, a.object_type, a.object_id, a.subject,
           a.request_id::text AS request_id, a.correlation_id::text AS correlation_id, a.idempotency_key, a.input_hash,
           a.result_ok, a.result_code, a.dry_run, a.before_data::text AS before_text, a.after_data::text AS after_text,
           a.trace_id::text AS trace_id, a.hash
      FROM audit_logs a
     WHERE a.tenant_id = ${tenantId} AND a.chain_seq > ${lo} AND a.chain_seq <= ${hi}
     ORDER BY a.chain_seq`.execute(trx);
  return r.rows.map((x) => ({
    hashVersion: SEAL_HASH_VERSION, id: x.id, tenantId: x.tenant_id, chainSeq: Number(x.chain_seq), prevHash: x.prev_hash,
    createdAtHash: x.created_at_hash, actor: x.actor, actorKind: x.actor_kind, actorVia: x.actor_via, onBehalfOf: x.on_behalf_of,
    action: x.action, moduleId: x.module_id, moduleVersion: x.module_version, objectType: x.object_type, objectId: x.object_id,
    subject: x.subject, requestId: x.request_id, correlationId: x.correlation_id, idempotencyKey: x.idempotency_key,
    inputHash: x.input_hash, resultOk: x.result_ok, resultCode: x.result_code, dryRun: x.dry_run,
    beforeDataText: x.before_text, afterDataText: x.after_text, traceId: x.trace_id, hash: x.hash,
  }));
}

// ---------- niêm phong ----------

export interface SealRun { sealed: string[]; checked: string[]; mismatched: string[]; pending: number }

/**
 * Chốt các ngày chưa niêm phong của một đơn vị, tới hôm qua so với `today` (YYYY-MM-DD giờ VN). Chạy lại an toàn: ngày đã có
 * manifest chỉ được kiểm lại băm tệp. Ngày mới bắt đầu sau manifest cuối cùng (không lấp ngày bị xoá giữa chuỗi — đó là
 * EVIDENCE_SEAL_CHAIN, phải có người xem).
 */
export async function sealTenant(trx: Db, tenantId: string, today: string): Promise<SealRun> {
  if (!DATE_RE.test(today)) throw new Error(`evidence.seal: ngày "${today}" sai khuôn YYYY-MM-DD`);
  await sql`SELECT pg_advisory_xact_lock(${SEAL_LOCK}, ${tenantId}::integer)`.execute(trx);
  const out: SealRun = { sealed: [], checked: [], mismatched: [], pending: 0 };
  const until = addDays(today, -1);
  const done = sealedDates(tenantId);
  const last = done[done.length - 1];
  if (last) {
    const m = readManifest(tenantId, last)!;
    const file = sealPaths(tenantId, last).jsonl;
    (fs.existsSync(file) && sha256(fs.readFileSync(file)) === m.m.fileSha256 ? out.checked : out.mismatched).push(last);
  }
  const start = last ? addDays(last, 1) : await firstChainedDate(trx, tenantId);
  if (!start || start > until) return out;
  const end = addDays(start, SEAL_MAX_DAYS - 1) < until ? addDays(start, SEAL_MAX_DAYS - 1) : until;
  out.pending = Math.max(0, Math.round((Date.parse(until) - Date.parse(end)) / 86_400_000));
  const cuts = await dayCuts(trx, tenantId, start, end);
  let prevManifest = last ? readManifest(tenantId, last)!.raw : null;
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const lo = cuts.get(addDays(date, -1))!;
    const hi = cuts.get(date)!;
    const rows = await readSealRows(trx, tenantId, lo, hi);
    const content = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
    const p = sealPaths(tenantId, date);
    if (writeOnce(p.jsonl, content) === 'exists' && sha256(fs.readFileSync(p.jsonl)) !== sha256(content)) {
      // tệp ngày đã có (lần trước dừng giữa chừng) mà khác bản sinh từ CSDL: không đè, dừng chuỗi để người xem (EVIDENCE_SEAL_FILE / _DB)
      out.mismatched.push(date);
      return out;
    }
    const prevHashOfFirst = await hashAt(trx, tenantId, lo);
    const manifest: SealManifest = {
      contract: SEAL_CONTRACT, tenant: tenantId, date, hashVersion: SEAL_HASH_VERSION,
      firstSeq: rows.length ? rows[0]!.chainSeq : null, lastSeq: rows.length ? rows[rows.length - 1]!.chainSeq : null, rows: rows.length,
      prevHashOfFirst, lastHash: rows.length ? rows[rows.length - 1]!.hash : prevHashOfFirst,
      fileSha256: sha256(content), prevManifestSha256: prevManifest ? sha256(prevManifest) : null,
      sealedAt: new Date().toISOString(), sealer: 'platform', alg: 'sha256', signature: null,
    };
    const raw = `${JSON.stringify(manifest)}\n`;
    if (writeOnce(p.manifest, raw) === 'exists') {
      out.checked.push(date);
      prevManifest = fs.readFileSync(p.manifest);
    } else {
      out.sealed.push(date);
      prevManifest = Buffer.from(raw, 'utf8');
    }
  }
  return out;
}

/** Tác vụ evidence.seal (D-SEAL-3): đồng hồ ngày phát lúc 01:00 giờ VN, mỗi đơn vị một lượt; chốt tới hôm qua. */
export const evidenceSealSubscriber = defineSubscriber({
  id: 'evidence.seal',
  module: 'bizcity.platform',
  on: ['bizcity.clock.daily'],
  retry: { maxAttempts: 3 },
  async handle(ctx, event) {
    await sealTenant(ctx.tx, ctx.tenantId, String(event.data.date));
  },
});

// ---------- kiểm ----------

/** Kiểm một tệp ngày không cần CSDL: băm tệp, băm từng dòng, nối dòng, số thứ tự liền, khớp manifest. Trả lý do hỏng hoặc null. */
export function checkSealFile(m: SealManifest, content: Buffer | null): string | null {
  if (m.contract !== SEAL_CONTRACT) return `manifest sai hợp đồng ${String(m.contract)}`;
  if (content == null) return 'thiếu tệp .jsonl';
  if (sha256(content) !== m.fileSha256) return 'băm tệp khác manifest';
  const lines = content.toString('utf8').split('\n').filter((l) => l.length);
  if (lines.length !== m.rows) return `số dòng ${lines.length} ≠ manifest ${m.rows}`;
  let prev = m.prevHashOfFirst;
  let seq = m.firstSeq;
  for (const [i, line] of lines.entries()) {
    let r: SealRow;
    try { r = JSON.parse(line) as SealRow; } catch { return `dòng ${i + 1}: không phải JSON`; }
    if (r.hashVersion !== 1) return `dòng ${i + 1}: hashVersion ${String(r.hashVersion)} chưa hỗ trợ`;
    if (r.chainSeq !== seq) return `dòng ${i + 1}: số thứ tự ${r.chainSeq} (chờ ${String(seq)})`;
    if ((r.prevHash ?? null) !== prev) return `dòng ${i + 1}: không nối dòng trước`;
    if (sealRowHash(r) !== r.hash) return `dòng ${i + 1}: băm sai`;
    prev = r.hash;
    seq = r.chainSeq + 1;
  }
  if (m.rows && m.lastSeq !== seq! - 1) return 'lastSeq khác dòng cuối';
  if (m.lastHash !== prev) return 'lastHash khác dòng cuối';
  return null;
}

/** Kiểm ba chiều trong [from, to] (STD-EVD-10). Chỉ đọc; findings chỉ có ngày + lý do, không nội dung dòng. */
export async function verifySeals(trx: Db, tenantId: string, from: string, to: string, today: string): Promise<SealReport> {
  const report: SealReport = { from, to, days: 0, sealed: 0, rows: 0, findings: [] };
  const first = await firstChainedDate(trx, tenantId);
  const start = first && first > from ? first : from;
  if (!first || start > to) return report;
  const cuts = await dayCuts(trx, tenantId, start, to);
  const overdue = addDays(today, -(SEAL_GRACE_DAYS + 1));
  const add = (code: SealCode, date: string, detail: string) => report.findings.push({ code, date, detail });
  const firstSealed = sealedDates(tenantId)[0];
  for (let date = start; date <= to; date = addDays(date, 1)) {
    report.days += 1;
    const cur = readManifest(tenantId, date);
    if (!cur) {
      if (date <= overdue) add('EVIDENCE_SEAL_MISSING', date, 'ngày đã đóng chưa niêm phong');
      continue;
    }
    report.sealed += 1;
    const m = cur.m;
    report.rows += m.rows;
    // (b) tệp tự kiểm
    const file = sealPaths(tenantId, date).jsonl;
    const bad = checkSealFile(m, fs.existsSync(file) ? fs.readFileSync(file) : null);
    if (bad) add('EVIDENCE_SEAL_FILE', date, bad);
    // (c1) manifest nối ngày
    const prev = readManifest(tenantId, addDays(date, -1));
    if (prev) {
      if (m.prevManifestSha256 !== sha256(prev.raw)) add('EVIDENCE_SEAL_CHAIN', date, 'prevManifestSha256 khác manifest ngày trước');
      else if (m.prevHashOfFirst !== prev.m.lastHash) add('EVIDENCE_SEAL_CHAIN', date, 'prevHashOfFirst khác lastHash ngày trước');
    } else if (date !== firstSealed || m.prevManifestSha256 !== null) {
      add('EVIDENCE_SEAL_CHAIN', date, 'thiếu manifest ngày trước');
    }
    // (c2) manifest ↔ CSDL: cùng khoảng số thứ tự, cùng băm từng dòng, băm tính lại trong CSDL khớp
    const lo = cuts.get(addDays(date, -1))!;
    const hi = cuts.get(date)!;
    const expFirst = hi > lo ? lo + 1 : null;
    const expLast = hi > lo ? hi : null;
    if (m.firstSeq !== expFirst || m.lastSeq !== expLast) {
      add('EVIDENCE_SEAL_DB', date, `khoảng số thứ tự ${String(m.firstSeq)}..${String(m.lastSeq)} ≠ CSDL ${String(expFirst)}..${String(expLast)}`);
      continue;
    }
    const db = await sql<{ n: number; bad: number; agg: string | null }>`
      SELECT count(*)::int AS n,
             count(*) FILTER (WHERE a.hash IS DISTINCT FROM audit_log_hash(a))::int AS bad,
             string_agg(a.hash, ',' ORDER BY a.chain_seq) AS agg
        FROM audit_logs a WHERE a.tenant_id = ${tenantId} AND a.chain_seq > ${lo} AND a.chain_seq <= ${hi}`.execute(trx);
    const x = db.rows[0]!;
    if (x.n !== m.rows) add('EVIDENCE_SEAL_DB', date, `CSDL có ${x.n} dòng, tệp ${m.rows}`);
    else if (x.bad) add('EVIDENCE_SEAL_DB', date, `${x.bad} dòng trong CSDL băm lại không khớp`);
    else if (!bad && fs.existsSync(file)) {
      const fileHashes = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.length).map((l) => (JSON.parse(l) as SealRow).hash).join(',');
      if ((x.agg ?? '') !== fileHashes) add('EVIDENCE_SEAL_DB', date, 'băm dòng trong CSDL khác tệp');
    }
  }
  return report;
}

/** Hôm nay theo giờ VN. */
export const vnToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: CLOCK_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

// ---------- chẩn đoán ----------

const REMEDY_TAMPER: Omit<Remedy, 'verify'> = {
  steps: [
    { text: 'Chạy GET /api/v1/evidence/verify cho khoảng ngày bị báo; giữ nguyên tệp và CSDL (không xoá, không sinh lại)', role: 'operator' },
    { text: 'Đối chiếu thư mục bang-chung với bản sao lưu; báo nhóm Lõi và ban kiểm soát, lập biên bản sự cố', role: 'owner' },
  ],
  owner: 'core_team',
};

/** Phần chạy chung của bốn kiểm: verifySeals trên khoảng (mặc định 31 ngày tới hôm qua), lọc theo mã. */
const runSeal = (code: SealCode): DiagCheck['run'] => async (trx, s) => {
  const today = vnToday();
  const to = s.to && s.to < addDays(today, -1) ? s.to : addDays(today, -1);
  const r = await verifySeals(trx as unknown as Db, s.tenantId, s.from ?? addDays(to, -30), to, today);
  const hits = r.findings.filter((f) => f.code === code);
  return { examined: code === 'EVIDENCE_SEAL_MISSING' ? r.days : r.sealed, count: hits.length, sample: hits.slice(0, 20).map((f) => `${f.date}: ${f.detail}`) };
};

/** Cùng mã với lane tests/conformance/diagnostics/evidence.diag.mjs (SC-DIAG-1). */
export const SEAL_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'EVIDENCE_SEAL_MISSING', layer: 'L3', level: 'warn', scoped: true,
    title: 'Ngày đã đóng quá 2 ngày đều đã niêm phong bằng chứng',
    fix: 'Tác vụ evidence.seal không chạy hoặc lỗi: xem sự kiện dead của evidence.seal, sửa nguyên nhân (DATA_DIR ghi được, còn chỗ) rồi phát lại; nghiệp vụ không bị chặn.',
    remedy: { steps: [{ text: 'Xem lỗi giao của evidence.seal (GET /api/v1/system/events)', role: 'operator' }, { text: 'Kiểm DATA_DIR ghi được, còn dung lượng; phát lại sự kiện đồng hồ ngày', role: 'operator' }], owner: 'operator', verify: { code: 'EVIDENCE_SEAL_MISSING' } },
    run: runSeal('EVIDENCE_SEAL_MISSING'),
  },
  {
    code: 'EVIDENCE_SEAL_FILE', layer: 'L3', level: 'error', scoped: true,
    title: 'Tệp niêm phong bằng chứng đủ, đúng băm, từng dòng tự kiểm được',
    fix: 'Tệp niêm phong bị thiếu, sửa hoặc hỏng sau khi chốt. Không sinh lại tệp; đối chiếu bản sao lưu và báo nhóm Lõi.',
    remedy: { ...REMEDY_TAMPER, verify: { code: 'EVIDENCE_SEAL_FILE' } },
    run: runSeal('EVIDENCE_SEAL_FILE'),
  },
  {
    code: 'EVIDENCE_SEAL_DB', layer: 'L3', level: 'error', scoped: true,
    title: 'Bằng chứng trong CSDL khớp bản niêm phong (khoảng số thứ tự, băm từng dòng)',
    fix: 'CSDL khác bản đã niêm phong: có dòng bị sửa / xoá / chèn trong CSDL sau ngày chốt. Giữ nguyên hiện trạng, báo nhóm Lõi và ban kiểm soát.',
    remedy: { ...REMEDY_TAMPER, verify: { code: 'EVIDENCE_SEAL_DB' } },
    run: runSeal('EVIDENCE_SEAL_DB'),
  },
  {
    code: 'EVIDENCE_SEAL_CHAIN', layer: 'L3', level: 'error', scoped: true,
    title: 'Các manifest niêm phong nối liền theo ngày (prevManifestSha256)',
    fix: 'Một ngày niêm phong bị xoá hoặc thay: manifest ngày sau không còn nối đúng. Không sinh lại; đối chiếu bản sao lưu, báo nhóm Lõi.',
    remedy: { ...REMEDY_TAMPER, verify: { code: 'EVIDENCE_SEAL_CHAIN' } },
    run: runSeal('EVIDENCE_SEAL_CHAIN'),
  },
];
