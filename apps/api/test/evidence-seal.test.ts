// [2026-11-06 09:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-30b/c: bản niêm phong bằng chứng — T030-SEAL-1..8 (chữ chốt: docs/adr/ADR-0030-ban-niem-phong-bang-chung.md)
/**
 * Bản niêm phong của bằng chứng (ADR-0030, bizcity_evidence@1 §8).
 *   T030-SEAL-1  băm TypeScript (hashVersion 1) = hash đã lưu trong CSDL, trên mọi dòng có chuỗi của vài đơn vị
 *   T030-SEAL-2  niêm phong các ngày đã đóng: tệp + manifest đúng khuôn; ngày trống vẫn có manifest; manifest nối ngày; kiểm đạt
 *   T030-SEAL-3  chạy lại an toàn: không ghi lại, không đổi byte nào; dừng giữa chừng (có .jsonl, chưa manifest) thì làm tiếp
 *   T030-SEAL-4  sửa tệp → EVIDENCE_SEAL_FILE; CLI ngoại tuyến cũng bắt
 *   T030-SEAL-5  sửa CSDL sau ngày chốt (vượt trigger) → EVIDENCE_SEAL_DB
 *   T030-SEAL-6  xoá một ngày giữa chuỗi → EVIDENCE_SEAL_CHAIN (+ MISSING); tệp ngày khác bản CSDL thì không bị ghi đè
 *   T030-SEAL-7  ngày đã đóng quá hạn chưa niêm phong → EVIDENCE_SEAL_MISSING; trong hạn thì chưa báo
 *   T030-SEAL-8  GET /api/v1/evidence/verify: quyền conformance:run, khoảng ngày hợp lệ; chẩn đoán L3 có bốn mã EVIDENCE_SEAL_*
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import {
  addDays, readSealRows, sealPaths, sealRoot, sealRowHash, sealTenant, SEAL_DIAGNOSTICS, verifySeals, vnToday, type SealManifest,
} from '@bizcity/platform/core/evidence-export';
import { call, setupTenant, type TestCtx } from './helpers.js';

const CLI = path.resolve(__dirname, '../../../packages/cli/bin/bizcity.mjs');
const SELFCHECK = path.resolve(__dirname, '../../../tests/conformance/selfcheck.mjs');
let ctx: TestCtx, viewer: TestCtx;
let tenantId = '';
let dataDir = '';
const savedDataDir = process.env.DATA_DIR;
// "Hôm nay" giả định ở tương lai để các ngày T0..T4 đã đóng: T0 = hôm nay thật (dòng do seed sinh), T1 / T3 có dòng thêm, T2 / T4 trống.
const T0 = vnToday();
const T = (n: number) => addDays(T0, n);
const TODAY = T(5);

const seal = (today = TODAY) => db.transaction().execute((trx) => sealTenant(trx, tenantId, today));
const verify = (today = TODAY, from = T0, to = addDays(today, -1)) => db.transaction().execute((trx) => verifySeals(trx, tenantId, from, to, today));
const codes = (r: { findings: { code: string; date: string }[] }) => r.findings.map((f) => `${f.date} ${f.code}`).sort();
const cli = () => spawnSync(process.execPath, [CLI, 'evidence', 'verify', '--dir', sealRoot(tenantId), '--json'], { encoding: 'utf8' });

async function audit(days: number, n: number, tag: string) {
  for (let i = 0; i < n; i++) {
    // mọi cột vào băm đều có giá trị riêng (đổi chỗ hai trường trong hàm băm phải làm đổi băm); dòng lẻ có before_data, dòng chẵn NULL
    await sql`INSERT INTO audit_logs (tenant_id, actor, actor_kind, actor_via, on_behalf_of, action, module_id, module_version, object_type, object_id, subject,
                                      request_id, correlation_id, idempotency_key, input_hash, result_ok, result_code, dry_run, before_data, after_data, trace_id, created_at)
              VALUES (${tenantId}, 'apikey:7', 'ai', 'cell:zalo', 'user:5', 'test.seal.write', 'acme.seal', '0.1.0', 'test.seal', ${`${tag}-${i}`}, ${`test.seal:${tag}-${i}`},
                      ${`req-${tag}-${i}`}, ${`cor-${tag}`}, ${`idem-${tag}-${i}`}, ${`sha256:in-${i}`}, ${i % 3 !== 2}, ${i % 3 === 2 ? 'CONFLICT' : null}, ${i % 2 === 1},
                      ${i % 2 ? JSON.stringify({ truoc: i }) : null}::jsonb, ${JSON.stringify({ tag, i, ten: 'Tiếng Việt có dấu', so: 1.5 })}::jsonb, ${(String(i + 1).repeat(32)).slice(0, 32)},
                      now() + make_interval(days => ${days}, secs => ${i}))`.execute(db);
  }
}

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bang-chung-'));
  process.env.DATA_DIR = dataDir;
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await call(ctx, 'POST', '/api/v1/users', { email: 'xem-seal@ketoan.local', fullName: 'xem', role: 'viewer', password: 'Pass@12345' })).status).toBe(201);
  const login = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'xem-seal@ketoan.local', password: 'Pass@12345' } });
  viewer = { ...ctx, token: login.json().data.token };
  // sau mọi thao tác ghi bằng chứng "hôm nay": dòng tương lai phải mang số thứ tự lớn nhất
  await audit(1, 3, 't1');
  await audit(3, 2, 't3');
});
afterAll(async () => {
  await ctx.app.close();
  process.env.DATA_DIR = savedDataDir;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('T030-SEAL — bản niêm phong của bằng chứng', () => {
  it('T030-SEAL-1 băm TypeScript hashVersion 1 trùng hash đã lưu (đơn vị test + tới 5 đơn vị khác)', async () => {
    const tenants = await sql<{ tenant_id: string; hi: string }>`
      SELECT tenant_id::text, max(chain_seq)::text AS hi FROM audit_logs WHERE chain_seq IS NOT NULL
       GROUP BY tenant_id ORDER BY (tenant_id = ${tenantId}) DESC, tenant_id LIMIT 6`.execute(db);
    let n = 0;
    for (const t of tenants.rows) {
      const rows = await readSealRows(db, t.tenant_id, 0, Math.min(Number(t.hi), 1500));
      for (const r of rows) expect(sealRowHash(r), `đơn vị ${t.tenant_id} #${r.chainSeq}`).toBe(r.hash);
      n += rows.length;
    }
    expect(n).toBeGreaterThan(10);
  });

  it('T030-SEAL-2 niêm phong ngày đã đóng: tệp + manifest đúng khuôn, ngày trống có manifest, nối ngày; kiểm đạt', async () => {
    const run = await seal();
    expect(run.sealed).toEqual([T(0), T(1), T(2), T(3), T(4)]);
    const man = (d: string) => JSON.parse(fs.readFileSync(sealPaths(tenantId, d).manifest, 'utf8')) as SealManifest;
    const total = await sql<{ n: number }>`SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = ${tenantId} AND chain_seq IS NOT NULL`.execute(db);
    const days = [0, 1, 2, 3, 4].map((i) => man(T(i)));
    expect(days.reduce((s, m) => s + m.rows, 0)).toBe(total.rows[0]!.n);
    expect(days[1]).toMatchObject({ contract: 'bizcity_evidence_seal@1', tenant: tenantId, date: T(1), hashVersion: 1, rows: 3, sealer: 'platform', alg: 'sha256', signature: null });
    expect(days[2]).toMatchObject({ rows: 0, firstSeq: null, lastSeq: null, prevHashOfFirst: days[1]!.lastHash, lastHash: days[1]!.lastHash });
    expect(days[3]!.firstSeq).toBe(days[1]!.lastSeq! + 1);
    expect(days[0]!.prevManifestSha256).toBeNull();
    expect(fs.readFileSync(sealPaths(tenantId, T(2)).jsonl, 'utf8')).toBe('');
    const line = JSON.parse(fs.readFileSync(sealPaths(tenantId, T(1)).jsonl, 'utf8').split('\n')[0]!);
    expect(Object.keys(line)).toEqual(['hashVersion', 'id', 'tenantId', 'chainSeq', 'prevHash', 'createdAtHash', 'actor', 'actorKind', 'actorVia', 'onBehalfOf', 'action',
      'moduleId', 'moduleVersion', 'objectType', 'objectId', 'subject', 'requestId', 'correlationId', 'idempotencyKey', 'inputHash', 'resultOk', 'resultCode', 'dryRun',
      'beforeDataText', 'afterDataText', 'traceId', 'hash']);
    expect(line.createdAtHash).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    expect(typeof line.afterDataText).toBe('string');
    const r = await verify();
    expect(r.findings).toEqual([]);
    expect(r).toMatchObject({ days: 5, sealed: 5, rows: total.rows[0]!.n });
    const c = cli();
    expect(c.status, c.stdout + c.stderr).toBe(0);
    expect(JSON.parse(c.stdout)).toMatchObject({ days: 5, rows: total.rows[0]!.n, findings: [] });
  });

  it('T030-SEAL-3 chạy lại không ghi lại; dừng giữa chừng (có .jsonl chưa có manifest) thì làm tiếp đúng', async () => {
    const before = [0, 1, 2, 3, 4].map((i) => fs.readFileSync(sealPaths(tenantId, T(i)).manifest, 'utf8'));
    const again = await seal();
    expect(again).toMatchObject({ sealed: [], checked: [T(4)], mismatched: [] });
    expect([0, 1, 2, 3, 4].map((i) => fs.readFileSync(sealPaths(tenantId, T(i)).manifest, 'utf8'))).toEqual(before);
    fs.rmSync(sealPaths(tenantId, T(4)).manifest);
    const resumed = await seal();
    expect(resumed).toMatchObject({ checked: [T(3)], sealed: [T(4)], mismatched: [] });
    expect(JSON.parse(fs.readFileSync(sealPaths(tenantId, T(4)).manifest, 'utf8'))).toMatchObject({ prevManifestSha256: JSON.parse(before[4]!).prevManifestSha256, fileSha256: JSON.parse(before[4]!).fileSha256 });
    expect((await verify()).findings).toEqual([]);
  });

  it('T030-SEAL-4 sửa tệp sau khi chốt → EVIDENCE_SEAL_FILE; CLI ngoại tuyến cũng bắt', async () => {
    const p = sealPaths(tenantId, T(1)).jsonl;
    const orig = fs.readFileSync(p);
    try {
      fs.writeFileSync(p, orig.toString('utf8').replace('"i\\": 1', '"i\\": 9'));
      expect(codes(await verify())).toEqual([`${T(1)} EVIDENCE_SEAL_FILE`]);
      const c = cli();
      expect(c.status).toBe(1);
      expect(JSON.parse(c.stdout).findings).toEqual([{ code: 'EVIDENCE_SEAL_FILE', date: T(1), detail: 'băm tệp khác manifest' }]);
      // lane diagnostics của bộ kiểm chuẩn (DG-EVD-3, cùng mã) cũng bắt, trên cùng DATA_DIR
      const lane = spawnSync(process.execPath, [SELFCHECK, '--lane', 'diagnostics', '--only', 'DG-EVD-3'], { encoding: 'utf8', env: { ...process.env, DATA_DIR: dataDir } });
      expect(lane.stdout).toContain(`[${ctx.tenantCode}] ${T(1)}: băm tệp khác manifest`);
    } finally {
      fs.writeFileSync(p, orig);
    }
    expect((await verify()).findings).toEqual([]);
  });

  it('T030-SEAL-5 sửa CSDL sau ngày chốt (vượt trigger, superuser) → EVIDENCE_SEAL_DB', async () => {
    const victim = (await sql<{ id: string }>`SELECT id::text FROM audit_logs WHERE tenant_id = ${tenantId} AND object_id = 't3-1'`.execute(db)).rows[0]!.id;
    let r: Awaited<ReturnType<typeof verifySeals>> | undefined;
    await db.transaction().execute(async (trx) => {
      await sql`SET LOCAL ROLE NONE`.execute(trx);
      await sql`SET LOCAL session_replication_role = replica`.execute(trx);
      await sql`UPDATE audit_logs SET after_data = '{"sua":true}'::jsonb WHERE id = ${victim}`.execute(trx);
      r = await verifySeals(trx, tenantId, T0, T(4), TODAY);
      throw new Error('huỷ');
    }).catch((e: Error) => { if (e.message !== 'huỷ') throw e; });
    expect(codes(r!)).toEqual([`${T(3)} EVIDENCE_SEAL_DB`]);
  });

  it('T030-SEAL-6 xoá một ngày giữa chuỗi → CHAIN ở ngày sau + MISSING; tệp ngày khác bản CSDL không bị ghi đè', async () => {
    const p = sealPaths(tenantId, T(2));
    const keep = { jsonl: fs.readFileSync(p.jsonl), manifest: fs.readFileSync(p.manifest) };
    fs.rmSync(p.jsonl);
    fs.rmSync(p.manifest);
    try {
      expect(codes(await verify())).toEqual([`${T(2)} EVIDENCE_SEAL_MISSING`, `${T(3)} EVIDENCE_SEAL_CHAIN`]);
      expect(JSON.parse(cli().stdout).findings).toEqual([{ code: 'EVIDENCE_SEAL_CHAIN', date: T(3), detail: 'thiếu manifest ngày trước' }]);
    } finally {
      fs.writeFileSync(p.jsonl, keep.jsonl);
      fs.writeFileSync(p.manifest, keep.manifest);
    }
    // .jsonl của ngày chưa có manifest đã có sẵn mà khác bản sinh từ CSDL: dừng, không đè
    const p5 = sealPaths(tenantId, T(5));
    fs.mkdirSync(path.dirname(p5.jsonl), { recursive: true });
    fs.writeFileSync(p5.jsonl, 'khác\n');
    try {
      const r = await seal(T(7));
      expect(r).toMatchObject({ sealed: [], mismatched: [T(5)] });
      expect(fs.readFileSync(p5.jsonl, 'utf8')).toBe('khác\n');
      expect(fs.existsSync(p5.manifest)).toBe(false);
    } finally {
      fs.rmSync(p5.jsonl);
    }
  });

  it('T030-SEAL-7 ngày đã đóng quá 2 ngày chưa niêm phong → EVIDENCE_SEAL_MISSING; trong hạn thì chưa báo', async () => {
    // hôm nay giả định T9: T5, T6 quá hạn (≤ T9 − 3); T7, T8 còn trong hạn
    expect(codes(await verify(T(9)))).toEqual([`${T(5)} EVIDENCE_SEAL_MISSING`, `${T(6)} EVIDENCE_SEAL_MISSING`]);
    const run = await seal(T(9));
    expect(run.sealed).toEqual([T(5), T(6), T(7), T(8)]);
    expect((await verify(T(9))).findings).toEqual([]);
  });

  it('T030-SEAL-8 GET /api/v1/evidence/verify: quyền, khoảng ngày; chẩn đoán L3 có bốn mã EVIDENCE_SEAL_*', async () => {
    const ok = await call(ctx, 'GET', '/api/v1/evidence/verify');
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data).toMatchObject({ ok: true, to: addDays(T0, -1), counts: { EVIDENCE_SEAL_MISSING: 0, EVIDENCE_SEAL_FILE: 0, EVIDENCE_SEAL_DB: 0, EVIDENCE_SEAL_CHAIN: 0 } });
    expect(JSON.stringify(ok.body.data)).not.toContain('afterDataText');
    expect((await call(viewer, 'GET', '/api/v1/evidence/verify')).status).toBe(403);
    expect((await call(ctx, 'GET', `/api/v1/evidence/verify?from=${T(1)}&to=${T0}`)).status).toBe(400);
    expect((await call(ctx, 'GET', `/api/v1/evidence/verify?from=2020-01-01&to=${T0}`)).status).toBe(400);
    const diag = await call(ctx, 'GET', '/api/v1/system/diagnostics');
    const got = diag.body.data.checks.filter((c: { code: string }) => c.code.startsWith('EVIDENCE_SEAL_')).map((c: { code: string; level: string }) => `${c.code}:${c.level}`).sort();
    expect(got).toEqual(['EVIDENCE_SEAL_CHAIN:empty', 'EVIDENCE_SEAL_DB:empty', 'EVIDENCE_SEAL_FILE:empty', 'EVIDENCE_SEAL_MISSING:empty']);
    expect(SEAL_DIAGNOSTICS.every((d) => d.remedy && d.layer === 'L3')).toBe(true);
  });
});
