// [2026-10-30 01:11 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — tuyên bố tối thượng, 7 nguyên tắc AP, ba lớp kiểm soát, ma trận tuân thủ, kiểm nâng cấp migration.
/**
 * docs/standard/compliance-matrix.json (bizcity_compliance_matrix@1) đúng khuôn và khớp bizcity_compliance@1 §2 — để ma trận tuân thủ
 * trên bảng điểm đáng tin (AP-7: tuân thủ được kiểm, không chỉ viết): mã C-n liên tục, mỗi dòng trỏ một STD-CMP-n khai trong
 * tài liệu, tín hiệu đúng một loại và trỏ check / năng lực có thật, việc tay đánh dấu xong phải có người + ngày.
 */
import { discover } from '../../lib/discover.mjs';
import { COMPLIANCE_FILE } from '../../lib/compliance.mjs';

const DOC = 'docs/contracts/BIZCITY-COMPLIANCE-v1.md';
const SIGNAL_KINDS = ['check', 'noFinding', 'readiness', 'capability', 'file', 'noFile', 'glob', 'fileContains', 'coverage', 'standardStable', 'manual'];

const matrixCheck = {
  id: 'SC-CMP-1',
  title: 'Ma trận tuân thủ máy đọc: đúng khuôn, khớp STD-CMP của bizcity_compliance@1, tín hiệu trỏ check / năng lực có thật',
  gate: 'DOCS', contract: 'docs', rules: [], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  async run(ctx) {
    const m = ctx.repo.read(COMPLIANCE_FILE) ? ctx.repo.json(COMPLIANCE_FILE) : null;
    if (!m) return { examined: 0, findings: [], notes: [`không có ${COMPLIANCE_FILE}`] };
    const findings = [];
    const add = (msg, key) => findings.push(ctx.finding(COMPLIANCE_FILE, null, msg, key));
    if (m.contract !== 'bizcity_compliance_matrix@1') add('contract phải là bizcity_compliance_matrix@1', 'contract');
    if (!Array.isArray(m.rows) || !m.rows.length) { add('rows rỗng', 'rows'); return { examined: 1, findings }; }
    const doc = ctx.repo.read(DOC) ?? '';
    const declared = new Set([...doc.matchAll(/^\| \*\*(STD-CMP-\d+)\*\*/gm)].map((x) => x[1]));
    const checkIds = new Set((await discover()).map((c) => c.id));
    const caps = new Set(ctx.standard().capabilities.map((c) => c.id));
    m.rows.forEach((r, i) => {
      if (r.id !== `C-${i + 1}`) add(`dòng ${i + 1}: mã phải là C-${i + 1} (đang ${r.id})`, `id:${i + 1}`);
      for (const f of ['std', 'requirement', 'risk', 'rule']) if (!r[f]) add(`${r.id}: thiếu ${f}`, `field:${r.id}:${f}`);
      if (r.std && doc && !declared.has(r.std)) add(`${r.id}: ${r.std} chưa khai trong ${DOC} §2`, `std:${r.id}`);
      if (!Array.isArray(r.done) || !r.done.length) add(`${r.id}: chưa có tín hiệu đo được (AP-7)`, `signals:${r.id}`);
      for (const s of r.done ?? []) {
        const kinds = SIGNAL_KINDS.filter((k) => k in s);
        if (kinds.length !== 1) add(`${r.id}: mỗi tín hiệu đúng một loại (đang có ${kinds.join(', ') || 'không loại nào'})`, `kind:${r.id}`);
        const ref = s.check ?? s.noFinding?.check ?? s.readiness?.check;
        if (ref && !checkIds.has(ref)) add(`${r.id}: check ${ref} không tồn tại`, `check:${r.id}:${ref}`);
        if (s.capability && !caps.has(s.capability)) add(`${r.id}: năng lực ${s.capability} không có trong bizcity-standard.json`, `cap:${r.id}:${s.capability}`);
        if (s.manual && s.doneAt && !s.by) add(`${r.id}: việc tay đánh dấu xong phải ghi "by"`, `by:${r.id}`);
      }
    });
    for (const d of declared) if (!m.rows.some((r) => r.std === d)) add(`${d} khai trong tài liệu nhưng không có dòng ma trận`, `doc-only:${d}`);
    return { examined: m.rows.length, unitBy: 'key', findings };
  },
};

/**
 * AP-7 áp cho chính 7 nguyên tắc (bizcity-standard.json#principles, CONG-BO-KIEN-TRUC §1): nguyên tắc nào cũng phải trỏ tới check có
 * thật. Nguyên tắc chưa có cách thực thi là nợ — ratchet: nợ đã biết nằm ở baseline kèm việc sẽ gỡ; nguyên tắc rỗng mới là đỏ.
 */
const principlesCheck = {
  id: 'SC-CMP-2',
  title: 'Bảy nguyên tắc kiến trúc AP-1..AP-7 đều có cách thực thi (check có thật) — AP-7',
  gate: 'DOCS', contract: 'docs', rules: [], conf: [], tier: 1, enforce: 'ratchet', weight: 2, targets: ['repo'],
  async run(ctx) {
    const file = 'docs/standard/bizcity-standard.json';
    const list = ctx.standard().principles ?? [];
    if (!list.length) return { examined: 0, findings: [ctx.finding(file, null, 'chưa khai principles', 'missing')] };
    const checkIds = new Set((await discover()).map((c) => c.id));
    const findings = [];
    list.forEach((p, i) => {
      if (p.id !== `AP-${i + 1}`) findings.push(ctx.finding(file, null, `nguyên tắc thứ ${i + 1} phải có id AP-${i + 1}`, `id:${i + 1}`));
      if (!p.enforcedBy?.length) findings.push(ctx.finding(file, null, `${p.id} "${p.name}" chưa có cách thực thi (check) — nợ theo AP-7`, `unenforced:${p.id}`));
      for (const c of p.enforcedBy ?? []) if (!checkIds.has(c)) findings.push(ctx.finding(file, null, `${p.id}: check ${c} không tồn tại`, `check:${p.id}:${c}`));
    });
    return { examined: list.length, unitBy: 'key', findings };
  },
};

export const checks = [matrixCheck, principlesCheck];
