/**
 * Tính lộ trình (`bizcity_roadmap@1`, docs/standard/roadmap.json) từ kết quả bộ kiểm: trạng thái từng việc, tiến độ Phase,
 * ma trận Phase × mảng, cảnh báo làm trái thứ tự. Không tự đánh dấu "xong" bằng tay — chỉ tín hiệu đo được (trừ việc tay có doneAt).
 *
 * Tín hiệu trả true / false / null (chưa biết: check chưa chạy, lane diagnostics bỏ qua…).
 */
export const ROADMAP_FILE = 'docs/standard/roadmap.json';

export function evaluateRoadmap({ roadmap, results, standard, coverage, repo }) {
  const byId = new Map(results.map((r) => [r.id, r]));
  const caps = new Map(standard.capabilities.map((c) => [c.id, c.status]));
  const pct = (fam) => {
    const s = coverage?.summary?.[fam];
    if (!s) return null;
    const n = fam === 'CONF' ? s.implemented : s.automated;
    return s.total ? (100 * n) / s.total : 0;
  };

  const evalSignal = (s) => {
    if (s.check) {
      const r = byId.get(s.check);
      if (!r || r.status === 'skip') return null;
      return r.status === 'pass';
    }
    if (s.noFinding) {
      const r = byId.get(s.noFinding.check);
      if (!r || r.status === 'skip') return null;
      return !r.findings.some((f) => f.key === s.noFinding.key);
    }
    if (s.readiness) {
      const r = byId.get(s.readiness.check);
      if (!r || r.status === 'skip') return null;
      if (r.status !== 'planned') return true; // check đã thành bắt buộc = năng lực đã có
      return r.readiness != null && r.readiness * 100 >= s.readiness.min;
    }
    if (s.capability) return caps.get(s.capability) === 'available';
    if (s.file) return repo.exists(s.file);
    if (s.noFile) return !repo.exists(s.noFile);
    if (s.glob) return repo.files({ match: new RegExp(s.glob) }).length > 0;
    if (s.fileContains) return (repo.read(s.fileContains.file) ?? '').includes(s.fileContains.text);
    if (s.coverage) { const v = pct(s.coverage.family); return v == null ? null : v >= s.coverage.min; }
    if (s.standardStable) return !String(standard.version).includes('-');
    if (s.manual) return Boolean(s.doneAt);
    return null;
  };

  const describe = (s) => s.label ?? (
    s.check ? `${s.check} đạt` :
    s.noFinding ? `${s.noFinding.check} hết "${s.noFinding.key}"` :
    s.readiness ? `${s.readiness.check} sẵn sàng ≥ ${s.readiness.min}%` :
    s.capability ? `năng lực ${s.capability} available` :
    s.file ? `có ${s.file}` :
    s.noFile ? `không còn ${s.noFile}` :
    s.glob ? `có tệp khớp ${s.glob}` :
    s.fileContains ? `${s.fileContains.file} có "${s.fileContains.text}"` :
    s.coverage ? `độ phủ ${s.coverage.family} ≥ ${s.coverage.min}%` :
    s.standardStable ? 'Standard bỏ -draft' :
    s.manual ? `tay: ${s.manual}${s.doneAt ? ` (${s.by ?? '?'}, ${s.doneAt})` : ''}` : '?');

  const items = roadmap.items.map((it) => {
    const signals = it.done.map((s) => ({ text: describe(s), ok: evalSignal(s), manual: Boolean(s.manual) }));
    const t = signals.filter((s) => s.ok === true).length;
    const f = signals.filter((s) => s.ok === false).length;
    const status = t === signals.length ? 'done' : t > 0 ? 'doing' : f > 0 ? 'todo' : 'unknown';
    return { id: it.id, phase: it.phase, title: it.title, areas: it.areas, after: it.after ?? [], owner: it.owner ?? null, status, progress: Math.round((100 * t) / signals.length), signals };
  });
  const itemById = new Map(items.map((i) => [i.id, i]));

  // Thứ tự: việc đang / đã làm mà việc phải-xong-trước chưa xong
  const orderWarnings = [];
  for (const i of items) {
    if (i.status === 'todo' || i.status === 'unknown') continue;
    for (const a of i.after) {
      const pre = itemById.get(a);
      if (pre && pre.status !== 'done') orderWarnings.push(`${i.id} đang ${i.status === 'done' ? 'xong' : 'làm'} nhưng ${a} (phải xong trước) mới ${pre.progress}%`);
    }
  }

  const phases = roadmap.phases.map((p) => {
    const its = items.filter((i) => i.phase === p.id);
    const progress = its.length ? Math.round(its.reduce((a, i) => a + i.progress, 0) / its.length) : 0;
    return {
      id: p.id, title: p.title, output: p.output, estimate: p.estimate ?? null,
      items: its.length, done: its.filter((i) => i.status === 'done').length, doing: its.filter((i) => i.status === 'doing').length,
      progress, gate: its.length > 0 && its.every((i) => i.status === 'done'),
    };
  });

  // Ma trận mảng × Phase
  const matrix = Object.entries(roadmap.areas).map(([key, label]) => ({
    area: key, label,
    cells: roadmap.phases.map((p) => {
      const its = items.filter((i) => i.phase === p.id && i.areas.includes(key));
      return its.length ? { phase: p.id, done: its.filter((i) => i.status === 'done').length, total: its.length, progress: Math.round(its.reduce((a, i) => a + i.progress, 0) / its.length) } : { phase: p.id, done: 0, total: 0, progress: null };
    }),
  }));

  const current = phases.find((p) => !p.gate) ?? null;
  const next = items.filter((i) => i.status !== 'done' && i.phase === current?.id && i.after.every((a) => itemById.get(a)?.status === 'done'));
  return {
    updated: roadmap.updated,
    overall: Math.round(items.reduce((a, i) => a + i.progress, 0) / items.length),
    currentPhase: current?.id ?? null,
    next: next.map((i) => ({ id: i.id, title: i.title, progress: i.progress })),
    phases, matrix, items, orderWarnings,
  };
}
