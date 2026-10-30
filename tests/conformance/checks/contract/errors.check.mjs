// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
/**
 * bizcity_errors@1 (R-ERR-1, R-ERR-6): danh mục máy đọc packages/contracts/src/errors.ts là nguồn duy nhất —
 * bảng người đọc docs/contracts/BIZCITY-ERRORS-v1.md §3 phải khớp từng mã (HTTP, thử lại, thông báo, gợi ý);
 * mọi mã ERROR_CODES (api.ts) có trong danh mục; mã chi tiết details.reason có tiền tố chủ (LEDGER_, DB_, PERIOD_, MCP_…).
 */
const CATALOG = 'packages/contracts/src/errors.ts';
const API = 'packages/contracts/src/api.ts';
const DOC = 'docs/contracts/BIZCITY-ERRORS-v1.md';
const ROW = /^ {2}([A-Z][A-Z_]+): \{ http: (\d+), category: '(\w+)', retryable: (true|false), owner: '(\w+)', message: '([^']*)', hint: '([^']*)' \},$/;

export default {
  id: 'SC-ERR-1',
  title: 'Danh mục mã lỗi khớp bảng BIZCITY-ERRORS §3 và ERROR_CODES; reason có tiền tố chủ',
  gate: 'DOCS', contract: 'bizcity_api', rules: ['R-ERR-1', 'R-ERR-6'], tier: 1, enforce: 'block', weight: 3, targets: ['repo'],
  run(ctx) {
    const src = ctx.repo.read(CATALOG);
    if (src == null) return { examined: 0, findings: [], notes: [`không có ${CATALOG}`] };
    const findings = [];
    const catalog = new Map();
    const block = src.slice(src.indexOf('export const ERROR_CATALOG'), src.indexOf('};', src.indexOf('export const ERROR_CATALOG')));
    for (const line of block.split(/\r?\n/)) {
      const m = ROW.exec(line);
      if (m) catalog.set(m[1], { http: m[2], retryable: m[4] === 'true' ? 'có' : 'không', owner: m[5], message: m[6], hint: m[7] });
      else if (/^ {2}[A-Z]/.test(line)) findings.push(ctx.finding(CATALOG, null, `dòng danh mục không đúng khuôn một dòng: ${line.trim().slice(0, 80)}`, `format:${line.trim().slice(0, 30)}`));
    }
    // ERROR_CODES (api.ts) ⊆ danh mục
    const api = ctx.repo.read(API) ?? '';
    const codes = [...api.slice(api.indexOf('export const ERROR_CODES'), api.indexOf('} as const', api.indexOf('export const ERROR_CODES'))).matchAll(/:\s*'([A-Z_]+)'/g)].map((m) => m[1]);
    for (const c of codes) if (!catalog.has(c)) findings.push(ctx.finding(CATALOG, null, `ERROR_CODES có ${c} nhưng danh mục chưa khai`, `missing:${c}`));
    // Bảng §3 của tài liệu
    const doc = ctx.repo.read(DOC) ?? '';
    const sec = doc.slice(doc.indexOf('## 3.'), doc.indexOf('**Mã của giao thức MCP**'));
    const docRows = new Map();
    for (const m of sec.matchAll(/^\| `([A-Z_]+)` \| (\d+) \| \w+ \| (có|không) \| (\w+) \| ([^|]+) \| ([^|]+) \|$/gm)) {
      docRows.set(m[1], { http: m[2], retryable: m[3], owner: m[4], message: m[5].trim(), hint: m[6].trim() });
    }
    for (const [code, c] of catalog) {
      const d = docRows.get(code);
      if (!d) { findings.push(ctx.finding(DOC, null, `bảng §3 thiếu mã ${code}`, `doc-missing:${code}`)); continue; }
      for (const f of ['http', 'retryable', 'owner', 'message', 'hint']) {
        if (d[f] !== c[f]) findings.push(ctx.finding(DOC, null, `${code}.${f}: tài liệu "${d[f]}" ≠ danh mục "${c[f]}"`, `diff:${code}.${f}`));
      }
    }
    for (const code of docRows.keys()) if (!catalog.has(code)) findings.push(ctx.finding(DOC, null, `bảng §3 có ${code} nhưng danh mục không có`, `doc-extra:${code}`));
    // R-ERR-6: reason có tiền tố chủ
    const reasons = src.slice(src.indexOf('export const ERROR_REASONS'));
    for (const m of reasons.matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)) {
      if (!/^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(m[1])) findings.push(ctx.finding(CATALOG, null, `reason ${m[1]} thiếu tiền tố chủ (LEDGER_, DB_, <MODULE>_…)`, `reason:${m[1]}`));
    }
    return { examined: catalog.size + docRows.size, unitBy: 'key', findings, metrics: { codes: catalog.size } };
  },
};
