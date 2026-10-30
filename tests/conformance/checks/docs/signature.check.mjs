// [2026-10-30 09:40 PM Johnny Chu - Chu Hoàng Anh] R-SIG — SC-SIG-1 chữ ký kiến trúc trên mọi tệp framework, SC-SIG-2 dấu đúng khuôn, không tên agent.
/**
 * Chữ ký kiến trúc và dấu thay đổi (docs/rules/RULE-SIGNATURE.md, R-SIG; cùng quy ước R-STAMP của bizcity-twin-ai):
 *   SC-SIG-1  mọi tệp framework (lib/framework-files.mjs) có ít nhất một dấu của Johnny Chu - Chu Hoàng Anh (R-SIG-1);
 *   SC-SIG-2  dấu đúng khuôn [YYYY-MM-DD HH:MM AM/PM <người>] <MÃ> — <mô tả>; không ghi tên agent / model vào chỗ người (R-SIG-4, -5).
 * Migration đã phát hành không bị đòi dấu (R-SIG-6: không sửa một byte).
 */
import { AGENT_RE, OWNER, STAMP_RE, isFrameworkFile, stampsIn } from '../../lib/framework-files.mjs';

const LOCK = 'tests/conformance/locks/migrations.lock.json';
const lockedOf = (ctx) => new Set(Object.keys(ctx.repo.json(LOCK)?.files ?? {}));

const ownerCheck = {
  id: 'SC-SIG-1',
  title: 'Mọi tệp framework (Kernel, Platform, hợp đồng, hạ tầng, kiến trúc, luật, phase) có chữ ký Johnny Chu - Chu Hoàng Anh (R-SIG-1)',
  gate: 'DOCS', contract: 'docs', rules: ['R-SIG-1', 'R-SIG-2'], conf: [], tier: 0, enforce: 'block', weight: 3, targets: ['repo'],
  run(ctx) {
    const locked = lockedOf(ctx);
    const files = ctx.repo.files().filter((f) => isFrameworkFile(f, locked));
    const findings = [];
    for (const file of files) {
      const stamps = stampsIn(ctx.repo.read(file) ?? '');
      if (!stamps.some((s) => s.author === OWNER)) {
        findings.push(ctx.finding(file, 1, `tệp framework chưa có dấu [YYYY-MM-DD HH:MM AM/PM ${OWNER}] <MÃ> — <mô tả> (RULE-SIGNATURE §1)`, file));
      }
    }
    return { examined: files.length, unitBy: 'key', findings };
  },
};

const formatCheck = {
  id: 'SC-SIG-2',
  title: 'Dấu thay đổi đúng khuôn, người là người chỉ đạo — không phải agent / model (R-SIG-4, R-SIG-5)',
  gate: 'DOCS', contract: 'docs', rules: ['R-SIG-4', 'R-SIG-5'], conf: [], tier: 0, enforce: 'block', weight: 2, targets: ['repo'],
  run(ctx) {
    const locked = lockedOf(ctx);
    const files = ctx.repo.files().filter((f) => isFrameworkFile(f, locked));
    const findings = [];
    let examined = 0;
    for (const file of files) {
      ctx.repo.lines(file).forEach((t, i) => {
        // Dòng có dáng dấu: "[YYYY-MM-DD" … "]" ngay sau ký hiệu chú thích.
        if (!/^\s*(\/\/|#|--|<!--)\s*\[\d{4}-\d{2}-\d{2}/.test(t)) return;
        examined += 1;
        const m = STAMP_RE.exec(t);
        if (!m) { findings.push(ctx.finding(file, i + 1, `dấu sai khuôn (cần [YYYY-MM-DD HH:MM AM/PM <người>] <MÃ> — <mô tả>): ${t.trim().slice(0, 120)}`, `format:${file}:${i + 1}`)); return; }
        if (AGENT_RE.test(m[3])) findings.push(ctx.finding(file, i + 1, `dấu ghi agent / model "${m[3].trim()}" ở chỗ người — ghi người chỉ đạo thay đổi (R-SIG-4)`, `agent:${file}:${i + 1}`));
      });
    }
    return { examined, unitBy: 'key', findings };
  },
};

export const checks = [ownerCheck, formatCheck];
