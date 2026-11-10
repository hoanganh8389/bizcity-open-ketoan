// [2026-11-10 11:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B4 (S034-7): SC-ENG-1 — sổ bộ máy (bo-may.json, bizcity_engines@1) khớp repo, không có trạng thái gõ tay (D034-5, R-CONT-7)
/**
 * SC-ENG-1 — docs/standard/bo-may.json khớp repo:
 *   1. id dạng E01.., id / key không trùng; KHÔNG có trường trạng thái gõ tay (status, pct, done, level) — mức đo từ mốc (D034-5).
 *   2. `code[]`, `tests[]` là đường dẫn có thật.
 *   3. `contracts[]`: tên có ở docs/00-CANON.md hoặc có tệp docs/contracts/BIZCITY-<TÊN>-v<N>.md.
 *   4. `core` là id ở nen-mong.json (C1..C6); `pillars[]` là id ở tru-cot.json.
 *   5. `milestones[]` là mã việc có trong docs/phases/bang-viec.json (sinh từ checklist trên main).
 *   6. `emits[]` (mã kiểm bộ máy phát, "X-*" = tiền tố) có trong mã nguồn (packages/<gói>/src, apps/api/src) dưới dạng chuỗi;
 *      mã chưa có thì ghi ở `plannedEmits[]` (không kiểm), để thẻ Bộ máy không hứa mã không có.
 */
const FILE = 'docs/standard/bo-may.json';
const MANUAL = ['status', 'pct', 'done', 'level', 'progress'];
const SRC = ['packages', 'apps/api/src'];

export const checks = [
  {
    id: 'SC-ENG-1',
    title: 'Sổ bộ máy (bo-may.json) khớp repo: mã, test, hợp đồng, năng lực lõi, trụ cột, mốc việc, mã kiểm có thật; không có trạng thái gõ tay',
    gate: 'DOCS', contract: 'quality', rules: ['R-CONT-7'], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
    run(ctx) {
      const findings = [];
      const b = ctx.repo.json(FILE);
      if (!b) return { examined: 0, unitBy: 'key', findings };
      const f = (msg, key) => findings.push(ctx.finding(FILE, null, msg, key));
      if (b.contract !== 'bizcity_engines@1') f(`contract phải là bizcity_engines@1 (đang "${b.contract}")`, 'contract');
      const canon = ctx.repo.read('docs/00-CANON.md') ?? '';
      const cores = new Set((ctx.repo.json('docs/standard/nen-mong.json')?.cores ?? []).map((c) => c.id));
      const pillars = new Set((ctx.repo.json('docs/standard/tru-cot.json')?.pillars ?? []).map((p) => p.id));
      const tasks = new Set((ctx.repo.json('docs/phases/bang-viec.json')?.items ?? []).map((x) => x.id));
      let srcText = null;
      const inSource = (code) => {
        srcText ??= ctx.repo.files({ under: SRC, ext: ['.ts', '.mts', '.mjs', '.js'], not: /(^|\/)(test|tests|dist|node_modules)\/|\.d\.ts$/ })
          .map((x) => ctx.repo.read(x) ?? '').join('\n');
        const stem = code.endsWith('*') ? code.slice(0, -1) : code;
        return code.endsWith('*') ? srcText.includes(`'${stem}`) || srcText.includes(`"${stem}`)
          : srcText.includes(`'${stem}'`) || srcText.includes(`"${stem}"`) || srcText.includes(`code: '${stem}'`);
      };
      const ids = new Set(); const keys = new Set();
      for (const e of b.engines ?? []) {
        const at = `${e.id ?? '?'}`;
        if (!/^E\d{2}$/.test(e.id ?? '')) f(`${at}: id phải dạng E01`, `id:${at}`);
        if (ids.has(e.id)) f(`${at}: id trùng`, `dup:${at}`); ids.add(e.id);
        if (keys.has(e.key)) f(`${at}: key "${e.key}" trùng`, `dup-key:${e.key}`); keys.add(e.key);
        for (const k of MANUAL) if (k in e) f(`${at}: không được có trường "${k}" — mức của bộ máy đo từ mốc việc, không gõ tay (D034-5)`, `manual:${at}:${k}`);
        for (const p of [...(e.code ?? []), ...(e.tests ?? [])]) if (!ctx.repo.exists(p)) f(`${at}: đường dẫn không có: ${p}`, `path:${at}:${p}`);
        for (const c of e.contracts ?? []) {
          const m = /^bizcity_([a-z_]+)@(\d+)$/.exec(c);
          const doc = m && `docs/contracts/BIZCITY-${m[1].toUpperCase().replace(/_/g, '-')}-v${m[2]}.md`;
          if (!m || (!canon.includes(c) && !ctx.repo.exists(doc))) f(`${at}: hợp đồng ${c} không có ở CANON hay docs/contracts`, `contract:${at}:${c}`);
        }
        if (!cores.has(e.core)) f(`${at}: core "${e.core}" không có ở nen-mong.json`, `core:${at}:${e.core}`);
        for (const p of e.pillars ?? []) if (!pillars.has(p)) f(`${at}: trụ cột "${p}" không có ở tru-cot.json`, `pillar:${at}:${p}`);
        for (const t of e.milestones ?? []) if (!tasks.has(t)) f(`${at}: mốc ${t} không có trong bang-viec.json (sửa checklist của phase rồi node scripts/bang-viec.mjs --write)`, `task:${at}:${t}`);
        for (const c of e.emits ?? []) if (!inSource(c)) f(`${at}: mã kiểm ${c} không có trong mã nguồn — chưa có thì chuyển sang plannedEmits`, `emit:${at}:${c}`);
      }
      return { examined: (b.engines ?? []).length, unitBy: 'key', findings };
    },
  },
];
