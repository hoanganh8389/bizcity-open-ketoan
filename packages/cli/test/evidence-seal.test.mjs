// [2026-11-06 10:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-30b: `bizcity evidence verify` — kiểm ngoại tuyến bản niêm phong (ADR-0030); khớp với Platform ở apps/api/test/evidence-seal.test.ts
/**
 * Dựng một thư mục niêm phong nhỏ bằng chính thuật toán đã công bố (bizcity_evidence@1 §8) rồi kiểm:
 *   đạt khi đúng; sửa một dòng → EVIDENCE_SEAL_FILE; xoá ngày giữa → EVIDENCE_SEAL_CHAIN; lệnh trả mã thoát 0 / 1 / 2.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { rowHash, verifyDir } from '../lib/evidence-seal.mjs';

const BIN = fileURLToPath(new URL('../bin/bizcity.mjs', import.meta.url));
const sha = (s) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

function build() {
  const dir = mkdtempSync(path.join(tmpdir(), 'niem-phong-'));
  let prevHash = null;
  let prevManifest = null;
  let seq = 0;
  for (const [date, n] of [['2026-11-01', 2], ['2026-11-02', 0], ['2026-11-03', 3]]) {
    const rows = [];
    const prevHashOfFirst = prevHash;
    for (let i = 0; i < n; i++) {
      seq += 1;
      const r = {
        hashVersion: 1, id: String(100 + seq), tenantId: '1', chainSeq: seq, prevHash, createdAtHash: `${date}T03:00:0${i}.000000Z`,
        actor: 'user:5', actorKind: 'user', actorVia: null, onBehalfOf: null, action: 'quy.payment.create', moduleId: null, moduleVersion: null,
        objectType: 'quy.payment', objectId: String(seq), subject: null, requestId: `req-${seq}`, correlationId: null, idempotencyKey: null, inputHash: null,
        resultOk: true, resultCode: null, dryRun: false, beforeDataText: null, afterDataText: `{"so": ${seq}}`, traceId: null,
      };
      r.hash = rowHash(r);
      prevHash = r.hash;
      rows.push(r);
    }
    const content = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
    const [y, m, d] = date.split('-');
    mkdirSync(path.join(dir, y, m), { recursive: true });
    writeFileSync(path.join(dir, y, m, `${d}.jsonl`), content);
    const man = `${JSON.stringify({
      contract: 'bizcity_evidence_seal@1', tenant: '1', date, hashVersion: 1, firstSeq: n ? rows[0].chainSeq : null, lastSeq: n ? seq : null, rows: n,
      prevHashOfFirst, lastHash: n ? prevHash : prevHashOfFirst, fileSha256: sha(content), prevManifestSha256: prevManifest ? sha(prevManifest) : null,
      sealedAt: `${date}T18:00:00.000Z`, sealer: 'platform', alg: 'sha256', signature: null,
    })}\n`;
    writeFileSync(path.join(dir, y, m, `${d}.manifest.json`), man);
    prevManifest = man;
  }
  return dir;
}

test('thư mục đúng: đạt, mã thoát 0', () => {
  const dir = build();
  try {
    assert.deepEqual(verifyDir(dir), { dir, days: 3, rows: 5, findings: [] });
    const r = spawnSync(process.execPath, [BIN, 'evidence', 'verify', '--dir', dir], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /3 ngày, 5 dòng — đạt/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('sửa một dòng rồi sửa luôn băm tệp trong manifest: băm dòng vẫn lộ (EVIDENCE_SEAL_FILE) và manifest ngày sau gãy (CHAIN)', () => {
  const dir = build();
  try {
    const f = path.join(dir, '2026', '11', '01.jsonl');
    const changed = readFileSync(f, 'utf8').replace('{\\"so\\": 1}', '{\\"so\\": 9}');
    writeFileSync(f, changed);
    const mf = path.join(dir, '2026', '11', '01.manifest.json');
    writeFileSync(mf, readFileSync(mf, 'utf8').replace(/"fileSha256":"[^"]+"/, `"fileSha256":"${sha(changed)}"`));
    assert.deepEqual(verifyDir(dir).findings, [
      { code: 'EVIDENCE_SEAL_FILE', date: '2026-11-01', detail: 'dòng 1: băm sai' },
      { code: 'EVIDENCE_SEAL_CHAIN', date: '2026-11-02', detail: 'prevManifestSha256 khác manifest ngày trước' },
    ]);
    assert.equal(spawnSync(process.execPath, [BIN, 'evidence', 'verify', '--dir', dir], { encoding: 'utf8' }).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('xoá ngày giữa chuỗi → EVIDENCE_SEAL_CHAIN ở ngày sau', () => {
  const dir = build();
  try {
    rmSync(path.join(dir, '2026', '11', '02.manifest.json'));
    assert.deepEqual(verifyDir(dir).findings, [{ code: 'EVIDENCE_SEAL_CHAIN', date: '2026-11-03', detail: 'thiếu manifest ngày trước' }]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('thiếu --dir: mã thoát 2', () => {
  assert.equal(spawnSync(process.execPath, [BIN, 'evidence', 'verify'], { encoding: 'utf8' }).status, 2);
});
