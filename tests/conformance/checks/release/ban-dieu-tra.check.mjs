// [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W5: SC-DEV-1 — truy vấn của Bàn điều tra chỉ từ mẫu đóng, gắn đơn vị, giá trị qua quote(); trình duyệt không gọi nguồn quan sát
/**
 * SC-DEV-1 — Bàn điều tra (PHASE-019, 20-KIEN-TRUC §3.1, R-OBS-9). Đọc tĩnh:
 *   1. Trong apps/api/src/modules/system/devtools*.ts, mỗi chỗ chèn `${…}` trên dòng dựng LogQL / TraceQL phải đi qua `quote(…)` hoặc là
 *      mảnh đã dựng an toàn trong cùng tệp (`range` khung đóng, `t` / `o` / `cond.join(' && ')` ghép từ quote, `Math.trunc(…)` số).
 *   2. Mỗi hàm / mục dựng LogQL hoặc TraceQL phải gắn đơn vị: có `quote(tenant)` trong thân (bộ lọc đơn vị do máy chủ gắn — D019-5).
 *   3. PromQL của chế độ Vận hành là chuỗi CỐ ĐỊNH: dòng `expr:` là một chuỗi nháy đơn, không `${`, không nối chuỗi.
 *   4. Trình duyệt (apps/web/src) không chứa cổng / đường của Tempo, Loki, Prometheus, Alertmanager (`:3100`, `:3200`, `:9090`, `:9093`,
 *      `/loki/api/`, `/api/v2/alerts`, `/api/traces/`) — mọi màn đọc qua API trung gian (N1).
 */
const DIR = 'apps/api/src/modules/system';
const QUERY_LINE = /\{service=|span\.bizcity\.|count_over_time|duration >|\| json/;
const SAFE = /^(range|t|o|cond\.join\(' && '\)|Math\.trunc\([\w.]+\))$/;
const INTERP = /\$\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const UNIT_START = /^(export |  [A-Za-z]+: \()/;
const WEB_BAD = /:(3100|3200|9090|9093)\b|\/loki\/api\/|\/api\/v2\/alerts|\/api\/traces\//;

export default {
  id: 'SC-DEV-1',
  title: 'Bàn điều tra: LogQL / TraceQL chỉ từ mẫu đóng gắn đơn vị, giá trị qua quote(); PromQL cố định; trình duyệt không gọi nguồn quan sát',
  gate: 'CONF-STATIC', contract: 'quality', rules: ['R-OBS-9'], conf: [], tier: 1, enforce: 'block', weight: 3, targets: ['repo'],
  run(ctx) {
    const api = ctx.repo.files({ under: [DIR], ext: ['.ts'] }).filter((f) => /\/devtools[^/]*\.ts$/.test(f));
    const web = ctx.repo.files({ under: ['apps/web/src'], ext: ['.ts', '.tsx'] });
    const findings = [];

    for (const f of api) {
      const lines = (ctx.repo.read(f) ?? '').split('\n');
      // 1. chỗ chèn trên dòng truy vấn.
      lines.forEach((line, i) => {
        if (!line.includes('`') || !QUERY_LINE.test(line)) return;
        for (const m of line.matchAll(INTERP)) {
          const expr = m[1].trim();
          if (expr.includes('quote(') || SAFE.test(expr)) continue;
          findings.push(ctx.finding(f, i + 1, `chèn \${${expr}} vào truy vấn không qua quote() — giá trị phải qua khuôn Zod VÀ quote() (20-KIEN-TRUC §3.1)`, `interp:${f}:${expr}`));
        }
      });
      // 2. đơn vị: chia tệp thành đơn vị (export … / mục `  ten: (`), đơn vị nào dựng truy vấn phải có quote(tenant).
      let start = 0;
      const units = [];
      lines.forEach((line, i) => { if (i > 0 && UNIT_START.test(line)) { units.push([start, i]); start = i; } });
      units.push([start, lines.length]);
      for (const [a, b] of units) {
        const body = lines.slice(a, b);
        const builds = body.some((l) => l.includes('`') && /\{service=|\{ \$\{|span\.bizcity\./.test(l));
        if (!builds || body.some((l) => l.includes('quote(tenant)'))) continue;
        const name = (/(?:function|const)\s+(\w+)|^ {2}(\w+): \(/.exec(lines[a]) ?? [])
          .slice(1).find(Boolean) ?? `dòng ${a + 1}`;
        findings.push(ctx.finding(f, a + 1, `mẫu truy vấn ${name} không gắn đơn vị (quote(tenant)) — bộ lọc đơn vị do máy chủ gắn (D019-5)`, `tenant:${f}:${name}`));
      }
      // 3. PromQL cố định.
      lines.forEach((line, i) => {
        if (/\bexpr:\s*['"`]/.test(line) && !/\bexpr:\s*'[^'$`]*'\s*,/.test(line)) {
          findings.push(ctx.finding(f, i + 1, 'PromQL của chế độ Vận hành phải là chuỗi cố định (nháy đơn, không chèn / nối) — không nhận tham số truy vấn', `promql:${f}:${i + 1}`));
        }
      });
    }

    // 4. trình duyệt.
    for (const f of web) {
      (ctx.repo.read(f) ?? '').split('\n').forEach((line, i) => {
        if (WEB_BAD.test(line)) findings.push(ctx.finding(f, i + 1, 'trình duyệt gọi thẳng nguồn quan sát (Tempo / Loki / Prometheus / Alertmanager) — đọc qua /api/v1/system/devtools/* (N1)', `web:${f}`));
      });
    }
    return { examined: api.length + web.length, findings, ...(api.length ? {} : { notes: [`chưa có ${DIR}/devtools*.ts`] }) };
  },
};
