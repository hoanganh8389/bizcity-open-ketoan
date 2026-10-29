/**
 * bizcity_posting_template@1 — gói định khoản (STD-TPL-1..4, 9). Quét mọi `*.posting-pack.json` của gốc đang kiểm;
 * kiểm một gói đơn lẻ: --module <thư mục chứa posting-pack.json>.
 */
const SCHEMA = 'docs/contracts/BIZCITY-POSTING-TEMPLATE-v1.schema.json';
const INTAKE = 'docs/contracts/BIZCITY-LEDGER-INTAKE-v1.schema.json';
/** Hệ thống tài khoản theo chế độ. Chế độ chưa có tệp → bỏ kiểm tài khoản, ghi chú. */
const CHARTS = { 'vn-tt99-2025': 'db/seeds/tai-khoan.csv' };

export default {
  id: 'SC-TPL-1',
  title: 'Gói định khoản: đúng schema, tài khoản có thật, một lý do mặc định mỗi loại, tình huống mẫu dùng lý do của gói',
  gate: 'CONF-MAN', contract: 'bizcity_posting_template', rules: [], conf: [], tier: 1, enforce: 'block', weight: 4,
  targets: ['repo', 'module'],
  run(ctx) {
    const files = ctx.repo.files({ match: /(^|\/)([a-z0-9.-]+\.)?posting-pack\.json$/ });
    const intake = ctx.schema(INTAKE);
    const kernelDocTypes = new Set(Object.values(intake.$defs).map((d) => d?.properties?.docType?.const).filter(Boolean));
    const caps = new Set(ctx.standard().capabilities.map((c) => c.id));
    const findings = []; const notes = [];

    for (const file of files) {
      const add = (msg, key) => findings.push(ctx.finding(file, null, msg, key));
      let pack;
      try { pack = ctx.repo.json(file); } catch (e) { add(`JSON sai: ${e.message}`, 'parse'); continue; }
      const errs = ctx.validate(SCHEMA, pack);
      for (const e of errs) add(`schema ${e.path}: ${e.message}`, `schema:${e.path}:${e.keyword}`);
      if (errs.length) continue;

      // STD-TPL-2: tài khoản
      const chartFile = CHARTS[pack.regime];
      const chart = chartFile ? new Set((ctx.core.read(chartFile) ?? '').split(/\r?\n/).slice(1).map((l) => l.split(',')[0]).filter(Boolean)) : null;
      if (!chart) notes.push(`${file}: chưa có hệ thống tài khoản cho chế độ ${pack.regime} — bỏ kiểm tài khoản`);
      const own = new Set((pack.accounts ?? []).map((a) => a.code));
      const hasBase = (pack.extends ?? []).length > 0;
      if (chart) {
        for (const a of pack.accounts ?? []) {
          if (chart.has(a.code)) add(`tài khoản ${a.code} đã có trong hệ thống — không khai lại`, `acc-dup:${a.code}`);
          if (!chart.has(a.parent) && !own.has(a.parent)) add(`tài khoản ${a.code}: cha ${a.parent} không có`, `acc-parent:${a.code}`);
        }
        const known = (code) => chart.has(code) || own.has(code);
        const refs = [
          ...Object.entries(pack.postingDefaults ?? {}).map(([k, v]) => [v, `postingDefaults.${k}`]),
          ...pack.reasons.flatMap((r) => ['counterAccount', 'revenueAccount', 'expenseAccount'].filter((k) => r[k]).map((k) => [r[k], `lý do ${r.code}.${k}`])),
          ...(pack.postingGroups ?? []).flatMap((g) => ['inventoryAccount', 'cogsAccount', 'revenueAccount', 'discountAccount', 'salesReturnAccount'].filter((k) => g[k]).map((k) => [g[k], `nhóm ${g.code}.${k}`])),
          ...(pack.paymentMethods ?? []).map((m) => [m.account, `hình thức ${m.code}`]),
          ...(pack.taxCodes ?? []).map((t) => [t.account, `thuế ${t.code}`]),
          ...(pack.scenarios ?? []).flatMap((s) => s.expect.flatMap((l) => [[l.debit, `tình huống ${s.id}`], [l.credit, `tình huống ${s.id}`]])),
        ];
        for (const [code, where] of refs) if (!known(code)) add(`${where}: tài khoản ${code} không có trong hệ thống ${pack.regime} hay accounts của gói`, `acc:${code}`);
      }

      // Mã không trùng trong từng danh sách
      for (const [list, name] of [[pack.reasons, 'lý do'], [pack.postingGroups, 'nhóm hạch toán'], [pack.paymentMethods, 'hình thức TT'], [pack.taxCodes, 'loại thuế'], [pack.scenarios, 'tình huống']]) {
        const seen = new Set();
        for (const x of list ?? []) { const c = x.code ?? x.id; if (seen.has(c)) add(`${name} ${c} khai hai lần`, `dup:${c}`); seen.add(c); }
      }
      // STD-TPL-3: một lý do mặc định cho mỗi khoá
      const defaults = new Map();
      for (const r of pack.reasons) if (r.flags?.default) defaults.set(r.flags.default, [...(defaults.get(r.flags.default) ?? []), r.code]);
      for (const [k, codes] of defaults) if (codes.length > 1) add(`nhiều lý do mặc định cho "${k}": ${codes.join(', ')}`, `default:${k}`);
      const groupsDefault = (pack.postingGroups ?? []).filter((g) => g.isDefault);
      if (groupsDefault.length > 1) add('nhiều nhóm hạch toán mặc định', 'group-default');

      // STD-TPL-4: tình huống mẫu
      const reasons = new Set(pack.reasons.map((r) => r.code));
      const docTypes = new Set([...(pack.requires?.docTypes ?? []), 'voucher']);
      for (const s of pack.scenarios ?? []) {
        const rc = s.document.reasonCode;
        if (rc && !reasons.has(rc) && !hasBase) add(`tình huống ${s.id}: lý do ${rc} không có trong gói`, `scn-reason:${s.id}`);
        if (!docTypes.has(s.document.docType)) add(`tình huống ${s.id}: docType ${s.document.docType} chưa khai trong requires.docTypes`, `scn-doctype:${s.id}`);
        for (const l of s.expect) if (l.debit === l.credit) add(`tình huống ${s.id}: Nợ và Có cùng tài khoản ${l.debit}`, `scn-same:${s.id}:${l.debit}`);
      }
      // STD-TPL-9: yêu cầu Core
      for (const d of pack.requires?.docTypes ?? []) if (!kernelDocTypes.has(d)) add(`docType ${d} chưa có trong Kernel — gói không cài được (CAPABILITY_MISSING)`, `req-doctype:${d}`);
      for (const c of pack.requires?.capabilities ?? []) if (!caps.has(c)) add(`năng lực ${c} không có trong bizcity-standard.json`, `req-cap:${c}`);
    }
    return { examined: files.length, unitBy: 'key', findings, notes: [...notes, `${files.length} gói được kiểm`] };
  },
};
