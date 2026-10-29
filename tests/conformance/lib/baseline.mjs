/**
 * Baseline = danh sách nợ đã biết (thay các biến DEBT_* của scripts/kiem-chuan.sh). Cơ chế "bánh cóc":
 *  - phát hiện có trong baseline  → `known` (nợ, không làm đỏ)
 *  - phát hiện mới                → `new`  (đỏ, trừ check enforce=info)
 *  - mục baseline không còn thấy  → `fixed` (nhắc chạy --update-baseline để bánh cóc chặt lại)
 * Dấu vân tay không chứa số dòng, nên thêm / bớt dòng phía trên không làm đổi.
 */
export function fingerprint(checkId, f) {
  const what = f.key ?? String(f.message).replace(/\s+/g, ' ').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '').trim();
  return `${checkId}|${f.file ?? '-'}|${what}`;
}

export function applyBaseline(checkId, findings, baseline) {
  const allowed = new Map((baseline?.checks?.[checkId]?.debts ?? []).map((d) => [d.fp, d]));
  const seen = new Set();
  for (const f of findings) {
    f.fp = fingerprint(checkId, f);
    f.known = allowed.has(f.fp);
    seen.add(f.fp);
  }
  const fixed = [...allowed.keys()].filter((fp) => !seen.has(fp));
  return { fixed };
}

/** Dựng baseline mới từ kết quả: giữ ghi chú (`why`, `ref`) của mục cũ. */
export function buildBaseline(results, previous) {
  const checks = {};
  for (const r of results) {
    if (r.lane !== 'selfcheck' || r.enforce === 'info' || r.enforce === 'planned' || !r.findings?.length) continue;
    const old = new Map((previous?.checks?.[r.id]?.debts ?? []).map((d) => [d.fp, d]));
    checks[r.id] = {
      title: r.title,
      ...(previous?.checks?.[r.id]?.ref ? { ref: previous.checks[r.id].ref } : {}),
      debts: r.findings.map((f) => ({ fp: f.fp, file: f.file, message: f.message, ...(old.get(f.fp)?.why ? { why: old.get(f.fp).why } : {}), ...(old.get(f.fp)?.ref ? { ref: old.get(f.fp).ref } : {}) })),
    };
  }
  return {
    contract: 'bizcity_check_baseline@1',
    note: 'Nợ đã biết. Chỉ được BỚT khi đã sửa (chạy --update-baseline). Thêm nợ mới cần người duyệt nhóm Lõi (CODEOWNERS) và trường "why"/"ref" (ADR, mã audit).',
    updatedAt: new Date().toISOString().slice(0, 10),
    checks,
  };
}
