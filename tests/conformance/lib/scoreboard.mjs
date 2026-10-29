/**
 * Bảng điểm `bizcity_scoreboard@1`: gộp kết quả hai lane (selfcheck + diagnostics) thành điểm theo hợp đồng,
 * cổng, module; độ sẵn sàng của Standard v1; độ phủ luật; xu hướng so với lần chạy trước.
 *
 * Ba điểm, KHÔNG cộng lẫn:
 *  - conformance  code hiện tại tuân chuẩn đến đâu (check block/ratchet/info đã chạy)
 *  - readiness    Core đã có bao nhiêu năng lực Standard v1 hứa (check planned + bảng năng lực + ca chuẩn)
 *  - coverage     bao nhiêu luật có kiểm tự động
 */
export const GRADES = [[95, 'A'], [85, 'B'], [70, 'C'], [50, 'D'], [0, 'F']];
export const grade = (s) => (s == null ? '—' : GRADES.find(([min]) => s >= min)[1]);
const round = (x) => (x == null ? null : Math.round(x * 10) / 10);

/** Điểm một check: tỉ lệ đơn vị (tệp / bảng / bút toán) KHÔNG có phát hiện. */
export function scoreCheck(r) {
  if (['skip', 'planned'].includes(r.status)) return null;
  if (r.lane === 'diagnostics' && !r.examined && !r.findings.length) return null; // đạt rỗng: không có gì để chấm
  if (r.status === 'error') return 0;
  if (!r.findings.length) return 100;
  const affected = r.affected ?? new Set(r.findings.map((f) => (r.unitBy === 'key' ? f.key ?? f.message : f.file ?? f.key ?? f.message))).size;
  if (!r.examined) return 0;
  return Math.max(0, round(100 * (1 - affected / Math.max(r.examined, affected))));
}

function weighted(list, val = (r) => r.score) {
  const xs = list.filter((r) => val(r) != null);
  const w = xs.reduce((a, r) => a + (r.weight ?? 1), 0);
  return w ? round(xs.reduce((a, r) => a + val(r) * (r.weight ?? 1), 0) / w) : null;
}

function groupBy(results, key) {
  const m = new Map();
  for (const r of results) m.set(r[key], [...(m.get(r[key]) ?? []), r]);
  return [...m].map(([k, rs]) => {
    const score = weighted(rs);
    return {
      [key]: k, score, grade: grade(score), checks: rs.length,
      pass: rs.filter((r) => r.status === 'pass').length,
      debt: rs.filter((r) => r.status === 'debt').length,
      fail: rs.filter((r) => ['fail', 'error'].includes(r.status)).length,
      planned: rs.filter((r) => r.status === 'planned').length,
      readiness: weighted(rs.filter((r) => r.status === 'planned'), (r) => (r.readiness == null ? null : r.readiness * 100)),
    };
  }).sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

export function buildScoreboard({ results, coverage, standard, previous, run }) {
  for (const r of results) r.score = scoreCheck(r);
  const ran = results.filter((r) => !['skip', 'planned'].includes(r.status));
  const counts = Object.fromEntries(['pass', 'debt', 'warn', 'fail', 'error', 'planned', 'skip'].map((s) => [s, results.filter((r) => r.status === s).length]));
  // --strict: baseline phải sạch (nợ đã hết phải dọn). Nợ còn đó không làm đỏ — bánh cóc chỉ chặt thêm.
  const verdict = counts.fail + counts.error > 0 || (run.strict && results.some((r) => r.fixed?.length)) ? 'fail' : 'pass';

  // Theo module: phát hiện có tệp nằm trong phan-he/<key>, addins/<id>, modules/<key>
  const modules = new Map();
  const moduleChecks = results.filter((r) => r.scope === 'module' && !['skip', 'planned'].includes(r.status));
  for (const r of moduleChecks) for (const f of r.findings) {
    if (!f.module) continue;
    const m = modules.get(f.module) ?? { module: f.module, findings: 0, newFindings: 0, checks: new Set() };
    m.findings++; if (!f.known) m.newFindings++; m.checks.add(r.id);
    modules.set(f.module, m);
  }
  const byModule = [...modules.values()].map((m) => {
    const score = round(100 * (1 - m.checks.size / Math.max(1, moduleChecks.length)));
    return { module: m.module, findings: m.findings, newFindings: m.newFindings, checks: [...m.checks].sort(), score, grade: grade(score) };
  }).sort((a, b) => a.score - b.score || b.findings - a.findings);

  // Sẵn sàng của Standard v1
  const caps = standard.capabilities;
  const capAvail = caps.filter((c) => c.status === 'available').length;
  const golden = results.find((r) => r.id === 'SC-CON-2')?.metrics;
  const plannedChecks = results.filter((r) => r.status === 'planned').map((r) => ({ id: r.id, title: r.title, phase: r.phase, readiness: r.readiness == null ? null : round(r.readiness * 100) }));
  const readinessParts = [
    100 * capAvail / caps.length,
    golden?.capabilitiesRequired ? 100 * golden.capabilitiesAvailable / golden.capabilitiesRequired : null,
    weighted(results.filter((r) => r.status === 'planned'), (r) => (r.readiness == null ? null : r.readiness * 100)),
  ].filter((x) => x != null);
  const readiness = round(readinessParts.reduce((a, b) => a + b, 0) / readinessParts.length);

  const conformance = weighted(ran);
  const diag = results.filter((r) => r.lane === 'diagnostics');
  const diagRan = diag.filter((r) => !['skip', 'planned'].includes(r.status));
  const prev = previous?.scores;

  return {
    contract: 'bizcity_scoreboard@1',
    runId: run.runId,
    at: run.at,
    mode: run.mode,
    target: run.target,
    node: process.version,
    durationMs: run.durationMs,
    standard: standard.version,
    verdict,
    scores: {
      conformance: { score: conformance, grade: grade(conformance), delta: prev?.conformance?.score != null && conformance != null ? round(conformance - prev.conformance.score) : null },
      readiness: { score: readiness, grade: grade(readiness), delta: prev?.readiness?.score != null ? round(readiness - prev.readiness.score) : null },
      coverage: { score: coverage?.summary.score ?? null, grade: grade(coverage?.summary.score), delta: prev?.coverage?.score != null && coverage ? round(coverage.summary.score - prev.coverage.score) : null },
      diagnostics: diagRan.length
        ? { score: weighted(diagRan), grade: grade(weighted(diagRan)), db: run.db, error: diagRan.filter((r) => r.status === 'fail').length, warn: diagRan.filter((r) => r.status === 'warn').length, pass: diagRan.filter((r) => r.status === 'pass').length }
        : { score: null, grade: '—', db: run.db, skipped: diag.filter((r) => r.status === 'skip').length },
    },
    counts,
    byContract: groupBy(results, 'contract'),
    byGate: groupBy(results, 'gate'),
    byModule,
    readiness: {
      capabilities: { available: capAvail, total: caps.length, planned: caps.filter((c) => c.status === 'planned').map((c) => `${c.id} (P${c.phase})`) },
      goldenCase: golden ? { required: golden.capabilitiesRequired, available: golden.capabilitiesAvailable, blockedBy: golden.blockedBy } : null,
      planned: plannedChecks,
    },
    coverage: coverage ? { ...coverage.summary, unmappedStd: coverage.unmapped } : null,
    checks: results.map((r) => ({
      id: r.id, title: r.title, lane: r.lane, gate: r.gate, contract: r.contract, tier: r.tier, enforce: r.enforce,
      status: r.status, score: r.score, examined: r.examined, findings: r.findings.length,
      new: r.findings.filter((f) => !f.known).length, known: r.findings.filter((f) => f.known).length, fixed: r.fixed?.length ?? 0,
      readiness: r.readiness == null ? null : round(r.readiness * 100), ms: r.ms, notes: r.notes ?? [], error: r.error ?? null,
    })),
  };
}
