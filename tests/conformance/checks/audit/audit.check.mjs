// [2026-11-04 09:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 8b: SC-AUDIT-1 (ACTION §4.4) — chỗ đọc audit_logs theo tên phải có trong AUDIT_KEEP
/**
 * Nhật ký nghiệp vụ trong action (BIZCITY-ACTION §4.4): `writeAudit` chạy trong action không chèn dòng audit_logs mà ghi vào ghi chú
 * của bằng chứng, trừ tên khai ở `AUDIT_KEEP`. Chỗ nào trong mã đọc `audit_logs` theo tên cũ mà tên đó không trong sổ sẽ không bao giờ
 * thấy dòng — kiểm tĩnh để không ai thêm chỗ đọc mà âm thầm mất dữ liệu. Đọc theo id action (ba phần `module.thực-thể.động-từ`) là
 * đọc bằng chứng của runtime nên được miễn.
 */
import { LAYER_ROOTS } from '../../lib/layers.mjs';

const AUDIT_TS = 'packages/platform/src/core/audit.ts';
const ACTION_ID = /^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$/;
/** Đọc AUDIT_KEEP từ mã nguồn: mỗi mục `{ action: '…', objectType?: '…' }` trong khối khai báo. */
function readKeep(text) {
  const block = text.match(/export const AUDIT_KEEP[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1] ?? '';
  return [...block.matchAll(/\{\s*action:\s*'([^']+)'/g)].map((m) => m[1]);
}
const kept = (name, keep) => keep.some((k) => (k.startsWith('*') ? name.endsWith(k.slice(1)) : name === k || (name.endsWith('%') && k.startsWith(name.slice(0, -1)))));

export const checks = [
  {
    id: 'SC-AUDIT-1',
    title: 'Chỗ đọc audit_logs theo tên hành động (= / IN / LIKE) phải khớp một mục của AUDIT_KEEP (id action ba phần được miễn)',
    gate: 'CONF-STATIC', contract: 'bizcity_evidence', rules: ['STD-EVD-3'], conf: [], tier: 1, enforce: 'block', weight: 3, targets: ['repo'],
    run(ctx) {
      const keep = readKeep(ctx.repo.read(AUDIT_TS) ?? '');
      const findings = []; let examined = 0;
      for (const f of ctx.repo.files({ under: LAYER_ROOTS, ext: ['.ts'] })) {
        if (f === AUDIT_TS) continue;
        const lines = (ctx.repo.read(f) ?? '').split('\n');
        lines.forEach((line, i) => {
          if (!/(selectFrom\(\s*'audit_logs'|\bFROM\s+audit_logs|\bJOIN\s+audit_logs)/i.test(line)) return;
          examined++;
          // Câu truy vấn: tối đa 8 dòng kể từ chỗ đọc, dừng ở dòng chứa execute / .execute(
          let stmt = '';
          for (let j = i; j < Math.min(lines.length, i + 8); j++) { stmt += `${lines[j]}\n`; if (/\.execute\w*\(/.test(lines[j])) break; }
          const names = [];
          for (const m of stmt.matchAll(/where\(\s*'action'\s*,\s*'(?:=|like)'\s*,\s*'([^']+)'/gi)) names.push(m[1]);
          for (const m of stmt.matchAll(/\baction\s*(?:=|LIKE)\s*'([^']+)'/gi)) names.push(m[1]);
          for (const m of stmt.matchAll(/\baction\s+IN\s*\(([^)]*)\)/gi)) for (const n of m[1].matchAll(/'([^']+)'/g)) names.push(n[1]);
          for (const name of names) {
            if (ACTION_ID.test(name) || kept(name, keep)) continue;
            findings.push(ctx.finding(f, i + 1, `đọc audit_logs theo tên '${name}' nhưng tên đó không có trong AUDIT_KEEP — trong action dòng này nằm ở notes.audit[], không có dòng để đọc (thêm mục vào AUDIT_KEEP và bảng ACTION §4.4, hoặc đọc bằng chứng)`, `audit:${name}`));
          }
        });
      }
      return { examined, findings, ...(keep.length ? {} : { notes: [`không đọc được AUDIT_KEEP ở ${AUDIT_TS}`] }) };
    },
  },
];
