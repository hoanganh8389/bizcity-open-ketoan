// [2026-11-08 04:43 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-15 (D026-6, 20-KIEN-TRUC §7): SC-PILLAR-1 — tiêu chí "đạt" ở bảng trụ cột phải có bằng chứng tồn tại
/**
 * SC-PILLAR-1 — Bảng trụ cột (docs/standard/tru-cot.json, bizcity_pillars@1) ghi mức đạt BẰNG TAY (R-CONT-7 cấm nút "tích đạt" trên giao
 * diện, nhưng người viết tệp vẫn có thể ghi "đạt" mà không có gì đỡ lưng). Bộ kiểm này đòi mỗi tiêu chí `status: "dat"` dẫn tới ít nhất MỘT
 * thứ có thật trong repo, và không dẫn tới thứ đã biến mất:
 *
 *   thứ kiểm được (có thật = tốt)            : số migration `0065` → db/migrations/0065_*.sql; test `test item-master` → *.test.* cùng tên;
 *                                              mã check `SC-FIND-1` / `DG-…` → có ở tests/conformance/checks; tuyến `GET /api/v1/x` → có trong mã;
 *                                              đường dẫn `packages/platform/src/…` → tồn tại; tên tệp `costing.service` → có tệp cùng tên gốc
 *   thứ chỉ tính điểm (không bao giờ báo treo): mã phát hiện `IN-GUARD-001`, tiêu đề `X-Preflight-Guard`, định danh trong mã (snake_case, camelCase, UPPER_SNAKE)
 *
 * Hai loại phát hiện: `no-evidence:<trụ cột>/<tiêu chí>` (đạt mà không dẫn được tới thứ gì có thật) và `dangling:<trụ cột>/<tiêu chí>:<tham chiếu>`
 * (nêu rõ một migration / test / check / tuyến / đường dẫn / tệp mà repo không có). Không báo gì trên tiêu chí khác "đạt" — một phần / tài liệu
 * được phép chưa có bằng chứng. Kết quả phụ: tiêu chí nào có mã check có thật thì ghi `source = check`, còn lại `source = manual` (D026-6: chuyển
 * dần sang engine); đếm ở `notes`.
 */

const FILE = 'docs/standard/tru-cot.json';
const MIG_DIR = 'db/migrations';
const CODE_ROOTS = ['db/migrations', 'packages', 'apps/api/src', 'modules', 'tests/conformance/checks'];
const METHODS = 'GET|POST|PUT|PATCH|DELETE';

/** Tên gốc (không đuôi) của các tệp test và các tệp mã, để tra `test <tên>` và `costing.service`. */
function indexRepo(r) {
  const testNames = new Set();
  const stems = new Set();
  for (const f of r.files({ ext: ['.ts', '.tsx', '.mjs', '.js'] })) {
    const base = f.slice(f.lastIndexOf('/') + 1);
    const t = /^(.*)\.test\.[cm]?[jt]sx?$/.exec(base);
    if (t) testNames.add(t[1]);
    else stems.add(base.replace(/\.[cm]?[jt]sx?$/, ''));
  }
  const migrations = new Set(r.list(MIG_DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f)).map((f) => f.slice(0, 4)));
  const checkIds = new Set();
  const corpus = [];
  for (const f of r.files({ under: CODE_ROOTS, ext: ['.sql', '.ts', '.tsx', '.mjs'] })) {
    const t = r.read(f);
    if (t == null) continue;
    corpus.push(t);
    if (f.startsWith('tests/conformance/checks/')) for (const m of t.matchAll(/id:\s*'((?:SC|DG)-[A-Z0-9]+(?:-[A-Z0-9]+)*)'/g)) checkIds.add(m[1]);
  }
  return { testNames, stems, migrations, checkIds, corpus: corpus.join('\n') };
}

/** Phân tích một chuỗi bằng chứng: `ok` = thứ có thật, `dangling` = thứ nêu rõ mà không có; `check` = có mã check có thật. */
export function judgeEvidence(evidence, ix, exists) {
  const ok = [];
  const dangling = [];
  let hasCheck = false;
  let text = String(evidence ?? '');

  // tuyến API: lấy ra trước để không bị đọc nhầm thành đường dẫn
  for (const m of text.matchAll(new RegExp(`\\b(?:${METHODS})\\s+(/[A-Za-z0-9_/:.-]+)`, 'g'))) {
    const route = m[1];
    (ix.corpus.includes(route) || ix.corpus.includes(route.replace(/^\/api\/v1/, '')) ? ok : dangling).push(`route:${route}`);
    text = text.replace(m[0], ' ');
  }
  for (const m of text.matchAll(/\b(0\d{3})\b/g)) (ix.migrations.has(m[1]) ? ok : dangling).push(`migration:${m[1]}`);
  for (const m of text.matchAll(/\b((?:SC|DG)-[A-Z0-9]+(?:-[A-Z0-9]+)*)\b/g)) {
    if (ix.checkIds.has(m[1])) { ok.push(`check:${m[1]}`); hasCheck = true; } else dangling.push(`check:${m[1]}`);
  }
  for (const m of text.matchAll(/\btests?\s+([a-z0-9\-/ ,]+?)(?=\s*(?:\(|;|:|$))/g)) {
    for (const t of m[1].split(/[,/ ]+/).filter((x) => /^[a-z][a-z0-9-]{2,}$/.test(x))) (ix.testNames.has(t) ? ok : dangling).push(`test:${t}`);
  }
  for (const m of text.matchAll(/\b([a-z]+(?:-[a-z]+)*\.(?:service|routes|repository|actions|check))\b/g)) (ix.stems.has(m[1]) ? ok : dangling).push(`file:${m[1]}`);
  for (const m of text.matchAll(/`?([A-Za-z0-9_.*-]+(?:\/[A-Za-z0-9_.*-]+)+)`?/g)) {
    const t = m[1];
    if (/^(?:api|https?)\b/.test(t)) continue;
    const base = t.split('*')[0].replace(/\/$/, '');
    (base && exists(base) ? ok : dangling).push(`path:${t}`);
  }
  // chỉ tính điểm
  for (const m of text.matchAll(/\b([A-Z]{2,}(?:-[A-Z]+)*-\d{1,3})\b/g)) if (!/^(?:SC|DG|CONF)-/.test(m[1]) && ix.corpus.includes(m[1])) ok.push(`code:${m[1]}`);
  for (const m of text.matchAll(/\b(X-[A-Z][A-Za-z-]+)\b/g)) if (ix.corpus.includes(m[1])) ok.push(`header:${m[1]}`);
  for (const m of text.matchAll(/\b([a-z]+_[a-z0-9_]+|[a-z]+[A-Z][A-Za-z0-9]+|[A-Z][A-Z0-9_]{5,})\b/g)) if (ix.corpus.includes(m[1])) ok.push(`id:${m[1]}`);
  return { ok, dangling, hasCheck };
}

export const checks = [
  {
    id: 'SC-PILLAR-1',
    title: 'Bảng trụ cột: tiêu chí "đạt" phải dẫn tới bằng chứng có thật (migration, test, check, tuyến, tệp) và không dẫn tới thứ đã mất',
    gate: 'DOCS', contract: 'docs', rules: ['R-CONT-7'], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
    run(ctx) {
      const r = ctx.repo;
      if (!r.exists(FILE)) return { examined: 0, findings: [], notes: [`chưa có ${FILE}`] };
      let doc;
      try { doc = r.json(FILE); } catch (e) { return { examined: 0, findings: [ctx.finding(FILE, 1, `JSON hỏng: ${e.message}`, 'json')] }; }
      const ix = indexRepo(r);
      const findings = [];
      let dat = 0;
      let bySource = 0;
      for (const p of doc.pillars ?? []) {
        for (const c of p.criteria ?? []) {
          if (c.status !== 'dat') continue;
          dat++;
          const who = `${p.key}/${c.id}`;
          const j = judgeEvidence(c.evidence, ix, (rel) => r.exists(rel));
          if (!String(c.evidence ?? '').trim() || !j.ok.length) findings.push(ctx.finding(FILE, null, `${who} ghi "đạt" nhưng bằng chứng không dẫn tới thứ gì có thật trong repo (migration, test, mã check, tuyến, tệp): ghi bằng chứng cụ thể, hoặc hạ xuống "một phần"`, `no-evidence:${who}`));
          for (const d of j.dangling) findings.push(ctx.finding(FILE, null, `${who} nêu ${d.replace(':', ' ')} nhưng repo không có — sửa bằng chứng hoặc hạ mức đạt`, `dangling:${who}:${d}`));
          if (j.hasCheck) bySource++;
        }
      }
      return { examined: dat, unitBy: 'key', findings, notes: [`${dat} tiêu chí đạt: ${bySource} có mã check có thật (source = check), ${dat - bySource} ghi tay (source = manual)`] };
    },
  },
];
