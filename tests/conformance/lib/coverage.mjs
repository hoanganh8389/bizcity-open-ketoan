// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
/**
 * Độ phủ luật: mỗi mã luật (R-*, STD-*, CONF-*) đang được kiểm bằng gì.
 * "Đo bằng test, không đo bằng tài liệu" (framework/05-LO-TRINH.md, tư vấn 5): luật không có gì kiểm tự động thì lộ ra ở đây.
 */
const KIND_OF = (cell) => {
  const c = cell.toLowerCase();
  if (/\.test\.ts/.test(c)) return 'test';
  if (/trigger|chỉ mục duy nhất|khoá ngoại|unique|check \(/.test(c)) return 'db';
  if (/grep ci|ci\.yml|\bci\b|kiểm số migration/.test(c)) return 'ci';
  if (/giai đoạn|đợt|phase/.test(c)) return 'planned';
  if (/duyệt pr|mẫu pr/.test(c)) return 'manual';
  return c.trim() ? 'code' : 'none';
};

export function ruleCoverage(repo, checks) {
  const bySuite = new Map();
  const confImpl = new Map();
  for (const c of checks) {
    for (const r of c.rules ?? []) bySuite.set(r, [...(bySuite.get(r) ?? []), c.id]);
    if (c.enforce !== 'planned') for (const k of c.conf ?? []) confImpl.set(k, [...(confImpl.get(k) ?? []), c.id]);
  }

  const rules = [];
  // R-*: cột cuối "Kiểm bằng"
  for (const f of repo.files({ under: ['docs/rules'], ext: ['.md'] })) {
    for (const t of repo.lines(f)) {
      const m = /^\|\s*\*{0,2}(R-[A-Z]+-\d+)\*{0,2}([^|]*)\|.*\|([^|]*)\|\s*$/.exec(t);
      if (!m) continue;
      const kind = KIND_OF(m[3]);
      const suite = bySuite.get(m[1]) ?? [];
      rules.push({ id: m[1], family: 'R', file: f, tier0: /T0/.test(m[2]), by: kind, suite, automated: suite.length > 0 || ['test', 'db', 'ci'].includes(kind) });
    }
  }
  // CONF-*: cột "Luật" nối CONF → STD
  const confToStd = new Map();
  for (const t of repo.lines('docs/standard/CONFORMANCE.md')) {
    const m = /^\|\s*(CONF-[A-Z]+-\d+)\s*\|.*\|([^|]*)\|\s*$/.exec(t);
    if (!m) continue;
    const std = [...m[2].matchAll(/STD-[A-Z]+-\d+/g)].map((x) => x[0]);
    confToStd.set(m[1], std);
    const impl = confImpl.get(m[1]) ?? [];
    rules.push({ id: m[1], family: 'CONF', file: 'docs/standard/CONFORMANCE.md', std, suite: impl, automated: impl.length > 0 });
  }
  // STD-*: định nghĩa trong 7 hợp đồng
  for (const f of repo.files({ under: ['docs/contracts'], ext: ['.md'] })) {
    for (const t of repo.lines(f)) {
      const m = /^\|\s*\*{0,2}(STD-[A-Z]+-\d+)\*{0,2}\s*\|/.exec(t);
      if (!m) continue;
      const viaConf = [...confToStd].filter(([, s]) => s.includes(m[1])).map(([c]) => c);
      const suite = [...new Set([...(bySuite.get(m[1]) ?? []), ...viaConf.flatMap((c) => confImpl.get(c) ?? [])])];
      rules.push({ id: m[1], family: 'STD', file: f, conf: viaConf, suite, automated: suite.length > 0 });
    }
  }

  const fam = (x) => rules.filter((r) => r.family === x);
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const R = fam('R'); const STD = fam('STD'); const CONF = fam('CONF');
  return {
    summary: {
      R: { total: R.length, automated: R.filter((r) => r.automated).length, bySuite: R.filter((r) => r.suite.length).length,
        byKind: Object.fromEntries(['test', 'db', 'ci', 'code', 'manual', 'planned', 'none'].map((k) => [k, R.filter((r) => r.by === k).length])),
        tier0Manual: R.filter((r) => r.tier0 && !r.automated).map((r) => r.id) },
      STD: { total: STD.length, mappedToConf: STD.filter((r) => r.conf.length).length, automated: STD.filter((r) => r.automated).length },
      CONF: { total: CONF.length, implemented: CONF.filter((r) => r.automated).length },
      score: pct(R.filter((r) => r.automated).length + STD.filter((r) => r.automated).length + CONF.filter((r) => r.automated).length, R.length + STD.length + CONF.length),
    },
    unmapped: STD.filter((r) => !r.conf.length).map((r) => r.id),
    rules,
  };
}
