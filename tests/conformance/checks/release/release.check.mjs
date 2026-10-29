/**
 * RULE-RELEASE (R-REL-*) — phiên bản khai ở các nơi khớp nhau; CHANGELOG có mục cho bản đang phát hành.
 */
export const checks = [
  {
    id: 'SC-REL-1',
    title: 'CHANGELOG.md có mục "Chưa phát hành" và mục cho phiên bản trong package.json',
    gate: 'DOCS', contract: 'quality', rules: ['R-REL-2'], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
    run(ctx) {
      const version = ctx.repo.json('package.json')?.version;
      const log = ctx.repo.read('CHANGELOG.md');
      const findings = [];
      if (log == null) findings.push(ctx.finding('CHANGELOG.md', null, 'thiếu CHANGELOG.md ở gốc repo', 'missing'));
      else {
        if (!/^## \[Chưa phát hành\]/m.test(log)) findings.push(ctx.finding('CHANGELOG.md', null, 'thiếu mục "## [Chưa phát hành]" đầu tệp', 'unreleased'));
        if (version && !new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(log)) findings.push(ctx.finding('CHANGELOG.md', null, `thiếu mục "## [${version}]" (package.json)`, `version:${version}`));
      }
      return { examined: 1, unitBy: 'key', findings };
    },
  },
  {
    id: 'SC-REL-2',
    title: 'Hợp đồng: phiên bản ở đầu tệp = dòng mới nhất trong nhật ký thay đổi của tệp',
    gate: 'DOCS', contract: 'contracts', rules: ['R-QG-9', 'R-REL-3'], conf: [], tier: 1, enforce: 'ratchet', weight: 2, targets: ['repo'],
    run(ctx) {
      const files = ctx.repo.files({ under: ['docs/contracts'], ext: ['.md'], not: /README\.md$/ });
      const findings = []; let checked = 0;
      for (const f of files) {
        const text = ctx.repo.read(f) ?? '';
        const head = /\*\*Phiên bản:\*\*\s*([0-9][\w.-]*)/.exec(text.split('\n').slice(0, 8).join('\n'))?.[1];
        const logIdx = text.search(/^## .*(Nhật ký thay đổi|CHANGELOG)/mi);
        if (!head || logIdx < 0) continue;
        checked++;
        const rows = [...text.slice(logIdx).matchAll(/^\|\s*`?([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-[\w.]+)?)`?\s*\|/gm)].map((m) => m[1]);
        const latest = rows.at(-1);
        if (latest && latest !== head) findings.push(ctx.finding(f, null, `đầu tệp ghi ${head}, nhật ký mới nhất ${latest}`, `${head}!=${latest}`));
      }
      return { examined: checked, unitBy: 'key', findings };
    },
  },
];
