// @bizcity-layer P cli
// [2026-11-06 09:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-30b: `bizcity evidence verify` — kiểm bản niêm phong bằng chứng không cần CSDL (ADR-0030 D-SEAL-7, bizcity_evidence@1 §8)
/**
 * Kiểm thư mục niêm phong của MỘT đơn vị (`DATA_DIR/bang-chung/<đơn vị>`) ngoại tuyến — cho kiểm toán viên nhận thư mục từ quản trị.
 *   - từng tệp tự kiểm: băm tệp = manifest, băm từng dòng theo hashVersion 1 (= audit_log_hash, migration 0036), dòng nối dòng, số thứ tự liền;
 *   - manifest nối ngày: prevManifestSha256 = băm manifest ngày trước, prevHashOfFirst = lastHash ngày trước; ngày hở giữa chuỗi bị báo.
 * Chiều CSDL (manifest ↔ CSDL) chỉ có ở GET /api/v1/evidence/verify. Cùng thuật toán với packages/platform/src/core/evidence-export.ts —
 * test apps/api/test/evidence-seal.test.ts chạy lệnh này trên thư mục do Platform sinh để giữ hai bản khớp nhau.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const SEAL_CONTRACT = 'bizcity_evidence_seal@1';
const sha256 = (s) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** hashVersion 1: các trường nối bằng U+001F, NULL thành chuỗi rỗng (bizcity_evidence@1 §8). */
export function rowHash(r) {
  const f = [
    r.id, r.tenantId, String(r.chainSeq), r.prevHash ?? '', r.createdAtHash,
    r.actor, r.actorKind, r.actorVia ?? '', r.onBehalfOf ?? '',
    r.action, r.moduleId ?? '', r.moduleVersion ?? '', r.objectType, r.objectId ?? '', r.subject ?? '',
    r.requestId ?? '', r.correlationId ?? '', r.idempotencyKey ?? '', r.inputHash ?? '',
    String(r.resultOk), r.resultCode ?? '', String(r.dryRun),
    r.beforeDataText ?? '', r.afterDataText ?? '',
  ];
  return sha256(Buffer.from(f.join('\u001f'), 'utf8'));
}

/** Lý do tệp ngày hỏng, hoặc null. */
export function checkFile(m, buf) {
  if (m.contract !== SEAL_CONTRACT) return `manifest sai hợp đồng ${m.contract}`;
  if (buf == null) return 'thiếu tệp .jsonl';
  if (sha256(buf) !== m.fileSha256) return 'băm tệp khác manifest';
  const lines = buf.toString('utf8').split('\n').filter((l) => l.length);
  if (lines.length !== m.rows) return `số dòng ${lines.length} ≠ manifest ${m.rows}`;
  let prev = m.prevHashOfFirst;
  let seq = m.firstSeq;
  for (const [i, line] of lines.entries()) {
    let r;
    try { r = JSON.parse(line); } catch { return `dòng ${i + 1}: không phải JSON`; }
    if (r.hashVersion !== 1) return `dòng ${i + 1}: hashVersion ${r.hashVersion} chưa hỗ trợ`;
    if (r.chainSeq !== seq) return `dòng ${i + 1}: số thứ tự ${r.chainSeq} (chờ ${seq})`;
    if ((r.prevHash ?? null) !== prev) return `dòng ${i + 1}: không nối dòng trước`;
    if (rowHash(r) !== r.hash) return `dòng ${i + 1}: băm sai`;
    prev = r.hash;
    seq = r.chainSeq + 1;
  }
  if (m.rows && m.lastSeq !== seq - 1) return 'lastSeq khác dòng cuối';
  if (m.lastHash !== prev) return 'lastHash khác dòng cuối';
  return null;
}

/** Kiểm cả thư mục một đơn vị. Trả { dir, days, rows, findings: [{ code, date, detail }] }. */
export function verifyDir(dir) {
  const out = { dir, days: 0, rows: 0, findings: [] };
  const ls = (p, re) => (existsSync(p) ? readdirSync(p).filter((x) => re.test(x)).sort() : []);
  const dates = [];
  for (const y of ls(dir, /^\d{4}$/)) for (const mo of ls(path.join(dir, y), /^\d{2}$/)) {
    for (const f of ls(path.join(dir, y, mo), /^\d{2}\.manifest\.json$/)) dates.push(`${y}-${mo}-${f.slice(0, 2)}`);
  }
  const at = (date, ext) => { const [y, mo, d] = date.split('-'); return path.join(dir, y, mo, `${d}${ext}`); };
  let prev = null;
  for (const date of dates) {
    out.days += 1;
    const raw = readFileSync(at(date, '.manifest.json'));
    let m;
    try { m = JSON.parse(raw.toString('utf8')); } catch { out.findings.push({ code: 'EVIDENCE_SEAL_FILE', date, detail: 'manifest không phải JSON' }); prev = null; continue; }
    out.rows += m.rows ?? 0;
    const file = at(date, '.jsonl');
    const bad = checkFile(m, existsSync(file) ? readFileSync(file) : null);
    if (bad) out.findings.push({ code: 'EVIDENCE_SEAL_FILE', date, detail: bad });
    if (prev && prev.date === addDays(date, -1)) {
      if (m.prevManifestSha256 !== sha256(prev.raw)) out.findings.push({ code: 'EVIDENCE_SEAL_CHAIN', date, detail: 'prevManifestSha256 khác manifest ngày trước' });
      else if (m.prevHashOfFirst !== prev.m.lastHash) out.findings.push({ code: 'EVIDENCE_SEAL_CHAIN', date, detail: 'prevHashOfFirst khác lastHash ngày trước' });
    } else if (prev || m.prevManifestSha256 !== null) {
      out.findings.push({ code: 'EVIDENCE_SEAL_CHAIN', date, detail: 'thiếu manifest ngày trước' });
    }
    prev = { date, raw, m };
  }
  return out;
}

export function formatReport(r) {
  const head = `Bản niêm phong ${r.dir}: ${r.days} ngày, ${r.rows} dòng — ${r.findings.length ? `${r.findings.length} chỗ sai` : 'đạt'}`;
  return [head, ...r.findings.map((f) => `  ✘ ${f.date} ${f.code}: ${f.detail}`)].join('\n');
}
