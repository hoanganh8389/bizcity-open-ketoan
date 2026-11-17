// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
/**
 * bizcity_preset@1 (docs/contracts/BIZCITY-PRESET-v1.md): mọi presets/<id>/preset.json đúng schema, id = tên thư mục, tệp tham chiếu
 * có thật, dữ liệu mẫu hư cấu (fictional: true — repo công khai), phân hệ có thật, năng lực có trong bảng năng lực, chứng từ mẫu đúng
 * khuôn bizcity_ledger_intake@1 và docKey bắt đầu bằng preset:<id>: (để nhận ra, gỡ được). Phần chạy thật: apps/api/test/preset.test.ts.
 */
// [2026-11-17 09:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-6 (bizcity_preset@1 1.2.0): khối openings / assets / close, ngày @m-N/DD và @period-N, số tài khoản chỉ ở openings / assets, close chỉ gọi ba action cuối kỳ
import path from 'node:path';

/** Thay ngày tương đối bằng một ngày cố định để kiểm khuôn (STD-PRE-5). */
const fixDates = (v) => JSON.parse(JSON.stringify(v).replace(/"@today(?:-\d+)?"/g, '"2026-01-15"').replace(/"@m-\d+\/\d{1,2}"/g, '"2026-01-15"').replace(/"@period-\d+"/g, '"2026-01"'));
/** Trường mang số tài khoản (STD-PRE-7). */
const ACCOUNT_KEY = /^(accountCode|[a-z]*Account)$/;
const accountKeys = (v, out = []) => { if (Array.isArray(v)) v.forEach((x) => accountKeys(x, out)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (ACCOUNT_KEY.test(k)) out.push(k); accountKeys(x, out); } return out; };
const CLOSE_ACTIONS = ['core.inventory.costing-run', 'core.asset.depreciation', 'core.closing.run'];

const SCHEMA = 'docs/contracts/BIZCITY-PRESET-v1.schema.json';
const INTAKE = 'docs/contracts/BIZCITY-LEDGER-INTAKE-v1.schema.json';

export default {
  id: 'SC-PRESET-1',
  title: 'Preset cài nhanh: đúng schema, tệp có thật, dữ liệu mẫu hư cấu, chứng từ mẫu đúng khuôn nạp sổ',
  gate: 'CONF-MAN', contract: 'contracts', rules: ['R-SEC-10', 'R-QG-7'], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  run(ctx) {
    const files = ctx.repo.files({ under: ['presets'], match: /\/preset\.json$/ });
    const findings = [];
    const std = ctx.standard(); // schema + bảng năng lực đọc từ repo lõi (ctx.core), kể cả khi kiểm fixture
    const caps = new Set((std.capabilities ?? []).map((c) => c.id));
    const modules = new Set(ctx.repo.files({ under: ['apps/api/src/phan-he'], match: /\/index\.ts$/ }).map((f) => f.split('/').at(-2)));
    for (const f of files) {
      const dir = path.posix.dirname(f);
      let p;
      try { p = ctx.repo.json(f); } catch { findings.push(ctx.finding(f, null, 'JSON không đọc được', `json:${f}`)); continue; }
      for (const e of ctx.validate(SCHEMA, p).slice(0, 5)) findings.push(ctx.finding(f, null, `${e.path}: ${e.message}`, `schema:${p.id}:${e.path}`));
      if (p.id !== path.posix.basename(dir)) findings.push(ctx.finding(f, null, `id "${p.id}" khác tên thư mục`, `id:${dir}`));
      for (const m of p.modules ?? []) if (modules.size && !modules.has(m)) findings.push(ctx.finding(f, null, `phân hệ không có: ${m}`, `module:${p.id}:${m}`));
      for (const c of p.requires?.capabilities ?? []) if (!caps.has(c)) findings.push(ctx.finding(f, null, `năng lực không có trong bizcity-standard.json: ${c}`, `cap:${p.id}:${c}`));
      if (p.postingPack?.file && !ctx.repo.exists(path.posix.normalize(path.posix.join(dir, p.postingPack.file)))) {
        findings.push(ctx.finding(f, null, `không thấy gói định khoản ${p.postingPack.file}`, `pack:${p.id}`));
      }
      for (const kind of ['branches', 'partners', 'products', 'openings', 'documents', 'assets', 'close']) {
        const rel = p.sample?.[kind];
        if (!rel) continue;
        const file = path.posix.normalize(path.posix.join(dir, rel));
        if (!ctx.repo.exists(file)) { findings.push(ctx.finding(f, null, `không thấy tệp mẫu ${rel}`, `file:${p.id}:${kind}`)); continue; }
        const rows = ctx.repo.json(file);
        if (!Array.isArray(rows)) { findings.push(ctx.finding(file, null, 'tệp mẫu phải là mảng JSON', `array:${p.id}:${kind}`)); continue; }
        if (kind !== 'openings' && kind !== 'assets') {
          const keys = [...new Set(accountKeys(rows))];
          if (keys.length) findings.push(ctx.finding(file, null, `số tài khoản (${keys.join(', ')}) chỉ được ở khối openings / assets (STD-PRE-7)`, `account:${p.id}:${kind}`));
        }
        if (kind === 'openings') rows.forEach((o, i) => { if (!o.docNo) findings.push(ctx.finding(file, null, `số dư ${i + 1}: thiếu docNo (khoá chạy lại)`, `opening:${p.id}:${i}`)); });
        if (kind === 'close') rows.forEach((c, i) => { if (!CLOSE_ACTIONS.includes(c.action)) findings.push(ctx.finding(file, null, `cuối kỳ ${i + 1}: action ${c.action} — chỉ được ${CLOSE_ACTIONS.join(', ')}`, `close:${p.id}:${i}`)); });
        if (kind !== 'documents') continue;
        rows.forEach((d, i) => {
          if (!String(d.docKey ?? '').startsWith(`preset:${p.id}:`)) findings.push(ctx.finding(file, null, `chứng từ ${i + 1}: docKey phải bắt đầu bằng preset:${p.id}:`, `dockey:${p.id}:${i}`));
          // ngày tương đối được thay lúc cài: kiểm khuôn với một ngày cố định.
          const filled = fixDates(d);
          for (const e of ctx.validate(INTAKE, filled).slice(0, 3)) findings.push(ctx.finding(file, null, `chứng từ ${i + 1} ${e.path}: ${e.message}`, `intake:${p.id}:${i}:${e.path}`));
        });
      }
    }
    return { examined: files.length, findings, metrics: { presets: files.length } };
  },
};
